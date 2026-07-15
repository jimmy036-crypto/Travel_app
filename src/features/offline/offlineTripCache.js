import { extractRoomId, sortDayIds, getDayDisplay } from '../../helpers.js';

const CACHE_KEY = 'google-travel-offline-trip-cache-v1';
const MAX_TRIPS = 3;
const MAX_SIZE_BYTES = 1000 * 1024; // roughly 1MB
const DANGEROUS_ROOM_IDS = new Set(['__proto__', 'prototype', 'constructor']);

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateRoomId(roomId) {
  if (typeof roomId !== 'string') return '';
  const trimmed = roomId.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/') || trimmed.includes('\\')) return '';
  if (trimmed.length > 160) return '';

  try {
    const extracted = extractRoomId(trimmed);
    if (!extracted || DANGEROUS_ROOM_IDS.has(extracted)) return '';
    return extracted;
  } catch {
    return '';
  }
}

function normalizeText(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeNullableText(value) {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : null;
}

function normalizeMembers(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(member => typeof member === 'string' && member.trim()).map(member => member.trim());
}

function normalizeFiniteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeCount(value) {
  return Math.floor(normalizeFiniteNumber(value, 0));
}

function normalizeSummary(summary) {
  if (!isPlainObject(summary)) return null;
  return {
    expenseTotal: normalizeFiniteNumber(summary.expenseTotal),
    expenseCount: normalizeCount(summary.expenseCount),
    checklistCompleted: normalizeCount(summary.checklistCompleted),
    checklistTotal: normalizeCount(summary.checklistTotal),
    ticketCount: normalizeCount(summary.ticketCount)
  };
}

function normalizeMeta(meta) {
  if (!isPlainObject(meta)) return null;
  return {
    title: normalizeText(meta.title),
    destination: normalizeText(meta.destination),
    startDate: normalizeNullableText(meta.startDate),
    endDate: normalizeNullableText(meta.endDate),
    members: normalizeMembers(meta.members),
    transport: normalizeNullableText(meta.transport),
    themeColor: normalizeText(meta.themeColor)
  };
}

function normalizeItem(item) {
  if (!isPlainObject(item)) return null;
  return {
    id: normalizeText(item.id),
    name: normalizeText(item.customName) || normalizeText(item.name),
    time: normalizeText(item.time),
    address: normalizeText(item.address),
    note: normalizeText(item.memo) || normalizeText(item.note),
    category: normalizeText(item.category) || normalizeText(item.type)
  };
}

function normalizeDay(day) {
  if (!isPlainObject(day)) return null;
  const items = Array.isArray(day.items)
    ? day.items.map(normalizeItem).filter(Boolean)
    : [];
  return {
    id: normalizeText(day.id),
    label: normalizeText(day.label),
    items
  };
}

function canonicalizeSnapshot(snapshot, { fillCachedAt = false } = {}) {
  if (!isPlainObject(snapshot)) return { ok: false, reason: 'invalid-snapshot' };

  const roomId = validateRoomId(snapshot.roomId);
  if (!roomId) return { ok: false, reason: 'invalid-room-id' };
  if (snapshot.version !== 1) return { ok: false, reason: 'invalid-version' };

  const meta = normalizeMeta(snapshot.meta);
  if (!meta) return { ok: false, reason: 'invalid-meta' };

  if (!Array.isArray(snapshot.days)) return { ok: false, reason: 'invalid-days' };
  const days = snapshot.days.map(normalizeDay).filter(Boolean);

  const summary = normalizeSummary(snapshot.summary);
  if (!summary) return { ok: false, reason: 'invalid-summary' };

  let cachedAt = snapshot.cachedAt;
  if (typeof cachedAt !== 'number' || !Number.isFinite(cachedAt) || cachedAt <= 0) {
    if (!fillCachedAt) return { ok: false, reason: 'invalid-cached-at' };
    cachedAt = Date.now();
  }

  return {
    ok: true,
    snapshot: {
      version: 1,
      roomId,
      cachedAt,
      meta,
      days,
      summary
    }
  };
}

function classifyStorageError(error) {
  const name = String(error?.name || '');
  const message = String(error?.message || '');
  return /quota/i.test(`${name} ${message}`) ? 'quota-error' : 'storage-unavailable';
}

function safeGetCacheRaw() {
  try {
    return { ok: true, value: localStorage.getItem(CACHE_KEY) };
  } catch (error) {
    return { ok: false, reason: classifyStorageError(error) };
  }
}

function safeSetCacheRaw(value) {
  try {
    localStorage.setItem(CACHE_KEY, value);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: classifyStorageError(error) };
  }
}

