import {
  CollaborationError,
  createOperationId,
  isOwnerMember,
  requireGoogleIdentity,
  validateMemberUid,
  validateRoomId,
} from './domain.js';

const STATES = Object.freeze({ REQUESTED: 'requested', DELETING: 'deleting', DELETED: 'deleted' });
const PHASE_NAMESPACE_CLOSED = 'namespace-closed';
const MAX_FIRESTORE_MEMBER_DOCUMENTS = 500;
const STORAGE_DELETE_CONCURRENCY = 20;

const fail = (code, message) => { throw new CollaborationError(code, message); };
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const mapKeys = (value) => Object.keys(isRecord(value) ? value : {});
const snapshotValue = (snapshot) => (snapshot?.exists?.() === false ? null : snapshot?.val?.());
const nowValue = (clock) => {
  const value = Number(clock());
  if (!Number.isFinite(value) || value < 1) throw new TypeError('clock must return a positive timestamp.');
  return value;
};
const aclVersion = (value) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 1;
};
const inviteHashMap = (values) => Object.fromEntries(
  [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .map((value) => [value, true]),
);
const mergeMaps = (left, right) => ({
  ...(isRecord(left) ? left : {}),
  ...(isRecord(right) ? right : {}),
});
const storageRoomId = (name) => {
  const match = /^rooms\/([^/]+)\/.+/u.exec(String(name || ''));
  if (!match) return '';
  try {
    return validateRoomId(match[1]);
  } catch {
    return '';
  }
};
const normalizeMembers = (members) => Object.fromEntries(
  Object.entries(isRecord(members) ? members : {}).map(([rawUid, member]) => {
    const uid = validateMemberUid(rawUid);
    if (member?.uid !== uid) fail('failed-precondition', '旅程成員資料不完整，刪除已停止。');
    return [uid, {
      role: member?.role === 'owner' ? 'owner' : 'editor',
      aclVersion: aclVersion(member?.aclVersion),
    }];
  }),
);
const runInChunks = async (items, size, operation) => {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(operation));
  }
};

