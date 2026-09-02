import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAnonymousLegacyUrlsDenied,
  assertLegacyStoragePathTransitions,
  assertCompatibleState,
  assertRollbackMirrorsFailClosed,
  buildLegacyDownloadUrlPlan,
  buildMigrationUpdates,
  cleanupLegacyStoragePathTransitionUrls,
  findUnreservedStorageRoomIds,
  inspectLegacyStorageRelocations,
  normalizeOwnerMappings,
  parseCli,
  parseTokenizedFirebaseDownloadUrl,
  readFirebaseStorageDownloadTokens,
  relocateLegacyStorageObjects,
  revokeStorageDownloadTokens,
  scanLegacyRootTicketObjects,
  scanStorageDownloadTokens,
  splitLegacyDownloadUrlUpdates,
  switchLegacyStoragePathTransitions,
  validateDatabaseTargetUrl,
  validateStorageBucket,
  verifyEntry,
} from './migrate-legacy-trip-access.js';

const PROJECT_ID = 'travel-app-923ef';
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;

const legacyDownloadUrl = (objectName, token = 'secret-token', bucket = STORAGE_BUCKET) => (
  `https://firebasestorage.googleapis.com/v0/b/${bucket}`
  + `/o/${encodeURIComponent(objectName)}?alt=media&token=${token}`
);

test('normalizeOwnerMappings rejects duplicate rooms and unsafe identifiers', () => {
  assert.throws(() => normalizeOwnerMappings({
    version: 1,
    owners: [
      { roomId: 'same', uid: 'owner-1', displayName: 'Owner 1' },
      { roomId: 'same', uid: 'owner-2', displayName: 'Owner 2' },
    ],
  }), /重複 roomId/);
  assert.throws(() => normalizeOwnerMappings({
    version: 1,
    owners: [{ roomId: 'bad/room', uid: 'owner', displayName: 'Owner' }],
  }), /roomId 格式不正確/);
});

test('buildMigrationUpdates preserves timestamps and never lowers the ACL version', () => {
  const mapping = {
    roomId: 'legacy-room',
    uid: 'owner-uid',
    displayName: 'Owner',
    photoURL: '',
  };
  const updates = buildMigrationUpdates({
    mapping,
    room: { meta: { securityMigratedAt: 10 } },
    access: {
      createdAt: 20,
      members: { 'owner-uid': { joinedAt: 30, aclVersion: 3 } },
    },
    userTrip: { aclVersion: 7 },
    acl: { aclVersion: 5 },
    now: 40,
  });

  assert.equal(updates['rooms/legacy-room/meta/securityMigratedAt'], 10);
  assert.equal(updates['roomAccess/legacy-room/createdAt'], 20);
  assert.equal(
    updates['roomAccess/legacy-room/creationId'],
    'legacy-migration-legacy-room',
  );
  assert.equal(updates['roomAccess/legacy-room/members/owner-uid/joinedAt'], 30);
  assert.equal(updates['roomAccess/legacy-room/members/owner-uid/status'], 'active');
  assert.equal(updates['roomAccess/legacy-room/members/owner-uid/aclVersion'], 7);
  assert.deepEqual(updates['userTrips/owner-uid/legacy-room'], {
    role: 'owner',
    status: 'active',
    aclVersion: 7,
    updatedAt: 40,
  });
  assert.equal(updates['roomReservations/legacy-room'].createdByUid, 'owner-uid');
  assert.equal(
    updates['roomReservations/legacy-room'].creationId,
    updates['roomAccess/legacy-room/creationId'],
  );

  const retryAfterRollback = buildMigrationUpdates({
    mapping,
    room: { meta: {} },
    access: null,
    userTrip: { role: 'owner', status: 'removed', aclVersion: 8 },
    acl: {
      uid: 'owner-uid', role: 'owner', status: 'removed', aclVersion: 8,
    },
    now: 50,
  });
  assert.equal(
    retryAfterRollback['roomAccess/legacy-room/members/owner-uid/aclVersion'],
    9,
  );
});

test('migration repairs the missing access creationId without replacing reservation identity', () => {
  const mapping = {
    roomId: 'legacy-room',
    uid: 'owner-uid',
    displayName: 'Owner',
    photoURL: '',
  };
  const access = {
    ownerUid: 'owner-uid',
    state: 'ready',
    createdAt: 20,
    members: {
      'owner-uid': {
        uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 1,
      },
    },
  };
  const reservation = {
    roomId: 'legacy-room',
    creationId: 'legacy-migration-legacy-room',
    createdByUid: 'owner-uid',
    createdAt: 20,
    migrated: true,
  };
  const state = {
    mapping,
    room: { meta: { ownerUid: 'owner-uid' } },
    access,
    userTrip: { role: 'owner', status: 'active', aclVersion: 1 },
    acl: {
      uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 1,
    },
    reservation,
  };

  assert.doesNotThrow(() => assertCompatibleState(state));
  const updates = buildMigrationUpdates({ ...state, now: 99 });
  assert.equal(
    updates['roomAccess/legacy-room/creationId'],
    reservation.creationId,
  );
  assert.equal(updates['roomReservations/legacy-room'].createdAt, 20);

  assert.throws(() => assertCompatibleState({
    ...state,
    access: { ...access, creationId: 'different-creation-id' },
  }), /creationId 鏡像不一致/);
  assert.throws(() => assertCompatibleState({
    ...state,
    reservation: { ...reservation, createdAt: 0 },
  }), /roomReservations/);
  assert.throws(() => assertCompatibleState({
    ...state,
    reservation: { ...reservation, roomId: 'another-room' },
  }), /roomReservations/);
});

