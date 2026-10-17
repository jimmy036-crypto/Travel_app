import { createHash } from 'node:crypto';
import { CollaborationError, createOperationId, isActiveMember, requireGoogleIdentity, validateMemberUid, validateRoomId } from './domain.js';
import { cloneItinerary } from './travelJournal.js';

const fail = (code, message) => { throw new CollaborationError(code, message); };
const operationKey = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail('invalid-argument', '保存作業 ID 格式不正確。');
  return value;
};
const closed = (archive) => ['deleting', 'deleted'].includes(archive?.summary?.state);
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const publicError = (error) => error?.code === 'permission-denied' ? '原旅程權限已變更，未完成的照片無法補存。'
  : error?.code === 'failed-precondition' || error?.code === 404 ? '原照片缺失或格式已變更，照片尚未全部保存。'
    : '照片尚未全部保存，請重試未完成照片。';

export function createTravelMemoryArchiveService({ database, bucket, clock = Date.now, operationIdFactory = createOperationId, batchSize = 20 }) {
  if (!database || !bucket) throw new TypeError('database and bucket are required.');
  const archiveRef = (uid, roomId) => database.ref(`travelMemoryArchives/${uid}/${roomId}`);
  const read = async (path) => (await database.ref(path).get()).val();
  const transact = async (reference, update) => {
    const exists = (await reference.get()).exists();
    const result = await reference.transaction((current) => current === null && exists ? null : update(current), undefined, false);
    return { committed: result.committed && result.snapshot.val() !== null, value: result.snapshot.val() };
  };
  const assertAccess = async (uid, roomId, version) => {
    const access = await read(`roomAccess/${roomId}`); const member = access?.members?.[uid];
    if (access?.state !== 'ready' || !isActiveMember(member) || member.uid !== uid
      || !Number.isSafeInteger(member.aclVersion) || member.aclVersion < 1
      || version !== undefined && member.aclVersion !== version) fail('permission-denied', '你已無法存取原旅程。');
    return member.aclVersion;
  };
  const assertSourceMetadata = (source, metadata, roomId) => {
    const parts = String(source.storagePath || '').split('/');
    if (parts.length !== 5 || parts[0] !== 'rooms' || parts[1] !== roomId || parts[2] !== 'places'
      || parts[3] !== source.itemId || !parts[4] || parts[4].length > 300
      || metadata.metadata?.roomId !== roomId || metadata.metadata?.itemId !== source.itemId
      || !allowedTypes.has(metadata.contentType) || source.contentType !== metadata.contentType
      || !Number.isSafeInteger(Number(metadata.size)) || Number(metadata.size) < 0 || Number(metadata.size) > 5 * 1024 * 1024
      || !/^\d+$/.test(String(metadata.generation || ''))
      || source.generation && String(metadata.generation) !== source.generation
      || source.size !== undefined && source.size !== Number(metadata.size)) fail('failed-precondition', '原照片缺失或格式已變更。');
    return { ...source, generation: String(metadata.generation), size: Number(metadata.size) };
  };
  const loadSource = async (source, roomId) => {
    // Validate the exact room/place namespace before making any Admin Storage read.
    const parts = String(source.storagePath || '').split('/');
    if (parts.length !== 5 || parts[0] !== 'rooms' || parts[1] !== roomId || parts[2] !== 'places'
      || parts[3] !== source.itemId || !parts[4]) fail('failed-precondition', '原照片路徑不正確。');
    const [metadata] = await bucket.file(source.storagePath).getMetadata();
    return assertSourceMetadata(source, metadata, roomId);
  };
  const safeDelete = async (name, generation) => {
    if (!/^\d+$/.test(String(generation ?? ''))) fail('failed-precondition', '照片版本不完整，清理已停止。');
    try { await bucket.file(name, { generation }).delete({ ifGenerationMatch: generation }); }
    catch (error) { if (![404, 412].includes(Number(error.code))) throw error; }
  };
  const ownedMetadata = (metadata, uid, operationId, photoId, source) => metadata.metadata?.uid === uid
    && metadata.metadata?.operationId === operationId && metadata.metadata?.photoId === photoId
    && Object.keys(metadata.metadata || {}).length === 3 && metadata.contentType === source.contentType
    && Number(metadata.size) === source.size && metadata.cacheControl === 'private, no-store, max-age=0';
  const checkpoint = async (uid, roomId, operationId, workerId, update) => {
    const result = await transact(archiveRef(uid, roomId), (current) => {
      if (!current || closed(current) || current.operation?.id !== operationId
        || current.operation.lease?.id !== workerId || current.operation.lease.expiresAt <= Number(clock())) return undefined;
      return update(current);
    });
    if (!result.committed) fail('aborted', '保存工作已停止。');
    return result.value;
  };

  const requestTravelMemoryPreservation = async (data, auth) => {
    const { uid } = requireGoogleIdentity(auth); const roomId = validateRoomId(data?.roomId);
    const operationId = operationKey(data?.operationId);
    const account = await read(`personalTravel/${uid}`);
    if (!account?.memories?.[roomId] || account.deletedMemories?.[roomId]) fail('failed-precondition', '請先收好這趟旅行；已刪除的個人回憶無法重新保存。');
    let current = await read(`travelMemoryArchives/${uid}/${roomId}`);
    if (closed(current)) fail('failed-precondition', '這份個人回憶已刪除。');
    if (!current) {
      const aclVersion = await assertAccess(uid, roomId);
      const source = await read(`rooms/${roomId}`);
      if (!source?.meta) fail('failed-precondition', '原行程已不存在，無法永久保存。');
      const itinerary = cloneItinerary(source, 30); const sources = {};
      for (const [dayId, places] of Object.entries(source.itinerary || {})) {
        for (const place of Object.values(places || {})) {
          if (!place?.placePhoto || ![undefined, 'place', 'attraction'].includes(place.type)) continue;
          if (Object.keys(sources).length >= 1000) fail('resource-exhausted', '照片數量超出上限。');
          const photoId = createHash('sha256').update(`${dayId}\0${String(place.id)}`).digest('hex');
          if (sources[photoId]) fail('failed-precondition', '原行程含有重複的景點 ID。');
          const entry = { dayId, itemId: String(place.id), name: String(place.name || '').slice(0, 240),
            storagePath: String(place.placePhoto.storagePath || ''), contentType: String(place.placePhoto.contentType || ''),
            ...(place.placePhoto.size !== undefined ? { size: place.placePhoto.size } : {}), status: 'pending' };
          try { sources[photoId] = await loadSource(entry, roomId); }
          catch (error) { sources[photoId] = { ...entry, error: publicError(error) }; }
        }
      }
      await assertAccess(uid, roomId, aclVersion);
      const memory = account.memories[roomId];
      const meta = { title: memory.title, destination: memory.destination, startDate: memory.startDate, endDate: memory.endDate };
      for (const [key, limit] of [['destLat', 90], ['destLng', 180]]) {
        if (typeof source.meta[key] === 'number' && Number.isFinite(source.meta[key]) && Math.abs(source.meta[key]) <= limit) meta[key] = source.meta[key];
      }
      if (typeof source.meta.transport === 'string' && source.meta.transport.length <= 60) meta.transport = source.meta.transport;
      if (typeof source.meta.themeColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(source.meta.themeColor)) meta.themeColor = source.meta.themeColor;
      const next = { summary: { state: 'queued', operationId, saved: 0, total: Object.keys(sources).length }, itinerary,
        operation: { id: operationId, aclVersion, sources, meta } };
      const result = await transact(archiveRef(uid, roomId), (value) => value || next);
      current = result.value;
    } else if (current.summary.state === 'partial') {
      const result = await transact(archiveRef(uid, roomId), (value) => {
        if (!value || value.summary.state !== 'partial') return undefined;
        return { ...value, summary: { ...value.summary, state: 'queued', error: null }, operation: { ...value.operation,
          sources: Object.fromEntries(Object.entries(value.operation.sources || {}).map(([id, entry]) => [id, entry.status === 'saved' ? entry : { ...entry, status: 'pending' }])) } };
      });
      current = result.value || await read(`travelMemoryArchives/${uid}/${roomId}`);
    }
    // An already-reading request may race the personal account tombstone.
    if (await read(`personalTravel/${uid}/deletedMemories/${roomId}`)) {
      await transact(archiveRef(uid, roomId), (value) => value && !closed(value) ? { ...value, summary: { ...value.summary, state: 'deleting' }, operation: { ...value.operation, lease: null } } : undefined);
      fail('failed-precondition', '這份個人回憶已刪除。');
    }
    if (closed(current)) fail('failed-precondition', '這份個人回憶已刪除。');
    return { summary: current.summary };
  };

  const processTravelMemoryPreservation = async (uidInput, roomInput) => {
    const uid = validateMemberUid(uidInput); const roomId = validateRoomId(roomInput); const workerId = operationIdFactory();
    if (await read(`personalTravel/${uid}/deletedMemories/${roomId}`)) return processTravelMemoryDeletion(uid, roomId);
    const acquired = await transact(archiveRef(uid, roomId), (value) => {
      if (!value || !['queued', 'copying'].includes(value.summary.state) || value.operation?.lease?.expiresAt > Number(clock())) return undefined;
      return { ...value, summary: { ...value.summary, state: 'copying' }, operation: { ...value.operation, lease: { id: workerId, expiresAt: Number(clock()) + 600000 } } };
    });
    if (!acquired.committed) return { retryRequired: acquired.value?.summary?.state === 'copying', ignored: true };
    let archive = acquired.value; const operationId = archive.operation.id;
    const entries = Object.entries(archive.operation.sources || {}).filter(([, entry]) => ['pending', 'cleanup'].includes(entry.status)).slice(0, batchSize);
    for (const [photoId, initial] of entries) {
      const storagePath = `travelMemories/${uid}/${roomId}/${operationId}/${photoId}`;
      let destinationMetadata; let authorized = false;
      try {
        if (initial.status === 'cleanup') {
          await safeDelete(storagePath, initial.cleanupGeneration);
          archive = await checkpoint(uid, roomId, operationId, workerId, (value) => ({ ...value,
            operation: { ...value.operation, sources: { ...value.operation.sources, [photoId]: { ...initial, status: 'error', cleanupGeneration: null } } } }));
          continue;
        }
        await assertAccess(uid, roomId, archive.operation.aclVersion);
        let source = initial;
        if (!source.generation) {
          source = await loadSource(source, roomId);
          archive = await checkpoint(uid, roomId, operationId, workerId, (value) => ({ ...value, operation: { ...value.operation, sources: { ...value.operation.sources, [photoId]: source } } }));
        }
        try { [destinationMetadata] = await bucket.file(storagePath).getMetadata(); }
        catch (error) { if (Number(error.code) !== 404) throw error; }
        if (!destinationMetadata) {
          await loadSource(source, roomId);
          await assertAccess(uid, roomId, archive.operation.aclVersion);
          await checkpoint(uid, roomId, operationId, workerId, (value) => value);
          try {
            await bucket.file(source.storagePath, { generation: source.generation }).copy(bucket.file(storagePath), {
              preconditionOpts: { ifGenerationMatch: 0 }, contentType: source.contentType,
              metadata: { uid, operationId, photoId }, cacheControl: 'private, no-store, max-age=0',
            });
          } catch (error) { if (Number(error.code) !== 412) throw error; }
          [destinationMetadata] = await bucket.file(storagePath).getMetadata();
        }
        if (!ownedMetadata(destinationMetadata, uid, operationId, photoId, source)) fail('failed-precondition', '個人照片副本驗證失敗。');
        await assertAccess(uid, roomId, archive.operation.aclVersion);
        authorized = true;
        const photo = { storagePath, contentType: source.contentType, name: source.name, dayId: source.dayId, itemId: source.itemId, size: source.size };
        archive = await checkpoint(uid, roomId, operationId, workerId, (value) => {
          const photos = { ...value.photos, [photoId]: photo };
          return { ...value, photos, summary: { ...value.summary, saved: Object.keys(photos).length, coverPhoto: value.summary.coverPhoto || photo },
            operation: { ...value.operation, sources: { ...value.operation.sources, [photoId]: { ...source, status: 'saved', error: null } } } };
        });
      } catch (error) {
        const latest = await read(`travelMemoryArchives/${uid}/${roomId}`);
        if (!destinationMetadata) {
          try { [destinationMetadata] = await bucket.file(storagePath).getMetadata(); }
          catch (metadataError) { if (Number(metadataError.code) !== 404) throw metadataError; }
        }
        const obsolete = closed(latest) || latest?.operation?.id !== operationId;
        if (!obsolete && (latest?.operation?.lease?.id !== workerId || latest.operation.lease.expiresAt <= Number(clock()))) {
          return { ignored: true, retryRequired: latest?.summary?.state === 'copying' };
        }
        if (destinationMetadata && (obsolete || !authorized && !latest?.photos?.[photoId])) {
          // Publish cleanup intent while we own the lease. A replacement worker
          // must finish this exact-generation cleanup before using the object.
          // A delayed delete can therefore never remove a replacement generation.
          if (!obsolete) await checkpoint(uid, roomId, operationId, workerId, (value) => ({ ...value,
            operation: { ...value.operation, sources: { ...value.operation.sources, [photoId]: {
              ...value.operation.sources[photoId], status: 'cleanup', cleanupGeneration: destinationMetadata.generation, error: publicError(error),
            } } } }));
          try { await safeDelete(storagePath, destinationMetadata.generation); }
          catch (cleanupError) {
            if (!closed(latest)) await checkpoint(uid, roomId, operationId, workerId, (value) => ({ ...value,
              summary: { ...value.summary, state: 'queued' }, operation: { ...value.operation, lease: null } }));
            throw cleanupError;
          }
        }
        if (closed(latest) || latest?.operation?.lease?.id !== workerId) return { ignored: true };
        archive = await checkpoint(uid, roomId, operationId, workerId, (value) => ({ ...value,
          operation: { ...value.operation, sources: { ...value.operation.sources, [photoId]: { ...value.operation.sources[photoId], status: 'error', cleanupGeneration: null, error: publicError(error) } } } }));
      }
    }
    archive = await checkpoint(uid, roomId, operationId, workerId, (value) => {
      const entriesLeft = Object.values(value.operation.sources || {});
      const state = entriesLeft.some((entry) => ['pending', 'cleanup'].includes(entry.status)) ? 'queued' : value.summary.saved === value.summary.total ? 'complete' : 'partial';
      const firstError = entriesLeft.find((entry) => entry.status === 'error')?.error;
      return { ...value, summary: { ...value.summary, state, error: state === 'partial' ? firstError : null,
        ...(state === 'complete' ? { completedAt: Number(clock()) } : {}) }, operation: { ...value.operation, lease: null } };
    });
    return { summary: archive.summary, retryRequired: archive.summary.state === 'queued' };
  };

  const deleteTravelMemory = async (data, auth) => {
    const { uid } = requireGoogleIdentity(auth); const roomId = validateRoomId(data?.roomId);
    const revision = data?.revision;
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) fail('invalid-argument', '請提供有效版本。');
    const result = await transact(database.ref(`personalTravel/${uid}`), (account) => {
      if (account?.deletedMemories?.[roomId]) return account;
      const previous = account?.memories?.[roomId];
      if (!previous) fail('failed-precondition', '個人回憶不存在。');
      if (previous.revision !== revision) fail('aborted', '回憶已在其他畫面更新，請重新載入。');
      const memories = { ...account.memories }; delete memories[roomId];
      const collections = Object.fromEntries(Object.entries(account.collections || {}).map(([id, collection]) => {
        let changed = false;
        const items = Object.fromEntries(Object.entries(collection.items || {}).map(([itemId, item]) => {
          if (item.roomId !== roomId) return [itemId, item];
          changed = true;
          const next = { ...item }; delete next.roomId; delete next.visitId;
          return [itemId, next];
        }));
        return [id, changed ? { ...collection, items, revision: collection.revision + 1 } : collection];
      }));
      return { ...account, memories, collections, deletedMemories: { ...account.deletedMemories, [roomId]: { revision: revision + 1, deletedAt: Number(clock()) } } };
    });
    if (!result.committed) fail('aborted', '回憶已更新，請重新載入。');
    const next = await transact(archiveRef(uid, roomId), (archive) => {
      if (closed(archive)) return archive;
      const operationId = archive?.operation?.id || operationIdFactory();
      return { summary: { state: 'deleting', operationId, saved: 0, total: 0 }, operation: { id: operationId } };
    });
    return { summary: next.value.summary };
  };

  const processTravelMemoryDeletion = async (uidInput, roomInput) => {
    const uid = validateMemberUid(uidInput); const roomId = validateRoomId(roomInput);
    let archive = await read(`travelMemoryArchives/${uid}/${roomId}`);
    if (!closed(archive) && await read(`personalTravel/${uid}/deletedMemories/${roomId}`)) {
      const result = await transact(archiveRef(uid, roomId), (value) => {
        if (closed(value)) return value;
        const operationId = value?.operation?.id || operationIdFactory();
        return { summary: { state: 'deleting', operationId, saved: 0, total: 0 }, operation: { id: operationId } };
      });
      archive = result.value;
    }
    if (!closed(archive)) return { ignored: true };
    const prefix = `travelMemories/${uid}/${roomId}/${operationKey(archive.operation.id)}/`;
    const [files, nextPage] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 100 });
    for (const file of files) {
      if (!file.name.startsWith(prefix)) fail('failed-precondition', '個人照片清理路徑不正確。');
      try { const [metadata] = await file.getMetadata(); await safeDelete(file.name, metadata.generation); }
      catch (error) { if (Number(error.code) !== 404) throw error; }
    }
    if (nextPage) return { retryRequired: true };
    const [remaining] = await bucket.getFiles({ prefix, autoPaginate: false, maxResults: 1 });
    if (remaining.length) return { retryRequired: true };
    const result = await transact(archiveRef(uid, roomId), (value) => {
      if (!closed(value) || value.operation.id !== archive.operation.id) return undefined;
      return { summary: { state: 'deleted', operationId: value.operation.id, saved: 0, total: 0 }, operation: { id: value.operation.id } };
    });
    return { summary: result.value?.summary };
  };

  const cleanupFinalizedMemoryObject = async (object) => {
    const parts = String(object?.name || '').split('/');
    if (parts.length !== 5 || parts[0] !== 'travelMemories' || !object?.generation) return { ignored: true };
    const [, uid, roomId, operationId, photoId] = parts;
    try { validateMemberUid(uid); validateRoomId(roomId); operationKey(operationId); } catch { return { ignored: true }; }
    const archive = await read(`travelMemoryArchives/${uid}/${roomId}`);
    if (!archive || closed(archive) || archive.operation?.id !== operationId || !archive.operation?.sources?.[photoId]) {
      await safeDelete(object.name, String(object.generation));
    }
    return { completed: true };
  };
  return { requestTravelMemoryPreservation, processTravelMemoryPreservation, deleteTravelMemory, processTravelMemoryDeletion, cleanupFinalizedMemoryObject };
}
