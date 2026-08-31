/* global process */

import { Buffer } from 'node:buffer';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

import {
  readFirebaseStorageDownloadTokens,
  scanLegacyRootTicketObjects,
  scanStorageDownloadTokens,
  validateDatabaseTargetUrl,
  validateStorageBucket,
} from './migrate-legacy-trip-access.js';

const MANIFEST_VERSION = 1;
const MANIFEST_OPERATION = 'legacy-ticket-storage-path-repair';
const LEGACY_SOURCE_METADATA_KEY = 'travelAppLegacySourcePath';
const REPAIR_SOURCE_METADATA_KEY = 'travelAppTicketPathRepairSource';
const REPAIR_HOLD_RUN_METADATA_KEY = 'travelAppTicketPathRepairHoldRunId';
const REPAIR_HOLD_STATE_METADATA_KEY = 'travelAppTicketPathRepairHoldState';
const REPAIR_DESTINATION_HOLD_RUN_METADATA_KEY = 'travelAppTicketPathRepairDestinationHoldRunId';
const REPAIR_DESTINATION_HOLD_STATE_METADATA_KEY = (
  'travelAppTicketPathRepairDestinationHoldState'
);
const HOLD_STATE_HELD = 'held';
const HOLD_STATE_RELEASED = 'released';
const FORBIDDEN_RTDB_KEY = /[.#$[\]/]/;
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const SHA256_PATTERN = /^[a-f\d]{64}$/u;
const MAX_REPAIR_COUNT = 100;
const PRIVATE_CACHE_CONTROL = 'private, no-store, max-age=0';
const MANIFEST_BASENAME_PATTERN = /^legacy-ticket-path-repair.*\.local\.json$/u;
const REPAIR_LEASE_VERSION = 1;
const REPAIR_LEASE_NAMESPACE = 'maintenanceRepairs/legacyTicketPath';

const trimText = (value) => String(value ?? '').trim();

const requirePathSegment = (value, label, maxLength) => {
  const normalized = trimText(value);
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

const requireStorageFileName = (value) => {
  const fileName = String(value ?? '');
  if (
    !fileName
    || fileName.length > 240
    || fileName === '.'
    || fileName === '..'
    || fileName.includes('\0')
    || fileName.includes('/')
  ) {
    throw new Error('legacy ticket fileName 格式不正確。');
  }
  return fileName;
};

const requireExpectedCount = (value, label = '--expected-count') => {
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_REPAIR_COUNT) {
    throw new Error(`${label} 必須是 1–${MAX_REPAIR_COUNT} 的整數。`);
  }
  return count;
};

const requireManifestPath = (value) => {
  const absolutePath = resolve(trimText(value));
  if (!MANIFEST_BASENAME_PATTERN.test(basename(absolutePath))) {
    throw new Error('manifest 檔名必須符合 legacy-ticket-path-repair*.local.json。');
  }
  return absolutePath;
};

const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const assertExactKeys = (value, expectedKeys, label) => {
  if (!isRecord(value)) throw new Error(`${label} 格式不正確。`);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} 含未預期欄位。`);
  }
};

const isStorageObjectNotFound = (error) => Number(error?.code) === 404
  || error?.errors?.some(({ reason }) => reason === 'notFound');

const getStorageObjectState = async (bucket, objectName) => {
  const file = bucket.file(objectName);
  try {
    const [metadata] = await file.getMetadata();
    return { file, metadata };
  } catch (error) {
    if (isStorageObjectNotFound(error)) return null;
    throw error;
  }
};

const readFingerprint = (metadata, label) => {
  const generation = trimText(metadata?.generation);
  const metageneration = trimText(metadata?.metageneration);
  const size = trimText(metadata?.size);
  const crc32c = trimText(metadata?.crc32c);
  const md5Hash = trimText(metadata?.md5Hash);
  if (!generation || !metageneration || !size || (!crc32c && !md5Hash)) {
    throw new Error(`${label} 缺少可安全驗證的 Storage metadata。`);
  }
  return {
    generation,
    metageneration,
    size,
    crc32c,
    md5Hash,
  };
};

const assertFingerprintMatches = (actual, expected, label) => {
  for (const key of ['generation', 'metageneration', 'size', 'crc32c', 'md5Hash']) {
    if (expected[key] !== undefined && trimText(actual[key]) !== trimText(expected[key])) {
      throw new Error(`${label} 的 ${key} 與 manifest 不一致。`);
    }
  }
};

const assertContentFingerprintMatches = (actual, expected, label) => {
  if (
    trimText(actual.size) !== trimText(expected.size)
    || (
      trimText(expected.crc32c)
      && trimText(actual.crc32c) !== trimText(expected.crc32c)
    )
    || (
      trimText(expected.md5Hash)
      && trimText(actual.md5Hash) !== trimText(expected.md5Hash)
    )
  ) {
    throw new Error(`${label} 的內容 fingerprint 不一致。`);
  }
};

const assertNoDownloadTokens = (metadata, label) => {
  if (readFirebaseStorageDownloadTokens(metadata).length > 0) {
    throw new Error(`${label} 仍含 Firebase download token。`);
  }
};

const sameSortedStrings = (left, right) => {
  const normalizedLeft = [...left].sort();
  const normalizedRight = [...right].sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

const assertStorageInventory = async ({
  bucket,
  expectedMalformedObjectNames,
  allowMissingExpected = false,
}) => {
  const [inventory, legacyRootInventory] = await Promise.all([
    scanStorageDownloadTokens(bucket),
    scanLegacyRootTicketObjects(bucket),
  ]);
  if (inventory.tokenCount !== 0) {
    throw new Error('Storage rooms/** 仍含 Firebase download token。');
  }
  if (
    legacyRootInventory.objectCount !== 0
    || legacyRootInventory.malformedObjectCount !== 0
    || legacyRootInventory.tokenCount !== 0
  ) {
    throw new Error('Storage legacy root tickets/** inventory 必須完全為零。');
  }
  const actual = inventory.malformedObjectNames || [];
  const expected = [...expectedMalformedObjectNames];
  const hasUnexpected = actual.some((objectName) => !expected.includes(objectName));
  const matches = allowMissingExpected ? !hasUnexpected : sameSortedStrings(actual, expected);
  if (!matches) {
    throw new Error('Storage rooms/** malformed object inventory 與 repair manifest 不一致。');
  }
  return inventory;
};

const requireAclVersion = (value, label) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} aclVersion 必須是正整數。`);
  }
  return value;
};

