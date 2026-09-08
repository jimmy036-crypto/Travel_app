const validCoordinate = (value) => value !== null && value !== '' && Number.isFinite(Number(value));

export function resolveExploreOrigin({ context, dayId, places }) {
  if (context?.scope !== 'place' || String(context.dayId) !== String(dayId)) return null;
  return (Array.isArray(places) ? places : []).find(
    (place) => String(place?.id) === String(context.placeId),
  ) || null;
}

export function createExploreSearchRequest({ query, scope, origin, bounds, center }) {
  const safeQuery = String(query || '').trim();
  if (!safeQuery) return null;

  if (scope === 'place') {
    if (!validCoordinate(origin?.lat) || !validCoordinate(origin?.lng)) return null;
    return {
      query: safeQuery,
      location: { lat: Number(origin.lat), lng: Number(origin.lng) },
      radius: 1500,
    };
  }

  if (bounds) return { query: safeQuery, bounds };
  if (center) return { query: safeQuery, location: center, radius: 2000 };
  return null;
}
