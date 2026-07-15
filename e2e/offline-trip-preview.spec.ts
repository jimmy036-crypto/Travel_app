import { test, expect } from '@playwright/test';

// Define the emulator helper using same approach as other e2e tests
// Usually they might import from a helper, or use page.request
// We can just create a trip directly via UI to be robust, then go back to Lobby.

test.describe('Offline Trip Preview', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Lobby and clear state
    await page.goto('/?clear=1');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    
    // Set up a mock namespace or use actual create via UI
    // To ensure full data is there, we create a trip via the "新增旅程" button.
  });

  test('E2E-CACHE-01 ~ E2E-CACHE-11 Offline Trip Preview Flow', async ({ page, context }) => {
    // 1. Create a trip online to generate cache
    await page.click('button:has-text("新增旅程")');
    await page.fill('input[placeholder="為這趟旅程取個名字吧..."]', 'Test Offline Trip');
    await page.fill('input[placeholder="你想去哪裡？"]', 'Taipei');
    
    // Select dates
    await page.click('button:has-text("選擇日期")');
    const startDay = await page.locator('div[role="button"]:not(.text-gray-300)').first();
    await startDay.click();
    await startDay.click(); // Start and end same day
    await page.click('button:has-text("確定日期")');
    
    await page.click('button:has-text("確認建立")');
    
    // Wait for TripDetail to load
    await expect(page.locator('h1')).toContainText('Test Offline Trip');
    
    // Wait a bit for cache writing (debounce 500ms + render)
    await page.waitForTimeout(1000);
    
    // Check localStorage manually to ensure E2E-CACHE-01 is met
    const cacheStr = await page.evaluate(() => localStorage.getItem('google-travel-offline-trip-cache-v1'));
    expect(cacheStr).toContain('Test Offline Trip');
    
    // 2. Return to lobby (E2E-CACHE-02)
    await page.click('button[data-testid="back-to-lobby"]');
    
    // Check Lobby has badge
    await expect(page.locator('[data-testid="offline-cache-status"]')).toContainText('可離線查看');
    
    // 3. Go offline and click cached trip (E2E-CACHE-03)
    await context.setOffline(true);
    await page.click('[data-testid="trip-card"]');
    
    // 4 & 5. Expect Preview to show up (E2E-CACHE-04, E2E-CACHE-05)
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-preview-readonly-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-preview-cache-time"]')).toContainText('快取時間');
    await expect(page.locator('h1')).toContainText('Test Offline Trip');
    
    // 6. No editing operations (E2E-CACHE-06)
    await expect(page.locator('button:has-text("新增費用")')).toHaveCount(0);
    await expect(page.locator('button:has-text("新增景點")')).toHaveCount(0);
    
    // 7. Test clicking uncached trip while offline
    // Go back to lobby first
    await page.click('[data-testid="offline-preview-back"]');
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);
    
    // Let's create a fake trip card in local storage that doesn't have cache
    await page.evaluate(() => {
      const trips = JSON.parse(localStorage.getItem('google-travel-my-trips') || '[]');
      trips.push({ roomId: 'no-cache-room', title: 'No Cache Trip', destination: 'Nowhere' });
      localStorage.setItem('google-travel-my-trips', JSON.stringify(trips));
    });
    await page.reload();
    
    // Wait for hydration
    await expect(page.locator('h2:has-text("No Cache Trip")')).toBeVisible();
    
    // Click it
    await page.locator('h2:has-text("No Cache Trip")').click();
    
    // Should show toast, stay in lobby
    await expect(page.locator('text=請先連線並開啟此旅程一次')).toBeVisible();
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);
    
    // 8. Reconnect during preview
    await page.locator('h2:has-text("Test Offline Trip")').click(); // Back to preview
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();
    
    await context.setOffline(false);
    
    // Wait a moment, should not auto jump (E2E-CACHE-08)
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();
    
    // 9. Click open online (E2E-CACHE-09)
    await page.click('[data-testid="offline-preview-open-online"]');
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);
    await expect(page.locator('h1')).toContainText('Test Offline Trip');
    
    // 10 & 11. Clear cache
    await page.click('button[data-testid="back-to-lobby"]');
    await context.setOffline(true);
    await page.locator('h2:has-text("Test Offline Trip")').click();
    
    // Clear it
    await page.click('[data-testid="offline-preview-clear-cache"]');
    // Confirm dialog (use global modal)
    await page.click('button:has-text("清除")'); // Confirm button in modal
    
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);
    await expect(page.locator('text=已清除離線資料')).toBeVisible();
    
    // Badge disappears
    await expect(page.locator('[data-testid="offline-cache-status"]')).toHaveCount(0);
    
    // Reconnect and check trip still exists (E2E-CACHE-11)
    await context.setOffline(false);
    await page.locator('h2:has-text("Test Offline Trip")').click();
    await expect(page.locator('h1')).toContainText('Test Offline Trip');
  });

  test('E2E-CACHE-12 Mobile preview scrollable and buttons not covered', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    
    await page.click('button:has-text("新增旅程")');
    await page.fill('input[placeholder="為這趟旅程取個名字吧..."]', 'Mobile Trip');
    await page.fill('input[placeholder="你想去哪裡？"]', 'Taipei');
    await page.click('button:has-text("選擇日期")');
    const startDay = await page.locator('div[role="button"]:not(.text-gray-300)').first();
    await startDay.click();
    await startDay.click();
    await page.click('button:has-text("確定日期")');
    await page.click('button:has-text("確認建立")');
    
    await expect(page.locator('h1')).toContainText('Mobile Trip');
    await page.waitForTimeout(1000);
    
    await page.click('button[data-testid="back-to-lobby"]');
    await context.setOffline(true);
    await page.locator('h2:has-text("Mobile Trip")').click();
    
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();
    
    // Ensure back and clear cache buttons are visible / clickable
    const backBtn = page.locator('[data-testid="offline-preview-back"]');
    await expect(backBtn).toBeVisible();
    
    const clearBtn = page.locator('[data-testid="offline-preview-clear-cache"]');
    await clearBtn.scrollIntoViewIfNeeded();
    await expect(clearBtn).toBeVisible();
  });
});
