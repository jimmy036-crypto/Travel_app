const TDX_TOKEN_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_API_ROOT = 'https://tdx.transportdata.tw/api/basic/v1/Parking/OffStreet';
const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;
const STATIC_TTL_MS = 6 * 60 * 60 * 1000;
const AVAILABILITY_TTL_MS = 3 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 6_000;
const MAX_PROVIDER_RESULTS = 30;
const MAX_RATE_RECORDS = 300;
const MAX_AVAILABILITY_RECORDS = 300;

export const PARKING_PROVIDER_CACHE_LIMITS = Object.freeze({
  token: 1,
  static: 64,
  rates: 24,
  availability: 24,
});

const AVAILABILITY_CITIES = new Set([
  'Taipei',
  'Taoyuan',
  'Taichung',
  'Tainan',
  'Kaohsiung',
  'Keelung',
  'ChanghuaCounty',
  'YunlinCounty',
  'PingtungCounty',
  'YilanCounty',
  'HualienCounty',
  'KinmenCounty',
]);

const CITY_CENTERS = [
  ['Taipei', 25.05, 121.55],
  ['Keelung', 25.13, 121.74],
  ['Taoyuan', 24.99, 121.30],
  ['Hsinchu', 24.81, 120.97],
  ['HsinchuCounty', 24.84, 121.02],
  ['MiaoliCounty', 24.56, 120.82],
  ['Taichung', 24.15, 120.68],
  ['ChanghuaCounty', 24.08, 120.54],
  ['NantouCounty', 23.91, 120.68],
  ['YunlinCounty', 23.71, 120.43],
  ['Chiayi', 23.48, 120.45],
  ['ChiayiCounty', 23.46, 120.26],
  ['Tainan', 22.99, 120.20],
  ['Kaohsiung', 22.63, 120.30],
  ['PingtungCounty', 22.67, 120.49],
  ['YilanCounty', 24.75, 121.75],
  ['HualienCounty', 23.99, 121.61],
  ['TaitungCounty', 22.76, 121.15],
  ['KinmenCounty', 24.44, 118.32],
  ['LienchiangCounty', 26.16, 119.95],
];

const boundedText = (value, maximumLength) => String(value ?? '').trim().slice(0, maximumLength);

const localizedText = (value, maximumLength) => boundedText(
  value?.Zh_tw || value?.En || value,
  maximumLength,
);

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const nearestCity = (lat, lng) => CITY_CENTERS.reduce((best, city) => {
  const score = ((lat - city[1]) ** 2) + ((lng - city[2]) ** 2);
  return !best || score < best.score ? { code: city[0], score } : best;
}, null)?.code;

