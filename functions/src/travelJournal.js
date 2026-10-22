import { Buffer } from 'node:buffer';
import {
  CollaborationError, isActiveMember, normalizeTripMeta, requireGoogleIdentity, validateRoomId,
} from './domain.js';

const fail = (code, message) => { throw new CollaborationError(code, message); };
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const FIRSTS = { solo: '第一趟獨旅', snow: '第一次看雪' };
const key = (value) => {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 768
    || Array.from(value).some((character) => '.#$[]/'.includes(character)
      || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
    || ['__proto__', 'constructor', 'prototype'].includes(value)) fail('invalid-argument', '紀錄 ID 格式不正確。');
  return value;
};
const text = (value, limit, required = false) => {
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) {
    fail('invalid-argument', '文字內容格式或長度不正確。');
  }
  return value.trim();
};
const object = (value, limit) => {
  if (!record(value) || Object.keys(value).length > limit) fail('invalid-argument', '紀錄格式或數量不正確。');
  for (const id of Object.keys(value)) key(id);
  return value;
};
const revision = (value) => {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) fail('invalid-argument', '請提供有效版本。');
  return value;
};
const boolean = (value) => {
  if (typeof value !== 'boolean') fail('invalid-argument', '紀錄狀態格式不正確。');
  return value;
};
const active = (access, uid) => access?.state === 'ready' && isActiveMember(access.members?.[uid])
  && access.members[uid].uid === uid && Number.isSafeInteger(access.members[uid].aclVersion) && access.members[uid].aclVersion > 0;
