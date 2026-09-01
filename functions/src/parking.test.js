import assert from 'node:assert/strict';
import test from 'node:test';

import { CollaborationError } from './domain.js';
import {
  PARKING_PROVIDER_CACHE_LIMITS,
  createParkingService,
  createTdxParkingProvider,
  validateParkingSearchRequest,
} from './parking.js';

const googleOwnerAuth = {
  uid: 'owner-uid',
  token: {
    name: 'Owner',
    firebase: { sign_in_provider: 'google.com' },
  },
};

const googleEditorAuth = {
  uid: 'editor-uid',
  token: {
    name: 'Editor',
    firebase: { sign_in_provider: 'google.com' },
  },
};

const request = Object.freeze({
  roomId: 'room-1',
  dayId: 'Day 1',
  placeId: 'place-1',
  radius: 500,
});

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

const pathSegments = (path) => String(path || '').split('/').filter(Boolean);

const valueAtPath = (root, path) => {
  let current = root;
  for (const segment of pathSegments(path)) {
    if (!current || typeof current !== 'object' || !(segment in current)) return undefined;
    current = current[segment];
  }
  return current;
};

const assignAtPath = (root, path, value) => {
  const segments = pathSegments(path);
  let parent = root;
  for (const segment of segments.slice(0, -1)) {
    if (!parent[segment] || typeof parent[segment] !== 'object') parent[segment] = {};
    parent = parent[segment];
  }
  const key = segments.at(-1);
  if (value === undefined || value === null) delete parent[key];
  else parent[key] = clone(value);
};

class MemorySnapshot {
  constructor(value) {
    this.value = clone(value);
  }

  val() {
    return this.value === undefined ? null : clone(this.value);
  }
}

class MemoryRealtimeDatabase {
  constructor(initial = {}) {
    this.state = clone(initial);
  }

  value(path) {
    return clone(valueAtPath(this.state, path));
  }

  ref(path) {
    return {
      get: async () => new MemorySnapshot(this.value(path)),
      transaction: async (updateValue) => {
        const current = this.value(path);
        const next = updateValue(current === undefined ? null : current);
        if (next === undefined) {
          return { committed: false, snapshot: new MemorySnapshot(current) };
        }
        assignAtPath(this.state, path, next);
        return { committed: true, snapshot: new MemorySnapshot(next) };
      },
    };
  }
}

const memberRecord = ({ uid, role = 'editor', ...overrides }) => ({
  uid,
  role,
  status: 'active',
  aclVersion: 1,
  updatedAt: 1_000,
  ...overrides,
});

const activeDatabaseState = ({
  auth = googleOwnerAuth,
  role = 'owner',
  accessOverrides = {},
  memberOverrides = {},
  placeOverrides = {},
} = {}) => ({
  roomAccess: {
    'room-1': {
      ownerUid: googleOwnerAuth.uid,
      state: 'ready',
      members: {
        [googleOwnerAuth.uid]: memberRecord({
          uid: googleOwnerAuth.uid,
          role: 'owner',
          ...(auth.uid === googleOwnerAuth.uid ? memberOverrides : {}),
        }),
        ...(auth.uid === googleOwnerAuth.uid ? {} : {
          [auth.uid]: memberRecord({ uid: auth.uid, role, ...memberOverrides }),
        }),
      },
      ...accessOverrides,
    },
  },
  rooms: {
    'room-1': {
      meta: { ownerUid: googleOwnerAuth.uid },
      itinerary: {
        'Day 1': [{
          id: 'place-1',
          name: '台北 101',
          lat: 25.033,
          lng: 121.5654,
          ...placeOverrides,
        }],
      },
    },
  },
});

const expectCollaborationError = (code) => (error) => (
  error instanceof CollaborationError && error.code === code
);

const successfulProvider = (calls = []) => ({
  async search(input) {
    calls.push(clone(input));
    return { providerStatus: 'ok', city: 'Taipei', facilities: [] };
  },
});

test('parking search requires Google provider identity before reading Firebase data', async () => {
  let databaseRead = false;
  const database = {
    ref() {
      databaseRead = true;
      throw new Error('Firebase must not be read without Google auth.');
    },
  };
  const service = createParkingService({ database, provider: successfulProvider() });

  await assert.rejects(
    () => service.searchParking(request, null),
    expectCollaborationError('unauthenticated'),
  );
  await assert.rejects(
    () => service.searchParking(request, {
      uid: googleOwnerAuth.uid,
      token: { firebase: { sign_in_provider: 'password' } },
    }),
    expectCollaborationError('permission-denied'),
  );
  assert.equal(databaseRead, false);
});

