import { test, expect } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

test('T3 offline notices leave all four mobile destinations reachable', async ({ page, context }, testInfo) => {
  await clearEmulatorDatabase();
  await seedTestTrip('t3-offline-navigation', { title: '合成離線協作旅程' });
  await markCurrentReleaseSeen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?room=t3-offline-navigation');
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('sync-status-indicator')).toContainText('上次已同步');
  await context.setOffline(true);
  const banner = page.getByTestId('offline-banner');
  await expect(banner).toContainText('無法確認雲端同步狀態');
  for (const width of [320, 375, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const navigation = page.getByTestId('mobile-bottom-navigation');
    await expect(navigation.getByRole('button')).toHaveText(['行程', '地圖', '票券', '記帳']);
    const navBox = (await navigation.boundingBox())!;
    const bannerBox = (await banner.boundingBox())!;
    expect(bannerBox.y + bannerBox.height).toBeLessThanOrEqual(navBox.y + 1);
    for (const button of await navigation.getByRole('button').all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      await button.click();
      await expect(button).toHaveAttribute('aria-current', 'page');
    }
    await page.getByTestId('mobile-nav-map').click();
    await expect(page.getByTestId('sync-status-indicator')).toContainText('離線');
    expect(await page.getByTestId('sync-status-indicator').getByText('離線').evaluate((element) => getComputedStyle(element).clip)).toBe('auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByTestId('mobile-nav-plan').click();
    if (width === 320) await testInfo.attach('after-trip-offline-320', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  }
  await context.setOffline(false);
  await expect(banner).toHaveCount(0);
  await expect(page.getByTestId('toast').filter({ hasText: '已恢復連線' })).toContainText('請稍候確認最新資料已同步');
});

test.describe('Offline Awareness', () => {
  test.beforeEach(async ({ page }) => {
    await clearEmulatorDatabase();
    await markCurrentReleaseSeen(page);
    await page.addInitScript(() => {
      localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    });
    // Navigate to Lobby
    await page.goto('/');
    // Wait for the app to initialize
    await page.waitForSelector('[data-testid="travel-lobby"]');
    await expect(page.getByTestId('lobby-account-status')).toContainText('趟雲端旅程');
  });

  test('E2E-01, E2E-02, E2E-03: Offline banner in Lobby and recovery toast', async ({ page, context }) => {
    // Should not show offline banner initially
    await expect(page.getByTestId('offline-banner')).toBeHidden();

    // Go offline
    await context.setOffline(true);
    
    // E2E-01: Banner should appear
    await expect(page.getByTestId('offline-banner')).toBeVisible();
    await expect(page.getByTestId('offline-banner')).toContainText('目前離線');

    // E2E-06: 離線送出建立旅程不產生 Firebase room (blocked)
    const initialRooms = await readEmulatorData<Record<string, unknown>>('rooms') || {};
    const initialRoomCount = Object.keys(initialRooms).length;

    const createBtn = page.getByTestId('create-trip-button').or(page.getByTestId('lobby-empty-create-trip'));
    await createBtn.click();
    
    await page.getByTestId('trip-name-input').fill('Offline Trip Test');
    await page.getByTestId('trip-destination-field').getByRole('combobox').fill('Taipei');
    // We don't really have to select Google Places, we can just click "確認儲存" and expect it to be blocked
    await page.getByRole('button', { name: '確認建立' }).click();
    
    // Should show error toast
    await expect(page.getByRole('heading', { name: '目前離線' }).first()).toBeVisible();
    await expect(page.getByText('請恢復網路連線後再試').first()).toBeVisible();

    const finalRooms = await readEmulatorData<Record<string, unknown>>('rooms') || {};
    expect(Object.keys(finalRooms).length).toBe(initialRoomCount);
    
    // Modal is still there and values are preserved
    await expect(page.getByTestId('trip-name-input')).toHaveValue('Offline Trip Test');

    // E2E-07: 離線驗證邀請不進入永久 loading
    await page.getByRole('button', { name: '取消' }).click();
    
    const importBtn = page.getByTestId('import-trip-button').or(page.getByTestId('lobby-empty-import-trip'));
    await importBtn.click();
    
    const importInput = page.getByRole('textbox', { name: '旅程邀請連結' });
    await importInput.fill(`https://example.test/#invite=${'a'.repeat(43)}`);
    const confirmImportBtn = page.getByRole('button', { name: '驗證並加入' });
    await confirmImportBtn.click();
    
    await expect(page.getByText('請恢復網路連線後再試').first()).toBeVisible();
    
    // Check modal and input preserved, button not disabled
    await expect(importInput).toHaveValue(`https://example.test/#invite=${'a'.repeat(43)}`);
    await expect(confirmImportBtn).toBeEnabled();
    // Loading is not continuing (the button returns to its idle label).
    await expect(confirmImportBtn).toHaveText('驗證並加入');

    // Go online
    await context.setOffline(false);
    
    // E2E-02: Banner should disappear
    await expect(page.getByTestId('offline-banner')).toBeHidden();

    // E2E-03: Recovery toast should appear
    const recoveryToast = page.getByRole('heading', {
      name: '已恢復連線',
      exact: true,
    });
    
    await expect(recoveryToast).toHaveCount(1);
    await expect(recoveryToast).toBeVisible();
  });

  test('E2E-04, E2E-05, E2E-08: TripDetail offline behavior', async ({ page, context, isMobile }) => {
    await clearEmulatorDatabase();
    await seedTestTrip('offline-test-room', {
      title: 'Offline Test Trip',
      startDate: '2026-01-01',
      endDate: '2026-01-02',
      members: ['自己'],
    });

    await page.goto('/?room=offline-test-room');
    await page.waitForSelector('[data-testid="trip-route-context"]');

    // Wait until it's "已同步" or idle
    // Debug: if error occurs, print it
    const errorMsg = page.getByText('找不這趟旅程').or(page.getByText('找不到這個旅程'));
    if (await errorMsg.isVisible()) {
      console.log('Room load failed!');
    }
    
    const syncIndicator = page.getByTestId('sync-status-indicator');
    await expect(syncIndicator).toBeVisible({ timeout: 10000 });

    // Go offline
    await context.setOffline(true);

    // E2E-04: SyncStatusIndicator shows "離線"
    await expect(syncIndicator).toContainText('離線');
    await expect(page.getByTestId('offline-banner')).toBeVisible();

    if (isMobile) {
      // E2E-08: Check that the offline banner does not cover back button or settings
      const backButton = page.getByTestId('back-to-lobby');
      const settingsButton = page.getByTestId('app-settings-trigger');
      const offlineBanner = page.getByTestId('offline-banner');
      
      // Ensure they are clickable (not covered by fixed element)
      await expect(backButton).toBeVisible();
      await expect(settingsButton).toBeVisible();
      
      const backBox = await backButton.boundingBox();
      const settingsBox = await settingsButton.boundingBox();
      const bannerBox = await offlineBanner.boundingBox();
      
      // Just check if banner bottom logic doesn't intersect top header
      if (backBox && settingsBox && bannerBox) {
        // Banner shouldn't overlap back button
        const backNotOverlapped = bannerBox.y > backBox.y + backBox.height || bannerBox.y + bannerBox.height < backBox.y;
        expect(backNotOverlapped).toBeTruthy();
        
        // Banner shouldn't overlap settings button
        const settingsNotOverlapped = bannerBox.y > settingsBox.y + settingsBox.height || bannerBox.y + bannerBox.height < settingsBox.y;
        expect(settingsNotOverlapped).toBeTruthy();
      }
    }

    // Go back online
    await context.setOffline(false);

    // E2E-05: SyncStatusIndicator should go back from offline
    await expect(syncIndicator).not.toContainText('離線');
    
    // Banner should be hidden
    await expect(page.getByTestId('offline-banner')).toBeHidden();
    
    // Recovery toast
    const detailRecoveryToast = page.getByRole('heading', {
      name: '已恢復連線',
      exact: true,
    });
    await expect(detailRecoveryToast).toHaveCount(1);
    await expect(detailRecoveryToast).toBeVisible();
  });
});
