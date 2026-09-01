import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  applyRepairManifest,
  buildLegacyTicketPathCandidates,
  createRepairManifest,
  finalizeRepairManifest,
  parseRepairCli,
  readRepairManifest,
  rollbackRepairManifest,
  serializeRepairManifest,
  sha256Hex,
  writeRepairManifest,
} from './repair-legacy-ticket-storage-path.js';

const PROJECT_ID = 'travel-app-923ef';
const DATABASE_URL = `https://${PROJECT_ID}-default-rtdb.firebaseio.com/`;
const STORAGE_BUCKET = `${PROJECT_ID}.firebasestorage.app`;
const ROOM_ID = 'id_1782055259578_uapiufh1s';
const OWNER_UID = 'tbQ2A81L8kbNceMZAfJgrAuKkSL2';
const ACL_VERSION = 7;
const LEGACY_SOURCE_METADATA_KEY = 'travelAppLegacySourcePath';
const REPAIR_SOURCE_METADATA_KEY = 'travelAppTicketPathRepairSource';

const clone = (value) => structuredClone(value);
const notFound = () => Object.assign(new Error('not found'), { code: 404 });

const splitPath = (path) => String(path || '').split('/').filter(Boolean);

const readAtPath = (root, path) => splitPath(path).reduce(
  (value, segment) => value?.[segment],
  root,
);

const writeAtPath = (root, path, value) => {
  const segments = splitPath(path);
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    if (!parent[segment] || typeof parent[segment] !== 'object') parent[segment] = {};
    parent = parent[segment];
  }
  parent[segments.at(-1)] = value;
};

const snapshotOf = (value) => ({
  exists: () => value !== null && value !== undefined,
  val: () => clone(value),
});

class FakeDatabase {
  constructor(data, {
    events = [],
    beforeTransaction = null,
    beforeLeaseTransaction = null,
    initialNullTransaction = false,
  } = {}) {
    this.data = clone(data);
    this.events = events;
    this.beforeTransaction = beforeTransaction;
    this.beforeLeaseTransaction = beforeLeaseTransaction;
    this.initialNullTransaction = initialNullTransaction;
    this.transactionCount = 0;
    this.leaseTransactionCount = 0;
  }

  ref(path) {
    return {
      get: async () => snapshotOf(readAtPath(this.data, path)),
      transaction: async (updater) => {
        const isLease = path.startsWith('maintenanceRepairs/legacyTicketPath/');
        if (isLease) {
          this.leaseTransactionCount += 1;
          this.events.push(`lease:transaction:${path}`);
          this.beforeLeaseTransaction?.(this, path, this.leaseTransactionCount);
        } else {
          this.transactionCount += 1;
          this.events.push('transaction');
          this.beforeTransaction?.(this, path, this.transactionCount);
        }
        const current = clone(readAtPath(this.data, path) ?? null);
        if (this.initialNullTransaction && !isLease) {
          assert.equal(updater(null), null);
        }
        const next = updater(current);
        if (next === undefined) return { committed: false, snapshot: snapshotOf(current) };
        writeAtPath(this.data, path, clone(next));
        return { committed: true, snapshot: snapshotOf(next) };
      },
    };
  }
}

class FakeFirestore {
  constructor(documents) {
    this.documents = new Map(
      Object.entries(documents).map(([path, value]) => [path, clone(value)]),
    );
  }

  doc(path) {
    return {
      get: async () => {
        const value = this.documents.get(path);
        return {
          exists: value !== undefined,
          data: () => clone(value),
        };
      },
    };
  }
}

class FakeBucket {
  constructor(objects, {
    events = [],
    failCopyFor = '',
    failDeleteFor = '',
    failHoldReleaseFor = '',
    beforeSetMetadata = null,
    beforeDelete = null,
  } = {}) {
    this.name = STORAGE_BUCKET;
    this.objects = new Map(Object.entries(objects).map(([name, metadata]) => [name, clone(metadata)]));
    this.events = events;
    this.failCopyFor = failCopyFor;
    this.failDeleteFor = failDeleteFor;
    this.failHoldReleaseFor = failHoldReleaseFor;
    this.beforeSetMetadata = beforeSetMetadata;
    this.beforeDelete = beforeDelete;
    this.nextGeneration = 100;
    this.copyCalls = [];
    this.deleteCalls = [];
    this.metadataCalls = [];
  }

