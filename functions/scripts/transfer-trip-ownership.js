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

import { validateDatabaseTargetUrl } from './migrate-legacy-trip-access.js';

const VERSION = 1;
const OPERATION = 'trip-owner-transfer';
const LEASE_ROOT = 'maintenanceRepairs/legacyTicketPath';
const MANIFEST_NAME = /^trip-owner-transfer.*\.local\.json$/u;
const SHA256 = /^[a-f\d]{64}$/u;
const FORBIDDEN_KEY = /[.#$[\]/]/u;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAINTENANCE_CONFIRMATION = 'production-paused-users-inactive';
const MAX_TRANSFERS = 200;
const EMULATOR_ENVIRONMENT_KEYS = [
  'FIREBASE_DATABASE_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
];
const PROJECT_ENVIRONMENT_KEYS = ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT'];

const trimText = (value) => String(value ?? '').trim();
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const snapshotValue = (snapshot) => snapshot?.exists?.() === false ? null : snapshot?.val?.() ?? null;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

const assertExactKeys = (value, expected, label) => {
  if (!isRecord(value)) throw new Error(`${label} 格式不正確。`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} 含未預期欄位。`);
  }
};

const requireIdentifier = (value, label, maximum = 160) => {
  const normalized = trimText(value);
  if (
    value !== normalized
    || !normalized
    || normalized.length > maximum
    || FORBIDDEN_KEY.test(normalized)
    || RESERVED_KEYS.has(normalized)
  ) throw new Error(`${label} identifier 格式不正確。`);
  return normalized;
};

const requireTitle = (value, label) => {
  if (typeof value !== 'string' || value !== value.trim() || !value || value.length > 120) {
    throw new Error(`${label} expectedTitle 格式不正確。`);
  }
  return value;
};

const requireCount = (value, label, { allowZero = false } = {}) => {
  const count = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(count) || count < minimum || count > MAX_TRANSFERS) {
    throw new Error(`${label} 必須是 ${minimum}–${MAX_TRANSFERS} 的整數。`);
  }
  return count;
};

const requireVersion = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} aclVersion 格式不正確。`);
  return value;
};

const requireNonnegativeVersion = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} version 格式不正確。`);
  return value;
};

const requireTimestamp = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} timestamp 格式不正確。`);
  return value;
};

const requireInvocationId = (value) => {
  const id = trimText(value);
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(id)) throw new Error('invocation ID 格式不正確。');
  return id;
};

const requireManifestPath = (value) => {
  const path = resolve(trimText(value));
  if (!MANIFEST_NAME.test(basename(path))) {
    throw new Error('manifest 檔名必須符合 trip-owner-transfer*.local.json。');
  }
  return path;
};

export const assertOwnershipTransferEnvironment = ({ projectId, env = process.env }) => {
  const emulatorOverrides = EMULATOR_ENVIRONMENT_KEYS.filter((key) => trimText(env?.[key]));
  if (emulatorOverrides.length) {
    throw new Error(`拒絕在 Firebase Emulator override 下執行：${emulatorOverrides.join(', ')}。`);
  }
  PROJECT_ENVIRONMENT_KEYS.forEach((key) => {
    const configuredProject = trimText(env?.[key]);
    if (configuredProject && configuredProject !== projectId) {
      throw new Error(`${key} 與 --project 不一致。`);
    }
  });
};

export const normalizeOwnershipTransfers = (rawMapping) => {
  assertExactKeys(rawMapping, ['version', 'transfers'], 'mapping');
  if (rawMapping.version !== VERSION || !Array.isArray(rawMapping.transfers)) {
    throw new Error('mapping version/transfers 格式不正確。');
  }
  if (rawMapping.transfers.length < 1 || rawMapping.transfers.length > MAX_TRANSFERS) {
    throw new Error(`mapping transfers 必須有 1–${MAX_TRANSFERS} 筆。`);
  }
  const rooms = new Set();
  return rawMapping.transfers.map((raw, index) => {
    const label = `transfer ${index + 1}`;
    assertExactKeys(raw, ['roomId', 'expectedTitle', 'fromUid', 'toUid'], label);
    const transfer = {
      roomId: requireIdentifier(raw.roomId, `${label} roomId`),
      expectedTitle: requireTitle(raw.expectedTitle, label),
      fromUid: requireIdentifier(raw.fromUid, `${label} fromUid`, 128),
      toUid: requireIdentifier(raw.toUid, `${label} toUid`, 128),
    };
    if (transfer.fromUid === transfer.toUid || rooms.has(transfer.roomId)) {
      throw new Error(`${label} 必須使用不同 UID 且 roomId 不可重複。`);
    }
    rooms.add(transfer.roomId);
    return transfer;
  });
};

const normalizeMember = (value, uid, label) => {
  if (!isRecord(value) || value.uid !== uid || !['owner', 'editor'].includes(value.role)
    || value.status !== 'active') throw new Error(`${label} member mirror 不正確。`);
  return { role: value.role, version: requireVersion(value.aclVersion, label) };
};

const normalizeIndex = (value, label) => {
  if (!isRecord(value) || !['owner', 'editor'].includes(value.role) || value.status !== 'active') {
    throw new Error(`${label} userTrips mirror 不正確。`);
  }
  return { role: value.role, version: requireVersion(value.aclVersion, label) };
};

const normalizeAcl = (value, uid, label) => {
  if (!isRecord(value) || value.uid !== uid || !['owner', 'editor'].includes(value.role)
    || value.status !== 'active') throw new Error(`${label} Firestore ACL mirror 不正確。`);
  return { role: value.role, version: requireVersion(value.aclVersion, label) };
};

const memberFingerprint = ({ member, index, acl }, uid, label) => {
  const canonical = normalizeMember(member, uid, `${label} roomAccess`);
  const userTrip = normalizeIndex(index, `${label} userTrips`);
  const firestore = normalizeAcl(acl, uid, `${label} Firestore`);
  if (
    canonical.role !== userTrip.role
    || canonical.role !== firestore.role
    || canonical.version !== userTrip.version
    || canonical.version !== firestore.version
  ) {
    throw new Error(`${label} role/aclVersion mirrors 不一致。`);
  }
  return {
    role: canonical.role,
    memberVersion: canonical.version,
    userTripVersion: userTrip.version,
    firestoreVersion: firestore.version,
  };
};

const lockMatches = (actual, expected) => {
  if (!isRecord(actual) || !isRecord(expected)) return false;
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && expectedKeys.filter((key) => key !== 'acquiredAt')
      .every((key) => actual[key] === expected[key])
    && Number.isSafeInteger(actual.acquiredAt) && actual.acquiredAt >= 1;
};

