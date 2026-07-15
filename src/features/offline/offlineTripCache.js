import { extractRoomId, sortDayIds, getDayDisplay } from '../../helpers.js';

const CACHE_KEY = 'google-travel-offline-trip-cache-v1';
const MAX_TRIPS = 3;
const MAX_SIZE_BYTES = 1000 * 1024; // roughly 1MB

function validateRoomId(roomId) {
  if (typeof roomId !== 'string') return '';
  const trimmed = roomId.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/') || trimmed.includes('\\')) return '';
  if (trimmed.length > 160) return '';
  
  try {
    const extracted = extractRoomId(trimmed);
    if (!extracted) return '';
    return extracted;
  } catch {
    return '';
  }
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

  const mapItem = (item) => {
    if (!item) return null;
    return {
      id: item.id || '',
      name: item.customName || item.name || '',
      time: item.time || '',
      address: item.address || '',
      note: item.memo || item.note || '',
      category: item.category || item.type || '景點'
    };
  };

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
      const { title, dateStr } = getDayDisplay(day.id, meta.startDate);
      const label = day.label || (dateStr ? `${title} ${dateStr}` : title);
      return {
        id: day.id,
        label,
        items: Array.isArray(day.items) ? day.items.map(mapItem).filter(Boolean) : []
      };
    });
  }

  let checklistCompleted = 0;
  let checklistTotal = 0;
  if (Array.isArray(checklistItems)) {
    checklistTotal = checklistItems.length;
    checklistCompleted = checklistItems.filter(i => {
      const isCompleted = i.completed !== undefined ? i.completed : i.checked;
      return Boolean(isCompleted);
    }).length;
  }

  let expenseCount = 0;
  if (Array.isArray(expenses)) {
    expenseCount = expenses.length;
  }

  let ticketCount = 0;
  if (Array.isArray(tickets)) {
    ticketCount = tickets.length;
  }

  const snapshot = {
    version: 1,
    roomId: normId,
    cachedAt: Date.now(),
    meta: {
      title: meta.title || '',
      destination: meta.destination || '',
      startDate: meta.startDate || null,
      endDate: meta.endDate || null,
      members: Array.isArray(meta.members) ? meta.members : [],
      transport: meta.transport || null,
      themeColor: meta.themeColor || ''
    },
    days,
    summary: {
      expenseTotal: expenseStats?.totalExpense || 0,
      expenseCount,
      checklistCompleted,
      checklistTotal,
      ticketCount
    }
  };

  return snapshot;
}

function readAllCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeAllCache(cacheObj) {
  try {
    const str = JSON.stringify(cacheObj);
    localStorage.setItem(CACHE_KEY, str);
    return true;
  } catch {
    return false;
  }
}

