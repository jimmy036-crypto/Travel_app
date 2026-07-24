import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const REAL_ROOM_ID = 'e2eguideddemorealroom01';

type LobbyTrip = {
  roomId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: string[];
  transport: string;
  themeColor: string;
};

const REAL_TRIP: LobbyTrip = {
  roomId: REAL_ROOM_ID,
  title: 'Guided Demo E2E real trip',
  destination: 'E2E Osaka',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  members: ['E2E member'],
  transport: 'E2E train',
  themeColor: '#3b82f6',
};

async function seedLobbyTrips(page: Page, trips: LobbyTrip[]): Promise<void> {
  await page.addInitScript((nextTrips) => {
    window.localStorage.setItem('google-travel-my-trips', JSON.stringify(nextTrips));
  }, trips);
}

async function expectNoDemoPersistence(page: Page): Promise<void> {
  const rooms = await readEmulatorData<Record<string, unknown>>('rooms');
  expect(rooms).toBeNull();
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('google-travel-my-trips')
  ))).toBe('[]');
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await markCurrentReleaseSeen(page);
});

test('empty Lobby opens a local read-only demo and only the existing create Modal', async ({ page }) => {
  await seedLobbyTrips(page, []);
  await page.goto('/');

  await expect(page.getByTestId('lobby-empty-state')).toBeVisible();
  await expect(page.getByTestId('demo-trip-entry-card')).toBeVisible();
  await expect(page.getByTestId('demo-trip-entry-readonly')).toContainText('唯讀');
  const initialUrl = page.url();

  await page.getByTestId('demo-trip-entry-open').click();
  await expect(page.getByTestId('demo-trip-preview')).toBeVisible();
  await expect(page.getByTestId('demo-trip-title')).toContainText('東京三日示範旅程');
  await expect(page.getByTestId('travel-lobby')).toHaveCount(0);
  await expect(page.getByTestId('demo-clone-trip-button')).toHaveCount(0);
  expect(page.url()).toBe(initialUrl);
  expect(new URL(page.url()).searchParams.has('room')).toBe(false);
  await expectNoDemoPersistence(page);

  for (const tab of ['itinerary', 'tickets', 'expenses', 'checklist', 'overview']) {
    await page.getByTestId(`demo-tab-${tab}`).click();
    await expect(page.getByTestId(`demo-${tab}`)).toBeVisible();
  }

  const overflow = await page.getByTestId('demo-trip-preview').evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  await expect(page.getByTestId('demo-trip-preview')).toHaveCSS('overflow-x', 'hidden');

  const header = page.getByTestId('demo-mode-banner').locator('..').locator('..');
  await expect(header).toHaveCSS('position', 'sticky');
  const headerBox = await header.boundingBox();
  const firstTabBox = await page.getByTestId('demo-tab-overview').boundingBox();
  expect(firstTabBox?.y || 0).toBeGreaterThanOrEqual((headerBox?.y || 0) + (headerBox?.height || 0) - 1);

  await page.getByTestId('demo-back-button').click();
  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('demo-trip-entry-card')).toBeVisible();
  expect(page.url()).toBe(initialUrl);

  await page.getByTestId('demo-trip-entry-open').click();
  await expect(page.getByTestId('demo-trip-preview')).toHaveCount(1);
  const createButton = page.getByTestId('demo-create-trip-button');
  await createButton.scrollIntoViewIfNeeded();
  await expect(createButton).toBeVisible();
  await createButton.click();
  await expect(page.getByTestId('demo-trip-preview')).toHaveCount(0);
  await expect(page.getByTestId('trip-modal')).toBeVisible();
  await expect(page.getByTestId('trip-name-input')).toHaveValue('');
  await expect(page.getByTestId('trip-date-range')).toContainText('點擊選擇出發與回程日期');
  await expectNoDemoPersistence(page);
});

test('real-trip Lobby exposes the demo only through the responsive Settings menu', async ({ page }) => {
  await seedTestTrip(REAL_ROOM_ID, {
    title: REAL_TRIP.title,
    startDate: REAL_TRIP.startDate,
    endDate: REAL_TRIP.endDate,
    members: REAL_TRIP.members,
  });
  await seedLobbyTrips(page, [REAL_TRIP]);
  await page.goto('/');

  await expect(page.getByTestId('trip-card')).toHaveCount(1);
  await expect(page.getByTestId('demo-trip-entry-card')).toHaveCount(0);
  await page.getByTestId('app-settings-trigger').click();
  const demoMenuEntry = page.getByTestId('app-settings-demo-trip');
  await expect(demoMenuEntry).toBeVisible();

  const entryBox = await demoMenuEntry.boundingBox();
  const viewport = page.viewportSize();
  expect(entryBox?.y || 0).toBeGreaterThanOrEqual(0);
  expect((entryBox?.y || 0) + (entryBox?.height || 0)).toBeLessThanOrEqual(viewport?.height || 844);

  const initialUrl = page.url();
  await demoMenuEntry.click();
  await expect(page.getByTestId('app-settings-menu')).toHaveCount(0);
  await expect(page.getByTestId('demo-trip-preview')).toBeVisible();
  await expect(page.getByTestId('travel-lobby')).toHaveCount(0);
  await expect(page.getByTestId('demo-create-trip-button')).toContainText('建立另一個旅程');
  await expect(page.getByTestId('demo-clone-trip-button')).toHaveCount(0);
  expect(page.url()).toBe(initialUrl);

  const rooms = await readEmulatorData<Record<string, unknown>>('rooms');
  expect(Object.keys(rooms || {})).toEqual([REAL_ROOM_ID]);
  expect(await page.evaluate(() => JSON.parse(
    window.localStorage.getItem('google-travel-my-trips') || '[]',
  ))).toEqual([REAL_TRIP]);

  await page.getByTestId('demo-back-button').click();
  await expect(page.getByTestId('trip-card')).toHaveCount(1);
  await expect(page.getByTestId('demo-trip-entry-card')).toHaveCount(0);
});
