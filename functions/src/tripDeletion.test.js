import assert from 'node:assert/strict';
import test from 'node:test';

import { createCollaborationService } from './collaboration.js';
import { CollaborationError } from './domain.js';
import { createTripDeletionService } from './tripDeletion.js';

const ownerAuth = {
  uid: 'owner-uid',
  token: {
    name: 'Owner',
    firebase: { sign_in_provider: 'google.com' },
  },
};

const editorAuth = {
  uid: 'editor-uid',
  token: {
    name: 'Editor',
    firebase: { sign_in_provider: 'google.com' },
  },
};

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const pathSegments = (path) => String(path || '').split('/').filter(Boolean);

const valueAtPath = (root, path) => {
  let current = root;
  for (const segment of pathSegments(path)) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
};

const assignAtPath = (root, path, value) => {
  const segments = pathSegments(path);
  assert.ok(segments.length > 0, 'The in-memory Database cannot replace its root.');
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    if (!parent[segment] || typeof parent[segment] !== 'object') parent[segment] = {};
    parent = parent[segment];
  }
  const key = segments.at(-1);
  if (value === null || value === undefined) delete parent[key];
  else parent[key] = clone(value);
};

class MemorySnapshot {
  constructor(value) {
    this.value = clone(value);
  }

  exists() {
    return this.value !== undefined && this.value !== null;
  }

  val() {
    return this.exists() ? clone(this.value) : null;
  }
}

class MemoryDatabase {
  constructor(initial) {
    this.state = clone(initial);
    this.finalUpdateFailures = 0;
    this.completionUpdateFailures = 0;
    this.lockFailures = 0;
    this.initialNullTransactions = new Set();
  }

  value(path) {
    return clone(valueAtPath(this.state, path));
  }

  setValue(path, value) {
    assignAtPath(this.state, path, value);
  }

  ref(path = '') {
    const normalized = pathSegments(path).join('/');
    const reference = {
      get: async () => new MemorySnapshot(this.value(normalized)),
      set: async (value) => this.setValue(normalized, value),
      remove: async () => this.setValue(normalized, null),
      update: async (updates) => {
        if (!normalized && updates['rooms/room-1'] === null && this.finalUpdateFailures > 0) {
          this.finalUpdateFailures -= 1;
          throw new Error('injected final RTDB failure');
        }
        if (
          !normalized
          && updates['tripDeletions/room-1']?.state === 'deleted'
          && this.completionUpdateFailures > 0
        ) {
          this.completionUpdateFailures -= 1;
          throw new Error('injected completion RTDB failure');
        }
        for (const [relativePath, value] of Object.entries(updates)) {
          const target = [normalized, relativePath].filter(Boolean).join('/');
          this.setValue(target, value);
        }
      },
      transaction: async (updateValue) => {
        if (normalized === 'roomAccess/room-1' && this.lockFailures > 0) {
          this.lockFailures -= 1;
          return { committed: false, snapshot: new MemorySnapshot(this.value(normalized)) };
        }
        if (this.initialNullTransactions.has(normalized)) {
          const localResult = updateValue(null);
          if (localResult === undefined) {
            return { committed: false, snapshot: new MemorySnapshot(null) };
          }
        }
        const current = this.value(normalized);
        const next = updateValue(current === undefined ? null : current);
        if (next === undefined) {
          return { committed: false, snapshot: new MemorySnapshot(current) };
        }
        this.setValue(normalized, next);
        return { committed: true, snapshot: new MemorySnapshot(next) };
      },
      orderByChild: (child) => ({
        equalTo: (expected) => ({
          get: async () => {
            const source = this.value(normalized);
            const filtered = Object.fromEntries(
              Object.entries(source && typeof source === 'object' ? source : {})
                .filter(([, value]) => value?.[child] === expected),
            );
            return new MemorySnapshot(Object.keys(filtered).length > 0 ? filtered : null);
          },
        }),
      }),
    };
    return reference;
  }
}

class MemoryFirestore {
  constructor(initial = {}) {
    this.documents = new Map(
      Object.entries(initial).map(([path, value]) => [path, clone(value)]),
    );
    this.batchFailures = 0;
    this.deletingGuardFailures = 0;
    this.deletedGuardFailures = 0;
  }