const expectedLock = ({ manifest, entry, invocationId, acquiredAt }) => ({
  version: VERSION,
  operation: OPERATION,
  state: 'maintenance',
  runId: manifest.runId,
  manifestSha256: sha256(manifestText(manifest)),
  roomId: entry.roomId,
  invocationId: requireInvocationId(invocationId),
  acquiredAt: requireTimestamp(acquiredAt, 'lock'),
});

const readEntry = async ({ database, firestore, transfer, inviteRoot,
  manifestInviteHashes = null }) => {
  const { roomId, fromUid, toUid } = transfer;
  const [room, access, fromTrip, toTrip, reservation, deletion, worker, lease,
    fromAcl, toAcl, guard] = await Promise.all([
    database.ref(`rooms/${roomId}`).get(),
    database.ref(`roomAccess/${roomId}`).get(),
    database.ref(`userTrips/${fromUid}/${roomId}`).get(),
    database.ref(`userTrips/${toUid}/${roomId}`).get(),
    database.ref(`roomReservations/${roomId}`).get(),
    database.ref(`tripDeletions/${roomId}`).get(),
    database.ref(`tripDeletionWorkers/${roomId}`).get(),
    database.ref(`${LEASE_ROOT}/${roomId}`).get(),
    firestore.doc(`tripAccess/${roomId}/members/${fromUid}`).get(),
    firestore.doc(`tripAccess/${roomId}/members/${toUid}`).get(),
    firestore.doc(`tripAccess/${roomId}`).get(),
  ]);
  const accessValue = snapshotValue(access);
  const canonicalHash = trimText(accessValue?.invite?.tokenHash);
  if (canonicalHash && SHA256.test(canonicalHash)
    && Object.prototype.hasOwnProperty.call(inviteRoot, canonicalHash)) {
    const canonicalLookup = inviteRoot[canonicalHash];
    const canonicalVersion = accessValue?.invite?.version;
    if (!isRecord(canonicalLookup)
      || canonicalLookup.roomId !== roomId
      || !Number.isSafeInteger(canonicalLookup.version)
      || canonicalLookup.version !== canonicalVersion) {
      throw new Error(`${roomId} canonical invite lookup room/version 不一致。`);
    }
  }
  if (manifestInviteHashes) {
    for (const hash of manifestInviteHashes) {
      if (!Object.prototype.hasOwnProperty.call(inviteRoot, hash)) continue;
      const lookup = inviteRoot[hash];
      if (!isRecord(lookup) || lookup.roomId !== roomId) {
        throw new Error(`${roomId} manifest invite hash 已指向其他 room；拒絕刪除。`);
      }
    }
  }
  const lookupHashes = Object.entries(inviteRoot || {})
    .filter(([, invite]) => invite?.roomId === roomId)
    .map(([hash]) => {
      if (!SHA256.test(hash)) throw new Error(`${roomId} tripInvites key 格式不正確。`);
      return hash;
    }).sort();
  return {
    room: snapshotValue(room), access: accessValue,
    fromTrip: snapshotValue(fromTrip), toTrip: snapshotValue(toTrip),
    reservation: snapshotValue(reservation), deletion: snapshotValue(deletion),
    worker: snapshotValue(worker), lease: snapshotValue(lease),
    fromAcl: fromAcl.exists ? fromAcl.data() : null,
    toAcl: toAcl.exists ? toAcl.data() : null,
    guard: guard.exists ? guard.data() : null,
    lookupHashes,
  };
};

const assertBaseState = ({ transfer, state, allowedLock = null, label }) => {
  const { roomId, expectedTitle } = transfer;
  if (!isRecord(state.room) || !isRecord(state.room.meta)
    || state.room.meta.title !== expectedTitle) throw new Error(`${label} room/title 不一致。`);
  const canonicalLocked = isRecord(state.access)
    && state.access.state === 'maintenance'
    && lockMatches(state.access.maintenanceLock, allowedLock);
  const canonicalReady = isRecord(state.access)
    && state.access.state === 'ready'
    && state.access.maintenanceLock === undefined;
  if ((!canonicalReady && !canonicalLocked) || state.access?.deletionId !== undefined) {
    throw new Error(`${label} roomAccess state 不正確。`);
  }
  if (!isRecord(state.access.members)) throw new Error(`${label} roomAccess members 不完整。`);
  for (const [uid, member] of Object.entries(state.access.members)) {
    if (!isRecord(member) || member.uid !== uid || !['owner', 'editor'].includes(member.role)
      || !['active', 'removed'].includes(member.status)) {
      throw new Error(`${label} roomAccess member identity/schema 不一致。`);
    }
    requireVersion(member.aclVersion, `${label} roomAccess member ${uid}`);
  }
  const owners = Object.entries(state.access.members).filter(([, member]) => member?.role === 'owner');
  if (owners.length !== 1 || owners[0][1]?.status !== 'active') {
    throw new Error(`${label} 必須恰有一個 owner，且 owner 必須 active。`);
  }
  const creationId = state.access.creationId;
  if (typeof creationId !== 'string' || !creationId || creationId !== creationId.trim()
    || creationId.length > 200 || !isRecord(state.reservation)
    || state.reservation.roomId !== roomId
    || state.reservation.creationId !== creationId
    || requireIdentifier(state.reservation.createdByUid, `${label} reservation creator`, 128) === ''
    || !Number.isSafeInteger(state.access.createdAt)
    || !Number.isSafeInteger(state.reservation.createdAt)
    || state.reservation.createdAt < 1
    || Number(state.access.createdAt) !== Number(state.reservation.createdAt)) {
    throw new Error(`${label} reservation room/creationId/creator/createdAt 不一致。`);
  }
  if (state.deletion !== null || state.worker !== null) throw new Error(`${label} 正在刪除中。`);
  if ((state.lease !== null && !lockMatches(state.lease, allowedLock))
    || (state.guard !== null && !lockMatches(state.guard, allowedLock))) {
    throw new Error(`${label} 含 foreign maintenance lease/guard。`);
  }
  return { creationId, canonicalLocked };
};

const initialFingerprint = ({ transfer, state, label }) => {
  const { fromUid, toUid } = transfer;
  const from = memberFingerprint({
    member: state.access.members[fromUid], index: state.fromTrip, acl: state.fromAcl,
  }, fromUid, `${label} former owner`);
  const to = memberFingerprint({
    member: state.access.members[toUid], index: state.toTrip, acl: state.toAcl,
  }, toUid, `${label} target`);
  if (state.room.meta.ownerUid !== fromUid || state.access.ownerUid !== fromUid
    || from.role !== 'owner' || to.role !== 'editor') {
    throw new Error(`${label} owner/target 必須是 canonical active owner/editor。`);
  }
  return {
    creationId: state.access.creationId,
    accessCreatedAt: Number(state.access.createdAt),
    reservationCreatedAt: Number(state.reservation.createdAt),
    reservationCreatedByUid: state.reservation.createdByUid,
    inviteVersion: Math.max(
      state.access.inviteVersion === undefined
        ? 0 : requireNonnegativeVersion(state.access.inviteVersion, `${label} inviteVersion`),
      state.access.invite?.version === undefined
        ? 0 : requireNonnegativeVersion(state.access.invite.version, `${label} canonical invite`),
    ),
    from,
    to,
  };
};

