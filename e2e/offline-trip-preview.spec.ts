import { test, expect } from '@playwright/test';
import {
  writeEmulatorData,
  clearEmulatorDatabase,
  readEmulatorData
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const ROOM_ID = 'offline-preview-room';

const testRoomData = {
  meta: {
    title: 'Test Offline Trip',
    destination: 'Taipei',
    startDate: '2026-07-15',
    endDate: '2026-07-17',
    members: ['Alice', 'Bob'],
    transport: '汽車 🚗',
    themeColor: '#3b82f6',
    createdAt: Date.now(),
    updatedAt: Date.now()
  },
  itinerary: {
    'Day 1': [
      {
        id: 'place1',
        customName: 'Custom Place Name',
        name: 'Original Place Name',
        time: '10:00',
        address: '123 Taipei St',
        memo: 'This is a test memo',
        category: '景點'
      }
    ],
    'Day 2': []
  },
  expenses: [
    {
      id: 'exp1',
      title: 'Lunch',
      cost: 500,
      payer: 'Alice',
      involved: ['Alice', 'Bob'],
      category: '餐飲 🍔'
    }
  ],
  checklist: {
    'check1': { text: 'Pack bags', completed: true },
    'check2': { text: 'Buy snacks', completed: false }
  },
  tickets: [
    {
      id: 'ticket1',
      title: 'Flight Ticket',
      note: 'Gate 3'
    }
  ]
};

test.describe('Offline Trip Preview', () => {
  test.beforeEach(async () => {
    await clearEmulatorDatabase();
    await writeEmulatorData(`rooms/${ROOM_ID}`, testRoomData);
  });

  test('E2E-CACHE-01 ~ E2E-CACHE-11 Offline Trip Preview Flow', async ({ page, context }) => {
    // 1. Setup local storage shortcut before page loads
    await page.addInitScript((roomId) => {
      window.localStorage.removeItem('google-travel-my-trips');
      window.localStorage.removeItem('google-travel-offline-trip-cache-v1');
      window.localStorage.setItem('google-travel-my-trips', JSON.stringify([{
        roomId,
        title: 'Test Offline Trip',
        destination: 'Taipei',
        startDate: '2026-07-15',
        endDate: '2026-07-17',
        members: ['Alice', 'Bob'],
        transport: '汽車 🚗',
        themeColor: '#3b82f6'
      }]));
    }, ROOM_ID);

    await page.goto('/');
    await markCurrentReleaseSeen(page);

    // Click card to open in-online TripDetail
    const card = page.locator(`[data-testid="trip-card"][data-room-id="${ROOM_ID}"]`);
    await card.click();

    // E2E-CACHE-01: Wait for TripDetail to load and generate cache in localStorage
    await expect(page.locator('[data-testid="trip-detail-title"]')).toContainText('Test Offline Trip');

    // Wait for the cache snapshot in localStorage to be populated correctly (E2E-CACHE-01)
    await expect.poll(async () => {
      const cacheRaw = await page.evaluate(() => localStorage.getItem('google-travel-offline-trip-cache-v1'));
      if (!cacheRaw) return null;
      try {
        const cache = JSON.parse(cacheRaw);
        return cache['offline-preview-room'];
      } catch {
        return null;
      }
    }).toEqual(expect.objectContaining({
      roomId: 'offline-preview-room',
      version: 1,
      meta: expect.objectContaining({
        title: 'Test Offline Trip',
      }),
      summary: expect.objectContaining({
        checklistCompleted: 1,
        checklistTotal: 2,
        expenseCount: 1,
        ticketCount: 1
      })
    }));

    // Verify customName and memo are cached properly
    const cachedRoom = await page.evaluate(() => {
      const cache = JSON.parse(localStorage.getItem('google-travel-offline-trip-cache-v1') || '{}');
      return cache['offline-preview-room'];
    });
    expect(cachedRoom.days[0].items[0].name).toBe('Custom Place Name');
    expect(cachedRoom.days[0].items[0].note).toBe('This is a test memo');

    // E2E-CACHE-02: Return to Lobby and check card badge
    await page.click('[data-testid="back-to-lobby"]');
    await expect(card.locator('[data-testid="offline-cache-status"]')).toContainText('可離線查看');

    // E2E-CACHE-03 ~ E2E-CACHE-05: Go offline and click cached card
    await context.setOffline(true);
    await card.click();

    // Verify preview mode shows up with correct information
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-preview-readonly-status"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-preview-cache-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="offline-preview-title"]')).toContainText('Test Offline Trip');
    await expect(page.locator('[data-testid="offline-preview-place"]')).toContainText('Custom Place Name');
    await expect(page.locator('[data-testid="offline-preview-place"]')).toContainText('This is a test memo');

    // E2E-CACHE-06: No editing features in preview
    const previewContainer = page.locator('[data-testid="offline-trip-preview"]');
    await expect(previewContainer.locator('button:has-text("新增")')).toHaveCount(0);
    await expect(previewContainer.locator('button:has-text("編輯")')).toHaveCount(0);
    await expect(previewContainer.locator('button:has-text("刪除")')).toHaveCount(0);

    // E2E-CACHE-07: Uncached room toast and stay in Lobby
    await page.click('[data-testid="offline-preview-back"]');
    await page.evaluate(() => {
      const trips = JSON.parse(localStorage.getItem('google-travel-my-trips') || '[]');
      trips.push({ roomId: 'uncached-room', title: 'Uncached Trip', destination: 'Nowhere' });
      localStorage.setItem('google-travel-my-trips', JSON.stringify(trips));
    });
    // Use page.goto to reload safely
    await page.goto('/');
    await markCurrentReleaseSeen(page);

    await page.locator('[data-testid="trip-card"][data-room-id="uncached-room"]').click();
    await expect(page.locator('text=請先連線並開啟此旅程一次')).toBeVisible();
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);

    // E2E-CACHE-08: Reconnect network does not auto switch
    const cachedCard = page.locator(`[data-testid="trip-card"][data-room-id="${ROOM_ID}"]`);
    await cachedCard.click();
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();

    await context.setOffline(false);
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();

    // E2E-CACHE-09: Click "開啟最新旅程" to enter TripDetail
    await page.click('[data-testid="offline-preview-open-online"]');
    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="trip-detail-title"]')).toContainText('Test Offline Trip');

    // E2E-CACHE-10: Clear cache and badge disappears
    await page.click('[data-testid="back-to-lobby"]');
    await context.setOffline(true);
    await cachedCard.click();
    await page.click('[data-testid="offline-preview-clear-cache"]');
    await page.click('[data-testid="confirm-accept"]');

    await expect(page.locator('[data-testid="offline-trip-preview"]')).toHaveCount(0);
    await expect(page.locator('text=已清除離線資料')).toBeVisible();
    await expect(cachedCard.locator('[data-testid="offline-cache-status"]')).toHaveCount(0);

    // E2E-CACHE-11: Verify Firebase room still exists
    const dbData = await readEmulatorData(`rooms/${ROOM_ID}`);
    expect(dbData).not.toBeNull();
    expect((dbData as any).meta.title).toBe('Test Offline Trip');
  });

  test('E2E-CACHE-12 Mobile preview scrollable and buttons not covered', async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.addInitScript((roomId) => {
      window.localStorage.removeItem('google-travel-my-trips');
      window.localStorage.removeItem('google-travel-offline-trip-cache-v1');
      window.localStorage.setItem('google-travel-my-trips', JSON.stringify([{
        roomId,
        title: 'Test Offline Trip',
        destination: 'Taipei',
        startDate: '2026-07-15',
        endDate: '2026-07-17',
        members: ['Alice', 'Bob'],
        transport: '汽車 🚗',
        themeColor: '#3b82f6'
      }]));
    }, ROOM_ID);

    await page.goto('/');
    await markCurrentReleaseSeen(page);

    const card = page.locator(`[data-testid="trip-card"][data-room-id="${ROOM_ID}"]`);
    await card.click();
    await expect(page.locator('[data-testid="trip-detail-title"]')).toContainText('Test Offline Trip');
    await page.waitForTimeout(1000);

    await page.click('[data-testid="back-to-lobby"]');
    await context.setOffline(true);
    await card.click();

    await expect(page.locator('[data-testid="offline-trip-preview"]')).toBeVisible();

    const backBtn = page.locator('[data-testid="offline-preview-back"]');
    const clearBtn = page.locator('[data-testid="offline-preview-clear-cache"]');
    const banner = page.locator('[data-testid="offline-banner"]');

    await expect(backBtn).toBeVisible();
    await expect(clearBtn).toBeVisible();
    await expect(banner).toBeVisible();

    const backBox = await backBtn.boundingBox();
    const clearBox = await clearBtn.boundingBox();
    const bannerBox = await banner.boundingBox();

    expect(backBox).not.toBeNull();
    expect(clearBox).not.toBeNull();
    expect(bannerBox).not.toBeNull();

    // Verify back button doesn't overlap banner
    const backOverlaps = !(
      backBox!.x + backBox!.width <= bannerBox!.x ||
      bannerBox!.x + bannerBox!.width <= backBox!.x ||
      backBox!.y + backBox!.height <= bannerBox!.y ||
      bannerBox!.y + bannerBox!.height <= backBox!.y
    );
    expect(backOverlaps).toBe(false);

    // Verify clear cache button doesn't overlap banner
    const clearOverlaps = !(
      clearBox!.x + clearBox!.width <= bannerBox!.x ||
      bannerBox!.x + bannerBox!.width <= clearBox!.x ||
      clearBox!.y + clearBox!.height <= bannerBox!.y ||
      bannerBox!.y + bannerBox!.height <= clearBox!.y
    );
    expect(clearOverlaps).toBe(false);
  });
});