  value(path) {
    return clone(this.documents.get(path));
  }

  doc(path) {
    return {
      path,
      get: async () => {
        const value = this.value(path);
        return { exists: value !== undefined, data: () => clone(value) };
      },
      set: async (value) => this.documents.set(path, clone(value)),
      delete: async () => this.documents.delete(path),
    };
  }

  collection(path) {
    return {
      get: async () => ({
        docs: [...this.documents.keys()]
          .filter((documentPath) => (
            documentPath.startsWith(`${path}/`)
            && pathSegments(documentPath).length === pathSegments(path).length + 1
          ))
          .map((documentPath) => ({ ref: this.doc(documentPath), id: pathSegments(documentPath).at(-1) })),
      }),
    };
  }

  batch() {
    const deletes = [];
    return {
      delete: (reference) => deletes.push(reference.path),
      commit: async () => {
        if (this.batchFailures > 0) {
          this.batchFailures -= 1;
          throw new Error('injected Firestore batch failure');
        }
        deletes.forEach((path) => this.documents.delete(path));
      },
    };
  }

  async runTransaction(callback) {
    const writes = [];
    const result = await callback({
      get: async (reference) => {
        const value = this.value(reference.path);
        return { exists: value !== undefined, data: () => clone(value) };
      },
      set: (reference, value) => writes.push(['set', reference.path, value]),
      delete: (reference) => writes.push(['delete', reference.path]),
    });
    if (
      this.deletingGuardFailures > 0
      && writes.some(([type, path, value]) => (
        type === 'set' && path === 'tripAccess/room-1' && value?.state === 'deleting'
      ))
    ) {
      this.deletingGuardFailures -= 1;
      throw new Error('injected deleting guard failure');
    }
    if (
      this.deletedGuardFailures > 0
      && writes.some(([type, path, value]) => (
        type === 'set' && path === 'tripAccess/room-1' && value?.state === 'deleted'
      ))
    ) {
      this.deletedGuardFailures -= 1;
      throw new Error('injected deleted guard failure');
    }
    writes.forEach(([type, path, value]) => {
      if (type === 'delete') this.documents.delete(path);
      else this.documents.set(path, clone(value));
    });
    return result;
  }
}

class MemoryBucket {
  constructor(initialNames = []) {
    this.objects = new Map(
      initialNames.map((name, index) => [name, { generation: String(index + 1) }]),
    );
    this.failedNames = new Set();
    this.deleteCalls = [];
    this.getFilesCalls = [];
    this.afterGetFiles = null;
  }

  file(name) {
    return {
      name,
      delete: async (options) => {
        this.deleteCalls.push({ name, options: clone(options) });
        if (this.failedNames.has(name)) throw new Error(`held object: ${name}`);
        const current = this.objects.get(name);
        if (!current) {
          if (options?.ignoreNotFound) return;
          throw new Error('object not found');
        }
        if (
          options?.ifGenerationMatch
          && options.ifGenerationMatch !== current.generation
        ) {
          const error = new Error('generation mismatch');
          error.code = 412;
          throw error;
        }
        this.objects.delete(name);
      },
    };
  }

  async getFiles(options) {
    const { prefix, maxResults } = options;
    this.getFilesCalls.push(clone(options));
    const files = [...this.objects.entries()]
      .filter(([name]) => name.startsWith(prefix))
      .slice(0, maxResults)
      .map(([name, metadata]) => ({
        ...this.file(name),
        metadata: clone(metadata),
      }));
    if (this.afterGetFiles) await this.afterGetFiles(this.getFilesCalls.length, this);
    return [files];
  }
}

const ownerMember = {
  uid: ownerAuth.uid,
  role: 'owner',
  status: 'active',
  aclVersion: 4,
  displayName: 'Owner',
  joinedAt: 1,
  updatedAt: 1,
};

const editorMember = {
  uid: editorAuth.uid,
  role: 'editor',
  status: 'active',
  aclVersion: 2,
  displayName: 'Editor',
  joinedAt: 1,
  updatedAt: 1,
};

