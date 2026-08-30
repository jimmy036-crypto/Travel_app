/* global process */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const FORBIDDEN_RTDB_KEY = /[.#$[\]/]/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const FIREBASE_DOWNLOAD_HOST = 'firebasestorage.googleapis.com';

const requireIdentifier = (value, label, maxLength) => {
  const normalized = String(value ?? '').trim();
  if (
    !normalized
    || normalized.length > maxLength
    || FORBIDDEN_RTDB_KEY.test(normalized)
    || RESERVED_KEYS.has(normalized)
  ) {
    throw new Error(`${label} 格式不正確。`);
  }
  return normalized;
};

const normalizeDisplayName = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized || normalized.length > 80) {
    throw new Error('owner displayName 必須為 1–80 個字元。');
  }
  return normalized;
};

const normalizePhotoUrl = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (normalized.length > 2048) throw new Error('owner photoURL 過長。');
  const parsed = new URL(normalized);
  if (parsed.protocol !== 'https:') throw new Error('owner photoURL 必須使用 HTTPS。');
  return parsed.toString();
};

export const normalizeOwnerMappings = (raw) => {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.owners) || raw.owners.length === 0) {
    throw new Error('mapping 必須是 version=1 且包含非空 owners 陣列。');
  }

  const seenRooms = new Set();
  return raw.owners.map((entry) => {
    const roomId = requireIdentifier(entry?.roomId, 'roomId', 160);
    if (seenRooms.has(roomId)) throw new Error(`mapping 含重複 roomId：${roomId}`);
    seenRooms.add(roomId);
    return {
      roomId,
      uid: requireIdentifier(entry?.uid, 'owner uid', 128),
      displayName: normalizeDisplayName(entry?.displayName),
      photoURL: normalizePhotoUrl(entry?.photoURL),
    };
  });
};

const readAclVersion = (record, label) => {
  if (record === null || record === undefined) return null;
  const value = Number(record?.aclVersion);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} 的 aclVersion 必須是正整數。`);
  }
  return value;
};

export const assertCompatibleState = ({
  mapping,
  room,
  access,
  userTrip,
  acl,
  unexpectedUserTripUids = [],
  unexpectedAclUids = [],
}) => {
  if (!room) throw new Error(`找不到 legacy room：${mapping.roomId}`);

  const metaOwnerUid = String(room?.meta?.ownerUid ?? '').trim();
  if (metaOwnerUid && metaOwnerUid !== mapping.uid) {
    throw new Error(`${mapping.roomId} 的 meta.ownerUid 已屬於其他 UID。`);
  }

  const accessOwnerUid = String(access?.ownerUid ?? '').trim();
  if (accessOwnerUid && accessOwnerUid !== mapping.uid) {
    throw new Error(`${mapping.roomId} 的 roomAccess.ownerUid 已屬於其他 UID。`);
  }

  const existingMember = access?.members?.[mapping.uid];
  const unexpectedMemberUids = Object.keys(access?.members || {})
    .filter((uid) => uid !== mapping.uid);
  if (unexpectedMemberUids.length > 0) {
    throw new Error(
      `${mapping.roomId} 含未列入 mapping 的 roomAccess member：${unexpectedMemberUids.join(', ')}`,
    );
  }
  if (unexpectedUserTripUids.length > 0) {
    throw new Error(
      `${mapping.roomId} 含其他 UID 的 userTrips 索引：${unexpectedUserTripUids.join(', ')}`,
    );
  }
  if (unexpectedAclUids.length > 0) {
    throw new Error(
      `${mapping.roomId} 含未列入 mapping 的 Firestore ACL：${unexpectedAclUids.join(', ')}`,
    );
  }
  if (
    existingMember
    && (
      existingMember.uid !== mapping.uid
      || existingMember.role !== 'owner'
      || existingMember.status !== 'active'
    )
  ) {
    throw new Error(`${mapping.roomId} 的 owner member 記錄與 mapping 衝突。`);
  }
  readAclVersion(existingMember, `${mapping.roomId} owner member`);

  if (userTrip !== null) {
    const isActiveOwner = userTrip?.role === 'owner' && userTrip?.status === 'active';
    const isRollbackTombstone = !existingMember
      && userTrip?.role === 'owner'
      && userTrip?.status === 'removed';
    if (
      (!isActiveOwner && !isRollbackTombstone)
      || readAclVersion(userTrip, `${mapping.roomId} userTrips`) === null
    ) {
      throw new Error(`${mapping.roomId} 的 userTrips 索引與 owner mapping 衝突。`);
    }
  }

  if (acl) {
    const isActiveOwner = acl.uid === mapping.uid
      && acl.role === 'owner'
      && acl.status === 'active';
    const isRollbackTombstone = !existingMember
      && acl.uid === mapping.uid
      && acl.role === 'owner'
      && acl.status === 'removed';
    if (
      (!isActiveOwner && !isRollbackTombstone)
      || readAclVersion(acl, `${mapping.roomId} Firestore ACL`) === null
    ) {
      throw new Error(`${mapping.roomId} 的 Firestore ACL 與 mapping 衝突。`);
    }
  }
};

export const buildMigrationUpdates = ({ mapping, room, access, userTrip = null, acl = null, now }) => {
  const existingMemberRecord = access?.members?.[mapping.uid];
  const existingMember = existingMemberRecord || {};
  const createdAt = Number(access?.createdAt) || now;
  const joinedAt = Number(existingMember.joinedAt) || now;
  const securityMigratedAt = Number(room?.meta?.securityMigratedAt) || now;
  const previousVersion = Math.max(
    1,
    readAclVersion(existingMemberRecord, `${mapping.roomId} owner member`) || 0,
    readAclVersion(userTrip, `${mapping.roomId} userTrips`) || 0,
    readAclVersion(acl, `${mapping.roomId} Firestore ACL`) || 0,
  );
  const hasRollbackTombstone = userTrip?.status === 'removed' || acl?.status === 'removed';
  const aclVersion = hasRollbackTombstone ? previousVersion + 1 : previousVersion;

  return {
    [`rooms/${mapping.roomId}/meta/ownerUid`]: mapping.uid,
    [`rooms/${mapping.roomId}/meta/securityMigratedAt`]: securityMigratedAt,
    [`roomAccess/${mapping.roomId}/ownerUid`]: mapping.uid,
    [`roomAccess/${mapping.roomId}/createdAt`]: createdAt,
    [`roomAccess/${mapping.roomId}/state`]: 'ready',
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/uid`]: mapping.uid,
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/displayName`]: mapping.displayName,
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/photoURL`]: mapping.photoURL,
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/role`]: 'owner',
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/status`]: 'active',
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/aclVersion`]: aclVersion,
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/joinedAt`]: joinedAt,
    [`roomAccess/${mapping.roomId}/members/${mapping.uid}/updatedAt`]: now,
    [`userTrips/${mapping.uid}/${mapping.roomId}`]: {
      role: 'owner',
      status: 'active',
      aclVersion,
      updatedAt: now,
    },
    [`roomReservations/${mapping.roomId}`]: {
      roomId: mapping.roomId,
      creationId: `legacy-migration-${mapping.roomId}`,
      createdByUid: mapping.uid,
      createdAt,
      migrated: true,
    },
  };
};

