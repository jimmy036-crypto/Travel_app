import { expect, test } from '@playwright/test';

test('App 會連到 Firebase Emulator', async ({ page }) => {
  const consoleMessages: string[] = [];

  page.on('console', (message) => {
    consoleMessages.push(message.text());
  });

  await page.goto('/');

  await expect(page.locator('#root')).toBeAttached();

  await expect
    .poll(() =>
      consoleMessages.some((message) =>
        message.includes('Firebase Emulator 已連線'),
      ),
    )
    .toBe(true);
});