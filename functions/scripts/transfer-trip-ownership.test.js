/* global process */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyOwnershipTransferManifest,
  assertOwnershipTransferEnvironment,
  createOwnershipTransferManifest,
  normalizeOwnershipTransfers,
  parseOwnershipTransferCli,
  readOwnershipTransferManifest,
  verifyOwnershipTransferManifest,
  withFirebaseAdminAppCleanup,
  writeOwnershipTransferManifest,
} from './transfer-trip-ownership.js';

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const readPath = (root, path) => path ? path.split('/').reduce((value, key) => value?.[key], root) : root;
const writePath = (root, path, value) => {
  const parts = path.split('/');
  let current = root;
  parts.slice(0, -1).forEach((part) => { current[part] ??= {}; current = current[part]; });
  if (value === null || value === undefined) delete current[parts.at(-1)];
  else current[parts.at(-1)] = clone(value);
};
const snapshot = (value) => ({ exists: () => value !== undefined && value !== null,
  val: () => clone(value ?? null), data: () => clone(value) });

class FakeDatabase {
  constructor(data) {
    this.data = clone(data);
    this.writeCount = 0;
    this.failRootUpdates = 0;
    this.failCanonicalAcquires = 0;
    this.failCanonicalReleases = 0;
    this.failLeaseReleases = 0;
    this.rootUpdates = [];
    this.transactionCallbacks = new Map();
  }
  ref(path = '') {
    return {
      get: async () => snapshot(readPath(this.data, path)),
      update: async (updates) => {
        this.writeCount += 1;
        if (path === '' && this.failRootUpdates > 0) {
          this.failRootUpdates -= 1;
          throw new Error('injected RTDB root update failure');
        }
        if (path === '') this.rootUpdates.push(Object.keys(updates).sort());
        Object.entries(updates).forEach(([target, value]) => writePath(this.data, target, value));
      },
      transaction: async (callback) => {
        this.writeCount += 1;
        const countCallback = () => this.transactionCallbacks.set(path,
          (this.transactionCallbacks.get(path) || 0) + 1);
        countCallback();
        const initial = callback(null);
        if (initial === undefined) {
          return { committed: false, snapshot: snapshot(null) };
        }
        const current = clone(readPath(this.data, path) ?? null);
        countCallback();
        const next = callback(current);
        if (next === undefined) return { committed: false, snapshot: snapshot(current) };
        if (path === 'roomAccess/room-1' && current?.state === 'ready'
          && next?.state === 'maintenance' && this.failCanonicalAcquires > 0) {
          this.failCanonicalAcquires -= 1;
          throw new Error('injected canonical acquire failure');
        }
        if (path === 'roomAccess/room-1' && current?.state === 'maintenance'
          && next?.state === 'ready' && this.failCanonicalReleases > 0) {
          this.failCanonicalReleases -= 1;
          throw new Error('injected canonical release failure');
        }
        if (path === 'maintenanceRepairs/legacyTicketPath/room-1'
          && next === null && this.failLeaseReleases > 0) {
          this.failLeaseReleases -= 1;
          throw new Error('injected lease release failure');
        }
        writePath(this.data, path, next);
        return { committed: true, snapshot: snapshot(next) };
      },
    };
  }
}

const firestoreSnapshot = (value) => ({ exists: value !== undefined && value !== null,
  data: () => clone(value) });

class FakeFirestore {
  constructor(documents) {
    this.documents = clone(documents);
    this.writeCount = 0;
    this.failBatches = 0;
    this.failGuardCreates = 0;
    this.failGuardDeletes = 0;
    this.batchWrites = [];
  }
  doc(path) { return { path, get: async () => firestoreSnapshot(this.documents[path]) }; }
  async runTransaction(callback) {
    const writes = [];
    const transaction = {
      get: async (ref) => firestoreSnapshot(this.documents[ref.path]),
      create: (ref, value) => {
        if (this.documents[ref.path] !== undefined) throw new Error('already exists');
        writes.push(['set', ref.path, value]);
      },
      delete: (ref) => writes.push(['delete', ref.path]),
    };
    await callback(transaction);
    if (writes.some(([type, path]) => type === 'set' && path === 'tripAccess/room-1')
      && this.failGuardCreates > 0) {
      this.failGuardCreates -= 1;
      throw new Error('injected guard acquire failure');
    }
    if (writes.some(([type, path]) => type === 'delete' && path === 'tripAccess/room-1')
      && this.failGuardDeletes > 0) {
      this.failGuardDeletes -= 1;
      throw new Error('injected guard release failure');
    }
    writes.forEach(([type, path, value]) => {
      this.writeCount += 1;
      if (type === 'delete') delete this.documents[path]; else this.documents[path] = clone(value);
    });
  }
  batch() {
    const writes = [];
    return {
      set: (ref, value) => writes.push([ref.path, value]),
      commit: async () => {
        if (this.failBatches > 0) {
          this.failBatches -= 1;
          throw new Error('injected Firestore batch failure');
        }
        this.batchWrites.push(writes.map(([path]) => path).sort());
        writes.forEach(([path, value]) => { this.writeCount += 1; this.documents[path] = clone(value); });
      },
    };
  }
}