export const validateDatabaseTargetUrl = (databaseURL, projectId) => {
  const parsedDatabaseUrl = new URL(databaseURL);
  if (parsedDatabaseUrl.protocol !== 'https:') {
    throw new Error('--database-url 必須使用 HTTPS。');
  }
  if (
    parsedDatabaseUrl.username
    || parsedDatabaseUrl.password
    || parsedDatabaseUrl.port
    || parsedDatabaseUrl.pathname !== '/'
    || parsedDatabaseUrl.search
    || parsedDatabaseUrl.hash
  ) {
    throw new Error('--database-url 必須是無 credentials、port、path、query、hash 的資料庫根 URL。');
  }
  const hostname = parsedDatabaseUrl.hostname.toLowerCase();
  const normalizedProjectId = String(projectId || '').trim().toLowerCase();
  const allowedHostnames = new Set([
    `${normalizedProjectId}.firebaseio.com`,
    `${normalizedProjectId}-default-rtdb.firebaseio.com`,
  ]);
  const regionalDefaultPattern = new RegExp(
    `^${normalizedProjectId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-default-rtdb\\.[a-z0-9-]+\\.firebasedatabase\\.app$`,
    'u',
  );
  if (!normalizedProjectId || (!allowedHostnames.has(hostname) && !regionalDefaultPattern.test(hostname))) {
    throw new Error('--database-url hostname 與 --project 不一致。');
  }
  return parsedDatabaseUrl;
};

export const validateStorageBucket = (storageBucket, projectId) => {
  const normalizedBucket = String(storageBucket ?? '').trim();
  const normalizedProjectId = String(projectId ?? '').trim();
  const allowedBuckets = new Set([
    `${normalizedProjectId}.appspot.com`,
    `${normalizedProjectId}.firebasestorage.app`,
  ]);
  if (
    !normalizedProjectId
    || !normalizedBucket
    || normalizedBucket !== normalizedBucket.toLowerCase()
    || !allowedBuckets.has(normalizedBucket)
  ) {
    throw new Error('--storage-bucket 必須是 --project 對應的 Firebase default bucket 名稱。');
  }
  return normalizedBucket;
};