export const validateRepairAccess = async ({
  database,
  firestore,
  roomId: rawRoomId,
  expectedAuthorization = null,
}) => {
  if (!database || !firestore) throw new Error('repair ACL validation 需要 RTDB 與 Firestore。');
  const roomId = requirePathSegment(rawRoomId, 'ACL roomId', 128);
  const [roomSnapshot, accessSnapshot, reservationSnapshot] = await Promise.all([
    database.ref(`rooms/${roomId}`).get(),
    database.ref(`roomAccess/${roomId}`).get(),
    database.ref(`roomReservations/${roomId}`).get(),
  ]);
  const room = roomSnapshot.val();
  const access = accessSnapshot.val();
  const reservation = reservationSnapshot.val();
  const ownerUid = requirePathSegment(room?.meta?.ownerUid, 'rooms meta.ownerUid', 128);
  if (
    !isRecord(access)
    || access.state !== 'ready'
    || trimText(access.ownerUid) !== ownerUid
    || !isRecord(access.members)
  ) {
    throw new Error('roomAccess canonical owner/state 不一致。');
  }
  const ownerMember = access.members[ownerUid];
  const aclVersion = requireAclVersion(ownerMember?.aclVersion, 'roomAccess owner');
  if (
    !isRecord(ownerMember)
    || ownerMember.uid !== ownerUid
    || ownerMember.role !== 'owner'
    || ownerMember.status !== 'active'
  ) {
    throw new Error('roomAccess owner member 不是 active owner。');
  }
  const otherOwners = Object.entries(access.members)
    .filter(([uid, member]) => uid !== ownerUid && member?.role === 'owner');
  if (otherOwners.length > 0) throw new Error('roomAccess 含非 canonical owner。');
  if (
    !isRecord(reservation)
    || reservation.roomId !== roomId
    || reservation.createdByUid !== ownerUid
  ) {
    throw new Error('roomReservations 與 canonical owner 不一致。');
  }

  const [userTripSnapshot, aclSnapshot] = await Promise.all([
    database.ref(`userTrips/${ownerUid}/${roomId}`).get(),
    firestore.doc(`tripAccess/${roomId}/members/${ownerUid}`).get(),
  ]);
  const userTrip = userTripSnapshot.val();
  const acl = aclSnapshot.exists ? aclSnapshot.data() : null;
  if (
    !isRecord(userTrip)
    || userTrip.role !== 'owner'
    || userTrip.status !== 'active'
    || requireAclVersion(userTrip.aclVersion, 'userTrips owner') !== aclVersion
  ) {
    throw new Error('userTrips owner mirror 與 canonical owner 不一致。');
  }
  if (
    !isRecord(acl)
    || acl.uid !== ownerUid
    || acl.role !== 'owner'
    || acl.status !== 'active'
    || requireAclVersion(acl.aclVersion, 'Firestore owner') !== aclVersion
  ) {
    throw new Error('Firestore ACL mirror 與 canonical owner 不一致。');
  }
  const authorization = { ownerUid, aclVersion };
  if (
    expectedAuthorization
    && (
      expectedAuthorization.ownerUid !== ownerUid
      || expectedAuthorization.aclVersion !== aclVersion
    )
  ) {
    throw new Error('owner/ACL state 與 repair manifest 發生漂移。');
  }
  return authorization;
};

const getTicketEntries = (tickets) => {
  if (!tickets || typeof tickets !== 'object') {
    throw new Error('找不到可修復的 tickets collection。');
  }
  return Object.entries(tickets).filter(([, ticket]) => ticket !== null && ticket !== undefined);
};

export const buildLegacyTicketPathCandidates = ({ roomId: rawRoomId, tickets, expectedCount }) => {
  const roomId = requirePathSegment(rawRoomId, 'roomId', 128);
  const requiredCount = requireExpectedCount(expectedCount);
  const candidates = [];
  const seenTicketIds = new Set();
  const seenSources = new Set();
  const seenDestinations = new Set();

  for (const [rawTicketKey, ticket] of getTicketEntries(tickets)) {
    if (!isRecord(ticket)) throw new Error('ticket record 格式不正確。');
    const ticketKey = requirePathSegment(rawTicketKey, 'ticket key', 128);
    const ticketId = requirePathSegment(ticket.id, 'ticket.id', 128);
    if (seenTicketIds.has(ticketId)) throw new Error(`tickets 含重複 ticket.id：${ticketId}`);
    seenTicketIds.add(ticketId);
    const storagePath = trimText(ticket.storagePath);
    if (!storagePath) continue;
    if (trimText(ticket.url)) {
      throw new Error(`ticket ${ticketKey} 同時保留 storagePath 與 url，拒絕自動修復。`);
    }

    const segments = storagePath.split('/');
    if (
      segments[0] !== 'rooms'
      || segments[1] !== roomId
      || segments[2] !== 'tickets'
      || !segments.every(Boolean)
    ) {
      throw new Error(`ticket ${ticketKey} 的 storagePath 不屬於指定 room。`);
    }

    if (segments.length === 5) {
      if (segments[3] !== ticketId) {
        throw new Error(`ticket ${ticketKey} 的 canonical storagePath 與 ticket.id 不一致。`);
      }
      requireStorageFileName(segments[4]);
      continue;
    }

    if (segments.length !== 4) {
      throw new Error(`ticket ${ticketKey} 的 storagePath 不是可辨識的 legacy/canonical 格式。`);
    }

    const fileName = requireStorageFileName(segments[3]);
    const sourceObjectName = storagePath;
    const destinationObjectName = `rooms/${roomId}/tickets/${ticketId}/${fileName}`;
    if (seenSources.has(sourceObjectName) || seenDestinations.has(destinationObjectName)) {
      throw new Error('repair plan 含重複 Storage source 或 destination。');
    }
    seenSources.add(sourceObjectName);
    seenDestinations.add(destinationObjectName);
    candidates.push({
      ticketKey,
      ticketId,
      fileName,
      rtdbPath: `rooms/${roomId}/tickets/${ticketKey}/storagePath`,
      sourceObjectName,
      destinationObjectName,
    });
  }

  if (candidates.length !== requiredCount) {
    throw new Error(`偵測到 ${candidates.length} 筆 repair candidate，與 --expected-count ${requiredCount} 不一致。`);
  }
  return candidates.sort((left, right) => left.ticketKey.localeCompare(right.ticketKey, 'en'));
};

const assertTrustedSource = ({ state, candidate, manifestSource = null }) => {
  if (!state) throw new Error('repair source Storage object 不存在。');
  assertNoDownloadTokens(state.metadata, 'repair source');
  const expectedLegacySource = `tickets/${candidate.fileName}`;
  const legacySource = trimText(
    state.metadata?.metadata?.[LEGACY_SOURCE_METADATA_KEY],
  );
  if (legacySource !== expectedLegacySource) {
    throw new Error('repair source 缺少原 migration 的可信任 legacy marker。');
  }
  const fingerprint = readFingerprint(state.metadata, 'repair source');
  if (manifestSource) {
    assertFingerprintMatches(fingerprint, manifestSource, 'repair source');
    if (manifestSource.legacySourcePath !== expectedLegacySource) {
      throw new Error('manifest legacySourcePath 與 candidate 不一致。');
    }
  }
  return { ...fingerprint, legacySourcePath: legacySource };
};

const assertTemporaryHoldOwnershipState = ({
  metadata,
  repairRunId,
  runMetadataKey,
  stateMetadataKey,
  label,
}) => {
  const customMetadata = metadata?.metadata || {};
  const markerRunId = trimText(customMetadata[runMetadataKey]);
  const markerState = trimText(customMetadata[stateMetadataKey]);
  const expectedRunId = trimText(repairRunId);
  const isHeld = metadata?.temporaryHold === true;
  const hasMarker = Boolean(markerRunId || markerState);
  if (isHeld) {
    if (markerRunId !== expectedRunId || markerState !== HOLD_STATE_HELD) {
      throw new Error(`${label} 受 foreign temporaryHold 保護，拒絕接管或解除。`);
    }
  } else if (
    hasMarker
    && (markerRunId !== expectedRunId || markerState !== HOLD_STATE_RELEASED)
  ) {
    throw new Error(`${label} 的 temporaryHold ownership state 不一致。`);
  }
  return {
    isHeld,
    hasOwnedHistory: hasMarker && markerRunId === expectedRunId,
  };
};

