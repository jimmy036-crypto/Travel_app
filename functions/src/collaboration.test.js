import assert from 'node:assert/strict';
import test from 'node:test';

import { createCollaborationService } from './collaboration.js';
import { CollaborationError, hashInviteToken } from './domain.js';

const googleAuth = {
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

const secondEditorAuth = {
  uid: 'second-editor-uid',
  token: {
    name: 'Second editor',
    firebase: { sign_in_provider: 'google.com' },
  },
};

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const pathSegments = (path) => String(path || '')
  .split('/')
  .filter(Boolean);

const valueAtPath = (root, path) => {
  let current = root;
  for (const segment of pathSegments(path)) {
    if (current === null || typeof current !== 'object' || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
};

const assignAtPath = (root, path, value) => {
  const segments = pathSegments(path);
  assert.notEqual(segments.length, 0, 'The in-memory database does not replace its root.');
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    if (parent[segment] === null || typeof parent[segment] !== 'object') {
      parent[segment] = {};
    }
    parent = parent[segment];
  }
  const key = segments.at(-1);
  if (value === null || value === undefined) {
    delete parent[key];
  } else {
    parent[key] = clone(value);
  }
};

class MemorySnapshot {
  constructor(value) {
    this.value = clone(value);
  }

  exists() {
    return this.value !== null && this.value !== undefined;
  }

  val() {
    return this.exists() ? clone(this.value) : null;
  }
}

class MemoryRealtimeDatabase {
  constructor(initial = {}) {
    this.state = clone(initial);
    this.beforeSet = null;
  }

  value(path) {
    return clone(valueAtPath(this.state, path));
  }

  setValue(path, value) {
    assignAtPath(this.state, path, value);
  }

  ref(path = '') {
    const basePath = pathSegments(path).join('/');
    const childPath = (relativePath = '') => [
      basePath,
      pathSegments(relativePath).join('/'),
    ].filter(Boolean).join('/');

    return {
      get: async () => new MemorySnapshot(this.value(basePath)),
      set: async (value) => {
        if (this.beforeSet) await this.beforeSet({ path: basePath, value: clone(value) });
        this.setValue(basePath, value);
      },
      remove: async () => {
        this.setValue(basePath, null);
      },
      update: async (updates) => {
        for (const [relativePath, value] of Object.entries(updates)) {
          this.setValue(childPath(relativePath), value);
        }
      },
      transaction: async (updateValue) => {
        const current = this.value(basePath);
        const next = updateValue(current === undefined ? null : current);
        if (next === undefined) {
          return {
            committed: false,
            snapshot: new MemorySnapshot(this.value(basePath)),
          };
        }
        this.setValue(basePath, next);
        return {
          committed: true,
          snapshot: new MemorySnapshot(this.value(basePath)),
        };
      },
    };
  }
}

class MemoryFirestore {
  constructor(initial = {}) {
    this.documents = new Map(
      Object.entries(initial).map(([path, value]) => [path, clone(value)]),
    );
    this.beforeTransaction = null;
    this.transactionFailures = [];
    this.transactionCount = 0;
  }

  doc(path) {
    return {
      path,
      get: async () => {
        const value = this.value(path);
        return {
          exists: value !== undefined,
          data: () => clone(value),
        };
      },
      delete: async () => {
        this.documents.delete(path);
      },
    };
  }

  value(path) {
    return clone(this.documents.get(path));
  }

  setValue(path, value) {
    this.documents.set(path, clone(value));
  }

  async runTransaction(callback) {
    this.transactionCount += 1;
    if (this.beforeTransaction) {
      await this.beforeTransaction({ transactionCount: this.transactionCount });
    }
    const failure = this.transactionFailures.shift();
    if (failure) throw failure;

    const writes = [];
    const result = await callback({
      get: async (reference) => {
        const value = this.value(reference.path);
        return {
          exists: value !== undefined,
          data: () => clone(value),
        };
      },
      set: (reference, value) => {
        writes.push(['set', reference.path, value]);
      },
      delete: (reference) => {
        writes.push(['delete', reference.path]);
      },
    });
    for (const [type, path, value] of writes) {
      if (type === 'delete') this.documents.delete(path);
      else this.setValue(path, value);
    }
    return result;
  }
}

const memberRecord = ({
  uid,
  role = 'editor',
  status = 'active',
  aclVersion = 1,
  updatedAt = 1_000,
  displayName = uid,
}) => ({
  uid,
  displayName,
  photoURL: '',
  role,
  status,
  aclVersion,
  joinedAt: 500,
  updatedAt,
});

const ownerMember = (overrides = {}) => memberRecord({
  uid: googleAuth.uid,
  role: 'owner',
  displayName: 'Owner',
  ...overrides,
});

const editorMember = (overrides = {}) => memberRecord({
  uid: editorAuth.uid,
  displayName: 'Editor',
  ...overrides,
});

const createFixture = ({
  databaseState = {},
  firestoreState = {},
  now = 10_000,
} = {}) => {
  const database = new MemoryRealtimeDatabase(databaseState);
  const firestore = new MemoryFirestore(firestoreState);
  let currentTime = now;
  const service = createCollaborationService({
    database,
    firestore,
    clock: () => currentTime,
  });
  return {
    database,
    firestore,
    service,
    setTime(value) {
      currentTime = value;
    },
  };
};

const activeOwnerAccess = (overrides = {}) => ({
  ownerUid: googleAuth.uid,
  state: 'ready',
  members: {
    [googleAuth.uid]: ownerMember(),
  },
  ...overrides,
});

const expectCollaborationError = (code) => (error) => (
  error instanceof CollaborationError && error.code === code
);

test('createTrip refuses to claim or overwrite a legacy room without an ACL', async () => {
  const database = {
    ref(path = '') {
      assert.equal(path, 'rooms/legacy-room');
      return {
        async get() {
          return { exists: () => true };
        },
      };
    },
  };
  const firestore = { doc: () => ({}) };
  const service = createCollaborationService({ database, firestore });

  await assert.rejects(
    () => service.createTrip({
      roomId: 'legacy-room',
      meta: {
        title: 'Legacy trip',
        destination: 'Taipei',
        destLat: 25.033,
        destLng: 121.5654,
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        members: ['Owner'],
      },
    }, googleAuth),
    (error) => (
      error instanceof CollaborationError
      && error.code === 'already-exists'
      && error.message === '此旅程 ID 已存在。'
    ),
  );
});

test('createTrip never reuses a permanently reserved Storage namespace', async () => {
  const reservation = {
    roomId: 'deleted-room',
    creationId: 'historic-creation',
    createdByUid: 'former-owner',
    createdAt: 100,
  };
  const { database, service } = createFixture({
    databaseState: {
      roomReservations: { 'deleted-room': reservation },
    },
  });

  await assert.rejects(
    () => service.createTrip({
      roomId: 'deleted-room',
      meta: {
        title: 'Replacement trip',
        destination: 'Taipei',
        destLat: 25.033,
        destLng: 121.5654,
        startDate: '2026-09-01',
        endDate: '2026-09-02',
        members: ['Owner'],
      },
    }, googleAuth),
    expectCollaborationError('already-exists'),
  );
  assert.equal(database.value('rooms/deleted-room'), undefined);
  assert.deepEqual(database.value('roomReservations/deleted-room'), reservation);
  assert.equal(database.value(`userQuotas/${googleAuth.uid}/createTrip/totalCount`), 0);
});

test('createTrip preserves bounded pending deletion release claims', async () => {
  const release = {
    roomId: 'deleted-room',
    deletionId: 'deletion-1',
    releasedAt: 9_000,
  };
  const { database, service } = createFixture({
    databaseState: {
      userQuotas: {
        [googleAuth.uid]: {
          createTrip: {
            totalCount: 1,
            windowCount: 1,
            windowStartedAt: 9_000,
            pendingReleases: { 'deletion-1': release },
          },
        },
      },
    },
  });

  await service.createTrip({
    roomId: 'new-room',
    meta: {
      title: 'New trip',
      destination: 'Taipei',
      destLat: 25.033,
      destLng: 121.5654,
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      members: ['Owner'],
    },
  }, googleAuth);

  assert.deepEqual(
    database.value(`userQuotas/${googleAuth.uid}/createTrip/pendingReleases/deletion-1`),
    release,
  );
  assert.equal(database.value(`userQuotas/${googleAuth.uid}/createTrip/totalCount`), 2);
});

test('getOrCreateTripInvite never exposes an existing raw token to an editor', async () => {
  const database = {
    ref(path = '') {
      assert.equal(path, 'roomAccess/room-1');
      return {
        async get() {
          return {
            val: () => ({
              ownerUid: googleAuth.uid,
              invite: {
                token: 'a'.repeat(43),
                tokenHash: 'hash',
                active: true,
                version: 1,
              },
              members: {
                [googleAuth.uid]: {
                  uid: googleAuth.uid,
                  role: 'owner',
                  status: 'active',
                  aclVersion: 1,
                },
                [editorAuth.uid]: {
                  uid: editorAuth.uid,
                  role: 'editor',
                  status: 'active',
                  aclVersion: 1,
                },
              },
            }),
          };
        },
      };
    },
  };
  const firestore = { doc: () => ({}) };
  const service = createCollaborationService({ database, firestore });

  await assert.rejects(
    () => service.getOrCreateTripInvite({ roomId: 'room-1' }, editorAuth),
    (error) => error instanceof CollaborationError && error.code === 'permission-denied',
  );
});

test('active access rejects a malformed member whose embedded uid does not match its path', async () => {
  const database = {
    ref(path = '') {
      assert.equal(path, 'roomAccess/room-1');
      return {
        async get() {
          return {
            val: () => ({
              ownerUid: googleAuth.uid,
              members: {
                [editorAuth.uid]: {
                  uid: 'attacker-uid',
                  role: 'editor',
                  status: 'active',
                  aclVersion: 1,
                },
              },
            }),
          };
        },
      };
    },
  };
  const firestore = { doc: () => ({}) };
  const service = createCollaborationService({ database, firestore });

  await assert.rejects(
    () => service.getOrCreateTripInvite({ roomId: 'room-1' }, editorAuth),
    (error) => error instanceof CollaborationError && error.code === 'permission-denied',
  );
});

test('owner invite creation retries after the Admin SDK initial null transaction value', async () => {
  let access = {
    ownerUid: googleAuth.uid,
    state: 'ready',
    inviteVersion: 0,
    members: {
      [googleAuth.uid]: {
        uid: googleAuth.uid,
        role: 'owner',
        status: 'active',
        aclVersion: 1,
      },
    },
  };
  const inviteWrites = [];
  const database = {
    ref(path = '') {
      if (path === 'roomAccess/room-1') {
        return {
          async get() {
            return { val: () => access };
          },
          async transaction(updateValue) {
            assert.equal(updateValue(null), null);
            access = updateValue(access);
            return {
              committed: true,
              snapshot: { val: () => access },
            };
          },
        };
      }
      if (path.startsWith('tripInvites/')) {
        return {
          async set(value) {
            inviteWrites.push({ path, value });
          },
          async remove() {},
        };
      }
      throw new Error(`Unexpected Database path: ${path}`);
    },
  };
  const firestore = { doc: () => ({}) };
  const service = createCollaborationService({ database, firestore, clock: () => 1234 });

  const result = await service.getOrCreateTripInvite({ roomId: 'room-1' }, googleAuth);

  assert.match(result.token, /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(access.invite.active, true);
  assert.equal(access.invite.version, 1);
  assert.equal(inviteWrites.length, 2);
  assert.equal(inviteWrites.at(-1).value.active, true);
  assert.equal(inviteWrites.at(-1).value.version, 1);
});

test('active invite lookup repair removes its write when ownership maintenance wins the race', async () => {
  const token = 'm'.repeat(43);
  const tokenHash = hashInviteToken(token);
  const invite = {
    token,
    tokenHash,
    active: true,
    version: 4,
    createdAt: 1_000,
    createdByUid: googleAuth.uid,
  };
  const { database, service } = createFixture({
    databaseState: {
      roomAccess: { 'room-1': activeOwnerAccess({ inviteVersion: 4, invite }) },
    },
  });
  let raced = false;
  database.beforeSet = async ({ path }) => {
    if (!raced && path === `tripInvites/${tokenHash}`) {
      raced = true;
      database.setValue('roomAccess/room-1/state', 'maintenance');
      database.setValue('roomAccess/room-1/maintenanceLock', {
        state: 'maintenance', operation: 'trip-owner-transfer', invocationId: 'race',
      });
    }
  };

  await assert.rejects(
    () => service.getOrCreateTripInvite({ roomId: 'room-1' }, googleAuth),
    expectCollaborationError('aborted'),
  );
  assert.equal(raced, true);
  assert.equal(database.value(`tripInvites/${tokenHash}`), undefined);
  assert.equal(database.value('roomAccess/room-1/invite/tokenHash'), tokenHash);
  assert.equal(database.value('roomAccess/room-1/state'), 'maintenance');
});

test('rotating and revoking an invite invalidates every superseded lookup', async () => {
  const oldToken = 'a'.repeat(43);
  const oldTokenHash = hashInviteToken(oldToken);
  const { database, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          inviteVersion: 1,
          invite: {
            token: oldToken,
            tokenHash: oldTokenHash,
            active: true,
            version: 1,
            createdAt: 1_000,
            createdByUid: googleAuth.uid,
          },
        }),
      },
      tripInvites: {
        [oldTokenHash]: {
          roomId: 'room-1',
          role: 'editor',
          active: true,
          version: 1,
        },
      },
    },
  });

  const rotated = await service.rotateTripInvite({ roomId: 'room-1' }, googleAuth);
  const rotatedHash = hashInviteToken(rotated.token);

  assert.notEqual(rotated.token, oldToken);
  assert.equal(database.value(`tripInvites/${oldTokenHash}`), undefined);
  assert.deepEqual(database.value(`tripInvites/${rotatedHash}`), {
    roomId: 'room-1',
    role: 'editor',
    active: true,
    version: 2,
    createdAt: 10_000,
    createdByUid: googleAuth.uid,
  });
  assert.equal(database.value('roomAccess/room-1/inviteVersion'), 2);

  assert.deepEqual(
    await service.revokeTripInvite({ roomId: 'room-1' }, googleAuth),
    { revoked: true },
  );
  assert.equal(database.value(`tripInvites/${rotatedHash}`), undefined);
  assert.equal(database.value('roomAccess/room-1/invite'), undefined);
  assert.equal(database.value('roomAccess/room-1/inviteVersion'), 3);
  assert.equal(database.value('roomAccess/room-1/lastInviteRevokedByUid'), googleAuth.uid);

  assert.deepEqual(
    await service.revokeTripInvite({ roomId: 'room-1' }, googleAuth),
    { revoked: false },
  );
});

