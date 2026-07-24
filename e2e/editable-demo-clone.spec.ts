import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  clearEmulatorDatabase,
  readEmulatorData,
} from './support/emulator';

const MY_TRIPS_KEY = 'google-travel-my-trips';
const OFFLINE_CACHE_KEY = 'google-travel-offline-trip-cache-v1';
const SANDBOX_KEY = 'travel-app-demo-sandbox-v1';
const JOURNAL_KEY = 'travel-app-demo-clone-operation-v1';
const ONBOARDING_KEY = 'travel-app-seen-onboarding-v1';

async function preparePage(page: Page, cloneEnabled = false): Promise<void> {
  await page.addInitScript(({ enabled, onboardingKey, myTripsKey }) => {
    localStorage.setItem(onboardingKey, 'true');
    localStorage.setItem(myTripsKey, '[]');
    if (enabled) {
      Object.defineProperty(
        globalThis,
        '__TRAVEL_APP_ENABLE_EDITABLE_DEMO_CLONE__',
        { configurable: true, value: true },
      );
    }
  }, {
    enabled: cloneEnabled,
    onboardingKey: ONBOARDING_KEY,
    myTripsKey: MY_TRIPS_KEY,
  });
  await page.goto('/');
  await expect(page.getByTestId('travel-lobby')).toBeVisible();
}

async function openDemo(page: Page): Promise<void> {
  await page.getByTestId('demo-trip-entry-open').click();
  await expect(page.getByTestId('demo-trip-preview')).toBeVisible();
}

async function openItinerary(page: Page): Promise<void> {
  await page.getByTestId('demo-tab-itinerary').click();
  await expect(page.getByTestId('demo-itinerary-editor')).toBeVisible();
}

async function addNamedPlace(page: Page, name: string): Promise<void> {
  await page.getByTestId('demo-add-place').click();
  const place = page.getByTestId('demo-editable-place').last();
  const nameInput = place.getByRole('textbox', { name: /景點名稱/u });
  await nameInput.fill(name);
  await place.locator('input[type="time"]').fill('14:25');
  await place.getByRole('textbox', { name: /備註/u }).fill('只保存在本機 Sandbox');
}

async function readBrowserState(page: Page): Promise<{
  trips: unknown[];
  offlineCache: string | null;
  sandbox: string | null;
}> {
  return page.evaluate(({ myTripsKey, offlineCacheKey, sandboxKey }) => ({
    trips: JSON.parse(localStorage.getItem(myTripsKey) || '[]') as unknown[],
    offlineCache: localStorage.getItem(offlineCacheKey),
    sandbox: localStorage.getItem(sandboxKey),
  }), {
    myTripsKey: MY_TRIPS_KEY,
    offlineCacheKey: OFFLINE_CACHE_KEY,
    sandboxKey: SANDBOX_KEY,
  });
}

async function openDemoOnPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await preparePage(page, true);
  await openDemo(page);
  return page;
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
});