const assertTrustedDestination = ({ state, entry, repairRunId }) => {
  if (!state) throw new Error('repair destination Storage object 不存在。');
  assertNoDownloadTokens(state.metadata, 'repair destination');
  if (state.metadata?.cacheControl !== PRIVATE_CACHE_CONTROL) {
    throw new Error('repair destination 未使用 private cache policy。');
  }
  const customMetadata = state.metadata?.metadata || {};
  if (
    trimText(customMetadata[REPAIR_SOURCE_METADATA_KEY]) !== entry.beforeStoragePath
    || trimText(customMetadata.roomId) !== entry.roomId
    || trimText(customMetadata.ticketId) !== entry.ticketId
    || trimText(customMetadata[LEGACY_SOURCE_METADATA_KEY]) !== entry.source.legacySourcePath
  ) {
    throw new Error('repair destination 缺少可信任的 repair metadata。');
  }
  assertTemporaryHoldOwnershipState({
    metadata: state.metadata,
    repairRunId,
    runMetadataKey: REPAIR_DESTINATION_HOLD_RUN_METADATA_KEY,
    stateMetadataKey: REPAIR_DESTINATION_HOLD_STATE_METADATA_KEY,
    label: 'repair destination',
  });
  const fingerprint = readFingerprint(state.metadata, 'repair destination');
  assertContentFingerprintMatches(fingerprint, entry.source, 'repair destination');
  return fingerprint;
};

const manifestEntryFromCandidate = ({ roomId, candidate, source }) => ({
  roomId,
  ticketKey: candidate.ticketKey,
  ticketId: candidate.ticketId,
  fileName: candidate.fileName,
  rtdbPath: candidate.rtdbPath,
  beforeStoragePath: candidate.sourceObjectName,
  afterStoragePath: candidate.destinationObjectName,
  source,
});

export const createRepairManifest = async ({
  database,
  firestore,
  bucket,
  projectId,
  databaseURL,
  storageBucket,
  roomId,
  expectedCount,
  runId = randomUUID(),
  now = new Date(),
}) => {
  const normalizedRoomId = requirePathSegment(roomId, 'roomId', 128);
  const normalizedCount = requireExpectedCount(expectedCount);
  const normalizedRunId = requirePathSegment(runId, 'runId', 128);
  const authorization = await validateRepairAccess({
    database,
    firestore,
    roomId: normalizedRoomId,
  });
  const ticketsSnapshot = await database.ref(`rooms/${normalizedRoomId}/tickets`).get();
  if (!ticketsSnapshot.exists()) throw new Error('指定 room 沒有 tickets 資料。');
  const candidates = buildLegacyTicketPathCandidates({
    roomId: normalizedRoomId,
    tickets: ticketsSnapshot.val(),
    expectedCount: normalizedCount,
  });

  const entries = [];
  for (const candidate of candidates) {
    const [sourceState, destinationState] = await Promise.all([
      getStorageObjectState(bucket, candidate.sourceObjectName),
      getStorageObjectState(bucket, candidate.destinationObjectName),
    ]);
    const source = assertTrustedSource({ state: sourceState, candidate });
    assertTemporaryHoldOwnershipState({
      metadata: sourceState.metadata,
      repairRunId: normalizedRunId,
      runMetadataKey: REPAIR_HOLD_RUN_METADATA_KEY,
      stateMetadataKey: REPAIR_HOLD_STATE_METADATA_KEY,
      label: 'repair source',
    });
    const entry = manifestEntryFromCandidate({ roomId: normalizedRoomId, candidate, source });
    if (destinationState) {
      assertTrustedDestination({
        state: destinationState,
        entry,
        repairRunId: normalizedRunId,
      });
    }
    entries.push(entry);
  }

  await assertStorageInventory({
    bucket,
    expectedMalformedObjectNames: entries.map((entry) => entry.beforeStoragePath),
  });

  const manifest = {
    version: MANIFEST_VERSION,
    operation: MANIFEST_OPERATION,
    runId: normalizedRunId,
    createdAt: now.toISOString(),
    target: {
      projectId: trimText(projectId),
      databaseHost: new URL(databaseURL).hostname,
      storageBucket: trimText(storageBucket),
      roomId: normalizedRoomId,
    },
    expectedCount: normalizedCount,
    authorization,
    entries,
  };
  return validateRepairManifest(manifest);
};

export const validateRepairManifest = (manifest) => {
  assertExactKeys(
    manifest,
    [
      'version',
      'operation',
      'runId',
      'createdAt',
      'target',
      'expectedCount',
      'authorization',
      'entries',
    ],
    'manifest',
  );
  if (manifest.version !== MANIFEST_VERSION || manifest.operation !== MANIFEST_OPERATION) {
    throw new Error('manifest version/operation 不受支援。');
  }
  const runId = requirePathSegment(manifest.runId, 'manifest runId', 128);
  if (!Number.isFinite(Date.parse(manifest.createdAt))) throw new Error('manifest createdAt 無效。');
  assertExactKeys(
    manifest.target,
    ['projectId', 'databaseHost', 'storageBucket', 'roomId'],
    'manifest target',
  );
  const projectId = trimText(manifest.target.projectId);
  const databaseHost = trimText(manifest.target.databaseHost).toLowerCase();
  const storageBucket = trimText(manifest.target.storageBucket);
  const roomId = requirePathSegment(manifest.target.roomId, 'manifest roomId', 128);
  if (!projectId || !databaseHost || !storageBucket || databaseHost.includes('/')) {
    throw new Error('manifest target 格式不正確。');
  }
  const expectedCount = requireExpectedCount(manifest.expectedCount, 'manifest expectedCount');
  assertExactKeys(manifest.authorization, ['ownerUid', 'aclVersion'], 'manifest authorization');
  const authorization = {
    ownerUid: requirePathSegment(
      manifest.authorization.ownerUid,
      'manifest authorization ownerUid',
      128,
    ),
    aclVersion: requireAclVersion(
      manifest.authorization.aclVersion,
      'manifest authorization',
    ),
  };
  if (!Array.isArray(manifest.entries) || manifest.entries.length !== expectedCount) {
    throw new Error('manifest entries 數量與 expectedCount 不一致。');
  }

  const seenTicketKeys = new Set();
  const seenTicketIds = new Set();
  const seenSources = new Set();
  const seenDestinations = new Set();
  const entries = manifest.entries.map((entry) => {
    assertExactKeys(
      entry,
      [
        'roomId',
        'ticketKey',
        'ticketId',
        'fileName',
        'rtdbPath',
        'beforeStoragePath',
        'afterStoragePath',
        'source',
      ],
      'manifest entry',
    );
    assertExactKeys(
      entry.source,
      ['generation', 'metageneration', 'size', 'crc32c', 'md5Hash', 'legacySourcePath'],
      'manifest source',
    );
    const entryRoomId = requirePathSegment(entry.roomId, 'manifest entry roomId', 128);
    const ticketKey = requirePathSegment(entry.ticketKey, 'manifest ticketKey', 128);
    const ticketId = requirePathSegment(entry.ticketId, 'manifest ticketId', 128);
    const fileName = requireStorageFileName(entry.fileName);
    const beforeStoragePath = `rooms/${roomId}/tickets/${fileName}`;
    const afterStoragePath = `rooms/${roomId}/tickets/${ticketId}/${fileName}`;
    const rtdbPath = `rooms/${roomId}/tickets/${ticketKey}/storagePath`;
    if (
      entryRoomId !== roomId
      || entry.beforeStoragePath !== beforeStoragePath
      || entry.afterStoragePath !== afterStoragePath
      || entry.rtdbPath !== rtdbPath
      || entry.source.legacySourcePath !== `tickets/${fileName}`
    ) {
      throw new Error('manifest entry 的衍生路徑不一致。');
    }
    const sourceFingerprint = readFingerprint(entry.source, 'manifest source');
    if (
      seenTicketKeys.has(ticketKey)
      || seenTicketIds.has(ticketId)
      || seenSources.has(beforeStoragePath)
      || seenDestinations.has(afterStoragePath)
    ) {
      throw new Error('manifest 含重複 ticket/source/destination。');
    }
    seenTicketKeys.add(ticketKey);
    seenTicketIds.add(ticketId);
    seenSources.add(beforeStoragePath);
    seenDestinations.add(afterStoragePath);
    return {
      roomId,
      ticketKey,
      ticketId,
      fileName,
      rtdbPath,
      beforeStoragePath,
      afterStoragePath,
      source: {
        ...sourceFingerprint,
        legacySourcePath: entry.source.legacySourcePath,
      },
    };
  });

  return {
    version: MANIFEST_VERSION,
    operation: MANIFEST_OPERATION,
    runId,
    createdAt: new Date(manifest.createdAt).toISOString(),
    target: { projectId, databaseHost, storageBucket, roomId },
    expectedCount,
    authorization,
    entries,
  };
};

