/* global process */

import { Buffer } from 'node:buffer';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

import {
  normalizeOwnerMappings,
  validateDatabaseTargetUrl,
} from './migrate-legacy-trip-access.js';

const MANIFEST_VERSION = 1;
const MANIFEST_OPERATION = 'legacy-creation-id-repair';
const MANIFEST_BASENAME_PATTERN = /^legacy-creation-id-repair.*\.local\.json$/u;
const SHA256_PATTERN = /^[a-f\d]{64}$/u;
const MAX_ROOM_COUNT = 500;
const MAINTENANCE_CONFIRMATION = 'production-paused-users-inactive';
const FORBIDDEN_RTDB_KEY = /[.#$[\]/]/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const trimText = (value) => String(value ?? '').trim();
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const snapshotValue = (snapshot) => (snapshot?.exists?.() === false ? null : snapshot?.val?.());

const assertExactKeys = (value, expectedKeys, label) => {
  if (!isRecord(value)) throw new Error(`${label} 格式不正確。`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 含未預期欄位。`);
  }
};

const requireCount = (value, label, { allowZero = false } = {}) => {
  const count = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(count) || count < minimum || count > MAX_ROOM_COUNT) {
    throw new Error(`${label} 必須是 ${minimum}–${MAX_ROOM_COUNT} 的整數。`);
  }
  return count;
};

const requireManifestPath = (value) => {
  const absolutePath = resolve(trimText(value));
  if (!MANIFEST_BASENAME_PATTERN.test(basename(absolutePath))) {
    throw new Error('manifest 檔名必須符合 legacy-creation-id-repair*.local.json。');
  }
  return absolutePath;
};

const requireIdentifier = (value, label, maxLength) => {
  const normalized = trimText(value);
  if (
    normalized !== value
    || !normalized
    || normalized.length > maxLength
    || FORBIDDEN_RTDB_KEY.test(normalized)
    || RESERVED_KEYS.has(normalized)
  ) {
    throw new Error(`${label} identifier 格式不正確。`);
  }
  return normalized;
};

const requireInvocationId = (value) => {
  const invocationId = trimText(value);
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(invocationId)) {
    throw new Error('apply invocation ID 格式不正確。');
  }
  return invocationId;
};

const requirePositiveTimestamp = (value, label) => {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp < 1) {
    throw new Error(`${label} timestamp 格式不正確。`);
  }
  return timestamp;
};

const requireAclVersion = (value, label) => {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`${label} aclVersion 格式不正確。`);
  }
  return version;
};

const readCreationId = (value, label) => {
  if (value === null || value === undefined) return '';
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 200
    || value.trim() !== value
  ) {
    throw new Error(`${label} creationId 格式不正確。`);
  }
  return value;
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

const equalSortedStrings = (left, right) => {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const fingerprintFor = ({ room, access, ownerMember, reservation, userTrip, acl }) => ({
  roomOwnerUid: room.meta.ownerUid,
  accessOwnerUid: access.ownerUid,
  accessCreatedAt: requirePositiveTimestamp(access.createdAt, 'roomAccess'),
  memberUid: ownerMember.uid,
  memberAclVersion: requireAclVersion(ownerMember.aclVersion, 'roomAccess owner'),
  reservationCreatedAt: requirePositiveTimestamp(reservation.createdAt, 'roomReservations'),
  userTripAclVersion: requireAclVersion(userTrip.aclVersion, 'userTrips owner'),
  firestoreAclVersion: requireAclVersion(acl.aclVersion, 'Firestore owner ACL'),
});

const assertSameFingerprint = (actual, expected, label) => {
  const keys = [
    'roomOwnerUid',
    'accessOwnerUid',
    'accessCreatedAt',
    'memberUid',
    'memberAclVersion',
    'reservationCreatedAt',
    'userTripAclVersion',
    'firestoreAclVersion',
  ];
  assertExactKeys(actual, keys, `${label} actual fingerprint`);
  assertExactKeys(expected, keys, `${label} expected fingerprint`);
  if (keys.some((key) => actual[key] !== expected[key])) {
    throw new Error(`${label} canonical fingerprint 已變更。`);
  }
};

const repairLeaseMatches = (actual, expected) => (
  isRecord(actual)
  && isRecord(expected)
  && actual.version === expected.version
  && actual.operation === expected.operation
  && actual.runId === expected.runId
  && actual.manifestSha256 === expected.manifestSha256
  && actual.roomId === expected.roomId
  && actual.phase === expected.phase
  && actual.invocationId === expected.invocationId
  && actual.acquiredAt === expected.acquiredAt
);

const assertCanonicalMembers = (members, label) => {
  if (!isRecord(members)) throw new Error(`${label} members 不完整。`);
  for (const [uid, member] of Object.entries(members)) {
    if (
      !isRecord(member)
      || member.uid !== uid
      || !['owner', 'editor'].includes(member.role)
      || !['active', 'removed'].includes(member.status)
    ) {
      throw new Error(`${label} member identity/schema 不一致。`);
    }
    requireAclVersion(member.aclVersion, `${label} member`);
  }
};

export const validateCreationIdRepairState = ({
  mapping,
  state,
  label = 'entry',
  allowedRepairLease = null,
}) => {
  const {
    room,
    access,
    userTrip,
    reservation,
    acl,
    deletionGuard,
    deletionJournal,
    deletionWorker,
    ticketRepairLease,
  } = state;
  if (!isRecord(room) || room?.meta?.ownerUid !== mapping.uid) {
    throw new Error(`${label} rooms owner 不一致。`);
  }
  if (
    !isRecord(access)
    || access.ownerUid !== mapping.uid
    || access.state !== 'ready'
    || access.deletionId !== undefined
  ) {
    throw new Error(`${label} roomAccess owner/state 不一致。`);
  }
  assertCanonicalMembers(access.members, `${label} roomAccess`);
  const ownerMember = access.members[mapping.uid];
  if (
    !isRecord(ownerMember)
    || ownerMember.uid !== mapping.uid
    || ownerMember.role !== 'owner'
    || ownerMember.status !== 'active'
  ) {
    throw new Error(`${label} owner member 不一致。`);
  }
  if (Object.entries(access.members).some(
    ([uid, member]) => uid !== mapping.uid && member?.role === 'owner',
  )) {
    throw new Error(`${label} 含多個 owner。`);
  }
  if (
    !isRecord(userTrip)
    || userTrip.role !== 'owner'
    || userTrip.status !== 'active'
  ) {
    throw new Error(`${label} userTrips owner mirror 不一致。`);
  }
  if (
    !isRecord(acl)
    || acl.uid !== mapping.uid
    || acl.role !== 'owner'
    || acl.status !== 'active'
  ) {
    throw new Error(`${label} Firestore owner ACL 不一致。`);
  }
  const expectedCreationId = `legacy-migration-${mapping.roomId}`;
  if (
    !isRecord(reservation)
    || reservation.roomId !== mapping.roomId
    || reservation.createdByUid !== mapping.uid
    || reservation.migrated !== true
    || readCreationId(reservation.creationId, `${label} roomReservations`) !== expectedCreationId
  ) {
    throw new Error(`${label} legacy reservation 不一致。`);
  }
  const fingerprint = fingerprintFor({
    room,
    access,
    ownerMember,
    reservation,
    userTrip,
    acl,
  });
  if (
    fingerprint.accessCreatedAt !== fingerprint.reservationCreatedAt
    || fingerprint.memberAclVersion !== fingerprint.userTripAclVersion
    || fingerprint.memberAclVersion !== fingerprint.firestoreAclVersion
  ) {
    throw new Error(`${label} canonical mirrors 版本或時間不一致。`);
  }
  if (
    deletionGuard !== null
    || deletionJournal !== null
    || deletionWorker !== null
    || (
      ticketRepairLease !== null
      && !repairLeaseMatches(ticketRepairLease, allowedRepairLease)
    )
  ) {
    throw new Error(`${label} 正在刪除或維護中。`);
  }

  const currentCreationId = readCreationId(access.creationId, `${label} roomAccess`);
  if (currentCreationId && currentCreationId !== expectedCreationId) {
    throw new Error(`${label} roomAccess creationId 與 reservation 衝突。`);
  }
  return {
    classification: currentCreationId ? 'correct' : 'candidate',
    expectedCreationId,
    fingerprint,
  };
};

const inspectEntry = async ({
  database,
  firestore,
  mapping,
  index,
  allowedRepairLease = null,
}) => {
  const [
    roomSnapshot,
    accessSnapshot,
    userTripSnapshot,
    reservationSnapshot,
    deletionSnapshot,
    workerSnapshot,
    ticketRepairLeaseSnapshot,
    aclSnapshot,
    deletionGuardSnapshot,
  ] = await Promise.all([
    database.ref(`rooms/${mapping.roomId}`).get(),
    database.ref(`roomAccess/${mapping.roomId}`).get(),
    database.ref(`userTrips/${mapping.uid}/${mapping.roomId}`).get(),
    database.ref(`roomReservations/${mapping.roomId}`).get(),
    database.ref(`tripDeletions/${mapping.roomId}`).get(),
    database.ref(`tripDeletionWorkers/${mapping.roomId}`).get(),
    database.ref(`maintenanceRepairs/legacyTicketPath/${mapping.roomId}`).get(),
    firestore.doc(`tripAccess/${mapping.roomId}/members/${mapping.uid}`).get(),
    firestore.doc(`tripAccess/${mapping.roomId}`).get(),
  ]);
  const state = {
    room: snapshotValue(roomSnapshot),
    access: snapshotValue(accessSnapshot),
    userTrip: snapshotValue(userTripSnapshot),
    reservation: snapshotValue(reservationSnapshot),
    deletionJournal: snapshotValue(deletionSnapshot),
    deletionWorker: snapshotValue(workerSnapshot),
    ticketRepairLease: snapshotValue(ticketRepairLeaseSnapshot),
    acl: aclSnapshot.exists ? aclSnapshot.data() : null,
    deletionGuard: deletionGuardSnapshot.exists ? deletionGuardSnapshot.data() : null,
  };
  return {
    state,
    validated: validateCreationIdRepairState({
      mapping,
      state,
      label: `entry ${index + 1}`,
      allowedRepairLease,
    }),
  };
};

const validateMigratedReservationSet = async ({ database, mappings }) => {
  const snapshot = await database.ref('roomReservations').get();
  const migratedRoomIds = Object.entries(snapshotValue(snapshot) || {})
    .filter(([, reservation]) => reservation?.migrated === true)
    .map(([roomId]) => roomId);
  const mappedRoomIds = mappings.map(({ roomId }) => roomId);
  if (!equalSortedStrings(migratedRoomIds, mappedRoomIds)) {
    throw new Error('mapping 與 production migrated reservation 集合不一致。');
  }
};

const validateGoogleOwners = async ({ auth, mappings }) => {
  const ownerUids = [...new Set(mappings.map(({ uid }) => uid))];
  for (const uid of ownerUids) {
    const user = await auth.getUser(uid);
    if (
      user.disabled
      || !user.providerData.some(({ providerId }) => providerId === 'google.com')
    ) {
      throw new Error('mapping owner 不存在有效 Google identity，或帳號已停用。');
    }
  }
};

export const validateCreationIdRepairManifest = (manifest) => {
  assertExactKeys(manifest, [
    'version',
    'operation',
    'runId',
    'createdAt',
    'target',
    'mappingSha256',
    'expectedCount',
    'candidateCount',
    'correctCount',
    'entries',
  ], 'manifest');
  if (
    manifest.version !== MANIFEST_VERSION
    || manifest.operation !== MANIFEST_OPERATION
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(manifest.runId)
    || !Number.isFinite(Date.parse(manifest.createdAt))
    || !SHA256_PATTERN.test(manifest.mappingSha256)
  ) {
    throw new Error('manifest header 格式不正確。');
  }
  assertExactKeys(manifest.target, ['projectId', 'databaseHost'], 'manifest target');
  if (!trimText(manifest.target.projectId) || !trimText(manifest.target.databaseHost)) {
    throw new Error('manifest target 格式不正確。');
  }
  const expectedCount = requireCount(manifest.expectedCount, 'manifest expectedCount');
  const candidateCount = requireCount(
    manifest.candidateCount,
    'manifest candidateCount',
    { allowZero: true },
  );
  const correctCount = requireCount(
    manifest.correctCount,
    'manifest correctCount',
    { allowZero: true },
  );
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== expectedCount) {
    throw new Error('manifest entries 數量不正確。');
  }
  const seenRooms = new Set();
  let observedCandidates = 0;
  let observedCorrect = 0;
  manifest.entries.forEach((entry, index) => {
    const label = `manifest entry ${index + 1}`;
    assertExactKeys(entry, [
      'roomId',
      'ownerUid',
      'expectedCreationId',
      'initialState',
      'beforeCreationId',
      'fingerprint',
    ], label);
    const roomId = requireIdentifier(entry.roomId, `${label} roomId`, 160);
    requireIdentifier(entry.ownerUid, `${label} ownerUid`, 128);
    if (seenRooms.has(roomId)) {
      throw new Error(`${label} identifier 格式不正確或重複。`);
    }
    seenRooms.add(roomId);
    if (entry.expectedCreationId !== `legacy-migration-${entry.roomId}`) {
      throw new Error(`${label} expectedCreationId 不正確。`);
    }
    if (entry.initialState === 'candidate' && entry.beforeCreationId === null) {
      observedCandidates += 1;
    } else if (
      entry.initialState === 'correct'
      && entry.beforeCreationId === entry.expectedCreationId
    ) {
      observedCorrect += 1;
    } else {
      throw new Error(`${label} initial state 不正確。`);
    }
    assertSameFingerprint(entry.fingerprint, entry.fingerprint, label);
    if (
      entry.fingerprint.roomOwnerUid !== entry.ownerUid
      || entry.fingerprint.accessOwnerUid !== entry.ownerUid
      || entry.fingerprint.memberUid !== entry.ownerUid
      || requirePositiveTimestamp(
        entry.fingerprint.accessCreatedAt,
        `${label} access`,
      ) !== requirePositiveTimestamp(
        entry.fingerprint.reservationCreatedAt,
        `${label} reservation`,
      )
      || requireAclVersion(
        entry.fingerprint.memberAclVersion,
        `${label} member`,
      ) !== requireAclVersion(
        entry.fingerprint.userTripAclVersion,
        `${label} userTrips`,
      )
      || entry.fingerprint.memberAclVersion !== requireAclVersion(
        entry.fingerprint.firestoreAclVersion,
        `${label} Firestore`,
      )
    ) {
      throw new Error(`${label} fingerprint canonical mirrors 不一致。`);
    }
  });
  if (
    observedCandidates !== candidateCount
    || observedCorrect !== correctCount
    || candidateCount + correctCount !== expectedCount
  ) {
    throw new Error('manifest classification counts 不一致。');
  }
  const derivedMappingSha256 = sha256(JSON.stringify(manifest.entries.map((entry) => ({
    roomId: entry.roomId,
    uid: entry.ownerUid,
  }))));
  if (manifest.mappingSha256 !== derivedMappingSha256) {
    throw new Error('manifest mapping SHA256 不一致。');
  }
  return manifest;
};

const buildNormalizedMappingHash = (mappings) => sha256(JSON.stringify(
  mappings.map(({ roomId, uid }) => ({
    roomId,
    uid,
  })),
));

export const createCreationIdRepairManifest = async ({
  database,
  firestore,
  auth,
  rawMapping,
  projectId,
  databaseURL,
  expectedCount,
  clock = () => new Date(),
  runIdFactory = randomUUID,
}) => {
  const mappings = normalizeOwnerMappings(rawMapping);
  if (mappings.length !== expectedCount) {
    throw new Error('mapping room count 與 --expected-count 不一致。');
  }
  await validateMigratedReservationSet({ database, mappings });
  await validateGoogleOwners({ auth, mappings });
  const inspected = [];
  for (let index = 0; index < mappings.length; index += 1) {
    inspected.push(await inspectEntry({
      database,
      firestore,
      mapping: mappings[index],
      index,
    }));
  }
  const entries = mappings.map((mapping, index) => {
    const { classification, expectedCreationId, fingerprint } = inspected[index].validated;
    return {
      roomId: mapping.roomId,
      ownerUid: mapping.uid,
      expectedCreationId,
      initialState: classification,
      beforeCreationId: classification === 'candidate' ? null : expectedCreationId,
      fingerprint,
    };
  });
  const candidateCount = entries.filter(({ initialState }) => initialState === 'candidate').length;
  return validateCreationIdRepairManifest({
    version: MANIFEST_VERSION,
    operation: MANIFEST_OPERATION,
    runId: runIdFactory(),
    createdAt: clock().toISOString(),
    target: {
      projectId,
      databaseHost: new URL(databaseURL).hostname,
    },
    mappingSha256: buildNormalizedMappingHash(mappings),
    expectedCount,
    candidateCount,
    correctCount: expectedCount - candidateCount,
    entries,
  });
};

export const writeCreationIdRepairManifest = async (manifestPath, rawManifest) => {
  const manifest = validateCreationIdRepairManifest(rawManifest);
  const text = manifestText(manifest);
  try {
    await writeFile(manifestPath, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(manifestPath, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('manifest 已存在；拒絕覆寫。');
    throw error;
  }
  const persisted = await readFile(manifestPath, 'utf8');
  if (persisted !== text) throw new Error('manifest 寫入後 read-back 不一致。');
  return { path: manifestPath, sha256: sha256(persisted) };
};

export const readCreationIdRepairManifest = async (manifestPath, expectedSha256) => {
  const text = await readFile(manifestPath, 'utf8');
  const actualSha256 = sha256(text);
  const expected = Buffer.from(expectedSha256, 'hex');
  const actual = Buffer.from(actualSha256, 'hex');
  if (
    expected.length !== actual.length
    || !timingSafeEqual(expected, actual)
  ) {
    throw new Error('manifest SHA256 驗證失敗。');
  }
  return {
    manifest: validateCreationIdRepairManifest(JSON.parse(text)),
    sha256: actualSha256,
  };
};

const manifestMapping = (manifest) => manifest.entries.map(({ roomId, ownerUid }) => ({
  roomId,
  uid: ownerUid,
}));

const assertManifestState = ({ entry, inspected, requireApplied, index }) => {
  const label = `entry ${index + 1}`;
  assertSameFingerprint(inspected.validated.fingerprint, entry.fingerprint, label);
  if (
    inspected.validated.expectedCreationId !== entry.expectedCreationId
    || (
      requireApplied
      && inspected.validated.classification !== 'correct'
    )
    || (
      !requireApplied
      && entry.initialState === 'correct'
      && inspected.validated.classification !== 'correct'
    )
  ) {
    throw new Error(`${label} creationId state 與 manifest 不一致。`);
  }
};

const inspectManifestState = async ({
  database,
  firestore,
  auth,
  manifest,
  requireApplied,
  repairLeases = null,
}) => {
  const mappings = manifestMapping(manifest);
  await validateMigratedReservationSet({ database, mappings });
  await validateGoogleOwners({ auth, mappings });
  const inspected = [];
  for (let index = 0; index < mappings.length; index += 1) {
    const current = await inspectEntry({
      database,
      firestore,
      mapping: mappings[index],
      index,
      allowedRepairLease: repairLeases?.[index] || null,
    });
    assertManifestState({
      entry: manifest.entries[index],
      inspected: current,
      requireApplied,
      index,
    });
    inspected.push(current);
  }
  return inspected;
};

const assertAccessMatchesEntry = (access, entry, index) => {
  const label = `entry ${index + 1}`;
  if (
    !isRecord(access)
    || access.ownerUid !== entry.ownerUid
    || access.state !== 'ready'
    || access.deletionId !== undefined
  ) {
    throw new Error(`${label} roomAccess 在 transaction 前已漂移。`);
  }
  const member = access.members?.[entry.ownerUid];
  assertCanonicalMembers(access.members, `${label} roomAccess`);
  if (
    !isRecord(member)
    || member.uid !== entry.ownerUid
    || member.role !== 'owner'
    || member.status !== 'active'
    || Number(member.aclVersion) !== entry.fingerprint.memberAclVersion
    || Number(access.createdAt) !== entry.fingerprint.accessCreatedAt
    || Object.entries(access.members || {}).some(
      ([uid, candidate]) => uid !== entry.ownerUid && candidate?.role === 'owner',
    )
  ) {
    throw new Error(`${label} roomAccess fingerprint 在 transaction 前已漂移。`);
  }
  const currentCreationId = readCreationId(access.creationId, `${label} roomAccess`);
  if (currentCreationId && currentCreationId !== entry.expectedCreationId) {
    throw new Error(`${label} roomAccess creationId 已衝突。`);
  }
  return currentCreationId;
};

export const applyCreationIdEntry = async ({ reference, entry, index = 0 }) => {
  let serverValueObserved = false;
  const result = await reference.transaction((current) => {
    // Admin RTDB may invoke a transaction once with an uninitialized local null.
    // Returning it forces the canonical server compare/retry.
    if (current === null) return current;
    serverValueObserved = true;
    const currentCreationId = assertAccessMatchesEntry(current, entry, index);
    if (currentCreationId === entry.expectedCreationId) return current;
    return { ...current, creationId: entry.expectedCreationId };
  }, undefined, false);
  const value = snapshotValue(result.snapshot);
  if (
    !result.committed
    || !serverValueObserved
    || !isRecord(value)
    || value.creationId !== entry.expectedCreationId
  ) {
    throw new Error(`entry ${index + 1} creationId transaction 未完成。`);
  }
};

const buildRepairLeases = (manifest, invocationId, acquiredAt) => {
  const manifestSha256 = sha256(manifestText(manifest));
  const normalizedInvocationId = requireInvocationId(invocationId);
  const normalizedAcquiredAt = requirePositiveTimestamp(acquiredAt, 'repair lease');
  return manifest.entries.map((entry) => ({
    version: 1,
    operation: MANIFEST_OPERATION,
    runId: manifest.runId,
    manifestSha256,
    roomId: entry.roomId,
    phase: 'apply',
    invocationId: normalizedInvocationId,
    acquiredAt: normalizedAcquiredAt,
  }));
};

const acquireRepairLeases = async ({ database, manifest, invocationId, acquiredAt }) => {
  const leases = buildRepairLeases(manifest, invocationId, acquiredAt);
  const acquired = [];
  try {
    for (let index = 0; index < leases.length; index += 1) {
      const lease = leases[index];
      const reference = database.ref(`maintenanceRepairs/legacyTicketPath/${lease.roomId}`);
      const result = await reference.transaction((current) => {
        if (current === null) return lease;
        return undefined;
      }, undefined, false);
      if (!result.committed || !repairLeaseMatches(snapshotValue(result.snapshot), lease)) {
        throw new Error(`entry ${index + 1} maintenance lease 無法取得。`);
      }
      acquired.push({ reference, lease, index });
    }
  } catch (error) {
    const releaseFailures = [];
    for (const owned of [...acquired].reverse()) {
      try {
        await releaseRepairLease(owned);
      } catch (releaseError) {
        releaseFailures.push(releaseError.message);
      }
    }
    if (releaseFailures.length > 0) {
      throw new Error(`${error.message}；maintenance lease release 也失敗。`);
    }
    throw error;
  }
  return acquired;
};

const releaseRepairLease = async ({ reference, lease, index }) => {
  let ownedLeaseObserved = false;
  const result = await reference.transaction((current) => {
    if (current === null) return current;
    if (!repairLeaseMatches(current, lease)) return undefined;
    ownedLeaseObserved = true;
    return null;
  }, undefined, false);
  if (
    !result.committed
    || !ownedLeaseObserved
    || snapshotValue(result.snapshot) !== null
  ) {
    throw new Error(`entry ${index + 1} maintenance lease release 失敗。`);
  }
};

const releaseRepairLeases = async (leases) => {
  const failures = [];
  for (const owned of [...leases].reverse()) {
    try {
      await releaseRepairLease(owned);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length > 0) throw new Error('maintenance lease 未完整釋放。');
};

export const applyCreationIdRepairManifest = async ({
  database,
  firestore,
  auth,
  rawManifest,
  invocationId = randomUUID(),
  leaseAcquiredAt = Date.now(),
}) => {
  const manifest = validateCreationIdRepairManifest(rawManifest);
  await inspectManifestState({
    database,
    firestore,
    auth,
    manifest,
    requireApplied: false,
  });
  const ownedLeases = await acquireRepairLeases({
    database,
    manifest,
    invocationId,
    acquiredAt: leaseAcquiredAt,
  });
  const repairLeases = ownedLeases.map(({ lease }) => lease);
  let operationError = null;
  try {
    await inspectManifestState({
      database,
      firestore,
      auth,
      manifest,
      requireApplied: false,
      repairLeases,
    });
    for (let index = 0; index < manifest.entries.length; index += 1) {
      const entry = manifest.entries[index];
      const mapping = { roomId: entry.roomId, uid: entry.ownerUid };
      const current = await inspectEntry({
        database,
        firestore,
        mapping,
        index,
        allowedRepairLease: repairLeases[index],
      });
      assertManifestState({ entry, inspected: current, requireApplied: false, index });
      if (current.validated.classification === 'candidate') {
        await applyCreationIdEntry({
          reference: database.ref(`roomAccess/${entry.roomId}`),
          entry,
          index,
        });
      }
      const verified = await inspectEntry({
        database,
        firestore,
        mapping,
        index,
        allowedRepairLease: repairLeases[index],
      });
      assertManifestState({ entry, inspected: verified, requireApplied: true, index });
    }
    await inspectManifestState({
      database,
      firestore,
      auth,
      manifest,
      requireApplied: true,
      repairLeases,
    });
  } catch (error) {
    operationError = error;
  }
  try {
    await releaseRepairLeases(ownedLeases);
  } catch (releaseError) {
    if (!operationError) throw releaseError;
    throw new Error(`${operationError.message}；maintenance lease 未完整釋放。`);
  }
  if (operationError) throw operationError;
  await inspectManifestState({
    database,
    firestore,
    auth,
    manifest,
    requireApplied: true,
  });
  return { verifiedCount: manifest.entries.length };
};

export const verifyCreationIdRepairManifest = async ({
  database,
  firestore,
  auth,
  rawManifest,
}) => {
  const manifest = validateCreationIdRepairManifest(rawManifest);
  await inspectManifestState({
    database,
    firestore,
    auth,
    manifest,
    requireApplied: true,
  });
  return { verifiedCount: manifest.entries.length };
};

export const parseCreationIdRepairCli = (args = process.argv.slice(2)) => {
  const { values } = parseArgs({
    args,
    options: {
      mapping: { type: 'string' },
      manifest: { type: 'string' },
      project: { type: 'string' },
      'database-url': { type: 'string' },
      'expected-count': { type: 'string' },
      apply: { type: 'boolean', default: false },
      verify: { type: 'boolean', default: false },
      'confirm-project': { type: 'string' },
      'confirm-database-host': { type: 'string' },
      'confirm-count': { type: 'string' },
      'confirm-candidate-count': { type: 'string' },
      'confirm-manifest-sha256': { type: 'string' },
      'confirm-maintenance-window': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const projectId = trimText(values.project);
  const databaseURL = trimText(values['database-url']);
  const manifestPath = trimText(values.manifest);
  if (!projectId || !databaseURL || !manifestPath) {
    throw new Error('必須提供 --project、--database-url 與 --manifest。');
  }
  const parsedDatabaseUrl = validateDatabaseTargetUrl(databaseURL, projectId);
  const expectedCount = requireCount(values['expected-count'], '--expected-count');
  if (values.apply && values.verify) throw new Error('--apply 與 --verify 只能擇一。');
  const phase = values.apply ? 'apply' : values.verify ? 'verify' : 'plan';
  const mappingPath = trimText(values.mapping);
  if (phase === 'plan' && !mappingPath) throw new Error('PLAN 必須提供 --mapping。');
  let manifestSha256 = '';
  let confirmedCandidateCount = null;
  if (phase !== 'plan') {
    manifestSha256 = trimText(values['confirm-manifest-sha256']).toLowerCase();
    if (!SHA256_PATTERN.test(manifestSha256)) {
      throw new Error('--confirm-manifest-sha256 必須是 64 字元 SHA256。');
    }
  }
  if (phase === 'apply') {
    if (values['confirm-project'] !== projectId) {
      throw new Error('--confirm-project 必須與 --project 完全相同。');
    }
    if (values['confirm-database-host'] !== parsedDatabaseUrl.hostname) {
      throw new Error('--confirm-database-host 必須與 database hostname 完全相同。');
    }
    if (requireCount(values['confirm-count'], '--confirm-count') !== expectedCount) {
      throw new Error('--confirm-count 必須與 --expected-count 完全相同。');
    }
    confirmedCandidateCount = requireCount(
      values['confirm-candidate-count'],
      '--confirm-candidate-count',
      { allowZero: true },
    );
    if (values['confirm-maintenance-window'] !== MAINTENANCE_CONFIRMATION) {
      throw new Error(`--confirm-maintenance-window 必須是 ${MAINTENANCE_CONFIRMATION}。`);
    }
  }
  return {
    phase,
    mappingPath: mappingPath ? resolve(mappingPath) : '',
    manifestPath: requireManifestPath(manifestPath),
    projectId,
    databaseURL: parsedDatabaseUrl.toString(),
    expectedCount,
    confirmedCandidateCount,
    manifestSha256,
  };
};

const assertManifestMatchesOptions = ({ manifest, options }) => {
  if (
    manifest.target.projectId !== options.projectId
    || manifest.target.databaseHost !== new URL(options.databaseURL).hostname
    || manifest.expectedCount !== options.expectedCount
  ) {
    throw new Error('manifest target/count 與 CLI 參數不一致。');
  }
  if (
    options.phase === 'apply'
    && manifest.candidateCount !== options.confirmedCandidateCount
  ) {
    throw new Error('--confirm-candidate-count 與 manifest 不一致。');
  }
};

export const executeCreationIdRepair = async ({
  options,
  database,
  firestore,
  auth,
  invocationId = randomUUID(),
}) => {
  if (options.phase === 'plan') {
    const rawMapping = JSON.parse(await readFile(options.mappingPath, 'utf8'));
    const manifest = await createCreationIdRepairManifest({
      database,
      firestore,
      auth,
      rawMapping,
      projectId: options.projectId,
      databaseURL: options.databaseURL,
      expectedCount: options.expectedCount,
    });
    const persisted = await writeCreationIdRepairManifest(options.manifestPath, manifest);
    return {
      phase: 'plan',
      totalCount: manifest.expectedCount,
      candidateCount: manifest.candidateCount,
      correctCount: manifest.correctCount,
      ...persisted,
    };
  }
  const loaded = await readCreationIdRepairManifest(
    options.manifestPath,
    options.manifestSha256,
  );
  assertManifestMatchesOptions({ manifest: loaded.manifest, options });
  if (options.phase === 'verify') {
    return {
      phase: 'verify',
      ...(await verifyCreationIdRepairManifest({
        database,
        firestore,
        auth,
        rawManifest: loaded.manifest,
      })),
    };
  }
  return {
    phase: 'apply',
    ...(await applyCreationIdRepairManifest({
      database,
      firestore,
      auth,
      rawManifest: loaded.manifest,
      invocationId,
    })),
  };
};

const errorMessage = (error) => error instanceof Error ? error.message : String(error);

export const withFirebaseAdminAppCleanup = async ({
  app,
  operation,
  cleanup = deleteApp,
}) => {
  let result;
  let operationFailed = false;
  let operationError = null;
  try {
    result = await operation();
  } catch (error) {
    operationFailed = true;
    operationError = error;
  }

  let cleanupFailed = false;
  let cleanupError = null;
  try {
    await cleanup(app);
  } catch (error) {
    cleanupFailed = true;
    cleanupError = error;
  }

  if (operationFailed && cleanupFailed) {
    const combinedError = new Error(
      `${errorMessage(operationError)}；Firebase Admin cleanup 也失敗：${errorMessage(cleanupError)}`,
      { cause: operationError },
    );
    combinedError.errors = [operationError, cleanupError];
    throw combinedError;
  }
  if (operationFailed) throw operationError;
  if (cleanupFailed) throw cleanupError;
  return result;
};

const run = async () => {
  const options = parseCreationIdRepairCli();
  const invocationId = options.phase === 'apply' ? randomUUID() : '';
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: options.projectId,
    databaseURL: options.databaseURL,
  }, `legacy-creation-id-repair-${Date.now()}`);
  await withFirebaseAdminAppCleanup({
    app,
    operation: async () => {
      if (invocationId) console.log(`Apply invocation ID: ${invocationId}`);
      const result = await executeCreationIdRepair({
        options,
        database: getDatabase(app),
        firestore: getFirestore(app),
        auth: getAuth(app),
        invocationId,
      });
      console.log(`Target project: ${options.projectId}`);
      console.log(`Target database host: ${new URL(options.databaseURL).hostname}`);
      if (result.phase === 'plan') {
        console.log(
          `PLAN total=${result.totalCount} candidates=${result.candidateCount} correct=${result.correctCount}`,
        );
        console.log(`Manifest: ${result.path}`);
        console.log(`Manifest SHA256: ${result.sha256}`);
        console.log('No Firebase data was changed.');
        return;
      }
      console.log(`${result.phase.toUpperCase()} verified=${result.verifiedCount}`);
    },
  });
};

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  run().catch((error) => {
    console.error(`Legacy creationId repair failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  });
}