test('redeeming an active invite creates matching canonical, index, and Storage ACL access', async () => {
  const token = 'b'.repeat(43);
  const tokenHash = hashInviteToken(token);
  const { database, firestore, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          inviteVersion: 1,
          invite: {
            token,
            tokenHash,
            active: true,
            version: 1,
            createdAt: 1_000,
            createdByUid: googleAuth.uid,
          },
        }),
      },
      tripInvites: {
        [tokenHash]: {
          roomId: 'room-1',
          role: 'editor',
          active: true,
          version: 1,
          createdAt: 1_000,
          createdByUid: googleAuth.uid,
        },
      },
    },
  });

  assert.deepEqual(await service.redeemTripInvite({ token }, editorAuth), {
    roomId: 'room-1',
    role: 'editor',
    joined: true,
  });

  const canonical = database.value(`roomAccess/room-1/members/${editorAuth.uid}`);
  assert.equal(canonical.uid, editorAuth.uid);
  assert.equal(canonical.role, 'editor');
  assert.equal(canonical.status, 'active');
  assert.equal(canonical.aclVersion, 1);
  assert.deepEqual(database.value(`userTrips/${editorAuth.uid}/room-1`), {
    role: 'editor',
    status: 'active',
    aclVersion: 1,
    updatedAt: 10_000,
  });
  assert.deepEqual(firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`), {
    uid: editorAuth.uid,
    role: 'editor',
    status: 'active',
    aclVersion: 1,
    updatedAt: new Date(10_000),
  });

  assert.deepEqual(await service.redeemTripInvite({ token }, editorAuth), {
    roomId: 'room-1',
    role: 'editor',
    joined: false,
  });
  assert.equal(
    database.value(`roomAccess/room-1/members/${editorAuth.uid}/joinOperationId`),
    canonical.joinOperationId,
  );
});

test('member removal and restoration advance ACL versions across every access mirror', async () => {
  const { database, firestore, service, setTime } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          members: {
            [googleAuth.uid]: ownerMember(),
            [editorAuth.uid]: editorMember(),
          },
        }),
      },
      userTrips: {
        [editorAuth.uid]: {
          'room-1': {
            role: 'editor',
            status: 'active',
            aclVersion: 1,
            updatedAt: 1_000,
          },
        },
      },
    },
    firestoreState: {
      [`tripAccess/room-1/members/${editorAuth.uid}`]: {
        uid: editorAuth.uid,
        role: 'editor',
        status: 'active',
        aclVersion: 1,
        updatedAt: new Date(1_000),
      },
    },
  });

  assert.deepEqual(
    await service.removeTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
    { removed: true },
  );
  const removed = database.value(`roomAccess/room-1/members/${editorAuth.uid}`);
  assert.equal(removed.status, 'removed');
  assert.equal(removed.aclVersion, 2);
  assert.equal(removed.removedByUid, googleAuth.uid);
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'removed');
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/aclVersion`), 2);
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).status,
    'removed',
  );
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).aclVersion,
    2,
  );

  setTime(20_000);
  assert.deepEqual(
    await service.restoreTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
    { restored: true },
  );
  const restored = database.value(`roomAccess/room-1/members/${editorAuth.uid}`);
  assert.equal(restored.status, 'active');
  assert.equal(restored.aclVersion, 3);
  assert.equal(restored.removedAt, undefined);
  assert.equal(restored.removedByUid, undefined);
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'active');
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/aclVersion`), 3);
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).status,
    'active',
  );
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).aclVersion,
    3,
  );
});

test('member listing is owner-only, sorted, and omits internal ACL fields', async () => {
  const { service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          members: {
            [googleAuth.uid]: ownerMember(),
            [editorAuth.uid]: editorMember({ displayName: 'Beta' }),
            [secondEditorAuth.uid]: memberRecord({
              uid: secondEditorAuth.uid,
              displayName: 'Alpha',
              status: 'removed',
              aclVersion: 2,
            }),
          },
        }),
      },
    },
  });

  const { members } = await service.listTripMembers({ roomId: 'room-1' }, googleAuth);
  assert.deepEqual(members.map(({ uid, status }) => ({ uid, status })), [
    { uid: googleAuth.uid, status: 'active' },
    { uid: editorAuth.uid, status: 'active' },
    { uid: secondEditorAuth.uid, status: 'removed' },
  ]);
  assert.equal(Object.hasOwn(members[1], 'aclVersion'), false);
  assert.equal(Object.hasOwn(members[2], 'removedByUid'), false);

  await assert.rejects(
    () => service.listTripMembers({ roomId: 'room-1' }, editorAuth),
    expectCollaborationError('permission-denied'),
  );
});

test('a stale active ACL sync cannot overwrite a newer removed tombstone', async () => {
  const staleActive = editorMember({ aclVersion: 2, updatedAt: 2_000 });
  const newerRemovedIndex = {
    role: 'editor',
    status: 'removed',
    aclVersion: 3,
    updatedAt: 3_000,
  };
  const newerRemovedAcl = {
    uid: editorAuth.uid,
    ...newerRemovedIndex,
    updatedAt: new Date(3_000),
  };
  const { database, firestore, service } = createFixture({
    databaseState: {
      userTrips: {
        [editorAuth.uid]: { 'room-1': newerRemovedIndex },
      },
    },
    firestoreState: {
      [`tripAccess/room-1/members/${editorAuth.uid}`]: newerRemovedAcl,
    },
  });

  await assert.rejects(
    () => service.syncMemberAccess('room-1', editorAuth.uid, staleActive),
    expectCollaborationError('aborted'),
  );
  assert.deepEqual(database.value(`userTrips/${editorAuth.uid}/room-1`), newerRemovedIndex);
  assert.deepEqual(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`),
    newerRemovedAcl,
  );
});

