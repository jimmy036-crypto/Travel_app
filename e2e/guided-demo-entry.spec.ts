import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const REAL_ROOM_ID = 'e2eunifiedrealroom01';
const EXAMPLE_ID = 'local-example-trip';
const FORBIDDEN_TEXT = [
  '示範旅程',
  '本機示範副本',
  '本機示範',
  '僅供預覽',
  '範例模式',
  '示範資料',
  'Demo Preview',
];

const REAL_TRIP = {
  roomId: REAL_ROOM_ID,
  title: 'E2E 一般旅程',
  destination: '大阪',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  members: ['自己'],
  transport: '電車',
  themeColor: '#3b82f6',
};

async function seedLobby(page: Page, trips: typeof REAL_TRIP[] = []): Promise<void> {
  await page.addInitScript((value) => {
    localStorage.setItem('google-travel-my-trips', JSON.stringify(value));
  }, trips);
}

async function openExample(page: Page): Promise<void> {
  const card = page.getByTestId('demo-trip-entry-card');
  await expect(card).toBeVisible();
  await card.getByTestId('example-trip-card-title').click();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-room-id',
    EXAMPLE_ID,
  );
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await clearEmulatorStorage();
  await markCurrentReleaseSeen(page);
});

test('example card opens the shared TripDetail without cloud writes', async ({ page }) => {
  await seedLobby(page);
  await page.goto('/');

  await expect(page.getByTestId('lobby-empty-state')).toBeVisible();
  const card = page.getByTestId('demo-trip-entry-card');
  await expect(card.getByTestId('example-trip-card-title')).toHaveText(
    '東京三日自由行（範例）',
  );
  await expect(card.getByText('恢復原始內容')).toBeVisible();

  const initialUrl = page.url();
  await openExample(page);
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-trip-source',
    'example',
  );
  await expect(page.getByTestId('trip-detail-title')).toHaveText(
    '東京三日自由行（範例）',
  );
  await expect(page.locator('[data-testid="expense-tab-button"]:visible')).toHaveCount(1);
  await expect(page.locator('[data-testid="ticket-tab-button"]:visible')).toHaveCount(1);
  await expect(page.getByTestId('itinerary-day-card')).toHaveCount(3);
  expect(page.url()).toBe(initialUrl);
  expect(new URL(page.url()).searchParams.has('room')).toBe(false);

  for (const phrase of FORBIDDEN_TEXT) {
    await expect(page.locator('body')).not.toContainText(phrase);
  }
  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('google-travel-my-trips'))).toBe('[]');
  expect(await page.evaluate((tripId) => (
    localStorage.getItem('google-travel-offline-trip-cache-v1') || ''
  ).includes(tripId), EXAMPLE_ID)).toBe(false);

  await page.getByTestId('back-to-lobby').click();
  await expect(page.getByTestId('demo-trip-entry-card')).toBeVisible();
  await openExample(page);
  await expect(page.getByTestId('active-trip-view')).toHaveCount(1);
});

test('example and regular cards retain the same structure and isolated data', async ({ page }) => {
  await seedTestTrip(REAL_ROOM_ID, { title: REAL_TRIP.title });
  await seedLobby(page, [REAL_TRIP]);
  await page.goto('/');

  const cards = page.getByTestId('trip-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByTestId('example-trip-card-title')).toHaveText(
    '東京三日自由行（範例）',
  );
  await expect(cards.nth(1).getByTestId('trip-card-title')).toHaveText(REAL_TRIP.title);

  await openExample(page);
  await page.getByTestId('back-to-lobby').click();
  await cards.nth(1).getByTestId('trip-card-title').click();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-trip-source',
    'firebase',
  );
  await expect(page.getByTestId('trip-detail-title')).toHaveText(REAL_TRIP.title);

  const rooms = await readEmulatorData<Record<string, unknown>>('rooms');
  expect(Object.keys(rooms || {})).toEqual([REAL_ROOM_ID]);
  const lobbyTrips: Array<{ roomId?: string; title?: string }> = await page.evaluate(
    () => JSON.parse(localStorage.getItem('google-travel-my-trips') || '[]'),
  );
  expect(lobbyTrips).toHaveLength(1);
  expect(lobbyTrips[0]).toMatchObject({
    roomId: REAL_ROOM_ID,
    title: REAL_TRIP.title,
  });
  expect(lobbyTrips.some((trip) => trip.roomId === EXAMPLE_ID)).toBe(false);
});