export const serializeRepairManifest = (manifest) => {
  const normalized = validateRepairManifest(manifest);
  const serialized = `${JSON.stringify(normalized, null, 2)}\n`;
  if (/https?:\/\/|(?:^|[?&])token=|"(?:url|title|token)"\s*:/iu.test(serialized)) {
    throw new Error('manifest 含禁止的 URL、title 或 token 資料。');
  }
  return serialized;
};

export const sha256Hex = (value) => createHash('sha256').update(value).digest('hex');

export const writeRepairManifest = async (manifestPath, manifest) => {
  const absolutePath = requireManifestPath(manifestPath);
  const serialized = serializeRepairManifest(manifest);
  await writeFile(absolutePath, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  await chmod(absolutePath, 0o600);
  return { path: absolutePath, sha256: sha256Hex(serialized) };
};

const safeHashEquals = (actual, expected) => {
  if (!SHA256_PATTERN.test(actual) || !SHA256_PATTERN.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
};

export const readRepairManifest = async (manifestPath, expectedSha256) => {
  const absolutePath = requireManifestPath(manifestPath);
  const raw = await readFile(absolutePath, 'utf8');
  const actualSha256 = sha256Hex(raw);
  const normalizedExpected = trimText(expectedSha256).toLowerCase();
  if (!safeHashEquals(actualSha256, normalizedExpected)) {
    throw new Error('manifest SHA256 與 --confirm-manifest-sha256 不一致。');
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('manifest 不是有效 JSON。');
  }
  return {
    path: absolutePath,
    sha256: actualSha256,
    manifest: validateRepairManifest(parsed),
  };
};

const readTickets = async (database, roomId) => {
  const snapshot = await database.ref(`rooms/${roomId}/tickets`).get();
  if (!snapshot.exists()) throw new Error('repair 期間找不到 tickets collection。');
  return snapshot.val();
};

const assertTicketRecord = ({ tickets, entry, allowedStoragePaths }) => {
  const ticket = tickets?.[entry.ticketKey];
  if (!isRecord(ticket) || trimText(ticket.id) !== entry.ticketId) {
    throw new Error(`ticket ${entry.ticketKey} 已不存在或 id 漂移。`);
  }
  if (trimText(ticket.url)) throw new Error(`ticket ${entry.ticketKey} 的 url 發生漂移。`);
  const storagePath = trimText(ticket.storagePath);
  if (!allowedStoragePaths.includes(storagePath)) {
    throw new Error(`ticket ${entry.ticketKey} 的 storagePath 發生漂移。`);
  }
  return storagePath;
};

const assertNoUnplannedLegacyPaths = ({ tickets, manifest }) => {
  const plannedSources = new Map(
    manifest.entries.map((entry) => [entry.beforeStoragePath, entry]),
  );
  const seenTicketIds = new Map();
  const seenStoragePaths = new Map();
  for (const [rawTicketKey, ticket] of getTicketEntries(tickets)) {
    if (!isRecord(ticket)) throw new Error('ticket record 格式不正確。');
    const ticketKey = requirePathSegment(rawTicketKey, 'ticket key', 128);
    const ticketId = requirePathSegment(ticket.id, `ticket ${ticketKey} id`, 128);
    const previousIdTicketKey = seenTicketIds.get(ticketId);
    if (previousIdTicketKey !== undefined) {
      throw new Error(`tickets ${previousIdTicketKey}/${ticketKey} 含重複 ticket.id。`);
    }
    seenTicketIds.set(ticketId, ticketKey);
    const storagePath = trimText(ticket.storagePath);
    if (!storagePath) continue;
    if (trimText(ticket.url)) {
      throw new Error(`ticket ${ticketKey} 同時保留 storagePath 與 url。`);
    }
    const previousTicketKey = seenStoragePaths.get(storagePath);
    if (previousTicketKey !== undefined) {
      throw new Error(`tickets ${previousTicketKey}/${ticketKey} 重複引用同一 storagePath。`);
    }
    seenStoragePaths.set(storagePath, ticketKey);
    const segments = storagePath.split('/');
    if (
      segments[0] !== 'rooms'
      || segments[1] !== manifest.target.roomId
      || segments[2] !== 'tickets'
    ) {
      throw new Error(`ticket ${ticketKey} 出現未規劃的跨 room storagePath。`);
    }
    if (segments.length === 4) {
      const plannedEntry = plannedSources.get(storagePath);
      if (
        !plannedEntry
        || plannedEntry.ticketKey !== ticketKey
        || plannedEntry.ticketId !== ticketId
      ) {
        throw new Error(`ticket ${ticketKey} 非法採用未綁定的 legacy storagePath。`);
      }
      requireStorageFileName(segments[3]);
      continue;
    }
    if (segments.length === 5) {
      if (segments[3] !== ticketId) {
        throw new Error(`ticket ${ticketKey} canonical storagePath 與自身 id 不一致。`);
      }
      requireStorageFileName(segments[4]);
      continue;
    }
    if (segments.length !== 4 && segments.length !== 5) {
      throw new Error(`ticket ${ticketKey} 出現未規劃的 Storage path 深度。`);
    }
  }
};

const verifyRtdbState = async ({ database, manifest, allowedStoragePathsForEntry }) => {
  const tickets = await readTickets(database, manifest.target.roomId);
  assertNoUnplannedLegacyPaths({ tickets, manifest });
  const paths = new Map();
  for (const entry of manifest.entries) {
    paths.set(entry.ticketKey, assertTicketRecord({
      tickets,
      entry,
      allowedStoragePaths: allowedStoragePathsForEntry(entry),
    }));
  }
  return { tickets, paths };
};

const switchRtdbPaths = async ({ database, manifest, direction }) => {
  const toDestination = direction === 'apply';
  if (!toDestination && direction !== 'rollback') throw new Error('RTDB repair direction 無效。');
  let abortReason = '';
  const ticketsRef = database.ref(`rooms/${manifest.target.roomId}/tickets`);
  const result = await ticketsRef.transaction((current) => {
    // Admin RTDB may invoke the callback with a local null before fetching the
    // canonical server value. Returning null (not undefined) forces the
    // compare/retry round trip. A committed null snapshot is rejected below.
    if (current === null) return current;
    if (!current || typeof current !== 'object') {
      abortReason = 'transaction 找不到 tickets collection。';
      return undefined;
    }
    try {
      assertNoUnplannedLegacyPaths({ tickets: current, manifest });
    } catch (error) {
      abortReason = `transaction tickets invariant 失敗：${error.message}`;
      return undefined;
    }
    const next = structuredClone(current);
    for (const entry of manifest.entries) {
      const ticket = current?.[entry.ticketKey];
      if (!isRecord(ticket) || trimText(ticket.id) !== entry.ticketId || trimText(ticket.url)) {
        abortReason = `ticket ${entry.ticketKey} 在 transaction 前發生漂移。`;
        return undefined;
      }
      const sourcePath = toDestination ? entry.beforeStoragePath : entry.afterStoragePath;
      const targetPath = toDestination ? entry.afterStoragePath : entry.beforeStoragePath;
      const currentPath = trimText(ticket.storagePath);
      if (currentPath !== sourcePath && currentPath !== targetPath) {
        abortReason = `ticket ${entry.ticketKey} storagePath 在 transaction 前發生漂移。`;
        return undefined;
      }
      next[entry.ticketKey] = { ...next[entry.ticketKey], storagePath: targetPath };
    }
    return next;
  }, undefined, false);
  if (!result.committed || result.snapshot.val() === null) {
    throw new Error(abortReason || 'RTDB repair transaction 未提交或 canonical path 不存在。');
  }
};

const getEntryStorageStates = async ({ bucket, entry }) => {
  const [source, destination] = await Promise.all([
    getStorageObjectState(bucket, entry.beforeStoragePath),
    getStorageObjectState(bucket, entry.afterStoragePath),
  ]);
  return { entry, source, destination };
};

const assertSourceMatchesManifest = ({
  entry,
  source,
  allowMetagenerationDrift = false,
  repairRunId = '',
}) => {
  const holdOwnership = assertTemporaryHoldOwnershipState({
    metadata: source?.metadata,
    repairRunId,
    runMetadataKey: REPAIR_HOLD_RUN_METADATA_KEY,
    stateMetadataKey: REPAIR_HOLD_STATE_METADATA_KEY,
    label: 'repair source',
  });
  const actualMetageneration = trimText(source?.metadata?.metageneration);
  const expectedMetageneration = trimText(entry.source.metageneration);
  const hasMetagenerationDrift = actualMetageneration !== expectedMetageneration;
  if (hasMetagenerationDrift && !allowMetagenerationDrift) {
    throw new Error('repair source 的 metageneration 與 manifest 不一致。');
  }
  if (hasMetagenerationDrift) {
    if (!holdOwnership.hasOwnedHistory) {
      throw new Error('repair source metageneration 漂移且無可信任 temporaryHold 證明。');
    }
  }
  const manifestSource = hasMetagenerationDrift
    ? { ...entry.source, metageneration: undefined }
    : entry.source;
  return assertTrustedSource({
    state: source,
    candidate: {
      fileName: entry.fileName,
      sourceObjectName: entry.beforeStoragePath,
      destinationObjectName: entry.afterStoragePath,
    },
    manifestSource,
  });
};

const destinationCopyMetadata = ({ sourceMetadata, entry }) => {
  const metadata = {
    cacheControl: PRIVATE_CACHE_CONTROL,
    temporaryHold: false,
    metadata: {
      ...(sourceMetadata?.metadata || {}),
      firebaseStorageDownloadTokens: null,
      roomId: entry.roomId,
      ticketId: entry.ticketId,
      [LEGACY_SOURCE_METADATA_KEY]: entry.source.legacySourcePath,
      [REPAIR_SOURCE_METADATA_KEY]: entry.beforeStoragePath,
    },
  };
  for (const key of ['contentType', 'contentDisposition', 'contentEncoding', 'contentLanguage']) {
    if (trimText(sourceMetadata?.[key])) metadata[key] = sourceMetadata[key];
  }
  return metadata;
};

const copyDestination = async ({ bucket, entry, source }) => {
  const sourceGeneration = entry.source.generation;
  await bucket.file(entry.beforeStoragePath, { generation: sourceGeneration }).copy(
    bucket.file(entry.afterStoragePath),
    {
      ...destinationCopyMetadata({ sourceMetadata: source.metadata, entry }),
      preconditionOpts: { ifGenerationMatch: 0 },
    },
  );
};

const verifyAllDestinations = async ({ bucket, manifest }) => {
  const destinations = new Map();
  for (const entry of manifest.entries) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    const fingerprint = assertTrustedDestination({
      state: destination,
      entry,
      repairRunId: manifest.runId,
    });
    destinations.set(entry.ticketKey, { state: destination, fingerprint });
  }
  return destinations;
};

const setTemporaryHold = async ({
  bucket,
  objectName,
  state,
  enabled,
  ownerMetadataKey,
  ownerStateMetadataKey,
  ownerRunId,
  ownerLabel,
}) => {
  if (!state) throw new Error('temporaryHold target Storage object 不存在。');
  const currentlyEnabled = state.metadata?.temporaryHold === true;
  const existingCustomMetadata = state.metadata?.metadata || {};
  const ownership = assertTemporaryHoldOwnershipState({
    metadata: state.metadata,
    repairRunId: ownerRunId,
    runMetadataKey: ownerMetadataKey,
    stateMetadataKey: ownerStateMetadataKey,
    label: ownerLabel,
  });
  if (!enabled && !currentlyEnabled && !ownership.hasOwnedHistory) return state;
  const desiredState = enabled ? HOLD_STATE_HELD : HOLD_STATE_RELEASED;
  const ownershipPatch = {
    [ownerMetadataKey]: ownerRunId,
    [ownerStateMetadataKey]: desiredState,
  };
  const needsMetadataPatch = Object.entries(ownershipPatch)
    .some(([key, value]) => trimText(existingCustomMetadata[key]) !== trimText(value));
  if (currentlyEnabled === enabled && !needsMetadataPatch) return state;
  const generation = trimText(state.metadata?.generation);
  const metageneration = trimText(state.metadata?.metageneration);
  if (!generation || !metageneration) {
    throw new Error('temporaryHold target 缺少 generation/metageneration。');
  }
  const metadataUpdate = {
    temporaryHold: enabled,
    metadata: { ...existingCustomMetadata, ...ownershipPatch },
  };
  await bucket.file(objectName, { generation }).setMetadata(
    metadataUpdate,
    { ifMetagenerationMatch: metageneration },
  );
  const updated = await getStorageObjectState(bucket, objectName);
  if (!updated || (updated.metadata?.temporaryHold === true) !== enabled) {
    throw new Error(`temporaryHold ${enabled ? '設定' : '解除'}後驗證失敗。`);
  }
  assertTemporaryHoldOwnershipState({
    metadata: updated.metadata,
    repairRunId: ownerRunId,
    runMetadataKey: ownerMetadataKey,
    stateMetadataKey: ownerStateMetadataKey,
    label: ownerLabel,
  });
  return updated;
};

const holdDestinations = async ({ bucket, manifest }) => {
  for (const entry of manifest.entries) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    assertTrustedDestination({ state: destination, entry, repairRunId: manifest.runId });
    await setTemporaryHold({
      bucket,
      objectName: entry.afterStoragePath,
      state: destination,
      enabled: true,
      ownerMetadataKey: REPAIR_DESTINATION_HOLD_RUN_METADATA_KEY,
      ownerStateMetadataKey: REPAIR_DESTINATION_HOLD_STATE_METADATA_KEY,
      ownerRunId: manifest.runId,
      ownerLabel: 'repair destination',
    });
  }
  for (const entry of manifest.entries) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    assertTrustedDestination({ state: destination, entry, repairRunId: manifest.runId });
    if (destination.metadata?.temporaryHold !== true) {
      throw new Error('finalize destination 未受 temporaryHold 保護。');
    }
  }
};