  file(name, fileOptions = {}) {
    const bucket = this;
    return {
      name,
      async getMetadata() {
        const metadata = bucket.objects.get(name);
        if (!metadata) throw notFound();
        return [clone(metadata)];
      },
      async copy(destination, options) {
        const source = bucket.objects.get(name);
        if (!source) throw notFound();
        assert.equal(fileOptions.generation, source.generation);
        assert.equal(options.preconditionOpts.ifGenerationMatch, 0);
        if (bucket.objects.has(destination.name)) {
          throw Object.assign(new Error('precondition failed'), { code: 412 });
        }
        bucket.events.push(`copy:${name}`);
        bucket.copyCalls.push({
          source: name,
          destination: destination.name,
          sourceGeneration: fileOptions.generation,
          options: clone(options),
        });
        if (bucket.failCopyFor === name) throw new Error('simulated copy failure');
        bucket.nextGeneration += 1;
        const fileMetadata = clone(options);
        const customMetadata = fileMetadata.metadata;
        delete fileMetadata.preconditionOpts;
        delete fileMetadata.metadata;
        bucket.objects.set(destination.name, {
          ...clone(source),
          ...clone(fileMetadata),
          generation: String(bucket.nextGeneration),
          metageneration: '1',
          metadata: clone(customMetadata),
        });
        return [destination, {}];
      },
      async setMetadata(update, options) {
        const metadata = bucket.objects.get(name);
        if (!metadata) throw notFound();
        assert.equal(fileOptions.generation, metadata.generation);
        assert.equal(String(options.ifMetagenerationMatch), metadata.metageneration);
        const enabled = update.temporaryHold === true;
        bucket.events.push(`hold:${enabled ? 'on' : 'off'}:${name}`);
        bucket.metadataCalls.push({
          name,
          generation: fileOptions.generation,
          update: clone(update),
          options: clone(options),
        });
        await bucket.beforeSetMetadata?.({
          bucket,
          name,
          enabled,
          update: clone(update),
        });
        if (!enabled && bucket.failHoldReleaseFor === name) {
          throw new Error('simulated hold release failure');
        }
        const next = {
          ...clone(metadata),
          ...clone(update),
          metageneration: String(Number(metadata.metageneration) + 1),
        };
        if (update.metadata) next.metadata = clone(update.metadata);
        bucket.objects.set(name, next);
        return [clone(next)];
      },
      async delete() {
        const metadata = bucket.objects.get(name);
        if (!metadata) throw notFound();
        assert.equal(fileOptions.generation, metadata.generation);
        await bucket.beforeDelete?.({ bucket, name, metadata: clone(metadata) });
        if (metadata.temporaryHold === true) {
          throw new Error('cannot delete object with temporaryHold');
        }
        if (bucket.failDeleteFor === name) throw new Error('simulated delete failure');
        bucket.events.push(`delete:${name}`);
        bucket.deleteCalls.push({ name, generation: fileOptions.generation });
        bucket.objects.delete(name);
      },
    };
  }

  async getFiles({ prefix }) {
    return [[...this.objects.keys()]
      .filter((name) => name.startsWith(prefix))
      .map((name) => this.file(name))];
  }
}

const sourcePath = (fileName) => `rooms/${ROOM_ID}/tickets/${fileName}`;
const destinationPath = (ticketId, fileName) => (
  `rooms/${ROOM_ID}/tickets/${ticketId}/${fileName}`
);

const sourceMetadata = (fileName, generation) => ({
  size: String(100 + Number(generation)),
  crc32c: `crc-${generation}`,
  md5Hash: `md5-${generation}`,
  generation: String(generation),
  metageneration: '2',
  contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'image/png',
  cacheControl: 'public, max-age=3600',
  metadata: {
    firebaseStorageDownloadTokens: null,
    [LEGACY_SOURCE_METADATA_KEY]: `tickets/${fileName}`,
    retained: `private-source-metadata-${generation}`,
  },
});

const fixture = ({ count = 3, bucketOptions = {}, databaseOptions = {} } = {}) => {
  const files = [
    '1782114182078_ticket.png',
    '1782114287829_itinerary.pdf',
    '1782265319070_boarding.png',
  ];
  const tickets = {};
  const objects = {};
  for (let index = 0; index < count; index += 1) {
    const ticketId = `ticket-${index + 1}`;
    const fileName = files[index];
    tickets[String(index)] = {
      id: ticketId,
      title: `PRIVATE TITLE ${index + 1}`,
      ticketType: 'attachment',
      url: '',
      storagePath: sourcePath(fileName),
    };
    objects[sourcePath(fileName)] = sourceMetadata(fileName, index + 7);
  }
  const events = bucketOptions.events || databaseOptions.events || [];
  const database = new FakeDatabase({
    rooms: {
      [ROOM_ID]: {
        meta: { ownerUid: OWNER_UID },
        tickets,
      },
    },
    roomAccess: {
      [ROOM_ID]: {
        ownerUid: OWNER_UID,
        state: 'ready',
        members: {
          [OWNER_UID]: {
            uid: OWNER_UID,
            role: 'owner',
            status: 'active',
            aclVersion: ACL_VERSION,
          },
        },
      },
    },
    userTrips: {
      [OWNER_UID]: {
        [ROOM_ID]: {
          role: 'owner',
          status: 'active',
          aclVersion: ACL_VERSION,
        },
      },
    },
    roomReservations: {
      [ROOM_ID]: {
        roomId: ROOM_ID,
        createdByUid: OWNER_UID,
      },
    },
  }, {
    ...databaseOptions,
    events,
  });
  const firestore = new FakeFirestore({
    [`tripAccess/${ROOM_ID}/members/${OWNER_UID}`]: {
      uid: OWNER_UID,
      role: 'owner',
      status: 'active',
      aclVersion: ACL_VERSION,
    },
  });
  const bucket = new FakeBucket(objects, { ...bucketOptions, events });
  return {
    database, firestore, bucket, tickets, events,
  };
};

const createFixtureManifest = async (setup, count = 3) => createRepairManifest({
  database: setup.database,
  firestore: setup.firestore,
  bucket: setup.bucket,
  projectId: PROJECT_ID,
  databaseURL: DATABASE_URL,
  storageBucket: STORAGE_BUCKET,
  roomId: ROOM_ID,
  expectedCount: count,
  runId: 'repair-run-1',
  now: new Date('2026-08-31T08:00:00.000Z'),
});

const getTicketPath = (database, ticketKey) => (
  database.data.rooms[ROOM_ID].tickets[ticketKey].storagePath
);

const phaseInput = (setup, manifest) => ({
  database: setup.database,
  firestore: setup.firestore,
  bucket: setup.bucket,
  manifest,
});

