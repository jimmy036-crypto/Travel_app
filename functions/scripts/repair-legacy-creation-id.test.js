import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyCreationIdEntry,
  applyCreationIdRepairManifest,
  createCreationIdRepairManifest,
  parseCreationIdRepairCli,
  readCreationIdRepairManifest,
  validateCreationIdRepairState,
  verifyCreationIdRepairManifest,
  writeCreationIdRepairManifest,
} from './repair-legacy-creation-id.js';

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const readPath = (root, path) => trimPath(path).reduce(
  (current, segment) => current?.[segment],
  root,
);

const trimPath = (path) => String(path || '').split('/').filter(Boolean);

const writePath = (root, path, value) => {
  const segments = trimPath(path);
  if (segments.length === 0) throw new Error('FakeDatabase does not replace root.');
  let current = root;
  segments.slice(0, -1).forEach((segment) => {
    if (!current[segment] || typeof current[segment] !== 'object') current[segment] = {};
    current = current[segment];
  });
  const key = segments.at(-1);
  if (value === null || value === undefined) delete current[key];
  else current[key] = clone(value);
};

const rtdbSnapshot = (value) => ({
  exists: () => value !== null && value !== undefined,
  val: () => clone(value ?? null),
});

class FakeDatabase {
  constructor(data) {
    this.data = clone(data);
    this.transactionCount = 0;
    this.transactionCallsByPath = new Map();
    this.beforeTransaction = null;
  }

  ref(path = '') {
    return {
      get: async () => rtdbSnapshot(readPath(this.data, path)),
      transaction: async (update) => {
        this.transactionCount += 1;
        const callNumber = (this.transactionCallsByPath.get(path) || 0) + 1;
        this.transactionCallsByPath.set(path, callNumber);
        await this.beforeTransaction?.({ path, callNumber, database: this });
        update(null);
        const current = clone(readPath(this.data, path) ?? null);
        const next = update(current);
        if (next === undefined) {
          return { committed: false, snapshot: rtdbSnapshot(current) };
        }
        writePath(this.data, path, next);
        return { committed: true, snapshot: rtdbSnapshot(next) };
      },
    };
  }
}

class FakeFirestore {
  constructor(documents) {
    this.documents = clone(documents);
  }

  doc(path) {
    return {
      get: async () => {
        const value = this.documents[path];
        return {
          exists: value !== undefined && value !== null,
          data: () => clone(value),
        };
      },
    };
  }
}

class FakeAuth {
  async getUser(uid) {
    return {
      uid,
      disabled: false,
      providerData: [{ providerId: 'google.com' }],
    };
  }
}

const owners = [
  { roomId: 'legacy-one', uid: 'owner-uid', displayName: 'Owner', photoURL: '' },
  { roomId: 'legacy-two', uid: 'owner-uid', displayName: 'Owner', photoURL: '' },
];

const ownerMember = (uid, aclVersion = 1) => ({
  uid,
  role: 'owner',
  status: 'active',
  aclVersion,
  joinedAt: 100,
  updatedAt: 100,
});

const fixture = () => {
  const data = {
    rooms: {},
    roomAccess: {},
    userTrips: { 'owner-uid': {} },
    roomReservations: {},
  };
  const documents = {};
  owners.forEach(({ roomId, uid }, index) => {
    const timestamp = 100 + index;
    data.rooms[roomId] = { meta: { ownerUid: uid, title: `Trip ${index + 1}` } };
    data.roomAccess[roomId] = {
      ownerUid: uid,
      state: 'ready',
      createdAt: timestamp,
      members: { [uid]: ownerMember(uid) },
    };
    data.userTrips[uid][roomId] = { role: 'owner', status: 'active', aclVersion: 1 };
    data.roomReservations[roomId] = {
      roomId,
      creationId: `legacy-migration-${roomId}`,
      createdByUid: uid,
      createdAt: timestamp,
      migrated: true,
    };
    documents[`tripAccess/${roomId}/members/${uid}`] = {
      uid,
      role: 'owner',
      status: 'active',
      aclVersion: 1,
    };
  });
  return {
    database: new FakeDatabase(data),
    firestore: new FakeFirestore(documents),
    auth: new FakeAuth(),
  };
};

