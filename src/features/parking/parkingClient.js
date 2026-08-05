import { createParkingFacility, haversineMeters, normalizeGoogleParkingPlace } from './parkingFacilityModel.js';
import { mergeParkingProviders } from './parkingProviderMerge.js';
import { parseParkingTariff } from './parkingTariffModel.js';

const SESSION_CACHE_TTL_MS = 2 * 60 * 1000;
const sessionCache = new Map();

const cacheKey = (anchor, radius) => `${Number(anchor.lat).toFixed(5)}:${Number(anchor.lng).toFixed(5)}:${radius}`;

async function searchGoogleParking({ anchor, radius, placesLib }) {
  if (!placesLib?.Place?.searchNearby) throw new Error('google_unavailable');
  const { places = [] } = await placesLib.Place.searchNearby({
    fields: ['id', 'displayName', 'formattedAddress', 'location', 'businessStatus', 'regularOpeningHours', 'utcOffsetMinutes', 'googleMapsURI'],
    includedPrimaryTypes: ['parking'],
    locationRestriction: { center: anchor, radius },
    maxResultCount: 8,
    rankPreference: 'DISTANCE',
    language: 'zh-TW',
  });
  const facilities = await Promise.all(places.slice(0, 8).map((place) => normalizeGoogleParkingPlace(place, anchor)));
  return facilities.filter((facility) => facility.location.lat !== null && facility.location.lng !== null);
}

async function searchTdx({ anchor, radius, signal, fetchImpl }) {
  const query = new URLSearchParams({ lat: String(anchor.lat), lng: String(anchor.lng), radius: String(radius) });
  const response = await fetchImpl(`/api/parking/search?${query}`, { signal, headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`parking_api_${response.status}`);
  const payload = await response.json();
  const facilities = (Array.isArray(payload.facilities) ? payload.facilities : []).map((facility) => {
    const tariff = parseParkingTariff(facility?.tariff?.rawText, facility?.tariff?.currency || 'TWD');
    return createParkingFacility({
      ...facility,
      tariff: { ...tariff, updatedAt: facility?.tariff?.updatedAt || null },
      distanceToDestinationMeters: haversineMeters(anchor, facility.location),
    });
  });
  return { providerStatus: payload.providerStatus || 'unavailable', facilities };
}

export async function searchNearbyParking({ anchor, radius, placesLib, signal, fetchImpl = fetch }) {
  const key = cacheKey(anchor, radius);
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.storedAt < SESSION_CACHE_TTL_MS) return { ...cached.value, cacheHit: true };
  const [googleResult, tdxResult] = await Promise.allSettled([
    searchGoogleParking({ anchor, radius, placesLib }),
    searchTdx({ anchor, radius, signal, fetchImpl }),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const googleFacilities = googleResult.status === 'fulfilled' ? googleResult.value : [];
  const tdx = tdxResult.status === 'fulfilled'
    ? tdxResult.value
    : { providerStatus: tdxResult.reason?.name === 'AbortError' ? 'timeout' : 'unavailable', facilities: [] };
  if (googleResult.status === 'rejected' && tdx.facilities.length === 0) throw new Error('all_providers_unavailable');
  const value = {
    facilities: mergeParkingProviders(googleFacilities, tdx.facilities).slice(0, 8),
    googleStatus: googleResult.status === 'fulfilled' ? 'ok' : 'unavailable',
    tdxStatus: tdx.providerStatus,
    cacheHit: false,
  };
  sessionCache.set(key, { storedAt: Date.now(), value });
  return value;
}

export const clearParkingSessionCacheForTest = () => sessionCache.clear();
