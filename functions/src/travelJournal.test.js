import assert from 'node:assert/strict';
import test from 'node:test';
import { createTravelJournalService } from './travelJournal.js';
import { createCollaborationService } from './collaboration.js';

const auth = (uid = 'alice') => ({ uid, token: { firebase: { sign_in_provider: 'google.com' } } });
const meta = { title: '京都', destination: '日本', destLat: 35, destLng: 135, startDate: '2026-01-01', endDate: '2026-01-02', members: ['自己'] };
const member = (uid) => ({ uid, role: 'owner', status: 'active', aclVersion: 1 });
const visitId = 'Day%201~p%2E1';
const source = () => ({ meta: structuredClone(meta), itinerary: { 'Day 1': [{ id: 'p.1', name: '寺院', lat: 35, lng: 135, memo: '早上去', time: '09:00', stayTime: '60', completed: true, photos: ['https://private'], resources: [{ storagePath: 'rooms/source/file' }], cost: 999 }], 'Day 2': [{ id: 'p2', name: '博物館' }] }, expenses: [{ cost: 999 }], tickets: [{ url: 'private' }], checklist: { done: true } });
const request = (overrides = {}) => ({ roomId: 'source', revision: 0, archived: true, note: '', visits: {}, firsts: {}, ...overrides });
const decision = (overrides = {}) => ({ status: 'visited', city: '日本・京都', note: '', ...overrides });
const rejectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);

class MemoryDatabase {
  constructor() {
    this.state = { rooms: { source: source() }, roomAccess: { source: { ownerUid: 'alice', state: 'ready', members: { alice: member('alice'), bob: member('bob') } } } };
    this.writes = [];
    this.beforeGet = null;
    this.beforeTransaction = null;
  }
  value(path) {
    return path.split('/').filter(Boolean).reduce((value, key) => value?.[key], this.state) ?? null;
  }
  assign(path, value) {
    const parts = path.split('/').filter(Boolean);
    let target = this.state;
    for (const key of parts.slice(0, -1)) target = target[key] ||= {};
    if (value === null) delete target[parts.at(-1)];
    else target[parts.at(-1)] = structuredClone(value);
  }
  snapshot(value) { return { val: () => structuredClone(value), exists: () => value !== null }; }
  ref(path = '') {
    return {
      get: async () => { if (this.beforeGet) await this.beforeGet(path); return this.snapshot(this.value(path)); },
      transaction: async (callback) => {
        if (this.beforeTransaction) await this.beforeTransaction(path);
        const value = callback(structuredClone(this.value(path)));
        if (value !== undefined) this.assign(path, value);
        return { committed: value !== undefined, snapshot: this.snapshot(this.value(path)) };
      },
      update: async (updates) => {
        if (this.beforeUpdate) await this.beforeUpdate(path, updates);
        this.writes.push(structuredClone(updates));
        for (const [key, value] of Object.entries(updates)) this.assign([path, key].filter(Boolean).join('/'), value);
        if (this.afterUpdate) await this.afterUpdate(path, updates);
      },
      set: async (value) => this.assign(path, value),
      remove: async () => this.assign(path, null),
    };
  }
}
const fixture = () => {
  const database = new MemoryDatabase();
  const firestore = {};
  const collaborationService = createCollaborationService({ database, firestore, clock: () => 1000 });
  return { database, service: createTravelJournalService({ database, collaborationService, clock: () => 1000 }) };
};

test('requires Google identity and active canonical membership for new memories', async () => {
  const { service, database } = fixture();
  await rejectCode(service.saveTravelMemory(request(), null), 'unauthenticated');
  await rejectCode(service.saveTravelMemory(request(), { uid: 'alice', token: { firebase: { sign_in_provider: 'anonymous' } } }), 'permission-denied');
  await rejectCode(service.saveTravelMemory(request(), auth('outsider')), 'permission-denied');
  database.state.roomAccess.source.state = 'deleting';
  await rejectCode(service.saveTravelMemory(request(), auth()), 'permission-denied');
});

test('archives only caller account and never infers visited places', async () => {
  const { service, database } = fixture();
  const { memory } = await service.saveTravelMemory(request({ uid: 'bob', note: '下雪', firsts: { snow: '第一次看雪' } }), auth());
  assert.deepEqual(memory.visits, {});
  assert.equal(memory.title, meta.title);
  assert.equal(memory.archivedAt, 1000);
  assert.equal(memory.revision, 1);
  assert.equal(database.value('personalTravel/bob'), null);
  assert.equal(database.value('roomAccess/source/members/bob/status'), 'active');
});