function parseCacheContainer(raw) {
  if (!raw) return Object.create(null);

  try {
    const parsed = JSON.parse(raw);
    if (!isPlainObject(parsed)) return Object.create(null);

    const cache = Object.create(null);
    Object.entries(parsed).forEach(([key, value]) => {
      if (Object.hasOwn(parsed, key)) cache[key] = value;
    });
    return cache;
  } catch {
    return Object.create(null);
  }
}

function readCacheContainer() {
  const raw = safeGetCacheRaw();
  if (!raw.ok) return raw;
  return { ok: true, cache: parseCacheContainer(raw.value) };
}

function getCanonicalCacheEntries(cache) {
  const entries = [];
  Object.entries(cache).forEach(([key, value]) => {
    if (!Object.hasOwn(cache, key)) return;
    const canonical = canonicalizeSnapshot(value);
    if (!canonical.ok) return;
    if (key !== canonical.snapshot.roomId) return;
    entries.push(canonical.snapshot);
  });
  return entries;
}

function buildCacheObject(entries) {
  const cache = Object.create(null);
  entries.forEach((entry) => {
    cache[entry.roomId] = entry;
  });
  return cache;
}

function sortNewestFirst(a, b) {
  const timeDiff = (b.cachedAt || 0) - (a.cachedAt || 0);
  if (timeDiff !== 0) return timeDiff;
  return String(a.roomId).localeCompare(String(b.roomId));
}

function evictCacheEntries(entries, protectedRoomId) {
  const latestByRoom = Object.create(null);
  entries.forEach((entry) => {
    latestByRoom[entry.roomId] = entry;
  });

  const protectedEntry = latestByRoom[protectedRoomId];
  if (!protectedEntry) return Object.values(latestByRoom).sort(sortNewestFirst).slice(0, MAX_TRIPS);

  const others = Object.values(latestByRoom)
    .filter(entry => entry.roomId !== protectedRoomId)
    .sort(sortNewestFirst)
    .slice(0, MAX_TRIPS - 1);

  return [protectedEntry, ...others].sort(sortNewestFirst);
}

function utf8ByteLength(value) {
  const str = String(value);
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str).length;
  }

  let bytes = 0;
  for (const char of str) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export function buildOfflineTripSnapshot({
  roomId,
  meta,
  itinerary,
  expenseStats,
  expenses,
  checklistItems,
  tickets
}) {
  const normId = validateRoomId(roomId);
  if (!normId || !meta) return null;

  let days = [];

  const mapItem = (item) => normalizeItem(isPlainObject(item) ? item : null);

  if (itinerary && typeof itinerary === 'object' && !Array.isArray(itinerary)) {
    const dayIds = Object.keys(itinerary);
    const sortedDayIds = sortDayIds(dayIds);
    days = sortedDayIds.map(dayId => {
      const items = Array.isArray(itinerary[dayId])
        ? itinerary[dayId].map(mapItem).filter(Boolean)
        : [];
      const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
      const label = dateStr ? `${title} ${dateStr}` : title;
      return {
        id: dayId,
        label,
        items
      };
    });
  } else if (Array.isArray(itinerary)) {
    days = itinerary.map(day => {
      if (!isPlainObject(day)) return null;
      const { title, dateStr } = getDayDisplay(day.id, meta.startDate);
      const label = normalizeText(day.label) || (dateStr ? `${title} ${dateStr}` : title);
      return {
        id: normalizeText(day.id),
        label,
        items: Array.isArray(day.items) ? day.items.map(mapItem).filter(Boolean) : []
      };
    }).filter(Boolean);
  }

  let checklistCompleted = 0;
  let checklistTotal = 0;
  if (Array.isArray(checklistItems)) {
    checklistTotal = checklistItems.length;
    checklistCompleted = checklistItems.filter(i => {
      const isCompleted = i?.completed !== undefined ? i.completed : i?.checked;
      return Boolean(isCompleted);
    }).length;
  }

  const expenseCount = Array.isArray(expenses) ? expenses.length : 0;
  const ticketCount = Array.isArray(tickets) ? tickets.length : 0;

  const snapshot = {
    version: 1,
    roomId: normId,
    cachedAt: Date.now(),
    meta: {
      title: normalizeText(meta.title),
      destination: normalizeText(meta.destination),
      startDate: normalizeNullableText(meta.startDate),
      endDate: normalizeNullableText(meta.endDate),
      members: normalizeMembers(meta.members),
      transport: normalizeNullableText(meta.transport),
      themeColor: normalizeText(meta.themeColor)
    },
    days,
    summary: {
      expenseTotal: normalizeFiniteNumber(expenseStats?.totalExpense),
      expenseCount,
      checklistCompleted,
      checklistTotal,
      ticketCount
    }
  };

  return snapshot;
}