test('a malformed canonical member advances beyond active mirrors and fails closed', async () => {
  const malformedCanonical = {
    uid: editorAuth.uid,
    role: 'editor',
    status: 'active',
    updatedAt: 2_000,
  };
  const activeIndex = {
    role: 'editor',
    status: 'active',
    aclVersion: 2,
    updatedAt: 2_000,
  };
  const activeAcl = {
    uid: editorAuth.uid,
    ...activeIndex,
    updatedAt: new Date(2_000),
  };
  const { database, firestore, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          members: {
            [googleAuth.uid]: ownerMember(),
            [editorAuth.uid]: malformedCanonical,
          },
        }),
      },
      userTrips: {
        [editorAuth.uid]: { 'room-1': activeIndex },
      },
    },
    firestoreState: {
      [`tripAccess/room-1/members/${editorAuth.uid}`]: activeAcl,
    },
    now: 3_000,
  });

  const result = await service.syncMemberAccess('room-1', editorAuth.uid);

  assert.deepEqual(result, {
    ...malformedCanonical,
    status: 'removed',
    aclVersion: 3,
    updatedAt: 3_000,
  });
  assert.equal(
    database.value(`roomAccess/room-1/members/${editorAuth.uid}/aclVersion`),
    3,
  );
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'removed');
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/aclVersion`), 3);
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).status,
    'removed',
  );
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).aclVersion,
    3,
  );
});

test('a newer canonical member version repairs older fail-closed mirrors', async () => {
  const canonicalActive = editorMember({ aclVersion: 4, updatedAt: 4_000 });
  const { database, firestore, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          members: {
            [googleAuth.uid]: ownerMember(),
            [editorAuth.uid]: canonicalActive,
          },
        }),
      },
      userTrips: {
        [editorAuth.uid]: {
          'room-1': {
            role: 'editor',
            status: 'removed',
            aclVersion: 3,
            updatedAt: 3_000,
          },
        },
      },
    },
    firestoreState: {
      [`tripAccess/room-1/members/${editorAuth.uid}`]: {
        uid: editorAuth.uid,
        role: 'editor',
        status: 'removed',
        aclVersion: 3,
        updatedAt: new Date(3_000),
      },
    },
  });

  assert.deepEqual(await service.syncMemberAccess('room-1', editorAuth.uid), {
    uid: editorAuth.uid,
    role: 'editor',
    status: 'active',
    aclVersion: 4,
    updatedAt: 4_000,
  });
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/status`), 'active');
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1/aclVersion`), 4);
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).status,
    'active',
  );
  assert.equal(
    firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`).aclVersion,
    4,
  );
});