test('enforces explicit revisions, object bounds and canonical first labels', async () => {
  const { service } = fixture();
  for (const patch of [{ revision: undefined }, { revision: -1 }, { archived: 'yes' }, { visits: [] }, { note: 'x'.repeat(3001) }, { firsts: { arbitrary: '章' } }, { firsts: { solo: '假的' } }]) {
    await rejectCode(service.saveTravelMemory(request(patch), auth()), 'invalid-argument');
  }
  await service.saveTravelMemory(request(), auth());
  await rejectCode(service.saveTravelMemory(request(), auth()), 'aborted');
  const { memory } = await service.saveTravelMemory(request({ revision: 1, archived: false }), auth());
  assert.equal(memory.revision, 2);
  assert.equal(memory.archived, false);
});

test('visit IDs are sourced and coordinates, name, day and date ignore spoofed fields', async () => {
  const { service } = fixture();
  await rejectCode(service.saveTravelMemory(request({ visits: { invented: decision() } }), auth()), 'invalid-argument');
  await rejectCode(service.saveTravelMemory(request({ visits: { [visitId]: decision({ city: '' }) } }), auth()), 'invalid-argument');
  const { memory } = await service.saveTravelMemory(request({ visits: { [visitId]: decision({ name: '假的', lat: 0, lng: 0, dayId: 'Day 30', date: '1900-01-01' }) } }), auth());
  assert.deepEqual(memory.visits[visitId], { dayId: 'Day 1', itemId: 'p.1', name: '寺院', date: '2026-01-01', lat: 35, lng: 135, ...decision() });
});

test('missing coordinates remain absent and status does not default to visited', async () => {
  const { service } = fixture();
  await rejectCode(service.saveTravelMemory(request({ visits: { 'Day%202~p2': { city: '京都' } } }), auth()), 'invalid-argument');
  const { memory } = await service.saveTravelMemory(request({ visits: { 'Day%202~p2': decision({ status: 'wishlist', city: '' }) } }), auth());
  assert.equal(memory.visits['Day%202~p2'].lat, null);
  assert.equal(memory.visits['Day%202~p2'].status, 'wishlist');
});

test('saved personal memories survive source deletion but cannot add invented visits', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ visits: { [visitId]: decision() } }), auth());
  delete database.state.rooms.source;
  delete database.state.roomAccess.source;
  const { memory } = await service.saveTravelMemory(request({ revision: 1, note: '保留', visits: { [visitId]: decision({ name: '假的', lat: 0 }) } }), auth());
  assert.equal(memory.visits[visitId].name, '寺院');
  assert.equal(memory.visits[visitId].lat, 35);
  assert.equal(memory.note, '保留');
  assert.equal(memory.archived, true);
  await rejectCode(service.saveTravelMemory(request({ revision: 2, visits: { invented: decision() } }), auth()), 'invalid-argument');
});

test('inaccessible archived note-only memories cannot be restored out of the reachable archive', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ note: '留下這段旅行' }), auth());
  database.state.roomAccess.source.members.alice.status = 'removed';
  const previous = structuredClone(database.value('personalTravel/alice/memories/source'));
  await rejectCode(service.saveTravelMemory(request({ revision: 1, archived: false, note: 'must not overwrite' }), auth()), 'failed-precondition');
  assert.deepEqual(database.value('personalTravel/alice/memories/source'), previous);
  const { memory } = await service.saveTravelMemory(request({ revision: 1, note: '可以繼續編輯' }), auth());
  assert.equal(memory.archived, true);
  assert.equal(memory.note, '可以繼續編輯');
});

test('restore checks the final source ACL after reading the personal account', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ note: '保留' }), auth());
  const previous = structuredClone(database.value('personalTravel/alice/memories/source'));
  database.beforeGet = async (path) => {
    if (path === 'personalTravel/alice') database.state.roomAccess.source.members.alice.status = 'removed';
  };
  await rejectCode(service.saveTravelMemory(request({ revision: 1, archived: false }), auth()), 'failed-precondition');
  assert.deepEqual(database.value('personalTravel/alice/memories/source'), previous);
});

