import { env } from 'node:process';

import {
  CollaborationError,
  isActiveMember,
  requireGoogleIdentity,
} from './domain.js';
import { createTdxParkingProvider } from './parkingTdxProvider.js';
import { validateParkingSearchRequest } from './parkingValidation.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const MAX_PROVIDER_RESULTS = 30;

export const PARKING_SEARCH_LIMIT_PER_MINUTE = 10;
export const PARKING_SEARCH_LIMIT_PER_HOUR = 60;

const fail = (code, message) => {
  throw new CollaborationError(code, message);
};

const boundedText = (value, maximumLength) => String(value ?? '').trim().slice(0, maximumLength);

const defaultCredentials = () => ({
  clientId: env.TDX_CLIENT_ID || '',
  clientSecret: env.TDX_CLIENT_SECRET || '',
});

const validAclVersion = (value) => Number.isSafeInteger(value) && value > 0;

const normalizeProviderResult = (result) => {
  const allowedStatuses = new Set([
    'ok',
    'outside_coverage',
    'not_configured',
    'timeout',
    'unavailable',
  ]);
  return {
    providerStatus: allowedStatuses.has(result?.providerStatus)
      ? result.providerStatus
      : 'unavailable',
    ...(boundedText(result?.city, 40) ? { city: boundedText(result.city, 40) } : {}),
    ...(boundedText(result?.fetchedAt, 80)
      ? { fetchedAt: boundedText(result.fetchedAt, 80) }
      : {}),
    facilities: Array.isArray(result?.facilities)
      ? result.facilities.slice(0, MAX_PROVIDER_RESULTS)
      : [],
  };
};

const canonicalCoordinate = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    return null;
  }
  const coordinate = Number(value);
  return Number.isFinite(coordinate) ? coordinate : null;
};

const dayItems = (value) => {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
};

export const createParkingService = ({
  database,
  fetchImpl = globalThis.fetch,
  clock = Date.now,
  getCredentials = defaultCredentials,
  provider = null,
  minuteQuotaLimit = PARKING_SEARCH_LIMIT_PER_MINUTE,
  hourlyQuotaLimit = PARKING_SEARCH_LIMIT_PER_HOUR,
  logger = null,
} = {}) => {
  if (!database) throw new TypeError('database is required.');
  if (typeof getCredentials !== 'function') {
    throw new TypeError('getCredentials must be a function.');
  }
  const minuteLimit = Number(minuteQuotaLimit);
  const hourlyLimit = Number(hourlyQuotaLimit);
  if (!Number.isSafeInteger(minuteLimit) || minuteLimit < 1) {
    throw new TypeError('minuteQuotaLimit must be a positive integer.');
  }
  if (!Number.isSafeInteger(hourlyLimit) || hourlyLimit < 1) {
    throw new TypeError('hourlyQuotaLimit must be a positive integer.');
  }
  const tdxProvider = provider || createTdxParkingProvider({ fetchImpl, clock });

  const requireRoomAccess = async (roomId, profile) => {
    const access = (await database.ref(`roomAccess/${roomId}`).get()).val();
    const member = access?.members?.[profile.uid];
    const owner = access?.members?.[access?.ownerUid];
    if (
      access?.state !== 'ready'
      || !isActiveMember(member)
      || member.uid !== profile.uid
      || !validAclVersion(member.aclVersion)
      || !isActiveMember(owner)
      || owner.role !== 'owner'
      || owner.uid !== access.ownerUid
      || !validAclVersion(owner.aclVersion)
    ) {
      fail('permission-denied', '你不是此旅程的有效成員。');
    }
    return access;
  };

  const resolveCanonicalPlace = async ({ roomId, dayId, placeId }, access) => {
    const [ownerSnapshot, daySnapshot] = await Promise.all([
      database.ref(`rooms/${roomId}/meta/ownerUid`).get(),
      database.ref(`rooms/${roomId}/itinerary/${dayId}`).get(),
    ]);
    if (ownerSnapshot.val() !== access.ownerUid) {
      fail('permission-denied', '旅程擁有者權限狀態不一致。');
    }

    const place = dayItems(daySnapshot.val())
      .find((item) => String(item?.id || '') === placeId);
    if (!place) fail('not-found', '找不到指定的行程地點。');
    const lat = canonicalCoordinate(place.lat);
    const lng = canonicalCoordinate(place.lng);
    if (lat === null || lat < -90 || lat > 90 || lng === null || lng < -180 || lng > 180) {
      fail('failed-precondition', '此行程地點缺少可用座標。');
    }
    return { lat, lng };
  };

  const consumeQuota = async (uid) => {
    const now = Number(clock());
    const quotaRef = database.ref(`userQuotas/${uid}/parkingSearch`);
    const result = await quotaRef.transaction(
      (current) => {
        const previous = current && typeof current === 'object' ? current : {};
        const previousMinuteStart = Number(previous.minuteWindowStartedAt) || now;
        const previousHourStart = Number(previous.hourWindowStartedAt) || now;
        const resetMinute = now - previousMinuteStart >= MINUTE_MS;
        const resetHour = now - previousHourStart >= HOUR_MS;
        const minuteWindowStartedAt = resetMinute ? now : previousMinuteStart;
        const hourWindowStartedAt = resetHour ? now : previousHourStart;
        const minuteCount = resetMinute ? 0 : Number(previous.minuteCount) || 0;
        const hourCount = resetHour ? 0 : Number(previous.hourCount) || 0;
        if (minuteCount >= minuteLimit || hourCount >= hourlyLimit) return undefined;
        return {
          minuteWindowStartedAt,
          minuteCount: minuteCount + 1,
          hourWindowStartedAt,
          hourCount: hourCount + 1,
          updatedAt: now,
        };
      },
      undefined,
      false,
    );
    if (!result.committed) {
      fail(
        'resource-exhausted',
        `停車場查詢每分鐘最多 ${minuteLimit} 次、每小時最多 ${hourlyLimit} 次。`,
      );
    }
  };

  return {
    async searchParking(data, auth) {
      const profile = requireGoogleIdentity(auth);
      const request = validateParkingSearchRequest(data);
      const access = await requireRoomAccess(request.roomId, profile);
      const coordinates = await resolveCanonicalPlace(request, access);
      await consumeQuota(profile.uid);

      try {
        const credentials = await getCredentials();
        return normalizeProviderResult(await tdxProvider.search({
          ...coordinates,
          radius: request.radius,
          clientId: boundedText(credentials?.clientId, 512),
          clientSecret: boundedText(credentials?.clientSecret, 2_048),
        }));
      } catch (error) {
        const timedOut = error?.name === 'AbortError';
        logger?.warn?.('TDX parking provider unavailable.', {
          errorName: boundedText(error?.name, 80) || 'Error',
        });
        return {
          providerStatus: timedOut ? 'timeout' : 'unavailable',
          facilities: [],
        };
      }
    },
  };
};
