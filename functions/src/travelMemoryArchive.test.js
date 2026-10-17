import assert from 'node:assert/strict';
import test from 'node:test';
import { createTravelMemoryArchiveService } from './travelMemoryArchive.js';

const auth = (uid = 'alice') => ({ uid, token: { firebase: { sign_in_provider: 'google.com' } } });
const rejectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);
const archivePath = 'travelMemoryArchives/alice/source';
const photoPath = (i) => `rooms/source/places/p${i}/photo.jpg`;
class Database {
  constructor(state) { this.state = state; }
  value(path) { return path.split('/').filter(Boolean).reduce((value, key) => value?.[key], this.state) ?? null; }
  assign(path, value) {
    const parts = path.split('/').filter(Boolean); let target = this.state;
    for (const key of parts.slice(0, -1)) target = target[key] ||= {};
    if (value === null) delete target[parts.at(-1)]; else target[parts.at(-1)] = structuredClone(value);
  }
  snapshot(value) { return { val: () => structuredClone(value), exists: () => value !== null }; }
  ref(path = '') {
    return {
      get: async () => { await this.beforeGet?.(path); return this.snapshot(this.value(path)); },
      transaction: async (callback) => {
        await this.beforeTransaction?.(path);
        const value = callback(structuredClone(this.value(path)));
        if (value !== undefined) this.assign(path, value);
        await this.afterTransaction?.(path, value);
        return { committed: value !== undefined, snapshot: this.snapshot(this.value(path)) };
      },
      set: async (value) => this.assign(path, value),
      update: async (updates) => { for (const [key, value] of Object.entries(updates)) this.assign([path, key].filter(Boolean).join('/'), value); },
    };
  }
}
const missing = () => Object.assign(new Error('missing'), { code: 404 });
class Bucket {
  constructor() { this.objects = new Map(); this.sequence = 100; this.copies = 0; }
  file(name, options = {}) {
    const lookup = () => {
      const value = this.objects.get(name);
      if (!value || options.generation && String(options.generation) !== value.generation) throw missing();
      return value;
    };
    return {
      name,
      getMetadata: async () => [structuredClone(lookup())],
      copy: async (destination, config) => {
        await this.beforeCopy?.(name, destination.name);
        const source = lookup();
        if (config.preconditionOpts?.ifGenerationMatch !== 0) throw new Error('missing creation precondition');
        if (this.objects.has(destination.name)) throw Object.assign(new Error('exists'), { code: 412 });
        this.copies += 1;
        const next = { ...source, ...config, name: destination.name, generation: String(++this.sequence) };
        delete next.preconditionOpts;
        this.objects.set(destination.name, next);
        await this.afterCopy?.(name, destination.name);
        return [destination];
      },
      delete: async (config) => {
        await this.beforeDelete?.(name);
        const value = lookup();
        if (String(config.ifGenerationMatch) !== value.generation) throw Object.assign(new Error('generation mismatch'), { code: 412 });
        this.objects.delete(name);
      },
    };
  }
  async getFiles({ prefix, maxResults }) {
    const names = [...this.objects.keys()].filter((name) => name.startsWith(prefix));
    return [names.slice(0, maxResults).map((name) => this.file(name)), names.length > maxResults ? { pageToken: 'more' } : null];
  }
}
function fixture(count = 12) {
  const places = Array.from({ length: count }, (_, i) => ({ id: `p${i}`, name: `景點 ${i}`, memo: '早上去', cost: 10, placePhoto: { storagePath: photoPath(i), contentType: 'image/jpeg', fileName: 'photo.jpg' } }));
  const meta = { title: '日本', destination: '京都', startDate: '2026-01-01', endDate: '2026-01-07' };
  const database = new Database({ rooms: { source: { meta, itinerary: { 'Day 1': places } } }, roomAccess: { source: { state: 'ready', members: { alice: { uid: 'alice', role: 'owner', status: 'active', aclVersion: 1 } } } }, personalTravel: { alice: { memories: { source: { ...meta, roomId: 'source', revision: 1, archived: true, note: '私人的感想', visits: {} } } } } });
  const bucket = new Bucket();
  places.forEach((place, i) => bucket.objects.set(photoPath(i), { name: photoPath(i), generation: `${i + 1}`, contentType: 'image/jpeg', size: '100', metadata: { roomId: 'source', itemId: place.id, firebaseStorageDownloadTokens: 'never-copy' } }));
  let sequence = 0;
  let time = 1000;
  const service = createTravelMemoryArchiveService({ database, bucket, clock: () => time, operationIdFactory: () => `worker-${++sequence}`, batchSize: 20 });
  return { database, bucket, service, advance: () => { time += 700000; }, request: () => service.requestTravelMemoryPreservation({ roomId: 'source', operationId: 'preserve-1' }, auth()) };
}