test('revoked source is never read while retained personal decisions remain editable', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ visits: { [visitId]: decision() } }), auth());
  database.state.roomAccess.source.members.alice.status = 'removed';
  database.beforeGet = async (path) => assert.notEqual(path, 'rooms/source', 'revoked trip data must never be read');
  const { memory } = await service.saveTravelMemory(request({ revision: 1, note: '我的回憶', visits: { [visitId]: decision({ status: 'missed' }) } }), auth());
  assert.equal(memory.note, '我的回憶');
  assert.equal(memory.visits[visitId].status, 'missed');
});

test('all mutations require identity and reject excessive visits or malformed linked items', async () => {
  const { service } = fixture();
  await rejectCode(service.saveTravelCollection({}, null), 'unauthenticated');
  await rejectCode(service.cloneMemoryTrip({}, null), 'unauthenticated');
  await rejectCode(service.saveTravelMemory(request({ visits: Object.fromEntries(Array.from({ length: 1001 }, (_, n) => [`v${n}`, decision()])) }), auth()), 'invalid-argument');
  await rejectCode(service.saveTravelCollection({ id: 'x', revision: 0, title: '清單', items: { a: [] }, deleted: false }, auth()), 'invalid-argument');
  for (const id of ['bad\u0000', 'bad\u007f', '[bad]', 'x'.repeat(769), '字'.repeat(257)]) {
    await rejectCode(service.saveTravelCollection({ id, revision: 0, title: '清單', items: {}, deleted: false }, auth()), 'invalid-argument');
  }
});

test('rechecks source membership after reading itinerary', async () => {
  const { service, database } = fixture();
  database.beforeGet = async (path) => { if (path === 'rooms/source') database.state.roomAccess.source.members.alice.status = 'removed'; };
  await rejectCode(service.saveTravelMemory(request(), auth()), 'permission-denied');
  assert.equal(database.value('personalTravel/alice'), null);
});

test('rechecks source access after account read before creating personal snapshot', async () => {
  const { service, database } = fixture();
  database.beforeGet = async (path) => { if (path === 'personalTravel/alice') database.state.roomAccess.source.members.alice.status = 'removed'; };
  await rejectCode(service.saveTravelMemory(request(), auth()), 'permission-denied');
  assert.equal(database.value('personalTravel/alice'), null);
});

test('account transaction tolerates speculative local null without losing saved records', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request(), auth());
  const originalRef = database.ref.bind(database);
  database.ref = (path) => {
    const reference = originalRef(path);
    if (path !== 'personalTravel/alice') return reference;
    const transaction = reference.transaction;
    return { ...reference, transaction: async (callback, ...args) => {
      assert.equal(callback(null), null, 'local null must perform a compare-and-retry');
      return transaction(callback, ...args);
    } };
  };
  const { collection } = await service.saveTravelCollection({ id: 'next', revision: 0, title: '下次', items: {}, deleted: false }, auth());
  assert.equal(collection.revision, 1);
  assert.equal(database.value('personalTravel/alice/memories/source/revision'), 1);
});

test('revision comparison is inside transaction so simultaneous memory changes cannot overwrite', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request(), auth());
  database.beforeTransaction = async (path) => {
    if (path === 'personalTravel/alice') database.state.personalTravel.alice.memories.source.revision = 2;
  };
  await rejectCode(service.saveTravelMemory(request({ revision: 1, note: 'stale' }), auth()), 'aborted');
  assert.equal(database.value('personalTravel/alice/memories/source/note'), '');
});

test('collections validate caller-owned visited links and revision tombstones', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ visits: { [visitId]: decision() } }), auth());
  const base = { id: 'temples', revision: 0, title: '寺院', items: { a: { name: '寺院', city: '京都', roomId: 'source', visitId } }, deleted: false };
  await rejectCode(service.saveTravelCollection(base, auth('bob')), 'invalid-argument');
  await rejectCode(service.saveTravelCollection({ ...base, items: { a: { name: '寺院', roomId: 'source' } } }, auth()), 'invalid-argument');
  const { collection } = await service.saveTravelCollection(base, auth());
  assert.equal(collection.revision, 1);
  await rejectCode(service.saveTravelCollection(base, auth()), 'aborted');
  const removed = await service.saveTravelCollection({ ...base, revision: 1, deleted: true }, auth());
  assert.equal(removed.collection.deleted, true);
  assert.equal(database.value('personalTravel/alice/collections/temples/revision'), 2);
});