class FakeAuth {
  constructor(users = {}) { this.users = users; }
  async getUser(uid) { return this.users[uid] || { uid, disabled: false,
    providerData: [{ providerId: 'google.com' }] }; }
}

const transfer = { roomId: 'room-1', expectedTitle: 'Kyoto', fromUid: 'owner-uid', toUid: 'editor-uid' };
const CURRENT_HASH = 'a'.repeat(64);
const STALE_HASH = 'b'.repeat(64);
const member = (uid, role, aclVersion) => ({ uid, role, status: 'active', aclVersion,
  displayName: uid, joinedAt: 50, updatedAt: 90 });

const fixture = () => {
  const data = {
    rooms: { 'room-1': { meta: { ownerUid: 'owner-uid', title: 'Kyoto', destination: 'Japan' },
      itinerary: { day: ['preserve'] }, expenses: { expense: { amount: 42 } } } },
    roomAccess: { 'room-1': { ownerUid: 'owner-uid', state: 'ready', creationId: 'creation-1',
      createdAt: 100, inviteVersion: 4,
      invite: { token: 'secret', tokenHash: CURRENT_HASH, active: true, version: 4 },
      members: { 'owner-uid': member('owner-uid', 'owner', 5),
        'editor-uid': member('editor-uid', 'editor', 9) } } },
    userTrips: { 'owner-uid': { 'room-1': { role: 'owner', status: 'active', aclVersion: 5, note: 'old' } },
      'editor-uid': { 'room-1': { role: 'editor', status: 'active', aclVersion: 9, note: 'new' } } },
    roomReservations: { 'room-1': { roomId: 'room-1', creationId: 'creation-1',
      createdByUid: 'owner-uid', createdAt: 100 } },
    userQuotas: { 'owner-uid': { createTrip: { totalCount: 9 } },
      'editor-uid': { redeemInvite: { totalCount: 5 } } },
    tripInvites: { [CURRENT_HASH]: { roomId: 'room-1', active: true, version: 4 },
      [STALE_HASH]: { roomId: 'room-1', active: true },
      ['c'.repeat(64)]: { roomId: 'room-2', active: true } },
  };
  const documents = {
    'tripAccess/room-1/members/owner-uid': { ...member('owner-uid', 'owner', 5), firestoreOnly: true },
    'tripAccess/room-1/members/editor-uid': { ...member('editor-uid', 'editor', 9), firestoreOnly: true },
  };
  return { database: new FakeDatabase(data), firestore: new FakeFirestore(documents), auth: new FakeAuth() };
};

const buildManifest = async (setup = fixture()) => ({ setup,
  manifest: await createOwnershipTransferManifest({ ...setup,
    rawMapping: { version: 1, transfers: [transfer] }, expectedCount: 1,
    projectId: 'travel-app-923ef',
    databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
    clock: () => new Date('2026-09-03T00:00:00.000Z'), runIdFactory: () => 'transfer-run' }) });

const addSecondRoom = (setup) => {
  setup.database.data.rooms['room-2'] = clone(setup.database.data.rooms['room-1']);
  setup.database.data.rooms['room-2'].meta.title = 'Paris';
  setup.database.data.roomAccess['room-2'] = clone(setup.database.data.roomAccess['room-1']);
  setup.database.data.roomAccess['room-2'].creationId = 'creation-2';
  setup.database.data.roomAccess['room-2'].invite.tokenHash = 'd'.repeat(64);
  setup.database.data.userTrips['owner-uid']['room-2'] = clone(
    setup.database.data.userTrips['owner-uid']['room-1']);
  setup.database.data.userTrips['editor-uid']['room-2'] = clone(
    setup.database.data.userTrips['editor-uid']['room-1']);
  setup.database.data.roomReservations['room-2'] = {
    ...clone(setup.database.data.roomReservations['room-1']), roomId: 'room-2', creationId: 'creation-2',
  };
  setup.database.data.tripInvites['d'.repeat(64)] = {
    roomId: 'room-2', active: true, version: 4,
  };
  setup.firestore.documents['tripAccess/room-2/members/owner-uid'] = clone(
    setup.firestore.documents['tripAccess/room-1/members/owner-uid']);
  setup.firestore.documents['tripAccess/room-2/members/editor-uid'] = clone(
    setup.firestore.documents['tripAccess/room-1/members/editor-uid']);
  return [transfer, { ...transfer, roomId: 'room-2', expectedTitle: 'Paris' }];
};

