import assert from 'node:assert/strict';
import test from 'node:test';
import { createTravelJournalService } from './travelJournal.js';
import { createCollaborationService } from './collaboration.js';

const auth = (uid = 'alice') => ({ uid, token: { firebase: { sign_in_provider: 'google.com' } } });
const meta = { title: '京都', destination: '日本', destLat: 35, destLng: 135, startDate: '2026-01-01', endDate: '2026-01-02', members: ['自己'] };
const member = (uid) => ({ uid, role: 'owner', status: 'active', aclVersion: 1 });
const visitId = 'Day%201~p%2E1';
const source = () => ({ meta: structuredClone(meta), itinerary: { 'Day 1': [{ id: 'p.1', name: '寺院', lat: 35, lng: 135, memo: '早上去', time: '09:00', stayTime: '60', completed: true, photos: ['https://private'], resources: [{ storagePath: 'rooms/source/file' }], cost: 999 }], 'Day 2': [{ id: 'p2', name: '博物館' }] }, expenses: [{ cost: 999 }], tickets: [{ url: 'private' }], checklist: { done: true } });
const request = (overrides = {}) => ({ roomId: 'source', revision: 0, archived: true, note: '', cities: {}, visits: {}, firsts: {}, ...overrides });
const decision = (overrides = {}) => ({ status: 'visited', city: '日本・京都', note: '', ...overrides });
const rejectCode = (promise, code) => assert.rejects(promise, (error) => error.code === code);
const preserve = (database) => database.assign('travelMemoryArchives/alice/source', {
  summary: { state: 'complete', operationId: 'saved', saved: 0, total: 0 },
  itinerary: structuredClone(database.value('rooms/source/itinerary')),
  operation: { id: 'saved', meta: structuredClone(database.value('rooms/source/meta')) },
});

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

const kyotoCity = { cityId: 'kyoto', city: '京都', country: '日本', cityLat: 35.01, cityLng: 135.76 };
test('an obsolete client cannot clear city confirmations by omitting the cities field', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request({ cities: { kyoto: kyotoCity } }), auth());
  const before = structuredClone(database.value('personalTravel/alice/memories/source'));
  const { cities: _cities, ...outdated } = request({ revision: 1, note: '舊畫面的儲存' });
  await rejectCode(service.saveTravelMemory(outdated, auth()), 'failed-precondition');
  assert.deepEqual(database.value('personalTravel/alice/memories/source'), before);
});
test('city-only confirmations persist privately without inventing attraction visits and survive source removal', async () => {
  const { service, database } = fixture();
  const original = structuredClone(database.value('rooms/source'));
  const { memory } = await service.saveTravelMemory(request({ cities: { kyoto: kyotoCity } }), auth());
  assert.deepEqual(memory.cities, { kyoto: kyotoCity });
  assert.deepEqual(memory.visits, {});
  assert.deepEqual(database.value('rooms/source'), original);
  assert.equal(database.value('personalTravel/bob'), null);
  delete database.state.rooms.source;
  delete database.state.roomAccess.source;
  const saved = await service.saveTravelMemory(request({ revision: 1, cities: memory.cities, note: '保留城市回憶' }), auth());
  assert.deepEqual(saved.memory.cities, memory.cities);
  assert.equal(saved.memory.revision, 2);
  await rejectCode(service.saveTravelMemory(request({ revision: 1, cities: {} }), auth()), 'aborted');
  assert.deepEqual(database.value('personalTravel/alice/memories/source/cities'), { kyoto: kyotoCity });
});

test('city confirmations require complete canonical data and reject aliases, invalid positions and excessive records', async () => {
  const { service } = fixture();
  for (const cities of [[], { alias: kyotoCity }, { kyoto: { ...kyotoCity, city: '' } }, { kyoto: { ...kyotoCity, country: '' } },
    { kyoto: { ...kyotoCity, cityLat: 91 } }, { kyoto: { ...kyotoCity, cityLng: '135' } },
    Object.fromEntries(Array.from({ length: 201 }, (_, index) => [`city${index}`, { ...kyotoCity, cityId: `city${index}` }]))]) {
    await rejectCode(service.saveTravelMemory(request({ cities }), auth()), 'invalid-argument');
  }
});

test('a visited place can remain unassigned without blocking city confirmations or personal notes', async () => {
  const { service } = fixture();
  const { memory } = await service.saveTravelMemory(request({ cities: { kyoto: kyotoCity }, note: '先留下', visits: { [visitId]: decision({ city: '' }) } }), auth());
  assert.deepEqual(memory.cities, { kyoto: kyotoCity });
  assert.equal(memory.visits[visitId].city, '');
  assert.equal(memory.visits[visitId].status, 'visited');
  assert.equal(memory.note, '先留下');
});

