import { test, expect } from '@playwright/test';

test.describe('Offline Awareness', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Lobby
    await page.goto('/');
    // Wait for the app to initialize
    await page.waitForSelector('[data-testid="travel-lobby"]');
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
    const initialRoomsResponse = await page.request.get('http://127.0.0.1:9000/rooms.json?ns=demo-travel-e2e-default-rtdb');
    const initialRooms = await initialRoomsResponse.json() || {};
    const initialRoomCount = Object.keys(initialRooms).length;

    const createBtn = page.getByTestId('create-trip-button').or(page.getByTestId('lobby-empty-create-trip'));
    await createBtn.click();
    
    await page.getByTestId('trip-name-input').fill('Offline Trip Test');
    await page.getByTestId('trip-destination-field').getByRole('textbox').fill('Taipei');
    // We don't really have to select Google Places, we can just click "確認儲存" and expect it to be blocked
    await page.getByRole('button', { name: '確認建立' }).click();
    
    // Should show error toast
    await expect(page.getByRole('heading', { name: '目前離線' }).first()).toBeVisible();
    await expect(page.getByText('請恢復網路連線後再試').first()).toBeVisible();

    const finalRoomsResponse = await page.request.get('http://127.0.0.1:9000/rooms.json?ns=demo-travel-e2e-default-rtdb');
    const finalRooms = await finalRoomsResponse.json() || {};
    expect(Object.keys(finalRooms).length).toBe(initialRoomCount);
    
    // Modal is still there and values are preserved
    await expect(page.getByTestId('trip-name-input')).toHaveValue('Offline Trip Test');

    // E2E-07: 離線匯入不進入永久 loading
    await page.getByRole('button', { name: '取消' }).click();
    
    const importBtn = page.getByTestId('import-trip-button').or(page.getByTestId('lobby-empty-import-trip'));
    await importBtn.click();
    
    const importInput = page.getByPlaceholder('貼上網址或房間 ID...');
    await importInput.fill('some-room-id');
    const confirmImportBtn = page.getByRole('button', { name: '確認匯入' });
    await confirmImportBtn.click();
    
    await expect(page.getByText('請恢復網路連線後再試').first()).toBeVisible();
    
    // Check modal and input preserved, button not disabled
    await expect(importInput).toHaveValue('some-room-id');
    await expect(confirmImportBtn).toBeEnabled();
    // Loading is not continuing (the button text is '確認匯入' not loading state, if any)
    await expect(confirmImportBtn).toHaveText('確認匯入');

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
    // Prepare a trip using the emulator helper
    // Navigate to root first to establish origin before setting localStorage
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('google-travel-my-trips', JSON.stringify([{
        roomId: 'offline-test-room',
        title: 'Offline Test Trip',
        destination: 'Taipei',
        startDate: '2025-01-01',
        endDate: '2025-01-02',
        members: ['自己'],
      }]));
    });

    const response = await page.request.put('http://127.0.0.1:9000/rooms/offline-test-room/meta.json?ns=demo-travel-e2e-default-rtdb', {
      data: {
        title: 'Offline Test Trip',
        destination: 'Taipei',
        startDate: '2025-01-01',
        endDate: '2025-01-02',
        members: ['自己'],
        themeColor: '#1e293b'
      }
    });
    expect(response.ok()).toBeTruthy();

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
      const backButton = page.getByTestId('trip-detail-back-button').or(page.getByRole('button', { name: '◀ 返回' }));
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