const baseDatabaseState = () => ({
  rooms: {
    'room-1': {
      meta: { title: 'Tokyo', ownerUid: ownerAuth.uid },
      itinerary: { 'Day 1': [{ id: 'place-1' }] },
      expenses: [{ id: 'expense-1' }],
      tickets: [{ id: 'ticket-1' }],
    },
    'room-10': { meta: { title: 'Keep me' } },
  },
  roomAccess: {
    'room-1': {
      ownerUid: ownerAuth.uid,
      creationId: 'creation-1',
      state: 'ready',
      members: {
        [ownerAuth.uid]: ownerMember,
        [editorAuth.uid]: editorMember,
      },
      invite: { tokenHash: 'current-hash', active: true, version: 2 },
    },
  },
  userTrips: {
    [ownerAuth.uid]: {
      'room-1': { role: 'owner', status: 'active', aclVersion: 4 },
    },
    [editorAuth.uid]: {
      'room-1': { role: 'editor', status: 'active', aclVersion: 2 },
    },
  },
  roomReservations: {
    'room-1': {
      roomId: 'room-1',
      creationId: 'creation-1',
      createdByUid: ownerAuth.uid,
      createdAt: 1,
    },
  },
  tripInvites: {
    'current-hash': { roomId: 'room-1', active: true },
    'orphan-hash': { roomId: 'room-1', active: false, pending: true },
    'other-hash': { roomId: 'room-10', active: true },
  },
  userQuotas: {
    [ownerAuth.uid]: {
      createTrip: { totalCount: 2, windowCount: 2, windowStartedAt: 1 },
    },
  },
});

const baseFirestoreState = () => ({
  [`tripAccess/room-1/members/${ownerAuth.uid}`]: {
    uid: ownerAuth.uid,
    role: 'owner',
    status: 'active',
    aclVersion: 4,
  },
  [`tripAccess/room-1/members/${editorAuth.uid}`]: {
    uid: editorAuth.uid,
    role: 'editor',
    status: 'active',
    aclVersion: 2,
  },
  'tripAccess/room-1/members/orphan-uid': {
    uid: 'orphan-uid',
    role: 'editor',
    status: 'active',
    aclVersion: 1,
  },
  'tripAccess/room-10/members/owner-uid': {
    uid: ownerAuth.uid,
    role: 'owner',
    status: 'active',
    aclVersion: 1,
  },
});

const createFixture = ({
  storagePageSize = 100,
  maxStoragePagesPerRun = 5,
} = {}) => {
  const database = new MemoryDatabase(baseDatabaseState());
  const firestore = new MemoryFirestore(baseFirestoreState());
  const bucket = new MemoryBucket([
    'rooms/room-1/tickets/ticket-1/pass.pdf',
    'rooms/room-1/places/place-1/photo.png',
    'rooms/room-10/tickets/ticket-10/keep.pdf',
  ]);
  let timestamp = 10_000;
  let operation = 0;
  const service = createTripDeletionService({
    database,
    firestore,
    bucket,
    clock: () => {
      timestamp += 1;
      return timestamp;
    },
    operationIdFactory: () => `operation-${operation += 1}`,
    sleep: async () => {},
    storageSettleMs: 0,
    storagePageSize,
    maxStoragePagesPerRun,
  });
  return { database, firestore, bucket, service };
};

const collaborationError = (code) => (error) => (
  error instanceof CollaborationError && error.code === code
);

const runWorkerToCompletion = async (service, roomId = 'room-1') => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await service.processTripDeletion(roomId);
    if (result.completed) return result;
    assert.equal(result.retryRequired, true);
    assert.notEqual(result.busy, true);
  }
  assert.fail('worker did not converge within 20 bounded attempts');
};

