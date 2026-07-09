import { expect, test } from '@playwright/test';

test('首頁可以正常開啟', async ({ page }) => {
  await page.goto('/');

  // React 掛載點必須存在
  await expect(page.locator('#root')).toBeAttached();

  // 頁面標題符合目前 App 名稱
  await expect(page).toHaveTitle(
    /智の旅行|Jimmy's Travel App/,
  );
});