test('parking request accepts only a canonical day/place selector and radius allow-list', () => {
  assert.deepEqual(validateParkingSearchRequest(request), request);

  for (const invalid of [
    { ...request, roomId: 'room/escape' },
    { ...request, dayId: 'Day 0' },
    { ...request, dayId: 'Day 31' },
    { ...request, dayId: '../Day 1' },
    { ...request, placeId: '' },
    { ...request, placeId: `place-${'x'.repeat(201)}` },
    { ...request, radius: 400 },
    { ...request, radius: '' },
  ]) {
    assert.throws(
      () => validateParkingSearchRequest(invalid),
      expectCollaborationError('invalid-argument'),
    );
  }
});

test('parking search fails closed for every malformed or inactive canonical ACL', async (t) => {
  const cases = [
    ['room is pending', { accessOverrides: { state: 'pending' } }],
    ['member is removed', { memberOverrides: { status: 'removed' } }],
    ['member path uid disagrees with record', { memberOverrides: { uid: 'attacker' } }],
    ['member has no positive ACL version', { memberOverrides: { aclVersion: 0 } }],
    ['member role is unsupported', { memberOverrides: { role: 'viewer' } }],
  ];

  for (const [name, stateOptions] of cases) {
    await t.test(name, async () => {
      const database = new MemoryRealtimeDatabase(activeDatabaseState(stateOptions));
      const calls = [];
      const service = createParkingService({ database, provider: successfulProvider(calls) });
      await assert.rejects(
        () => service.searchParking(request, googleOwnerAuth),
        expectCollaborationError('permission-denied'),
      );
      assert.equal(calls.length, 0);
      assert.equal(database.value('userQuotas/owner-uid/parkingSearch'), undefined);
    });
  }
});

test('parking search resolves coordinates only from the authorized canonical itinerary place', async () => {
  for (const [auth, role] of [[googleOwnerAuth, 'owner'], [googleEditorAuth, 'editor']]) {
    const database = new MemoryRealtimeDatabase(activeDatabaseState({ auth, role }));
    const calls = [];
    const service = createParkingService({
      database,
      provider: successfulProvider(calls),
      getCredentials: () => ({ clientId: 'client-id', clientSecret: 'client-secret' }),
    });
    const result = await service.searchParking(
      { ...request, lat: -90, lng: -180 },
      auth,
    );

    assert.equal(result.providerStatus, 'ok');
    assert.deepEqual(calls, [{
      lat: 25.033,
      lng: 121.5654,
      radius: 500,
      clientId: 'client-id',
      clientSecret: 'client-secret',
    }]);
    assert.equal(database.value(`userQuotas/${auth.uid}/parkingSearch/hourCount`), 1);
  }
});

test('parking search requires access owner and room meta owner to match', async () => {
  const state = activeDatabaseState();
  state.rooms['room-1'].meta.ownerUid = 'different-owner';
  const database = new MemoryRealtimeDatabase(state);
  const calls = [];
  const service = createParkingService({ database, provider: successfulProvider(calls) });

  await assert.rejects(
    () => service.searchParking(request, googleOwnerAuth),
    expectCollaborationError('permission-denied'),
  );
  assert.equal(calls.length, 0);
  assert.equal(database.value('userQuotas/owner-uid/parkingSearch'), undefined);
});

test('parking search resolves an exact place ID from sparse RTDB object values', async () => {
  const state = activeDatabaseState();
  state.rooms['room-1'].itinerary['Day 1'] = {
    4: { id: 'place-1', lat: 25.0478, lng: 121.5319 },
    9: { id: 'place-other', lat: 24.15, lng: 120.68 },
  };
  const database = new MemoryRealtimeDatabase(state);
  const calls = [];
  const service = createParkingService({ database, provider: successfulProvider(calls) });

  await service.searchParking(request, googleOwnerAuth);
  assert.deepEqual(calls[0], {
    lat: 25.0478,
    lng: 121.5319,
    radius: 500,
    clientId: '',
    clientSecret: '',
  });
});