const releaseDestinationHolds = async ({ bucket, manifest, allowMissing = false }) => {
  for (const entry of manifest.entries) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    if (!destination && allowMissing) continue;
    assertTrustedDestination({ state: destination, entry, repairRunId: manifest.runId });
    await setTemporaryHold({
      bucket,
      objectName: entry.afterStoragePath,
      state: destination,
      enabled: false,
      ownerMetadataKey: REPAIR_DESTINATION_HOLD_RUN_METADATA_KEY,
      ownerStateMetadataKey: REPAIR_DESTINATION_HOLD_STATE_METADATA_KEY,
      ownerRunId: manifest.runId,
      ownerLabel: 'repair destination',
    });
  }
};

const holdSources = async ({ bucket, manifest }) => {
  for (const entry of manifest.entries) {
    const source = await getStorageObjectState(bucket, entry.beforeStoragePath);
    assertSourceMatchesManifest({
      entry,
      source,
      allowMetagenerationDrift: true,
      repairRunId: manifest.runId,
    });
    await setTemporaryHold({
      bucket,
      objectName: entry.beforeStoragePath,
      state: source,
      enabled: true,
      ownerMetadataKey: REPAIR_HOLD_RUN_METADATA_KEY,
      ownerStateMetadataKey: REPAIR_HOLD_STATE_METADATA_KEY,
      ownerRunId: manifest.runId,
      ownerLabel: 'repair source',
    });
  }
  for (const entry of manifest.entries) {
    const source = await getStorageObjectState(bucket, entry.beforeStoragePath);
    assertSourceMatchesManifest({
      entry,
      source,
      allowMetagenerationDrift: true,
      repairRunId: manifest.runId,
    });
    if (source.metadata?.temporaryHold !== true) {
      throw new Error('rollback source 未受 temporaryHold 保護。');
    }
  }
};

