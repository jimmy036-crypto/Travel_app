import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';

const storageBucket = 'demo-travel.appspot.com';
const previousFirebaseConfig = process.env.FIREBASE_CONFIG;
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'demo-travel',
  databaseURL: 'http://127.0.0.1:9000?ns=demo-travel',
  storageBucket,
});

const {
  cleanupDeletedTripStorageObject,
  processTripDeletion,
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