test('mapping requires exact keys and distinct identities', () => {
  assert.deepEqual(normalizeOwnershipTransfers({ version: 1, transfers: [transfer] }), [transfer]);
  assert.throws(() => normalizeOwnershipTransfers({ version: 1, transfers: [{ ...transfer, extra: true }] }),
    /未預期欄位/);
  assert.throws(() => normalizeOwnershipTransfers({ version: 1,
    transfers: [{ ...transfer, toUid: transfer.fromUid }] }), /不同 UID/);
});

test('--help is accepted without requiring connection options', () => {
  assert.deepEqual(parseOwnershipTransferCli(['--help']), { help: true });
});

test('production CLI rejects emulator overrides and mismatched project environments', () => {
  const projectId = 'travel-app-923ef';
  assert.doesNotThrow(() => assertOwnershipTransferEnvironment({ projectId, env: {
    GCLOUD_PROJECT: projectId,
    GOOGLE_CLOUD_PROJECT: projectId,
  } }));
  for (const key of [
    'FIREBASE_DATABASE_EMULATOR_HOST',
    'FIRESTORE_EMULATOR_HOST',
    'FIREBASE_AUTH_EMULATOR_HOST',
    'FIREBASE_STORAGE_EMULATOR_HOST',
  ]) {
    assert.throws(() => assertOwnershipTransferEnvironment({ projectId,
      env: { [key]: '127.0.0.1:9999' } }), new RegExp(key));
  }
  assert.throws(() => assertOwnershipTransferEnvironment({ projectId,
    env: { GCLOUD_PROJECT: 'wrong-project' } }), /GCLOUD_PROJECT/);
  assert.throws(() => assertOwnershipTransferEnvironment({ projectId,
    env: { GOOGLE_CLOUD_PROJECT: 'wrong-project' } }), /GOOGLE_CLOUD_PROJECT/);
});

test('plan is Firebase-read-only, validates state and records every invite lookup', async () => {
  const setup = fixture();
  const { manifest } = await buildManifest(setup);
  assert.equal(setup.database.writeCount, 0);
  assert.equal(setup.firestore.writeCount, 0);
  assert.deepEqual(manifest.entries[0].inviteHashes, [CURRENT_HASH, STALE_HASH]);
  assert.deepEqual(manifest.entries[0].nextAclVersions, { from: 6, to: 10 });
});

test('plan rejects bad title, auth, deletion state, and malformed mirrors', async () => {
  const mutations = [
    (setup) => { setup.database.data.rooms['room-1'].meta.title = 'Osaka'; },
    (setup) => { setup.auth.users['editor-uid'] = { disabled: true, providerData: [{ providerId: 'google.com' }] }; },
    (setup) => { setup.database.data.tripDeletions = { 'room-1': { state: 'requested' } }; },
    (setup) => { setup.database.data.userTrips['editor-uid']['room-1'].role = 'owner'; },
    (setup) => { setup.firestore.documents['tripAccess/room-1/members/owner-uid'].status = 'removed'; },
    (setup) => { setup.database.data.roomReservations['room-1'].createdByUid = ''; },
    (setup) => { setup.auth.users['owner-uid'] = { disabled: false, providerData: [] }; },
    (setup) => { setup.database.data.roomAccess['room-1'].members.removed = {
      uid: 'removed', role: 'owner', status: 'removed', aclVersion: 1,
    }; },
    (setup) => { setup.database.data.roomAccess['room-1'].members.malformed = {
      uid: 'different', role: 'editor', status: 'removed', aclVersion: 1,
    }; },
    (setup) => { setup.database.data.roomAccess['room-1'].invite.tokenHash = 'bad/path'; },
    (setup) => { setup.database.data.userTrips['editor-uid']['room-1'].aclVersion = 8; },
  ];
  for (const mutate of mutations) {
    const setup = fixture(); mutate(setup);
    await assert.rejects(() => buildManifest(setup));
    assert.equal(setup.database.writeCount, 0);
    assert.equal(setup.firestore.writeCount, 0);
  }
});