test('planner inserts ticket.id without renaming the legacy file and accepts canonical siblings', () => {
  const tickets = {
    0: {
      id: 'ticket-1',
      title: 'Private title',
      url: '',
      storagePath: sourcePath('legacy 中文 ticket.png'),
    },
    1: {
      id: 'ticket-2',
      url: '',
      storagePath: destinationPath('ticket-2', 'already.pdf'),
    },
    2: { id: 'web-link', url: 'https://tickets.example/item', storagePath: '' },
  };
  assert.deepEqual(buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets,
    expectedCount: 1,
  }), [{
    ticketKey: '0',
    ticketId: 'ticket-1',
    fileName: 'legacy 中文 ticket.png',
    rtdbPath: `rooms/${ROOM_ID}/tickets/0/storagePath`,
    sourceObjectName: sourcePath('legacy 中文 ticket.png'),
    destinationObjectName: destinationPath('ticket-1', 'legacy 中文 ticket.png'),
  }]);
});

test('planner fails closed for count, URL, room, canonical-id and duplicate-source drift', () => {
  const base = { id: 'ticket-1', url: '', storagePath: sourcePath('legacy.png') };
  assert.throws(() => buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets: { 0: base },
    expectedCount: 2,
  }), /expected-count/);
  assert.throws(() => buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets: { 0: { ...base, url: 'https://secret.example/?token=never-log' } },
    expectedCount: 1,
  }), /同時保留/);
  assert.throws(() => buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets: { 0: { ...base, storagePath: 'rooms/other-room/tickets/legacy.png' } },
    expectedCount: 1,
  }), /不屬於指定 room/);
  assert.throws(() => buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets: {
      0: { ...base, storagePath: destinationPath('other-id', 'legacy.png') },
    },
    expectedCount: 1,
  }), /ticket.id 不一致/);
  assert.throws(() => buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets: {
      0: base,
      1: { ...base, id: 'ticket-2' },
    },
    expectedCount: 2,
  }), /重複 Storage source/);
  assert.throws(() => buildLegacyTicketPathCandidates({
    roomId: ROOM_ID,
    tickets: {
      0: base,
      web: { id: base.id, url: 'https://tickets.example/item', storagePath: '' },
    },
    expectedCount: 1,
  }), /重複 ticket.id/);
});