export function writeOfflineTripSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return { ok: false, reason: 'invalid-snapshot' };
  }

  const normRoomId = validateRoomId(snapshot.roomId);
  if (!normRoomId) {
    return { ok: false, reason: 'invalid-room-id' };
  }

  if (snapshot.version !== 1) {
    return { ok: false, reason: 'invalid-version' };
  }

  let snapshotCopy;
  try {
    snapshotCopy = JSON.parse(JSON.stringify(snapshot));
  } catch {
    return { ok: false, reason: 'invalid-snapshot' };
  }

  if (typeof snapshotCopy.cachedAt !== 'number' || !Number.isFinite(snapshotCopy.cachedAt) || snapshotCopy.cachedAt <= 0) {
    snapshotCopy.cachedAt = Date.now();
  }

  snapshotCopy.roomId = normRoomId;

  if (typeof snapshotCopy.meta !== 'object' || snapshotCopy.meta === null || Array.isArray(snapshotCopy.meta)) {
    return { ok: false, reason: 'invalid-meta' };
  }
  if (!Array.isArray(snapshotCopy.days)) {
    return { ok: false, reason: 'invalid-days' };
  }
  if (typeof snapshotCopy.summary !== 'object' || snapshotCopy.summary === null || Array.isArray(snapshotCopy.summary)) {
    return { ok: false, reason: 'invalid-summary' };
  }

  const snapshotStr = JSON.stringify(snapshotCopy);
  const byteSize = new Blob([snapshotStr]).size;
  if (byteSize > MAX_SIZE_BYTES) {
    console.warn(`[offlineTripCache] Snapshot for ${snapshotCopy.roomId} is too large (${byteSize} bytes)`);
    return { ok: false, reason: 'too-large' };
  }

  const cache = readAllCache();
  const originalCacheStr = localStorage.getItem(CACHE_KEY) || '{}';

  cache[snapshotCopy.roomId] = snapshotCopy;

  const entries = Object.values(cache);
  if (entries.length > MAX_TRIPS) {
    const others = entries.filter(e => e.roomId !== snapshotCopy.roomId);
    others.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
    
    const toKeep = [snapshotCopy, ...others.slice(0, MAX_TRIPS - 1)];
    const newCache = {};
    for (const item of toKeep) {
      newCache[item.roomId] = item;
    }
    
    if (!writeAllCache(newCache)) {
      try {
        localStorage.setItem(CACHE_KEY, originalCacheStr);
      } catch {
        // ignore rollback error
      }
      return { ok: false, reason: 'quota-error' };
    }
    return { ok: true };
  }

  if (!writeAllCache(cache)) {
    try {
      localStorage.setItem(CACHE_KEY, originalCacheStr);
    } catch {
      // ignore rollback error
    }
    return { ok: false, reason: 'quota-error' };
  }

  return { ok: true };
}

export function readOfflineTripSnapshot(roomId) {
  const normId = validateRoomId(roomId);
  if (!normId) return null;
  
  const cache = readAllCache();
  const snapshot = cache[normId];
  if (!snapshot) return null;
  
  if (snapshot.roomId !== normId) return null;
  if (snapshot.version !== 1) return null;
  if (typeof snapshot.cachedAt !== 'number' || !Number.isFinite(snapshot.cachedAt) || snapshot.cachedAt <= 0) return null;
  if (typeof snapshot.meta !== 'object' || snapshot.meta === null || Array.isArray(snapshot.meta)) return null;
  if (!Array.isArray(snapshot.days)) return null;
  if (typeof snapshot.summary !== 'object' || snapshot.summary === null || Array.isArray(snapshot.summary)) return null;
  
  return JSON.parse(JSON.stringify(snapshot));
}

export function listOfflineTripSummaries() {
  const cache = readAllCache();
  const summaries = [];
  for (const key in cache) {
    const item = cache[key];
    if (item) {
      if (key !== item.roomId) continue;
      const normId = validateRoomId(item.roomId);
      if (!normId || item.roomId !== normId) continue;
      if (item.version !== 1) continue;
      if (typeof item.cachedAt !== 'number' || !Number.isFinite(item.cachedAt) || item.cachedAt <= 0) continue;
      if (typeof item.meta !== 'object' || item.meta === null || Array.isArray(item.meta)) continue;
      if (!Array.isArray(item.days)) continue;
      if (typeof item.summary !== 'object' || item.summary === null || Array.isArray(item.summary)) continue;

      summaries.push({
        roomId: item.roomId,
        cachedAt: item.cachedAt,
        title: item.meta?.title || '',
        destination: item.meta?.destination || '',
      });
    }
  }
  summaries.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
  return summaries;
}

export function removeOfflineTripSnapshot(roomId) {
  const normId = validateRoomId(roomId);
  if (!normId) return { ok: false, reason: 'invalid-room-id' };
  
  const cache = readAllCache();
  if (!cache[normId]) return { ok: true };
  
  const originalCacheStr = localStorage.getItem(CACHE_KEY) || '{}';
  delete cache[normId];
  
  if (!writeAllCache(cache)) {
    try {
      localStorage.setItem(CACHE_KEY, originalCacheStr);
    } catch {
      // ignore rollback error
    }
    return { ok: false, reason: 'quota-error' };
  }
  return { ok: true };
}