const inspectableState = (setup, roomId = 'legacy-one') => ({
  room: clone(setup.database.data.rooms[roomId]),
  access: clone(setup.database.data.roomAccess[roomId]),
  userTrip: clone(setup.database.data.userTrips['owner-uid'][roomId]),
  reservation: clone(setup.database.data.roomReservations[roomId]),
  acl: clone(setup.firestore.documents[`tripAccess/${roomId}/members/owner-uid`]),
  deletionGuard: null,
  deletionJournal: null,
  deletionWorker: null,
  ticketRepairLease: null,
});

const buildManifest = async (setup = fixture()) => ({
  setup,
  manifest: await createCreationIdRepairManifest({
    ...setup,
    rawMapping: { version: 1, owners },
    projectId: 'travel-app-923ef',
    databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
    expectedCount: 2,
    clock: () => new Date('2026-09-01T00:00:00.000Z'),
    runIdFactory: () => 'repair-run-id',
  }),
});

test('state validation classifies only missing or canonical creationId values', () => {
  const setup = fixture();
  const mapping = owners[0];
  const state = inspectableState(setup);
  assert.equal(validateCreationIdRepairState({ mapping, state }).classification, 'candidate');

  state.access.creationId = 'legacy-migration-legacy-one';
  assert.equal(validateCreationIdRepairState({ mapping, state }).classification, 'correct');

  state.access.creationId = 'foreign-id';
  assert.throws(
    () => validateCreationIdRepairState({ mapping, state }),
    /creationId.*衝突/,
  );
});

test('state validation fails closed on owner, mirror, deletion, and reservation drift', () => {
  const setup = fixture();
  const mapping = owners[0];
  const mutations = [
    (state) => { state.room.meta.ownerUid = 'other-owner'; },
    (state) => { state.access.state = 'deleting'; },
    (state) => { state.access.members['owner-uid'].aclVersion = 2; },
    (state) => {
      state.access.members['editor-uid'] = {
        uid: 'wrong-uid', role: 'editor', status: 'active', aclVersion: 1,
      };
    },
    (state) => { state.reservation.creationId = 'foreign-id'; },
    (state) => { state.reservation.createdAt = 0; },
    (state) => { state.deletionJournal = { state: 'requested' }; },
    (state) => { state.deletionGuard = { state: 'deleting' }; },
    (state) => { state.ticketRepairLease = { runId: 'other-repair' }; },
  ];
  mutations.forEach((mutate) => {
    const state = inspectableState(setup);
    mutate(state);
    assert.throws(() => validateCreationIdRepairState({ mapping, state }));
  });
});

test('plan requires exact migrated reservation coverage and records candidate counts', async () => {
  const { setup, manifest } = await buildManifest();
  assert.equal(manifest.expectedCount, 2);
  assert.equal(manifest.candidateCount, 2);
  assert.equal(manifest.correctCount, 0);
  assert.deepEqual(manifest.entries.map(({ beforeCreationId }) => beforeCreationId), [null, null]);

  delete setup.database.data.roomReservations['legacy-two'];
  await assert.rejects(
    () => createCreationIdRepairManifest({
      ...setup,
      rawMapping: { version: 1, owners },
      projectId: 'travel-app-923ef',
      databaseURL: 'https://travel-app-923ef-default-rtdb.firebaseio.com/',
      expectedCount: 2,
    }),
    /migrated reservation 集合/,
  );
});