test('plan manifest is minimal, immutable, SHA-bound, and omits titles, URLs and tokens', async () => {
  const setup = fixture({ count: 1 });
  setup.bucket.objects.get(sourcePath('1782114182078_ticket.png')).metadata.secret = 'token-secret-value';
  const manifest = await createFixtureManifest(setup, 1);
  const serialized = serializeRepairManifest(manifest);
  assert.equal(serialized.includes('PRIVATE TITLE'), false);
  assert.equal(serialized.includes('https://'), false);
  assert.equal(serialized.includes('token-secret-value'), false);
  assert.equal(manifest.entries[0].afterStoragePath, destinationPath(
    'ticket-1',
    '1782114182078_ticket.png',
  ));

  const directory = await mkdtemp(join(tmpdir(), 'travel-ticket-repair-'));
  const manifestPath = join(directory, 'legacy-ticket-path-repair.production.local.json');
  try {
    const written = await writeRepairManifest(manifestPath, manifest);
    const loaded = await readRepairManifest(manifestPath, written.sha256);
    assert.deepEqual(loaded.manifest, manifest);
    await assert.rejects(() => readRepairManifest(manifestPath, '0'.repeat(64)), /SHA256/);
    await assert.rejects(() => writeRepairManifest(manifestPath, manifest), /EEXIST/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('plan rejects source tokens, missing provenance and an untrusted existing destination', async () => {
  const tokenized = fixture({ count: 1 });
  tokenized.bucket.objects.get(sourcePath('1782114182078_ticket.png'))
    .metadata.firebaseStorageDownloadTokens = 'secret-download-token';
  await assert.rejects(() => createFixtureManifest(tokenized, 1), /download token/);

  const noMarker = fixture({ count: 1 });
  delete noMarker.bucket.objects.get(sourcePath('1782114182078_ticket.png'))
    .metadata[LEGACY_SOURCE_METADATA_KEY];
  await assert.rejects(() => createFixtureManifest(noMarker, 1), /可信任 legacy marker/);

  const untrustedDestination = fixture({ count: 1 });
  const source = untrustedDestination.bucket.objects.get(sourcePath('1782114182078_ticket.png'));
  untrustedDestination.bucket.objects.set(
    destinationPath('ticket-1', '1782114182078_ticket.png'),
    {
      ...clone(source),
      generation: '88',
      metageneration: '1',
      cacheControl: 'private, no-store, max-age=0',
      metadata: {},
    },
  );
  await assert.rejects(() => createFixtureManifest(untrustedDestination, 1), /repair metadata/);

  const publicDestination = fixture({ count: 1 });
  const publicSourcePath = sourcePath('1782114182078_ticket.png');
  const publicSource = publicDestination.bucket.objects.get(publicSourcePath);
  publicDestination.bucket.objects.set(
    destinationPath('ticket-1', '1782114182078_ticket.png'),
    {
      ...clone(publicSource),
      generation: '89',
      metageneration: '1',
      cacheControl: 'public, max-age=3600',
      metadata: {
        ...clone(publicSource.metadata),
        firebaseStorageDownloadTokens: null,
        roomId: ROOM_ID,
        ticketId: 'ticket-1',
        [REPAIR_SOURCE_METADATA_KEY]: publicSourcePath,
      },
    },
  );
  await assert.rejects(() => createFixtureManifest(publicDestination, 1), /private cache policy/);
});

test('ACL gate rejects coerced versions and owner mirror drift before planning or apply', async () => {
  const invalidVersion = fixture({ count: 1 });
  invalidVersion.database.data.roomAccess[ROOM_ID]
    .members[OWNER_UID].aclVersion = String(ACL_VERSION);
  await assert.rejects(
    () => createFixtureManifest(invalidVersion, 1),
    /aclVersion 必須是正整數/,
  );

  const drifted = fixture({ count: 1 });
  const manifest = await createFixtureManifest(drifted, 1);
  const stringManifestVersion = clone(manifest);
  stringManifestVersion.authorization.aclVersion = String(ACL_VERSION);
  assert.throws(
    () => serializeRepairManifest(stringManifestVersion),
    /aclVersion 必須是正整數/,
  );
  drifted.database.data.userTrips[OWNER_UID][ROOM_ID].status = 'removed';
  await assert.rejects(
    () => applyRepairManifest(phaseInput(drifted, manifest)),
    /userTrips owner mirror/,
  );
  assert.equal(drifted.bucket.copyCalls.length, 0);
  assert.equal(drifted.database.transactionCount, 0);
});

test('plan rejects any unreferenced malformed rooms object in the bucket inventory', async () => {
  const setup = fixture({ count: 1 });
  const orphanName = `rooms/${ROOM_ID}/tickets/unreferenced.png`;
  setup.bucket.objects.set(orphanName, sourceMetadata('unreferenced.png', 55));
  await assert.rejects(
    () => createFixtureManifest(setup, 1),
    /malformed object inventory/,
  );
});

test('every phase fails closed if a legacy root ticket object or token reappears', async () => {
  const rootObjectName = 'tickets/reappeared.png';

  const planSetup = fixture({ count: 1 });
  const rootMetadata = sourceMetadata('reappeared.png', 77);
  rootMetadata.metadata.firebaseStorageDownloadTokens = 'reappeared-secret-token';
  planSetup.bucket.objects.set(rootObjectName, rootMetadata);
  await assert.rejects(
    () => createFixtureManifest(planSetup, 1),
    /legacy root tickets\/\*\* inventory/,
  );

  const phaseSetup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(phaseSetup, 1);
  phaseSetup.bucket.objects.set(rootObjectName, rootMetadata);
  for (const operation of [
    applyRepairManifest,
    finalizeRepairManifest,
    rollbackRepairManifest,
  ]) {
    await assert.rejects(
      () => operation(phaseInput(phaseSetup, manifest)),
      /legacy root tickets\/\*\* inventory/,
    );
  }
  assert.equal(phaseSetup.database.transactionCount, 0);
  assert.equal(phaseSetup.bucket.copyCalls.length, 0);
  assert.equal(phaseSetup.bucket.deleteCalls.length, 0);
});

test('apply copies and verifies every destination before one RTDB transaction, retaining sources', async () => {
  const events = [];
  const setup = fixture({ count: 3, bucketOptions: { events }, databaseOptions: { events } });
  const manifest = await createFixtureManifest(setup, 3);
  await applyRepairManifest(phaseInput(setup, manifest));

  assert.equal(setup.database.transactionCount, 1);
  assert.deepEqual(events.slice(0, 8), [
    `lease:transaction:maintenanceRepairs/legacyTicketPath/${ROOM_ID}`,
    `copy:${manifest.entries[0].beforeStoragePath}`,
    `copy:${manifest.entries[1].beforeStoragePath}`,
    `copy:${manifest.entries[2].beforeStoragePath}`,
    `hold:on:${manifest.entries[0].afterStoragePath}`,
    `hold:on:${manifest.entries[1].afterStoragePath}`,
    `hold:on:${manifest.entries[2].afterStoragePath}`,
    'transaction',
  ]);
  for (const entry of manifest.entries) {
    assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);
    assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), true);
    const destination = setup.bucket.objects.get(entry.afterStoragePath);
    assert.equal(destination.temporaryHold, true);
    assert.equal(destination.metadata[REPAIR_SOURCE_METADATA_KEY], entry.beforeStoragePath);
    assert.equal(destination.metadata[LEGACY_SOURCE_METADATA_KEY], entry.source.legacySourcePath);
    assert.equal(destination.metadata.roomId, ROOM_ID);
    assert.equal(destination.metadata.ticketId, entry.ticketId);
    assert.equal(destination.metadata.firebaseStorageDownloadTokens, null);
    assert.equal(destination.cacheControl, 'private, no-store, max-age=0');
  }
  assert.equal(setup.bucket.deleteCalls.length, 0);
  const firstCopyOptions = setup.bucket.copyCalls[0].options;
  assert.equal(firstCopyOptions.cacheControl, 'private, no-store, max-age=0');
  assert.equal(firstCopyOptions.temporaryHold, false);
  assert.equal(firstCopyOptions.contentType, 'image/png');
  assert.equal(firstCopyOptions.metadata.roomId, ROOM_ID);
  assert.equal(firstCopyOptions.metadata.ticketId, manifest.entries[0].ticketId);
  assert.equal(
    firstCopyOptions.metadata[LEGACY_SOURCE_METADATA_KEY],
    manifest.entries[0].source.legacySourcePath,
  );
  assert.equal(
    firstCopyOptions.metadata[REPAIR_SOURCE_METADATA_KEY],
    manifest.entries[0].beforeStoragePath,
  );
  assert.equal(firstCopyOptions.metadata.metadata, undefined);

  const copyCount = setup.bucket.copyCalls.length;
  await applyRepairManifest(phaseInput(setup, manifest));
  assert.equal(setup.bucket.copyCalls.length, copyCount);
  assert.equal(setup.database.transactionCount, 2);
});

test('a copy failure leaves all RTDB paths and all source objects untouched', async () => {
  const failingSource = sourcePath('1782114287829_itinerary.pdf');
  const setup = fixture({ count: 3, bucketOptions: { failCopyFor: failingSource } });
  const manifest = await createFixtureManifest(setup, 3);
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /simulated copy failure/,
  );
  assert.equal(setup.database.transactionCount, 0);
  for (const entry of manifest.entries) {
    assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.beforeStoragePath);
    assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), true);
  }
});