test('plan never adopts or deletes a canonical invite hash owned by another room or version', async () => {
  for (const mismatch of [
    { roomId: 'room-2', active: true, version: 4 },
    { roomId: 'room-1', active: true, version: 99 },
  ]) {
    const setup = fixture();
    setup.database.data.tripInvites[CURRENT_HASH] = mismatch;
    await assert.rejects(() => buildManifest(setup), /canonical invite lookup room\/version/);
    assert.deepEqual(setup.database.data.tripInvites[CURRENT_HASH], mismatch);
    assert.equal(setup.database.writeCount, 0);
    assert.equal(setup.firestore.writeCount, 0);
  }
});

test('plan rejects aclVersion and inviteVersion increments that exceed MAX_SAFE_INTEGER', async () => {
  const aclSetup = fixture();
  for (const target of [
    aclSetup.database.data.roomAccess['room-1'].members['owner-uid'],
    aclSetup.database.data.userTrips['owner-uid']['room-1'],
    aclSetup.firestore.documents['tripAccess/room-1/members/owner-uid'],
  ]) target.aclVersion = Number.MAX_SAFE_INTEGER;
  await assert.rejects(() => buildManifest(aclSetup), /安全整數上限/);
  assert.equal(aclSetup.database.writeCount, 0);
  assert.equal(aclSetup.firestore.writeCount, 0);

  const inviteSetup = fixture();
  inviteSetup.database.data.roomAccess['room-1'].inviteVersion = Number.MAX_SAFE_INTEGER;
  inviteSetup.database.data.roomAccess['room-1'].invite.version = Number.MAX_SAFE_INTEGER;
  inviteSetup.database.data.tripInvites[CURRENT_HASH].version = Number.MAX_SAFE_INTEGER;
  await assert.rejects(() => buildManifest(inviteSetup), /安全整數上限/);
  assert.equal(inviteSetup.database.writeCount, 0);
  assert.equal(inviteSetup.firestore.writeCount, 0);
});

test('apply makes the exact ownership/ACL/invite changes and preserves content, creator and quota', async () => {
  const { setup, manifest } = await buildManifest();
  const beforeRoom = clone(setup.database.data.rooms['room-1']);
  const beforeReservation = clone(setup.database.data.roomReservations['room-1']);
  const beforeQuotas = clone(setup.database.data.userQuotas);
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'invocation-1', acquiredAt: 200, updatedAt: 201 });
  const room = setup.database.data.rooms['room-1'];
  const access = setup.database.data.roomAccess['room-1'];
  assert.deepEqual(room, { ...beforeRoom, meta: { ...beforeRoom.meta, ownerUid: 'editor-uid' } });
  assert.equal(access.ownerUid, 'editor-uid');
  assert.equal(access.state, 'ready');
  assert.equal(access.maintenanceLock, undefined);
  assert.equal(access.members['owner-uid'].role, 'editor');
  assert.equal(access.members['owner-uid'].aclVersion, 6);
  assert.equal(access.members['editor-uid'].role, 'owner');
  assert.equal(access.members['editor-uid'].aclVersion, 10);
  assert.equal(access.invite, undefined);
  assert.equal(access.inviteVersion, 5);
  assert.equal(setup.database.data.tripInvites[CURRENT_HASH], undefined);
  assert.equal(setup.database.data.tripInvites[STALE_HASH], undefined);
  assert.ok(setup.database.data.tripInvites['c'.repeat(64)]);
  assert.deepEqual(setup.database.data.roomReservations['room-1'], beforeReservation);
  assert.deepEqual(setup.database.data.userQuotas, beforeQuotas);
  assert.equal(setup.firestore.documents['tripAccess/room-1/members/owner-uid'].role, 'editor');
  assert.equal(setup.firestore.documents['tripAccess/room-1/members/editor-uid'].role, 'owner');
  assert.equal(readPath(setup.database.data, 'maintenanceRepairs/legacyTicketPath/room-1'), undefined);
  assert.equal(setup.firestore.documents['tripAccess/room-1'], undefined);
  await assert.doesNotReject(() => verifyOwnershipTransferManifest({ ...setup, rawManifest: manifest }));
});

test('a completed apply is retry-safe', async () => {
  const { setup, manifest } = await buildManifest();
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'first', acquiredAt: 200, updatedAt: 201 });
  await assert.doesNotReject(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'retry', acquiredAt: 300, updatedAt: 301 }));
});

test('plan classifies an already converged transfer as complete', async () => {
  const { setup, manifest } = await buildManifest();
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'first', acquiredAt: 200 });
  const replanned = await createOwnershipTransferManifest({ ...setup,
    rawMapping: { version: 1, transfers: [transfer] }, expectedCount: 1,
    projectId: 'travel-app-923ef',
    databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
    runIdFactory: () => 'replanned-run' });
  assert.equal(replanned.candidateCount, 0);
  assert.equal(replanned.completeCount, 1);
  await assert.doesNotReject(() => verifyOwnershipTransferManifest({ ...setup,
    rawManifest: replanned }));
});

