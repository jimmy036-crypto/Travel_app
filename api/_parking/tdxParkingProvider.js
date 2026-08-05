import { normalizeTdxPayload } from './normalizeTdxParking.js';
import { getTdxAccessToken } from './tdxAuth.js';

const API_ROOT = 'https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet';
const STATIC_TTL_MS = 6 * 60 * 60 * 1000;
const AVAILABILITY_TTL_MS = 3 * 60 * 1000;
const staticCache = new Map();
const availabilityCache = new Map();
const AVAILABILITY_CITIES = new Set([
  'Taipei', 'Taoyuan', 'Taichung', 'Tainan', 'Kaohsiung', 'Keelung',
  'ChanghuaCounty', 'YunlinCounty', 'PingtungCounty', 'YilanCounty',
  'HualienCounty', 'KinmenCounty',
]);

const CITY_CENTERS = [
  ['Taipei', 25.05, 121.55], ['Keelung', 25.13, 121.74], ['Taoyuan', 24.99, 121.30],
  ['Hsinchu', 24.81, 120.97], ['HsinchuCounty', 24.84, 121.02], ['MiaoliCounty', 24.56, 120.82],
  ['Taichung', 24.15, 120.68], ['ChanghuaCounty', 24.08, 120.54], ['NantouCounty', 23.91, 120.68],
  ['YunlinCounty', 23.71, 120.43], ['Chiayi', 23.48, 120.45], ['ChiayiCounty', 23.46, 120.26],
  ['Tainan', 22.99, 120.20], ['Kaohsiung', 22.63, 120.30], ['PingtungCounty', 22.67, 120.49],
  ['YilanCounty', 24.75, 121.75], ['HualienCounty', 23.99, 121.61], ['TaitungCounty', 22.76, 121.15],
  ['KinmenCounty', 24.44, 118.32], ['LienchiangCounty', 26.16, 119.95],
];

const nearestCity = (lat, lng) => CITY_CENTERS.reduce((best, city) => {
  const score = ((lat - city[1]) ** 2) + ((lng - city[2]) ** 2);
  return !best || score < best.score ? { code: city[0], score } : best;
}, null)?.code;

const fromCache = (cache, key, ttl, now) => {
  const cached = cache.get(key);
  return cached && now - cached.storedAt < ttl ? cached.value : null;
};

async function fetchJson(url, token, { fetchImpl, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${token}` }, signal: controller.signal });
    if (!response.ok) throw new Error(`TDX request failed (${response.status})`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

const optionalFetchJson = async (...args) => {
  try {
    return await fetchJson(...args);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return null;
  }
};

const unwrap = (payload, keys) => {
  for (const key of keys) if (Array.isArray(payload?.[key])) return payload[key];
  return Array.isArray(payload?.value) ? payload.value : [];
};

export async function searchTdxParking({ lat, lng, radius, clientId, clientSecret, fetchImpl = fetch, now = Date.now(), timeoutMs = 6000 }) {
  if (lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.2) return { providerStatus: 'outside_coverage', facilities: [] };
  const token = await getTdxAccessToken({ clientId, clientSecret, fetchImpl, now, timeoutMs });
  if (!token) return { providerStatus: 'not_configured', facilities: [] };
  const city = nearestCity(lat, lng);
  const deltaLat = radius / 111320;
  const deltaLng = radius / (111320 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const filter = `CarParkPosition/PositionLat ge ${lat - deltaLat} and CarParkPosition/PositionLat le ${lat + deltaLat} and CarParkPosition/PositionLon ge ${lng - deltaLng} and CarParkPosition/PositionLon le ${lng + deltaLng}`;
  const query = new URLSearchParams({ '$filter': filter, '$top': '30', '$format': 'JSON' });
  const staticKey = `${city}:${filter}`;
  let staticValue = fromCache(staticCache, staticKey, STATIC_TTL_MS, now);
  if (!staticValue) {
    const [carParks, rates] = await Promise.all([
      fetchJson(`${API_ROOT}/CarPark/City/${city}?${query}`, token, { fetchImpl, timeoutMs }),
      optionalFetchJson(`${API_ROOT}/ParkingRate/City/${city}?${new URLSearchParams({ '$top': '300', '$format': 'JSON' })}`, token, { fetchImpl, timeoutMs }),
    ]);
    staticValue = { carParks: unwrap(carParks, ['CarParks']), rates: unwrap(rates, ['ParkingRates']) };
    staticCache.set(staticKey, { value: staticValue, storedAt: now });
  }
  let availabilities = fromCache(availabilityCache, city, AVAILABILITY_TTL_MS, now);
  if (!availabilities && AVAILABILITY_CITIES.has(city)) {
    const payload = await optionalFetchJson(`${API_ROOT}/ParkingAvailability/City/${city}?${new URLSearchParams({ '$top': '300', '$format': 'JSON' })}`, token, { fetchImpl, timeoutMs });
    availabilities = unwrap(payload, ['ParkingAvailabilities']);
    availabilityCache.set(city, { value: availabilities, storedAt: now });
  }
  availabilities ||= [];
  const fetchedAt = new Date(now).toISOString();
  return {
    providerStatus: 'ok',
    city,
    fetchedAt,
    facilities: normalizeTdxPayload({ ...staticValue, availabilities, fetchedAt }),
  };
}