test('post-migration verification rejects missing or mismatched creationId mirrors', async () => {
  const mapping = { roomId: 'legacy-room', uid: 'owner-uid' };
  const values = {
    'rooms/legacy-room': { meta: { ownerUid: 'owner-uid' } },
    'roomAccess/legacy-room': {
      ownerUid: 'owner-uid',
      state: 'ready',
      creationId: 'legacy-migration-legacy-room',
      members: {
        'owner-uid': {
          uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 1,
        },
      },
    },
    'userTrips/owner-uid/legacy-room': {
      role: 'owner', status: 'active', aclVersion: 1,
    },
    'roomReservations/legacy-room': {
      roomId: 'legacy-room',
      creationId: 'legacy-migration-legacy-room',
      createdByUid: 'owner-uid',
      createdAt: 20,
      migrated: true,
    },
  };
  const database = {
    ref(path) {
      return { get: async () => ({ val: () => values[path] ?? null }) };
    },
  };
  const firestore = {
    doc() {
      return {
        get: async () => ({
          exists: true,
          data: () => ({
            uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 1,
          }),
        }),
      };
    },
  };

  await assert.doesNotReject(() => verifyEntry({ database, firestore, mapping }));
  delete values['roomAccess/legacy-room'].creationId;
  await assert.rejects(
    () => verifyEntry({ database, firestore, mapping }),
    /寫入後驗證失敗/,
  );
  values['roomAccess/legacy-room'].creationId = 'different-creation-id';
  await assert.rejects(
    () => verifyEntry({ database, firestore, mapping }),
    /寫入後驗證失敗/,
  );
});

test('migration refuses rogue legacy members, indexes, ACLs, and invalid versions', () => {
  const base = {
    mapping: { roomId: 'legacy-room', uid: 'owner-uid' },
    room: { meta: {} },
    access: {
      ownerUid: 'owner-uid',
      members: {
        'owner-uid': {
          uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 1,
        },
      },
    },
    userTrip: null,
    acl: null,
  };

  assert.throws(() => assertCompatibleState({
    ...base,
    access: {
      ...base.access,
      members: {
        ...base.access.members,
        attacker: { uid: 'attacker', role: 'editor', status: 'active', aclVersion: 1 },
      },
    },
  }), /未列入 mapping/);
  assert.throws(() => assertCompatibleState({
    ...base,
    unexpectedUserTripUids: ['attacker'],
  }), /其他 UID/);
  assert.throws(() => assertCompatibleState({
    ...base,
    unexpectedAclUids: ['attacker'],
  }), /Firestore ACL/);
  assert.throws(() => assertCompatibleState({
    ...base,
    access: {
      ...base.access,
      members: {
        'owner-uid': {
          uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: -1,
        },
      },
    },
  }), /正整數/);

  assert.doesNotThrow(() => assertCompatibleState({
    ...base,
    access: null,
    userTrip: { role: 'owner', status: 'removed', aclVersion: 2 },
    acl: {
      uid: 'owner-uid', role: 'owner', status: 'removed', aclVersion: 2,
    },
  }));
});

test('database target validation accepts only the exact default database root', () => {
  assert.equal(
    validateDatabaseTargetUrl(
      'https://travel-app-923ef-default-rtdb.firebaseio.com/',
      'travel-app-923ef',
    ).hostname,
    'travel-app-923ef-default-rtdb.firebaseio.com',
  );
  assert.throws(() => validateDatabaseTargetUrl(
    'https://travel-app-923ef-staging-default-rtdb.firebaseio.com/',
    'travel-app-923ef',
  ), /hostname/);
  assert.throws(() => validateDatabaseTargetUrl(
    'https://travel-app-923ef-default-rtdb.firebaseio.com/path?danger=1',
    'travel-app-923ef',
  ), /資料庫根 URL/);
});

test('storage target and CLI validation require the exact project bucket and confirmations', () => {
  assert.equal(validateStorageBucket(STORAGE_BUCKET, PROJECT_ID), STORAGE_BUCKET);
  assert.equal(
    validateStorageBucket(`${PROJECT_ID}.appspot.com`, PROJECT_ID),
    `${PROJECT_ID}.appspot.com`,
  );
  assert.throws(
    () => validateStorageBucket('other-project.firebasestorage.app', PROJECT_ID),
    /default bucket/,
  );

  const baseArgs = [
    '--mapping', 'owner-map.json',
    '--project', PROJECT_ID,
    '--database-url', `https://${PROJECT_ID}-default-rtdb.firebaseio.com/`,
  ];
  assert.throws(() => parseCli(baseArgs), /--storage-bucket/);
  assert.throws(() => parseCli([
    ...baseArgs,
    '--storage-bucket', STORAGE_BUCKET,
    '--apply',
    '--confirm-project', PROJECT_ID,
  ]), /--confirm-storage-bucket/);
  const options = parseCli([
    ...baseArgs,
    '--storage-bucket', STORAGE_BUCKET,
    '--apply',
    '--confirm-project', PROJECT_ID,
    '--confirm-storage-bucket', STORAGE_BUCKET,
  ]);
  assert.equal(options.storageBucket, STORAGE_BUCKET);
  assert.equal(options.apply, true);
});