test('RTDB drift aborts the single transaction after copy without deleting either side', async () => {
  const setup = fixture({
    count: 1,
    databaseOptions: {
      beforeTransaction(database) {
        database.data.rooms[ROOM_ID].tickets['0'].storagePath = (
          `rooms/${ROOM_ID}/tickets/unplanned/changed.png`
        );
      },
    },
  });
  const manifest = await createFixtureManifest(setup, 1);
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /transaction tickets invariant 失敗：ticket 0 canonical storagePath 與自身 id 不一致/,
  );
  assert.equal(setup.bucket.objects.has(manifest.entries[0].beforeStoragePath), true);
  assert.equal(setup.bucket.objects.has(manifest.entries[0].afterStoragePath), true);
  assert.equal(setup.bucket.deleteCalls.length, 0);
});

test('transaction rechecks exclusive legacy source binding against a concurrent alias ticket', async () => {
  const setup = fixture({
    count: 1,
    databaseOptions: {
      beforeTransaction(database) {
        database.data.rooms[ROOM_ID].tickets.alias = {
          id: 'alias-ticket',
          url: '',
          storagePath: sourcePath('1782114182078_ticket.png'),
        };
      },
    },
  });
  const manifest = await createFixtureManifest(setup, 1);
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /transaction tickets invariant.*重複引用|transaction tickets invariant.*未綁定/,
  );
  assert.equal(setup.bucket.deleteCalls.length, 0);
  assert.equal(getTicketPath(setup.database, '0'), manifest.entries[0].beforeStoragePath);
});

test('transaction rejects a concurrently inserted canonical sibling with duplicate ticket.id', async () => {
  const setup = fixture({
    count: 1,
    databaseOptions: {
      beforeTransaction(database) {
        database.data.rooms[ROOM_ID].tickets.sibling = {
          id: 'ticket-1',
          url: '',
          storagePath: destinationPath('ticket-1', 'concurrent-sibling.png'),
        };
      },
    },
  });
  const manifest = await createFixtureManifest(setup, 1);
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /transaction tickets invariant 失敗：tickets 0\/sibling 含重複 ticket.id/,
  );
  assert.equal(setup.bucket.deleteCalls.length, 0);
  assert.equal(getTicketPath(setup.database, '0'), manifest.entries[0].beforeStoragePath);
});

test('transaction rejects a concurrent empty-storage web link that reuses the repaired ticket id', async () => {
  const setup = fixture({
    count: 1,
    databaseOptions: {
      beforeTransaction(database) {
        database.data.rooms[ROOM_ID].tickets.web = {
          id: 'ticket-1',
          url: 'https://tickets.example/concurrent',
          storagePath: '',
        };
      },
    },
  });
  const manifest = await createFixtureManifest(setup, 1);
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /transaction tickets invariant 失敗：tickets 0\/web 含重複 ticket.id/,
  );
  assert.equal(setup.bucket.deleteCalls.length, 0);
  assert.equal(getTicketPath(setup.database, '0'), manifest.entries[0].beforeStoragePath);
});

test('finalize rejects a sibling canonical path whose namespace mismatches its own ticket id', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.database.data.rooms[ROOM_ID].tickets.sibling = {
    id: 'sibling-ticket',
    url: '',
    storagePath: destinationPath('different-ticket', 'sibling.png'),
  };
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /canonical storagePath 與自身 id 不一致/,
  );
  assert.equal(setup.bucket.deleteCalls.length, 0);
  assert.equal(setup.bucket.objects.has(manifest.entries[0].beforeStoragePath), true);
});

test('RTDB transaction tolerates the Admin SDK initial local null before canonical tickets', async () => {
  const setup = fixture({
    count: 1,
    databaseOptions: { initialNullTransaction: true },
  });
  const manifest = await createFixtureManifest(setup, 1);
  await applyRepairManifest(phaseInput(setup, manifest));
  assert.equal(getTicketPath(setup.database, '0'), manifest.entries[0].afterStoragePath);
  assert.equal(setup.database.transactionCount, 1);
});

test('apply rejects source generation drift recorded after planning', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  setup.bucket.objects.get(manifest.entries[0].beforeStoragePath).generation = 'changed-generation';
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /generation.*manifest/,
  );
  assert.equal(setup.database.transactionCount, 0);
});

test('apply rejects unheld source metageneration drift without a repair hold marker', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  setup.bucket.objects.get(manifest.entries[0].beforeStoragePath).metageneration = '3';
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /無可信任 temporaryHold 證明/,
  );
  assert.equal(setup.database.transactionCount, 0);
});

test('apply refuses to claim a pre-held source without this manifest ownership marker', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  const source = setup.bucket.objects.get(entry.beforeStoragePath);
  source.temporaryHold = true;
  source.metageneration = String(Number(source.metageneration) + 1);
  await assert.rejects(
    () => applyRepairManifest(phaseInput(setup, manifest)),
    /foreign temporaryHold/,
  );
  assert.equal(setup.bucket.copyCalls.length, 0);
  assert.equal(setup.database.transactionCount, 0);
  assert.equal(source.temporaryHold, true);
});

test('finalize refuses to claim or clear a pre-held destination owned by another process', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  const destination = setup.bucket.objects.get(entry.afterStoragePath);
  destination.temporaryHold = true;
  destination.metageneration = String(Number(destination.metageneration) + 1);
  destination.metadata.travelAppTicketPathRepairDestinationHoldRunId = 'foreign-process';
  destination.metadata.travelAppTicketPathRepairDestinationHoldState = 'held';
  const sourceDeleteCount = setup.bucket.deleteCalls.length;
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /foreign temporaryHold/,
  );
  assert.equal(setup.bucket.deleteCalls.length, sourceDeleteCount);
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), true);
  assert.equal(destination.temporaryHold, true);
});