test('apply changes only roomAccess creationId and is retry-safe', async () => {
  const { setup, manifest } = await buildManifest();
  const before = clone(setup.database.data);

  assert.deepEqual(await applyCreationIdRepairManifest({
    ...setup,
    rawManifest: manifest,
  }), { verifiedCount: 2 });
  owners.forEach(({ roomId }) => {
    assert.equal(
      setup.database.data.roomAccess[roomId].creationId,
      `legacy-migration-${roomId}`,
    );
    const expectedAccess = {
      ...before.roomAccess[roomId],
      creationId: `legacy-migration-${roomId}`,
    };
    assert.deepEqual(setup.database.data.roomAccess[roomId], expectedAccess);
  });
  assert.deepEqual(setup.database.data.rooms, before.rooms);
  assert.deepEqual(setup.database.data.userTrips, before.userTrips);
  assert.deepEqual(setup.database.data.roomReservations, before.roomReservations);

  await assert.doesNotReject(() => applyCreationIdRepairManifest({
    ...setup,
    rawManifest: manifest,
  }));
  await assert.doesNotReject(() => verifyCreationIdRepairManifest({
    ...setup,
    rawManifest: manifest,
  }));
});

test('a second invocation cannot take over a matching-manifest maintenance lease', async () => {
  const { setup, manifest } = await buildManifest();
  const manifestSha256 = createHash('sha256')
    .update(`${JSON.stringify(manifest, null, 2)}\n`)
    .digest('hex');
  setup.database.data.maintenanceRepairs = { legacyTicketPath: {} };
  manifest.entries.forEach((entry) => {
    setup.database.data.maintenanceRepairs.legacyTicketPath[entry.roomId] = {
      version: 1,
      operation: 'legacy-creation-id-repair',
      runId: manifest.runId,
      manifestSha256,
      roomId: entry.roomId,
      phase: 'apply',
      invocationId: 'first-invocation',
    };
  });

  await assert.rejects(
    () => applyCreationIdRepairManifest({
      ...setup,
      rawManifest: manifest,
      invocationId: 'second-invocation',
    }),
    /正在刪除或維護中/,
  );
  owners.forEach(({ roomId }) => {
    assert.equal(setup.database.data.roomAccess[roomId].creationId, undefined);
    assert.equal(
      setup.database.data.maintenanceRepairs.legacyTicketPath[roomId].invocationId,
      'first-invocation',
    );
  });
});

test('apply performs a full preflight before the first write', async () => {
  const { setup, manifest } = await buildManifest();
  setup.database.data.tripDeletions = {
    'legacy-two': { state: 'requested' },
  };

  await assert.rejects(
    () => applyCreationIdRepairManifest({ ...setup, rawManifest: manifest }),
    /正在刪除或維護中/,
  );
  assert.equal(setup.database.transactionCount, 0);
  assert.equal(setup.database.data.roomAccess['legacy-one'].creationId, undefined);
});

test('partial maintenance lease acquisition releases only leases owned by this invocation', async () => {
  const { setup, manifest } = await buildManifest();
  const secondLeasePath = 'maintenanceRepairs/legacyTicketPath/legacy-two';
  setup.database.beforeTransaction = ({ path, callNumber, database }) => {
    if (path === secondLeasePath && callNumber === 1) {
      writePath(database.data, path, {
        version: 1,
        operation: 'foreign-repair',
        runId: 'foreign-run',
        manifestSha256: '0'.repeat(64),
        roomId: 'legacy-two',
        phase: 'apply',
        invocationId: 'foreign-invocation',
        acquiredAt: 1,
      });
    }
  };

  await assert.rejects(
    () => applyCreationIdRepairManifest({
      ...setup,
      rawManifest: manifest,
      invocationId: 'current-invocation',
      leaseAcquiredAt: 10,
    }),
    /maintenance lease 無法取得/,
  );
  assert.equal(
    readPath(setup.database.data, 'maintenanceRepairs/legacyTicketPath/legacy-one'),
    undefined,
  );
  assert.equal(
    readPath(setup.database.data, secondLeasePath).invocationId,
    'foreign-invocation',
  );
  assert.equal(setup.database.data.roomAccess['legacy-one'].creationId, undefined);
});