const normalizeTdxPayload = ({
  carParks = [],
  rates = [],
  availabilities = [],
  fetchedAt,
}) => {
  const rateById = new Map(rates.map((rate) => [boundedText(rate?.CarParkID, 200), rate]));
  const availabilityById = new Map(
    availabilities.map((availability) => [
      boundedText(availability?.CarParkID, 200),
      availability,
    ]),
  );

  return carParks.slice(0, MAX_PROVIDER_RESULTS).map((carPark) => {
    const providerFacilityId = boundedText(carPark?.CarParkID, 200);
    const rate = rateById.get(providerFacilityId);
    const availability = availabilityById.get(providerFacilityId);
    const lat = numberOrNull(carPark?.CarParkPosition?.PositionLat);
    const lng = numberOrNull(carPark?.CarParkPosition?.PositionLon);
    const availableSpaces = numberOrNull(
      availability?.AvailableSpaces ?? availability?.Availabilities?.[0]?.AvailableSpaces,
    );
    const totalSpaces = numberOrNull(availability?.TotalSpaces ?? carPark?.TotalSpaces);
    const providerUpdatedAt = boundedText(
      availability?.SrcUpdateTime
        || availability?.UpdateTime
        || rate?.UpdateTime
        || carPark?.UpdateTime,
      80,
    ) || null;
    const rawText = boundedText(
      carPark?.FareDescription || rate?.FareDescription || rate?.Description,
      1_000,
    ) || null;
    const serviceStatus = Number(availability?.ServiceStatus);

    return {
      id: `tdx:${providerFacilityId}`,
      provider: 'tdx',
      providerFacilityId,
      googlePlaceId: null,
      name: localizedText(carPark?.CarParkName, 160) || 'TDX 官方停車場',
      address: boundedText(carPark?.Address, 300) || null,
      location: { lat, lng },
      opening: {
        isOpen: serviceStatus === 1 ? true : null,
        text: serviceStatus === 1 ? '營業中' : '營業狀態未知',
      },
      availability: {
        status: availableSpaces === null
          ? 'unknown'
          : availableSpaces > 0 ? 'available' : 'full',
        availableSpaces,
        totalSpaces,
        updatedAt: providerUpdatedAt,
        confidence: availableSpaces === null ? 'unknown' : 'high',
      },
      tariff: {
        currency: rawText ? 'TWD' : null,
        rawText,
        rules: [],
        hourlyEquivalent: null,
        displaySummary: rawText || '費率資料未提供',
        confidence: rawText ? 'official_raw' : 'unknown',
        updatedAt: boundedText(rate?.UpdateTime || carPark?.UpdateTime, 80) || null,
      },
      restrictions: {
        vehicleType: 'car',
        maxHeightMeters: numberOrNull(carPark?.MaximumVehicleHeight),
        reservation: carPark?.ReservationAvailable === 1 ? true : null,
        evCharging: carPark?.EVRechargingAvailable === 1 ? true : null,
      },
      source: {
        label: 'TDX 運輸資料流通服務',
        url: 'https://tdx.transportdata.tw/',
        providerUpdatedAt,
        fetchedAt,
      },
      navigationUrl: null,
      matchConfidence: 'official',
    };
  }).filter((facility) => (
    facility.providerFacilityId
    && facility.location.lat !== null
    && facility.location.lat >= -90
    && facility.location.lat <= 90
    && facility.location.lng !== null
    && facility.location.lng >= -180
    && facility.location.lng <= 180
  ));
};

const unwrapArray = (payload, keys) => {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return Array.isArray(payload?.value) ? payload.value : [];
};

const readCache = (cache, key, ttlMs, now) => {
  const cached = cache.get(key);
  if (!cached) return null;
  if (now - cached.storedAt >= ttlMs) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, cached);
  return cached.value;
};

const writeBoundedCache = (cache, key, value, storedAt, limit) => {
  cache.delete(key);
  while (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, { value, storedAt });
};

const normalizeLimit = (value, fallback) => {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0
    ? Math.min(numeric, fallback)
    : fallback;
};

const fetchJson = async (url, options, fetchImpl, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal });
    if (!response?.ok) throw new Error(`TDX request failed (${response?.status || 'unknown'}).`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
};

