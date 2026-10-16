import { getDayNumber, isValidCoordinates, parseDateOnlyLocal, sortDayIds } from '../../helpers.js';

const UNKNOWN_YEAR = '未註明年份';
const text = (value) => typeof value === 'string' ? value.trim() : '';
const entries = (value) => value && typeof value === 'object' ? Object.entries(value) : [];
const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const normalizeLabel = (value) => text(value).normalize('NFKC').replace(/\s+/g, ' ');
// NFKC handles compatibility forms; fold sharp S and final sigma without stripping accents.
const normalizeSearch = (value) => normalizeLabel(value).toLowerCase().replace(/ß/g, 'ss').replace(/ς/g, 'σ');
const compareYears = (a, b) => {
  if (a === b) return 0;
  if (a === UNKNOWN_YEAR) return 1;
  if (b === UNKNOWN_YEAR) return -1;
  return compareText(b, a);
};

function startYear(memory) {
  const date = parseDateOnlyLocal(memory?.startDate);
  return date ? String(date.getFullYear()) : '';
}

function memoryDate(memory) {
  const start = parseDateOnlyLocal(memory?.startDate);
  if (start) return start.getTime();
  if (memory?.archivedAt === null || memory?.archivedAt === undefined || memory?.archivedAt === '') return 0;
  const timestamp = new Date(memory.archivedAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function memoryEntries(memories) {
  return entries(memories)
    .filter(([, memory]) => memory && typeof memory === 'object')
    .map(([roomId, memory]) => ({ ...memory, roomId }))
    .sort((a, b) => memoryDate(b) - memoryDate(a) || compareText(a.roomId, b.roomId));
}

function confirmedVisits(memory) {
  return entries(memory?.visits)
    .filter(([, visit]) => visit?.status === 'visited')
    .sort(([a], [b]) => compareText(a, b));
}

function coordinates(value) {
  const numeric = (coordinate) => typeof coordinate === 'number' || typeof coordinate === 'string';
  return numeric(value?.lat) && numeric(value?.lng) && isValidCoordinates(value.lat, value.lng)
    ? { lat: Number(value.lat), lng: Number(value.lng) }
    : { lat: null, lng: null };
}

export function getMemoryYear(memory) {
  const year = startYear(memory);
  if (year) return year;
  if (memory?.archivedAt === null || memory?.archivedAt === undefined || memory?.archivedAt === '') return UNKNOWN_YEAR;
  const date = new Date(memory.archivedAt);
  return Number.isFinite(date.getTime()) ? String(date.getFullYear()) : UNKNOWN_YEAR;
}

export function groupMemories(memories, query = '') {
  const search = normalizeSearch(query);
  const groups = new Map();
  for (const memory of memoryEntries(memories)) {
    if (memory.archived !== true) continue;
    const searchable = [memory.title, memory.destination, memory.note,
      ...entries(memory.visits).flatMap(([, visit]) => [visit?.city, visit?.name])];
    if (search && !searchable.some((value) => normalizeSearch(value).includes(search))) continue;
    const year = getMemoryYear(memory);
    if (!groups.has(year)) groups.set(year, []);
    groups.get(year).push(memory);
  }
  return [...groups].sort(([a], [b]) => compareYears(a, b)).map(([year, group]) => ({ year, memories: group }));
}

export function buildFootprints(memories) {
  const cities = new Map();
  for (const memory of memoryEntries(memories)) {
    for (const [visitId, visit] of confirmedVisits(memory)) {
      const city = normalizeLabel(visit.city);
      if (!city) continue;
      const id = normalizeSearch(city);
      if (!cities.has(id)) cities.set(id, { id, city, visits: [], lat: null, lng: null });
      const footprint = cities.get(id);
      footprint.visits.push({ ...visit, visitId, roomId: memory.roomId, tripTitle: text(memory.title), year: getMemoryYear(memory) });
      if (footprint.lat === null) {
        const position = coordinates(visit);
        if (position.lat !== null) Object.assign(footprint, position);
      }
    }
  }
  return [...cities.values()].sort((a, b) => compareText(a.id, b.id)).map((city) => ({
    ...city,
    tripCount: new Set(city.visits.map((visit) => visit.roomId)).size,
    years: [...new Set(city.visits.map((visit) => visit.year))].sort(compareYears),
  }));
}

export function buildAnnualReview(memories, year) {
  const selectedYear = String(year);
  const selected = memoryEntries(memories).filter((memory) => startYear(memory) === selectedYear
    && (memory.archived === true || confirmedVisits(memory).length > 0));
  return {
    year: selectedYear,
    tripCount: selected.length,
    placeCount: selected.reduce((count, memory) => count + confirmedVisits(memory).length, 0),
    cityCount: buildFootprints(Object.fromEntries(selected.map((memory) => [memory.roomId, memory]))).length,
    memories: selected,
  };
}

export function collectionProgress(collection, memories) {
  const items = collection?.deleted ? [] : entries(collection?.items).map(([, item]) => item);
  const total = items.length;
  const visited = items.filter((item) => memories?.[item?.roomId]?.visits?.[item?.visitId]?.status === 'visited').length;
  return { total, visited, wishlist: total - visited, complete: total > 0 && visited === total };
}

export function buildPassportStamps(memories, collections) {
  const stamps = [];
  for (const memory of memoryEntries(memories)) {
    for (const [key, label] of entries(memory.firsts).sort(([a], [b]) => compareText(a, b))) {
      if (!text(label)) continue;
      stamps.push({ id: `first:${memory.roomId}:${key}`, title: text(label), kind: 'first', roomId: memory.roomId, description: text(memory.title) });
    }
  }
  for (const city of buildFootprints(memories)) {
    if (city.tripCount < 2) continue;
    stamps.push({ id: `return:${city.id}`, title: `重遊 ${city.city}`, kind: 'return', roomId: city.visits[0].roomId, description: `${city.tripCount} 趟旅行的足跡` });
  }
  for (const [id, collection] of entries(collections).sort(([a], [b]) => compareText(a, b))) {
    if (!collectionProgress(collection, memories).complete) continue;
    const source = entries(collection.items).sort(([a], [b]) => compareText(a, b))[0][1];
    stamps.push({ id: `collection:${id}`, title: text(collection.title) || '完成收藏', kind: 'collection', roomId: source.roomId, description: `${entries(collection.items).length} 個地點全部到訪` });
  }
  return stamps;
}

export function buildShareText(memories, selectedRoomIds = []) {
  if (!Array.isArray(selectedRoomIds)) return '';
  return [...new Set(selectedRoomIds)].flatMap((roomId) => {
    const memory = memories?.[roomId];
    if (!memory || typeof memory !== 'object') return [];
    const dates = [text(memory.startDate), text(memory.endDate)].filter(Boolean).join(' — ');
    const cityLabels = new Map();
    for (const [, visit] of confirmedVisits(memory)) {
      const city = normalizeLabel(visit.city);
      if (city && !cityLabels.has(normalizeSearch(city))) cityLabels.set(normalizeSearch(city), city);
    }
    return [[text(memory.title), dates, text(memory.destination), text(memory.note), [...cityLabels.values()].join('、')].filter(Boolean).join('\n')];
  }).filter(Boolean).join('\n\n');
}

const encodeVisitKeyPart = (value) => encodeURIComponent(value).replace(/[.~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export function extractVisitCandidates(itinerary, startDate) {
  const days = new Map(entries(itinerary));
  const start = parseDateOnlyLocal(startDate);
  const candidates = [];
  const seen = new Set();
  for (const dayId of sortDayIds([...days.keys()])) {
    const date = start ? new Date(start) : null;
    if (date) date.setDate(date.getDate() + getDayNumber(dayId) - 1);
    const dateText = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '';
    for (const [, item] of entries(days.get(dayId))) {
      if (!item || !text(item.name) || !['string', 'number'].includes(typeof item.id)) continue;
      const itemId = String(item.id).trim();
      if (!itemId || (item.type !== undefined && item.type !== 'place' && item.type !== 'attraction')) continue;
      const visitId = `${encodeVisitKeyPart(dayId)}~${encodeVisitKeyPart(itemId)}`;
      if (seen.has(visitId)) continue;
      seen.add(visitId);
      candidates.push({ visitId, dayId, itemId, name: text(item.name), ...coordinates(item), date: dateText });
    }
  }
  return candidates;
}