export function writeOfflineTripSnapshot(snapshot) {
  const canonical = canonicalizeSnapshot(snapshot, { fillCachedAt: true });
  if (!canonical.ok) return { ok: false, reason: canonical.reason };

  const snapshotStr = JSON.stringify(canonical.snapshot);
  const byteSize = utf8ByteLength(snapshotStr);
  if (byteSize > MAX_SIZE_BYTES) {
    console.warn(`[offlineTripCache] Snapshot for ${canonical.snapshot.roomId} is too large (${byteSize} bytes)`);
    return { ok: false, reason: 'too-large' };
  }

  const cacheRead = readCacheContainer();
  if (!cacheRead.ok) return { ok: false, reason: 'storage-unavailable' };

  const existingEntries = getCanonicalCacheEntries(cacheRead.cache)
    .filter(entry => entry.roomId !== canonical.snapshot.roomId);
  const nextEntries = evictCacheEntries([...existingEntries, canonical.snapshot], canonical.snapshot.roomId);
  const setResult = safeSetCacheRaw(JSON.stringify(buildCacheObject(nextEntries)));
  if (!setResult.ok) return { ok: false, reason: setResult.reason };

  return { ok: true };
}

export function readOfflineTripSnapshot(roomId) {
  const normId = validateRoomId(roomId);
  if (!normId) return null;

  const cacheRead = readCacheContainer();
  if (!cacheRead.ok) return null;
  if (!Object.hasOwn(cacheRead.cache, normId)) return null;

  const canonical = canonicalizeSnapshot(cacheRead.cache[normId]);
  if (!canonical.ok) return null;
  if (canonical.snapshot.roomId !== normId) return null;

  return JSON.parse(JSON.stringify(canonical.snapshot));
}

export function listOfflineTripSummaries() {
  const cacheRead = readCacheContainer();
  if (!cacheRead.ok) return [];

  return getCanonicalCacheEntries(cacheRead.cache)
    .sort(sortNewestFirst)
    .map(item => ({
      roomId: item.roomId,
      cachedAt: item.cachedAt,
      title: item.meta.title,
      destination: item.meta.destination,
    }));
}

export function removeOfflineTripSnapshot(roomId) {
  const normId = validateRoomId(roomId);
  if (!normId) return { ok: false, reason: 'invalid-room-id' };

  const cacheRead = readCacheContainer();
  if (!cacheRead.ok) return { ok: false, reason: 'storage-unavailable' };
  if (!Object.hasOwn(cacheRead.cache, normId)) return { ok: true };

  const nextEntries = getCanonicalCacheEntries(cacheRead.cache)
    .filter(entry => entry.roomId !== normId);
  const setResult = safeSetCacheRaw(JSON.stringify(buildCacheObject(nextEntries)));
  if (!setResult.ok) return { ok: false, reason: setResult.reason };

  return { ok: true };
}
