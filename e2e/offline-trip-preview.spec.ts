import { test, expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  writeEmulatorData,
  clearEmulatorDatabase,
  readEmulatorData,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const ROOM_ID = 'offline-preview-room';
const UNCACHED_ROOM_ID = 'uncached-room';
const CACHE_KEY = 'google-travel-offline-trip-cache-v1';
const MY_TRIPS_KEY = 'google-travel-my-trips';

const testRoomData = {
  meta: {
    title: 'Test Offline Trip',
    destination: 'Taipei',
    startDate: '2026-07-15',
    endDate: '2026-07-16',
    members: ['Alice', 'Bob'],
    memberBudgets: { Alice: 10000, Bob: 10000 },
    transport: 'Train',
    themeColor: '#3b82f6',
    dayThemes: {},
    createdAt: 1_785_000_001,
    updatedAt: 1_785_000_002,
  },
  itinerary: {
    'Day 1': [
      {
        id: 'place1',
        customName: 'Custom Place Name',
        name: 'Original Place Name',
        time: '10:00',
        address: '123 Taipei St',
        memo: 'This is a test memo',
        category: 'Sightseeing',
        imageUrl: 'https://firebasestorage.googleapis.com/unsafe',
        attachment: 'unsafe-attachment',
        storagePath: 'rooms/offline-preview-room/unsafe',
      },
    ],
    'Day 2': [],
  },
  expenses: [
    {
      id: 'exp1',
      title: 'Lunch',
      cost: 500,
      payer: 'Alice',
      involved: ['Alice', 'Bob'],
      category: 'Food',
      dayId: 'Day 1',
    },
  ],
  settlements: [],
  checklist: {
    check1: { id: 'check1', text: 'Pack bags', completed: true },
    check2: { id: 'check2', text: 'Buy snacks', completed: false },
  },
  tickets: [
    {
      id: 'ticket1',
      title: 'Flight Ticket',
      note: 'Gate 3',
    },
  ],
};

type OfflineCacheSnapshot = {
  version?: number;
  roomId?: string;
  cachedAt?: number;
  meta?: { title?: string; members?: string[] };
  days?: Array<{
    id?: string;
    label?: string;
    items?: Array<{
      name?: string;
      note?: string;
      imageUrl?: string;
      attachment?: string;
      storagePath?: string;
    }>;
  }>;
  summary?: {
    expenseCount?: number;
    checklistCompleted?: number;
    checklistTotal?: number;
    ticketCount?: number;
  };
};

async function seedOfflinePreviewRoom(): Promise<void> {
  await clearEmulatorDatabase();
  await writeEmulatorData(`rooms/${ROOM_ID}`, testRoomData);
  await writeEmulatorData(`rooms/${UNCACHED_ROOM_ID}`, {
    meta: {
      title: 'Uncached Trip',
      destination: 'Nowhere',
      startDate: '2026-08-01',
      endDate: '2026-08-02',
      members: ['Una'],
      memberBudgets: { Una: 10000 },
      transport: 'Walk',
      themeColor: '#64748b',
      dayThemes: {},
      createdAt: 1_785_100_001,
      updatedAt: 1_785_100_002,
    },
    itinerary: { 'Day 1': [] },
    expenses: [],
    settlements: [],
    checklist: {},
    tickets: [],
  });
}

async function installTripShortcuts(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(
    ({ roomId, uncachedRoomId, myTripsKey, cacheKey }) => {
      window.localStorage.removeItem(cacheKey);
      window.localStorage.setItem(myTripsKey, JSON.stringify([
        {
          roomId,
          title: 'Test Offline Trip',
          destination: 'Taipei',
          startDate: '2026-07-15',
          endDate: '2026-07-16',
          members: ['Alice', 'Bob'],
          transport: 'Train',
          themeColor: '#3b82f6',
        },
        {
          roomId: uncachedRoomId,
          title: 'Uncached Trip',
          destination: 'Nowhere',
          startDate: '2026-08-01',
          endDate: '2026-08-02',
          members: ['Una'],
          transport: 'Walk',
          themeColor: '#64748b',
        },
      ]));
    },
    {
      roomId: ROOM_ID,
      uncachedRoomId: UNCACHED_ROOM_ID,
      myTripsKey: MY_TRIPS_KEY,
      cacheKey: CACHE_KEY,
    },
  );
}

function tripCard(page: Page, roomId: string): Locator {
  return page.locator(`[data-testid="trip-card"][data-room-id="${roomId}"]`);
}

async function readOfflineCache(page: Page): Promise<Record<string, OfflineCacheSnapshot>> {
  return await page.evaluate((cacheKey) => {
    try {
      return JSON.parse(window.localStorage.getItem(cacheKey) || '{}');
    } catch {
      return {};
    }
  }, CACHE_KEY) as Record<string, OfflineCacheSnapshot>;
}

async function expectOfflineCacheReady(page: Page): Promise<OfflineCacheSnapshot> {
  await expect
    .poll(
      async () => {
        const cache = await readOfflineCache(page);
        const snapshot = cache[ROOM_ID];
        const dayOne = snapshot?.days?.find((day) => day.id === 'Day 1');
        const dayOneItem = dayOne?.items?.[0];

        return {
          version: snapshot?.version,
          roomId: snapshot?.roomId,
          title: snapshot?.meta?.title,
          daysLength: snapshot?.days?.length,
          hasDayOne: Boolean(dayOne),
          dayOneItemCount: dayOne?.items?.length,
          itemName: dayOneItem?.name,
          itemNote: dayOneItem?.note,
          expenseCount: snapshot?.summary?.expenseCount,
          checklistCompleted: snapshot?.summary?.checklistCompleted,
          checklistTotal: snapshot?.summary?.checklistTotal,
          ticketCount: snapshot?.summary?.ticketCount,
        };
      },
      {
        timeout: 20_000,
        message: 'offline cache snapshot reaches the expected canonical shape',
      },
    )
    .toEqual({
      version: 1,
      roomId: ROOM_ID,
      title: 'Test Offline Trip',
      daysLength: 2,
      hasDayOne: true,
      dayOneItemCount: 1,
      itemName: 'Custom Place Name',
      itemNote: 'This is a test memo',
      expenseCount: 1,
      checklistCompleted: 1,
      checklistTotal: 2,
      ticketCount: 1,
    });

  const cache = await readOfflineCache(page);
  return cache[ROOM_ID];
}

async function openTripAndWaitForCache(page: Page): Promise<OfflineCacheSnapshot> {
  await tripCard(page, ROOM_ID).click();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-room-id',
    ROOM_ID,
  );
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('trip-detail-title')).toContainText('Test Offline Trip');

  return await expectOfflineCacheReady(page);
}

