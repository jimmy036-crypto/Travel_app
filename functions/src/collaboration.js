import {
  MEMBER_ROLES,
  MEMBER_STATUSES,
  CollaborationError,
  buildMemberRecord,
  createOperationId,
  generateInviteToken,
  hashInviteToken,
  isActiveMember,
  isOwnerMember,
  normalizeTripMeta,
  requireGoogleIdentity,
  sanitizeMemberForClient,
  sortMembers,
  validateMemberUid,
  validateRoomId,
} from './domain.js';

const fail = (code, message) => {
  throw new CollaborationError(code, message);
};

const nowValue = (clock) => Number(clock());
const QUOTA_WINDOW_MS = 60 * 60 * 1000;

const isValidAclVersion = (value) => (
  Number.isSafeInteger(Number(value)) && Number(value) > 0
);

const memberAclVersion = (member) => {
  const value = Number(member?.aclVersion);
  return Number.isSafeInteger(value) && value > 0 ? value : 1;
};

const isWellFormedMemberAccess = (uid, member) => (
  member?.uid === uid
  && (member?.role === MEMBER_ROLES.OWNER || member?.role === MEMBER_ROLES.EDITOR)
  && (member?.status === MEMBER_STATUSES.ACTIVE || member?.status === MEMBER_STATUSES.REMOVED)
  && isValidAclVersion(member?.aclVersion)
);

const normalizeMemberAccess = (uid, member) => {
  const validRole = member?.role === MEMBER_ROLES.OWNER || member?.role === MEMBER_ROLES.EDITOR;
  const validIdentity = member?.uid === uid;
  const validVersion = isValidAclVersion(member?.aclVersion);
  const role = member?.role === MEMBER_ROLES.OWNER ? MEMBER_ROLES.OWNER : MEMBER_ROLES.EDITOR;
  const status = validIdentity
    && validRole
    && validVersion
    && member?.status === MEMBER_STATUSES.ACTIVE
    ? MEMBER_STATUSES.ACTIVE
    : MEMBER_STATUSES.REMOVED;
  return {
    uid,
    role,
    status,
    aclVersion: memberAclVersion(member),
    updatedAt: Number(member?.updatedAt) || Date.now(),
  };
};

const inviteResponse = (state) => ({
  token: String(state?.token || ''),
  createdAt: Number(state?.createdAt) || null,
  createdByUid: String(state?.createdByUid || ''),
  expiresAt: null,
});