const releaseSourceHolds = async ({ bucket, manifest }) => {
  for (const entry of manifest.entries) {
    const source = await getStorageObjectState(bucket, entry.beforeStoragePath);
    if (!source) continue;
    assertSourceMatchesManifest({
      entry,
      source,
      allowMetagenerationDrift: true,
      repairRunId: manifest.runId,
    });
    await setTemporaryHold({
      bucket,
      objectName: entry.beforeStoragePath,
      state: source,
      enabled: false,
      ownerMetadataKey: REPAIR_HOLD_RUN_METADATA_KEY,
      ownerStateMetadataKey: REPAIR_HOLD_STATE_METADATA_KEY,
      ownerRunId: manifest.runId,
      ownerLabel: 'repair source',
    });
  }
};

const verifySources = async ({
  bucket,
  manifest,
  allowMissing = false,
  requireTemporaryHold = null,
}) => {
  const states = [];
  for (const entry of manifest.entries) {
    const source = await getStorageObjectState(bucket, entry.beforeStoragePath);
    if (!source) {
      if (!allowMissing) throw new Error('repair source Storage object 不存在。');
      states.push({ entry, source: null });
      continue;
    }
    assertSourceMatchesManifest({
      entry,
      source,
      allowMetagenerationDrift: true,
      repairRunId: manifest.runId,
    });
    if (
      requireTemporaryHold !== null
      && (source.metadata?.temporaryHold === true) !== requireTemporaryHold
    ) {
      throw new Error(`repair source temporaryHold 必須為 ${requireTemporaryHold}。`);
    }
    states.push({ entry, source });
  }
  return states;
};

const verifyDestinationHoldState = async ({ bucket, manifest, expected }) => {
  for (const entry of manifest.entries) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    assertTrustedDestination({ state: destination, entry, repairRunId: manifest.runId });
    if ((destination.metadata?.temporaryHold === true) !== expected) {
      throw new Error(`repair destination temporaryHold 必須為 ${expected}。`);
    }
  }
};

const buildRepairLease = ({ manifest, phase, invocationId, now = new Date() }) => ({
  version: REPAIR_LEASE_VERSION,
  operation: MANIFEST_OPERATION,
  roomId: manifest.target.roomId,
  runId: manifest.runId,
  manifestSha256: sha256Hex(serializeRepairManifest(manifest)),
  phase,
  invocationId: requirePathSegment(invocationId || randomUUID(), 'repair invocationId', 128),
  acquiredAt: now.toISOString(),
});

const acquireRepairLease = async ({
  database,
  manifest,
  phase,
  invocationId,
}) => {
  const lease = buildRepairLease({ manifest, phase, invocationId });
  const leaseRef = database.ref(`${REPAIR_LEASE_NAMESPACE}/${manifest.target.roomId}`);
  let blockingInvocationId = '';
  const result = await leaseRef.transaction((current) => {
    if (current === null) return lease;
    blockingInvocationId = trimText(current?.invocationId);
    return undefined;
  }, undefined, false);
  if (!result.committed || result.snapshot.val()?.invocationId !== lease.invocationId) {
    const suffix = blockingInvocationId
      ? `（目前 invocationId：${blockingInvocationId}）`
      : '';
    throw new Error(`此 room 已有 repair lease，拒絕並行操作${suffix}。`);
  }
  return { lease, leaseRef };
};

const releaseRepairLease = async ({ lease, leaseRef }) => {
  let ownedLeaseObserved = false;
  const result = await leaseRef.transaction((current) => {
    if (current === null) return current;
    if (
      !isRecord(current)
      || current.version !== lease.version
      || current.operation !== lease.operation
      || current.roomId !== lease.roomId
      || current.runId !== lease.runId
      || current.manifestSha256 !== lease.manifestSha256
      || current.phase !== lease.phase
      || current.invocationId !== lease.invocationId
    ) {
      return undefined;
    }
    ownedLeaseObserved = true;
    return null;
  }, undefined, false);
  if (!result.committed || !ownedLeaseObserved || result.snapshot.val() !== null) {
    throw new Error('repair lease release 失敗或 ownership 已漂移；保留 lease 供人工恢復。');
  }
};

const withRepairLease = async ({
  database,
  manifest,
  phase,
  invocationId,
}, operation) => {
  const acquired = await acquireRepairLease({
    database,
    manifest,
    phase,
    invocationId,
  });
  let result;
  let operationError = null;
  try {
    result = await operation();
  } catch (error) {
    operationError = error;
  }
  try {
    await releaseRepairLease(acquired);
  } catch (releaseError) {
    if (!operationError) throw releaseError;
    const combinedError = new Error(
      `${operationError.message}；repair lease release failure/stale lease warning：${releaseError.message}`,
      { cause: operationError },
    );
    combinedError.operationError = operationError;
    combinedError.leaseReleaseError = releaseError;
    throw combinedError;
  }
  if (operationError) throw operationError;
  return result;
};