async function setupLobby(page: Page): Promise<void> {
  await installTripShortcuts(page);
  await page.goto('/');
  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(tripCard(page, ROOM_ID)).toBeVisible();
  await expect(tripCard(page, UNCACHED_ROOM_ID)).toBeVisible();
}

async function openCachedTripOffline(
  page: Page,
  context: BrowserContext,
): Promise<void> {
  await context.setOffline(true);
  await tripCard(page, ROOM_ID).click();
  await expect(page.getByTestId('offline-trip-preview')).toBeVisible();
}

async function expectNoOverlap(locatorA: Locator, locatorB: Locator): Promise<void> {
  const boxA = await locatorA.boundingBox();
  const boxB = await locatorB.boundingBox();

  expect(boxA).not.toBeNull();
  expect(boxB).not.toBeNull();

  const overlaps = !(
    boxA!.x + boxA!.width <= boxB!.x ||
    boxB!.x + boxB!.width <= boxA!.x ||
    boxA!.y + boxA!.height <= boxB!.y ||
    boxB!.y + boxB!.height <= boxA!.y
  );

  expect(overlaps).toBe(false);
}

async function expectOfflinePreviewContent(page: Page): Promise<void> {
  const preview = page.getByTestId('offline-trip-preview');

  await expect(preview).toBeVisible();
  await expect(page.getByTestId('travel-lobby')).toHaveCount(0);
  await expect(page.getByTestId('trip-card')).toHaveCount(0);
  await expect(page.getByTestId('active-trip-view')).toHaveCount(0);
  await expect(page.getByTestId('offline-preview-readonly-status')).toBeVisible();
  await expect(page.getByTestId('offline-preview-cache-time')).toBeVisible();
  await expect(page.getByTestId('offline-preview-cache-time')).not.toContainText('Invalid Date');
  await expect(page.getByTestId('offline-preview-title')).toContainText('Test Offline Trip');
  await expect(preview).toContainText('2026-07-15');
  await expect(preview).toContainText('2026-07-16');
  await expect(preview).toContainText('Alice, Bob');
  await expect(page.getByTestId('offline-preview-day')).toHaveCount(2);
  await expect(preview).toContainText('第一天');
  await expect(preview).toContainText('第二天');
  await expect(preview).toContainText('Custom Place Name');
  await expect(preview).toContainText('This is a test memo');
  await expect(preview).toContainText(/500|NT\$\s*500/u);
  await expect(preview).toContainText('1 / 2');
  await expect(preview).toContainText('1');
}