test('editable Demo persists, resets locally, and performs zero cloud writes', async ({ page }) => {
  await preparePage(page);
  await openDemo(page);
  await openItinerary(page);

  const originalCount = await page.getByTestId('demo-editable-place').count();
  await addNamedPlace(page, '重新整理後保留的景點');
  await expect(page.getByRole('textbox', { name: /重新整理後保留的景點.*景點名稱/u })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await openDemo(page);
  await openItinerary(page);
  await expect(page.getByRole('textbox', { name: /重新整理後保留的景點.*景點名稱/u })).toBeVisible();
  await expect(page.getByTestId('demo-editable-place')).toHaveCount(originalCount + 1);

  await page.getByTestId('demo-reset-button').click();
  await page.getByTestId('demo-reset-confirm').click();
  await expect(page.getByTestId('demo-editable-place')).toHaveCount(originalCount);
  await expect(page.getByRole('textbox', { name: /重新整理後保留的景點.*景點名稱/u })).toHaveCount(0);

  const browserState = await readBrowserState(page);
  expect(browserState.trips).toEqual([]);
  expect(browserState.offlineCache).toBeNull();
  expect(browserState.sandbox).not.toBeNull();
  expect(await readEmulatorData('rooms')).toBeNull();
});

test('itinerary, checklist, and Feature Introduction remain local and distinct from Feature Tour', async ({ page }) => {
  await preparePage(page);
  const onboardingBefore = await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY);

  await page.getByTestId('feature-introduction-button').click();
  await expect(page.getByTestId('feature-introduction-dialog')).toHaveAttribute('data-mode', 'replay');
  await page.getByTestId('feature-introduction-close').click();
  expect(await page.evaluate((key) => localStorage.getItem(key), ONBOARDING_KEY)).toBe(onboardingBefore);

  await page.getByTestId('app-settings-trigger').click();
  await expect(page.getByTestId('app-settings-feature-introduction')).toHaveAccessibleName('重新開啟功能介紹');
  await expect(page.getByTestId('app-settings-feature-tour')).toHaveAccessibleName('開啟旅程功能導覽');
  await page.keyboard.press('Escape');

  await openDemo(page);
  await openItinerary(page);
  await addNamedPlace(page, '可刪除景點');
  const addedPlace = page.getByTestId('demo-editable-place').last();
  await expect(addedPlace.locator('input[type="time"]')).toHaveValue('14:25');
  await expect(addedPlace.getByRole('textbox', { name: /備註/u })).toHaveValue('只保存在本機 Sandbox');
  await addedPlace.getByRole('button', { name: /向前移動/u }).click();
  const movedPlace = page
    .getByRole('textbox', { name: /可刪除景點.*景點名稱/u })
    .locator('xpath=ancestor::article');
  await movedPlace.getByRole('button', { name: /^刪除景點 可刪除景點$/u }).click();
  await expect(page.getByRole('textbox', { name: /可刪除景點.*景點名稱/u })).toHaveCount(0);

  await page.getByTestId('demo-tab-checklist').click();
  const checklistCount = await page.getByTestId('demo-editable-checklist-item').count();
  await page.getByTestId('demo-add-checklist-item').click();
  const item = page.getByTestId('demo-editable-checklist-item').last();
  await item.getByRole('textbox', { name: /項目名稱/u }).fill('Sandbox 新待辦');
  await item.getByRole('checkbox').check();
  await item.getByRole('combobox').selectOption({ index: 1 });
  await expect(page.getByTestId('demo-editable-checklist-item')).toHaveCount(checklistCount + 1);
  await item.getByRole('button', { name: /^刪除清單項目 Sandbox 新待辦$/u }).click();
  await expect(page.getByTestId('demo-editable-checklist-item')).toHaveCount(checklistCount);

  expect((await readBrowserState(page)).trips).toEqual([]);
  expect(await readEmulatorData('rooms')).toBeNull();
});

test('enabled Clone uses the edited Sandbox and excludes forbidden data', async ({ page }) => {
  await preparePage(page, true);
  await page.evaluate((key) => localStorage.setItem(key, '{tampered'), JOURNAL_KEY);
  await openDemo(page);
  await openItinerary(page);
  await addNamedPlace(page, 'Clone 應包含的已編輯景點');

  await page.getByTestId('demo-clone-trip-button').click();
  await page.getByTestId('clone-demo-confirm').click();
  await expect(page.getByText('旅程與 myTrips 已驗證完成。')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('html')).toHaveAttribute('data-firebase-emulator', 'true');

  const rooms = await readEmulatorData<Record<string, Record<string, unknown>>>('rooms');
  expect(rooms).not.toBeNull();
  const entries = Object.entries(rooms || {});
  expect(entries).toHaveLength(1);
  const [roomId, room] = entries[0];
  const serialized = JSON.stringify(room);
  expect(serialized).toContain('Clone 應包含的已編輯景點');
  expect(room).not.toHaveProperty('expenses');
  expect(room).not.toHaveProperty('settlements');
  expect(room).not.toHaveProperty('tickets');
  expect(room).not.toHaveProperty('attachments');
  expect(serialized).not.toContain('DEMO-ORDER');
  expect(serialized).not.toContain('local-demo-sandbox');
  expect((room.meta as { members: unknown[] }).members).toHaveLength(1);
  expect((await readBrowserState(page)).offlineCache).toBeNull();

  await page.getByTestId('clone-demo-open-trip').click();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute('data-room-id', roomId);
});

test('browser-wide lock and create-only transaction prevent a two-tab double operation', async ({ context, page }) => {
  await page.close();
  const first = await openDemoOnPage(context);
  const second = await openDemoOnPage(context);
  await first.getByTestId('demo-clone-trip-button').click();
  await second.getByTestId('demo-clone-trip-button').click();

  await Promise.all([
    first.getByTestId('clone-demo-confirm').click(),
    second.getByTestId('clone-demo-confirm').click(),
  ]);
  await expect(first.getByText('旅程與 myTrips 已驗證完成。')).toBeVisible({ timeout: 15_000 });
  await expect(second.getByText('旅程與 myTrips 已驗證完成。')).toBeVisible({ timeout: 15_000 });

  const rooms = await readEmulatorData<Record<string, unknown>>('rooms');
  expect(Object.keys(rooms || {})).toHaveLength(1);
});