test('invite and redemption quotas fail closed at their hourly boundaries', async () => {
  const token = 'c'.repeat(43);
  const tokenHash = hashInviteToken(token);
  const { database, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          inviteRate: {
            windowStartedAt: 9_000,
            windowCount: 10,
            updatedAt: 9_000,
          },
          inviteVersion: 1,
          invite: {
            token,
            tokenHash,
            active: true,
            version: 1,
            createdAt: 1_000,
            createdByUid: googleAuth.uid,
          },
        }),
      },
      tripInvites: {
        [tokenHash]: {
          roomId: 'room-1',
          role: 'editor',
          active: true,
          version: 1,
        },
      },
      userQuotas: {
        [editorAuth.uid]: {
          redeemInvite: {
            windowStartedAt: 9_000,
            windowCount: 30,
            updatedAt: 9_000,
          },
        },
      },
    },
  });

  await assert.rejects(
    () => service.rotateTripInvite({ roomId: 'room-1' }, googleAuth),
    expectCollaborationError('resource-exhausted'),
  );
  assert.deepEqual(Object.keys(database.value('tripInvites')), [tokenHash]);

  await assert.rejects(
    () => service.redeemTripInvite({ token }, editorAuth),
    expectCollaborationError('resource-exhausted'),
  );
  assert.equal(
    database.value(`roomAccess/room-1/members/${editorAuth.uid}`),
    undefined,
  );
});