test('parking search rejects missing places and invalid canonical coordinates before quota use', async () => {
  const missingDatabase = new MemoryRealtimeDatabase(activeDatabaseState());
  const missingService = createParkingService({
    database: missingDatabase,
    provider: successfulProvider(),
  });
  await assert.rejects(
    () => missingService.searchParking({ ...request, placeId: 'missing' }, googleOwnerAuth),
    expectCollaborationError('not-found'),
  );
  assert.equal(missingDatabase.value('userQuotas/owner-uid/parkingSearch'), undefined);

  const invalidDatabase = new MemoryRealtimeDatabase(activeDatabaseState({
    placeOverrides: { lat: null },
  }));
  const invalidService = createParkingService({
    database: invalidDatabase,
    provider: successfulProvider(),
  });
  await assert.rejects(
    () => invalidService.searchParking(request, googleOwnerAuth),
    expectCollaborationError('failed-precondition'),
  );
  assert.equal(invalidDatabase.value('userQuotas/owner-uid/parkingSearch'), undefined);
});

test('parking search enforces atomic minute and hourly UID quotas and resets both windows', async () => {
  const database = new MemoryRealtimeDatabase(activeDatabaseState());
  const calls = [];
  let now = 1_000;
  const service = createParkingService({
    database,
    provider: successfulProvider(calls),
    clock: () => now,
    minuteQuotaLimit: 2,
    hourlyQuotaLimit: 3,
  });

  await service.searchParking(request, googleOwnerAuth);
  await service.searchParking(request, googleOwnerAuth);
  await assert.rejects(
    () => service.searchParking(request, googleOwnerAuth),
    expectCollaborationError('resource-exhausted'),
  );

  now += 60_001;
  await service.searchParking(request, googleOwnerAuth);
  await assert.rejects(
    () => service.searchParking(request, googleOwnerAuth),
    expectCollaborationError('resource-exhausted'),
  );
  assert.deepEqual(database.value('userQuotas/owner-uid/parkingSearch'), {
    minuteWindowStartedAt: now,
    minuteCount: 1,
    hourWindowStartedAt: 1_000,
    hourCount: 3,
    updatedAt: now,
  });

  now = 3_601_001;
  await service.searchParking(request, googleOwnerAuth);
  assert.equal(calls.length, 4);
  assert.deepEqual(database.value('userQuotas/owner-uid/parkingSearch'), {
    minuteWindowStartedAt: now,
    minuteCount: 1,
    hourWindowStartedAt: now,
    hourCount: 1,
    updatedAt: now,
  });
});

test('parking provider and credential failures degrade without breaking the callable contract', async () => {
  const database = new MemoryRealtimeDatabase(activeDatabaseState());
  const warnings = [];
  const service = createParkingService({
    database,
    provider: { search: async () => { throw new Error('upstream failed'); } },
    logger: { warn: (...values) => warnings.push(values) },
  });

  assert.deepEqual(await service.searchParking(request, googleOwnerAuth), {
    providerStatus: 'unavailable',
    facilities: [],
  });
  assert.equal(warnings.length, 1);
  assert.equal(database.value('userQuotas/owner-uid/parkingSearch/hourCount'), 1);

  const noCredentialFetch = async () => {
    throw new Error('Provider network must not run without credentials.');
  };
  const notConfigured = createParkingService({
    database: new MemoryRealtimeDatabase(activeDatabaseState()),
    fetchImpl: noCredentialFetch,
    getCredentials: () => ({ clientId: '', clientSecret: '' }),
  });
  assert.deepEqual(await notConfigured.searchParking(request, googleOwnerAuth), {
    providerStatus: 'not_configured',
    facilities: [],
  });

  const timeoutService = createParkingService({
    database: new MemoryRealtimeDatabase(activeDatabaseState()),
    provider: {
      search: async () => {
        throw new DOMException('Timed out', 'AbortError');
      },
    },
  });
  assert.deepEqual(await timeoutService.searchParking(request, googleOwnerAuth), {
    providerStatus: 'timeout',
    facilities: [],
  });

  const normalizedTimeout = createParkingService({
    database: new MemoryRealtimeDatabase(activeDatabaseState()),
    provider: {
      search: async () => ({ providerStatus: 'timeout', facilities: [] }),
    },
  });
  assert.deepEqual(await normalizedTimeout.searchParking(request, googleOwnerAuth), {
    providerStatus: 'timeout',
    facilities: [],
  });
});

const okJson = (payload) => ({
  ok: true,
  status: 200,
  json: async () => payload,
});