test('finalize requires destination RTDB state, deletes exact source generations, and is retry-safe', async () => {
  const setup = fixture({ count: 2 });
  const manifest = await createFixtureManifest(setup, 2);
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /storagePath 發生漂移/,
  );
  assert.equal(setup.bucket.deleteCalls.length, 0);

  await applyRepairManifest(phaseInput(setup, manifest));
  await finalizeRepairManifest(phaseInput(setup, manifest));
  assert.deepEqual(
    setup.bucket.deleteCalls.map(({ generation }) => generation),
    manifest.entries.map(({ source }) => source.generation),
  );
  for (const entry of manifest.entries) {
    assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), false);
    assert.equal(setup.bucket.objects.has(entry.afterStoragePath), true);
    assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);
    assert.equal(setup.bucket.objects.get(entry.afterStoragePath).temporaryHold, false);
    const holdOnIndex = setup.events.indexOf(`hold:on:${entry.afterStoragePath}`);
    const deleteIndex = setup.events.indexOf(`delete:${entry.beforeStoragePath}`);
    const holdOffIndex = setup.events.indexOf(`hold:off:${entry.afterStoragePath}`);
    assert.ok(holdOnIndex >= 0 && holdOnIndex < deleteIndex);
    assert.ok(deleteIndex < holdOffIndex);
  }

  const deleteCount = setup.bucket.deleteCalls.length;
  await finalizeRepairManifest(phaseInput(setup, manifest));
  assert.equal(setup.bucket.deleteCalls.length, deleteCount);
  await assert.rejects(
    () => rollbackRepairManifest(phaseInput(setup, manifest)),
    /malformed object inventory|source Storage object 不存在/,
  );
});

test('finalize hold release failure is retry-safe and never removes the protected destination', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.bucket.failHoldReleaseFor = entry.afterStoragePath;

  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /simulated hold release failure/,
  );
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), false);
  assert.equal(setup.bucket.objects.get(entry.afterStoragePath).temporaryHold, true);
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);

  setup.bucket.failHoldReleaseFor = '';
  await finalizeRepairManifest(phaseInput(setup, manifest));
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), false);
  assert.equal(setup.bucket.objects.get(entry.afterStoragePath).temporaryHold, false);
});

test('rollback recovers a failed finalize by holding sources before releasing held destinations', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.bucket.failDeleteFor = entry.beforeStoragePath;
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /simulated delete failure/,
  );
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), true);
  assert.equal(setup.bucket.objects.get(entry.afterStoragePath).temporaryHold, true);

  setup.bucket.failDeleteFor = '';
  await rollbackRepairManifest(phaseInput(setup, manifest));
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.beforeStoragePath);
  assert.equal(setup.bucket.objects.has(entry.afterStoragePath), false);
  assert.equal(setup.bucket.objects.get(entry.beforeStoragePath).temporaryHold, false);
  const sourceHoldIndex = setup.events.lastIndexOf(`hold:on:${entry.beforeStoragePath}`);
  const destinationReleaseIndex = setup.events.lastIndexOf(`hold:off:${entry.afterStoragePath}`);
  const destinationDeleteIndex = setup.events.lastIndexOf(`delete:${entry.afterStoragePath}`);
  assert.ok(sourceHoldIndex >= 0 && sourceHoldIndex < destinationReleaseIndex);
  assert.ok(destinationReleaseIndex < destinationDeleteIndex);
});

test('rollback fails closed without releasing held destinations if finalize removed any source', async () => {
  const setup = fixture({ count: 2 });
  const manifest = await createFixtureManifest(setup, 2);
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.bucket.failDeleteFor = manifest.entries[1].beforeStoragePath;
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /simulated delete failure/,
  );
  assert.equal(setup.bucket.objects.has(manifest.entries[0].beforeStoragePath), false);
  assert.equal(setup.bucket.objects.has(manifest.entries[1].beforeStoragePath), true);
  const destinationDeleteCount = setup.bucket.deleteCalls.filter(
    ({ name }) => manifest.entries.some((entry) => entry.afterStoragePath === name),
  ).length;
  await assert.rejects(
    () => rollbackRepairManifest(phaseInput(setup, manifest)),
    /malformed object inventory/,
  );
  assert.equal(
    setup.bucket.deleteCalls.filter(
      ({ name }) => manifest.entries.some((entry) => entry.afterStoragePath === name),
    ).length,
    destinationDeleteCount,
  );
  for (const entry of manifest.entries) {
    assert.equal(setup.bucket.objects.get(entry.afterStoragePath).temporaryHold, true);
  }
});

test('finalize rechecks Firestore owner ACL before deleting any source', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.firestore.documents
    .get(`tripAccess/${ROOM_ID}/members/${OWNER_UID}`).status = 'removed';
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /Firestore ACL mirror/,
  );
  assert.equal(setup.bucket.deleteCalls.length, 0);
  assert.equal(setup.bucket.objects.has(manifest.entries[0].beforeStoragePath), true);
});

test('rollback before finalize atomically restores RTDB then deletes destinations and is retry-safe', async () => {
  const setup = fixture({ count: 2 });
  const manifest = await createFixtureManifest(setup, 2);
  await applyRepairManifest(phaseInput(setup, manifest));
  const destinationGenerations = manifest.entries.map(
    (entry) => setup.bucket.objects.get(entry.afterStoragePath).generation,
  );
  await rollbackRepairManifest(phaseInput(setup, manifest));
  for (const entry of manifest.entries) {
    assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.beforeStoragePath);
    assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), true);
    assert.equal(setup.bucket.objects.has(entry.afterStoragePath), false);
  }
  assert.deepEqual(
    setup.bucket.deleteCalls.slice(-2).map(({ generation }) => generation),
    destinationGenerations,
  );

  const deleteCount = setup.bucket.deleteCalls.length;
  await rollbackRepairManifest(phaseInput(setup, manifest));
  assert.equal(setup.bucket.deleteCalls.length, deleteCount);

  await applyRepairManifest(phaseInput(setup, manifest));
  for (const entry of manifest.entries) {
    assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);
    assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), true);
    assert.equal(setup.bucket.objects.has(entry.afterStoragePath), true);
  }
});