test('accepts only Google caller with personal memory and canonical source access', async () => {
  const { service, request, database } = fixture();
  await rejectCode(service.requestTravelMemoryPreservation({ roomId: 'source', operationId: 'op' }, null), 'unauthenticated');
  await rejectCode(service.requestTravelMemoryPreservation({ roomId: 'source', operationId: '../bad' }, auth()), 'invalid-argument');
  await rejectCode(service.requestTravelMemoryPreservation({ roomId: 'source', operationId: 'op', uid: 'alice' }, auth('bob')), 'failed-precondition');
  database.state.roomAccess.source.members.alice.status = 'removed';
  await rejectCode(request(), 'permission-denied');
  assert.equal(database.value(archivePath), null);
});

test('persists sanitized immutable itinerary and twelve private independent photo copies', async () => {
  const { service, database, bucket, request } = fixture();
  const queued = await request();
  assert.equal(queued.summary.state, 'queued');
  assert.equal(queued.summary.total, 12);
  assert.equal(bucket.copies, 0);
  await service.processTravelMemoryPreservation('alice', 'source');
  const archive = database.value(archivePath);
  assert.equal(archive.summary.state, 'complete');
  assert.equal(archive.summary.saved, 12);
  assert.equal(Object.keys(archive.photos).length, 12);
  assert.deepEqual(archive.itinerary['Day 1'][0], { id: 'p0', name: '景點 0', memo: '早上去' });
  assert.equal(database.value('personalTravel/alice/memories/source/revision'), 1);
  for (const [photoId, photo] of Object.entries(archive.photos)) {
    const copy = bucket.objects.get(photo.storagePath);
    assert.ok(photo.storagePath.startsWith('travelMemories/alice/source/preserve-1/'));
    assert.deepEqual(copy.metadata, { uid: 'alice', operationId: 'preserve-1', photoId });
    assert.equal(copy.cacheControl, 'private, no-store, max-age=0');
  }
  assert.equal(archive.summary.coverPhoto.storagePath, Object.values(archive.photos)[0].storagePath);
  delete database.state.rooms.source; delete database.state.roomAccess.source;
  await request();
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  assert.equal(bucket.copies, 12);
});

test('missing and invalid source entries remain counted and never produce a complete archive', async () => {
  for (const mutate of [
    ({ database }) => { database.state.rooms.source.itinerary['Day 1'][0].placePhoto.storagePath = 'rooms/other/places/p0/photo.jpg'; },
    ({ bucket }) => { bucket.objects.get(photoPath(0)).metadata.itemId = 'other'; },
    ({ bucket }) => { bucket.objects.get(photoPath(0)).contentType = 'application/pdf'; },
    ({ bucket }) => { bucket.objects.get(photoPath(0)).size = String(5 * 1024 * 1024 + 1); },
    ({ bucket }) => { bucket.objects.delete(photoPath(0)); },
  ]) {
    const context = fixture(1); mutate(context); await context.request();
    await context.service.processTravelMemoryPreservation('alice', 'source');
    assert.equal(context.database.value(`${archivePath}/summary/state`), 'partial');
    assert.equal(context.database.value(`${archivePath}/summary/total`), 1);
    assert.equal(context.bucket.copies, 0);
  }
});

test('partial failure keeps completed copies and explicit retry resumes same operation', async () => {
  const { service, request, database, bucket } = fixture();
  await request();
  bucket.beforeCopy = async (name) => { if (name === photoPath(4)) throw new Error('temporarily unavailable'); };
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'partial');
  assert.equal(database.value(`${archivePath}/summary/saved`), 11);
  bucket.beforeCopy = null;
  const retry = await service.requestTravelMemoryPreservation({ roomId: 'source', operationId: 'different-retry' }, auth());
  assert.equal(retry.summary.operationId, 'preserve-1');
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  assert.equal(bucket.copies, 12);
});