test('Firebase URL parser honors decoded token keys and WHATWG ASCII normalization', () => {
  const encodedTokenUrl = legacyDownloadUrl(
    'rooms/room-a/tickets/ticket-1/encoded.pdf',
    'encoded-secret',
  ).replace('&token=', '&%74oken=');
  const controlNormalizedUrl = legacyDownloadUrl(
    'rooms/room-a/tickets/ticket-2/control.pdf',
    'control-secret',
  )
    .replace('firebasestorage.googleapis.com', 'firebasestorage.google\r\napis.com')
    .replace('&token=', '&to\tken=');

  assert.deepEqual(parseTokenizedFirebaseDownloadUrl(encodedTokenUrl), {
    bucket: STORAGE_BUCKET,
    objectName: 'rooms/room-a/tickets/ticket-1/encoded.pdf',
  });
  assert.deepEqual(parseTokenizedFirebaseDownloadUrl(controlNormalizedUrl), {
    bucket: STORAGE_BUCKET,
    objectName: 'rooms/room-a/tickets/ticket-2/control.pdf',
  });
  assert.equal(parseTokenizedFirebaseDownloadUrl('ordinary ticket note'), null);
  assert.equal(
    parseTokenizedFirebaseDownloadUrl('https://example.com/file?token=not-firebase'),
    null,
  );
  assert.equal(
    parseTokenizedFirebaseDownloadUrl(
      `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}`
      + '/o/file.pdf?alt=media&TOKEN=case-sensitive',
    ),
    null,
  );

  const plan = buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [
          { id: 'ticket-1', url: encodedTokenUrl },
          { id: 'ticket-2', url: controlNormalizedUrl },
        ],
      },
    },
    targetBucket: STORAGE_BUCKET,
  });
  assert.equal(plan.tokenizedUrlCount, 2);
  assert.equal(plan.legacyUrls.length, 2);
  assert.equal(Object.keys(plan.updates).length, 4);
});

test('legacy URL plan converts only target-bucket room URLs to storagePath', () => {
  const url = legacyDownloadUrl('rooms/room-a/tickets/ticket-1/ticket.pdf');
  assert.deepEqual(parseTokenizedFirebaseDownloadUrl(url), {
    bucket: STORAGE_BUCKET,
    objectName: 'rooms/room-a/tickets/ticket-1/ticket.pdf',
  });

  const plan = buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{ id: 'ticket-1', name: 'Ticket', url }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  });
  assert.equal(plan.tokenizedUrlCount, 1);
  assert.equal(plan.legacyUrls.length, 1);
  assert.deepEqual(plan.updates, {
    'rooms/room-a/tickets/0/storagePath': 'rooms/room-a/tickets/ticket-1/ticket.pdf',
    'rooms/room-a/tickets/0/url': '',
  });

  const foreignUrl = legacyDownloadUrl(
    'rooms/room-a/tickets/ticket-1/ticket.pdf',
    'must-not-appear-in-error',
    'other-project.firebasestorage.app',
  );
  assert.throws(
    () => buildLegacyDownloadUrlPlan({
      rooms: { 'room-a': { tickets: [{ id: 'ticket-1', url: foreignUrl }] } },
      targetBucket: STORAGE_BUCKET,
    }),
    (error) => /非 target bucket/.test(error.message)
      && !error.message.includes('must-not-appear-in-error'),
  );
  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{
          id: 'ticket-1',
          url,
          storagePath: 'rooms/room-a/tickets/ticket-1/different.pdf',
        }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  }), /storagePath 衝突/);
});

test('legacy URL plan relocates root and malformed same-room tickets to canonical paths', () => {
  const url = legacyDownloadUrl('tickets/1782114182078_ticket.png');
  const plan = buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{ id: 'ticket-1', name: 'Ticket', url }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  });

  assert.deepEqual(plan.updates, {
    'rooms/room-a/tickets/0/storagePath': 'rooms/room-a/tickets/ticket-1/1782114182078_ticket.png',
    'rooms/room-a/tickets/0/url': '',
  });
  assert.deepEqual(plan.storageRelocations, [{
    sourceObjectName: 'tickets/1782114182078_ticket.png',
    destinationObjectName: 'rooms/room-a/tickets/ticket-1/1782114182078_ticket.png',
    roomId: 'room-a',
    ticketId: 'ticket-1',
  }]);

  const malformedSameRoomPath = 'rooms/room-a/tickets/legacy.pdf';
  const malformedSameRoomUrl = legacyDownloadUrl(malformedSameRoomPath);
  const malformedSameRoomPlan = buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{
          id: 'ticket-2',
          name: 'Legacy ticket',
          url: malformedSameRoomUrl,
          storagePath: malformedSameRoomPath,
        }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  });
  assert.deepEqual(malformedSameRoomPlan.updates, {
    'rooms/room-a/tickets/0/storagePath': 'rooms/room-a/tickets/ticket-2/legacy.pdf',
    'rooms/room-a/tickets/0/url': '',
  });
  assert.deepEqual(malformedSameRoomPlan.storageRelocations, [{
    sourceObjectName: 'rooms/room-a/tickets/legacy.pdf',
    destinationObjectName: 'rooms/room-a/tickets/ticket-2/legacy.pdf',
    roomId: 'room-a',
    ticketId: 'ticket-2',
  }]);

  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{ id: 'ticket-1', url: legacyDownloadUrl('places/photo.png') }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  }), /object path 與 room 不一致/);
  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': { tickets: [{ id: 'ticket-1', url }] },
      'room-b': { tickets: [{ id: 'ticket-2', url }] },
    },
    targetBucket: STORAGE_BUCKET,
  }), /重複引用/);

  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [
          { id: 'ticket-1', url },
          { id: 'ticket-2', url },
        ],
      },
    },
    targetBucket: STORAGE_BUCKET,
  }), /重複引用/);

  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': { tickets: [{ url }] },
    },
    targetBucket: STORAGE_BUCKET,
  }), /ticketId 格式不正確/);
});