test('collections accept wishlist text but reject wishlist visit links and unsafe keys', async () => {
  const { service } = fixture();
  await service.saveTravelMemory(request({ visits: { [visitId]: decision({ status: 'wishlist' }) } }), auth());
  const base = { id: 'next', revision: 0, title: '下次', items: { a: { name: '寺院', city: '京都' } }, deleted: false };
  assert.equal((await service.saveTravelCollection(base, auth())).collection.items.a.name, '寺院');
  await rejectCode(service.saveTravelCollection({ ...base, id: 'linked', items: { a: { name: '寺院', city: '京都', roomId: 'source', visitId } } }, auth()), 'invalid-argument');
  await rejectCode(service.saveTravelCollection({ ...base, id: '../other' }, auth()), 'invalid-argument');
  await rejectCode(service.saveTravelCollection({ ...base, id: 'oversize', items: Object.fromEntries(Array.from({ length: 201 }, (_, n) => [`p${n}`, { name: 'a' }])) }, auth()), 'invalid-argument');
});

test('collection links are checked inside account transaction against concurrent visit changes', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ visits: { [visitId]: decision() } }), auth());
  database.beforeTransaction = async (path) => {
    if (path === 'personalTravel/alice') database.state.personalTravel.alice.memories.source.visits[visitId].status = 'missed';
  };
  await rejectCode(service.saveTravelCollection({ id: 'x', revision: 0, title: '寺院', items: { a: { name: '寺院', city: '京都', roomId: 'source', visitId } }, deleted: false }, auth()), 'invalid-argument');
});

test('clone publishes only sanitized itinerary atomically with ready room and supports owned retry', async () => {
  const { service, database } = fixture();
  const payload = { sourceRoomId: 'source', roomId: 'new-room', meta: { ...meta, startDate: '2027-01-01', endDate: '2027-01-02' } };
  database.beforeUpdate = async (_path, updates) => {
    if (!updates['rooms/new-room']) return;
    assert.equal(database.value('roomAccess/new-room/members/alice'), null);
    assert.equal(database.value('userTrips/alice/new-room'), null);
    assert.equal(updates['roomAccess/new-room/members/alice'].status, 'active');
    assert.equal(updates['roomAccess/new-room/state'], 'ready');
    assert.equal(updates['userTrips/alice/new-room'].status, 'active');
  };
  const result = await service.cloneMemoryTrip(payload, auth());
  assert.equal(result.roomId, 'new-room');
  const room = database.value('rooms/new-room');
  assert.deepEqual(room.itinerary['Day 1'], [{ id: 'p.1', name: '寺院', lat: 35, lng: 135, memo: '早上去', time: '09:00', stayTime: '60' }]);
  assert.deepEqual(room.expenses, []);
  assert.deepEqual(room.tickets, []);
  assert.deepEqual(room.checklist, {});
  assert.equal(room.meta.ownerUid, 'alice');
  assert.ok(database.writes.some((write) => write['rooms/new-room']?.itinerary['Day 1']?.length && write['roomAccess/new-room/state'] === 'ready'));
  assert.equal((await service.cloneMemoryTrip(payload, auth())).roomId, 'new-room');
  await rejectCode(service.cloneMemoryTrip(payload, auth('bob')), 'already-exists');
  assert.deepEqual(database.value('rooms/source'), source());
});

test('clone rejects inaccessible source, collisions and dates shorter than source', async () => {
  const { service, database } = fixture();
  const base = { sourceRoomId: 'source', roomId: 'new', meta };
  await rejectCode(service.cloneMemoryTrip(base, auth('outsider')), 'permission-denied');
  await rejectCode(service.cloneMemoryTrip({ ...base, roomId: 'source' }, auth()), 'already-exists');
  await rejectCode(service.cloneMemoryTrip({ ...base, meta: { ...meta, endDate: meta.startDate } }, auth()), 'invalid-argument');
  database.state.rooms.new = { meta: { ownerUid: 'alice' } };
  await rejectCode(service.cloneMemoryTrip(base, auth()), 'already-exists');
});