export const parseTokenizedFirebaseDownloadUrl = (value) => {
  if (typeof value !== 'string' || !value.includes('token=')) return null;

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== FIREBASE_DOWNLOAD_HOST) return null;
  if (!parsed.searchParams.has('token')) return null;
  if (
    parsed.protocol !== 'https:'
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.hash
  ) {
    throw new Error('偵測到格式不受支援的 Firebase download URL。');
  }

  const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/u);
  if (!match) throw new Error('偵測到格式不受支援的 Firebase download URL。');

  let bucket;
  let objectName;
  try {
    bucket = decodeURIComponent(match[1]);
    objectName = decodeURIComponent(match[2]);
  } catch {
    throw new Error('偵測到無法解碼的 Firebase download URL。');
  }
  if (
    !bucket
    || !objectName
    || objectName.startsWith('/')
    || objectName.includes('\0')
    || objectName.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('偵測到不安全的 Firebase Storage object path。');
  }
  const tokens = parsed.searchParams.getAll('token').flatMap(
    (tokenList) => tokenList.split(',').map((token) => token.trim()).filter(Boolean),
  );
  if (tokens.length === 0) {
    throw new Error('偵測到缺少有效 token 的 Firebase download URL。');
  }
  return { bucket, objectName };
};

export const buildLegacyDownloadUrlPlan = ({ rooms, targetBucket }) => {
  const updates = {};
  const legacyUrls = [];
  let tokenizedUrlCount = 0;

  const visit = (value, pathSegments, roomId, parent) => {
    if (typeof value === 'string') {
      const parsed = parseTokenizedFirebaseDownloadUrl(value);
      if (!parsed) return;
      tokenizedUrlCount += 1;
      const fieldName = pathSegments.at(-1);
      const safeLocation = pathSegments.join('/');
      if (parsed.bucket !== targetBucket) {
        throw new Error(`rooms 含指向非 target bucket 的 Firebase download URL（位置：${safeLocation}）。`);
      }
      if (fieldName !== 'url' || !parent || Array.isArray(parent)) {
        throw new Error(`Firebase download URL 不在可安全轉換的 url 欄位（位置：${safeLocation}）。`);
      }
      if (!parsed.objectName.startsWith(`rooms/${roomId}/`)) {
        throw new Error(`Firebase download URL 的 object path 與 room 不一致（位置：${safeLocation}）。`);
      }
      const existingStoragePath = String(parent.storagePath ?? '').trim();
      if (existingStoragePath && existingStoragePath !== parsed.objectName) {
        throw new Error(`Firebase download URL 與既有 storagePath 衝突（位置：${safeLocation}）。`);
      }
      const parentPath = pathSegments.slice(0, -1).join('/');
      updates[`${parentPath}/storagePath`] = parsed.objectName;
      updates[safeLocation] = '';
      legacyUrls.push(value);
      return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      visit(child, [...pathSegments, key], roomId, value);
    }
  };

  for (const [roomId, room] of Object.entries(rooms || {})) {
    visit(room, ['rooms', roomId], roomId, rooms);
  }

  return { updates, legacyUrls, tokenizedUrlCount };
};

export const readFirebaseStorageDownloadTokens = (fileMetadata) => {
  const rawTokens = fileMetadata?.metadata?.firebaseStorageDownloadTokens;
  if (rawTokens === null || rawTokens === undefined || rawTokens === '') return [];
  if (typeof rawTokens !== 'string') {
    throw new Error('Storage object 的 firebaseStorageDownloadTokens metadata 格式不正確。');
  }
  const tokens = rawTokens.split(',').map((token) => token.trim()).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error('Storage object 的 firebaseStorageDownloadTokens metadata 格式不正確。');
  }
  return tokens;
};

const buildFirebaseDownloadUrl = ({ bucketName, objectName, token }) => (
  `https://${FIREBASE_DOWNLOAD_HOST}/v0/b/${encodeURIComponent(bucketName)}`
  + `/o/${encodeURIComponent(objectName)}?alt=media&token=${encodeURIComponent(token)}`
);