test('member cap and identity boundaries reject access without weakening canonical ACLs', async () => {
  const token = 'd'.repeat(43);
  const tokenHash = hashInviteToken(token);
  const cappedMembers = {
    [googleAuth.uid]: ownerMember(),
  };
  for (let index = 1; index < 50; index += 1) {
    const uid = `member-${index}`;
    cappedMembers[uid] = memberRecord({ uid });
  }
  const { database, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': activeOwnerAccess({
          members: cappedMembers,
          invite: {
            token,
            tokenHash,
            active: true,
            version: 1,
            createdAt: 1_000,
            createdByUid: googleAuth.uid,
          },
        }),
      },
      tripInvites: {
        [tokenHash]: {
          roomId: 'room-1',
          role: 'editor',
          active: true,
          version: 1,
        },
      },
    },
  });

  await assert.rejects(
    () => service.redeemTripInvite({ token }, secondEditorAuth),
    expectCollaborationError('resource-exhausted'),
  );
  assert.equal(Object.keys(database.value('roomAccess/room-1/members')).length, 50);

  await assert.rejects(
    () => service.removeTripMember({ roomId: 'room-1', uid: googleAuth.uid }, googleAuth),
    expectCollaborationError('failed-precondition'),
  );

  const passwordAuth = {
    uid: googleAuth.uid,
    token: { firebase: { sign_in_provider: 'password' } },
  };
  await assert.rejects(
    () => service.listTripMembers({ roomId: 'room-1' }, passwordAuth),
    expectCollaborationError('permission-denied'),
  );
  assert.equal(database.value(`roomAccess/room-1/members/${googleAuth.uid}/status`), 'active');
});