test('retry discovers a copied file after its database checkpoint failed', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request();
  bucket.afterCopy = async () => {
    bucket.afterCopy = null;
    database.beforeTransaction = async (path) => {
      if (path === archivePath) { database.beforeTransaction = null; throw new Error('checkpoint failed'); }
    };
  };
  await service.processTravelMemoryPreservation('alice', 'source');
  await request();
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  assert.equal(bucket.copies, 1);
});

test('revocation during copying keeps earlier copies but does not publish later photos', async () => {
  const { service, request, database, bucket } = fixture(3);
  await request();
  bucket.afterCopy = async (name) => { if (name === photoPath(1)) database.state.roomAccess.source.members.alice.status = 'removed'; };
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'partial');
  assert.equal(database.value(`${archivePath}/summary/saved`), 1);
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/')).length, 1);
});

test('changed source generation cannot silently replace the accepted photo', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request();
  bucket.objects.get(photoPath(0)).generation = 'new-generation';
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'partial');
  assert.equal(bucket.copies, 0);
});

test('zero-photo itinerary completes and duplicate request cannot replace its snapshot', async () => {
  const { service, request, database } = fixture(0);
  await request();
  database.state.rooms.source.itinerary = { 'Day 1': [{ id: 'later', name: 'later' }] };
  await request(); await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  assert.deepEqual(database.value(`${archivePath}/itinerary`), { 'Day 1': [] });
});

test('personal deletion fences a paused copy, preserves originals and clears linked visits', async () => {
  const { service, request, database, bucket } = fixture(1);
  database.state.personalTravel.alice.collections = { temples: { revision: 1, items: { a: { name: '寺院', city: '京都', roomId: 'source', visitId: 'visit' } } } };
  const otherPath = 'travelMemories/bob/source/other/photo';
  bucket.objects.set(otherPath, { generation: '50', metadata: { uid: 'bob' } });
  await request();
  bucket.beforeCopy = async () => {
    bucket.beforeCopy = null;
    await service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth());
    await service.processTravelMemoryDeletion('alice', 'source');
  };
  await service.processTravelMemoryPreservation('alice', 'source');
  await service.processTravelMemoryDeletion('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleted');
  assert.equal(database.value('personalTravel/alice/memories/source'), null);
  assert.deepEqual(database.value('personalTravel/alice/collections/temples/items/a'), { name: '寺院', city: '京都' });
  assert.equal(database.value('personalTravel/alice/collections/temples/revision'), 2);
  assert.ok(database.value('personalTravel/alice/deletedMemories/source'));
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/alice/')).length, 0);
  assert.ok(bucket.objects.has(photoPath(0))); assert.ok(bucket.objects.has(otherPath));
  assert.equal(database.value(`${archivePath}/itinerary`), null);
  await rejectCode(request(), 'failed-precondition');
});

test('deletion cleanup failure stays deleting and is retryable with the original revision', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request(); await service.processTravelMemoryPreservation('alice', 'source');
  await rejectCode(service.deleteTravelMemory({ roomId: 'source', revision: 0 }, auth()), 'aborted');
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  await service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth());
  bucket.beforeDelete = async () => { throw new Error('storage unavailable'); };
  await assert.rejects(service.processTravelMemoryDeletion('alice', 'source'));
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleting');
  bucket.beforeDelete = null;
  await service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth());
  await service.processTravelMemoryDeletion('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleted');
});

test('late finalize only removes matching obsolete generation and never touches room or another owner', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request(); await service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth());
  await service.processTravelMemoryDeletion('alice', 'source');
  const path = 'travelMemories/alice/source/preserve-1/late';
  bucket.objects.set(path, { generation: '101', metadata: { uid: 'alice' } });
  await service.cleanupFinalizedMemoryObject({ name: path, generation: '100' });
  assert.ok(bucket.objects.has(path));
  await service.cleanupFinalizedMemoryObject({ name: path, generation: '101' });
  assert.equal(bucket.objects.has(path), false);
  await service.cleanupFinalizedMemoryObject({ name: photoPath(0), generation: '1' });
  assert.ok(bucket.objects.has(photoPath(0)));
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleted');
});