test.describe('Offline Trip Preview', () => {
  test.beforeEach(async () => {
    await seedOfflinePreviewRoom();
  });

  test('Online cache creation and offline preview content', async ({ page, context }) => {
    await setupLobby(page);

    const snapshot = await openTripAndWaitForCache(page);
    const dayOne = snapshot.days?.find((day) => day.id === 'Day 1');
    const dayOneItem = dayOne?.items?.[0];

    expect(snapshot.version).toBe(1);
    expect(snapshot.roomId).toBe(ROOM_ID);
    expect(snapshot.meta?.title).toBe('Test Offline Trip');
    expect(snapshot.days).toHaveLength(2);
    expect(dayOne).toBeTruthy();
    expect(dayOneItem?.name).toBe('Custom Place Name');
    expect(dayOneItem?.note).toBe('This is a test memo');
    expect(dayOneItem?.imageUrl).toBeUndefined();
    expect(dayOneItem?.attachment).toBeUndefined();
    expect(dayOneItem?.storagePath).toBeUndefined();
    expect(snapshot.summary).toEqual(expect.objectContaining({
      expenseCount: 1,
      checklistCompleted: 1,
      checklistTotal: 2,
      ticketCount: 1,
    }));

    await page.getByTestId('back-to-lobby').click();
    await expect(page.getByTestId('travel-lobby')).toBeVisible();

    const cachedCard = tripCard(page, ROOM_ID);
    const uncachedCard = tripCard(page, UNCACHED_ROOM_ID);
    await expect(cachedCard).toBeVisible();
    await expect(cachedCard.getByTestId('offline-cache-status')).toBeVisible();
    await expect(cachedCard.getByTestId('offline-cache-status')).not.toContainText('Invalid Date');
    await expect(uncachedCard.getByTestId('offline-cache-status')).toHaveCount(0);

    await openCachedTripOffline(page, context);
    await expectOfflinePreviewContent(page);

    const preview = page.getByTestId('offline-trip-preview');
    await expect(preview.getByText('新增景點')).toHaveCount(0);
    await expect(preview.getByText('編輯景點')).toHaveCount(0);
    await expect(preview.getByText('新增費用')).toHaveCount(0);
    await expect(preview.getByText('編輯費用')).toHaveCount(0);
    await expect(preview.getByText('刪除旅程')).toHaveCount(0);
    await expect(preview.locator('input, textarea, select')).toHaveCount(0);
  });

  test('Uncached trip and reconnect behavior', async ({ page, context }) => {
    await setupLobby(page);
    await openTripAndWaitForCache(page);
    await page.getByTestId('back-to-lobby').click();
    await expect(page.getByTestId('travel-lobby')).toBeVisible();

    await context.setOffline(true);
    const initialUrl = page.url();
    await tripCard(page, UNCACHED_ROOM_ID).click();

    await expect(page.getByTestId('travel-lobby')).toBeVisible();
    await expect(page.getByTestId('offline-trip-preview')).toHaveCount(0);
    await expect(page.getByTestId('active-trip-view')).toHaveCount(0);
    expect(page.url()).toBe(initialUrl);

    const missingCacheToasts = page.getByTestId('toast').filter({
      has: page.getByRole('heading', { name: '尚無離線資料', exact: true }),
    });
    await expect(missingCacheToasts).toHaveCount(1);
    await expect(missingCacheToasts).toContainText('此旅程尚未建立可用的離線快取');

    await tripCard(page, ROOM_ID).click();
    await expect(page.getByTestId('offline-trip-preview')).toBeVisible();
    const previewUrl = page.url();

    await context.setOffline(false);
    await expect(page.getByTestId('offline-banner')).toHaveCount(0);
    await expect(page.getByTestId('offline-trip-preview')).toBeVisible();
    await expect(page.getByTestId('active-trip-view')).toHaveCount(0);
    expect(page.url()).toBe(previewUrl);
    await expect(page.getByTestId('offline-preview-open-online')).toBeVisible();

    await page.getByTestId('offline-preview-open-online').click();
    await expect(page.getByTestId('offline-trip-preview')).toHaveCount(0);
    await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
      'data-room-id',
      ROOM_ID,
    );
    await expect(page.getByTestId('active-trip-view')).toBeVisible();
    expect(new URL(page.url()).searchParams.get('room')).toBe(ROOM_ID);

    const cache = await expectOfflineCacheReady(page);
    expect(cache.roomId).toBe(ROOM_ID);
  });

  test('Clear cache without deleting cloud room', async ({ page, context }) => {
    await setupLobby(page);
    await openTripAndWaitForCache(page);
    const beforeClearData = await readEmulatorData(`rooms/${ROOM_ID}`);

    await page.getByTestId('back-to-lobby').click();
    await expect(page.getByTestId('travel-lobby')).toBeVisible();

    let cache = await readOfflineCache(page);
    expect(cache[ROOM_ID]).toBeTruthy();

    await openCachedTripOffline(page, context);
    await page.getByTestId('offline-preview-clear-cache').click();

    const confirmDialog = page.getByTestId('confirm-dialog');
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText('只會刪除此裝置上的離線快取');
    await expect(confirmDialog).toContainText('不會刪除雲端旅程資料');
    await confirmDialog.getByTestId('confirm-accept').click();

    await expect(page.getByTestId('offline-trip-preview')).toHaveCount(0);
    await expect(page.getByTestId('travel-lobby')).toBeVisible();

    const clearedToast = page.getByTestId('toast').filter({
      has: page.getByRole('heading', { name: '已清除離線資料', exact: true }),
    });
    await expect(clearedToast).toHaveCount(1);
    await expect(tripCard(page, ROOM_ID).getByTestId('offline-cache-status')).toHaveCount(0);

    cache = await readOfflineCache(page);
    expect(cache[ROOM_ID]).toBeUndefined();

    const shortcuts = await page.evaluate((key) => {
      return JSON.parse(window.localStorage.getItem(key) || '[]');
    }, MY_TRIPS_KEY) as Array<{ roomId?: string }>;
    expect(shortcuts.some((trip) => trip.roomId === ROOM_ID)).toBe(true);

    const afterClearData = await readEmulatorData(`rooms/${ROOM_ID}`);
    expect(afterClearData).toEqual(beforeClearData);
  });

  test('Mobile preview scrolling and fixed banner layout', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await setupLobby(page);
    await openTripAndWaitForCache(page);
    await page.getByTestId('back-to-lobby').click();
    await expect(page.getByTestId('travel-lobby')).toBeVisible();

    await openCachedTripOffline(page, context);

    const preview = page.getByTestId('offline-trip-preview');
    const backButton = page.getByTestId('offline-preview-back');
    const clearButton = page.getByTestId('offline-preview-clear-cache');
    const banner = page.getByTestId('offline-banner');

    await expect(preview).toBeVisible();
    await expect(banner).toBeVisible();

    const scrollMetrics = await preview.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      scrollTop: element.scrollTop,
    }));
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);

    await clearButton.scrollIntoViewIfNeeded();
    const scrolledTop = await preview.evaluate((element) => element.scrollTop);
    expect(scrolledTop).toBeGreaterThan(scrollMetrics.scrollTop);

    await expect(backButton).toBeVisible();
    await expect(clearButton).toBeVisible();
    await expect(banner).toBeVisible();

    const backBox = await backButton.boundingBox();
    const clearBox = await clearButton.boundingBox();
    const bannerBox = await banner.boundingBox();
    expect(backBox).not.toBeNull();
    expect(clearBox).not.toBeNull();
    expect(bannerBox).not.toBeNull();

    const viewport = page.viewportSize();
    expect(viewport).not.toBeNull();
    expect(bannerBox!.y + bannerBox!.height).toBeGreaterThanOrEqual(viewport!.height - 4);
    expect(bannerBox!.y).toBeLessThanOrEqual(viewport!.height);

    await expectNoOverlap(backButton, banner);
    await expectNoOverlap(clearButton, banner);
    expect(clearBox!.y + clearBox!.height).toBeLessThanOrEqual(bannerBox!.y);
  });
});
