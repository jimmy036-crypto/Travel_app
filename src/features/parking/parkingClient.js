import { httpsCallable } from 'firebase/functions';

import { functions as defaultFunctions } from '../../firebase.js';
import { createParkingFacility, haversineMeters, normalizeGoogleParkingPlace } from './parkingFacilityModel.js';
import { mergeParkingProviders } from './parkingProviderMerge.js';
import { parseParkingTariff } from './parkingTariffModel.js';

const SESSION_CACHE_TTL_MS = 2 * 60 * 1000;
const SESSION_CACHE_MAX_ENTRIES = 20;
const sessionCache = new Map();

const cacheKey = (roomId, dayId, placeId, anchor, radius) => [
  roomId || 'local',
  dayId || 'local-day',
  placeId || 'local-place',
  Number(anchor.lat).toFixed(5),
  Number(anchor.lng).toFixed(5),
  radius,
].join(':');

const storeSessionResult = (key, value) => {
  sessionCache.delete(key);
  sessionCache.set(key, { storedAt: Date.now(), value });
  while (sessionCache.size > SESSION_CACHE_MAX_ENTRIES) {
    sessionCache.delete(sessionCache.keys().next().value);
  }
};

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

const callableFailureStatus = (error) => {
  const code = String(error?.code || '').replace(/^functions\//u, '');
  if (code === 'resource-exhausted') return 'rate_limited';
  if (code === 'unauthenticated' || code === 'permission-denied') return 'access_denied';
  return error?.name === 'AbortError' ? 'timeout' : 'unavailable';
};

async function searchTdx({ roomId, dayId, placeId, anchor, radius, signal, functionsInstance }) {
  if (!roomId) return { providerStatus: 'not_available_for_local_trip', facilities: [] };
  if (!functionsInstance) return { providerStatus: 'unavailable', facilities: [] };
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const callable = httpsCallable(functionsInstance, 'searchParking');
  const response = await callable({ roomId, dayId, placeId, radius });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const payload = response?.data && typeof response.data === 'object' ? response.data : {};
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

export async function searchNearbyParking({
  roomId,
  dayId,
  placeId,
  anchor,
  radius,
  placesLib,
  signal,
  functionsInstance = defaultFunctions,
}) {
  const key = cacheKey(roomId, dayId, placeId, anchor, radius);
  const cached = sessionCache.get(key);
  if (cached && Date.now() - cached.storedAt < SESSION_CACHE_TTL_MS) return { ...cached.value, cacheHit: true };
  if (cached) sessionCache.delete(key);
  const [googleResult, tdxResult] = await Promise.allSettled([
    searchGoogleParking({ anchor, radius, placesLib }),
    searchTdx({ roomId, dayId, placeId, anchor, radius, signal, functionsInstance }),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const googleFacilities = googleResult.status === 'fulfilled' ? googleResult.value : [];
  const tdx = tdxResult.status === 'fulfilled'
    ? tdxResult.value
    : { providerStatus: callableFailureStatus(tdxResult.reason), facilities: [] };
  if (googleResult.status === 'rejected' && tdx.facilities.length === 0) throw new Error('all_providers_unavailable');
  const value = {
    facilities: mergeParkingProviders(googleFacilities, tdx.facilities).slice(0, 8),
    googleStatus: googleResult.status === 'fulfilled' ? 'ok' : 'unavailable',
    tdxStatus: tdx.providerStatus,
    cacheHit: false,
  };
  if (!['access_denied', 'rate_limited', 'timeout', 'unavailable'].includes(value.tdxStatus)) {
    storeSessionResult(key, value);
  }
  return value;
}

export const clearParkingSessionCacheForTest = () => sessionCache.clear();