test('collaboration operations reject a room once owner deletion has locked it', async () => {
  const token = 'e'.repeat(43);
  const tokenHash = hashInviteToken(token);
  const lockedAccess = activeOwnerAccess({
    state: 'deleting',
    members: {
      [googleAuth.uid]: ownerMember(),
      [editorAuth.uid]: editorMember(),
    },
    invite: {
      token,
      tokenHash,
      active: true,
      version: 1,
      createdAt: 1_000,
      createdByUid: googleAuth.uid,
    },
  });
  const { database, service } = createFixture({
    databaseState: {
      roomAccess: {
        'room-1': lockedAccess,
      },
      tripInvites: {
        [tokenHash]: {
          roomId: 'room-1',
          role: 'editor',
          active: true,
          version: 1,
        },
      },
    },
  });

  await assert.rejects(
    () => service.listTripMembers({ roomId: 'room-1' }, googleAuth),
    expectCollaborationError('permission-denied'),
  );
  await assert.rejects(
    () => service.getOrCreateTripInvite({ roomId: 'room-1' }, googleAuth),
    expectCollaborationError('permission-denied'),
  );
  await assert.rejects(
    () => service.revokeTripInvite({ roomId: 'room-1' }, googleAuth),
    expectCollaborationError('permission-denied'),
  );
  await assert.rejects(
    () => service.redeemTripInvite({ token }, secondEditorAuth),
    expectCollaborationError('not-found'),
  );
  await assert.rejects(
    () => service.removeTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
    expectCollaborationError('permission-denied'),
  );
  await assert.rejects(
    () => service.restoreTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
    expectCollaborationError('permission-denied'),
  );
  assert.deepEqual(database.value('roomAccess/room-1'), lockedAccess);
  assert.equal(database.value(`tripInvites/${tokenHash}/active`), true);
});