test('RTDB and Firestore failures retain both locks and resume without double invite increments', async () => {
  for (const failure of ['rtdb', 'firestore']) {
    const { setup, manifest } = await buildManifest();
    if (failure === 'rtdb') setup.database.failRootUpdates = 1;
    else setup.firestore.failBatches = 1;
    await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: `resume-${failure}`, acquiredAt: 200 }), /injected/);
    assert.ok(readPath(setup.database.data, 'maintenanceRepairs/legacyTicketPath/room-1'));
    assert.ok(setup.firestore.documents['tripAccess/room-1']);
    assert.equal(setup.firestore.documents['tripAccess/room-1'].state, 'maintenance');
    assert.equal(setup.database.data.roomAccess['room-1'].state, 'maintenance');
    assert.equal(setup.database.data.roomAccess['room-1'].maintenanceLock.state, 'maintenance');
    await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: `resume-${failure}`, acquiredAt: 999 });
    assert.equal(setup.database.data.roomAccess['room-1'].inviteVersion,
      manifest.entries[0].nextInviteVersion);
    assert.equal(setup.database.data.roomAccess['room-1'].members['owner-uid'].updatedAt, 200);
  }
});

test('Firestore crash resume removes a known late lookup without rewriting RTDB audit data', async () => {
  const { setup, manifest } = await buildManifest();
  setup.firestore.failBatches = 1;
  await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'late-after-crash', acquiredAt: 200 }), /injected Firestore/);
  setup.database.data.tripInvites[STALE_HASH] = {
    roomId: 'room-1', active: true, version: 3,
  };
  const beforeAccess = clone(setup.database.data.roomAccess['room-1']);
  setup.database.rootUpdates = [];
  setup.firestore.batchWrites = [];

  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'late-after-crash', acquiredAt: 999 });

  assert.equal(setup.database.data.tripInvites[STALE_HASH], undefined);
  assert.equal(setup.database.rootUpdates.length, 0);
  assert.equal(setup.database.data.roomAccess['room-1'].lastInviteRevokedAt,
    beforeAccess.lastInviteRevokedAt);
  assert.equal(setup.database.data.roomAccess['room-1'].members['owner-uid'].updatedAt,
    beforeAccess.members['owner-uid'].updatedAt);
  assert.deepEqual(setup.firestore.batchWrites.flat().sort(), [
    'tripAccess/room-1/members/editor-uid',
    'tripAccess/room-1/members/owner-uid',
  ]);
});

test('a completed transfer can CAS-clean only manifest-bound same-room late lookups', async () => {
  const { setup, manifest } = await buildManifest();
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'initial-complete', acquiredAt: 200 });
  const beforeAccess = clone(setup.database.data.roomAccess['room-1']);
  const beforeFromAcl = clone(setup.firestore.documents['tripAccess/room-1/members/owner-uid']);
  setup.database.data.tripInvites[CURRENT_HASH] = {
    roomId: 'room-1', active: true, version: 4,
  };
  setup.database.rootUpdates = [];
  setup.firestore.batchWrites = [];

  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'cleanup-known-late', acquiredAt: 900 });

  assert.equal(setup.database.data.tripInvites[CURRENT_HASH], undefined);
  assert.equal(setup.database.rootUpdates.length, 0);
  assert.equal(setup.firestore.batchWrites.length, 0);
  assert.deepEqual(setup.database.data.roomAccess['room-1'], beforeAccess);
  assert.deepEqual(setup.firestore.documents['tripAccess/room-1/members/owner-uid'], beforeFromAcl);
  assert.ok((setup.database.transactionCallbacks.get(`tripInvites/${CURRENT_HASH}`) || 0) >= 2);
});

test('late unknown or foreign manifest invite lookups fail closed before any lock write', async () => {
  for (const [hash, lookup, message] of [
    ['e'.repeat(64), { roomId: 'room-1', active: true, version: 9 }, /未授權/],
    [CURRENT_HASH, { roomId: 'room-2', active: true, version: 4 }, /其他 room/],
  ]) {
    const { setup, manifest } = await buildManifest();
    await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: 'complete-before-late', acquiredAt: 200 });
    setup.database.data.tripInvites[hash] = lookup;
    const databaseWrites = setup.database.writeCount;
    const firestoreWrites = setup.firestore.writeCount;
    await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: 'reject-late', acquiredAt: 500 }), message);
    assert.deepEqual(setup.database.data.tripInvites[hash], lookup);
    assert.equal(setup.database.writeCount, databaseWrites);
    assert.equal(setup.firestore.writeCount, firestoreWrites);
  }
});