test('legacy URL plan validates duplicate ticket IDs before URL branching', () => {
  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [
          { id: 'duplicate', type: 'link', url: 'https://example.com/one' },
          { id: 'duplicate', type: 'note', title: 'No Storage URL' },
        ],
      },
    },
    targetBucket: STORAGE_BUCKET,
  }), /重複 ticketId/);

  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: { 'room-a': { tickets: [{ title: 'Missing ID' }] } },
    targetBucket: STORAGE_BUCKET,
  }), /ticketId 格式不正確/);
});

test('legacy URL RTDB updates split storage switch from URL cleanup', () => {
  assert.deepEqual(splitLegacyDownloadUrlUpdates({
    'rooms/room-a/tickets/0/storagePath': 'rooms/room-a/tickets/ticket-1/pass.pdf',
    'rooms/room-a/tickets/0/url': '',
  }), {
    storagePathUpdates: {
      'rooms/room-a/tickets/0/storagePath': 'rooms/room-a/tickets/ticket-1/pass.pdf',
    },
    urlCleanupUpdates: { 'rooms/room-a/tickets/0/url': '' },
  });
  assert.throws(
    () => splitLegacyDownloadUrlUpdates({ 'rooms/room-a/title': 'unsafe' }),
    /非預期/,
  );
});

const createTransitionDatabase = (initialRooms) => {
  let rooms = structuredClone(initialRooms);
  const snapshot = () => ({ val: () => structuredClone(rooms) });
  return {
    database: {
      ref(path) {
        assert.equal(path, 'rooms');
        return {
          async get() { return snapshot(); },
          async transaction(update) {
            const next = update(structuredClone(rooms));
            if (next === undefined) return { committed: false, snapshot: snapshot() };
            rooms = structuredClone(next);
            return { committed: true, snapshot: snapshot() };
          },
        };
      },
    },
    readRooms: () => structuredClone(rooms),
    updateTicket(patch) {
      rooms['room-a'].tickets[0] = { ...rooms['room-a'].tickets[0], ...patch };
    },
  };
};

test('legacy storagePath transaction accepts only exact journal state and verifies cleanup', async () => {
  const url = legacyDownloadUrl(LEGACY_SOURCE_PATH);
  const plan = buildLegacyDownloadUrlPlan({
    rooms: { 'room-a': { tickets: [{ id: 'ticket-1', url }] } },
    targetBucket: STORAGE_BUCKET,
  });
  const state = createTransitionDatabase({
    'room-a': { tickets: [{ id: 'ticket-1', url }] },
  });

  await switchLegacyStoragePathTransitions({
    database: state.database,
    transitions: plan.storagePathTransitions,
  });
  assert.equal(
    state.readRooms()['room-a'].tickets[0].storagePath,
    LEGACY_DESTINATION_PATH,
  );
  await assertLegacyStoragePathTransitions({
    database: state.database,
    transitions: plan.storagePathTransitions,
    urlState: 'legacy',
  });
  await assert.doesNotReject(() => switchLegacyStoragePathTransitions({
    database: state.database,
    transitions: plan.storagePathTransitions,
  }));

  await cleanupLegacyStoragePathTransitionUrls({
    database: state.database,
    transitions: plan.storagePathTransitions,
  });
  state.updateTicket({ storagePath: 'rooms/room-a/tickets/ticket-1/broken.pdf' });
  await assert.rejects(() => assertLegacyStoragePathTransitions({
    database: state.database,
    transitions: plan.storagePathTransitions,
    urlState: 'clean',
  }), /storagePath 已漂移/);
});

test('legacy storagePath transaction aborts stale URL, identity, and pointer state', async () => {
  const url = legacyDownloadUrl(LEGACY_SOURCE_PATH);
  const plan = buildLegacyDownloadUrlPlan({
    rooms: { 'room-a': { tickets: [{ id: 'ticket-1', url }] } },
    targetBucket: STORAGE_BUCKET,
  });
  for (const drift of [
    { url: 'https://example.com/replaced' },
    { id: 'ticket-replaced' },
    { storagePath: 'rooms/room-a/tickets/ticket-1/stale.pdf' },
  ]) {
    const state = createTransitionDatabase({
      'room-a': { tickets: [{ id: 'ticket-1', url, ...drift }] },
    });
    await assert.rejects(() => switchLegacyStoragePathTransitions({
      database: state.database,
      transitions: plan.storagePathTransitions,
    }), /漂移/);
    assert.notEqual(
      state.readRooms()['room-a'].tickets[0].storagePath,
      LEGACY_DESTINATION_PATH,
    );
  }

  const cleanupState = createTransitionDatabase({
    'room-a': {
      tickets: [{
        id: 'ticket-1',
        url,
        storagePath: 'rooms/room-a/tickets/ticket-1/stale.pdf',
      }],
    },
  });
  await assert.rejects(() => cleanupLegacyStoragePathTransitionUrls({
    database: cleanupState.database,
    transitions: plan.storagePathTransitions,
  }), /storagePath 已漂移/);
  assert.equal(cleanupState.readRooms()['room-a'].tickets[0].url, url);
});

