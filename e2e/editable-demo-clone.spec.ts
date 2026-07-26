import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  readEmulatorData,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const EXAMPLE_ID = 'local-example-trip';
const LEGACY_SANDBOX_KEY = 'travel-app-demo-sandbox-v1';
const LEGACY_JOURNAL_KEY = 'travel-app-demo-clone-operation-v1';

async function prepareLobby(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    localStorage.setItem('google-travel-my-trips', '[]');
  });
}

async function openExample(page: Page): Promise<void> {
  await page.goto('/');
  const card = page.getByTestId('demo-trip-entry-card');
  await expect(card).toBeVisible();
  await card.getByTestId('example-trip-card-title').click();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await clearEmulatorStorage();
  await prepareLobby(page);
});

test('production Clone remains disabled and no legacy preview UI is rendered', async ({ page }) => {
  await openExample(page);

  await expect(page.getByText(/Clone/i)).toHaveCount(0);
  await expect(page.getByTestId('demo-trip-preview')).toHaveCount(0);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-room-id',
    EXAMPLE_ID,
  );
});

test('editing uses the versioned IndexedDB envelope instead of legacy localStorage', async ({ page }) => {
  await openExample(page);
  await expect.poll(() => page.evaluate(() => typeof (
    window as Window & {
      __TRAVEL_E2E__?: { addTestPlace?: () => void };
    }
  ).__TRAVEL_E2E__?.addTestPlace)).toBe('function');
  await page.evaluate(() => (
    window as Window & {
      __TRAVEL_E2E__?: { addTestPlace?: () => void };
    }
  ).__TRAVEL_E2E__?.addTestPlace?.());
  await expect(page.getByTestId('place-card').filter({ hasText: 'E2E 測試餐廳' })).toBeVisible();

  const record = await page.evaluate(async ({ databaseName, storeName, key }) => {
    const database = await new Promise<IDBDatabase>((resolvePromise, rejectPromise) => {
      const request = indexedDB.open(databaseName);
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => rejectPromise(request.error);
    });
    const value = await new Promise<unknown>((resolvePromise, rejectPromise) => {
      const transaction = database.transaction(storeName, 'readonly');
      const request = transaction.objectStore(storeName).get(key);
      request.onsuccess = () => resolvePromise(request.result);
      request.onerror = () => rejectPromise(request.error);
    });
    database.close();
    return value;
  }, {
    databaseName: 'travel-app-local-example-trip',
    storeName: 'tripRecords',
    key: EXAMPLE_ID,
  }) as {
    schemaVersion?: string;
    templateVersion?: string;
    tripId?: string;
    snapshot?: { itinerary?: Record<string, Array<{ name?: string }>> };
  };

  expect(record).toMatchObject({
    schemaVersion: '1.0.0',
    templateVersion: '1.0.0',
    tripId: EXAMPLE_ID,
  });
  expect(
    Object.values(record.snapshot?.itinerary || {})
      .flat()
      .some((place) => place.name === 'E2E 測試餐廳'),
  ).toBe(true);
  expect(await page.evaluate((keys) => keys.map((key) => localStorage.getItem(key)), [
    LEGACY_SANDBOX_KEY,
    LEGACY_JOURNAL_KEY,
  ])).toEqual([null, null]);
});

test('local edits create no Firebase room, Storage object, myTrips, or Offline Cache entry', async ({ page }) => {
  await openExample(page);
  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('google-travel-my-trips'))).toBe('[]');
  expect(await page.evaluate((tripId) => (
    localStorage.getItem('google-travel-offline-trip-cache-v1') || ''
  ).includes(tripId), EXAMPLE_ID)).toBe(false);
});