test('every lock and cleanup failure phase can resume with the same invocation ID', async () => {
  const phases = [
    ['guard-acquire', (setup) => { setup.firestore.failGuardCreates = 1; }],
    ['canonical-acquire', (setup) => { setup.database.failCanonicalAcquires = 1; }],
    ['guard-release', (setup) => { setup.firestore.failGuardDeletes = 1; }],
    ['lease-release', (setup) => { setup.database.failLeaseReleases = 1; }],
    ['canonical-release', (setup) => { setup.database.failCanonicalReleases = 1; }],
  ];
  for (const [phase, inject] of phases) {
    const { setup, manifest } = await buildManifest();
    inject(setup);
    await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: `resume-${phase}`, acquiredAt: 200 }), /injected/);
    await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: `resume-${phase}`, acquiredAt: 999 });
    assert.equal(setup.database.data.roomAccess['room-1'].state, 'ready');
    assert.equal(setup.database.data.roomAccess['room-1'].maintenanceLock, undefined);
    assert.equal(setup.database.data.roomAccess['room-1'].inviteVersion,
      manifest.entries[0].nextInviteVersion);
    assert.equal(readPath(setup.database.data,
      'maintenanceRepairs/legacyTicketPath/room-1'), undefined);
    assert.equal(setup.firestore.documents['tripAccess/room-1'], undefined);
    await assert.doesNotReject(() => verifyOwnershipTransferManifest({
      ...setup, rawManifest: manifest,
    }));
  }
});

test('lease release survives the Admin SDK initial local null callback', async () => {
  const { setup, manifest } = await buildManifest();
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'initial-null-release', acquiredAt: 200 });
  assert.equal(readPath(setup.database.data,
    'maintenanceRepairs/legacyTicketPath/room-1'), undefined);
  assert.equal(setup.database.data.roomAccess['room-1'].state, 'ready');
  assert.equal(setup.database.data.roomAccess['room-1'].maintenanceLock, undefined);
});

test('two-entry apply completes a full read preflight before its first write', async () => {
  const setup = fixture();
  const transfers = addSecondRoom(setup);
  const manifest = await createOwnershipTransferManifest({ ...setup,
    rawMapping: { version: 1, transfers }, expectedCount: 2,
    projectId: 'travel-app-923ef',
    databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
    runIdFactory: () => 'two-room-run' });
  setup.database.data.rooms['room-2'].meta.title = 'Drifted';
  await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'two-room', acquiredAt: 200 }), /room\/title/);
  assert.equal(setup.database.writeCount, 0);
  assert.equal(setup.firestore.writeCount, 0);
});

test('a mixed multi-room apply never rewrites the completed entry ACL or audit timestamps', async () => {
  const setup = fixture();
  const transfers = addSecondRoom(setup);
  const manifest = await createOwnershipTransferManifest({ ...setup,
    rawMapping: { version: 1, transfers }, expectedCount: 2,
    projectId: 'travel-app-923ef',
    databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
    runIdFactory: () => 'mixed-room-run' });
  const entry = manifest.entries[0];
  const stableAt = 321;
  setup.database.data.rooms['room-1'].meta.ownerUid = entry.toUid;
  Object.assign(setup.database.data.roomAccess['room-1'], {
    ownerUid: entry.toUid,
    inviteVersion: entry.nextInviteVersion,
    lastInviteRevokedAt: stableAt,
    lastInviteRevokedByUid: entry.fromUid,
  });
  delete setup.database.data.roomAccess['room-1'].invite;
  Object.assign(setup.database.data.roomAccess['room-1'].members[entry.fromUid], {
    role: 'editor', aclVersion: entry.nextAclVersions.from, updatedAt: stableAt,
  });
  Object.assign(setup.database.data.roomAccess['room-1'].members[entry.toUid], {
    role: 'owner', aclVersion: entry.nextAclVersions.to, updatedAt: stableAt,
  });
  Object.assign(setup.database.data.userTrips[entry.fromUid]['room-1'], {
    role: 'editor', aclVersion: entry.nextAclVersions.from, updatedAt: stableAt,
  });
  Object.assign(setup.database.data.userTrips[entry.toUid]['room-1'], {
    role: 'owner', aclVersion: entry.nextAclVersions.to, updatedAt: stableAt,
  });
  Object.assign(setup.firestore.documents['tripAccess/room-1/members/owner-uid'], {
    role: 'editor', aclVersion: entry.nextAclVersions.from, updatedAt: new Date(stableAt),
  });
  Object.assign(setup.firestore.documents['tripAccess/room-1/members/editor-uid'], {
    role: 'owner', aclVersion: entry.nextAclVersions.to, updatedAt: new Date(stableAt),
  });
  entry.inviteHashes.forEach((hash) => { delete setup.database.data.tripInvites[hash]; });
  const before = {
    room: clone(setup.database.data.rooms['room-1']),
    access: clone(setup.database.data.roomAccess['room-1']),
    fromTrip: clone(setup.database.data.userTrips[entry.fromUid]['room-1']),
    toTrip: clone(setup.database.data.userTrips[entry.toUid]['room-1']),
    fromAcl: clone(setup.firestore.documents['tripAccess/room-1/members/owner-uid']),
    toAcl: clone(setup.firestore.documents['tripAccess/room-1/members/editor-uid']),
  };

  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'mixed-room', acquiredAt: 999 });

  assert.deepEqual(setup.database.data.rooms['room-1'], before.room);
  assert.deepEqual(setup.database.data.roomAccess['room-1'], before.access);
  assert.deepEqual(setup.database.data.userTrips[entry.fromUid]['room-1'], before.fromTrip);
  assert.deepEqual(setup.database.data.userTrips[entry.toUid]['room-1'], before.toTrip);
  assert.deepEqual(setup.firestore.documents['tripAccess/room-1/members/owner-uid'], before.fromAcl);
  assert.deepEqual(setup.firestore.documents['tripAccess/room-1/members/editor-uid'], before.toAcl);
  assert.ok(setup.database.rootUpdates.flat().every((path) => !path.includes('room-1')));
  assert.ok(setup.firestore.batchWrites.flat().every((path) => !path.includes('room-1')));
  assert.equal(setup.database.data.rooms['room-2'].meta.ownerUid, entry.toUid);
});