test('legacy URL plan rejects ticket paths that do not exactly match the ticket record', () => {
  const buildPlan = (objectName) => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{ id: 'ticket-1', url: legacyDownloadUrl(objectName) }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  });

  assert.throws(
    () => buildPlan('rooms/room-a/tickets/ticket-2/ticket.pdf'),
    /object path 與 room 不一致/,
  );
  assert.throws(
    () => buildPlan('rooms/room-a/tickets/ticket-1/nested/ticket.pdf'),
    /object path 與 room 不一致/,
  );
  assert.throws(
    () => buildPlan('rooms/room-a/places/ticket.pdf'),
    /object path 與 room 不一致/,
  );
  assert.throws(
    () => buildPlan(`tickets/${'x'.repeat(241)}`),
    /ticket fileName 格式不正確/,
  );
  assert.throws(
    () => buildPlan(`rooms/room-a/tickets/ticket-1/${'x'.repeat(241)}`),
    /ticket fileName 格式不正確/,
  );
});

test('Storage token inventory and revocation update metadata without logging token material', async () => {
  const metadataWrites = [];
  const tokenizedFile = {
    name: 'rooms/room-a/tickets/ticket-1/ticket.pdf',
    async getMetadata() {
      return [{
        metadata: {
          firebaseStorageDownloadTokens: 'token-one, token-two',
          retained: 'yes',
        },
        metageneration: '7',
      }];
    },
    async setMetadata(metadata, options) {
      metadataWrites.push({ metadata, options });
    },
  };
  const cleanFile = {
    name: 'rooms/room-a/places/place-1/photo.jpg',
    async getMetadata() { return [{ metadata: {}, metageneration: '2' }]; },
  };
  const bucket = {
    async getFiles(options) {
      assert.deepEqual(options, { prefix: 'rooms/' });
      return [[tokenizedFile, cleanFile]];
    },
  };

  assert.deepEqual(readFirebaseStorageDownloadTokens({
    metadata: { firebaseStorageDownloadTokens: 'a,b' },
  }), ['a', 'b']);
  const inventory = await scanStorageDownloadTokens(bucket);
  assert.equal(inventory.objectCount, 2);
  assert.deepEqual(inventory.roomIds, ['room-a']);
  assert.equal(inventory.malformedObjectCount, 0);
  assert.equal(inventory.tokenizedObjects.length, 1);
  assert.equal(inventory.tokenCount, 2);

  const urls = await revokeStorageDownloadTokens({
    bucketName: STORAGE_BUCKET,
    tokenizedObjects: inventory.tokenizedObjects,
  });
  assert.equal(urls.length, 2);
  assert.equal(metadataWrites.length, 1);
  assert.deepEqual(metadataWrites[0], {
    metadata: {
      metadata: {
        firebaseStorageDownloadTokens: null,
        retained: 'yes',
      },
    },
    options: { ifMetagenerationMatch: '7' },
  });
});

test('Storage namespace inventory rejects only rooms without a room or permanent reservation', async () => {
  assert.deepEqual(findUnreservedStorageRoomIds({
    storageRoomIds: ['active-room', 'deleted-room', 'orphan-room', 'orphan-room'],
    productionRoomIds: ['active-room'],
    reservationRoomIds: ['deleted-room'],
  }), ['orphan-room']);

  const storageFile = (name) => ({
    name,
    async getMetadata() { return [{ metadata: {}, metageneration: '1' }]; },
  });
  const files = [
    storageFile('rooms/active-room/tickets/ticket-1/pass.pdf'),
    storageFile('rooms/active-room/places/place-1/photo.png'),
    storageFile('rooms/active-room/tickets/legacy.pdf'),
    storageFile('rooms/active-room/tickets/ticket-1/nested/pass.pdf'),
    storageFile('rooms/no-object-suffix'),
  ];
  const inventory = await scanStorageDownloadTokens({
    async getFiles() { return [files]; },
  });
  assert.equal(inventory.objectCount, 5);
  assert.equal(inventory.malformedObjectCount, 3);
  assert.deepEqual(inventory.malformedObjectNames, [
    'rooms/active-room/tickets/legacy.pdf',
    'rooms/active-room/tickets/ticket-1/nested/pass.pdf',
    'rooms/no-object-suffix',
  ]);
  assert.deepEqual(inventory.roomIds, ['active-room']);
});

const LEGACY_SOURCE_PATH = 'tickets/legacy.png';
const LEGACY_DESTINATION_PATH = 'rooms/room-a/tickets/ticket-1/legacy.png';
const LEGACY_RELOCATIONS = [{
  sourceObjectName: LEGACY_SOURCE_PATH,
  destinationObjectName: LEGACY_DESTINATION_PATH,
  roomId: 'room-a',
  ticketId: 'ticket-1',
}];
const noOpReferenceVerifier = async () => {};

const legacySourceMetadata = () => ({
  size: '12',
  crc32c: 'crc-value',
  md5Hash: 'md5-value',
  generation: '7',
  metageneration: '2',
  contentType: 'image/png',
  contentDisposition: 'inline; filename="legacy.png"',
  cacheControl: 'public, max-age=3600',
  temporaryHold: false,
  metadata: {
    firebaseStorageDownloadTokens: 'secret-token',
    retained: 'yes',
  },
});