test('owner deletion removes every room namespace while retaining permanent tombstones', async () => {
  const { database, firestore, bucket, service } = createFixture();

  const accepted = await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  assert.deepEqual(accepted, {
    roomId: 'room-1',
    deletionId: accepted.deletionId,
    accepted: true,
    state: 'requested',
    alreadyDeleted: false,
  });
  assert.ok(database.value('rooms/room-1'));
  assert.equal(database.value('roomAccess/room-1/state'), 'ready');
  assert.equal(database.value(`userTrips/${ownerAuth.uid}/room-1/status`), 'deleting');

  await runWorkerToCompletion(service);

  assert.equal(database.value('rooms/room-1'), undefined);
  assert.equal(database.value('roomAccess/room-1'), undefined);
  assert.equal(database.value(`userTrips/${ownerAuth.uid}/room-1`), undefined);
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1`), undefined);
  assert.equal(database.value('tripInvites/current-hash'), undefined);
  assert.equal(database.value('tripInvites/orphan-hash'), undefined);
  assert.deepEqual(database.value('tripInvites/other-hash'), {
    roomId: 'room-10',
    active: true,
  });
  const reservationTombstone = database.value('roomReservations/room-1');
  assert.deepEqual(reservationTombstone, {
    roomId: 'room-1',
    creationId: 'creation-1',
    createdByUid: ownerAuth.uid,
    createdAt: 1,
    deletionId: accepted.deletionId,
    deletedAt: reservationTombstone.deletedAt,
    state: 'deleted',
  });
  assert.ok(reservationTombstone.deletedAt <= database.value('tripDeletions/room-1/completedAt'));
  assert.equal(database.value('tripDeletions/room-1/state'), 'deleted');
  assert.deepEqual(
    Object.keys(database.value('tripDeletions/room-1')).sort(),
    [
      'completedAt',
      'creationId',
      'deletionId',
      'ownerUid',
      'requestedAt',
      'roomId',
      'state',
      'updatedAt',
    ],
  );
  assert.equal(database.value('tripDeletions/room-1/titleSnapshot'), undefined);
  assert.equal(database.value('tripDeletions/room-1/members'), undefined);
  assert.equal(database.value('tripDeletions/room-1/inviteHashes'), undefined);
  assert.equal(database.value(`userQuotas/${ownerAuth.uid}/createTrip/totalCount`), 1);
  assert.deepEqual(database.value(`userQuotas/${ownerAuth.uid}/createTrip/pendingReleases`), {});

  assert.equal(firestore.value(`tripAccess/room-1/members/${ownerAuth.uid}`), undefined);
  assert.equal(firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`), undefined);
  assert.equal(firestore.value('tripAccess/room-1/members/orphan-uid'), undefined);
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleted');
  assert.ok(firestore.value('tripAccess/room-10/members/owner-uid'));
  assert.deepEqual([...bucket.objects.keys()], ['rooms/room-10/tickets/ticket-10/keep.pdf']);
  assert.ok(bucket.deleteCalls.every(({ options }) => options.ignoreNotFound === true));
  assert.ok(bucket.deleteCalls.every(({ options }) => options.ifGenerationMatch));
  assert.ok(bucket.getFilesCalls.every((options) => options.autoPaginate === false));
  assert.ok(bucket.getFilesCalls.every((options) => options.maxResults === 100));
});

test('a finalized object arriving after completion is deleted from the permanent namespace', async () => {
  const { bucket, service } = createFixture();
  const latePath = 'rooms/room-1/tickets/late-ticket/late.pdf';

  bucket.objects.set(latePath, { generation: '900' });
  assert.deepEqual(
    await service.cleanupFinalizedDeletedTripObject({
      name: latePath,
      generation: '900',
    }),
    { roomId: 'room-1', ignored: true },
  );
  assert.ok(bucket.objects.has(latePath));

  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  await runWorkerToCompletion(service);
  bucket.objects.set(latePath, { generation: '902' });

  assert.deepEqual(
    await service.cleanupFinalizedDeletedTripObject({
      name: latePath,
      generation: '901',
    }),
    { roomId: 'room-1', superseded: true },
  );
  assert.equal(bucket.objects.get(latePath)?.generation, '902');

  assert.deepEqual(
    await service.cleanupFinalizedDeletedTripObject({
      name: latePath,
      generation: '902',
    }),
    { roomId: 'room-1', deleted: true },
  );
  assert.equal(bucket.objects.has(latePath), false);
  assert.deepEqual(bucket.deleteCalls.at(-1), {
    name: latePath,
    options: { ignoreNotFound: true, ifGenerationMatch: '902' },
  });
});