test('unconfirming a place preserves its personal notes without claiming a visit', async () => {
  const { service } = fixture();
  const { memory } = await service.saveTravelMemory(request({ visits: { [visitId]: decision({ status: 'unconfirmed', city: '', note: '保留補記' }) } }), auth());
  assert.equal(memory.visits[visitId].status, 'unconfirmed');
  assert.equal(memory.visits[visitId].note, '保留補記');
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
  await rejectCode(service.saveTravelMemory(request({ visits: { [visitId]: decision({ city: [] }) } }), auth()), 'invalid-argument');
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
  preserve(database);
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
  preserve(database);
  const base = { sourceRoomId: 'source', roomId: 'new', meta };
  await rejectCode(service.cloneMemoryTrip(base, auth('outsider')), 'failed-precondition');
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
  preserve(database);
  await service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'transport', meta }, auth());
  const places = database.value('rooms/transport/itinerary/Day 1');
  supported.forEach((mode, index) => assert.deepEqual(places[index].nextLeg, { mode, mins: index + 15 }));
  places.slice(supported.length).forEach((place) => assert.equal(place.nextLeg, undefined));
});

test('confirmed failed clone publication permits a fresh attempt without releasing old reservation', async () => {
  const { service, database } = fixture();
  preserve(database);
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
  preserve(database);
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
  preserve(database);
  database.state.roomAccess.collision = { ownerUid: 'alice', cloneSourceRoomId: 'source', state: 'failed', creationId: 'original', members: { alice: { ...member('alice'), status: 'removed' } } };
  database.state.roomReservations = { collision: { createdByUid: 'alice', creationId: 'different' } };
  await rejectCode(service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'collision', meta }, auth()), 'already-exists');
  assert.equal(database.value('rooms/collision'), null);
});

test('clone strips protected URLs even from whitelisted text and checks personal deletion before publishing', async () => {
  const { service, database } = fixture();
  database.state.rooms.source.itinerary['Day 1'][0].memo = '參考 https://firebasestorage.googleapis.com/v0/b/private/o/rooms%2Fsource%2Fa?token=secret';
  preserve(database);
  await service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'safe', meta }, auth());
  assert.equal(database.value('rooms/safe/itinerary/Day 1/0/memo'), null);
  database.beforeTransaction = async (path) => { if (path === 'roomAccess/race') database.state.travelMemoryArchives.alice.source.summary.state = 'deleting'; };
  await rejectCode(service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'race', meta }, auth()), 'failed-precondition');
  assert.equal(database.value('rooms/race'), null);
});

test('permanent snapshot supports cloning and new itinerary decisions after original deletion', async () => {
  const { service, database } = fixture();
  await service.saveTravelMemory(request(), auth()); preserve(database);
  delete database.state.rooms.source; delete database.state.roomAccess.source;
  const { memory } = await service.saveTravelMemory(request({ revision: 1, visits: { [visitId]: decision() } }), auth());
  assert.equal(memory.visits[visitId].name, '寺院');
  assert.equal((await service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'saved-clone', meta }, auth())).roomId, 'saved-clone');
  assert.equal(database.value('rooms/saved-clone/itinerary/Day 1/0/cost'), null);
});

test('clone requires personal snapshot and never falls back to original room', async () => {
  const { service } = fixture();
  await rejectCode(service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'unsaved', meta }, auth()), 'failed-precondition');
});

test('account deletion tombstone prevents stale save from resurrecting a personal memory', async () => {
  const { service, database } = fixture();
  database.assign('personalTravel/alice/deletedMemories/source', { revision: 2, deletedAt: 900 });
  await rejectCode(service.saveTravelMemory(request(), auth()), 'failed-precondition');
  assert.equal(database.value('personalTravel/alice/memories/source'), null);
});