const completedFingerprint = ({ transfer, state, label }) => {
  const { fromUid, toUid } = transfer;
  const from = memberFingerprint({
    member: state.access.members[fromUid], index: state.fromTrip, acl: state.fromAcl,
  }, fromUid, `${label} former owner`);
  const to = memberFingerprint({
    member: state.access.members[toUid], index: state.toTrip, acl: state.toAcl,
  }, toUid, `${label} target`);
  const mirrorsConverged = (member) => member.memberVersion === member.userTripVersion
    && member.memberVersion === member.firestoreVersion && member.memberVersion >= 2;
  const inviteVersion = state.access.inviteVersion === undefined
    ? 0 : requireNonnegativeVersion(state.access.inviteVersion, `${label} inviteVersion`);
  if (state.room.meta.ownerUid !== toUid || state.access.ownerUid !== toUid
    || from.role !== 'editor' || to.role !== 'owner'
    || !mirrorsConverged(from) || !mirrorsConverged(to)
    || state.access.invite !== undefined || state.lookupHashes.length !== 0
    || inviteVersion < 1 || state.access.lastInviteRevokedByUid !== fromUid
    || !Number.isSafeInteger(state.access.lastInviteRevokedAt)
    || state.access.lastInviteRevokedAt < 1) {
    throw new Error(`${label} 不是 canonical candidate 或 completed transfer。`);
  }
  return {
    creationId: state.access.creationId,
    accessCreatedAt: Number(state.access.createdAt),
    reservationCreatedAt: Number(state.reservation.createdAt),
    reservationCreatedByUid: state.reservation.createdByUid,
    inviteVersion: inviteVersion - 1,
    from: { role: 'owner', memberVersion: from.memberVersion - 1,
      userTripVersion: from.userTripVersion - 1, firestoreVersion: from.firestoreVersion - 1 },
    to: { role: 'editor', memberVersion: to.memberVersion - 1,
      userTripVersion: to.userTripVersion - 1, firestoreVersion: to.firestoreVersion - 1 },
  };
};

const nextVersion = (member) => {
  const current = Math.max(
    member.memberVersion, member.userTripVersion, member.firestoreVersion,
  );
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new Error('aclVersion 已達安全整數上限，拒絕 ownership transfer。');
  }
  return current + 1;
};