test('editor and non-Google identities cannot start or resume owner deletion', async () => {
  const { database, firestore, bucket, service } = createFixture();
  const beforeDatabase = clone(database.state);
  const beforeFirestore = clone([...firestore.documents.entries()]);
  const beforeStorage = clone([...bucket.objects.entries()]);

  await assert.rejects(
    () => service.deleteTrip({ roomId: 'room-1' }, editorAuth),
    collaborationError('permission-denied'),
  );
  await assert.rejects(
    () => service.deleteTrip({ roomId: 'room-1' }, {
      ...ownerAuth,
      token: { firebase: { sign_in_provider: 'password' } },
    }),
    collaborationError('permission-denied'),
  );

  assert.deepEqual(database.state, beforeDatabase);
  assert.deepEqual([...firestore.documents.entries()], beforeFirestore);
  assert.deepEqual([...bucket.objects.entries()], beforeStorage);
});

test('Storage failure keeps the trip fail-closed and exposes an owner retry index', async () => {
  const { database, firestore, bucket, service } = createFixture();
  const heldPath = 'rooms/room-1/tickets/ticket-1/pass.pdf';
  bucket.failedNames.add(heldPath);
  const accepted = await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  database.setValue(`userTrips/${ownerAuth.uid}/room-1`, null);

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    /held object/u,
  );

  assert.equal(database.value('roomAccess/room-1'), undefined);
  assert.equal(database.value('tripDeletions/room-1/state'), 'deleting');
  assert.equal(database.value(`userTrips/${ownerAuth.uid}/room-1/deletionId`), accepted.deletionId);
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1`), undefined);
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleting');
  assert.equal(firestore.value(`tripAccess/room-1/members/${ownerAuth.uid}`), undefined);
  assert.equal(database.value(`userQuotas/${ownerAuth.uid}/createTrip/totalCount`), 1);
  assert.ok(bucket.objects.has(heldPath));

  bucket.failedNames.clear();
  await runWorkerToCompletion(service);
  assert.equal(database.value(`userQuotas/${ownerAuth.uid}/createTrip/totalCount`), 1);
  assert.equal(bucket.objects.has(heldPath), false);
});

test('Storage deletion fails closed before deleting any object without a generation', async () => {
  const { database, firestore, bucket, service } = createFixture();
  bucket.objects.set('rooms/room-1/tickets/missing-generation.pdf', {});
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    collaborationError('failed-precondition'),
  );

  assert.equal(database.value('roomAccess/room-1'), undefined);
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleting');
  assert.equal(bucket.deleteCalls.length, 0);
  assert.ok(bucket.objects.has('rooms/room-1/tickets/ticket-1/pass.pdf'));
  assert.ok(bucket.objects.has('rooms/room-1/tickets/missing-generation.pdf'));
});

test('a deleting guard failure leaves RTDB ready instead of exposing Storage after a lock', async () => {
  const { database, firestore, bucket, service } = createFixture();
  firestore.deletingGuardFailures = 1;
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    /injected deleting guard failure/u,
  );

  assert.equal(database.value('roomAccess/room-1/state'), 'ready');
  assert.equal(firestore.value('tripAccess/room-1'), undefined);
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'active');
  assert.equal(bucket.deleteCalls.length, 0);
});

test('an RTDB lock failure retains the Storage guard without changing editor projections', async () => {
  const { database, firestore, bucket, service } = createFixture();
  database.lockFailures = 1;
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    collaborationError('permission-denied'),
  );

  assert.equal(database.value('roomAccess/room-1/state'), 'ready');
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleting');
  assert.equal(database.value(`userTrips/${ownerAuth.uid}/room-1/status`), 'deleting');
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'active');
  assert.equal(bucket.deleteCalls.length, 0);
});

test('a Firestore ACL failure is retryable and never reaches Storage cleanup early', async () => {
  const { database, firestore, bucket, service } = createFixture();
  firestore.batchFailures = 1;
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    /injected Firestore batch failure/u,
  );
  assert.equal(database.value('roomAccess/room-1/state'), 'deleting');
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleting');
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'removed');
  assert.equal(bucket.deleteCalls.length, 0);

  await runWorkerToCompletion(service);
});

test('quota release is exact-once when the final RTDB update fails and is retried', async () => {
  const { database, firestore, service } = createFixture();
  database.finalUpdateFailures = 1;
  const accepted = await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    /injected final RTDB failure/u,
  );
  assert.equal(database.value(`userQuotas/${ownerAuth.uid}/createTrip/totalCount`), 1);
  assert.equal(database.value('tripDeletions/room-1/state'), 'deleting');
  assert.equal(
    database.value(`userQuotas/${ownerAuth.uid}/createTrip/pendingReleases/${accepted.deletionId}/roomId`),
    'room-1',
  );

  const collaboration = createCollaborationService({
    database,
    firestore,
    clock: () => 20_000,
  });
  await collaboration.createTrip({
    roomId: 'room-created-during-retry',
    meta: {
      title: 'New trip',
      destination: 'Taipei',
      destLat: 25.033,
      destLng: 121.5654,
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      members: ['Owner'],
    },
  }, ownerAuth);
  assert.equal(database.value(`userQuotas/${ownerAuth.uid}/createTrip/totalCount`), 2);

  await runWorkerToCompletion(service);
  assert.equal(database.value(`userQuotas/${ownerAuth.uid}/createTrip/totalCount`), 2);
  assert.deepEqual(database.value(`userQuotas/${ownerAuth.uid}/createTrip/pendingReleases`), {});
});

test('completed deletion retries are idempotent and do not touch unrelated namespaces', async () => {
  const { database, firestore, bucket, service } = createFixture();
  const accepted = await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  await runWorkerToCompletion(service);
  const quota = database.value(`userQuotas/${ownerAuth.uid}/createTrip`);
  const unrelatedRoom = database.value('rooms/room-10');
  const unrelatedAcl = firestore.value('tripAccess/room-10/members/owner-uid');
  const unrelatedObject = bucket.objects.get('rooms/room-10/tickets/ticket-10/keep.pdf');

  assert.deepEqual(await service.deleteTrip({ roomId: 'room-1' }, ownerAuth), {
    roomId: 'room-1',
    deletionId: accepted.deletionId,
    accepted: true,
    state: 'deleted',
    alreadyDeleted: true,
  });
  assert.equal((await service.processTripDeletion('room-1')).completed, true);
  assert.deepEqual(database.value(`userQuotas/${ownerAuth.uid}/createTrip`), quota);
  assert.deepEqual(database.value('rooms/room-10'), unrelatedRoom);
  assert.deepEqual(firestore.value('tripAccess/room-10/members/owner-uid'), unrelatedAcl);
  assert.deepEqual(bucket.objects.get('rooms/room-10/tickets/ticket-10/keep.pdf'), unrelatedObject);
});

test('reservation and canonical creation mismatches stop before any destructive phase', async () => {
  const { database, firestore, bucket, service } = createFixture();
  database.setValue('roomReservations/room-1/creationId', 'another-creation');

  await assert.rejects(
    () => service.deleteTrip({ roomId: 'room-1' }, ownerAuth),
    collaborationError('permission-denied'),
  );
  assert.ok(database.value('rooms/room-1'));
  assert.equal(database.value('tripDeletions/room-1'), undefined);
  assert.equal(firestore.value('tripAccess/room-1'), undefined);
  assert.equal(bucket.deleteCalls.length, 0);
});

test('an active legacy ticket repair lease blocks deletion before any mutation', async () => {
  const { database, firestore, bucket, service } = createFixture();
  database.setValue('maintenanceRepairs/legacyTicketPath/room-1', {
    runId: 'repair-run',
    phase: 'applied',
  });

  await assert.rejects(
    () => service.deleteTrip({ roomId: 'room-1' }, ownerAuth),
    collaborationError('failed-precondition'),
  );
  assert.equal(database.value('roomAccess/room-1/state'), 'ready');
  assert.equal(database.value('tripDeletions/room-1'), undefined);
  assert.equal(firestore.value('tripAccess/room-1'), undefined);
  assert.equal(bucket.deleteCalls.length, 0);
});

test('existing-value transactions survive the Admin SDK initial local null callback', async () => {
  const { database, service } = createFixture();
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  database.initialNullTransactions.add('roomAccess/room-1');
  database.initialNullTransactions.add('tripDeletions/room-1');
  database.initialNullTransactions.add('tripDeletionWorkers/room-1');

  await runWorkerToCompletion(service);

  assert.equal(database.value('tripDeletions/room-1/state'), 'deleted');
});

test('a live same-room lease is retryable and an expired lease can be taken over', async () => {
  const { database, service } = createFixture();
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  database.setValue('tripDeletionWorkers/room-1', {
    workerId: 'stalled-worker',
    acquiredAt: 9_000,
    heartbeatAt: 9_000,
    expiresAt: 999_999,
  });

  assert.deepEqual(await service.processTripDeletion('room-1'), {
    roomId: 'room-1',
    busy: true,
    retryRequired: true,
  });
  database.setValue('tripDeletionWorkers/room-1/expiresAt', 1);

  await runWorkerToCompletion(service);
  assert.equal(database.value('tripDeletions/room-1/state'), 'deleted');
});

test('bounded Storage pages remove a late writer and require two empty sweeps', async () => {
  const { bucket, service } = createFixture({
    storagePageSize: 1,
    maxStoragePagesPerRun: 1,
  });
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  bucket.afterGetFiles = async (call, memoryBucket) => {
    if (call === 4) {
      memoryBucket.objects.set('rooms/room-1/tickets/late/pass.pdf', { generation: 'late-1' });
    }
  };

  await runWorkerToCompletion(service);

  assert.equal(
    [...bucket.objects.keys()].some((name) => name.startsWith('rooms/room-1/')),
    false,
  );
  assert.ok(bucket.getFilesCalls.length >= 6);
  assert.ok(bucket.getFilesCalls.every((options) => options.autoPaginate === false));
  assert.ok(bucket.getFilesCalls.every((options) => options.maxResults === 1));
});

test('a failed final Firestore guard converges on retry without reopening the namespace', async () => {
  const { database, firestore, service } = createFixture();
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  const first = await service.processTripDeletion('room-1');
  assert.equal(first.retryRequired, true);
  firestore.deletedGuardFailures = 1;

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    /injected deleted guard failure/u,
  );
  assert.equal(database.value('rooms/room-1'), undefined);
  assert.equal(database.value('tripDeletions/room-1/phase'), 'namespace-closed');

  await runWorkerToCompletion(service);
  const canonical = clone(database.value('tripDeletions/room-1'));
  firestore.documents.set('tripAccess/room-1', {
    ...firestore.value('tripAccess/room-1'),
    state: 'deleting',
  });
  await service.processTripDeletion('room-1');
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleted');
  assert.deepEqual(database.value('tripDeletions/room-1'), canonical);
});

test('a deleted Firestore guard is never downgraded when final RTDB completion retries', async () => {
  const { database, firestore, service } = createFixture();
  await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  assert.equal((await service.processTripDeletion('room-1')).retryRequired, true);
  database.completionUpdateFailures = 1;

  await assert.rejects(
    () => service.processTripDeletion('room-1'),
    /injected completion RTDB failure/u,
  );
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleted');
  assert.equal(database.value('tripDeletions/room-1/phase'), 'namespace-closed');
  assert.equal(database.value(`userTrips/${ownerAuth.uid}/room-1/status`), 'deleting');

  await runWorkerToCompletion(service);
  assert.equal(firestore.value('tripAccess/room-1').state, 'deleted');
  assert.equal(database.value('tripDeletions/room-1/state'), 'deleted');
});

test('owner retry updates the durable request signal without creating another deletion', async () => {
  const { database, service } = createFixture();
  const first = await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);
  const firstKick = database.value('tripDeletions/room-1/kick');
  const second = await service.deleteTrip({ roomId: 'room-1' }, ownerAuth);

  assert.equal(second.deletionId, first.deletionId);
  assert.notEqual(database.value('tripDeletions/room-1/kick'), firstKick);
  assert.equal(database.value('tripDeletions/room-1/state'), 'requested');
});

test('concurrent owner requests converge on one immutable deletion identity', async () => {
  const { database, service } = createFixture();
  const [first, second] = await Promise.all([
    service.deleteTrip({ roomId: 'room-1' }, ownerAuth),
    service.deleteTrip({ roomId: 'room-1' }, ownerAuth),
  ]);

  assert.equal(first.deletionId, second.deletionId);
  assert.equal(database.value('tripDeletions/room-1/deletionId'), first.deletionId);
  assert.equal(database.value('tripDeletions/room-1/state'), 'requested');
});