test('durable account tombstone resumes deletion when the callable failed before fencing archive', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request(); await service.processTravelMemoryPreservation('alice', 'source');
  database.beforeTransaction = async (path) => { if (path === archivePath) { database.beforeTransaction = null; throw new Error('database disconnected'); } };
  await assert.rejects(service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth()));
  assert.ok(database.value('personalTravel/alice/deletedMemories/source'));
  await service.processTravelMemoryDeletion('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleted');
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/')).length, 0);
});

test('ambiguous copy response after deletion still cleans the late independent object', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request();
  bucket.beforeCopy = async () => {
    await service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth());
    await service.processTravelMemoryDeletion('alice', 'source');
  };
  bucket.afterCopy = async () => { throw new Error('response lost after copy'); };
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleted');
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/')).length, 0);
});

test('revoked-source orphan cleanup is durably retried after Storage deletion fails', async () => {
  const { service, request, database, bucket } = fixture(1);
  await request();
  bucket.afterCopy = async () => { database.state.roomAccess.source.members.alice.status = 'removed'; };
  bucket.beforeDelete = async () => { throw new Error('cleanup temporarily unavailable'); };
  await assert.rejects(service.processTravelMemoryPreservation('alice', 'source'));
  bucket.beforeDelete = null;
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/')).length, 0);
  assert.equal(database.value(`${archivePath}/summary/state`), 'partial');
});

test('bounded worker resumes untouched photos and live lease rejects concurrent duplicate work', async () => {
  const { service, request, database, bucket } = fixture(21);
  await request();
  bucket.beforeCopy = async () => {
    bucket.beforeCopy = null;
    assert.equal((await service.processTravelMemoryPreservation('alice', 'source')).retryRequired, true);
  };
  assert.equal((await service.processTravelMemoryPreservation('alice', 'source')).retryRequired, true);
  assert.equal(database.value(`${archivePath}/summary/saved`), 20);
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/saved`), 21);
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
});

test('archive stores only allowed planning metadata including coordinates for independent cloning', async () => {
  const { database, request } = fixture(0);
  Object.assign(database.state.rooms.source.meta, { destLat: 35, destLng: 135, transport: '火車', memberBudgets: { alice: 100 }, ownerUid: 'alice' });
  await request();
  assert.deepEqual(database.value(`${archivePath}/operation/meta`), {
    title: '日本', destination: '京都', startDate: '2026-01-01', endDate: '2026-01-07', destLat: 35, destLng: 135, transport: '火車',
  });
});

test('declared source photo size must match Storage size and non-place attachments are excluded', async () => {
  const { request, service, database } = fixture(1);
  database.state.rooms.source.itinerary['Day 1'][0].placePhoto.size = 101;
  database.state.rooms.source.itinerary['Day 1'].push({ id: 'flight', type: 'transport', name: '班機', placePhoto: { storagePath: 'rooms/source/places/flight/scan.jpg', contentType: 'image/jpeg' } });
  await request(); await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/total`), 1);
  assert.equal(database.value(`${archivePath}/summary/state`), 'partial');
  assert.equal(database.value(`${archivePath}/summary/saved`), 0);
});

test('archive does not retain nested private fields through malformed source planning metadata', async () => {
  const { database, request } = fixture(0);
  Object.assign(database.state.rooms.source.meta, { destLat: { finance: 'private' }, destLng: 900, transport: { ownerUid: 'private' }, themeColor: ['private'] });
  await request();
  assert.deepEqual(database.value(`${archivePath}/operation/meta`), { title: '日本', destination: '京都', startDate: '2026-01-01', endDate: '2026-01-07' });
});

test('an expired worker cannot remove the newer worker completed photo after source revocation', async () => {
  const { request, service, database, bucket, advance } = fixture(1);
  await request();
  bucket.beforeCopy = async () => {
    bucket.beforeCopy = null; advance();
    await service.processTravelMemoryPreservation('alice', 'source');
    database.state.roomAccess.source.members.alice.status = 'removed';
  };
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  const photo = Object.values(database.value(`${archivePath}/photos`))[0];
  assert.ok(bucket.objects.has(photo.storagePath));
});