test('clone preserves current planning transport modes and minutes without obsolete aliases', async () => {
  const { service, database } = fixture();
  const supported = ['AUTO', 'DRIVE', 'WALK', 'TRAIN', 'TRANSIT', 'FLIGHT'];
  const rejected = ['WALKING', 'DRIVING', 'BICYCLING', 'CUSTOM', 'ERROR'];
  database.state.rooms.source.itinerary = { 'Day 1': [
    ...supported.map((mode, index) => ({ id: `current-${mode}`, name: mode, nextLeg: { mode, mins: index + 15 } })),
    ...rejected.map((mode) => ({ id: `obsolete-${mode}`, name: mode, nextLeg: { mode, mins: 30 } })),
    { id: 'negative', name: 'invalid', nextLeg: { mode: 'WALK', mins: -1 } },
    { id: 'too-long', name: 'invalid', nextLeg: { mode: 'FLIGHT', mins: 1441 } },
  ] };
  await service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'transport', meta }, auth());
  const places = database.value('rooms/transport/itinerary/Day 1');
  supported.forEach((mode, index) => assert.deepEqual(places[index].nextLeg, { mode, mins: index + 15 }));
  places.slice(supported.length).forEach((place) => assert.equal(place.nextLeg, undefined));
});

test('confirmed failed clone publication permits a fresh attempt without releasing old reservation', async () => {
  const { service, database } = fixture();
  const payload = { sourceRoomId: 'source', roomId: 'failed-clone', meta };
  database.beforeUpdate = async (path, updates) => {
    if (!updates['rooms/failed-clone']) return;
    database.beforeUpdate = null;
    throw new Error('Publication rejected before commit');
  };
  const unpublished = (error) => error.code === 'failed-precondition' && error.details?.reason === 'clone-attempt-not-published';
  await assert.rejects(service.cloneMemoryTrip(payload, auth()), unpublished);
  assert.equal(database.value('rooms/failed-clone'), null);
  assert.equal(database.value('roomAccess/failed-clone/state'), 'failed');
  const reservation = structuredClone(database.value('roomReservations/failed-clone'));
  assert.ok(reservation.creationId);
  await assert.rejects(service.cloneMemoryTrip(payload, auth()), unpublished);
  await rejectCode(service.cloneMemoryTrip(payload, auth('bob')), 'already-exists');
  assert.equal((await service.cloneMemoryTrip({ ...payload, roomId: 'retry-clone' }, auth())).roomId, 'retry-clone');
  assert.deepEqual(database.value('roomReservations/failed-clone'), reservation);
  assert.deepEqual(Object.keys(database.state.rooms).sort(), ['retry-clone', 'source']);
  assert.equal(database.value('userQuotas/alice/createTrip/totalCount'), 1);
});

test('ambiguous after-commit clone failure keeps same ID and cannot create duplicates', async () => {
  const { service, database } = fixture();
  const payload = { sourceRoomId: 'source', roomId: 'committed-clone', meta };
  database.afterUpdate = async (path, updates) => {
    if (!updates['rooms/committed-clone']) return;
    database.afterUpdate = null;
    throw new Error('Connection lost after server committed');
  };
  assert.equal((await service.cloneMemoryTrip(payload, auth())).roomId, 'committed-clone');
  assert.equal((await service.cloneMemoryTrip(payload, auth())).roomId, 'committed-clone');
  assert.deepEqual(Object.keys(database.state.rooms).sort(), ['committed-clone', 'source']);
  assert.equal(database.value('userQuotas/alice/createTrip/totalCount'), 1);
});

test('failed clone retry signal requires matching server-owned reservation identity', async () => {
  const { service, database } = fixture();
  database.state.roomAccess.collision = { ownerUid: 'alice', cloneSourceRoomId: 'source', state: 'failed', creationId: 'original', members: { alice: { ...member('alice'), status: 'removed' } } };
  database.state.roomReservations = { collision: { createdByUid: 'alice', creationId: 'different' } };
  await rejectCode(service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'collision', meta }, auth()), 'already-exists');
  assert.equal(database.value('rooms/collision'), null);
});

test('clone strips protected URLs even from whitelisted text and checks membership before publishing', async () => {
  const { service, database } = fixture();
  database.state.rooms.source.itinerary['Day 1'][0].memo = '參考 https://firebasestorage.googleapis.com/v0/b/private/o/rooms%2Fsource%2Fa?token=secret';
  await service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'safe', meta }, auth());
  assert.equal(database.value('rooms/safe/itinerary/Day 1/0/memo'), null);
  database.beforeTransaction = async (path) => { if (path === 'roomAccess/race') database.state.roomAccess.source.members.alice.status = 'removed'; };
  await rejectCode(service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'race', meta }, auth()), 'permission-denied');
  assert.equal(database.value('rooms/race'), null);
});