export function createCollaborationService({ database, firestore, clock = Date.now }) {
  if (!database || !firestore) throw new TypeError('database and firestore are required.');

  const roomAccessRef = (roomId) => database.ref(`roomAccess/${roomId}`);
  const memberRef = (roomId, uid) => database.ref(`roomAccess/${roomId}/members/${uid}`);
  const deletionRef = (roomId) => database.ref(`tripDeletions/${roomId}`);
  const inviteLookupRef = (tokenHash) => database.ref(`tripInvites/${tokenHash}`);
  const aclRef = (roomId, uid) => firestore.doc(`tripAccess/${roomId}/members/${uid}`);
  const aclGuardRef = (roomId) => firestore.doc(`tripAccess/${roomId}`);

  // The Admin RTDB SDK invokes a transaction callback with a local `null`
  // before it has fetched an existing server value. Returning `undefined` at
  // that point aborts without ever reading the canonical value. A no-op null
  // write forces the compare-and-retry round trip; a genuinely missing path is
  // reported to callers as an uncommitted existing-value transaction.
  const transactExisting = async (reference, updateValue) => {
    const result = await reference.transaction(
      (current) => (current === null ? current : updateValue(current)),
      undefined,
      false,
    );
    return {
      committed: result.committed && result.snapshot.val() !== null,
      snapshot: result.snapshot,
    };
  };

  const consumeQuota = async ({ path, limit, totalLimit = null }) => {
    const now = nowValue(clock);
    const quotaRef = database.ref(path);
    const result = await quotaRef.transaction(
      (current) => {
        const previous = current && typeof current === 'object' ? current : {};
        const previousWindowStart = Number(previous.windowStartedAt) || now;
        const resetWindow = now - previousWindowStart >= QUOTA_WINDOW_MS;
        const windowStartedAt = resetWindow ? now : previousWindowStart;
        const windowCount = resetWindow ? 0 : Number(previous.windowCount) || 0;
        const totalCount = Number(previous.totalCount) || 0;
        const pendingReleases = (
          previous.pendingReleases
          && typeof previous.pendingReleases === 'object'
          && !Array.isArray(previous.pendingReleases)
        ) ? previous.pendingReleases : null;
        if (windowCount >= limit) return undefined;
        if (totalLimit !== null && totalCount >= totalLimit) return undefined;
        return {
          windowStartedAt,
          windowCount: windowCount + 1,
          totalCount: totalCount + (totalLimit === null ? 0 : 1),
          ...(pendingReleases ? { pendingReleases } : {}),
          updatedAt: now,
        };
      },
      undefined,
      false,
    );
    return { committed: result.committed, ref: quotaRef };
  };

  const releaseTotalQuota = async (quotaRef) => {
    await transactExisting(
      quotaRef,
      (current) => {
        if (typeof current !== 'object') return current;
        return {
          ...current,
          totalCount: Math.max(0, (Number(current.totalCount) || 0) - 1),
          updatedAt: nowValue(clock),
        };
      },
    );
  };

  const getAccess = async (roomId) => (await roomAccessRef(roomId).get()).val();

  const requireActiveAccess = async (roomId, profile) => {
    const access = await getAccess(roomId);
    const member = access?.members?.[profile.uid];
    if (
      access?.state !== 'ready'
      ||
      !isActiveMember(member)
      || member.uid !== profile.uid
      || !isValidAclVersion(member.aclVersion)
    ) fail('permission-denied', '你不是此旅程的有效成員。');
    return { access, member };
  };

  const requireOwnerAccess = async (roomId, profile) => {
    const { access, member } = await requireActiveAccess(roomId, profile);
    if (!isOwnerMember(member, access?.ownerUid, profile.uid)) {
      fail('permission-denied', '只有旅程擁有者可以執行此操作。');
    }
    return { access, member };
  };

  const syncIndexMember = async (roomId, uid, member) => {
    const nextIndex = {
      role: member.role,
      status: member.status,
      aclVersion: member.aclVersion,
      updatedAt: member.updatedAt,
    };

    return database.ref(`userTrips/${uid}/${roomId}`).transaction(
      (current) => {
        const currentVersion = Number(current?.aclVersion) || 0;
        if (currentVersion > member.aclVersion) return undefined;
        if (
          currentVersion === member.aclVersion
          && current?.status === MEMBER_STATUSES.REMOVED
          && member.status === MEMBER_STATUSES.ACTIVE
        ) return undefined;
        return nextIndex;
      },
      undefined,
      false,
    );
  };

  const syncAclMember = async (roomId, uid, member) => (
    firestore.runTransaction(async (transaction) => {
      const targetRef = aclRef(roomId, uid);
      const guardSnapshot = await transaction.get(aclGuardRef(roomId));
      const guard = guardSnapshot.exists ? guardSnapshot.data() : null;
      if (guard?.state === 'deleting' || guard?.state === 'deleted') {
        transaction.delete(targetRef);
        return 'blocked';
      }
      const snapshot = await transaction.get(targetRef);
      const current = snapshot.exists ? snapshot.data() : null;
      const currentVersion = Number(current?.aclVersion) || 0;
      if (currentVersion > member.aclVersion) return false;
      if (
        currentVersion === member.aclVersion
        && current?.status === MEMBER_STATUSES.REMOVED
        && member.status === MEMBER_STATUSES.ACTIVE
      ) return false;
      transaction.set(targetRef, {
        uid,
        role: member.role,
        status: member.status,
        aclVersion: member.aclVersion,
        updatedAt: new Date(member.updatedAt),
      });
      return true;
    })
  );

  const readMemberMirrors = async (roomId, uid) => {
    const [indexSnapshot, aclSnapshot] = await Promise.all([
      database.ref(`userTrips/${uid}/${roomId}`).get(),
      aclRef(roomId, uid).get(),
    ]);
    return {
      index: indexSnapshot.val(),
      acl: aclSnapshot.exists ? aclSnapshot.data() : null,
    };
  };

  const persistFailClosedTombstone = async ({
    roomId,
    uid,
    rawMember,
    member,
    currentExists,
  }) => {
    const mirrors = await readMemberMirrors(roomId, uid);
    const mirrorRecords = [mirrors.index, mirrors.acl].filter(Boolean);
    const maxMirrorVersion = mirrorRecords.reduce(
      (maximum, mirror) => Math.max(maximum, isValidAclVersion(mirror?.aclVersion)
        ? Number(mirror.aclVersion)
        : 0),
      0,
    );
    const mirrorRequiresAdvance = mirrorRecords.some((mirror) => {
      const version = isValidAclVersion(mirror?.aclVersion) ? Number(mirror.aclVersion) : 0;
      return version > member.aclVersion
        || (version === member.aclVersion && mirror?.status !== MEMBER_STATUSES.REMOVED);
    });
    const malformedCanonical = currentExists && !isWellFormedMemberAccess(uid, rawMember);
    if (currentExists && !malformedCanonical && !mirrorRequiresAdvance) return member;

    const targetVersion = Math.max(
      member.aclVersion,
      malformedCanonical || mirrorRequiresAdvance ? maxMirrorVersion + 1 : 1,
    );
    const repairedAt = nowValue(clock);
    const repair = await memberRef(roomId, uid).transaction(
      (current) => {
        const source = current || (!currentExists ? rawMember : null);
        if (!source) return undefined;
        if (
          isWellFormedMemberAccess(uid, current)
          && current.status === MEMBER_STATUSES.ACTIVE
        ) return undefined;
        const normalizedCurrent = normalizeMemberAccess(uid, source);
        const currentVersion = isValidAclVersion(source?.aclVersion)
          ? Number(source.aclVersion)
          : 0;
        return {
          ...source,
          uid,
          role: normalizedCurrent.role,
          status: MEMBER_STATUSES.REMOVED,
          aclVersion: Math.max(targetVersion, currentVersion || 1),
          updatedAt: repairedAt,
        };
      },
      undefined,
      false,
    );
    if (repair.committed) return normalizeMemberAccess(uid, repair.snapshot.val());

    const latest = (await memberRef(roomId, uid).get()).val();
    if (latest) return normalizeMemberAccess(uid, latest);
    fail('aborted', '旅程權限修復發生衝突，請稍後再試。');
  };

  const cleanupMemberDuringDeletion = async (roomId, uid, deletion) => {
    const indexRef = database.ref(`userTrips/${uid}/${roomId}`);
    if (
      deletion.state === 'deleted'
      || deletion.phase === 'namespace-closed' && uid !== deletion.ownerUid
    ) {
      await Promise.all([
        indexRef.remove(),
        aclRef(roomId, uid).delete(),
      ]);
      return;
    }

    const member = deletion?.members?.[uid] || {};
    const updatedAt = Number(deletion.updatedAt) || nowValue(clock);
    const index = uid === deletion.ownerUid
      ? {
          role: 'owner',
          status: 'deleting',
          aclVersion: memberAclVersion(member) + 1,
          updatedAt,
          deletionId: String(deletion.deletionId || ''),
          titleSnapshot: String(deletion.titleSnapshot || '未命名旅程').slice(0, 120),
        }
      : {
          role: member.role === MEMBER_ROLES.OWNER
            ? MEMBER_ROLES.OWNER
            : MEMBER_ROLES.EDITOR,
          status: MEMBER_STATUSES.REMOVED,
          aclVersion: memberAclVersion(member) + 1,
          updatedAt,
        };
    await Promise.all([
      indexRef.set(index),
      aclRef(roomId, uid).delete(),
    ]);
  };

  const syncMemberAccess = async (roomId, uid, deletedMember = null) => {
    const deletion = (await deletionRef(roomId).get()).val();
    if (deletion?.state === 'deleting' || deletion?.state === 'deleted') {
      await cleanupMemberDuringDeletion(roomId, uid, deletion);
      return null;
    }
    const currentSnapshot = await memberRef(roomId, uid).get();
    const rawMember = currentSnapshot.val() || deletedMember;
    if (!rawMember) return null;
    let member = normalizeMemberAccess(uid, rawMember);
    if (member.status === MEMBER_STATUSES.REMOVED) {
      member = await persistFailClosedTombstone({
        roomId,
        uid,
        rawMember,
        member,
        currentExists: currentSnapshot.exists(),
      });
    }
    const [indexResult, aclResult] = await Promise.all([
      syncIndexMember(roomId, uid, member),
      syncAclMember(roomId, uid, member),
    ]);
    if (aclResult === 'blocked') {
      const latestDeletion = (await deletionRef(roomId).get()).val();
      if (latestDeletion?.state === 'deleting' || latestDeletion?.state === 'deleted') {
        await cleanupMemberDuringDeletion(roomId, uid, latestDeletion);
        return null;
      }
      fail('aborted', '旅程權限同步已被刪除防護中止，請稍後再試。');
    }
    if (!indexResult.committed || aclResult === false) {
      const latest = (await memberRef(roomId, uid).get()).val();
      if (latest) {
        const normalizedLatest = normalizeMemberAccess(uid, latest);
        if (
          normalizedLatest.aclVersion !== member.aclVersion
          || normalizedLatest.status !== member.status
          || normalizedLatest.role !== member.role
        ) {
          return syncMemberAccess(roomId, uid);
        }
      }
      if (member.status === MEMBER_STATUSES.REMOVED) {
        return syncMemberAccess(roomId, uid, member);
      }
      fail('aborted', '旅程權限同步發生衝突，請稍後再試。');
    }
    return member;
  };

  const activateInviteLookup = async (roomId, invite) => {
    const tokenHash = String(invite?.tokenHash || '');
    const version = Number(invite?.version);
    if (!tokenHash || !Number.isSafeInteger(version) || version < 1) {
      fail('failed-precondition', '邀請狀態不完整，請換發連結。');
    }
    await inviteLookupRef(tokenHash).set({
      roomId,
      role: MEMBER_ROLES.EDITOR,
      active: true,
      version,
      createdAt: Number(invite.createdAt),
      createdByUid: String(invite.createdByUid || ''),
    });
  };

  const createInvite = async (roomId, profile) => {
    const createdAt = nowValue(clock);
    const token = generateInviteToken();
    const tokenHash = hashInviteToken(token);
    await inviteLookupRef(tokenHash).set({
      roomId,
      role: MEMBER_ROLES.EDITOR,
      active: false,
      pending: true,
      version: 0,
      createdAt,
      createdByUid: profile.uid,
    });

    let previousTokenHash = '';
    const activation = await transactExisting(
      roomAccessRef(roomId),
      (current) => {
        const owner = current?.members?.[profile.uid];
        if (
          current?.state !== 'ready'
          || !isOwnerMember(owner, current?.ownerUid, profile.uid)
        ) return undefined;
        const previousRate = current?.inviteRate || {};
        const previousWindowStart = Number(previousRate.windowStartedAt) || createdAt;
        const resetWindow = createdAt - previousWindowStart >= QUOTA_WINDOW_MS;
        const windowStartedAt = resetWindow ? createdAt : previousWindowStart;
        const windowCount = resetWindow ? 0 : Number(previousRate.windowCount) || 0;
        if (windowCount >= 10) return undefined;
        previousTokenHash = String(current?.invite?.tokenHash || '');
        const version = (Number(current?.inviteVersion) || 0) + 1;
        return {
          ...current,
          invite: {
            token,
            tokenHash,
            active: true,
            version,
            createdAt,
            createdByUid: profile.uid,
          },
          inviteVersion: version,
          inviteRate: {
            windowStartedAt,
            windowCount: windowCount + 1,
            updatedAt: createdAt,
          },
        };
      },
    );
    if (!activation.committed) {
      await inviteLookupRef(tokenHash).remove();
      const latestAccess = activation.snapshot.val();
      const latestOwner = latestAccess?.members?.[profile.uid];
      const inviteRate = latestAccess?.inviteRate || {};
      if (
        isOwnerMember(latestOwner, latestAccess?.ownerUid, profile.uid)
        && createdAt - (Number(inviteRate.windowStartedAt) || createdAt) < QUOTA_WINDOW_MS
        && Number(inviteRate.windowCount) >= 10
      ) {
        fail('resource-exhausted', '邀請連結每小時最多建立或換發 10 次。');
      }
      fail('permission-denied', '只有旅程擁有者可以執行此操作。');
    }

    const canonicalInvite = activation.snapshot.val()?.invite;
    // The room transaction is authoritative. If lookup activation fails, the
    // pending record remains available for a later owner read to repair; never
    // restore a stale previous token.
    await activateInviteLookup(roomId, canonicalInvite);
    if (previousTokenHash && previousTokenHash !== tokenHash) {
      await inviteLookupRef(previousTokenHash).remove();
    }

    const latestAccess = await getAccess(roomId);
    if (
      latestAccess?.invite?.tokenHash !== tokenHash
      || latestAccess?.invite?.version !== canonicalInvite?.version
    ) {
      await inviteLookupRef(tokenHash).remove();
      fail('aborted', '邀請已被另一個操作換發，請重新開啟分享設定。');
    }
    return inviteResponse(canonicalInvite);
  };

  return {
    async createTrip(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      const createdAt = nowValue(clock);
      const creationId = createOperationId();
      const meta = {
        ...normalizeTripMeta(data?.meta, createdAt),
        ownerUid: profile.uid,
      };
      const ownerMember = buildMemberRecord({
        profile,
        role: MEMBER_ROLES.OWNER,
        joinedAt: createdAt,
      });
      const existingRoom = await database.ref(`rooms/${roomId}`).get();
      if (existingRoom.exists()) {
        fail('already-exists', '此旅程 ID 已存在。');
      }
      const createQuota = await consumeQuota({
        path: `userQuotas/${profile.uid}/createTrip`,
        limit: 10,
        totalLimit: 50,
      });
      if (!createQuota.committed) {
        fail('resource-exhausted', '每個帳號最多建立 50 趟旅程，且每小時最多建立 10 趟。');
      }
      const reservation = await database.ref(`roomReservations/${roomId}`).transaction(
        (current) => (current === null ? {
          roomId,
          creationId,
          createdByUid: profile.uid,
          createdAt,
        } : undefined),
        undefined,
        false,
      );
      if (!reservation.committed) {
        await releaseTotalQuota(createQuota.ref);
        fail('already-exists', '此旅程 ID 已存在。');
      }
      const access = {
        ownerUid: profile.uid,
        creationId,
        state: 'pending',
        createdAt,
        members: { [profile.uid]: ownerMember },
      };

      const accessTransaction = await roomAccessRef(roomId).transaction(
        (current) => (current === null ? access : undefined),
        undefined,
        false,
      );
      if (!accessTransaction.committed) {
        await releaseTotalQuota(createQuota.ref);
        fail('already-exists', '此旅程 ID 已存在。');
      }

      try {
        await database.ref().update({
          [`rooms/${roomId}`]: {
            meta,
            itinerary: { 'Day 1': [] },
            expenses: [],
            settlements: [],
            tickets: [],
            checklist: {},
          },
          [`roomAccess/${roomId}/state`]: 'ready',
          [`userTrips/${profile.uid}/${roomId}`]: {
            role: MEMBER_ROLES.OWNER,
            status: MEMBER_STATUSES.ACTIVE,
            aclVersion: memberAclVersion(ownerMember),
            updatedAt: ownerMember.updatedAt,
          },
        });
      } catch (error) {
        const [latestRoom, latestAccess] = await Promise.all([
          database.ref(`rooms/${roomId}`).get(),
          roomAccessRef(roomId).get(),
        ]);
        if (
          latestRoom.exists()
          && latestAccess.val()?.creationId === creationId
          && latestAccess.val()?.state === 'ready'
        ) {
          return { roomId, meta, role: MEMBER_ROLES.OWNER };
        }

        const failedAt = nowValue(clock);
        const failure = await transactExisting(
          roomAccessRef(roomId),
          (current) => {
            if (current.creationId !== creationId || current.state === 'ready') {
              return undefined;
            }
            const target = current.members?.[profile.uid] || ownerMember;
            return {
              ...current,
              state: 'failed',
              failedAt,
              members: {
                ...(current.members || {}),
                [profile.uid]: {
                  ...target,
                  status: MEMBER_STATUSES.REMOVED,
                  aclVersion: memberAclVersion(target) + 1,
                  updatedAt: failedAt,
                },
              },
            };
          },
        );
        if (failure.committed && !latestRoom.exists()) {
          await database.ref(`userTrips/${profile.uid}/${roomId}`).set({
            role: MEMBER_ROLES.OWNER,
            status: MEMBER_STATUSES.REMOVED,
            aclVersion: memberAclVersion(failure.snapshot.val()?.members?.[profile.uid]),
            updatedAt: failedAt,
          });
          await releaseTotalQuota(createQuota.ref);
        }
        throw error;
      }

      return { roomId, meta, role: MEMBER_ROLES.OWNER };
    },

    async getOrCreateTripInvite(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      const { access } = await requireOwnerAccess(roomId, profile);
      const state = access?.invite;
      if (
        state?.active
        && state?.token
        && state?.tokenHash
      ) {
        await activateInviteLookup(roomId, state);
        return inviteResponse(state);
      }
      return createInvite(roomId, profile);
    },

    async rotateTripInvite(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      await requireOwnerAccess(roomId, profile);
      return createInvite(roomId, profile);
    },

    async revokeTripInvite(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      await requireOwnerAccess(roomId, profile);
      let revokedTokenHash = '';
      const revocation = await transactExisting(
        roomAccessRef(roomId),
        (current) => {
          const owner = current?.members?.[profile.uid];
          if (
            current?.state !== 'ready'
            || !isOwnerMember(owner, current?.ownerUid, profile.uid)
          ) return undefined;
          revokedTokenHash = String(current?.invite?.tokenHash || '');
          if (!current?.invite?.active) return current;
          const next = { ...current };
          delete next.invite;
          next.inviteVersion = (Number(current?.inviteVersion) || 0) + 1;
          next.lastInviteRevokedAt = nowValue(clock);
          next.lastInviteRevokedByUid = profile.uid;
          return next;
        },
      );
      if (!revocation.committed) fail('permission-denied', '只有旅程擁有者可以執行此操作。');
      if (!revokedTokenHash) return { revoked: false };
      await inviteLookupRef(revokedTokenHash).remove();
      return { revoked: true };
    },

    async redeemTripInvite(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const redeemQuota = await consumeQuota({
        path: `userQuotas/${profile.uid}/redeemInvite`,
        limit: 30,
      });
      if (!redeemQuota.committed) {
        fail('resource-exhausted', '邀請驗證過於頻繁，請一小時後再試。');
      }
      const tokenHash = hashInviteToken(data?.token);
      const invite = (await inviteLookupRef(tokenHash).get()).val();
      if (!invite?.active || invite?.pending) fail('not-found', '邀請連結無效或已撤銷。');
      const roomId = validateRoomId(invite.roomId);
      const inviteVersion = Number(invite.version);
      if (!Number.isSafeInteger(inviteVersion) || inviteVersion < 1) {
        fail('not-found', '邀請連結無效或已撤銷。');
      }
      const joinedAt = nowValue(clock);
      const joinOperationId = createOperationId();
      const member = {
        ...buildMemberRecord({
        profile,
        role: MEMBER_ROLES.EDITOR,
        joinedAt,
        }),
        joinOperationId,
      };
      const accessTransaction = await transactExisting(
        roomAccessRef(roomId),
        (current) => {
          if (
            current?.state !== 'ready'
            ||
            !current.invite?.active
            || current.invite.tokenHash !== tokenHash
            || Number(current.invite.version) !== inviteVersion
          ) return undefined;
          const existing = current.members?.[profile.uid];
          if (existing?.status === MEMBER_STATUSES.REMOVED) return undefined;
          if (isActiveMember(existing)) return current;
          if (Object.keys(current.members || {}).length >= 50) return undefined;
          return {
            ...current,
            members: {
              ...(current.members || {}),
              [profile.uid]: member,
            },
          };
        },
      );
      if (!accessTransaction.committed) {
        const latestAccess = accessTransaction.snapshot.val();
        const latestMember = latestAccess?.members?.[profile.uid];
        if (latestMember?.status === MEMBER_STATUSES.REMOVED) {
          fail('permission-denied', '你的旅程權限已被移除，請聯絡旅程擁有者恢復。');
        }
        if (
          latestAccess?.invite?.active
          && latestAccess.invite.tokenHash === tokenHash
          && Number(latestAccess.invite.version) === inviteVersion
          && Object.keys(latestAccess?.members || {}).length >= 50
        ) {
          fail('resource-exhausted', '此旅程的帳號成員已達 50 人上限。');
        }
        fail('not-found', '邀請連結無效或已換發。');
      }

      const latestMember = accessTransaction.snapshot.val()?.members?.[profile.uid];
      await syncMemberAccess(roomId, profile.uid, latestMember);
      return {
        roomId,
        role: latestMember.role,
        joined: latestMember.joinOperationId === joinOperationId,
      };
    },

    async listTripMembers(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      const { access } = await requireOwnerAccess(roomId, profile);
      const members = Object.values(access?.members || {})
        .map(sanitizeMemberForClient)
        .filter(Boolean);
      return { members: sortMembers(members) };
    },

    async removeTripMember(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      const uid = validateMemberUid(data?.uid);
      const { access } = await requireOwnerAccess(roomId, profile);
      if (uid === access.ownerUid) fail('failed-precondition', '不能移除旅程擁有者。');
      const initialTarget = access?.members?.[uid];
      if (!initialTarget) fail('not-found', '找不到此成員。');
      if (initialTarget.status === MEMBER_STATUSES.REMOVED) {
        await syncMemberAccess(roomId, uid);
        return { removed: false };
      }
      const removedAt = nowValue(clock);
      const removedTarget = {
        ...initialTarget,
        status: MEMBER_STATUSES.REMOVED,
        aclVersion: memberAclVersion(initialTarget) + 1,
        removedAt,
        removedByUid: profile.uid,
        updatedAt: removedAt,
      };
      const aclRevoked = await syncAclMember(roomId, uid, normalizeMemberAccess(uid, removedTarget));
      if (aclRevoked !== true) {
        fail('aborted', '成員權限正在由另一個操作更新，請重新整理後再試。');
      }
      const removal = await transactExisting(
        roomAccessRef(roomId),
        (current) => {
          const owner = current?.members?.[profile.uid];
          if (
            current?.state !== 'ready'
            || !isOwnerMember(owner, current?.ownerUid, profile.uid)
          ) return undefined;
          if (uid === current.ownerUid) return undefined;
          const target = current?.members?.[uid];
          if (!target) return undefined;
          if (target.status === MEMBER_STATUSES.REMOVED) return current;
          if (memberAclVersion(target) !== memberAclVersion(initialTarget)) return undefined;
          return {
            ...current,
            members: {
              ...current.members,
              [uid]: removedTarget,
            },
          };
        },
      );
      if (!removal.committed) {
        const latest = removal.snapshot.val();
        if (uid === latest?.ownerUid) fail('failed-precondition', '不能移除旅程擁有者。');
        if (!latest?.members?.[uid]) fail('not-found', '找不到此成員。');
        fail('permission-denied', '只有旅程擁有者可以執行此操作。');
      }
      const latestTarget = removal.snapshot.val()?.members?.[uid];
      await syncMemberAccess(roomId, uid, latestTarget);
      return { removed: latestTarget?.status === MEMBER_STATUSES.REMOVED };
    },

    async restoreTripMember(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      const uid = validateMemberUid(data?.uid);
      const { access } = await requireOwnerAccess(roomId, profile);
      if (uid === access.ownerUid) fail('failed-precondition', '旅程擁有者不需要恢復。');
      const initialTarget = access?.members?.[uid];
      if (!initialTarget) fail('not-found', '找不到此成員。');
      if (initialTarget.status === MEMBER_STATUSES.ACTIVE) {
        await syncMemberAccess(roomId, uid);
        return { restored: false };
      }
      const restoredAt = nowValue(clock);
      const restoredTarget = {
        ...initialTarget,
        status: MEMBER_STATUSES.ACTIVE,
        aclVersion: memberAclVersion(initialTarget) + 1,
        updatedAt: restoredAt,
      };
      delete restoredTarget.removedAt;
      delete restoredTarget.removedByUid;
      const restoration = await transactExisting(
        roomAccessRef(roomId),
        (current) => {
          const owner = current?.members?.[profile.uid];
          if (
            current?.state !== 'ready'
            || !isOwnerMember(owner, current?.ownerUid, profile.uid)
          ) return undefined;
          if (uid === current.ownerUid) return undefined;
          const target = current?.members?.[uid];
          if (!target) return undefined;
          if (target.status === MEMBER_STATUSES.ACTIVE) return current;
          if (memberAclVersion(target) !== memberAclVersion(initialTarget)) return undefined;
          return {
            ...current,
            members: { ...current.members, [uid]: restoredTarget },
          };
        },
      );
      if (!restoration.committed) {
        const latest = restoration.snapshot.val();
        if (uid === latest?.ownerUid) fail('failed-precondition', '旅程擁有者不需要恢復。');
        if (!latest?.members?.[uid]) fail('not-found', '找不到此成員。');
        fail('permission-denied', '只有旅程擁有者可以執行此操作。');
      }
      const latestTarget = restoration.snapshot.val()?.members?.[uid];
      await syncMemberAccess(roomId, uid, latestTarget);
      return {
        restored: latestTarget?.status === MEMBER_STATUSES.ACTIVE,
      };
    },

    syncMemberAccess,
  };
}