export function createTripDeletionService({
  database,
  firestore,
  bucket,
  clock = Date.now,
  operationIdFactory = createOperationId,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  workerLeaseMs = 600_000,
  storagePageSize = 100,
  maxStoragePagesPerRun = 5,
  storageSettleMs = 2_000,
}) {
  if (!database || !firestore || !bucket) {
    throw new TypeError('database, firestore, and bucket are required.');
  }

  const deletionRef = (roomId) => database.ref(`tripDeletions/${roomId}`);
  const accessRef = (roomId) => database.ref(`roomAccess/${roomId}`);
  const leaseRef = (roomId) => database.ref(`tripDeletionWorkers/${roomId}`);
  const guardRef = (roomId) => firestore.doc(`tripAccess/${roomId}`);
  const aclCollection = (roomId) => firestore.collection(`tripAccess/${roomId}/members`);
  const storagePrefix = (roomId) => `rooms/${roomId}/`;

  // Admin RTDB may first call an existing-value transaction with a local null.
  // Returning that null forces the canonical server compare/retry.
  const transactExisting = async (reference, updateValue) => {
    const result = await reference.transaction(
      (current) => (current === null ? current : updateValue(current)),
      undefined,
      false,
    );
    return {
      committed: result.committed && snapshotValue(result.snapshot) !== null,
      value: snapshotValue(result.snapshot),
    };
  };

  const readInviteHashes = async (roomId) => {
    const snapshot = await database.ref('tripInvites').orderByChild('roomId').equalTo(roomId).get();
    return inviteHashMap(Object.keys(snapshotValue(snapshot) || {}));
  };

  const assertNoRepairLease = async (roomId) => {
    if (snapshotValue(await database.ref(`maintenanceRepairs/legacyTicketPath/${roomId}`).get())) {
      fail('failed-precondition', '此旅程正在進行附件維護，請完成維護後再刪除。');
    }
  };

  const validateCanonicalOwner = ({ roomId, profile, room, access, reservation }) => {
    const owner = access?.members?.[profile.uid];
    if (
      access?.state !== 'ready'
      || !isOwnerMember(owner, access?.ownerUid, profile.uid)
      || room?.meta?.ownerUid !== profile.uid
      || reservation?.roomId !== roomId
      || !access?.creationId
      || reservation?.creationId !== access.creationId
      || reservation?.createdByUid !== profile.uid
      || !Number.isFinite(Number(reservation?.createdAt))
    ) fail('permission-denied', '只有旅程擁有者可以永久刪除此旅程。');
  };

  const retryIndex = (journal, updatedAt) => {
    const owner = journal?.members?.[journal.ownerUid];
    if (!owner || owner.role !== 'owner') {
      fail('failed-precondition', '刪除紀錄缺少旅程擁有者，操作已停止。');
    }
    return {
      role: 'owner',
      status: 'deleting',
      aclVersion: aclVersion(owner.aclVersion) + 1,
      updatedAt,
      deletionId: journal.deletionId,
      titleSnapshot: String(journal.titleSnapshot || '未命名旅程').slice(0, 120),
    };
  };
  const writeOwnerRetryIndex = async (roomId, journal, updatedAt) => {
    await database.ref(`userTrips/${journal.ownerUid}/${roomId}`).set(
      retryIndex(journal, updatedAt),
    );
  };
  const writeDeletingIndexes = async (roomId, journal, updatedAt) => {
    const updates = {};
    Object.entries(journal.members).forEach(([uid, member]) => {
      updates[`userTrips/${uid}/${roomId}`] = uid === journal.ownerUid
        ? retryIndex(journal, updatedAt)
        : {
            role: member.role === 'owner' ? 'owner' : 'editor',
            status: 'removed',
            aclVersion: aclVersion(member.aclVersion) + 1,
            updatedAt,
          };
    });
    await database.ref().update(updates);
  };

  const acquireLease = async (roomId, workerId) => {
    const acquiredAt = nowValue(clock);
    const result = await leaseRef(roomId).transaction(
      (current) => {
        if (current && Number(current.expiresAt) > acquiredAt && current.workerId !== workerId) {
          return undefined;
        }
        return {
          workerId,
          acquiredAt,
          heartbeatAt: acquiredAt,
          expiresAt: acquiredAt + workerLeaseMs,
        };
      },
      undefined,
      false,
    );
    const lease = snapshotValue(result.snapshot);
    return { acquired: result.committed && lease?.workerId === workerId, lease };
  };
  const renewLease = async (roomId, workerId) => {
    const heartbeatAt = nowValue(clock);
    const result = await transactExisting(leaseRef(roomId), (current) => {
      if (current?.workerId !== workerId) return undefined;
      return { ...current, heartbeatAt, expiresAt: heartbeatAt + workerLeaseMs };
    });
    if (!result.committed || result.value?.workerId !== workerId) {
      fail('aborted', '旅程刪除工作租約已失效，將由下一次重試接手。');
    }
  };
  const releaseLease = async (roomId, workerId) => {
    await transactExisting(leaseRef(roomId), (current) => (
      current?.workerId === workerId ? null : undefined
    ));
  };

  const lockRoom = async ({ roomId, journal, updatedAt }) => {
    const result = await transactExisting(accessRef(roomId), (current) => {
      const owner = current?.members?.[journal.ownerUid];
      if (
        current?.ownerUid !== journal.ownerUid
        || current?.creationId !== journal.creationId
        || !isOwnerMember(owner, current.ownerUid, journal.ownerUid)
        || !['ready', 'deleting'].includes(current.state)
        || current.deletionId && current.deletionId !== journal.deletionId
      ) return undefined;
      return {
        ...current,
        state: 'deleting',
        deletionId: journal.deletionId,
        deletionRequestedAt: Number(current.deletionRequestedAt) || journal.requestedAt,
        deletionUpdatedAt: updatedAt,
      };
    });
    if (!result.committed) fail('permission-denied', '只有旅程擁有者可以永久刪除此旅程。');
    return result.value;
  };

  const updateDeletingJournal = async ({ roomId, journal, access, updatedAt }) => {
    const inviteHashes = mergeMaps(journal.inviteHashes, inviteHashMap([access?.invite?.tokenHash]));
    const members = mergeMaps(journal.members, normalizeMembers(access.members));
    const result = await transactExisting(deletionRef(roomId), (current) => {
      if (
        current?.deletionId !== journal.deletionId
        || current?.ownerUid !== journal.ownerUid
        || current?.state === STATES.DELETED
      ) return undefined;
      return {
        ...current,
        state: STATES.DELETING,
        phase: current.phase || 'access-locked',
        members,
        inviteHashes,
        updatedAt,
        attempt: (Number(current.attempt) || 0) + 1,
      };
    });
    if (!result.committed) fail('aborted', '旅程刪除狀態已被其他工作更新。');
    return result.value;
  };

  const ensureFirestoreGuard = async ({ roomId, journal, state, updatedAt }) => {
    await firestore.runTransaction(async (transaction) => {
      const target = guardRef(roomId);
      const snapshot = await transaction.get(target);
      const current = snapshot.exists ? snapshot.data() : null;
      if (
        current
        && (
          current.creationId !== journal.creationId
          || current.deletionId !== journal.deletionId
          || current.ownerUid !== journal.ownerUid
          || current.state === STATES.DELETED && state !== STATES.DELETED
        )
      ) fail('failed-precondition', 'Firestore 刪除防護紀錄與旅程不一致。');
      transaction.set(target, {
        roomId,
        creationId: journal.creationId,
        deletionId: journal.deletionId,
        ownerUid: journal.ownerUid,
        state,
        requestedAt: journal.requestedAt,
        updatedAt: new Date(updatedAt),
        ...(state === STATES.DELETED ? { completedAt: new Date(updatedAt) } : {}),
      });
    });
  };

  const deleteFirestoreMembers = async (roomId) => {
    const snapshot = await aclCollection(roomId).get();
    if (snapshot.docs.length > MAX_FIRESTORE_MEMBER_DOCUMENTS) {
      fail('failed-precondition', '旅程 ACL 數量異常，刪除已停止。');
    }
    if (snapshot.docs.length > 0) {
      const batch = firestore.batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
    if ((await aclCollection(roomId).get()).docs.length > 0) {
      fail('aborted', '旅程附件權限尚未完全撤銷，請重試刪除。');
    }
  };

  const listStoragePage = async (roomId) => {
    const prefix = storagePrefix(roomId);
    const [files] = await bucket.getFiles({
      prefix,
      autoPaginate: false,
      maxResults: storagePageSize,
    });
    for (const file of files) {
      if (!String(file?.name || '').startsWith(prefix)) {
        fail('failed-precondition', 'Storage 回傳了旅程範圍外的物件，刪除已停止。');
      }
      if (!String(file?.metadata?.generation || '')) {
        fail('failed-precondition', 'Storage 物件缺少 generation，刪除已停止。');
      }
    }
    return files;
  };
  const deleteStoragePage = async (files) => {
    await runInChunks(files, STORAGE_DELETE_CONCURRENCY, async (file) => {
      await file.delete({
        ignoreNotFound: true,
        ifGenerationMatch: String(file.metadata.generation),
      });
    });
  };
  const sweepStorage = async ({ roomId, journal, workerId }) => {
    let progress = isRecord(journal.storageProgress) ? { ...journal.storageProgress } : {};
    for (let page = 0; page < maxStoragePagesPerRun; page += 1) {
      await renewLease(roomId, workerId);
      const files = await listStoragePage(roomId);
      if (files.length > 0) {
        await deleteStoragePage(files);
        progress = {
          deletedCount: (Number(progress.deletedCount) || 0) + files.length,
          emptyPasses: 0,
          updatedAt: nowValue(clock),
        };
        continue;
      }
      const emptyPasses = Number(progress.emptyPasses) || 0;
      if (emptyPasses < 1) {
        return {
          settled: false,
          progress: {
            ...progress,
            emptyPasses: 1,
            firstEmptyAt: nowValue(clock),
            updatedAt: nowValue(clock),
          },
        };
      }
      const waitMs = Math.max(
        0,
        storageSettleMs - (nowValue(clock) - (Number(progress.firstEmptyAt) || 0)),
      );
      if (waitMs > 0) await sleep(waitMs);
      await renewLease(roomId, workerId);
      const verification = await listStoragePage(roomId);
      if (verification.length > 0) {
        await deleteStoragePage(verification);
        progress = {
          deletedCount: (Number(progress.deletedCount) || 0) + verification.length,
          emptyPasses: 0,
          updatedAt: nowValue(clock),
        };
        continue;
      }
      return {
        settled: true,
        progress: {
          ...progress,
          emptyPasses: 2,
          settledAt: nowValue(clock),
          updatedAt: nowValue(clock),
        },
      };
    }
    return { settled: false, progress };
  };

  const claimQuotaRelease = async ({ roomId, journal, claimedAt }) => {
    const quotaRef = database.ref(`userQuotas/${journal.ownerUid}/createTrip`);
    const result = await quotaRef.transaction(
      (current) => {
        const value = isRecord(current) ? current : {};
        const pendingReleases = isRecord(value.pendingReleases) ? value.pendingReleases : {};
        const existing = pendingReleases[journal.deletionId];
        if (existing) {
          if (existing.roomId !== roomId || existing.creationId !== journal.creationId) {
            return undefined;
          }
          return value;
        }
        return {
          ...value,
          totalCount: Math.max(0, (Number(value.totalCount) || 0) - 1),
          pendingReleases: {
            ...pendingReleases,
            [journal.deletionId]: {
              roomId,
              creationId: journal.creationId,
              claimedAt,
            },
          },
          updatedAt: claimedAt,
        };
      },
      undefined,
      false,
    );
    if (!result.committed) fail('aborted', '旅程建立配額尚未釋放，請重試刪除。');
  };

  const transitionNamespaceClosed = async ({ roomId, journal, workerId, closedAt }) => {
    await renewLease(roomId, workerId);
    const allInviteHashes = mergeMaps(journal.inviteHashes, await readInviteHashes(roomId));
    const nextJournal = {
      ...journal,
      state: STATES.DELETING,
      phase: PHASE_NAMESPACE_CLOSED,
      inviteHashes: allInviteHashes,
      quotaReleasedAt: closedAt,
      namespaceClosedAt: closedAt,
      updatedAt: closedAt,
    };
    const updates = {
      [`rooms/${roomId}`]: null,
      [`roomAccess/${roomId}`]: null,
      [`tripDeletions/${roomId}`]: nextJournal,
      [`roomReservations/${roomId}`]: {
        roomId,
        creationId: journal.creationId,
        createdByUid: journal.reservationCreatedByUid,
        createdAt: journal.reservationCreatedAt,
        deletionId: journal.deletionId,
        deletedAt: closedAt,
        state: STATES.DELETED,
      },
      [`userQuotas/${journal.ownerUid}/createTrip/pendingReleases/${journal.deletionId}`]: null,
    };
    mapKeys(journal.members).forEach((uid) => {
      if (uid !== journal.ownerUid) updates[`userTrips/${uid}/${roomId}`] = null;
    });
    mapKeys(allInviteHashes).forEach((tokenHash) => {
      updates[`tripInvites/${tokenHash}`] = null;
    });
    await database.ref().update(updates);
    return nextJournal;
  };

  const checkpointStorage = async ({ roomId, progress, workerId }) => {
    await renewLease(roomId, workerId);
    await database.ref().update({
      [`tripDeletions/${roomId}/storageProgress`]: progress,
      [`tripDeletions/${roomId}/updatedAt`]: nowValue(clock),
      [`tripDeletionWorkers/${roomId}`]: null,
    });
  };
  const completedTombstone = (roomId, journal, completedAt) => ({
    roomId,
    creationId: journal.creationId,
    deletionId: journal.deletionId,
    ownerUid: journal.ownerUid,
    state: STATES.DELETED,
    requestedAt: journal.requestedAt,
    completedAt,
    updatedAt: completedAt,
  });
  const completeDeletion = async ({ roomId, journal, workerId, completedAt }) => {
    await renewLease(roomId, workerId);
    await ensureFirestoreGuard({ roomId, journal, state: STATES.DELETED, updatedAt: completedAt });
    await database.ref().update({
      [`tripDeletions/${roomId}`]: completedTombstone(roomId, journal, completedAt),
      [`userTrips/${journal.ownerUid}/${roomId}`]: null,
      [`tripDeletionWorkers/${roomId}`]: null,
    });
  };
  const convergeDeleted = async (roomId, journal) => {
    const updatedAt = nowValue(clock);
    await ensureFirestoreGuard({ roomId, journal, state: STATES.DELETED, updatedAt });
    const canonical = completedTombstone(
      roomId,
      journal,
      Number(journal.completedAt) || updatedAt,
    );
    const journalIsCanonical = (
      Object.keys(journal).length === Object.keys(canonical).length
      && Object.entries(canonical).every(([key, value]) => journal[key] === value)
    );
    await database.ref().update({
      ...(!journalIsCanonical ? { [`tripDeletions/${roomId}`]: canonical } : {}),
      [`userTrips/${journal.ownerUid}/${roomId}`]: null,
      [`tripDeletionWorkers/${roomId}`]: null,
    });
  };

  const cleanupFinalizedDeletedTripObject = async (object) => {
    const roomId = storageRoomId(object?.name);
    if (!roomId) return { ignored: true };
    const generation = String(object?.generation || '').trim();
    if (!generation) {
      fail('failed-precondition', 'Storage finalize event is missing its generation.');
    }

    const [guardSnapshot, reservationSnapshot] = await Promise.all([
      guardRef(roomId).get(),
      database.ref(`roomReservations/${roomId}`).get(),
    ]);
    const guard = guardSnapshot.exists ? guardSnapshot.data() : null;
    const reservation = snapshotValue(reservationSnapshot);
    const isClosedNamespace = (
      [STATES.DELETING, STATES.DELETED].includes(guard?.state)
      || reservation?.state === STATES.DELETED
    );
    if (!isClosedNamespace) return { roomId, ignored: true };

    try {
      await bucket.file(String(object.name)).delete({
        ignoreNotFound: true,
        ifGenerationMatch: generation,
      });
      return { roomId, deleted: true };
    } catch (error) {
      // A newer generation produces its own finalize event. Never let an older
      // event delete that replacement, and do not retry an immutable 412.
      if (Number(error?.code) === 412) return { roomId, superseded: true };
      throw error;
    }
  };

  const createJournal = async ({ roomId, profile, requestedAt }) => {
    const [roomSnapshot, accessSnapshot, reservationSnapshot] = await Promise.all([
      database.ref(`rooms/${roomId}`).get(),
      accessRef(roomId).get(),
      database.ref(`roomReservations/${roomId}`).get(),
    ]);
    const room = snapshotValue(roomSnapshot);
    const access = snapshotValue(accessSnapshot);
    const reservation = snapshotValue(reservationSnapshot);
    validateCanonicalOwner({ roomId, profile, room, access, reservation });
    const journal = {
      roomId,
      creationId: access.creationId,
      reservationCreatedByUid: reservation.createdByUid,
      reservationCreatedAt: Number(reservation.createdAt),
      deletionId: String(operationIdFactory()),
      ownerUid: profile.uid,
      state: STATES.REQUESTED,
      titleSnapshot: String(room?.meta?.title || '未命名旅程').slice(0, 120),
      members: normalizeMembers(access.members),
      inviteHashes: inviteHashMap([access?.invite?.tokenHash]),
      requestedAt,
      updatedAt: requestedAt,
      kick: String(operationIdFactory()),
    };
    // The recovery projection exists before the trigger source. If journal
    // creation fails, the owner sees a retryable card and no cloud data is locked.
    await writeOwnerRetryIndex(roomId, journal, requestedAt);
    const result = await deletionRef(roomId).transaction(
      (current) => {
        if (current === null) return journal;
        if (
          current?.ownerUid === profile.uid
          && current?.creationId === journal.creationId
          && [STATES.REQUESTED, STATES.DELETING, STATES.DELETED].includes(current?.state)
        ) return current;
        return undefined;
      },
      undefined,
      false,
    );
    if (!result.committed) fail('permission-denied', '只有旅程擁有者可以永久刪除此旅程。');
    const canonical = snapshotValue(result.snapshot);
    if (canonical?.state === STATES.DELETED) {
      await database.ref(`userTrips/${profile.uid}/${roomId}`).remove();
    }
    return canonical;
  };

  const requestTripDeletion = async (data, auth) => {
    const profile = requireGoogleIdentity(auth);
    const roomId = validateRoomId(data?.roomId);
    await assertNoRepairLease(roomId);
    let journal = snapshotValue(await deletionRef(roomId).get());
    if (journal) {
      if (journal.ownerUid !== profile.uid || !journal.deletionId || !journal.creationId) {
        fail('permission-denied', '只有旅程擁有者可以永久刪除此旅程。');
      }
      if (journal.state !== STATES.DELETED) {
        await database.ref(`tripDeletions/${roomId}/kick`).set(String(operationIdFactory()));
      }
    } else {
      journal = await createJournal({ roomId, profile, requestedAt: nowValue(clock) });
    }
    return {
      roomId,
      deletionId: journal.deletionId,
      accepted: true,
      state: journal.state,
      alreadyDeleted: journal.state === STATES.DELETED,
    };
  };

  const processTripDeletion = async (roomIdInput) => {
    const roomId = validateRoomId(roomIdInput);
    let journal = snapshotValue(await deletionRef(roomId).get());
    if (!journal) return { ignored: true };
    if (journal.state === STATES.DELETED) {
      await convergeDeleted(roomId, journal);
      return { roomId, completed: true };
    }
    const workerId = String(operationIdFactory());
    const lease = await acquireLease(roomId, workerId);
    if (!lease.acquired) return { roomId, busy: true, retryRequired: true };

    let leaseReleased = false;
    try {
      journal = snapshotValue(await deletionRef(roomId).get());
      if (!journal) return { ignored: true };
      if (journal.state === STATES.DELETED) {
        await convergeDeleted(roomId, journal);
        await releaseLease(roomId, workerId);
        leaseReleased = true;
        return { roomId, completed: true };
      }
      await writeOwnerRetryIndex(roomId, journal, nowValue(clock));
      if (journal.phase !== PHASE_NAMESPACE_CLOSED) {
        await assertNoRepairLease(roomId);
        await renewLease(roomId, workerId);
        // Storage authorization is backed by Firestore rather than RTDB. Close
        // that boundary first so an unavailable guard write can never leave a
        // room marked deleting while its existing Storage ACL remains usable.
        await ensureFirestoreGuard({
          roomId,
          journal,
          state: STATES.DELETING,
          updatedAt: nowValue(clock),
        });
        const access = await lockRoom({ roomId, journal, updatedAt: nowValue(clock) });
        // The canonical RTDB lock is the security boundary. Once it succeeds,
        // immediately make every lobby projection non-active before continuing
        // with the remaining cross-service cleanup.
        await writeDeletingIndexes(roomId, journal, nowValue(clock));
        journal = await updateDeletingJournal({
          roomId,
          journal,
          access,
          updatedAt: nowValue(clock),
        });
        await deleteFirestoreMembers(roomId);
        const closedAt = nowValue(clock);
        await claimQuotaRelease({ roomId, journal, claimedAt: closedAt });
        journal = await transitionNamespaceClosed({ roomId, journal, workerId, closedAt });
      }
      const storage = await sweepStorage({ roomId, journal, workerId });
      if (!storage.settled) {
        await checkpointStorage({ roomId, progress: storage.progress, workerId });
        leaseReleased = true;
        return { roomId, retryRequired: true, state: STATES.DELETING };
      }
      journal = { ...journal, storageProgress: storage.progress };
      await completeDeletion({
        roomId,
        journal,
        workerId,
        completedAt: nowValue(clock),
      });
      leaseReleased = true;
      return { roomId, completed: true, state: STATES.DELETED };
    } catch (error) {
      if (!leaseReleased) {
        try {
          await releaseLease(roomId, workerId);
          leaseReleased = true;
        } catch {
          // Preserve the operation error; lease expiry remains takeover-safe.
        }
      }
      throw error;
    } finally {
      if (!leaseReleased) await releaseLease(roomId, workerId);
    }
  };

  return {
    deleteTrip: requestTripDeletion,
    requestTripDeletion,
    processTripDeletion,
    cleanupFinalizedDeletedTripObject,
  };
}
