const CACHE_KEY = 'google-travel-offline-trip-cache-v1';
const MAX_TRIPS = 3;
const MAX_SIZE_BYTES = 1000 * 1024; // roughly 1MB

export function buildOfflineTripSnapshot({
  roomId,
  meta,
  itinerary,
  expenseStats,
  expenses,
  checklistItems,
  tickets
}) {
  if (!roomId || !meta) return null;

  const days = Array.isArray(itinerary) ? itinerary.map(day => ({
    id: day.id,
    label: day.label,
    items: Array.isArray(day.items) ? day.items.map(item => ({
      id: item.id,
      name: item.name || '',
      time: item.time || '',
      address: item.address || '',
      note: typeof item.note === 'string' ? item.note : '',
      category: item.category || '景點'
    })) : []
  })) : [];

  let expenseCount = 0;
  if (Array.isArray(expenses)) {
    expenseCount = expenses.length;
  }

  let checklistCompleted = 0;
  let checklistTotal = 0;
  if (Array.isArray(checklistItems)) {
    checklistTotal = checklistItems.length;
    checklistCompleted = checklistItems.filter(i => i.checked).length;
  }

  let ticketCount = 0;
  if (Array.isArray(tickets)) {
    ticketCount = tickets.length;
  }

  const snapshot = {
    version: 1,
    roomId: String(roomId),
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
  } catch (e) {
    return {};
  }
}

function writeAllCache(cacheObj) {
  try {
    const str = JSON.stringify(cacheObj);
    localStorage.setItem(CACHE_KEY, str);
    return true;
  } catch (e) {
    return false;
  }
}

export function writeOfflineTripSnapshot(snapshot) {
  if (!snapshot || !snapshot.roomId || snapshot.version !== 1) {
    return { ok: false, reason: 'invalid-snapshot' };
  }

  const snapshotStr = JSON.stringify(snapshot);
  // Estimate size: JavaScript strings are UTF-16, length * 2 is roughly bytes.
  // Actually, JSON.stringify length in bytes (UTF-8) is usually similar to string length.
  // We'll use length * 2 to be conservative, or encodeURI length.
  const byteSize = new Blob([snapshotStr]).size;
  if (byteSize > MAX_SIZE_BYTES) {
    console.warn(`[offlineTripCache] Snapshot for ${snapshot.roomId} is too large (${byteSize} bytes)`);
    return { ok: false, reason: 'too-large' };
  }

  const cache = readAllCache();
  
  // If we are adding a new cache and it exceeds MAX_TRIPS, we need to evict.
  // We don't want to evict if we're just updating an existing trip that is already in cache.
  // Or rather, we keep max MAX_TRIPS total.
  cache[snapshot.roomId] = snapshot;
  
  const entries = Object.values(cache);
  if (entries.length > MAX_TRIPS) {
    // Sort by cachedAt descending
    entries.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
    // Keep top MAX_TRIPS
    const toKeep = entries.slice(0, MAX_TRIPS);
    // Rebuild cache
    const newCache = {};
    for (const item of toKeep) {
      newCache[item.roomId] = item;
    }
    // ensure we didn't accidentally delete the one we just tried to insert
    // (it should be newest, so it shouldn't be deleted)
    if (!writeAllCache(newCache)) {
      return { ok: false, reason: 'quota-error' };
    }
    return { ok: true };
  }

  if (!writeAllCache(cache)) {
    return { ok: false, reason: 'quota-error' };
  }

  return { ok: true };
}

export function readOfflineTripSnapshot(roomId) {
  if (!roomId) return null;
  const cache = readAllCache();
  const snapshot = cache[String(roomId)];
  if (!snapshot || snapshot.version !== 1) return null;
  // Deep clone to avoid external mutation
  return JSON.parse(JSON.stringify(snapshot));
}

export function listOfflineTripSummaries() {
  const cache = readAllCache();
  const summaries = [];
  for (const key in cache) {
    const item = cache[key];
    if (item && item.version === 1) {
      summaries.push({
        roomId: item.roomId,
        cachedAt: item.cachedAt,
        title: item.meta?.title || '',
        destination: item.meta?.destination || '',
      });
    }
  }
  // Sort descending by cachedAt
  summaries.sort((a, b) => (b.cachedAt || 0) - (a.cachedAt || 0));
  return summaries;
}

export function removeOfflineTripSnapshot(roomId) {
  if (!roomId) return { ok: false };
  const cache = readAllCache();
  if (!cache[String(roomId)]) return { ok: true }; // already removed
  delete cache[String(roomId)];
  writeAllCache(cache);
  return { ok: true };
}