export const assertAnonymousLegacyUrlsDenied = async (legacyUrls, fetchImpl = globalThis.fetch) => {
  const uniqueUrls = [...new Set(legacyUrls)];
  let reachableCount = 0;
  for (const legacyUrl of uniqueUrls) {
    let response;
    try {
      response = await fetchImpl(legacyUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error('無法完成舊 download URL 的匿名撤銷驗證；未輸出 URL 或 token。');
    }
    if (response.status >= 200 && response.status < 300) reachableCount += 1;
    await response.body?.cancel?.().catch(() => {});
  }
  if (reachableCount > 0) {
    throw new Error(`仍有 ${reachableCount} 個舊 download URL 可匿名取得 2xx 回應。`);
  }
};

export const scanStorageDownloadTokens = async (bucket) => {
  const [files] = await bucket.getFiles({ prefix: 'rooms/' });
  const tokenizedObjects = [];
  const roomIds = new Set();
  let tokenCount = 0;
  let malformedObjectCount = 0;
  for (const file of files) {
    const segments = String(file.name || '').split('/');
    if (segments.length < 3 || segments[0] !== 'rooms' || !segments[1]) {
      malformedObjectCount += 1;
    } else {
      roomIds.add(requireIdentifier(segments[1], 'Storage roomId', 160));
    }
    const [metadata] = await file.getMetadata();
    const tokens = readFirebaseStorageDownloadTokens(metadata);
    if (tokens.length === 0) continue;
    tokenCount += tokens.length;
    tokenizedObjects.push({ file, metadata, tokens });
  }
  return {
    objectCount: files.length,
    roomIds: [...roomIds].sort(),
    malformedObjectCount,
    tokenCount,
    tokenizedObjects,
  };
};

export const findUnreservedStorageRoomIds = ({
  storageRoomIds,
  productionRoomIds,
  reservationRoomIds,
}) => {
  const protectedRoomIds = new Set([
    ...(productionRoomIds || []),
    ...(reservationRoomIds || []),
  ]);
  return [...new Set(storageRoomIds || [])]
    .filter((roomId) => !protectedRoomIds.has(roomId))
    .sort();
};

export const revokeStorageDownloadTokens = async ({ bucketName, tokenizedObjects }) => {
  const legacyUrls = [];
  for (const { file, metadata, tokens } of tokenizedObjects) {
    for (const token of tokens) {
      legacyUrls.push(buildFirebaseDownloadUrl({
        bucketName,
        objectName: file.name,
        token,
      }));
    }
    await file.setMetadata({
      metadata: {
        ...(metadata.metadata || {}),
        firebaseStorageDownloadTokens: null,
      },
    }, {
      ifMetagenerationMatch: metadata.metageneration,
    });
  }
  return legacyUrls;
};

export const parseCli = (args = process.argv.slice(2)) => {
  const { values } = parseArgs({
    args,
    options: {
      mapping: { type: 'string' },
      project: { type: 'string' },
      'database-url': { type: 'string' },
      'storage-bucket': { type: 'string' },
      apply: { type: 'boolean', default: false },
      'confirm-project': { type: 'string' },
      'confirm-storage-bucket': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });

  const mappingPath = String(values.mapping ?? '').trim();
  const projectId = String(values.project ?? '').trim();
  const databaseURL = String(values['database-url'] ?? '').trim();
  const storageBucket = String(values['storage-bucket'] ?? '').trim();
  if (!mappingPath || !projectId || !databaseURL || !storageBucket) {
    throw new Error('必須提供 --mapping、--project、--database-url 與 --storage-bucket。');
  }
  const parsedDatabaseUrl = validateDatabaseTargetUrl(databaseURL, projectId);
  const validatedStorageBucket = validateStorageBucket(storageBucket, projectId);
  if (values.apply && values['confirm-project'] !== projectId) {
    throw new Error('正式寫入時，--confirm-project 必須與 --project 完全相同。');
  }
  if (values.apply && values['confirm-storage-bucket'] !== validatedStorageBucket) {
    throw new Error('正式寫入時，--confirm-storage-bucket 必須與 --storage-bucket 完全相同。');
  }
  return {
    mappingPath: resolve(mappingPath),
    projectId,
    databaseURL: parsedDatabaseUrl.toString(),
    storageBucket: validatedStorageBucket,
    apply: values.apply,
  };
};

const semanticMember = (record, { includeUid }) => {
  if (record === null || record === undefined) return null;
  const normalized = {
    role: String(record?.role || ''),
    status: String(record?.status || ''),
    aclVersion: Number(record?.aclVersion),
  };
  if (includeUid) normalized.uid = String(record?.uid || '');
  return normalized;
};

const isRemovedTombstoneAtLeast = (record, minimumVersion) => (
  record?.status === 'removed'
  && Number.isSafeInteger(Number(record?.aclVersion))
  && Number(record.aclVersion) >= minimumVersion
);

const assertRestoredMirror = ({
  roomId,
  label,
  previous,
  current,
  includeUid = false,
  expectedUid = '',
}) => {
  const previousSemantic = semanticMember(previous, { includeUid });
  const currentSemantic = semanticMember(current, { includeUid });
  if (previousSemantic === null) {
    if (
      currentSemantic !== null
      && (
        !isRemovedTombstoneAtLeast(currentSemantic, 1)
        || (includeUid && currentSemantic.uid !== expectedUid)
      )
    ) {
      throw new Error(`${roomId} rollback 後 ${label} 意外保留有效授權。`);
    }
    return;
  }

  const isExactRestore = Object.entries(previousSemantic)
    .every(([key, value]) => currentSemantic?.[key] === value);
  if (isExactRestore) return;

  // A delayed deletion trigger may replace an earlier active mirror with a
  // higher-version removed tombstone. That is not an exact data rollback, but
  // it is the only safe alternate result because it cannot re-grant access.
  if (
    isRemovedTombstoneAtLeast(currentSemantic, previousSemantic.aclVersion)
    && (!includeUid || currentSemantic.uid === previousSemantic.uid)
  ) return;

  throw new Error(`${roomId} rollback 後 ${label} 未恢復且不是 fail-closed tombstone。`);
};

export const assertRollbackMirrorsFailClosed = ({
  roomId,
  uid,
  previousMember,
  previousUserTrip,
  previousAcl,
  currentMember,
  currentUserTrip,
  currentAcl,
}) => {
  const expectedMember = semanticMember(previousMember, { includeUid: true });
  const actualMember = semanticMember(currentMember, { includeUid: true });
  const memberRestored = expectedMember === null
    ? actualMember === null
    : Object.entries(expectedMember).every(([key, value]) => actualMember?.[key] === value);
  if (!memberRestored) {
    throw new Error(`${roomId} rollback 後 canonical membership 未完整恢復。`);
  }
  if (actualMember && actualMember.uid !== uid) {
    throw new Error(`${roomId} rollback 後 canonical membership UID 不一致。`);
  }

  assertRestoredMirror({
    roomId,
    label: 'userTrips mirror',
    previous: previousUserTrip,
    current: currentUserTrip,
  });
  assertRestoredMirror({
    roomId,
    label: 'Firestore ACL mirror',
    previous: previousAcl,
    current: currentAcl,
    includeUid: true,
    expectedUid: uid,
  });
};

const inspectEntry = async ({
  database,
  firestore,
  mapping,
  userTripsRoot,
  aclUidsByRoom,
}) => {
  const [
    roomSnapshot,
    accessSnapshot,
    userTripSnapshot,
    reservationSnapshot,
    aclSnapshot,
  ] = await Promise.all([
    database.ref(`rooms/${mapping.roomId}`).get(),
    database.ref(`roomAccess/${mapping.roomId}`).get(),
    database.ref(`userTrips/${mapping.uid}/${mapping.roomId}`).get(),
    database.ref(`roomReservations/${mapping.roomId}`).get(),
    firestore.doc(`tripAccess/${mapping.roomId}/members/${mapping.uid}`).get(),
  ]);
  const state = {
    mapping,
    room: roomSnapshot.val(),
    access: accessSnapshot.val(),
    userTrip: userTripSnapshot.val(),
    reservation: reservationSnapshot.val(),
    acl: aclSnapshot.exists ? aclSnapshot.data() : null,
    previousAcl: aclSnapshot.exists ? aclSnapshot.data() : null,
    unexpectedUserTripUids: Object.entries(userTripsRoot || {})
      .filter(([uid, trips]) => uid !== mapping.uid && trips?.[mapping.roomId] !== undefined)
      .map(([uid]) => uid),
    unexpectedAclUids: [...(aclUidsByRoom.get(mapping.roomId) || [])]
      .filter((uid) => uid !== mapping.uid),
  };
  assertCompatibleState(state);
  return state;
};

const verifyEntry = async ({ database, firestore, mapping }) => {
  const [roomSnapshot, accessSnapshot, userTripSnapshot, reservationSnapshot, aclSnapshot] = await Promise.all([
    database.ref(`rooms/${mapping.roomId}`).get(),
    database.ref(`roomAccess/${mapping.roomId}`).get(),
    database.ref(`userTrips/${mapping.uid}/${mapping.roomId}`).get(),
    database.ref(`roomReservations/${mapping.roomId}`).get(),
    firestore.doc(`tripAccess/${mapping.roomId}/members/${mapping.uid}`).get(),
  ]);
  const room = roomSnapshot.val();
  const access = accessSnapshot.val();
  const acl = aclSnapshot.exists ? aclSnapshot.data() : null;
  if (
    room?.meta?.ownerUid !== mapping.uid
    || access?.ownerUid !== mapping.uid
    || access?.members?.[mapping.uid]?.role !== 'owner'
    || access?.members?.[mapping.uid]?.status !== 'active'
    || userTripSnapshot.val()?.role !== 'owner'
    || userTripSnapshot.val()?.status !== 'active'
    || Number(userTripSnapshot.val()?.aclVersion) !== Number(access?.members?.[mapping.uid]?.aclVersion)
    || acl?.uid !== mapping.uid
    || acl?.role !== 'owner'
    || acl?.status !== 'active'
    || Number(acl?.aclVersion) !== Number(access?.members?.[mapping.uid]?.aclVersion)
    || reservationSnapshot.val()?.roomId !== mapping.roomId
    || reservationSnapshot.val()?.createdByUid !== mapping.uid
  ) {
    throw new Error(`${mapping.roomId} 寫入後驗證失敗。`);
  }
};

const verifyRollbackEntry = async ({ database, firestore, plan }) => {
  const { mapping } = plan;
  const [accessSnapshot, userTripSnapshot, aclSnapshot] = await Promise.all([
    database.ref(`roomAccess/${mapping.roomId}`).get(),
    database.ref(`userTrips/${mapping.uid}/${mapping.roomId}`).get(),
    firestore.doc(`tripAccess/${mapping.roomId}/members/${mapping.uid}`).get(),
  ]);
  assertRollbackMirrorsFailClosed({
    roomId: mapping.roomId,
    uid: mapping.uid,
    previousMember: plan.access?.members?.[mapping.uid] ?? null,
    previousUserTrip: plan.userTrip,
    previousAcl: plan.previousAcl,
    currentMember: accessSnapshot.val()?.members?.[mapping.uid] ?? null,
    currentUserTrip: userTripSnapshot.val(),
    currentAcl: aclSnapshot.exists ? aclSnapshot.data() : null,
  });
};

const run = async () => {
  const options = parseCli();
  const rawMapping = JSON.parse(await readFile(options.mappingPath, 'utf8'));
  const mappings = normalizeOwnerMappings(rawMapping);
  const app = getApps()[0] || initializeApp({
    credential: applicationDefault(),
    projectId: options.projectId,
    databaseURL: options.databaseURL,
    storageBucket: options.storageBucket,
  });
  const database = getDatabase(app);
  const firestore = getFirestore(app);
  const auth = getAuth(app);
  const bucket = getStorage(app).bucket(options.storageBucket);

  const [bucketMetadata] = await bucket.getMetadata();
  if (bucket.name !== options.storageBucket || bucketMetadata.name !== options.storageBucket) {
    throw new Error('Storage API 回傳的 bucket 與 --storage-bucket 不一致。');
  }

  console.log(`Target project: ${options.projectId}`);
  console.log(`Target Storage bucket: ${options.storageBucket}`);
  console.log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Rooms in mapping: ${mappings.length}`);

  const [
    productionRoomsSnapshot,
    accessRootSnapshot,
    userTripsRootSnapshot,
    userQuotasRootSnapshot,
    reservationsRootSnapshot,
    aclGroupSnapshot,
  ] = await Promise.all([
    database.ref('rooms').get(),
    database.ref('roomAccess').get(),
    database.ref('userTrips').get(),
    database.ref('userQuotas').get(),
    database.ref('roomReservations').get(),
    firestore.collectionGroup('members').get(),
  ]);
  const productionRooms = productionRoomsSnapshot.val() || {};
  const accessRoot = accessRootSnapshot.val() || {};
  const userTripsRoot = userTripsRootSnapshot.val() || {};
  const userQuotasRoot = userQuotasRootSnapshot.val() || {};
  const reservationsRoot = reservationsRootSnapshot.val() || {};
  const productionRoomIds = Object.keys(productionRooms).sort();
  const mappedRoomIds = mappings.map(({ roomId }) => roomId).sort();
  const missingMappings = productionRoomIds.filter((roomId) => !mappedRoomIds.includes(roomId));
  if (missingMappings.length > 0) {
    throw new Error(`mapping 遺漏 production room：${missingMappings.join(', ')}`);
  }
  const orphanAccessRooms = Object.keys(accessRoot)
    .filter((roomId) => !productionRoomIds.includes(roomId));
  if (orphanAccessRooms.length > 0) {
    throw new Error(`roomAccess 含沒有 production room 的項目：${orphanAccessRooms.join(', ')}`);
  }

  const aclUidsByRoom = new Map();
  const orphanAclPaths = [];
  for (const document of aclGroupSnapshot.docs) {
    const segments = document.ref.path.split('/');
    if (segments.length !== 4 || segments[0] !== 'tripAccess' || segments[2] !== 'members') {
      continue;
    }
    const [, roomId, , uid] = segments;
    if (!mappedRoomIds.includes(roomId)) {
      orphanAclPaths.push(document.ref.path);
      continue;
    }
    const uids = aclUidsByRoom.get(roomId) || new Set();
    uids.add(uid);
    aclUidsByRoom.set(roomId, uids);
  }
  if (orphanAclPaths.length > 0) {
    throw new Error(`Firestore 含沒有 mapping 的 tripAccess ACL：${orphanAclPaths.join(', ')}`);
  }

  const legacyUrlPlan = buildLegacyDownloadUrlPlan({
    rooms: productionRooms,
    targetBucket: options.storageBucket,
  });
  const storageTokenInventory = await scanStorageDownloadTokens(bucket);
  const orphanStorageRoomIds = findUnreservedStorageRoomIds({
    storageRoomIds: storageTokenInventory.roomIds,
    productionRoomIds,
    reservationRoomIds: Object.keys(reservationsRoot),
  });
  if (storageTokenInventory.malformedObjectCount > 0) {
    throw new Error(
      `Storage rooms/** 含 ${storageTokenInventory.malformedObjectCount} 個無法安全歸屬旅程的物件。`,
    );
  }
  if (orphanStorageRoomIds.length > 0) {
    throw new Error(
      `Storage 含未受 room/roomReservations 保護的孤兒 namespace：${orphanStorageRoomIds.join(', ')}`,
    );
  }
  console.log(`RTDB tokenized Firebase URL count: ${legacyUrlPlan.tokenizedUrlCount}`);
  console.log(`Storage rooms/** object count: ${storageTokenInventory.objectCount}`);
  console.log(`Storage protected room namespace count: ${storageTokenInventory.roomIds.length}`);
  console.log(`Storage objects with download tokens: ${storageTokenInventory.tokenizedObjects.length}`);
  console.log(`Storage download token count: ${storageTokenInventory.tokenCount}`);

  const uniqueOwnerUids = [...new Set(mappings.map(({ uid }) => uid))];
  for (const uid of uniqueOwnerUids) {
    const user = await auth.getUser(uid);
    const hasGoogleProvider = user.providerData.some(
      ({ providerId }) => providerId === 'google.com',
    );
    if (user.disabled || !hasGoogleProvider) {
      throw new Error(`UID ${uid} 不存在有效的 Google provider，或帳號已停用。`);
    }
  }

  // Validate every room before the first write so a bad mapping cannot create
  // a partially migrated batch.
  const plans = [];
  for (const mapping of mappings) {
    const state = await inspectEntry({
      database,
      firestore,
      mapping,
      userTripsRoot,
      aclUidsByRoom,
    });
    plans.push({
      ...state,
      updates: buildMigrationUpdates({
        mapping,
        room: state.room,
        access: state.access,
        userTrip: state.userTrip,
        acl: state.acl,
        now: Date.now(),
      }),
    });
    console.log(`[ready] ${mapping.roomId} -> ${mapping.uid}`);
  }

  if (!options.apply) {
    console.log('Dry run complete. No Firebase data was changed.');
    return;
  }

  const restorePlan = async (plan) => {
    const aclRef = firestore.doc(`tripAccess/${plan.mapping.roomId}/members/${plan.mapping.uid}`);
    const rollbackResults = await Promise.allSettled([
      database.ref().update({
        [`rooms/${plan.mapping.roomId}`]: plan.room,
        [`roomAccess/${plan.mapping.roomId}`]: plan.access,
        [`userTrips/${plan.mapping.uid}/${plan.mapping.roomId}`]: plan.userTrip,
        [`roomReservations/${plan.mapping.roomId}`]: plan.reservation,
      }),
      plan.previousAcl ? aclRef.set(plan.previousAcl) : aclRef.delete(),
    ]);
    if (rollbackResults.some(({ status }) => status === 'rejected')) {
      throw new Error(`${plan.mapping.roomId} rollback 未完整成功，請保持維護模式並人工檢查。`);
    }
    await verifyRollbackEntry({ database, firestore, plan });
  };

  const appliedPlans = [];
  const ownerUids = [...new Set(mappings.map(({ uid }) => uid))];
  const quotaRollback = Object.fromEntries(ownerUids.map((uid) => [
    `userQuotas/${uid}/createTrip`,
    userQuotasRoot?.[uid]?.createTrip ?? null,
  ]));
  try {
    for (const plan of plans) {
      const aclRef = firestore.doc(`tripAccess/${plan.mapping.roomId}/members/${plan.mapping.uid}`);
      appliedPlans.push(plan);
      await aclRef.set({
        uid: plan.mapping.uid,
        role: 'owner',
        status: 'active',
        aclVersion: Number(
          plan.updates[`roomAccess/${plan.mapping.roomId}/members/${plan.mapping.uid}/aclVersion`],
        ),
        updatedAt: new Date(),
      });
      await database.ref().update(plan.updates);
      await verifyEntry({ database, firestore, mapping: plan.mapping });
      console.log(`[migrated] ${plan.mapping.roomId}`);
    }

    const ownerTripCounts = mappings.reduce((counts, { uid }) => {
      counts.set(uid, (counts.get(uid) || 0) + 1);
      return counts;
    }, new Map());
    const quotaUpdates = {};
    const quotaUpdatedAt = Date.now();
    for (const [uid, migratedTripCount] of ownerTripCounts) {
      const existing = userQuotasRoot?.[uid]?.createTrip || {};
      quotaUpdates[`userQuotas/${uid}/createTrip`] = {
        ...existing,
        totalCount: Math.max(Number(existing.totalCount) || 0, migratedTripCount),
        updatedAt: quotaUpdatedAt,
      };
    }
    await database.ref().update(quotaUpdates);
    for (const [uid, migratedTripCount] of ownerTripCounts) {
      const quota = (await database.ref(`userQuotas/${uid}/createTrip`).get()).val();
      if (Number(quota?.totalCount) < migratedTripCount) {
        throw new Error(`UID ${uid} 的 createTrip quota baseline 驗證失敗。`);
      }
    }
  } catch (error) {
    const rollbackFailures = [];
    try {
      await database.ref().update(quotaRollback);
    } catch (rollbackError) {
      rollbackFailures.push(`quota: ${rollbackError.message}`);
    }
    for (const plan of [...appliedPlans].reverse()) {
      try {
        await restorePlan(plan);
      } catch (rollbackError) {
        rollbackFailures.push(rollbackError.message);
      }
    }
    if (rollbackFailures.length > 0) {
      throw new Error(`${error.message}；此外 rollback 失敗：${rollbackFailures.join('；')}`);
    }
    throw error;
  }

  // Token revocation is intentionally a forward-only security cleanup. If this
  // phase is interrupted, keep maintenance mode and strict Rules in place, then
  // rerun the same confirmed command. Restoring capability tokens would reopen
  // anonymous access and is therefore not part of automatic rollback.
  const metadataLegacyUrls = await revokeStorageDownloadTokens({
    bucketName: options.storageBucket,
    tokenizedObjects: storageTokenInventory.tokenizedObjects,
  });
  // Keep RTDB legacy URLs available as a retry-safe verification journal until
  // every known capability URL has been denied anonymously. They are scrubbed
  // only after the revocation check succeeds.
  await assertAnonymousLegacyUrlsDenied([
    ...legacyUrlPlan.legacyUrls,
    ...metadataLegacyUrls,
  ]);
  if (Object.keys(legacyUrlPlan.updates).length > 0) {
    await database.ref().update(legacyUrlPlan.updates);
  }

  const [
    verifiedRoomsSnapshot,
    verifiedReservationsSnapshot,
    verifiedStorageInventory,
  ] = await Promise.all([
    database.ref('rooms').get(),
    database.ref('roomReservations').get(),
    scanStorageDownloadTokens(bucket),
  ]);
  const verifiedUrlPlan = buildLegacyDownloadUrlPlan({
    rooms: verifiedRoomsSnapshot.val() || {},
    targetBucket: options.storageBucket,
  });
  if (
    verifiedUrlPlan.tokenizedUrlCount !== 0
    || verifiedStorageInventory.tokenCount !== 0
    || verifiedStorageInventory.malformedObjectCount !== 0
  ) {
    throw new Error('download token 清理後重掃未歸零；請維持維護模式並重跑 migration。');
  }
  const verifiedOrphanStorageRoomIds = findUnreservedStorageRoomIds({
    storageRoomIds: verifiedStorageInventory.roomIds,
    productionRoomIds: Object.keys(verifiedRoomsSnapshot.val() || {}),
    reservationRoomIds: Object.keys(verifiedReservationsSnapshot.val() || {}),
  });
  if (verifiedOrphanStorageRoomIds.length > 0) {
    throw new Error('Storage namespace 保留驗證失敗；請維持維護模式並人工檢查。');
  }

  console.log(`Migration complete and verified for ${plans.length} room(s).`);
  console.log('Download token release gate passed: inventories are zero and legacy URLs are denied.');
};

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  run().catch((error) => {
    console.error(`Migration failed: ${error.message}`);
    process.exitCode = 1;
  });
}