const nextNonnegativeVersion = (value, label) => {
  const current = requireNonnegativeVersion(value, label);
  if (current >= Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} 已達安全整數上限。`);
  }
  return current + 1;
};

const validateHashList = (value, label) => {
  if (!Array.isArray(value) || value.some((hash) => typeof hash !== 'string' || !SHA256.test(hash))) {
    throw new Error(`${label} inviteHashes 格式不正確。`);
  }
  if (new Set(value).size !== value.length || [...value].sort().some((hash, i) => hash !== value[i])) {
    throw new Error(`${label} inviteHashes 必須排序且不可重複。`);
  }
};

const expectedInviteHashes = (state) => {
  const canonicalHash = trimText(state.access?.invite?.tokenHash);
  if (canonicalHash && !SHA256.test(canonicalHash)) {
    throw new Error('canonical invite tokenHash 格式不正確。');
  }
  if (state.access.inviteVersion !== undefined) {
    requireNonnegativeVersion(state.access.inviteVersion, 'roomAccess inviteVersion');
  }
  const canonicalVersion = state.access.invite?.version === undefined
    ? 0 : requireNonnegativeVersion(state.access.invite.version, 'canonical invite');
  if (canonicalHash && canonicalVersion < 1) throw new Error('canonical invite version 不正確。');
  return [...new Set([...state.lookupHashes, ...(canonicalHash ? [canonicalHash] : [])])].sort();
};

const semanticMatches = (actual, originalRole, originalVersion, finalRole, finalVersion) => (
  (actual.role === originalRole && actual.version === originalVersion)
  || (actual.role === finalRole && actual.version === finalVersion)
);

const isRtdbTransferComplete = ({ entry, state }) => {
  const access = state.access;
  const fromMember = access?.members?.[entry.fromUid];
  const toMember = access?.members?.[entry.toUid];
  const fromIndex = state.fromTrip;
  const toIndex = state.toTrip;
  return state.room?.meta?.ownerUid === entry.toUid
    && access?.ownerUid === entry.toUid
    && fromMember?.uid === entry.fromUid
    && fromMember?.role === 'editor'
    && fromMember?.status === 'active'
    && fromMember?.aclVersion === entry.nextAclVersions.from
    && toMember?.uid === entry.toUid
    && toMember?.role === 'owner'
    && toMember?.status === 'active'
    && toMember?.aclVersion === entry.nextAclVersions.to
    && fromIndex?.role === 'editor'
    && fromIndex?.status === 'active'
    && fromIndex?.aclVersion === entry.nextAclVersions.from
    && toIndex?.role === 'owner'
    && toIndex?.status === 'active'
    && toIndex?.aclVersion === entry.nextAclVersions.to
    && access?.invite === undefined
    && access?.inviteVersion === entry.nextInviteVersion
    && access?.lastInviteRevokedByUid === entry.fromUid
    && Number.isSafeInteger(access?.lastInviteRevokedAt)
    && access.lastInviteRevokedAt >= 1;
};

const isFirestoreTransferComplete = ({ entry, state }) => (
  state.fromAcl?.uid === entry.fromUid
  && state.fromAcl?.role === 'editor'
  && state.fromAcl?.status === 'active'
  && state.fromAcl?.aclVersion === entry.nextAclVersions.from
  && state.toAcl?.uid === entry.toUid
  && state.toAcl?.role === 'owner'
  && state.toAcl?.status === 'active'
  && state.toAcl?.aclVersion === entry.nextAclVersions.to
);

const canonicalAccessPhase = ({ entry, access, allowedLock = null, label }) => {
  if (!isRecord(access)) throw new Error(`${label} canonical roomAccess 不存在。`);
  const canonicalLocked = access.state === 'maintenance'
    && lockMatches(access.maintenanceLock, allowedLock);
  const canonicalReady = access.state === 'ready' && access.maintenanceLock === undefined;
  if ((!canonicalReady && !canonicalLocked) || access.deletionId !== undefined) {
    throw new Error(`${label} canonical roomAccess maintenance lock 不正確。`);
  }
  if (access.creationId !== entry.fingerprint.creationId
    || Number(access.createdAt) !== entry.fingerprint.accessCreatedAt
    || !isRecord(access.members)) {
    throw new Error(`${label} canonical roomAccess fingerprint 已漂移。`);
  }
  for (const [uid, member] of Object.entries(access.members)) {
    if (!isRecord(member) || member.uid !== uid || !['owner', 'editor'].includes(member.role)
      || !['active', 'removed'].includes(member.status)) {
      throw new Error(`${label} canonical member schema 已漂移。`);
    }
    requireVersion(member.aclVersion, `${label} canonical member ${uid}`);
  }
  const owners = Object.values(access.members).filter(({ role }) => role === 'owner');
  if (owners.length !== 1 || owners[0].status !== 'active') {
    throw new Error(`${label} canonical owner cardinality 已漂移。`);
  }
  const from = normalizeMember(access.members[entry.fromUid], entry.fromUid,
    `${label} canonical former owner`);
  const to = normalizeMember(access.members[entry.toUid], entry.toUid,
    `${label} canonical target`);
  const candidateInviteVersion = Math.max(
    access.inviteVersion === undefined
      ? 0 : requireNonnegativeVersion(access.inviteVersion, `${label} inviteVersion`),
    access.invite?.version === undefined
      ? 0 : requireNonnegativeVersion(access.invite.version, `${label} canonical invite`),
  );
  const canonicalHash = trimText(access.invite?.tokenHash);
  if (canonicalHash && (!SHA256.test(canonicalHash) || !entry.inviteHashes.includes(canonicalHash))) {
    throw new Error(`${label} canonical invite fingerprint 已漂移。`);
  }
  const candidate = access.ownerUid === entry.fromUid
    && from.role === 'owner' && from.version === entry.fingerprint.from.memberVersion
    && to.role === 'editor' && to.version === entry.fingerprint.to.memberVersion
    && candidateInviteVersion === entry.fingerprint.inviteVersion;
  const complete = access.ownerUid === entry.toUid
    && from.role === 'editor' && from.version === entry.nextAclVersions.from
    && to.role === 'owner' && to.version === entry.nextAclVersions.to
    && access.invite === undefined
    && access.inviteVersion === entry.nextInviteVersion
    && access.lastInviteRevokedByUid === entry.fromUid
    && Number.isSafeInteger(access.lastInviteRevokedAt)
    && access.lastInviteRevokedAt >= 1;
  if (!candidate && !complete) {
    throw new Error(`${label} canonical roomAccess ownership/invite fingerprint 已漂移。`);
  }
  return { phase: complete ? 'complete' : 'candidate', canonicalLocked };
};

const validateManifestEntryState = ({ entry, state, allowedLock = null, requireComplete = false, label }) => {
  const transfer = {
    roomId: entry.roomId, expectedTitle: entry.expectedTitle,
    fromUid: entry.fromUid, toUid: entry.toUid,
  };
  const { canonicalLocked } = assertBaseState({ transfer, state, allowedLock, label });
  if (state.access.creationId !== entry.fingerprint.creationId
    || Number(state.access.createdAt) !== entry.fingerprint.accessCreatedAt
    || Number(state.reservation.createdAt) !== entry.fingerprint.reservationCreatedAt
    || state.reservation.createdByUid !== entry.fingerprint.reservationCreatedByUid) {
    throw new Error(`${label} creation fingerprint 已漂移。`);
  }
  const from = {
    member: normalizeMember(state.access.members[entry.fromUid], entry.fromUid, `${label} former owner member`),
    index: normalizeIndex(state.fromTrip, `${label} former owner userTrips`),
    acl: normalizeAcl(state.fromAcl, entry.fromUid, `${label} former owner Firestore`),
  };
  const to = {
    member: normalizeMember(state.access.members[entry.toUid], entry.toUid, `${label} target member`),
    index: normalizeIndex(state.toTrip, `${label} target userTrips`),
    acl: normalizeAcl(state.toAcl, entry.toUid, `${label} target Firestore`),
  };
  const checks = [
    semanticMatches(from.member, 'owner', entry.fingerprint.from.memberVersion, 'editor', entry.nextAclVersions.from),
    semanticMatches(from.index, 'owner', entry.fingerprint.from.userTripVersion, 'editor', entry.nextAclVersions.from),
    semanticMatches(from.acl, 'owner', entry.fingerprint.from.firestoreVersion, 'editor', entry.nextAclVersions.from),
    semanticMatches(to.member, 'editor', entry.fingerprint.to.memberVersion, 'owner', entry.nextAclVersions.to),
    semanticMatches(to.index, 'editor', entry.fingerprint.to.userTripVersion, 'owner', entry.nextAclVersions.to),
    semanticMatches(to.acl, 'editor', entry.fingerprint.to.firestoreVersion, 'owner', entry.nextAclVersions.to),
  ];
  if (checks.some((valid) => !valid)) throw new Error(`${label} ACL mirrors 已漂移。`);
  const owners = [state.room.meta.ownerUid, state.access.ownerUid];
  if (owners.some((uid) => ![entry.fromUid, entry.toUid].includes(uid)) || owners[0] !== owners[1]) {
    throw new Error(`${label} owner fields 已漂移。`);
  }
  const rtdbComplete = isRtdbTransferComplete({ entry, state });
  const firestoreComplete = isFirestoreTransferComplete({ entry, state });
  const ownershipComplete = rtdbComplete && firestoreComplete;
  const hasUnknownLookup = state.lookupHashes.some((hash) => !entry.inviteHashes.includes(hash));
  if (hasUnknownLookup) {
    throw new Error(`${label} 含 manifest 未授權的 late invite lookup。`);
  }
  const knownLateOrphans = state.lookupHashes.length > 0;
  const cleanup = ownershipComplete && knownLateOrphans;
  const complete = ownershipComplete && state.lookupHashes.length === 0;
  const original = owners[0] === entry.fromUid
    && from.member.role === 'owner' && from.index.role === 'owner' && from.acl.role === 'owner'
    && to.member.role === 'editor' && to.index.role === 'editor' && to.acl.role === 'editor'
    && Math.max(
      state.access.inviteVersion === undefined
        ? 0 : requireNonnegativeVersion(state.access.inviteVersion, `${label} inviteVersion`),
      state.access.invite?.version === undefined
        ? 0 : requireNonnegativeVersion(state.access.invite.version, `${label} canonical invite`),
    ) === entry.nextInviteVersion - 1
    && JSON.stringify(expectedInviteHashes(state)) === JSON.stringify(entry.inviteHashes);
  const fullyLocked = allowedLock
    && lockMatches(state.lease, allowedLock)
    && lockMatches(state.guard, allowedLock)
    && canonicalLocked;
  if (!complete && !cleanup && !original && !fullyLocked) {
    throw new Error(`${label} transfer 為未受雙重鎖保護的 partial state。`);
  }
  if (requireComplete && !complete) throw new Error(`${label} ownership transfer 尚未完成。`);
  const phase = complete ? 'complete' : cleanup ? 'cleanup' : original ? 'candidate' : 'partial';
  return canonicalLocked ? `${phase}-locked` : phase;
};

export const validateOwnershipTransferManifest = (manifest) => {
  assertExactKeys(manifest, ['version', 'operation', 'runId', 'createdAt', 'target',
    'mappingSha256', 'expectedCount', 'candidateCount', 'completeCount', 'entries'], 'manifest');
  if (manifest.version !== VERSION || manifest.operation !== OPERATION
    || !/^[A-Za-z0-9_-]{1,128}$/u.test(manifest.runId)
    || !Number.isFinite(Date.parse(manifest.createdAt)) || !SHA256.test(manifest.mappingSha256)) {
    throw new Error('manifest header 格式不正確。');
  }
  assertExactKeys(manifest.target, ['projectId', 'databaseHost'], 'manifest target');
  if (!trimText(manifest.target.projectId) || !trimText(manifest.target.databaseHost)) {
    throw new Error('manifest target 格式不正確。');
  }
  const expected = requireCount(manifest.expectedCount, 'manifest expectedCount');
  const candidate = requireCount(manifest.candidateCount, 'manifest candidateCount', { allowZero: true });
  const complete = requireCount(manifest.completeCount, 'manifest completeCount', { allowZero: true });
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== expected
    || candidate + complete !== expected) throw new Error('manifest counts 不一致。');
  const raw = { version: VERSION, transfers: [] };
  let observedCandidates = 0;
  let observedComplete = 0;
  manifest.entries.forEach((entry, index) => {
    const label = `manifest entry ${index + 1}`;
    assertExactKeys(entry, ['roomId', 'expectedTitle', 'fromUid', 'toUid', 'initialState',
      'inviteHashes', 'nextAclVersions', 'nextInviteVersion', 'fingerprint'], label);
    raw.transfers.push({ roomId: entry.roomId, expectedTitle: entry.expectedTitle,
      fromUid: entry.fromUid, toUid: entry.toUid });
    if (entry.initialState === 'candidate') observedCandidates += 1;
    else if (entry.initialState === 'complete') observedComplete += 1;
    else throw new Error(`${label} initialState 不正確。`);
    validateHashList(entry.inviteHashes, label);
    if (!Number.isSafeInteger(entry.nextInviteVersion) || entry.nextInviteVersion < 1) {
      throw new Error(`${label} nextInviteVersion 格式不正確。`);
    }
    assertExactKeys(entry.nextAclVersions, ['from', 'to'], `${label} nextAclVersions`);
    assertExactKeys(entry.fingerprint, ['creationId', 'accessCreatedAt', 'reservationCreatedAt',
      'reservationCreatedByUid', 'inviteVersion', 'from', 'to'], `${label} fingerprint`);
    for (const side of ['from', 'to']) {
      assertExactKeys(entry.fingerprint[side], ['role', 'memberVersion', 'userTripVersion',
        'firestoreVersion'], `${label} ${side} fingerprint`);
      const wantedRole = side === 'from' ? 'owner' : 'editor';
      if (entry.fingerprint[side].role !== wantedRole) throw new Error(`${label} role 不正確。`);
      for (const key of ['memberVersion', 'userTripVersion', 'firestoreVersion']) {
        requireVersion(entry.fingerprint[side][key], `${label} ${side}`);
      }
      if (entry.nextAclVersions[side] !== nextVersion(entry.fingerprint[side])) {
        throw new Error(`${label} next aclVersion 不單調。`);
      }
    }
    if (!trimText(entry.fingerprint.creationId)
      || requireIdentifier(entry.fingerprint.reservationCreatedByUid,
        `${label} reservation creator`, 128) === ''
      || requireTimestamp(entry.fingerprint.accessCreatedAt, label)
        !== requireTimestamp(entry.fingerprint.reservationCreatedAt, label)) {
      throw new Error(`${label} creation fingerprint 不正確。`);
    }
    if (nextNonnegativeVersion(entry.fingerprint.inviteVersion, `${label} inviteVersion`)
      !== entry.nextInviteVersion) throw new Error(`${label} nextInviteVersion 不正確。`);
  });
  const transfers = normalizeOwnershipTransfers(raw);
  if (candidate !== observedCandidates || complete !== observedComplete
    || sha256(JSON.stringify(transfers)) !== manifest.mappingSha256) {
    throw new Error('manifest mapping/count SHA256 不一致。');
  }
  return manifest;
};

const validateTargetUsers = async ({ auth, transfers }) => {
  for (const uid of [...new Set(transfers.flatMap(({ fromUid, toUid }) => [fromUid, toUid]))]) {
    const user = await auth.getUser(uid);
    if (user.disabled || !user.providerData?.some(({ providerId }) => providerId === 'google.com')) {
      throw new Error(`target UID ${uid} 不存在有效 Google identity，或帳號已停用。`);
    }
  }
};

export const createOwnershipTransferManifest = async ({ database, firestore, auth, rawMapping,
  projectId, databaseURL, expectedCount, clock = () => new Date(), runIdFactory = randomUUID }) => {
  const transfers = normalizeOwnershipTransfers(rawMapping);
  if (transfers.length !== expectedCount) throw new Error('mapping count 與 --expected-count 不一致。');
  await validateTargetUsers({ auth, transfers });
  const inviteRoot = snapshotValue(await database.ref('tripInvites').get()) || {};
  if (!isRecord(inviteRoot)) throw new Error('tripInvites root 格式不正確。');
  const entries = [];
  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index];
    const label = `entry ${index + 1}`;
    const state = await readEntry({ database, firestore, transfer, inviteRoot });
    assertBaseState({ transfer, state, label });
    const isCandidate = state.room.meta.ownerUid === transfer.fromUid
      && state.access.ownerUid === transfer.fromUid;
    const fingerprint = isCandidate
      ? initialFingerprint({ transfer, state, label })
      : completedFingerprint({ transfer, state, label });
    entries.push({ ...transfer, initialState: isCandidate ? 'candidate' : 'complete',
      inviteHashes: isCandidate ? expectedInviteHashes(state) : [],
      nextAclVersions: { from: nextVersion(fingerprint.from), to: nextVersion(fingerprint.to) },
      nextInviteVersion: nextNonnegativeVersion(fingerprint.inviteVersion,
        `${label} inviteVersion`), fingerprint });
  }
  const candidateCount = entries.filter(({ initialState }) => initialState === 'candidate').length;
  return validateOwnershipTransferManifest({
    version: VERSION, operation: OPERATION, runId: runIdFactory(), createdAt: clock().toISOString(),
    target: { projectId, databaseHost: new URL(databaseURL).hostname },
    mappingSha256: sha256(JSON.stringify(transfers)), expectedCount,
    candidateCount, completeCount: entries.length - candidateCount, entries,
  });
};

export const writeOwnershipTransferManifest = async (path, rawManifest) => {
  const manifest = validateOwnershipTransferManifest(rawManifest);
  const text = manifestText(manifest);
  try {
    await writeFile(path, text, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await chmod(path, 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('manifest 已存在；拒絕覆寫。');
    throw error;
  }
  const persisted = await readFile(path, 'utf8');
  if (persisted !== text) throw new Error('manifest write/read-back 不一致。');
  return { path, sha256: sha256(persisted) };
};

export const readOwnershipTransferManifest = async (path, expectedSha) => {
  const text = await readFile(path, 'utf8');
  const actualSha = sha256(text);
  const expected = Buffer.from(expectedSha, 'hex');
  const actual = Buffer.from(actualSha, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('manifest SHA256 驗證失敗。');
  }
  return { manifest: validateOwnershipTransferManifest(JSON.parse(text)), sha256: actualSha };
};

const inspectManifest = async ({ database, firestore, auth, manifest, invocationId = '',
  acquiredAt = 0, requireComplete = false }) => {
  const transfers = manifest.entries.map(({ roomId, expectedTitle, fromUid, toUid }) => ({
    roomId, expectedTitle, fromUid, toUid,
  }));
  await validateTargetUsers({ auth, transfers });
  const inviteRoot = snapshotValue(await database.ref('tripInvites').get()) || {};
  if (!isRecord(inviteRoot)) throw new Error('tripInvites root 格式不正確。');
  const states = [];
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const entry = manifest.entries[index];
    const transfer = transfers[index];
    const lock = invocationId ? expectedLock({ manifest, entry, invocationId, acquiredAt }) : null;
    const state = await readEntry({ database, firestore, transfer, inviteRoot,
      manifestInviteHashes: entry.inviteHashes });
    const classification = validateManifestEntryState({ entry, state, allowedLock: lock,
      requireComplete, label: `entry ${index + 1}` });
    states.push({ state, classification, lock });
  }
  return states;
};

const acquireLease = async ({ database, lock }) => {
  const ref = database.ref(`${LEASE_ROOT}/${lock.roomId}`);
  const result = await ref.transaction((current) => {
    if (current === null) return lock;
    if (lockMatches(current, lock)) return current;
    return undefined;
  }, undefined, false);
  if (!result.committed || !lockMatches(snapshotValue(result.snapshot), lock)) {
    throw new Error(`${lock.roomId} foreign maintenance lease；拒絕取得。`);
  }
};

const acquireGuard = async ({ firestore, lock }) => {
  const ref = firestore.doc(`tripAccess/${lock.roomId}`);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) transaction.create(ref, lock);
    else if (!lockMatches(snapshot.data(), lock)) throw new Error(`${lock.roomId} foreign Firestore guard。`);
  });
};

const acquireCanonicalLock = async ({ database, entry, lock }) => {
  const ref = database.ref(`roomAccess/${entry.roomId}`);
  let validationError = null;
  const result = await ref.transaction((current) => {
    // Firebase Admin can invoke this callback once with a local null before
    // fetching the server value. Returning null forces that read without ever
    // creating a maintenance namespace for a missing room.
    if (current === null) return current;
    try {
      const phase = canonicalAccessPhase({ entry, access: current, allowedLock: lock,
        label: entry.roomId });
      validationError = null;
      if (phase.canonicalLocked) return current;
      return { ...current, state: 'maintenance', maintenanceLock: lock };
    } catch (error) {
      validationError = error;
      return undefined;
    }
  }, undefined, false);
  if (validationError) throw validationError;
  const access = snapshotValue(result.snapshot);
  if (!result.committed
    || canonicalAccessPhase({ entry, access, allowedLock: lock,
      label: entry.roomId }).canonicalLocked !== true) {
    throw new Error(`${entry.roomId} canonical maintenance lock 未取得。`);
  }
};

const releaseLease = async ({ database, lock }) => {
  const ref = database.ref(`${LEASE_ROOT}/${lock.roomId}`);
  let matchedOwnedLease = false;
  const result = await ref.transaction((current) => {
    // Firebase Admin may invoke the callback with a local null before reading
    // the existing server value. Returning undefined there would abort the
    // transaction and strand the owned maintenance lease.
    if (current === null) return current;
    matchedOwnedLease = lockMatches(current, lock);
    return matchedOwnedLease ? null : undefined;
  }, undefined, false);
  if (!matchedOwnedLease || !result.committed || snapshotValue(result.snapshot) !== null) {
    throw new Error(`${lock.roomId} owned maintenance lease 未釋放。`);
  }
};

const releaseGuard = async ({ firestore, lock }) => {
  const ref = firestore.doc(`tripAccess/${lock.roomId}`);
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || !lockMatches(snapshot.data(), lock)) {
      throw new Error(`${lock.roomId} owned Firestore guard 未釋放。`);
    }
    transaction.delete(ref);
  });
};

const releaseCanonicalLock = async ({ database, entry, lock }) => {
  const ref = database.ref(`roomAccess/${entry.roomId}`);
  let validationError = null;
  const result = await ref.transaction((current) => {
    if (current === null) return current;
    try {
      const phase = canonicalAccessPhase({ entry, access: current, allowedLock: lock,
        label: entry.roomId });
      validationError = null;
      if (phase.phase !== 'complete' || !phase.canonicalLocked) return undefined;
      const next = { ...current, state: 'ready' };
      delete next.maintenanceLock;
      return next;
    } catch (error) {
      validationError = error;
      return undefined;
    }
  }, undefined, false);
  if (validationError) throw validationError;
  const access = snapshotValue(result.snapshot);
  if (!result.committed || access?.state !== 'ready' || access?.maintenanceLock !== undefined) {
    throw new Error(`${entry.roomId} canonical maintenance lock 未安全釋放。`);
  }
  canonicalAccessPhase({ entry, access, label: entry.roomId });
};

const buildRtdbUpdates = ({ manifest, states }) => {
  const updates = {};
  manifest.entries.forEach((entry, index) => {
    const { state } = states[index];
    if (isRtdbTransferComplete({ entry, state })) return;
    const updatedAt = Number(state.lease.acquiredAt);
    const fromMember = state.access.members[entry.fromUid];
    const toMember = state.access.members[entry.toUid];
    updates[`rooms/${entry.roomId}/meta/ownerUid`] = entry.toUid;
    updates[`roomAccess/${entry.roomId}/ownerUid`] = entry.toUid;
    updates[`roomAccess/${entry.roomId}/members/${entry.fromUid}`] = {
      ...fromMember, role: 'editor', status: 'active',
      aclVersion: entry.nextAclVersions.from, updatedAt,
    };
    updates[`roomAccess/${entry.roomId}/members/${entry.toUid}`] = {
      ...toMember, role: 'owner', status: 'active',
      aclVersion: entry.nextAclVersions.to, updatedAt,
    };
    updates[`userTrips/${entry.fromUid}/${entry.roomId}`] = {
      ...state.fromTrip, role: 'editor', status: 'active',
      aclVersion: entry.nextAclVersions.from, updatedAt,
    };
    updates[`userTrips/${entry.toUid}/${entry.roomId}`] = {
      ...state.toTrip, role: 'owner', status: 'active',
      aclVersion: entry.nextAclVersions.to, updatedAt,
    };
    updates[`roomAccess/${entry.roomId}/invite`] = null;
    updates[`roomAccess/${entry.roomId}/inviteVersion`] = entry.nextInviteVersion;
    updates[`roomAccess/${entry.roomId}/lastInviteRevokedAt`] = updatedAt;
    updates[`roomAccess/${entry.roomId}/lastInviteRevokedByUid`] = entry.fromUid;
  });
  return updates;
};

const removeManifestInviteLookups = async ({ database, manifest, states }) => {
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const entry = manifest.entries[index];
    for (const hash of states[index].state.lookupHashes) {
      if (!entry.inviteHashes.includes(hash)) {
        throw new Error(`${entry.roomId} 含 manifest 未授權的 invite lookup。`);
      }
      const ref = database.ref(`tripInvites/${hash}`);
      const result = await ref.transaction((current) => {
        // Force the Admin SDK to fetch an existing server value before the
        // room binding is evaluated. A missing lookup is already clean.
        if (current === null) return current;
        return current?.roomId === entry.roomId ? null : undefined;
      }, undefined, false);
      const remaining = snapshotValue(result.snapshot);
      if (remaining !== null) {
        throw new Error(`${entry.roomId} invite lookup 已指向其他 room；拒絕刪除。`);
      }
    }
  }
};

const writeFirestoreAcl = async ({ firestore, manifest, states }) => {
  const pending = manifest.entries.flatMap((entry, index) => (
    isFirestoreTransferComplete({ entry, state: states[index].state }) ? [] : [[entry, index]]
  ));
  if (pending.length === 0) return;
  const batch = firestore.batch();
  pending.forEach(([entry, index]) => {
    const { state } = states[index];
    const updatedAt = Number(state.lease.acquiredAt);
    batch.set(firestore.doc(`tripAccess/${entry.roomId}/members/${entry.fromUid}`), {
      ...state.fromAcl, uid: entry.fromUid, role: 'editor', status: 'active',
      aclVersion: entry.nextAclVersions.from, updatedAt: new Date(updatedAt),
    });
    batch.set(firestore.doc(`tripAccess/${entry.roomId}/members/${entry.toUid}`), {
      ...state.toAcl, uid: entry.toUid, role: 'owner', status: 'active',
      aclVersion: entry.nextAclVersions.to, updatedAt: new Date(updatedAt),
    });
  });
  await batch.commit();
};

export const applyOwnershipTransferManifest = async ({ database, firestore, auth, rawManifest,
  invocationId, acquiredAt = Date.now() }) => {
  const manifest = validateOwnershipTransferManifest(rawManifest);
  const id = requireInvocationId(invocationId);
  requireTimestamp(acquiredAt, 'lock');
  // This entire pass is read-only and happens before the first lock write.
  await inspectManifest({ database, firestore, auth, manifest, invocationId: id, acquiredAt });
  const locks = manifest.entries.map((entry) => expectedLock({ manifest, entry,
    invocationId: id, acquiredAt }));
  for (const lock of locks) await acquireLease({ database, lock });
  for (const lock of locks) await acquireGuard({ firestore, lock });
  for (let index = 0; index < locks.length; index += 1) {
    await acquireCanonicalLock({ database, entry: manifest.entries[index], lock: locks[index] });
  }
  const states = await inspectManifest({ database, firestore, auth, manifest,
    invocationId: id, acquiredAt });
  if (states.some(({ classification }) => !classification.endsWith('-locked'))) {
    throw new Error('canonical maintenance lock 驗證失敗。');
  }
  if (states.some(({ classification }) => classification !== 'complete-locked')) {
    const updates = buildRtdbUpdates({ manifest, states });
    if (Object.keys(updates).length > 0) await database.ref().update(updates);
    let afterRtdb = await inspectManifest({ database, firestore, auth, manifest,
      invocationId: id, acquiredAt });
    await removeManifestInviteLookups({ database, manifest, states: afterRtdb });
    afterRtdb = await inspectManifest({ database, firestore, auth, manifest,
      invocationId: id, acquiredAt });
    await writeFirestoreAcl({ firestore, manifest, states: afterRtdb });
  }
  await inspectManifest({ database, firestore, auth, manifest, invocationId: id,
    acquiredAt, requireComplete: true });
  for (const lock of [...locks].reverse()) await releaseGuard({ firestore, lock });
  for (const lock of [...locks].reverse()) await releaseLease({ database, lock });
  for (let index = locks.length - 1; index >= 0; index -= 1) {
    await releaseCanonicalLock({ database, entry: manifest.entries[index], lock: locks[index] });
  }
  await inspectManifest({ database, firestore, auth, manifest, requireComplete: true });
  return { verifiedCount: manifest.entries.length };
};

export const verifyOwnershipTransferManifest = async ({ database, firestore, auth, rawManifest }) => {
  const manifest = validateOwnershipTransferManifest(rawManifest);
  await inspectManifest({ database, firestore, auth, manifest, requireComplete: true });
  return { verifiedCount: manifest.entries.length };
};

export const parseOwnershipTransferCli = (args = process.argv.slice(2)) => {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: {
    mapping: { type: 'string' }, manifest: { type: 'string' }, project: { type: 'string' },
    'database-url': { type: 'string' }, 'expected-count': { type: 'string' },
    apply: { type: 'boolean', default: false }, verify: { type: 'boolean', default: false },
    'invocation-id': { type: 'string' }, 'confirm-project': { type: 'string' },
    'confirm-database-host': { type: 'string' }, 'confirm-count': { type: 'string' },
    'confirm-candidate-count': { type: 'string' }, 'confirm-manifest-sha256': { type: 'string' },
    'confirm-maintenance-window': { type: 'string' }, help: { type: 'boolean', default: false },
  } });
  if (values.help) return { help: true };
  const projectId = trimText(values.project);
  const databaseURL = trimText(values['database-url']);
  if (!projectId || !databaseURL || !values.manifest) {
    throw new Error('必須提供 --project、--database-url 與 --manifest。');
  }
  const parsedUrl = validateDatabaseTargetUrl(databaseURL, projectId);
  const expectedCount = requireCount(values['expected-count'], '--expected-count');
  if (values.apply && values.verify) throw new Error('--apply 與 --verify 只能擇一。');
  const phase = values.apply ? 'apply' : values.verify ? 'verify' : 'plan';
  const mappingPath = trimText(values.mapping);
  if (phase === 'plan' && !mappingPath) throw new Error('PLAN 必須提供 --mapping。');
  if (phase === 'plan' && !MANIFEST_NAME.test(basename(resolve(mappingPath)))) {
    throw new Error('mapping 檔名必須符合 trip-owner-transfer*.local.json。');
  }
  let manifestSha256 = '';
  let confirmedCandidateCount = null;
  if (phase !== 'plan') {
    manifestSha256 = trimText(values['confirm-manifest-sha256']).toLowerCase();
    if (!SHA256.test(manifestSha256)) throw new Error('--confirm-manifest-sha256 必須是 64 字元 SHA256。');
  }
  if (phase === 'apply') {
    if (values['confirm-project'] !== projectId) throw new Error('--confirm-project 必須完全相同。');
    if (values['confirm-database-host'] !== parsedUrl.hostname) {
      throw new Error('--confirm-database-host 必須完全相同。');
    }
    if (requireCount(values['confirm-count'], '--confirm-count') !== expectedCount) {
      throw new Error('--confirm-count 必須完全相同。');
    }
    confirmedCandidateCount = requireCount(values['confirm-candidate-count'],
      '--confirm-candidate-count', { allowZero: true });
    if (values['confirm-maintenance-window'] !== MAINTENANCE_CONFIRMATION) {
      throw new Error(`--confirm-maintenance-window 必須是 ${MAINTENANCE_CONFIRMATION}。`);
    }
  }
  return { phase, mappingPath: mappingPath ? resolve(mappingPath) : '',
    manifestPath: requireManifestPath(values.manifest), projectId,
    databaseURL: parsedUrl.toString(), expectedCount, confirmedCandidateCount,
    manifestSha256, invocationId: values['invocation-id'] ? requireInvocationId(values['invocation-id']) : '' };
};

const assertManifestOptions = ({ manifest, options }) => {
  if (manifest.target.projectId !== options.projectId
    || manifest.target.databaseHost !== new URL(options.databaseURL).hostname
    || manifest.expectedCount !== options.expectedCount) throw new Error('manifest target/count 與 CLI 不一致。');
  if (options.phase === 'apply' && manifest.candidateCount !== options.confirmedCandidateCount) {
    throw new Error('--confirm-candidate-count 與 manifest 不一致。');
  }
};

export const executeOwnershipTransfer = async ({ options, database, firestore, auth,
  invocationId = options.invocationId || randomUUID() }) => {
  if (options.phase === 'plan') {
    const rawMapping = JSON.parse(await readFile(options.mappingPath, 'utf8'));
    const manifest = await createOwnershipTransferManifest({ database, firestore, auth,
      rawMapping, projectId: options.projectId, databaseURL: options.databaseURL,
      expectedCount: options.expectedCount });
    return { phase: 'plan', totalCount: manifest.expectedCount,
      candidateCount: manifest.candidateCount, completeCount: manifest.completeCount,
      ...(await writeOwnershipTransferManifest(options.manifestPath, manifest)) };
  }
  const loaded = await readOwnershipTransferManifest(options.manifestPath, options.manifestSha256);
  assertManifestOptions({ manifest: loaded.manifest, options });
  if (options.phase === 'verify') return { phase: 'verify',
    ...(await verifyOwnershipTransferManifest({ database, firestore, auth,
      rawManifest: loaded.manifest })) };
  return { phase: 'apply', invocationId,
    ...(await applyOwnershipTransferManifest({ database, firestore, auth,
      rawManifest: loaded.manifest, invocationId })) };
};

const errorMessage = (error) => error instanceof Error ? error.message : String(error);
export const withFirebaseAdminAppCleanup = async ({ app, operation, cleanup = deleteApp }) => {
  let result; let operationError = null; let cleanupError = null;
  let operationFailed = false; let cleanupFailed = false;
  try { result = await operation(); } catch (error) { operationFailed = true; operationError = error; }
  try { await cleanup(app); } catch (error) { cleanupFailed = true; cleanupError = error; }
  if (operationFailed && cleanupFailed) {
    const combined = new Error(`${errorMessage(operationError)}；Firebase Admin cleanup 也失敗：${errorMessage(cleanupError)}`,
      { cause: operationError });
    combined.errors = [operationError, cleanupError];
    throw combined;
  }
  if (operationFailed) throw operationError;
  if (cleanupFailed) throw cleanupError;
  return result;
};

const run = async () => {
  const options = parseOwnershipTransferCli();
  if (options.help) {
    console.log(`Usage:
  npm run transfer:trip-owner -- --mapping <trip-owner-transfer*.local.json> --manifest <trip-owner-transfer*.local.json> --project <project-id> --database-url <url> --expected-count <n>
  npm run transfer:trip-owner -- --apply --manifest <file> --project <project-id> --database-url <url> --expected-count <n> --confirm-project <id> --confirm-database-host <host> --confirm-count <n> --confirm-candidate-count <n> --confirm-manifest-sha256 <sha256> --confirm-maintenance-window production-paused-users-inactive [--invocation-id <printed-id>]
  npm run transfer:trip-owner -- --verify --manifest <file> --project <project-id> --database-url <url> --expected-count <n> --confirm-manifest-sha256 <sha256>

PLAN is the default and performs Firebase reads only. APPLY prints its invocation ID before writes; reuse it after an interrupted run.`);
    return;
  }
  assertOwnershipTransferEnvironment({ projectId: options.projectId });
  const invocationId = options.phase === 'apply' ? options.invocationId || randomUUID() : '';
  const app = initializeApp({ credential: applicationDefault(), projectId: options.projectId,
    databaseURL: options.databaseURL }, `trip-owner-transfer-${Date.now()}`);
  await withFirebaseAdminAppCleanup({ app, operation: async () => {
    if (invocationId) console.log(`Apply invocation ID: ${invocationId}`);
    const result = await executeOwnershipTransfer({ options, database: getDatabase(app),
      firestore: getFirestore(app), auth: getAuth(app), invocationId });
    console.log(`Target project: ${options.projectId}`);
    console.log(`Target database host: ${new URL(options.databaseURL).hostname}`);
    if (result.phase === 'plan') {
      console.log(`PLAN total=${result.totalCount} candidates=${result.candidateCount} complete=${result.completeCount}`);
      console.log(`Manifest: ${result.path}`);
      console.log(`Manifest SHA256: ${result.sha256}`);
      console.log('No Firebase data was changed.');
    } else console.log(`${result.phase.toUpperCase()} verified=${result.verifiedCount}`);
  } });
};

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) run().catch((error) => {
  console.error(`Trip ownership transfer failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