const createRelocationBucket = ({ hooks = {} } = {}) => {
  const objects = new Map([[LEGACY_SOURCE_PATH, legacySourceMetadata()]]);
  const copyCalls = [];
  const deleteCalls = [];
  const events = [];
  const notFound = () => Object.assign(new Error('not found'), { code: 404 });
  const clone = (value) => structuredClone(value);
  const bucket = {
    file(name, fileOptions = {}) {
      return {
        name,
        async getMetadata() {
          const metadata = objects.get(name);
          if (!metadata) throw notFound();
          return [clone(metadata)];
        },
        async copy(destination, options) {
          const metadata = objects.get(name);
          if (!metadata) throw notFound();
          assert.equal(fileOptions.generation, metadata.generation);
          assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
          assert.equal(objects.has(destination.name), false);
          copyCalls.push({ source: name, destination: destination.name, options });
          events.push(`copy:${name}`);
          objects.set(destination.name, {
            ...clone(metadata),
            generation: '8',
            metageneration: '1',
            temporaryHold: options.temporaryHold === true,
            cacheControl: options.cacheControl ?? metadata.cacheControl,
            contentType: options.contentType ?? metadata.contentType,
            contentDisposition: options.contentDisposition ?? metadata.contentDisposition,
            contentEncoding: options.contentEncoding ?? metadata.contentEncoding,
            contentLanguage: options.contentLanguage ?? metadata.contentLanguage,
            metadata: clone(options.metadata),
          });
          await hooks.afterCopy?.({ name, destination: destination.name, options, objects });
          return [destination, {}];
        },
        async setMetadata(update, options) {
          await hooks.beforeSetMetadata?.({ name, update, options, objects, events });
          const metadata = objects.get(name);
          if (!metadata) throw notFound();
          if (fileOptions.generation) {
            assert.equal(fileOptions.generation, metadata.generation);
          }
          assert.equal(options.ifMetagenerationMatch, metadata.metageneration);
          const next = {
            ...clone(metadata),
            ...clone(update),
            metageneration: String(Number(metadata.metageneration) + 1),
            metadata: update.metadata
              ? clone(update.metadata)
              : clone(metadata.metadata || {}),
          };
          objects.set(name, next);
          if (typeof update.temporaryHold === 'boolean') {
            events.push(`hold:${update.temporaryHold ? 'on' : 'off'}:${name}`);
          }
          await hooks.afterSetMetadata?.({ name, update, options, objects, events });
          return [clone(next)];
        },
        async delete() {
          await hooks.beforeDelete?.({ name, fileOptions, objects, events });
          const metadata = objects.get(name);
          if (!metadata) throw notFound();
          if (fileOptions.generation) {
            assert.equal(fileOptions.generation, metadata.generation);
          }
          if (metadata.temporaryHold === true) {
            throw new Error('cannot delete object with temporaryHold');
          }
          deleteCalls.push(name);
          events.push(`delete:${name}`);
          objects.delete(name);
        },
      };
    },
    async getFiles({ prefix }) {
      return [[...objects.keys()]
        .filter((name) => name.startsWith(prefix))
        .map((name) => this.file(name))];
    },
  };
  return { bucket, objects, copyCalls, deleteCalls, events };
};

test('non-empty legacy relocation requires explicit switch and verification callbacks', async () => {
  const setup = createRelocationBucket();
  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
  }), /callback 格式不正確/);
  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: noOpReferenceVerifier,
  }), /reference verifier 格式不正確/);
  assert.equal(setup.copyCalls.length, 0);
  assert.equal(setup.deleteCalls.length, 0);
});

test('legacy relocation holds every destination across RTDB switch and source deletion', async () => {
  const setup = createRelocationBucket();
  const secondSourcePath = 'tickets/second.pdf';
  const secondDestinationPath = 'rooms/room-a/tickets/ticket-2/second.pdf';
  setup.objects.set(secondSourcePath, {
    ...legacySourceMetadata(),
    generation: '9',
    contentType: 'application/pdf',
  });
  const relocations = [
    ...LEGACY_RELOCATIONS,
    {
      sourceObjectName: secondSourcePath,
      destinationObjectName: secondDestinationPath,
      roomId: 'room-a',
      ticketId: 'ticket-2',
    },
  ];
  const dryRunStates = await inspectLegacyStorageRelocations({
    bucket: setup.bucket,
    relocations,
  });
  assert.equal(dryRunStates[0].source.file.name, LEGACY_SOURCE_PATH);
  assert.equal(dryRunStates[0].destination, null);

  const rootInventory = await scanLegacyRootTicketObjects(setup.bucket);
  assert.equal(rootInventory.objectCount, 2);
  assert.equal(rootInventory.tokenCount, 2);
  assert.deepEqual(rootInventory.objectNames, [LEGACY_SOURCE_PATH, secondSourcePath]);

  await relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations,
    whileDestinationsHeld: async () => {
      const destination = setup.objects.get(LEGACY_DESTINATION_PATH);
      assert.equal(destination.temporaryHold, true);
      assert.equal(setup.objects.get(secondDestinationPath).temporaryHold, true);
      await assert.rejects(
        () => setup.bucket.file(LEGACY_DESTINATION_PATH).delete(),
        /temporaryHold/,
      );
      setup.events.push('rtdb-switch');
    },
    verifyDestinationReferences: noOpReferenceVerifier,
  });

  assert.equal(setup.copyCalls.length, 2);
  assert.deepEqual(setup.deleteCalls, [LEGACY_SOURCE_PATH, secondSourcePath]);
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), false);
  assert.equal(setup.objects.has(secondSourcePath), false);
  const destination = setup.objects.get(LEGACY_DESTINATION_PATH);
  assert.equal(destination.temporaryHold, false);
  assert.equal(destination.metadata.firebaseStorageDownloadTokens, null);
  assert.equal(destination.metadata.retained, 'yes');
  assert.equal(destination.metadata.travelAppLegacySourcePath, LEGACY_SOURCE_PATH);
  assert.equal(destination.metadata.travelAppLegacySourceGeneration, '7');
  assert.equal(destination.metadata.travelAppLegacySourceSize, '12');
  assert.equal(destination.metadata.travelAppLegacySourceCrc32c, 'crc-value');
  assert.equal(destination.metadata.travelAppLegacySourceMd5Hash, 'md5-value');
  assert.equal(destination.metadata.travelAppLegacyRelocationState, 'released');
  assert.equal(destination.metadata.roomId, 'room-a');
  assert.equal(destination.metadata.ticketId, 'ticket-1');
  assert.equal(destination.cacheControl, 'private, no-store, max-age=0');
  assert.equal(destination.contentType, 'image/png');
  assert.equal(destination.contentDisposition, 'inline; filename="legacy.png"');
  assert.equal(Object.hasOwn(setup.copyCalls[0].options, 'metadata'), true);
  assert.equal(Object.hasOwn(setup.copyCalls[0].options.metadata, 'metadata'), false);

  const holdIndex = setup.events.indexOf(`hold:on:${LEGACY_DESTINATION_PATH}`);
  const switchIndex = setup.events.indexOf('rtdb-switch');
  const deleteIndex = setup.events.indexOf(`delete:${LEGACY_SOURCE_PATH}`);
  const releaseIndex = setup.events.indexOf(`hold:off:${LEGACY_DESTINATION_PATH}`);
  assert.ok(holdIndex >= 0 && holdIndex < switchIndex);
  assert.ok(switchIndex < deleteIndex && deleteIndex < releaseIndex);

  await relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations,
    whileDestinationsHeld: noOpReferenceVerifier,
    verifyDestinationReferences: noOpReferenceVerifier,
  });
  assert.equal(setup.copyCalls.length, 2);
  assert.equal(setup.deleteCalls.length, 2);
});