test('the printed invocation ID resumes existing owned locks with their original timestamp', async () => {
  const { setup, manifest } = await buildManifest();
  const lock = { version: 1, operation: 'trip-owner-transfer', state: 'maintenance', runId: manifest.runId,
    manifestSha256: createHash('sha256').update(`${JSON.stringify(manifest, null, 2)}\n`).digest('hex'),
    roomId: 'room-1', invocationId: 'resume-id', acquiredAt: 200 };
  writePath(setup.database.data, 'maintenanceRepairs/legacyTicketPath/room-1', lock);
  setup.firestore.documents['tripAccess/room-1'] = clone(lock);
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'resume-id', acquiredAt: 999 });
  assert.equal(setup.database.data.roomAccess['room-1'].members['owner-uid'].updatedAt, 200);
  assert.equal(setup.database.data.rooms['room-1'].meta.ownerUid, 'editor-uid');
});

test('partial ownership state is rejected unless both owned locks are present', async () => {
  const { setup, manifest } = await buildManifest();
  const entry = manifest.entries[0];
  setup.database.data.rooms['room-1'].meta.ownerUid = entry.toUid;
  setup.database.data.roomAccess['room-1'].ownerUid = entry.toUid;
  setup.database.data.roomAccess['room-1'].members[entry.fromUid].role = 'editor';
  setup.database.data.roomAccess['room-1'].members[entry.fromUid].aclVersion = entry.nextAclVersions.from;
  setup.database.data.roomAccess['room-1'].members[entry.toUid].role = 'owner';
  setup.database.data.roomAccess['room-1'].members[entry.toUid].aclVersion = entry.nextAclVersions.to;
  setup.database.data.userTrips[entry.fromUid]['room-1'].role = 'editor';
  setup.database.data.userTrips[entry.fromUid]['room-1'].aclVersion = entry.nextAclVersions.from;
  setup.database.data.userTrips[entry.toUid]['room-1'].role = 'owner';
  setup.database.data.userTrips[entry.toUid]['room-1'].aclVersion = entry.nextAclVersions.to;
  delete setup.database.data.roomAccess['room-1'].invite;
  setup.database.data.roomAccess['room-1'].inviteVersion = entry.nextInviteVersion;
  delete setup.database.data.tripInvites[CURRENT_HASH];
  delete setup.database.data.tripInvites[STALE_HASH];
  const lock = { version: 1, operation: 'trip-owner-transfer', state: 'maintenance', runId: manifest.runId,
    manifestSha256: createHash('sha256').update(`${JSON.stringify(manifest, null, 2)}\n`).digest('hex'),
    roomId: 'room-1', invocationId: 'partial-id', acquiredAt: 200 };
  writePath(setup.database.data, 'maintenanceRepairs/legacyTicketPath/room-1', lock);
  await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'partial-id', acquiredAt: 200 }), /雙重鎖/);
});

