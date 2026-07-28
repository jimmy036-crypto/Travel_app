import { expect, test, type Page } from '@playwright/test';

import { markCurrentReleaseSeen } from './support/releaseNotes';

async function seedLobby(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    localStorage.setItem('google-travel-my-trips', JSON.stringify([{
      roomId: 'appearance-room',
      title: 'Appearance trip',
      destination: 'Taipei',
      startDate: '2026-09-20',
      endDate: '2026-09-21',
      members: ['自己'],
      transport: '步行',
      themeColor: '#3b82f6',
    }]));
  });
}

test.beforeEach(async ({ page }) => {
  await seedLobby(page);
});

test('home appearance button opens the existing color selector and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const trigger = page.getByTestId('lobby-appearance-button');
  await trigger.click();
  const dialog = page.getByTestId('appearance-dialog');
  const input = page.getByTestId('appearance-color-input');
  await expect(dialog).toBeVisible();
  await expect(input).toBeFocused();

  await input.fill('#123456');
  await expect(page.getByTestId('travel-lobby')).toHaveCSS('background-color', 'rgb(18, 52, 86)');

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByTestId('create-trip-button')).toBeVisible();
});

test('settings appearance trigger works at desktop width and returns focus to settings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');

  const settingsTrigger = page.getByTestId('app-settings-trigger');
  await settingsTrigger.click();
  await page.getByTestId('app-settings-appearance').click();
  await expect(page.getByTestId('appearance-dialog')).toBeVisible();
  await page.getByTestId('appearance-done-button').click();
  await expect(page.getByTestId('appearance-dialog')).toHaveCount(0);
  await expect(settingsTrigger).toBeFocused();
});