test('manual visits use explicit identity and validated personal name date and coordinates', async () => {
  const { service } = fixture();
  const id = 'manual~123e4567-e89b-42d3-a456-426614174000';
  const visit = decision({ source: 'manual', name: '臨時咖啡店', date: '2026-01-02', lat: 35.1, lng: 135.1, cityId: 'city-kyoto', country: '日本', cityLat: 35, cityLng: 135 });
  const { memory } = await service.saveTravelMemory(request({ visits: { [id]: visit } }), auth());
  assert.equal(memory.visits[id].source, 'manual');
  assert.equal(memory.visits[id].name, '臨時咖啡店');
  assert.equal(memory.visits[id].cityId, 'city-kyoto');
  for (const patch of [{ source: 'itinerary' }, { name: '' }, { date: '2026-02-30' }, { lat: 200 }, { lng: '135' }, { cityLat: 91 }, { cityId: '' }]) {
    await rejectCode(service.saveTravelMemory(request({ revision: 1, visits: { [id]: { ...visit, ...patch } } }), auth()), 'invalid-argument');
  }
  await rejectCode(service.saveTravelMemory(request({ revision: 1, visits: { 'manual~invalid': visit } }), auth()), 'invalid-argument');
});

test('canonical visit city identity persists without accepting spoofed itinerary fields', async () => {
  const { service } = fixture();
  const { memory } = await service.saveTravelMemory(request({ visits: { [visitId]: decision({ cityId: 'kyoto', country: 'JP', cityLat: 35, cityLng: 135, name: 'spoof', lat: 0 }) } }), auth());
  assert.equal(memory.visits[visitId].cityId, 'kyoto');
  assert.equal(memory.visits[visitId].country, 'JP');
  assert.equal(memory.visits[visitId].lat, 35);
  assert.equal(memory.visits[visitId].name, '寺院');
});

test('first experiences remain account unique unless explicitly reassigned transactionally', async () => {
  const { service, database } = fixture();
  database.assign('personalTravel/alice/memories/earlier', { roomId: 'earlier', revision: 4, firsts: { snow: '第一次看雪' }, note: '保留' });
  const payload = request({ firsts: { snow: '第一次看雪' } });
  await rejectCode(service.saveTravelMemory(payload, auth()), 'failed-precondition');
  assert.equal(database.value('personalTravel/alice/memories/earlier/firsts/snow'), '第一次看雪');
  const { memory } = await service.saveTravelMemory({ ...payload, reassignFirsts: ['snow'] }, auth());
  assert.equal(memory.firsts.snow, '第一次看雪');
  assert.deepEqual(database.value('personalTravel/alice/memories/earlier/firsts'), {});
  assert.equal(database.value('personalTravel/alice/memories/earlier/revision'), 5);
  assert.equal(database.value('personalTravel/alice/memories/earlier/note'), '保留');
  await rejectCode(service.saveTravelMemory(request({ revision: 1, reassignFirsts: ['arbitrary'] }), auth()), 'invalid-argument');
});

test('wishlist source provenance is preserved for deduplication but does not count as a visited link', async () => {
  const { service } = fixture();
  const { collection } = await service.saveTravelCollection({ id: 'again', revision: 0, title: '下次', deleted: false, items: { a: { name: '寺院', city: '京都', sourceRoomId: 'source', sourceVisitId: visitId } } }, auth());
  assert.equal(collection.items.a.sourceRoomId, 'source');
  assert.equal(collection.items.a.sourceVisitId, visitId);
  assert.equal(collection.items.a.roomId, undefined);
  await rejectCode(service.saveTravelCollection({ id: 'bad', revision: 0, title: '下次', deleted: false, items: { a: { name: '寺院', sourceRoomId: '../other', sourceVisitId: visitId } } }, auth()), 'invalid-argument');
});

test('manual visits without venue GPS remain valid and have no invented coordinates', async () => {
  const { service } = fixture();
  const id = 'manual~123e4567-e89b-42d3-a456-426614174001';
  const { memory } = await service.saveTravelMemory(request({ visits: { [id]: decision({ source: 'manual', name: '臨時咖啡店', date: '2026-01-02' }) } }), auth());
  assert.equal(memory.visits[id].lat, null);
  assert.equal(memory.visits[id].lng, null);
});

test('revision conflict includes current personal record for a field-level merge', async () => {
  const { service } = fixture();
  const { memory } = await service.saveTravelMemory(request({ note: '其他裝置' }), auth());
  await assert.rejects(service.saveTravelMemory(request({ note: '我的草稿' }), auth()), (error) => {
    assert.equal(error.code, 'aborted'); assert.deepEqual(error.details?.current, memory); return true;
  });
});

test('clone uses preserved destination coordinates when client only supplies title and dates', async () => {
  const { service, database } = fixture(); preserve(database);
  const result = await service.cloneMemoryTrip({ sourceRoomId: 'source', roomId: 'from-snapshot', meta: { title: '再去京都', startDate: '2027-01-01', endDate: '2027-01-02' } }, auth());
  assert.equal(result.meta.destLat, 35); assert.equal(result.meta.destLng, 135);
  assert.equal(result.meta.destination, '日本');
});