test('legacy relocation preserves source and owned holds when RTDB callback fails', async () => {
  const setup = createRelocationBucket();
  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => {
      throw new Error('simulated RTDB failure');
    },
    verifyDestinationReferences: noOpReferenceVerifier,
  }), /simulated RTDB failure/);

  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), true);
  assert.equal(setup.deleteCalls.length, 0);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, true);
  assert.equal(
    setup.objects.get(LEGACY_DESTINATION_PATH).metadata.travelAppLegacyRelocationState,
    'held',
  );

  await relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => {},
    verifyDestinationReferences: noOpReferenceVerifier,
  });
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), false);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, false);
});

test('concurrent RTDB drift before source delete aborts with source and hold preserved', async () => {
  const setup = createRelocationBucket();
  const url = legacyDownloadUrl(LEGACY_SOURCE_PATH);
  const plan = buildLegacyDownloadUrlPlan({
    rooms: { 'room-a': { tickets: [{ id: 'ticket-1', url }] } },
    targetBucket: STORAGE_BUCKET,
  });
  const state = createTransitionDatabase({
    'room-a': { tickets: [{ id: 'ticket-1', url }] },
  });
  let verificationCount = 0;

  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => switchLegacyStoragePathTransitions({
      database: state.database,
      transitions: plan.storagePathTransitions,
    }),
    verifyDestinationReferences: async () => {
      verificationCount += 1;
      if (verificationCount === 2) {
        state.updateTicket({ storagePath: LEGACY_SOURCE_PATH });
      }
      await assertLegacyStoragePathTransitions({
        database: state.database,
        transitions: plan.storagePathTransitions,
        urlState: 'legacy',
      });
    },
  }), /storagePath 已漂移/);

  assert.equal(setup.deleteCalls.length, 0);
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), true);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, true);
});

test('RTDB drift after source delete never reports success and retains destination hold', async () => {
  const setup = createRelocationBucket();
  const url = legacyDownloadUrl(LEGACY_SOURCE_PATH);
  const plan = buildLegacyDownloadUrlPlan({
    rooms: { 'room-a': { tickets: [{ id: 'ticket-1', url }] } },
    targetBucket: STORAGE_BUCKET,
  });
  const state = createTransitionDatabase({
    'room-a': { tickets: [{ id: 'ticket-1', url }] },
  });
  let verificationCount = 0;

  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => switchLegacyStoragePathTransitions({
      database: state.database,
      transitions: plan.storagePathTransitions,
    }),
    verifyDestinationReferences: async () => {
      verificationCount += 1;
      if (verificationCount === 3) {
        state.updateTicket({ storagePath: LEGACY_SOURCE_PATH });
      }
      await assertLegacyStoragePathTransitions({
        database: state.database,
        transitions: plan.storagePathTransitions,
        urlState: 'legacy',
      });
    },
  }), /storagePath 已漂移/);

  assert.deepEqual(setup.deleteCalls, [LEGACY_SOURCE_PATH]);
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), false);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, true);
});

test('legacy relocation fails closed if a cached client deletes destination before hold', async () => {
  let deleted = false;
  const setup = createRelocationBucket({
    hooks: {
      beforeSetMetadata: async ({ name, update, objects }) => {
        if (!deleted && name === LEGACY_DESTINATION_PATH && update.temporaryHold === true) {
          deleted = true;
          objects.delete(name);
        }
      },
    },
  });
  let callbackCalled = false;
  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => { callbackCalled = true; },
    verifyDestinationReferences: noOpReferenceVerifier,
  }), /not found/);
  assert.equal(callbackCalled, false);
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), true);
  assert.equal(setup.deleteCalls.length, 0);
});

test('legacy relocation rejects a foreign pre-hold without clearing it', async () => {
  const setup = createRelocationBucket();
  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => { throw new Error('stop after owned hold'); },
    verifyDestinationReferences: noOpReferenceVerifier,
  }), /stop after owned hold/);
  const destination = setup.objects.get(LEGACY_DESTINATION_PATH);
  destination.metadata.travelAppLegacyRelocationState = 'prepared';

  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: noOpReferenceVerifier,
    verifyDestinationReferences: noOpReferenceVerifier,
  }), /foreign temporaryHold/);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, true);
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), true);
});

