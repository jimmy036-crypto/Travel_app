import { expect, test, type Page } from '@playwright/test';

import { markCurrentReleaseSeen } from './support/releaseNotes';
import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
  writeEmulatorData,
} from './support/emulator';

async function seedLobby(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
  });
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await seedTestTrip('appearance-room', {
    title: 'Appearance trip',
  });
  await seedLobby(page);
});

test('home settings opens the existing color selector and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const trigger = page.getByTestId('app-settings-trigger');
  await trigger.click();
  await page.getByTestId('app-settings-appearance').click();
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

test('custom light surfaces stay readable when the device prefers dark mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() => {
    localStorage.setItem('google-travel-custom-bg', '#d8b4e2');
  });
  await writeEmulatorData('rooms/appearance-room/meta/themeColor', '#d9f3fb');

  await page.goto('/');
  for (const button of [page.getByTestId('import-trip-button')]) {
    await expect(button).toHaveCSS('color', /^oklch\(0\.208 0\.042 265\.755/);
    await expect(button).toHaveClass(/bg-white\/60/);
    await expect(button).toHaveCSS('background-color', /^oklab\(.+ \/ 0\.6\)$/);
  }

  await page.goto('/?room=appearance-room');
  const syncStatus = page.getByTestId('sync-status-indicator').first();
  await expect(syncStatus).toContainText('已同步');
  await expect(syncStatus).toHaveAttribute('data-theme', 'light');
  await expect(syncStatus).toHaveCSS('color', /^oklch\(0\.432 0\.095 166\.91/);
  await expect(syncStatus).toHaveClass(/bg-emerald-50\/95/);
  await expect(syncStatus).toHaveCSS('background-color', /^oklab\(.+ \/ 0\.95\)$/);

  const activeTab = page.getByTestId('mobile-nav-plan');
  await expect(activeTab).toHaveAttribute('aria-current', 'page');
  await expect(activeTab).toHaveCSS('background-color', /^oklch\(0\.546 0\.245 262\.88/);
  await expect(activeTab).toHaveCSS('color', 'rgb(255, 255, 255)');
});

test('lobby theme controls reflow without clipping at 200% text size', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('google-travel-custom-bg', '#d8b4e2');
  });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

  const controls = [
    page.getByRole('heading', { level: 1, name: '智の旅行' }),
    page.getByTestId('create-trip-button'),
    page.getByTestId('import-trip-button'),
    page.getByTestId('app-settings-trigger'),
  ];
  for (const control of controls) {
    await expect(control).toBeVisible();
    const overflow = await control.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);

  const createBox = await page.getByTestId('create-trip-button').boundingBox();
  const importBox = await page.getByTestId('import-trip-button').boundingBox();
  expect(importBox?.y || 0).toBeGreaterThan((createBox?.y || 0) + (createBox?.height || 0) - 1);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.reload();
  await expect(page.getByTestId('import-trip-button')).toBeVisible();
  await expect(page.getByTestId('app-settings-trigger')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
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

test('Trip Settings opens the context-aware appearance dialog and persists its color', async ({ page }) => {
  await page.goto('/?room=appearance-room');
  const settingsTrigger = page.getByTestId('app-settings-trigger');
  await settingsTrigger.click();
  await page.getByTestId('app-settings-appearance').click();

  const dialog = page.getByTestId('appearance-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('旅程主題顏色');
  const input = page.getByTestId('appearance-color-input');
  await input.fill('#123456');
  await expect(page.getByTestId('active-trip-view')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
  await page.getByTestId('appearance-done-button').click();
  await expect(dialog).toHaveCount(0);
  await expect(settingsTrigger).toBeFocused();

  await expect.poll(() => readEmulatorData('rooms/appearance-room/meta/themeColor'))
    .toBe('#123456');
  await page.reload();
  await expect(page.getByTestId('active-trip-view')).toHaveCSS('background-color', 'rgb(18, 52, 86)');
});
