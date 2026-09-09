import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { declaredParams } from 'firebase-functions/params';

const storageBucket = 'demo-travel.appspot.com';
const previousFirebaseConfig = process.env.FIREBASE_CONFIG;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-travel',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-travel',
  storageBucket,
});

const {
  cleanupDeletedTripStorageObject,
  deleteTrip,
  getOrCreateTripInvite,
  processTripDeletion,
  redeemTripInvite,
  removeTripMember,
  restoreTripMember,
  revokeTripInvite,
  rotateTripInvite,
  searchParking,
  syncTripMemberAccess,
} = await import('./index.js');

if (previousFirebaseConfig === undefined) delete process.env.FIREBASE_CONFIG;
else process.env.FIREBASE_CONFIG = previousFirebaseConfig;

test('deploys the Storage cleanup trigger alongside the default bucket', () => {
  assert.deepEqual(cleanupDeletedTripStorageObject.__endpoint.region, ['us-east1']);
  assert.equal(
    cleanupDeletedTripStorageObject.__endpoint.eventTrigger.eventType,
    'google.cloud.storage.object.v1.finalized',
  );
  assert.equal(
    cleanupDeletedTripStorageObject.__endpoint.eventTrigger.eventFilters.bucket,
    storageBucket,
  );
});

test('keeps the Realtime Database deletion worker in the default Functions region', () => {
  assert.deepEqual(processTripDeletion.__endpoint.region, ['us-central1']);
});

test('scopes optional TDX secrets to the parking callable deployment', () => {
  assert.deepEqual(
    declaredParams.filter(({ name }) => name.startsWith('TDX_')),
    [],
    'TDX secrets must not become build-wide deploy parameters',
  );
  assert.deepEqual(searchParking.__endpoint.secretEnvironmentVariables, [
    { key: 'TDX_CLIENT_ID' },
    { key: 'TDX_CLIENT_SECRET' },
  ]);

  const ownershipTransferPrerequisites = [
    getOrCreateTripInvite,
    rotateTripInvite,
    revokeTripInvite,
    redeemTripInvite,
    removeTripMember,
    restoreTripMember,
    syncTripMemberAccess,
    deleteTrip,
    processTripDeletion,
  ];
  for (const deployedFunction of ownershipTransferPrerequisites) {
    assert.equal(deployedFunction.__endpoint.secretEnvironmentVariables, undefined);
  }
});