test('a reverse second transfer preserves the original reservation creator', async () => {
  const { setup, manifest } = await buildManifest();
  await applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
    invocationId: 'first', acquiredAt: 200, updatedAt: 201 });
  const reverse = { roomId: 'room-1', expectedTitle: 'Kyoto',
    fromUid: 'editor-uid', toUid: 'owner-uid' };
  const reverseManifest = await createOwnershipTransferManifest({ ...setup,
    rawMapping: { version: 1, transfers: [reverse] }, expectedCount: 1,
    projectId: 'travel-app-923ef',
    databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
    runIdFactory: () => 'reverse-run' });
  await applyOwnershipTransferManifest({ ...setup, rawManifest: reverseManifest,
    invocationId: 'reverse', acquiredAt: 300, updatedAt: 301 });
  assert.equal(setup.database.data.rooms['room-1'].meta.ownerUid, 'owner-uid');
  assert.equal(setup.database.data.roomReservations['room-1'].createdByUid, 'owner-uid');
});

test('apply refuses foreign RTDB leases and Firestore guards before ownership writes', async () => {
  for (const kind of ['lease', 'guard']) {
    const { setup, manifest } = await buildManifest();
    if (kind === 'lease') writePath(setup.database.data, 'maintenanceRepairs/legacyTicketPath/room-1',
      { operation: 'foreign' });
    else setup.firestore.documents['tripAccess/room-1'] = { operation: 'foreign' };
    await assert.rejects(() => applyOwnershipTransferManifest({ ...setup, rawManifest: manifest,
      invocationId: 'invocation', acquiredAt: 200, updatedAt: 201 }), /foreign/);
    assert.equal(setup.database.data.rooms['room-1'].meta.ownerUid, 'owner-uid');
  }
});

test('manifest file is exclusive, mode 0600 where supported, and SHA-bound', async () => {
  const { manifest } = await buildManifest();
  const directory = await mkdtemp(join(tmpdir(), 'trip-owner-transfer-'));
  const path = join(directory, 'trip-owner-transfer-test.local.json');
  try {
    const persisted = await writeOwnershipTransferManifest(path, manifest);
    assert.deepEqual((await readOwnershipTransferManifest(path, persisted.sha256)).manifest, manifest);
    assert.equal(persisted.sha256, createHash('sha256').update(await readFile(path)).digest('hex'));
    if (process.platform !== 'win32') assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(() => writeOwnershipTransferManifest(path, manifest), /拒絕覆寫/);
    await assert.rejects(() => readOwnershipTransferManifest(path, '0'.repeat(64)), /SHA256/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('CLI requires every typed APPLY confirmation and supports a retry invocation ID', () => {
  const base = ['--mapping', 'scripts/trip-owner-transfer.production.local.json',
    '--manifest', 'trip-owner-transfer-plan.local.json', '--project', 'travel-app-923ef',
    '--database-url', 'https://travel-app-923ef-default-rtdb.firebaseio.com', '--expected-count', '1'];
  assert.equal(parseOwnershipTransferCli(base).phase, 'plan');
  assert.throws(() => parseOwnershipTransferCli([...base, '--apply']), /confirm-manifest-sha256/);
  const confirmations = ['--confirm-project', 'travel-app-923ef', '--confirm-database-host',
    'travel-app-923ef-default-rtdb.firebaseio.com', '--confirm-count', '1',
    '--confirm-candidate-count', '1', '--confirm-manifest-sha256', 'a'.repeat(64),
    '--confirm-maintenance-window', 'production-paused-users-inactive',
    '--invocation-id', 'printed-retry-id'];
  const options = parseOwnershipTransferCli([...base, '--apply', ...confirmations]);
  assert.equal(options.phase, 'apply');
  assert.equal(options.invocationId, 'printed-retry-id');
});

test('Firebase Admin app cleanup runs on success and failure', async () => {
  const calls = [];
  assert.equal(await withFirebaseAdminAppCleanup({ app: 'app',
    operation: async () => { calls.push('operation'); return 'done'; },
    cleanup: async () => calls.push('cleanup') }), 'done');
  assert.deepEqual(calls, ['operation', 'cleanup']);
  let cleaned = false;
  await assert.rejects(() => withFirebaseAdminAppCleanup({ app: 'app',
    operation: async () => { throw new Error('failed'); },
    cleanup: async () => { cleaned = true; } }), /failed/);
  assert.equal(cleaned, true);
  let caught = Symbol('not-caught');
  try {
    await withFirebaseAdminAppCleanup({ app: 'app', operation: async () => { throw null; },
      cleanup: async () => {} });
  } catch (error) { caught = error; }
  assert.equal(caught, null);
});
