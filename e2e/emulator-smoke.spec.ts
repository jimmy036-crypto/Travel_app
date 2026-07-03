import { expect, test } from '@playwright/test';

test('App 會連到 Firebase Emulator', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('#root')).toBeAttached();

  await expect(page.locator('html')).toHaveAttribute(
    'data-firebase-emulator',
    'true',
  );
});