test('personal cleanup refuses objects without a generation instead of issuing an unguarded delete', async () => {
  const { request, service, database, bucket } = fixture(1);
  await request(); await service.processTravelMemoryPreservation('alice', 'source');
  const photo = Object.values(database.value(`${archivePath}/photos`))[0];
  delete bucket.objects.get(photo.storagePath).generation;
  await service.deleteTravelMemory({ roomId: 'source', revision: 1 }, auth());
  await rejectCode(service.processTravelMemoryDeletion('alice', 'source'), 'failed-precondition');
  assert.ok(bucket.objects.has(photo.storagePath));
  assert.equal(database.value(`${archivePath}/summary/state`), 'deleting');
});

test('expired worker cannot delete a newer worker photo before its checkpoint publishes', async () => {
  const { request, service, database, bucket, advance } = fixture(1);
  await request();
  let releaseOldCopy;
  let notifyOldStarted;
  let releaseNewCheckpoint;
  let notifyNewReady;
  const oldCopyGate = new Promise((resolve) => { releaseOldCopy = resolve; });
  const oldStarted = new Promise((resolve) => { notifyOldStarted = resolve; });
  const newCheckpointGate = new Promise((resolve) => { releaseNewCheckpoint = resolve; });
  const newReady = new Promise((resolve) => { notifyNewReady = resolve; });
  let firstCopy = true;
  bucket.beforeCopy = async () => {
    if (!firstCopy) return;
    firstCopy = false;
    notifyOldStarted();
    await oldCopyGate;
  };
  const oldWorker = service.processTravelMemoryPreservation('alice', 'source');
  await oldStarted;
  advance();
  bucket.afterCopy = async () => {
    bucket.afterCopy = null;
    database.beforeTransaction = async (path) => {
      if (path !== archivePath) return;
      database.beforeTransaction = null;
      notifyNewReady();
      await newCheckpointGate;
    };
  };
  const newWorker = service.processTravelMemoryPreservation('alice', 'source');
  await newReady;
  // The new worker has copied and passed its final ACL check, but has not
  // published the photo reference. The old worker must not clean its object.
  database.state.roomAccess.source.members.alice.status = 'removed';
  releaseOldCopy();
  await oldWorker;
  releaseNewCheckpoint();
  await newWorker;
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  assert.equal(database.value(`${archivePath}/summary/saved`), 1);
  const photo = Object.values(database.value(`${archivePath}/photos`))[0];
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/')).length, 1);
  assert.ok(bucket.objects.has(photo.storagePath));
});

test('delayed cleanup cannot delete a replacement generation after another worker completes cleanup and retry', async () => {
  const { request, service, database, bucket, advance } = fixture(1);
  await request();
  bucket.afterCopy = async (_, destination) => {
    bucket.afterCopy = null;
    bucket.objects.get(destination).metadata.unexpected = 'reject this copy';
  };
  let releaseOldDelete;
  let notifyCleanupStarted;
  const deleteGate = new Promise((resolve) => { releaseOldDelete = resolve; });
  const cleanupStarted = new Promise((resolve) => { notifyCleanupStarted = resolve; });
  let firstDelete = true;
  bucket.beforeDelete = async () => {
    if (!firstDelete) return;
    firstDelete = false;
    notifyCleanupStarted();
    await deleteGate;
  };
  const oldWorker = service.processTravelMemoryPreservation('alice', 'source').catch((error) => error);
  await cleanupStarted;
  const original = Object.values(database.value(`${archivePath}/operation/sources`))[0];
  assert.equal(original.status, 'cleanup');
  const oldGeneration = original.cleanupGeneration;
  advance();
  await service.processTravelMemoryPreservation('alice', 'source');
  assert.equal(database.value(`${archivePath}/summary/state`), 'partial');
  await request();
  await service.processTravelMemoryPreservation('alice', 'source');
  const photo = Object.values(database.value(`${archivePath}/photos`))[0];
  const replacementGeneration = bucket.objects.get(photo.storagePath).generation;
  assert.notEqual(replacementGeneration, oldGeneration);
  releaseOldDelete();
  await oldWorker;
  assert.equal(database.value(`${archivePath}/summary/state`), 'complete');
  assert.equal(database.value(`${archivePath}/summary/saved`), 1);
  assert.equal(bucket.objects.get(photo.storagePath).generation, replacementGeneration);
  assert.equal([...bucket.objects.keys()].filter((path) => path.startsWith('travelMemories/')).length, 1);
});
