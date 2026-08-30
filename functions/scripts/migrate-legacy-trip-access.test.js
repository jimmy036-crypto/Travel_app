import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertAnonymousLegacyUrlsDenied,
  assertCompatibleState,
  assertRollbackMirrorsFailClosed,
  buildLegacyDownloadUrlPlan,
  buildMigrationUpdates,
  findUnreservedStorageRoomIds,
  normalizeOwnerMappings,
  parseCli,
  parseTokenizedFirebaseDownloadUrl,
  readFirebaseStorageDownloadTokens,
  revokeStorageDownloadTokens,
  scanStorageDownloadTokens,
  validateDatabaseTargetUrl,
  validateStorageBucket,
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

test('legacy URL plan converts only target-bucket room URLs to storagePath', () => {
  const url = legacyDownloadUrl('rooms/room-a/tickets/ticket.pdf');
  assert.deepEqual(parseTokenizedFirebaseDownloadUrl(url), {
    bucket: STORAGE_BUCKET,
    objectName: 'rooms/room-a/tickets/ticket.pdf',
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
    'rooms/room-a/tickets/0/storagePath': 'rooms/room-a/tickets/ticket.pdf',
    'rooms/room-a/tickets/0/url': '',
  });

  const foreignUrl = legacyDownloadUrl(
    'rooms/room-a/tickets/ticket.pdf',
    'must-not-appear-in-error',
    'other-project.firebasestorage.app',
  );
  assert.throws(
    () => buildLegacyDownloadUrlPlan({
      rooms: { 'room-a': { tickets: [{ url: foreignUrl }] } },
      targetBucket: STORAGE_BUCKET,
    }),
    (error) => /非 target bucket/.test(error.message)
      && !error.message.includes('must-not-appear-in-error'),
  );
  assert.throws(() => buildLegacyDownloadUrlPlan({
    rooms: {
      'room-a': {
        tickets: [{
          url,
          storagePath: 'rooms/room-a/tickets/different.pdf',
        }],
      },
    },
    targetBucket: STORAGE_BUCKET,
  }), /storagePath 衝突/);
});

test('Storage token inventory and revocation update metadata without logging token material', async () => {
  const metadataWrites = [];
  const tokenizedFile = {
    name: 'rooms/room-a/tickets/ticket.pdf',
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
    name: 'rooms/room-a/photos/photo.jpg',
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

  const malformedFile = {
    name: 'rooms/no-object-suffix',
    async getMetadata() { return [{ metadata: {}, metageneration: '1' }]; },
  };
  const inventory = await scanStorageDownloadTokens({
    async getFiles() { return [[malformedFile]]; },
  });
  assert.equal(inventory.malformedObjectCount, 1);
  assert.deepEqual(inventory.roomIds, []);
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