export const createTdxParkingProvider = ({
  fetchImpl = globalThis.fetch,
  clock = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  cacheLimits = PARKING_PROVIDER_CACHE_LIMITS,
} = {}) => {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function.');
  const staticLimit = normalizeLimit(cacheLimits?.static, PARKING_PROVIDER_CACHE_LIMITS.static);
  const rateLimit = normalizeLimit(cacheLimits?.rates, PARKING_PROVIDER_CACHE_LIMITS.rates);
  const availabilityLimit = normalizeLimit(
    cacheLimits?.availability,
    PARKING_PROVIDER_CACHE_LIMITS.availability,
  );
  const staticCache = new Map();
  const rateCache = new Map();
  const availabilityCache = new Map();
  let tokenCache = null;
  let pendingToken = null;

  const getToken = async ({ clientId, clientSecret, now }) => {
    if (!clientId || !clientSecret) return null;
    if (
      tokenCache?.clientId === clientId
      && tokenCache.expiresAt > now + TOKEN_EXPIRY_SKEW_MS
    ) return tokenCache.value;
    if (pendingToken?.clientId === clientId) return pendingToken.promise;

    const tokenPromise = (async () => {
      const payload = await fetchJson(
        TDX_TOKEN_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          }),
        },
        fetchImpl,
        timeoutMs,
      );
      const token = boundedText(payload?.access_token, 8_192);
      if (!token) throw new Error('TDX auth returned no access token.');
      tokenCache = {
        clientId,
        value: token,
        expiresAt: now + Math.max(60, Number(payload?.expires_in) || 300) * 1_000,
      };
      return token;
    })();
    pendingToken = { clientId, promise: tokenPromise };
    try {
      return await tokenPromise;
    } finally {
      if (pendingToken?.promise === tokenPromise) pendingToken = null;
    }
  };

  const authorizedFetch = (url, token) => fetchJson(
    url,
    { headers: { authorization: `Bearer ${token}` } },
    fetchImpl,
    timeoutMs,
  );

  const optionalAuthorizedFetch = async (url, token) => {
    try {
      return await authorizedFetch(url, token);
    } catch {
      return null;
    }
  };

  return {
    async search({ lat, lng, radius, clientId, clientSecret }) {
      if (lat < 21.7 || lat > 26.5 || lng < 118 || lng > 122.2) {
        return { providerStatus: 'outside_coverage', facilities: [] };
      }
      const now = Number(clock());
      const token = await getToken({ clientId, clientSecret, now });
      if (!token) return { providerStatus: 'not_configured', facilities: [] };

      const city = nearestCity(lat, lng);
      const deltaLat = radius / 111_320;
      const deltaLng = radius / (
        111_320 * Math.max(0.2, Math.cos(lat * Math.PI / 180))
      );
      const filter = [
        `CarParkPosition/PositionLat ge ${lat - deltaLat}`,
        `CarParkPosition/PositionLat le ${lat + deltaLat}`,
        `CarParkPosition/PositionLon ge ${lng - deltaLng}`,
        `CarParkPosition/PositionLon le ${lng + deltaLng}`,
      ].join(' and ');
      const query = new URLSearchParams({
        '$filter': filter,
        '$top': String(MAX_PROVIDER_RESULTS),
        '$format': 'JSON',
      });
      const staticKey = `${city}:${filter}`;
      let carParks = readCache(staticCache, staticKey, STATIC_TTL_MS, now);
      let rates = readCache(rateCache, city, STATIC_TTL_MS, now);
      const [carParkPayload, ratePayload] = await Promise.all([
        carParks
          ? null
          : authorizedFetch(`${TDX_API_ROOT}/CarPark/City/${city}?${query}`, token),
        rates
          ? null
          : optionalAuthorizedFetch(
            `${TDX_API_ROOT}/ParkingRate/City/${city}?${new URLSearchParams({
              '$top': '300',
              '$format': 'JSON',
            })}`,
            token,
          ),
      ]);
      if (!carParks) {
        carParks = unwrapArray(carParkPayload, ['CarParks']).slice(0, MAX_PROVIDER_RESULTS);
        writeBoundedCache(staticCache, staticKey, carParks, now, staticLimit);
      }
      if (!rates) {
        rates = unwrapArray(ratePayload, ['ParkingRates']).slice(0, MAX_RATE_RECORDS);
        writeBoundedCache(rateCache, city, rates, now, rateLimit);
      }

      let availabilities = readCache(
        availabilityCache,
        city,
        AVAILABILITY_TTL_MS,
        now,
      );
      if (!availabilities && AVAILABILITY_CITIES.has(city)) {
        const payload = await optionalAuthorizedFetch(
          `${TDX_API_ROOT}/ParkingAvailability/City/${city}?${new URLSearchParams({
            '$top': '300',
            '$format': 'JSON',
          })}`,
          token,
        );
        availabilities = unwrapArray(payload, ['ParkingAvailabilities'])
          .slice(0, MAX_AVAILABILITY_RECORDS);
        writeBoundedCache(
          availabilityCache,
          city,
          availabilities,
          now,
          availabilityLimit,
        );
      }

      const fetchedAt = new Date(now).toISOString();
      return {
        providerStatus: 'ok',
        city,
        fetchedAt,
        facilities: normalizeTdxPayload({
          carParks,
          rates,
          availabilities: availabilities || [],
          fetchedAt,
        }),
      };
    },

    cacheStats() {
      return {
        token: tokenCache ? 1 : 0,
        static: staticCache.size,
        rates: rateCache.size,
        availability: availabilityCache.size,
      };
    },

    resetCachesForTest() {
      tokenCache = null;
      pendingToken = null;
      staticCache.clear();
      rateCache.clear();
      availabilityCache.clear();
    },
  };
};