test('TDX provider caches token, static records, and availability before expiry', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/token')) {
      return okJson({ access_token: 'mock-token', expires_in: 300 });
    }
    assert.equal(options.headers.authorization, 'Bearer mock-token');
    if (String(url).includes('/CarPark/')) {
      return okJson({
        CarParks: [{
          CarParkID: 'T1',
          CarParkName: { Zh_tw: '官方停車場' },
          Address: '台北市信義區',
          CarParkPosition: { PositionLat: 25.0331, PositionLon: 121.5655 },
          FareDescription: '每小時 60 元',
        }],
      });
    }
    if (String(url).includes('/ParkingRate/')) {
      return okJson({ ParkingRates: [{ CarParkID: 'T1' }] });
    }
    if (String(url).includes('/ParkingAvailability/')) {
      return okJson({
        ParkingAvailabilities: [{
          CarParkID: 'T1',
          AvailableSpaces: 8,
          TotalSpaces: 20,
          SrcUpdateTime: '2026-09-01T00:00:00Z',
        }],
      });
    }
    throw new Error(`Unexpected TDX URL: ${url}`);
  };
  const provider = createTdxParkingProvider({
    fetchImpl,
    clock: () => Date.parse('2026-09-01T00:01:00Z'),
  });
  const input = {
    lat: 25.033,
    lng: 121.5654,
    radius: 500,
    clientId: 'id',
    clientSecret: 'secret',
  };

  const first = await provider.search(input);
  const second = await provider.search(input);
  await provider.search({ ...input, lat: 25.034 });

  // The shifted query refreshes only coordinate-bounded static data. Token,
  // city-wide rates, and city-wide availability remain cached.
  assert.equal(calls.length, 5);
  assert.deepEqual(provider.cacheStats(), {
    token: 1,
    static: 2,
    rates: 1,
    availability: 1,
  });
  assert.deepEqual(second, first);
  assert.deepEqual(first.facilities[0], {
    id: 'tdx:T1',
    provider: 'tdx',
    providerFacilityId: 'T1',
    googlePlaceId: null,
    name: '官方停車場',
    address: '台北市信義區',
    location: { lat: 25.0331, lng: 121.5655 },
    opening: { isOpen: null, text: '營業狀態未知' },
    availability: {
      status: 'available',
      availableSpaces: 8,
      totalSpaces: 20,
      updatedAt: '2026-09-01T00:00:00Z',
      confidence: 'high',
    },
    tariff: {
      currency: 'TWD',
      rawText: '每小時 60 元',
      rules: [],
      hourlyEquivalent: null,
      displaySummary: '每小時 60 元',
      confidence: 'official_raw',
      updatedAt: null,
    },
    restrictions: {
      vehicleType: 'car',
      maxHeightMeters: null,
      reservation: null,
      evCharging: null,
    },
    source: {
      label: 'TDX 運輸資料流通服務',
      url: 'https://tdx.transportdata.tw/',
      providerUpdatedAt: '2026-09-01T00:00:00Z',
      fetchedAt: '2026-09-01T00:01:00.000Z',
    },
    navigationUrl: null,
    matchConfidence: 'official',
  });
});

test('TDX provider keeps optional rate and availability failures non-fatal', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/token')) {
      return okJson({ access_token: 'mock-token', expires_in: 300 });
    }
    if (String(url).includes('/CarPark/')) {
      return okJson({
        CarParks: [{
          CarParkID: 'T2',
          CarParkPosition: { PositionLat: 24.15, PositionLon: 120.68 },
        }],
      });
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const provider = createTdxParkingProvider({ fetchImpl, clock: () => 10_000 });
  const result = await provider.search({
    lat: 24.15,
    lng: 120.68,
    radius: 300,
    clientId: 'id',
    clientSecret: 'secret',
  });

  assert.equal(result.providerStatus, 'ok');
  assert.equal(result.facilities.length, 1);
  assert.deepEqual(result.facilities[0].availability, {
    status: 'unknown',
    availableSpaces: null,
    totalSpaces: null,
    updatedAt: null,
    confidence: 'unknown',
  });
});