test('ownership maintenance blocks callables and an in-flight removal before stale ACL writes', async () => {
  const token = 'f'.repeat(43);
  const tokenHash = hashInviteToken(token);
  const readyAccess = activeOwnerAccess({
    members: {
      [googleAuth.uid]: ownerMember({ aclVersion: 4 }),
      [editorAuth.uid]: editorMember({ aclVersion: 2 }),
    },
    inviteVersion: 1,
    invite: {
      token, tokenHash, active: true, version: 1,
      createdAt: 1_000, createdByUid: googleAuth.uid,
    },
  });
  const editorAcl = {
    uid: editorAuth.uid, role: 'editor', status: 'active', aclVersion: 2,
    updatedAt: new Date(1_000),
  };
  const maintenanceGuard = {
    state: 'maintenance', operation: 'trip-owner-transfer', invocationId: 'race',
  };
  const { database, firestore, service } = createFixture({
    databaseState: {
      roomAccess: { 'room-1': readyAccess },
      tripInvites: { [tokenHash]: { roomId: 'room-1', active: true, version: 1 } },
    },
    firestoreState: {
      'tripAccess/room-1': maintenanceGuard,
      [`tripAccess/room-1/members/${editorAuth.uid}`]: editorAcl,
    },
  });

  // This models removeTripMember passing its initial ready-state read just
  // before the transfer installs the Firestore guard.
  await assert.rejects(
    () => service.removeTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
    expectCollaborationError('aborted'),
  );
  assert.deepEqual(firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`), editorAcl);
  assert.equal(database.value('roomAccess/room-1/members/editor-uid/status'), 'active');

  database.setValue('roomAccess/room-1/state', 'maintenance');
  database.setValue('roomAccess/room-1/maintenanceLock', maintenanceGuard);
  for (const operation of [
    () => service.getOrCreateTripInvite({ roomId: 'room-1' }, googleAuth),
    () => service.rotateTripInvite({ roomId: 'room-1' }, googleAuth),
    () => service.revokeTripInvite({ roomId: 'room-1' }, googleAuth),
    () => service.removeTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
    () => service.restoreTripMember({ roomId: 'room-1', uid: editorAuth.uid }, googleAuth),
  ]) {
    await assert.rejects(operation, expectCollaborationError('permission-denied'));
  }
  await assert.rejects(
    () => service.redeemTripInvite({ token }, secondEditorAuth),
    expectCollaborationError('not-found'),
  );
  assert.equal(database.value('roomAccess/room-1/state'), 'maintenance');
  assert.equal(database.value(`tripInvites/${tokenHash}/active`), true);
});

test('member sync preserves the owner retry index during deletion and removes every ACL', async () => {
  const deletion = {
    ownerUid: googleAuth.uid,
    deletionId: 'deletion-1',
    state: 'deleting',
    titleSnapshot: 'Tokyo',
    updatedAt: 9_000,
    members: {
      [googleAuth.uid]: { role: 'owner', aclVersion: 4 },
      [editorAuth.uid]: { role: 'editor', aclVersion: 2 },
    },
  };
  const { database, firestore, service } = createFixture({
    databaseState: {
      tripDeletions: { 'room-1': deletion },
      userTrips: {
        [googleAuth.uid]: {
          'room-1': { role: 'owner', status: 'active', aclVersion: 4 },
        },
        [editorAuth.uid]: {
          'room-1': { role: 'editor', status: 'active', aclVersion: 2 },
        },
      },
    },
    firestoreState: {
      [`tripAccess/room-1/members/${googleAuth.uid}`]: {
        uid: googleAuth.uid,
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
    },
  });

  assert.equal(await service.syncMemberAccess('room-1', googleAuth.uid, ownerMember()), null);
  assert.equal(await service.syncMemberAccess('room-1', editorAuth.uid, editorMember()), null);
  assert.deepEqual(database.value(`userTrips/${googleAuth.uid}/room-1`), {
    role: 'owner',
    status: 'deleting',
    aclVersion: 5,
    updatedAt: 9_000,
    deletionId: 'deletion-1',
    titleSnapshot: 'Tokyo',
  });
  assert.deepEqual(database.value(`userTrips/${editorAuth.uid}/room-1`), {
    role: 'editor',
    status: 'removed',
    aclVersion: 3,
    updatedAt: 9_000,
  });
  assert.equal(firestore.value(`tripAccess/room-1/members/${googleAuth.uid}`), undefined);
  assert.equal(firestore.value(`tripAccess/room-1/members/${editorAuth.uid}`), undefined);

  database.setValue('tripDeletions/room-1/phase', 'namespace-closed');
  database.setValue(`userTrips/${editorAuth.uid}/room-1`, {
    role: 'editor',
    status: 'active',
    aclVersion: 2,
  });
  assert.equal(await service.syncMemberAccess('room-1', editorAuth.uid, editorMember()), null);
  assert.equal(database.value(`userTrips/${editorAuth.uid}/room-1`), undefined);

  database.setValue('tripDeletions/room-1/state', 'deleted');
  assert.equal(await service.syncMemberAccess('room-1', googleAuth.uid, ownerMember()), null);
  assert.equal(database.value(`userTrips/${googleAuth.uid}/room-1`), undefined);
});
