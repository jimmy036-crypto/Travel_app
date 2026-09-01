import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2eparkingsyncroom0001';
const OUTSIDER_ROOM_ID = 'e2eparkingoutsider0001';

function contextOptions(projectName: string): BrowserContextOptions {
  return {
    ...(projectName === 'Mobile Safari' ? devices['iPhone 13'] : devices['Desktop Chrome']),
    baseURL: 'http://127.0.0.1:4174',
    serviceWorkers: 'block',
  };
}

async function openRoom(browser: Browser, projectName: string) {
  const context = await browser.newContext(contextOptions(projectName));
  const page = await context.newPage();
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({ timeout: 20_000 });
  return { context, page };
}

async function openMap(page: Page, projectName: string) {
  if (projectName === 'Mobile Safari') {
    await page.getByTestId('mobile-nav-map').click();
  }
  await expect(page.getByTestId('map-panel')).toBeVisible();
}

async function installDeterministicProvider(page: Page) {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __TRAVEL_E2E__?: Record<string, unknown> & {
        parkingSearchCalls?: number;
        searchParking?: () => Promise<unknown>;
      };
    };
    target.__TRAVEL_E2E__ ||= {};
    target.__TRAVEL_E2E__.parkingSearchCalls = 0;
    target.__TRAVEL_E2E__.searchParking = async () => {
      target.__TRAVEL_E2E__!.parkingSearchCalls = Number(target.__TRAVEL_E2E__!.parkingSearchCalls || 0) + 1;
      const facility = (id: string, name: string, distance: number) => ({
        id,
        provider: 'tdx',
        providerFacilityId: id,
        googlePlaceId: null,
        name,
        address: '台北市信義區',
        location: { lat: 25.033, lng: 121.5654 },
        distanceToDestinationMeters: distance,
        walkingMinutes: Math.ceil(distance / 80),
        opening: { isOpen: true, text: '營業中' },
        availability: { status: 'available', availableSpaces: 12, totalSpaces: 30, updatedAt: '2026-08-05T00:00:00Z', confidence: 'high' },
        tariff: { currency: 'TWD', rawText: '每小時 60 元', rules: [{ type: 'linear', unitMinutes: 60, unitPrice: 60 }], hourlyEquivalent: 60, displaySummary: '約 NT$60／小時', confidence: 'high', updatedAt: '2026-08-05T00:00:00Z' },
        restrictions: { vehicleType: 'car', maxHeightMeters: 1.9, reservation: null, evCharging: null },
        source: { label: 'TDX 測試資料', url: 'https://tdx.transportdata.tw/', providerUpdatedAt: '2026-08-05T00:00:00Z', fetchedAt: '2026-08-05T00:00:00Z' },
        navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=25.033%2C121.5654',
        matchConfidence: 'official',
      });
      return {
        facilities: [
          facility('tdx-e2e-a', 'E2E 官方停車場 A', 160),
          facility('tdx-e2e-b', 'E2E 官方停車場 B', 240),
        ],
        googleStatus: 'ok',
        tdxStatus: 'ok',
      };
    };
  });
}

async function providerCallCount(page: Page): Promise<number> {
  return await page.evaluate(() => Number((window as typeof window & { __TRAVEL_E2E__?: { parkingSearchCalls?: number } }).__TRAVEL_E2E__?.parkingSearchCalls || 0));
}

async function callProtectedParkingProvider(
  page: Page,
  payload: Record<string, unknown>,
) {
  return await page.evaluate(async (requestData) => {
    const firebaseModulePath = '/src/firebase.js';
    const { auth } = await import(/* @vite-ignore */ firebaseModulePath);
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error('E2E Google auth token is unavailable.');
    const response = await fetch(
      'http://127.0.0.1:5001/demo-travel-e2e/us-central1/searchParking',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ data: requestData }),
      },
    );
    return {
      status: response.status,
      body: await response.json(),
    };
  }, payload);
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E parking collaboration trip',
    itinerary: {
      'Day 1': [{
        id: 'parking-anchor-place',
        name: '台北 101',
        place_id: 'e2e-anchor',
        lat: 25.033,
        lng: 121.5654,
        address: '台北市信義路五段 7 號',
        time: '09:00',
        stayTime: '120',
        memo: '',
        tags: [],
        nextLeg: { mode: 'AUTO', mins: 30 },
      }],
      'Day 2': [{
        id: 'parking-outside-coverage',
        name: '東京站',
        place_id: 'e2e-tokyo-anchor',
        lat: 35.6812,
        lng: 139.7671,
        address: '東京都千代田區丸之內一丁目',
        time: '09:00',
        stayTime: '120',
        memo: '',
        tags: [],
        nextLeg: { mode: 'AUTO', mins: 30 },
      }],
    },
  });
  await seedTestTrip(OUTSIDER_ROOM_ID, {
    title: 'E2E parking outsider trip',
    ownerUid: 'e2e-parking-other-owner',
  });
});

