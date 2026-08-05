import { expect, test, type Page } from '@playwright/test';

import { clearEmulatorDatabase, seedTestTrip } from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const ROOM_ID = 'e2eprintpreviewreturn0001';

async function openExportDialog(page: Page): Promise<void> {
  const desktopExportButton = page.getByTitle('匯出完整行程或單日圖片');
  if (await desktopExportButton.isVisible()) {
    await desktopExportButton.click();
    return;
  }

  await page.getByRole('button', { name: '開啟旅程工具與設定' }).click();
  await page.getByTestId('app-settings-trip-export').click();
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, { title: '列印返回測試' });
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
  });
});

test('generated preview keeps opener isolated and provides a safe return path', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  const returnUrl = page.url();
  await openExportDialog(page);
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: '開啟列印預覽' }).click();
  const preview = await popupPromise;
  await preview.waitForLoadState('domcontentloaded');

  await expect(preview.getByRole('toolbar', { name: '完整行程預覽工具' })).toBeVisible();
  await expect(preview.getByRole('link', { name: '返回旅程' })).toHaveAttribute('href', returnUrl);
  await expect(preview.getByText(/完成或取消列印後/)).toBeVisible();
  await expect(preview.getByRole('button', { name: '列印／另存 PDF' })).toBeVisible();
  expect(await preview.evaluate(() => window.opener)).toBeNull();
});