test('lease ownership drift after apply is reported and never releases the foreign lease', async () => {
  const { setup, manifest } = await buildManifest();
  const secondLeasePath = 'maintenanceRepairs/legacyTicketPath/legacy-two';
  setup.database.beforeTransaction = ({ path, callNumber, database }) => {
    if (path === secondLeasePath && callNumber === 2) {
      const lease = readPath(database.data, path);
      writePath(database.data, path, { ...lease, invocationId: 'foreign-invocation' });
    }
  };

  await assert.rejects(
    () => applyCreationIdRepairManifest({
      ...setup,
      rawManifest: manifest,
      invocationId: 'current-invocation',
      leaseAcquiredAt: 10,
    }),
    /maintenance lease 未完整釋放/,
  );
  assert.equal(
    readPath(setup.database.data, secondLeasePath).invocationId,
    'foreign-invocation',
  );
  assert.equal(
    setup.database.data.roomAccess['legacy-one'].creationId,
    'legacy-migration-legacy-one',
  );
  assert.equal(
    setup.database.data.roomAccess['legacy-two'].creationId,
    'legacy-migration-legacy-two',
  );
});

test('single-entry transaction rejects access drift and supports the Admin local-null retry', async () => {
  const { setup, manifest } = await buildManifest();
  const entry = manifest.entries[0];
  await applyCreationIdEntry({
    reference: setup.database.ref('roomAccess/legacy-one'),
    entry,
  });
  assert.equal(
    setup.database.data.roomAccess['legacy-one'].creationId,
    entry.expectedCreationId,
  );

  delete setup.database.data.roomAccess['legacy-one'].creationId;
  setup.database.data.roomAccess['legacy-one'].state = 'deleting';
  await assert.rejects(
    () => applyCreationIdEntry({
      reference: setup.database.ref('roomAccess/legacy-one'),
      entry,
    }),
    /transaction 前已漂移/,
  );
});

test('manifest is immutable and SHA-bound', async () => {
  const { manifest } = await buildManifest();
  const directory = await mkdtemp(join(tmpdir(), 'travel-creation-id-repair-'));
  const path = join(directory, 'legacy-creation-id-repair-test.local.json');
  try {
    const persisted = await writeCreationIdRepairManifest(path, manifest);
    const loaded = await readCreationIdRepairManifest(path, persisted.sha256);
    assert.deepEqual(loaded.manifest, manifest);
    assert.equal(await readFile(path, 'utf8'), `${JSON.stringify(manifest, null, 2)}\n`);
    await assert.rejects(
      () => writeCreationIdRepairManifest(path, manifest),
      /拒絕覆寫/,
    );
    await assert.rejects(
      () => readCreationIdRepairManifest(path, '0'.repeat(64)),
      /SHA256/,
    );
    const tampered = clone(manifest);
    tampered.mappingSha256 = '0'.repeat(64);
    await assert.rejects(
      () => writeCreationIdRepairManifest(
        join(directory, 'legacy-creation-id-repair-tampered.local.json'),
        tampered,
      ),
      /mapping SHA256/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('CLI defaults to plan and requires typed apply confirmations', () => {
  const base = [
    '--mapping', 'scripts/legacy-owner-map.production.local.json',
    '--manifest', 'legacy-creation-id-repair-test.local.json',
    '--project', 'travel-app-923ef',
    '--database-url', 'https://travel-app-923ef-default-rtdb.firebaseio.com',
    '--expected-count', '35',
  ];
  assert.equal(parseCreationIdRepairCli(base).phase, 'plan');
  assert.throws(
    () => parseCreationIdRepairCli([...base, '--apply']),
    /confirm-manifest-sha256/,
  );
  const confirmations = [
    '--confirm-project', 'travel-app-923ef',
    '--confirm-database-host', 'travel-app-923ef-default-rtdb.firebaseio.com',
    '--confirm-count', '35',
    '--confirm-candidate-count', '35',
    '--confirm-manifest-sha256', 'a'.repeat(64),
    '--confirm-maintenance-window', 'production-paused-users-inactive',
  ];
  const apply = parseCreationIdRepairCli([...base, '--apply', ...confirmations]);
  assert.equal(apply.phase, 'apply');
  assert.equal(apply.confirmedCandidateCount, 35);

  const verify = parseCreationIdRepairCli([
    ...base,
    '--verify',
    '--confirm-manifest-sha256', 'a'.repeat(64),
  ]);
  assert.equal(verify.phase, 'verify');
});
