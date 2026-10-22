import { sortDayIds } from '../../helpers.js';

export function groupVisitCandidates(candidates, visits = {}) {
  const combined = new Map(candidates.map((place) => [place.visitId, place]));
  Object.entries(visits).forEach(([visitId, place]) => {
    if (!combined.has(visitId)) combined.set(visitId, { ...place, visitId });
  });
  const groups = new Map();
  for (const place of combined.values()) {
    const id = place.source === 'manual' ? 'manual' : place.dayId || 'unassigned';
    if (!groups.has(id)) groups.set(id, { id, date: place.date || '', places: [] });
    groups.get(id).places.push(place);
  }
  const ordered = sortDayIds([...groups.keys()].filter((id) => !['manual', 'unassigned'].includes(id)));
  return [...ordered, 'unassigned', 'manual'].flatMap((id) => groups.has(id) ? [groups.get(id)] : []);
}

export function applyVisitPatch(visits, candidates, selectedIds, patch) {
  const next = { ...visits };
  const places = new Map(candidates.map((place) => [place.visitId, place]));
  for (const visitId of selectedIds) {
    const place = places.get(visitId) || visits[visitId];
    if (!place) continue;
    if (patch.status === '') { delete next[visitId]; continue; }
    const { visitId: _id, ...fields } = place;
    next[visitId] = { city: '', note: '', ...fields, ...visits[visitId], ...patch };
  }
  return next;
}

export const cityKey = (id) => encodeURIComponent(id).replace(/[.~]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);

export function removeCity(draft, cityId) {
  const cities = { ...draft.cities };
  delete cities[cityKey(cityId)];
  const visits = Object.fromEntries(Object.entries(draft.visits).map(([id, visit]) => {
    if (visit.cityId !== cityId) return [id, visit];
    const { cityId: _id, country: _country, cityLat: _lat, cityLng: _lng, ...place } = visit;
    return [id, { ...place, city: '' }];
  }));
  return { ...draft, cities, visits };
}

export function newManualVisit(name) {
  return { visitId: `manual~${crypto.randomUUID()}`, source: 'manual', name: name.trim(), status: 'visited', city: '', note: '' };
}
