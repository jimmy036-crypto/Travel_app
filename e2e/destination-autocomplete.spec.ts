import { expect, test, type Page } from '@playwright/test';

import { clearEmulatorDatabase } from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

async function prepare(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    localStorage.setItem('google-travel-my-trips', '[]');
    const callbacks: Array<(result: unknown, status: string) => void> = [];
    (window as Window & {
      __TRAVEL_E2E_DESTINATION_PLACES__?: unknown;
      __TRAVEL_E2E_DESTINATION_CALLBACKS__?: typeof callbacks;
    }).__TRAVEL_E2E_DESTINATION_CALLBACKS__ = callbacks;
    (window as Window & {
      __TRAVEL_E2E_DESTINATION_PLACES__?: unknown;
    }).__TRAVEL_E2E_DESTINATION_PLACES__ = {
      AutocompleteService: class {
        getPlacePredictions(
          _request: unknown,
          callback: (results: unknown[], status: string) => void,
        ) {
          callback([
            { place_id: 'tokyo', description: '日本東京都' },
            { place_id: 'osaka', description: '日本大阪府' },
          ], 'OK');
        }
      },
      PlacesService: class {
        getDetails(
          _request: unknown,
          callback: (result: unknown, status: string) => void,
        ) {
          callbacks.push(callback);
        }
      },
    };
  });
}

async function openDestination(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '建立新旅程', exact: true }).first().click();
  return page.getByTestId('trip-destination-field').getByRole('combobox');
}

async function completeLatestDetails(page: Page, status = 'OK'): Promise<void> {
  await page.evaluate((nextStatus) => {
    const target = window as Window & {
      __TRAVEL_E2E_DESTINATION_CALLBACKS__?: Array<
        (result: unknown, status: string) => void
      >;
    };
    const callback = target.__TRAVEL_E2E_DESTINATION_CALLBACKS__?.at(-1);
    callback?.(
      nextStatus === 'OK'
        ? { geometry: { location: { lat: () => 35.6762, lng: () => 139.6503 } } }
        : null,
      nextStatus,
    );
  }, status);
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await prepare(page);
});

test('one pointer selection shows loading and applies destination once', async ({ page }) => {
  const input = await openDestination(page);
  await input.fill('東京');
  const option = page.getByRole('option', { name: '日本東京都' });
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByRole('status')).toContainText('正在取得地點資料');
  await completeLatestDetails(page);
  await expect(input).toHaveValue('日本東京都');
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('keyboard selection, stale callback rejection, and failure recovery remain usable', async ({ page }) => {
  const input = await openDestination(page);
  await input.fill('東京');
  await expect(page.getByRole('option', { name: '日本東京都' })).toBeVisible();
  await input.press('ArrowDown');
  await input.press('Enter');
  await input.fill('大阪');
  await completeLatestDetails(page);
  await expect(input).toHaveValue('大阪');

  await expect(page.getByRole('option', { name: '日本大阪府' })).toBeVisible();
  await page.getByRole('option', { name: '日本大阪府' }).click();
  await completeLatestDetails(page, 'ZERO_RESULTS');
  await expect(input).toHaveValue('日本大阪府');
  await expect(page.getByRole('alert')).toContainText('無法取得此目的地的座標');
});