test('failed rollback leaves held sources that re-apply and finalize can safely recover', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.bucket.failDeleteFor = entry.afterStoragePath;
  await assert.rejects(
    () => rollbackRepairManifest(phaseInput(setup, manifest)),
    /simulated delete failure/,
  );
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.beforeStoragePath);
  assert.equal(setup.bucket.objects.get(entry.beforeStoragePath).temporaryHold, true);
  assert.equal(setup.bucket.objects.has(entry.afterStoragePath), true);

  setup.bucket.failDeleteFor = '';
  await applyRepairManifest(phaseInput(setup, manifest));
  await finalizeRepairManifest(phaseInput(setup, manifest));
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), false);
  assert.equal(setup.bucket.objects.get(entry.afterStoragePath).temporaryHold, false);
});

test('rollback source hold release failure is retry-safe after destination deletion', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.bucket.failHoldReleaseFor = entry.beforeStoragePath;
  await assert.rejects(
    () => rollbackRepairManifest(phaseInput(setup, manifest)),
    /simulated hold release failure/,
  );
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.beforeStoragePath);
  assert.equal(setup.bucket.objects.has(entry.afterStoragePath), false);
  assert.equal(setup.bucket.objects.get(entry.beforeStoragePath).temporaryHold, true);

  setup.bucket.failHoldReleaseFor = '';
  await rollbackRepairManifest(phaseInput(setup, manifest));
  assert.equal(setup.bucket.objects.get(entry.beforeStoragePath).temporaryHold, false);
  assert.equal(setup.bucket.objects.has(entry.afterStoragePath), false);
});

test('re-apply rebuilds an unheld destination from a held source, then finalize succeeds', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  setup.bucket.failHoldReleaseFor = entry.beforeStoragePath;
  await assert.rejects(
    () => rollbackRepairManifest(phaseInput(setup, manifest)),
    /simulated hold release failure/,
  );
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.beforeStoragePath);
  assert.equal(setup.bucket.objects.get(entry.beforeStoragePath).temporaryHold, true);
  assert.equal(setup.bucket.objects.has(entry.afterStoragePath), false);

  setup.bucket.failHoldReleaseFor = '';
  const copyCount = setup.bucket.copyCalls.length;
  await applyRepairManifest(phaseInput(setup, manifest));
  assert.equal(setup.bucket.copyCalls.length, copyCount + 1);
  assert.equal(setup.bucket.copyCalls.at(-1).options.temporaryHold, false);
  const rebuiltDestination = setup.bucket.objects.get(entry.afterStoragePath);
  assert.equal(rebuiltDestination.temporaryHold, true);
  assert.equal(
    rebuiltDestination.metadata.travelAppTicketPathRepairDestinationHoldRunId,
    manifest.runId,
  );
  assert.equal(
    rebuiltDestination.metadata.travelAppTicketPathRepairDestinationHoldState,
    'held',
  );

  await finalizeRepairManifest(phaseInput(setup, manifest));
  assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), false);
  const finalizedDestination = setup.bucket.objects.get(entry.afterStoragePath);
  assert.equal(finalizedDestination.temporaryHold, false);
  assert.equal(
    finalizedDestination.metadata.travelAppTicketPathRepairDestinationHoldState,
    'released',
  );
});

test('source released by this run is foreign if an external process re-holds it later', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  await rollbackRepairManifest(phaseInput(setup, manifest));
  const source = setup.bucket.objects.get(entry.beforeStoragePath);
  assert.equal(source.temporaryHold, false);
  assert.equal(source.metadata.travelAppTicketPathRepairHoldState, 'released');

  source.temporaryHold = true;
  source.metageneration = String(Number(source.metageneration) + 1);
  const deleteCount = setup.bucket.deleteCalls.length;
  await assert.rejects(
    () => rollbackRepairManifest(phaseInput(setup, manifest)),
    /foreign temporaryHold/,
  );
  assert.equal(source.temporaryHold, true);
  assert.equal(setup.bucket.deleteCalls.length, deleteCount);
});

test('destination released by this run is foreign if an external process re-holds it later', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  await applyRepairManifest(phaseInput(setup, manifest));
  await finalizeRepairManifest(phaseInput(setup, manifest));
  const destination = setup.bucket.objects.get(entry.afterStoragePath);
  assert.equal(destination.temporaryHold, false);
  assert.equal(
    destination.metadata.travelAppTicketPathRepairDestinationHoldState,
    'released',
  );

  destination.temporaryHold = true;
  destination.metageneration = String(Number(destination.metageneration) + 1);
  const deleteCount = setup.bucket.deleteCalls.length;
  await assert.rejects(
    () => finalizeRepairManifest(phaseInput(setup, manifest)),
    /foreign temporaryHold/,
  );
  assert.equal(destination.temporaryHold, true);
  assert.equal(setup.bucket.deleteCalls.length, deleteCount);
});