test('TDX provider truncates oversized upstream arrays before caching and normalization', async () => {
  const fetchImpl = async (url) => {
    if (String(url).includes('/token')) {
      return okJson({ access_token: 'mock-token', expires_in: 300 });
    }
    if (String(url).includes('/CarPark/')) {
      return okJson({
        CarParks: Array.from({ length: 31 }, (_, index) => ({
          CarParkID: index === 0 ? 'T301' : `T${index}`,
          CarParkPosition: { PositionLat: 25.0331, PositionLon: 121.5655 },
        })),
      });
    }
    if (String(url).includes('/ParkingRate/')) {
      return okJson({
        ParkingRates: Array.from({ length: 301 }, (_, index) => ({
          CarParkID: `T${index + 1}`,
          FareDescription: `費率 ${index + 1}`,
        })),
      });
    }
    if (String(url).includes('/ParkingAvailability/')) {
      return okJson({
        ParkingAvailabilities: Array.from({ length: 301 }, (_, index) => ({
          CarParkID: `T${index + 1}`,
          AvailableSpaces: index + 1,
        })),
      });
    }
    throw new Error(`Unexpected TDX URL: ${url}`);
  };
  const provider = createTdxParkingProvider({ fetchImpl, clock: () => 10_000 });
  const result = await provider.search({
    lat: 25.033,
    lng: 121.5654,
    radius: 300,
    clientId: 'id',
    clientSecret: 'secret',
  });

  assert.equal(result.facilities.length, 30);
  assert.equal(result.facilities[0].providerFacilityId, 'T301');
  assert.equal(result.facilities[0].tariff.rawText, null);
  assert.equal(result.facilities[0].availability.status, 'unknown');
});

test('TDX provider deduplicates concurrent first-token requests', async () => {
  let tokenRequests = 0;
  let resolveToken;
  const tokenResponse = new Promise((resolve) => {
    resolveToken = resolve;
  });
  const fetchImpl = async (url) => {
    if (String(url).includes('/token')) {
      tokenRequests += 1;
      return tokenResponse;
    }
    if (String(url).includes('/CarPark/')) return okJson({ CarParks: [] });
    if (String(url).includes('/ParkingRate/')) return okJson({ ParkingRates: [] });
    if (String(url).includes('/ParkingAvailability/')) {
      return okJson({ ParkingAvailabilities: [] });
    }
    throw new Error(`Unexpected TDX URL: ${url}`);
  };
  const provider = createTdxParkingProvider({ fetchImpl, clock: () => 15_000 });
  const input = {
    lat: 25.033,
    lng: 121.5654,
    radius: 500,
    clientId: 'id',
    clientSecret: 'secret',
  };

  const first = provider.search(input);
  const second = provider.search(input);
  assert.equal(tokenRequests, 1);
  resolveToken(okJson({ access_token: 'mock-token', expires_in: 300 }));
  await Promise.all([first, second]);
  assert.equal(tokenRequests, 1);
  assert.equal(provider.cacheStats().token, 1);
});

test('TDX cache sizes remain bounded while searches move across cities', async () => {
  let tokenRequests = 0;
  const fetchImpl = async (url) => {
    if (String(url).includes('/token')) {
      tokenRequests += 1;
      return okJson({ access_token: 'mock-token', expires_in: 300 });
    }
    if (String(url).includes('/CarPark/')) return okJson({ CarParks: [] });
    if (String(url).includes('/ParkingRate/')) return okJson({ ParkingRates: [] });
    if (String(url).includes('/ParkingAvailability/')) {
      return okJson({ ParkingAvailabilities: [] });
    }
    throw new Error(`Unexpected TDX URL: ${url}`);
  };
  const provider = createTdxParkingProvider({
    fetchImpl,
    clock: () => 20_000,
    cacheLimits: { static: 2, rates: 2, availability: 2 },
  });
  const credentials = { clientId: 'id', clientSecret: 'secret', radius: 300 };

  await provider.search({ ...credentials, lat: 25.05, lng: 121.55 });
  await provider.search({ ...credentials, lat: 24.15, lng: 120.68 });
  await provider.search({ ...credentials, lat: 22.63, lng: 120.30 });

  assert.equal(tokenRequests, 1);
  assert.deepEqual(provider.cacheStats(), {
    token: 1,
    static: 2,
    rates: 2,
    availability: 2,
  });
  assert.equal(PARKING_PROVIDER_CACHE_LIMITS.token, 1);

  provider.resetCachesForTest();
  assert.deepEqual(provider.cacheStats(), {
    token: 0,
    static: 0,
    rates: 0,
    availability: 0,
  });
});

test('TDX provider does not contact the network outside supported Taiwan coverage', async () => {
  let calls = 0;
  const provider = createTdxParkingProvider({
    fetchImpl: async () => {
      calls += 1;
      throw new Error('network should not run');
    },
  });
  assert.deepEqual(await provider.search({
    lat: 35.6762,
    lng: 139.6503,
    radius: 500,
    clientId: 'id',
    clientSecret: 'secret',
  }), {
    providerStatus: 'outside_coverage',
    facilities: [],
  });
  assert.equal(calls, 0);
});