const applyRepairManifestCore = async ({
  database,
  firestore,
  bucket,
  manifest: rawManifest,
}) => {
  const manifest = validateRepairManifest(rawManifest);
  const expectedMalformedObjectNames = manifest.entries.map((entry) => entry.beforeStoragePath);
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await assertStorageInventory({ bucket, expectedMalformedObjectNames });
  const current = await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.beforeStoragePath, entry.afterStoragePath],
  });
  const states = [];
  for (const entry of manifest.entries) {
    const state = await getEntryStorageStates({ bucket, entry });
    if (state.source) {
      assertSourceMatchesManifest({
        ...state,
        allowMetagenerationDrift: true,
        repairRunId: manifest.runId,
      });
    }
    if (state.destination) {
      assertTrustedDestination({
        state: state.destination,
        entry,
        repairRunId: manifest.runId,
      });
    }
    if (!state.source && !state.destination) {
      throw new Error('repair source/destination 同時不存在。');
    }
    if (!state.source && current.paths.get(entry.ticketKey) === entry.beforeStoragePath) {
      throw new Error('RTDB 仍指向 source，但 source 已不存在。');
    }
    states.push(state);
  }

  // Copy and hold every destination before the single RTDB transaction.
  // Sources are deliberately retained until the separate finalize phase;
  // destination holds prevent a cached client from deleting the recovery
  // side during the transaction window.
  for (const state of states) {
    if (!state.destination) {
      if (!state.source) throw new Error('缺少可複製的 repair source。');
      await copyDestination({ bucket, entry: state.entry, source: state.source });
    }
  }
  await verifyAllDestinations({ bucket, manifest });
  await holdDestinations({ bucket, manifest });
  await verifyDestinationHoldState({ bucket, manifest, expected: true });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await switchRtdbPaths({ database, manifest, direction: 'apply' });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.afterStoragePath],
  });
  await verifyAllDestinations({ bucket, manifest });
  await assertStorageInventory({ bucket, expectedMalformedObjectNames });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  return { repairedCount: manifest.entries.length, sourcesRetained: true };
};

const finalizeRepairManifestCore = async ({
  database,
  firestore,
  bucket,
  manifest: rawManifest,
}) => {
  const manifest = validateRepairManifest(rawManifest);
  const expectedMalformedObjectNames = manifest.entries.map((entry) => entry.beforeStoragePath);
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  // A prior finalize attempt may already have deleted a subset. Missing
  // expected sources are retry-safe; any unplanned malformed object is not.
  await assertStorageInventory({
    bucket,
    expectedMalformedObjectNames,
    allowMissingExpected: true,
  });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.afterStoragePath],
  });
  await verifyAllDestinations({ bucket, manifest });
  await holdDestinations({ bucket, manifest });

  await verifySources({ bucket, manifest, allowMissing: true });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.afterStoragePath],
  });
  await verifyDestinationHoldState({ bucket, manifest, expected: true });

  // A prior rollback attempt can leave source holds behind. The destination
  // copies are protected before those holds are released, so either side
  // remains recoverable across an interrupted cross-phase retry.
  await releaseSourceHolds({ bucket, manifest });
  await verifySources({
    bucket,
    manifest,
    allowMissing: true,
    requireTemporaryHold: false,
  });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.afterStoragePath],
  });
  await verifyDestinationHoldState({ bucket, manifest, expected: true });
  const sources = await verifySources({
    bucket,
    manifest,
    allowMissing: true,
    requireTemporaryHold: false,
  });
  for (const { entry, source } of sources) {
    if (!source) continue;
    await bucket.file(entry.beforeStoragePath, {
      generation: entry.source.generation,
    }).delete();
  }

  for (const entry of manifest.entries) {
    if (await getStorageObjectState(bucket, entry.beforeStoragePath)) {
      throw new Error('finalize 後 repair source 仍存在。');
    }
  }
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.afterStoragePath],
  });
  await verifyDestinationHoldState({ bucket, manifest, expected: true });
  await releaseDestinationHolds({ bucket, manifest });
  await verifyDestinationHoldState({ bucket, manifest, expected: false });
  await assertStorageInventory({ bucket, expectedMalformedObjectNames: [] });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  return { finalizedCount: manifest.entries.length };
};

const rollbackRepairManifestCore = async ({
  database,
  firestore,
  bucket,
  manifest: rawManifest,
}) => {
  const manifest = validateRepairManifest(rawManifest);
  const expectedMalformedObjectNames = manifest.entries.map((entry) => entry.beforeStoragePath);
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await assertStorageInventory({ bucket, expectedMalformedObjectNames });
  const current = await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.beforeStoragePath, entry.afterStoragePath],
  });
  const states = [];
  for (const entry of manifest.entries) {
    const state = await getEntryStorageStates({ bucket, entry });
    // Rollback is intentionally unavailable after finalize. Every original
    // source must still exist and match the immutable manifest.
    assertSourceMatchesManifest({
      ...state,
      allowMetagenerationDrift: true,
      repairRunId: manifest.runId,
    });
    if (state.destination) {
      assertTrustedDestination({
        state: state.destination,
        entry,
        repairRunId: manifest.runId,
      });
    }
    if (!state.destination && current.paths.get(entry.ticketKey) === entry.afterStoragePath) {
      throw new Error('RTDB 指向 destination，但 destination 已不存在。');
    }
    states.push(state);
  }

  await holdSources({ bucket, manifest });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.beforeStoragePath, entry.afterStoragePath],
  });
  await verifySources({ bucket, manifest, requireTemporaryHold: true });
  for (const { entry } of states) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    if (destination) {
      assertTrustedDestination({ state: destination, entry, repairRunId: manifest.runId });
    }
  }
  await switchRtdbPaths({ database, manifest, direction: 'rollback' });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.beforeStoragePath],
  });
  await verifySources({ bucket, manifest, requireTemporaryHold: true });

  // A failed finalize can leave destinations held. Original sources are now
  // held and RTDB points back to them, so destinations can be safely released
  // before their generation-guarded deletion.
  await releaseDestinationHolds({ bucket, manifest, allowMissing: true });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  await verifyRtdbState({
    database,
    manifest,
    allowedStoragePathsForEntry: (entry) => [entry.beforeStoragePath],
  });
  await verifySources({ bucket, manifest, requireTemporaryHold: true });
  const destinations = [];
  for (const entry of manifest.entries) {
    const destination = await getStorageObjectState(bucket, entry.afterStoragePath);
    if (destination) {
      assertTrustedDestination({ state: destination, entry, repairRunId: manifest.runId });
      if (destination.metadata?.temporaryHold === true) {
        throw new Error('rollback destination temporaryHold 尚未解除。');
      }
    }
    destinations.push({ entry, destination });
  }
  for (const { entry, destination } of destinations) {
    if (!destination) continue;
    const generation = trimText(destination.metadata?.generation);
    if (!generation) throw new Error('repair destination 缺少 generation。');
    await bucket.file(entry.afterStoragePath, { generation }).delete();
  }
  for (const entry of manifest.entries) {
    if (await getStorageObjectState(bucket, entry.afterStoragePath)) {
      throw new Error('rollback 後 repair destination 仍存在。');
    }
    const source = await getStorageObjectState(bucket, entry.beforeStoragePath);
    assertSourceMatchesManifest({
      entry,
      source,
      allowMetagenerationDrift: true,
      repairRunId: manifest.runId,
    });
    if (source.metadata?.temporaryHold !== true) {
      throw new Error('rollback source temporaryHold 在刪除 destination 後遺失。');
    }
  }
  await releaseSourceHolds({ bucket, manifest });
  await verifySources({ bucket, manifest, requireTemporaryHold: false });
  await assertStorageInventory({ bucket, expectedMalformedObjectNames });
  await validateRepairAccess({
    database,
    firestore,
    roomId: manifest.target.roomId,
    expectedAuthorization: manifest.authorization,
  });
  return { rolledBackCount: manifest.entries.length };
};