test('room lease rejects an interleaved rollback before finalize performs any deletion', async () => {
  let signalDeleteEntered;
  let releaseDelete;
  const deleteEntered = new Promise((resolve) => { signalDeleteEntered = resolve; });
  const deleteBarrier = new Promise((resolve) => { releaseDelete = resolve; });
  let paused = false;
  let deleteTarget = '';
  const setup = fixture({
    count: 1,
    bucketOptions: {
      async beforeDelete({ name }) {
        if (!paused && name === deleteTarget) {
          paused = true;
          signalDeleteEntered();
          await deleteBarrier;
        }
      },
    },
  });
  const manifest = await createFixtureManifest(setup, 1);
  const [entry] = manifest.entries;
  deleteTarget = entry.beforeStoragePath;
  await applyRepairManifest({
    ...phaseInput(setup, manifest),
    leaseInvocationId: 'apply-invocation',
  });

  const finalizePromise = finalizeRepairManifest({
    ...phaseInput(setup, manifest),
    leaseInvocationId: 'finalize-invocation',
  });
  await deleteEntered;
  try {
    await assert.rejects(
      () => rollbackRepairManifest({
        ...phaseInput(setup, manifest),
        leaseInvocationId: 'rollback-invocation',
      }),
      /已有 repair lease/,
    );
    assert.equal(setup.bucket.deleteCalls.length, 0);
    assert.equal(getTicketPath(setup.database, entry.ticketKey), entry.afterStoragePath);
    assert.equal(
      readAtPath(
        setup.database.data,
        `maintenanceRepairs/legacyTicketPath/${ROOM_ID}`,
      ).phase,
      'finalize',
    );
  } finally {
    releaseDelete();
  }
  await finalizePromise;
  assert.equal(
    readAtPath(setup.database.data, `maintenanceRepairs/legacyTicketPath/${ROOM_ID}`),
    null,
  );
  assert.equal(setup.bucket.objects.has(entry.beforeStoragePath), false);
});

test('matching active room lease cannot be taken over by another invocation or phase', async () => {
  const setup = fixture({ count: 1 });
  const manifest = await createFixtureManifest(setup, 1);
  const leasePath = `maintenanceRepairs/legacyTicketPath/${ROOM_ID}`;
  writeAtPath(setup.database.data, leasePath, {
    version: 1,
    operation: 'legacy-ticket-storage-path-repair',
    roomId: ROOM_ID,
    runId: manifest.runId,
    manifestSha256: sha256Hex(serializeRepairManifest(manifest)),
    phase: 'finalize',
    invocationId: 'crashed-finalize-invocation',
    acquiredAt: '2026-08-31T09:00:00.000Z',
  });

  await assert.rejects(
    () => applyRepairManifest({
      ...phaseInput(setup, manifest),
      leaseInvocationId: 'blocked-apply-invocation',
    }),
    /已有 repair lease/,
  );
  await assert.rejects(
    () => finalizeRepairManifest({
      ...phaseInput(setup, manifest),
      leaseInvocationId: 'blocked-finalize-invocation',
    }),
    /已有 repair lease/,
  );
  assert.equal(setup.bucket.copyCalls.length, 0);
  assert.equal(readAtPath(setup.database.data, leasePath).invocationId, (
    'crashed-finalize-invocation'
  ));
});

test('operation and lease release failures are both visible in the top-level error', async () => {
  const setup = fixture({
    count: 1,
    databaseOptions: {
      beforeLeaseTransaction(database, path, count) {
        if (count !== 2) return;
        readAtPath(database.data, path).invocationId = 'foreign-lease-after-failure';
      },
    },
  });
  const manifest = await createFixtureManifest(setup, 1);
  setup.bucket.objects.get(manifest.entries[0].beforeStoragePath).generation = 'drifted';

  await assert.rejects(
    () => applyRepairManifest({
      ...phaseInput(setup, manifest),
      leaseInvocationId: 'failing-apply-invocation',
    }),
    (error) => {
      assert.match(error.message, /generation.*manifest/);
      assert.match(error.message, /repair lease release failure\/stale lease warning/);
      assert.match(error.message, /ownership.*漂移/);
      return true;
    },
  );
  assert.equal(
    readAtPath(
      setup.database.data,
      `maintenanceRepairs/legacyTicketPath/${ROOM_ID}`,
    ).invocationId,
    'foreign-lease-after-failure',
  );
});

test('CLI defaults to plan and write phases require exact target/count/SHA confirmations', () => {
  const base = [
    '--project', PROJECT_ID,
    '--database-url', DATABASE_URL,
    '--storage-bucket', STORAGE_BUCKET,
    '--room-id', ROOM_ID,
    '--expected-count', '3',
    '--manifest', 'legacy-ticket-path-repair.production.local.json',
  ];
  assert.equal(parseRepairCli(base).phase, 'plan');
  assert.throws(
    () => parseRepairCli([
      ...base.slice(0, -1),
      'repair-plan.json',
    ]),
    /legacy-ticket-path-repair\*\.local\.json/,
  );
  assert.throws(() => parseRepairCli([...base, '--apply']), /confirm-project/);
  assert.throws(() => parseRepairCli([
    ...base,
    '--apply',
    '--finalize',
  ]), /只能擇一/);

  const confirmations = [
    '--confirm-project', PROJECT_ID,
    '--confirm-storage-bucket', STORAGE_BUCKET,
    '--confirm-room-id', ROOM_ID,
    '--confirm-count', '3',
    '--confirm-manifest-sha256', 'a'.repeat(64),
  ];
  const apply = parseRepairCli([...base, '--apply', ...confirmations]);
  assert.equal(apply.phase, 'apply');
  assert.equal(apply.expectedCount, 3);
  assert.equal(apply.manifestSha256, 'a'.repeat(64));
  assert.throws(
    () => parseRepairCli([...base, '--apply', ...confirmations, '--recover-lease']),
    /recover-lease/,
  );
  assert.throws(
    () => parseRepairCli([
      ...base,
      '--confirm-lease-invocation-id', 'not-valid-in-plan',
    ]),
    /confirm-lease-invocation-id/,
  );
  assert.throws(() => parseRepairCli([
    ...base,
    '--rollback',
    ...confirmations.filter((value, index) => (
      confirmations[index - 1] !== '--confirm-count' && value !== '--confirm-count'
    )),
    '--confirm-count', '2',
  ]), /confirm-count/);
});