const encode = (value) => encodeURIComponent(value).replace(/[.~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
const dayNumber = (value) => /^Day ([1-9]\d?)$/.test(value) ? Number(value.slice(4)) : 0;
const dateAt = (start, offset) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return '';
  const date = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== start) return '';
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const position = (place) => {
  const numeric = (value) => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '';
  const lat = Number(place.lat); const lng = Number(place.lng);
  return numeric(place.lat) && numeric(place.lng) && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? { lat, lng } : { lat: null, lng: null };
};

function candidates(source) {
  const result = new Map();
  for (const [dayId, places] of Object.entries(source?.itinerary || {})) {
    const day = dayNumber(dayId);
    if (!day || day > 30 || !places || typeof places !== 'object') continue;
    for (const place of Object.values(places)) {
      if (!record(place) || typeof place.name !== 'string' || !place.name.trim()
        || !['string', 'number'].includes(typeof place.id)
        || !String(place.id).trim() || ![undefined, 'place', 'attraction'].includes(place.type)) continue;
      const itemId = String(place.id).trim();
      const id = `${encode(dayId)}~${encode(itemId)}`;
      if (Buffer.byteLength(id) > 768 || result.has(id)) continue;
      result.set(id, { dayId, itemId, name: place.name.trim().slice(0, 240), date: dateAt(source.meta?.startDate, day - 1), ...position(place) });
    }
  }
  return result;
}

const canonicalVisit = (visit) => ({
  dayId: visit.dayId, itemId: visit.itemId, name: visit.name, date: visit.date,
  lat: visit.lat ?? null, lng: visit.lng ?? null,
});

function normalizeCity(value) {
  if (!record(value)) fail('invalid-argument', '城市資料格式不正確。');
  const cityId = text(value.cityId, 256, true);
  const city = text(value.city, 120, true);
  const country = text(value.country, 120, true);
  if (typeof value.cityLat !== 'number' || typeof value.cityLng !== 'number'
    || position({ lat: value.cityLat, lng: value.cityLng }).lat === null) fail('invalid-argument', '城市座標不正確。');
  return { cityId, city, country, cityLat: value.cityLat, cityLng: value.cityLng };
}

function normalizeCities(raw) {
  return Object.fromEntries(Object.entries(object(raw, 200)).map(([id, value]) => {
    const city = normalizeCity(value);
    if (id !== encode(city.cityId)) fail('invalid-argument', '城市識別與紀錄不一致。');
    return [id, city];
  }));
}

function normalizeVisits(raw, previous, available) {
  return Object.fromEntries(Object.entries(raw).map(([id, value]) => {
    if (!record(value) || !['unconfirmed', 'visited', 'missed', 'wishlist'].includes(value.status)) fail('invalid-argument', '請明確確認到訪狀態。');
    const manual = id.startsWith('manual~');
    let canonical;
    if (manual) {
      const noPosition = value.lat == null && value.lng == null;
      if (!/^manual~[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
        || value.source !== 'manual' || !dateAt(value.date, 0)
        || !noPosition && (typeof value.lat !== 'number' || typeof value.lng !== 'number' || position(value).lat === null)) {
        fail('invalid-argument', '補登地點需填寫有效日期與座標。');
      }
      canonical = { source: 'manual', name: text(value.name, 240, true), date: value.date, lat: value.lat ?? null, lng: value.lng ?? null };
    } else {
      if (value.source === 'manual') fail('invalid-argument', '補登地點 ID 格式不正確。');
      canonical = previous?.[id] ? canonicalVisit(previous[id]) : available.get(id);
    }
    if (!canonical) fail('invalid-argument', '到訪地點不屬於已保存的回憶或目前行程。');
    const city = text(value.city ?? '', 120);
    let cityFields = {};
    if (value.cityId !== undefined) {
      cityFields = normalizeCity(value);
    } else if (value.country !== undefined || value.cityLat !== undefined || value.cityLng !== undefined) {
      fail('invalid-argument', '請選擇完整的城市資料。');
    }
    return [id, { ...canonical, status: value.status, city, ...cityFields, note: text(value.note ?? '', 1000) }];
  }));
}

// Only planning fields are copied; no arbitrary object, attachment or completion field survives.
const protectedResource = /(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com|storage\.cloud\.google\.com|gs:\/\/|(?:^|[\s/])rooms\/|rooms%2f)/i;
const safePlanText = (value, max) => typeof value === 'string' && !protectedResource.test(value) ? value.slice(0, max) : '';
export function cloneItinerary(source, duration) {
  const itinerary = {};
  let count = 0;
  const fields = { name: 240, customName: 240, place_id: 256, address: 500, memo: 3000, notes: 3000, time: 20, stayTime: 20, category: 80, type: 40 };
  for (const [dayId, rawPlaces] of Object.entries(source.itinerary || {})) {
    const day = dayNumber(dayId);
    if (!day || day > duration) fail('failed-precondition', '原行程天數超出新旅程日期，無法複製。');
    if (!rawPlaces || typeof rawPlaces !== 'object') continue;
    itinerary[dayId] = Object.values(rawPlaces).filter(record).map((place) => {
      count += 1;
      if (count > 1000) fail('resource-exhausted', '行程景點超出可複製數量。');
      const id = String(place.id ?? '').trim();
      if (!id || id.length > 160 || protectedResource.test(id)) fail('failed-precondition', '原行程景點 ID 不完整。');
      const next = { id };
      for (const [field, max] of Object.entries(fields)) {
        const value = safePlanText(place[field], max);
        if (value) next[field] = value;
      }
      const coordinates = position(place);
      if (coordinates.lat !== null) Object.assign(next, coordinates);
      if (Array.isArray(place.tags)) next.tags = place.tags.slice(0, 30).map((tag) => safePlanText(tag, 80)).filter(Boolean);
      if (record(place.nextLeg) && ['AUTO', 'DRIVE', 'WALK', 'TRAIN', 'TRANSIT', 'FLIGHT'].includes(place.nextLeg.mode)) {
        const mins = Number(place.nextLeg.mins);
        if (Number.isFinite(mins) && mins >= 0 && mins <= 1440) next.nextLeg = { mode: place.nextLeg.mode, mins };
      }
      return next;
    });
  }
  return Object.keys(itinerary).length ? itinerary : { 'Day 1': [] };
}

export function createTravelJournalService({ database, collaborationService, clock = Date.now }) {
  if (!database || !collaborationService) throw new TypeError('database and collaborationService are required.');
  const accessFor = async (roomId) => (await database.ref(`roomAccess/${roomId}`).get()).val();
  const requireSourceAccess = async (roomId, uid, version) => {
    const access = await accessFor(roomId);
    if (!active(access, uid) || (version !== undefined && access.members[uid].aclVersion !== version)) {
      fail('permission-denied', '你已無法存取原旅程。');
    }
    return access;
  };
  const accessibleSource = async (roomId, uid) => {
    const access = await accessFor(roomId);
    if (!active(access, uid)) return null;
    const source = (await database.ref(`rooms/${roomId}`).get()).val();
    await requireSourceAccess(roomId, uid, access.members[uid].aclVersion);
    return source && record(source.meta) ? { source, aclVersion: access.members[uid].aclVersion } : null;
  };
  const mutateAccount = async (uid, update, beforeTransaction = null) => {
    const reference = database.ref(`personalTravel/${uid}`);
    // Prime the cache and tolerate the Admin SDK's speculative null callback.
    const exists = (await reference.get()).exists();
    if (beforeTransaction) await beforeTransaction();
    const result = await reference.transaction((current) => {
      if (current === null && exists) return null;
      return update(current || {});
    }, undefined, false);
    if (!result.committed || result.snapshot.val() === null) fail('aborted', '紀錄已更新，請重新載入。');
    return result.snapshot.val();
  };
  const checkRevision = (previous, expected) => {
    if ((previous?.revision ?? 0) !== expected) {
      const error = new CollaborationError('aborted', '紀錄已在其他畫面更新，請重新載入。');
      error.details = { current: previous || null };
      throw error;
    }
  };

  return {
    async saveTravelMemory(data, auth) {
      const { uid } = requireGoogleIdentity(auth);
      const roomId = validateRoomId(data?.roomId);
      const expected = revision(data?.revision);
      const archived = boolean(data?.archived);
      const note = text(data?.note, 3000);
      const visits = object(data?.visits, 1000);
      if (data?.cities === undefined) fail('failed-precondition', '請更新頁面後再儲存回憶；原有紀錄尚未更動。');
      const cities = normalizeCities(data.cities);
      const firsts = object(data?.firsts, 2);
      for (const [id, label] of Object.entries(firsts)) {
        if (!Object.hasOwn(FIRSTS, id) || FIRSTS[id] !== label) fail('invalid-argument', '首次體驗格式不正確。');
      }
      const reassignFirsts = data.reassignFirsts ?? [];
      if (!Array.isArray(reassignFirsts) || reassignFirsts.length > 2
        || new Set(reassignFirsts).size !== reassignFirsts.length
        || reassignFirsts.some((id) => !Object.hasOwn(firsts, id))) fail('invalid-argument', '首次體驗重新指定格式不正確。');
      const loaded = await accessibleSource(roomId, uid);
      const source = loaded?.source;
      let sourceAvailable = Boolean(source);
      const archive = (await database.ref(`travelMemoryArchives/${uid}/${roomId}`).get()).val();
      const snapshotAvailable = archive && !['deleting', 'deleted'].includes(archive.summary?.state);
      const available = candidates(snapshotAvailable ? { itinerary: archive.itinerary, meta: archive.operation?.meta } : source);
      const now = Number(clock());
      const account = await mutateAccount(uid, (current) => {
        if (current.deletedMemories?.[roomId]) fail('failed-precondition', '這份個人回憶已刪除，無法重新保存。');
        const previous = current.memories?.[roomId];
        checkRevision(previous, expected);
        if (!previous && !sourceAvailable) fail('permission-denied', '你已無法存取原旅程。');
        if (previous?.archived === true && !archived && !sourceAvailable) {
          fail('failed-precondition', '原旅程已無法存取，請保留在回憶中；仍可編輯自己的紀錄。');
        }
        if (!previous && Object.keys(current.memories || {}).length >= 500) fail('resource-exhausted', '回憶數量已達上限。');
        const snapshot = previous || {
          title: text(source.meta.title, 120, true), destination: text(source.meta.destination, 160, true),
          startDate: text(source.meta.startDate, 10, true), endDate: text(source.meta.endDate, 10, true),
        };
        const memory = {
          roomId, revision: expected + 1, archived,
          archivedAt: archived ? previous?.archivedAt ?? now : null,
          title: snapshot.title, destination: snapshot.destination, startDate: snapshot.startDate, endDate: snapshot.endDate,
          note, cities, visits: normalizeVisits(visits, previous?.visits, available), firsts: { ...firsts },
        };
        const memories = { ...current.memories };
        for (const [otherId, other] of Object.entries(memories)) {
          if (otherId === roomId) continue;
          const duplicate = Object.keys(firsts).filter((id) => Object.hasOwn(other.firsts || {}, id));
          if (duplicate.some((id) => !reassignFirsts.includes(id))) {
            const error = new CollaborationError('failed-precondition', '這項首次體驗已指定其他旅程，請明確選擇重新指定。');
            error.details = { reason: 'first-experience-assigned', roomId: otherId, firsts: duplicate };
            throw error;
          }
          if (duplicate.length) {
            const retainedFirsts = { ...other.firsts }; duplicate.forEach((id) => { delete retainedFirsts[id]; });
            memories[otherId] = { ...other, firsts: retainedFirsts, revision: other.revision + 1 };
          }
        }
        return { ...current, memories: { ...memories, [roomId]: memory } };
      }, async () => {
        if (!loaded) return;
        const latest = await accessFor(roomId);
        sourceAvailable = active(latest, uid) && latest.members[uid].aclVersion === loaded.aclVersion;
        // Existing personal records remain editable after revocation. Only new
        // source-derived records must be refused once the source ACL changes.
        if (!sourceAvailable && !snapshotAvailable) available.clear();
      });
      return { memory: account.memories[roomId] };
    },

    async saveTravelCollection(data, auth) {
      const { uid } = requireGoogleIdentity(auth);
      const id = key(data?.id);
      const expected = revision(data?.revision);
      const deleted = boolean(data?.deleted);
      const title = text(data?.title, 120, true);
      const items = object(data?.items, 200);
      const normalized = Object.fromEntries(Object.entries(items).map(([itemId, item]) => {
        if (!record(item)) fail('invalid-argument', '收藏地點格式不正確。');
        const name = text(item.name, 240, true); const city = text(item.city ?? '', 120);
        const hasRoom = item.roomId !== undefined && item.roomId !== '';
        const hasVisit = item.visitId !== undefined && item.visitId !== '';
        if (hasRoom !== hasVisit) fail('invalid-argument', '請選擇完整的到訪來源。');
        const hasSourceRoom = item.sourceRoomId !== undefined && item.sourceRoomId !== '';
        const hasSourceVisit = item.sourceVisitId !== undefined && item.sourceVisitId !== '';
        if (hasSourceRoom !== hasSourceVisit) fail('invalid-argument', '收藏來源格式不完整。');
        return [itemId, { name, city, ...(hasRoom ? { roomId: validateRoomId(item.roomId), visitId: key(item.visitId) } : {}),
          ...(hasSourceRoom ? { sourceRoomId: validateRoomId(item.sourceRoomId), sourceVisitId: key(item.sourceVisitId) } : {}) }];
      }));
      const account = await mutateAccount(uid, (current) => {
        checkRevision(current.collections?.[id], expected);
        if (!current.collections?.[id] && Object.keys(current.collections || {}).length >= 100) fail('resource-exhausted', '收藏數量已達上限。');
        if (!deleted) for (const item of Object.values(normalized)) {
          if (item.roomId && current.memories?.[item.roomId]?.visits?.[item.visitId]?.status !== 'visited') {
            fail('invalid-argument', '收藏只能連結自己已確認到訪的地點。');
          }
        }
        const collection = { id, revision: expected + 1, title, items: deleted ? {} : normalized, deleted };
        return { ...current, collections: { ...current.collections, [id]: collection } };
      });
      return { collection: account.collections[id] };
    },

    async cloneMemoryTrip(data, auth) {
      const { uid } = requireGoogleIdentity(auth);
      const sourceRoomId = validateRoomId(data?.sourceRoomId);
      const roomId = validateRoomId(data?.roomId);
      if (sourceRoomId === roomId) fail('already-exists', '新旅程 ID 必須與原旅程不同。');
      const existing = (await database.ref(`rooms/${roomId}`).get()).val();
      if (existing) {
        const target = await accessFor(roomId);
        if (target?.cloneSourceRoomId === sourceRoomId && target.ownerUid === uid
          && existing.meta?.ownerUid === uid && active(target, uid)) return { roomId, meta: existing.meta };
        fail('already-exists', '此旅程 ID 已存在。');
      }
      const reserved = await accessFor(roomId);
      if (reserved && reserved.ownerUid !== uid) fail('already-exists', '此旅程 ID 已存在。');
      const savedSnapshot = async () => {
        const saved = (await database.ref(`travelMemoryArchives/${uid}/${sourceRoomId}`).get()).val();
        const deleted = (await database.ref(`personalTravel/${uid}/deletedMemories/${sourceRoomId}`).get()).exists();
        if (deleted || !saved?.operation?.meta || !['queued', 'copying', 'partial', 'complete'].includes(saved.summary?.state)) {
          fail('failed-precondition', '請先永久保存這趟旅行，再複製新旅程。');
        }
        return saved;
      };
      const archive = await savedSnapshot();
      const source = { meta: archive.operation.meta, itinerary: archive.itinerary || {} };
      const meta = normalizeTripMeta({ ...source.meta, ...data?.meta, members: ['自己'], memberBudgets: { 自己: 10000 } }, Number(clock()));
      const days = (Date.parse(meta.endDate) - Date.parse(meta.startDate)) / 86400000 + 1;
      const sourceDays = (Date.parse(source.meta.endDate) - Date.parse(source.meta.startDate)) / 86400000 + 1;
      if (!Number.isInteger(sourceDays) || sourceDays < 1 || days < sourceDays) fail('invalid-argument', '新旅程必須保留原行程天數。');
      const itinerary = cloneItinerary(source, days);
      const verifySnapshot = async () => {
        const latest = await savedSnapshot();
        if (latest.operation.id !== archive.operation.id) fail('failed-precondition', '個人回憶已更新，請重新載入。');
      };
      try {
        return await collaborationService.createTrip({ roomId, meta }, auth, { itinerary, cloneSourceRoomId: sourceRoomId, beforePublish: verifySnapshot });
      } catch (error) {
        if (error.code === 'permission-denied' || error.code === 'unauthenticated') throw error;
        const [latest, target, reservationSnapshot] = await Promise.all([
          database.ref(`rooms/${roomId}`).get(), accessFor(roomId), database.ref(`roomReservations/${roomId}`).get(),
        ]);
        if (target?.cloneSourceRoomId === sourceRoomId && target.ownerUid === uid
          && latest.val()?.meta?.ownerUid === uid && active(target, uid)) return { roomId, meta: latest.val().meta };
        const reservation = reservationSnapshot.val();
        if (!latest.exists() && target?.state === 'failed' && target.ownerUid === uid
          && target.cloneSourceRoomId === sourceRoomId && target.creationId
          && reservation?.creationId === target.creationId && reservation.createdByUid === uid) {
          // Reservations stay permanent. A fresh attempt ID is safe only after
          // this server-side proof that the owned failed attempt never published.
          const unpublished = new CollaborationError('failed-precondition', '新旅程尚未建立，請再試一次。');
          unpublished.details = { reason: 'clone-attempt-not-published' };
          throw unpublished;
        }
        throw error;
      }
    },
  };
}
