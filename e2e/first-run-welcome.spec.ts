import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';
import { CURRENT_RELEASE_SEEN_KEY } from './support/releaseNotes';

const ONBOARDING_KEY = 'travel-app-seen-onboarding-v1';
const DEEP_LINK_ROOM_ID = 'e2efirstrundeepinkroom01';

test.use({ storageState: { cookies: [], origins: [] } });

async function advanceToFinalStep(page: Page): Promise<void> {
  await page.getByTestId('first-run-next').click();
  await page.getByTestId('first-run-next').click();
  await page.getByTestId('first-run-next').click();
  await expect(page.getByTestId('first-run-progress')).toContainText('第 4 / 4 步');
}

async function expectEmptyFirebaseAndTrips(page: Page): Promise<void> {
  expect(await readEmulatorData('rooms')).toBeNull();
  await expect.poll(() => page.evaluate(() => (
    window.localStorage.getItem('google-travel-my-trips')
  ))).toBe('[]');
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
});

test('fresh user completes four steps and opens the local Tokyo demo', async ({ page }) => {
  await page.goto('/');

  const welcome = page.getByTestId('first-run-welcome-dialog');
  await expect(welcome).toBeVisible();
  await expect(welcome).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  await expect(page.getByTestId('first-run-progress')).toContainText('第 1 / 4 步');
  await expect(page.getByTestId('first-run-back')).toHaveCount(0);

  await page.getByTestId('first-run-next').click();
  await expect(page.getByTestId('first-run-progress')).toContainText('第 2 / 4 步');
  await page.getByTestId('first-run-next').click();
  await expect(page.getByTestId('first-run-progress')).toContainText('第 3 / 4 步');
  await page.getByTestId('first-run-back').click();
  await expect(page.getByTestId('first-run-progress')).toContainText('第 2 / 4 步');
  await page.getByTestId('first-run-next').click();
  await page.getByTestId('first-run-next').click();
  await expect(page.getByTestId('first-run-progress')).toContainText('第 4 / 4 步');

  const layout = await welcome.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    height: element.getBoundingClientRect().height,
    viewportHeight: window.innerHeight,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
  expect(layout.height).toBeLessThanOrEqual(layout.viewportHeight);
  await expect(page.getByTestId('first-run-open-demo')).toBeVisible();

  await page.getByTestId('first-run-open-demo').click();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('demo-trip-preview')).toBeVisible();
  await expect(page.getByTestId('demo-trip-title')).toContainText('東京三日示範旅程');
  expect(new URL(page.url()).searchParams.has('room')).toBe(false);
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBe('true');
  expect(await page.evaluate((key) => localStorage.getItem(key), CURRENT_RELEASE_SEEN_KEY)).toBeNull();
  await expectEmptyFirebaseAndTrips(page);

  await page.reload();
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), CURRENT_RELEASE_SEEN_KEY)).toBeNull();
});

test('create action opens only the existing blank trip Modal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('first-run-welcome-dialog')).toBeVisible();
  await advanceToFinalStep(page);
  await page.getByTestId('first-run-create-trip').click();

  await expect(page.getByTestId('first-run-welcome-dialog')).toHaveCount(0);
  await expect(page.getByTestId('trip-modal')).toBeVisible();
  await expect(page.getByTestId('trip-name-input')).toHaveValue('');
  await expect(page.getByTestId('trip-date-range')).toContainText('點擊選擇出發與回程日期');
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBe('true');
  await expectEmptyFirebaseAndTrips(page);
});

test('empty trips remains first-run and Escape skips without showing release notes this session', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('google-travel-my-trips', '[]');
  });
  await page.goto('/');

  const welcome = page.getByTestId('first-run-welcome-dialog');
  await expect(welcome).toBeVisible();
  await expect(page.getByTestId('first-run-next')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('first-run-skip')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('first-run-next')).toBeFocused();
  await page.keyboard.press('Escape');

  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBe('true');
  expect(await page.evaluate((key) => localStorage.getItem(key), CURRENT_RELEASE_SEEN_KEY)).toBeNull();
});

test('non-empty trips and release history are treated as returning use', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('google-travel-my-trips', JSON.stringify([{
      roomId: 'returning-room',
      title: 'Returning trip',
      destination: 'Taipei',
      startDate: '2026-10-01',
      endDate: '2026-10-02',
      members: ['Me'],
      themeColor: '#3b82f6',
    }]));
  });
  await page.goto('/');
  await expect(page.getByTestId('first-run-welcome-dialog')).toHaveCount(0);
  await expect(page.getByTestId('trip-card')).toHaveCount(1);

  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('travel-app-seen-release-previous', 'true');
  });
  await page.reload();
  await expect(page.getByTestId('first-run-welcome-dialog')).toHaveCount(0);
});

test('room deep link loads first and shows Welcome only after returning to Lobby', async ({ page }) => {
  await seedTestTrip(DEEP_LINK_ROOM_ID, {
    title: 'First-run deep-link trip',
    members: ['New traveler'],
  });
  await page.goto(`/?room=${DEEP_LINK_ROOM_ID}`);

  await expect(page.getByTestId('trip-detail-title')).toContainText('First-run deep-link trip');
  await expect(page.getByTestId('first-run-welcome-dialog')).toHaveCount(0);
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBeNull();

  await page.getByTestId('back-to-lobby').click();
  await expect(page.getByTestId('first-run-welcome-dialog')).toBeVisible();
  await expect(page.getByTestId('trip-detail-title')).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBeNull();
});