const runLeasedRepairPhase = async ({ phase, core, input }) => {
  const manifest = validateRepairManifest(input.manifest);
  return withRepairLease({
    database: input.database,
    manifest,
    phase,
    invocationId: input.leaseInvocationId,
  }, () => core({ ...input, manifest }));
};

export const applyRepairManifest = async (input) => runLeasedRepairPhase({
  phase: 'apply',
  core: applyRepairManifestCore,
  input,
});

export const finalizeRepairManifest = async (input) => runLeasedRepairPhase({
  phase: 'finalize',
  core: finalizeRepairManifestCore,
  input,
});

export const rollbackRepairManifest = async (input) => runLeasedRepairPhase({
  phase: 'rollback',
  core: rollbackRepairManifestCore,
  input,
});

export const parseRepairCli = (args = process.argv.slice(2)) => {
  const { values } = parseArgs({
    args,
    options: {
      project: { type: 'string' },
      'database-url': { type: 'string' },
      'storage-bucket': { type: 'string' },
      'room-id': { type: 'string' },
      'expected-count': { type: 'string' },
      manifest: { type: 'string' },
      apply: { type: 'boolean', default: false },
      finalize: { type: 'boolean', default: false },
      rollback: { type: 'boolean', default: false },
      'confirm-project': { type: 'string' },
      'confirm-storage-bucket': { type: 'string' },
      'confirm-room-id': { type: 'string' },
      'confirm-count': { type: 'string' },
      'confirm-manifest-sha256': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  });
  const projectId = trimText(values.project);
  const databaseURL = trimText(values['database-url']);
  const storageBucket = trimText(values['storage-bucket']);
  const roomId = requirePathSegment(values['room-id'], '--room-id', 128);
  const expectedCount = requireExpectedCount(values['expected-count']);
  const manifestPath = trimText(values.manifest);
  if (!projectId || !databaseURL || !storageBucket || !manifestPath) {
    throw new Error(
      '必須提供 --project、--database-url、--storage-bucket、--room-id、--expected-count 與 --manifest。',
    );
  }
  const parsedDatabaseUrl = validateDatabaseTargetUrl(databaseURL, projectId);
  const validatedStorageBucket = validateStorageBucket(storageBucket, projectId);
  const requestedPhases = [
    values.apply && 'apply',
    values.finalize && 'finalize',
    values.rollback && 'rollback',
  ].filter(Boolean);
  if (requestedPhases.length > 1) {
    throw new Error('--apply、--finalize 與 --rollback 只能擇一。');
  }
  const phase = requestedPhases[0] || 'plan';
  let manifestSha256 = '';
  if (phase !== 'plan') {
    if (values['confirm-project'] !== projectId) {
      throw new Error('--confirm-project 必須與 --project 完全相同。');
    }
    if (values['confirm-storage-bucket'] !== validatedStorageBucket) {
      throw new Error('--confirm-storage-bucket 必須與 --storage-bucket 完全相同。');
    }
    if (values['confirm-room-id'] !== roomId) {
      throw new Error('--confirm-room-id 必須與 --room-id 完全相同。');
    }
    if (requireExpectedCount(values['confirm-count'], '--confirm-count') !== expectedCount) {
      throw new Error('--confirm-count 必須與 --expected-count 完全相同。');
    }
    manifestSha256 = trimText(values['confirm-manifest-sha256']).toLowerCase();
    if (!SHA256_PATTERN.test(manifestSha256)) {
      throw new Error('--confirm-manifest-sha256 必須是 64 字元 SHA256。');
    }
  }
  return {
    projectId,
    databaseURL: parsedDatabaseUrl.toString(),
    storageBucket: validatedStorageBucket,
    roomId,
    expectedCount,
    manifestPath: requireManifestPath(manifestPath),
    manifestSha256,
    phase,
  };
};

const assertManifestTargetMatchesOptions = ({ manifest, options }) => {
  if (
    manifest.target.projectId !== options.projectId
    || manifest.target.databaseHost !== new URL(options.databaseURL).hostname
    || manifest.target.storageBucket !== options.storageBucket
    || manifest.target.roomId !== options.roomId
    || manifest.expectedCount !== options.expectedCount
  ) {
    throw new Error('manifest target/count 與 CLI 參數不一致。');
  }
};

export const executeRepair = async ({ options, database, firestore, bucket }) => {
  if (options.phase === 'plan') {
    const manifest = await createRepairManifest({
      database,
      firestore,
      bucket,
      projectId: options.projectId,
      databaseURL: options.databaseURL,
      storageBucket: options.storageBucket,
      roomId: options.roomId,
      expectedCount: options.expectedCount,
    });
    const result = await writeRepairManifest(options.manifestPath, manifest);
    return { phase: 'plan', count: manifest.entries.length, ...result };
  }

  const loaded = await readRepairManifest(options.manifestPath, options.manifestSha256);
  assertManifestTargetMatchesOptions({ manifest: loaded.manifest, options });
  if (options.phase === 'apply') {
    return {
      phase: 'apply',
      ...(await applyRepairManifest({
        database,
        firestore,
        bucket,
        manifest: loaded.manifest,
      })),
    };
  }
  if (options.phase === 'finalize') {
    return {
      phase: 'finalize',
      ...(await finalizeRepairManifest({
        database,
        firestore,
        bucket,
        manifest: loaded.manifest,
      })),
    };
  }
  return {
    phase: 'rollback',
    ...(await rollbackRepairManifest({
      database,
      firestore,
      bucket,
      manifest: loaded.manifest,
    })),
  };
};

const run = async () => {
  const options = parseRepairCli();
  const app = initializeApp({
    credential: applicationDefault(),
    projectId: options.projectId,
    databaseURL: options.databaseURL,
    storageBucket: options.storageBucket,
  }, `legacy-ticket-path-repair-${Date.now()}`);
  const database = getDatabase(app);
  const firestore = getFirestore(app);
  const bucket = getStorage(app).bucket(options.storageBucket);
  const [bucketMetadata] = await bucket.getMetadata();
  if (bucket.name !== options.storageBucket || bucketMetadata.name !== options.storageBucket) {
    throw new Error('Storage API 回傳的 bucket 與 --storage-bucket 不一致。');
  }
  const result = await executeRepair({ options, database, firestore, bucket });
  console.log(`Target project: ${options.projectId}`);
  console.log(`Target Storage bucket: ${options.storageBucket}`);
  console.log(`Target room: ${options.roomId}`);
  if (result.phase === 'plan') {
    console.log(`Mode: PLAN (no Firebase writes); candidates: ${result.count}`);
    console.log(`Manifest: ${result.path}`);
    console.log(`Manifest SHA256: ${result.sha256}`);
    return;
  }
  if (result.phase === 'apply') {
    console.log(`Apply verified for ${result.repairedCount} ticket(s); sources retained.`);
    return;
  }
  if (result.phase === 'finalize') {
    console.log(`Finalize verified for ${result.finalizedCount} ticket(s); legacy sources removed.`);
    return;
  }
  console.log(`Rollback verified for ${result.rolledBackCount} ticket(s).`);
};

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  run().catch((error) => {
    console.error(`Ticket path repair failed: ${error.message}`);
    process.exitCode = 1;
  });
}