test('legacy relocation release failure is retry-safe after source deletion', async () => {
  let failReleaseOnce = true;
  const setup = createRelocationBucket({
    hooks: {
      afterSetMetadata: async ({ name, update }) => {
        if (
          failReleaseOnce
          && name === LEGACY_DESTINATION_PATH
          && update.temporaryHold === false
        ) {
          failReleaseOnce = false;
          throw new Error('simulated ambiguous hold release failure');
        }
      },
    },
  });
  let callbackCount = 0;
  await assert.rejects(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => { callbackCount += 1; },
    verifyDestinationReferences: noOpReferenceVerifier,
  }), /ambiguous hold release failure/);
  assert.equal(setup.objects.has(LEGACY_SOURCE_PATH), false);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, true);
  assert.equal(
    setup.objects.get(LEGACY_DESTINATION_PATH).metadata.travelAppLegacyRelocationState,
    'held',
  );

  await relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: async () => { callbackCount += 1; },
    verifyDestinationReferences: noOpReferenceVerifier,
  });
  assert.equal(callbackCount, 2);
  assert.equal(setup.deleteCalls.length, 1);
  assert.equal(setup.objects.get(LEGACY_DESTINATION_PATH).temporaryHold, false);
});

test('missing-source retry requires fingerprint proof instead of trusting marker alone', async () => {
  const setup = createRelocationBucket();
  await relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: noOpReferenceVerifier,
    verifyDestinationReferences: noOpReferenceVerifier,
  });
  await assert.doesNotReject(() => relocateLegacyStorageObjects({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
    whileDestinationsHeld: noOpReferenceVerifier,
    verifyDestinationReferences: noOpReferenceVerifier,
  }));

  delete setup.objects.get(LEGACY_DESTINATION_PATH).metadata.travelAppLegacySourceCrc32c;
  delete setup.objects.get(LEGACY_DESTINATION_PATH).metadata.travelAppLegacySourceMd5Hash;
  await assert.rejects(() => inspectLegacyStorageRelocations({
    bucket: setup.bucket,
    relocations: LEGACY_RELOCATIONS,
  }), /fingerprint 證明/);
});

test('legacy root Storage relocation rejects an untrusted existing destination', async () => {
  const metadata = {
    size: '12',
    crc32c: 'same',
    generation: '1',
    metadata: {},
  };
  const bucket = {
    file(name) {
      return {
        name,
        async getMetadata() { return [metadata]; },
      };
    },
  };
  await assert.rejects(() => inspectLegacyStorageRelocations({
    bucket,
    relocations: [{
      sourceObjectName: 'tickets/legacy.png',
      destinationObjectName: 'rooms/room-a/tickets/ticket-1/legacy.png',
      roomId: 'room-a',
      ticketId: 'ticket-1',
    }],
  }), /缺少可信任的來源標記/);
});

test('anonymous legacy URL verification rejects any remaining 2xx without leaking URLs', async () => {
  const url = legacyDownloadUrl('rooms/room-a/tickets/ticket.pdf', 'never-log-this-token');
  await assert.doesNotReject(() => assertAnonymousLegacyUrlsDenied(
    [url],
    async () => ({ status: 403, body: { cancel: async () => {} } }),
  ));
  await assert.rejects(
    () => assertAnonymousLegacyUrlsDenied(
      [url],
      async () => ({ status: 206, body: { cancel: async () => {} } }),
    ),
    (error) => /1 個舊 download URL/.test(error.message)
      && !error.message.includes('never-log-this-token')
      && !error.message.includes(url),
  );
});

test('rollback verification accepts exact restoration or removed mirrors, never a new grant', () => {
  const base = {
    roomId: 'room-a',
    uid: 'owner-uid',
    previousMember: null,
    previousUserTrip: null,
    previousAcl: null,
    currentMember: null,
    currentUserTrip: null,
    currentAcl: null,
  };
  assert.doesNotThrow(() => assertRollbackMirrorsFailClosed(base));
  assert.doesNotThrow(() => assertRollbackMirrorsFailClosed({
    ...base,
    currentUserTrip: { role: 'owner', status: 'removed', aclVersion: 2 },
    currentAcl: {
      uid: 'owner-uid', role: 'owner', status: 'removed', aclVersion: 2,
    },
  }));
  assert.throws(() => assertRollbackMirrorsFailClosed({
    ...base,
    currentUserTrip: { role: 'owner', status: 'active', aclVersion: 1 },
  }), /意外保留有效授權/);
  assert.throws(() => assertRollbackMirrorsFailClosed({
    ...base,
    currentAcl: {
      uid: 'other-uid', role: 'owner', status: 'removed', aclVersion: 2,
    },
  }), /意外保留有效授權/);
  assert.throws(() => assertRollbackMirrorsFailClosed({
    ...base,
    currentMember: {
      uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 1,
    },
  }), /canonical membership/);

  const active = {
    uid: 'owner-uid', role: 'owner', status: 'active', aclVersion: 3,
  };
  assert.doesNotThrow(() => assertRollbackMirrorsFailClosed({
    ...base,
    previousMember: active,
    previousUserTrip: { role: 'owner', status: 'active', aclVersion: 3 },
    previousAcl: active,
    currentMember: active,
    currentUserTrip: { role: 'owner', status: 'removed', aclVersion: 4 },
    currentAcl: {
      uid: 'owner-uid', role: 'owner', status: 'removed', aclVersion: 4,
    },
  }));
});