test('manually searches then syncs save replace and remove through the realtime itinerary', async ({ browser }, testInfo) => {
  const a = await openRoom(browser, testInfo.project.name);
  const b = await openRoom(browser, testInfo.project.name);
  try {
    await openMap(a.page, testInfo.project.name);
    await openMap(b.page, testInfo.project.name);
    await installDeterministicProvider(a.page);

    await expect(a.page.getByTestId('parking-driving-hint')).toBeVisible();
    expect(await providerCallCount(a.page)).toBe(0);

    await a.page.getByTestId('parking-layer-trigger').click();
    await a.page.getByLabel('停車搜尋半徑').selectOption('1000');
    expect(await providerCallCount(a.page)).toBe(0);

    await a.page.getByTestId('parking-search-button').click();
    await expect(a.page.getByText('E2E 官方停車場 A').first()).toBeVisible();
    expect(await providerCallCount(a.page)).toBe(1);

    const resultA = a.page.getByTestId('parking-result').filter({ hasText: 'E2E 官方停車場 A' });
    await resultA.getByRole('button', { name: '設為此景點停車場' }).click();
    await expect(b.page.getByTestId('saved-parking-card')).toContainText('E2E 官方停車場 A', { timeout: 20_000 });

    await a.page.getByRole('button', { name: '更換' }).click();
    const resultB = a.page.getByTestId('parking-result').filter({ hasText: 'E2E 官方停車場 B' });
    await resultB.getByRole('button', { name: '設為此景點停車場' }).click();
    await expect(b.page.getByTestId('saved-parking-card')).toContainText('E2E 官方停車場 B', { timeout: 20_000 });

    await a.page.getByRole('button', { name: '移除' }).click();
    await expect(b.page.getByTestId('saved-parking-card')).toHaveCount(0, { timeout: 20_000 });
    const itinerary = await readEmulatorData<Record<string, Array<Record<string, unknown>>>>(`rooms/${ROOM_ID}/itinerary`);
    expect(itinerary?.['Day 1']?.[0]).toMatchObject({ id: 'parking-anchor-place', name: '台北 101' });
    expect(itinerary?.['Day 1']?.[0]).not.toHaveProperty('parkingPlan');
  } finally {
    await a.context.close();
    await b.context.close();
  }
});

test('protected TDX callable accepts only an authenticated canonical trip selector', async ({ browser }, testInfo) => {
  const view = await openRoom(browser, testInfo.project.name);
  try {
    const allowed = await callProtectedParkingProvider(view.page, {
      roomId: ROOM_ID,
      dayId: 'Day 2',
      placeId: 'parking-outside-coverage',
      radius: 500,
      lat: 25.033,
      lng: 121.5654,
    });
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({
      result: {
        providerStatus: 'outside_coverage',
        facilities: [],
      },
    });

    const outsider = await callProtectedParkingProvider(view.page, {
      roomId: OUTSIDER_ROOM_ID,
      dayId: 'Day 1',
      placeId: 'parking-anchor-place',
      radius: 500,
    });
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.status).toBe('PERMISSION_DENIED');

    const missingPlace = await callProtectedParkingProvider(view.page, {
      roomId: ROOM_ID,
      dayId: 'Day 1',
      placeId: 'missing-place',
      radius: 500,
    });
    expect(missingPlace.status).toBe(404);
    expect(missingPlace.body.error.status).toBe('NOT_FOUND');
  } finally {
    await view.context.close();
  }
});
