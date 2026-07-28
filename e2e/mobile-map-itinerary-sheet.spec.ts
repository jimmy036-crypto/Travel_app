import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2emobilemapitinerary0001';

function mapCard(page: Page, placeId: string) {
  return page.locator(
    `[data-testid="map-place-card"][data-place-id="${placeId}"]`,
  );
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E Mobile Map',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [
        {
          id: 'map-a',
          name: '地圖第一站',
          customName: '',
          time: '09:00',
          stayTime: 30,
          lat: 25.033,
          lng: 121.5654,
          tags: [],
          nextLeg: { mode: 'WALK', mins: 8 },
        },
        {
          id: 'map-b',
          name: '沒有定位的中途景點',
          customName: '',
          time: '10:00',
          stayTime: 45,
          lat: '',
          lng: '',
          tags: [],
          nextLeg: { mode: 'TRANSIT', mins: 20 },
        },
        {
          id: 'map-c',
          name: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
          customName: '',
          time: '11:30',
          stayTime: 60,
          lat: 25.037,
          lng: 121.57,
          tags: [],
        },
      ],
      'Day 2': [{
        id: 'map-day-two',
        name: '第二天地圖景點',
        customName: '',
        time: '08:30',
        stayTime: 30,
        lat: 25.04,
        lng: 121.58,
        tags: [],
      }],
    },
  });
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test(`${viewport.width}px map keeps the sheet, safe area, and selected day synchronized`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(`/?room=${ROOM_ID}`);
    await expect(page.getByTestId('active-trip-view')).toBeVisible();
    await page.getByTestId('mobile-nav-map').click();

    await expect(page.getByTestId('mobile-trip-header')).toBeVisible();
    await expect(page.getByTestId('mobile-day-switcher')).toBeVisible();
    await expect(page.getByTestId('mobile-trip-map-view')).toBeVisible();
    await expect(page.getByTestId('map-itinerary-sheet')).toBeVisible();
    await expect(page.getByTestId('map-place-card')).toHaveCount(3);
    await expect(mapCard(page, 'map-b').getByTestId('map-place-no-location')).toBeVisible();

    const marker = page.locator(
      '[data-testid="map-itinerary-marker"][data-place-id="map-c"]',
    );
    if (await marker.count()) {
      await marker.click();
      await expect(mapCard(page, 'map-c')).toHaveAttribute('aria-selected', 'true');
    } else {
      // Emulator mode intentionally has no production Maps key. The sheet must
      // remain usable whether the API reports an explicit failure or only
      // renders its unauthenticated map canvas.
      await expect(page.locator('[data-testid="map"]')).toHaveCount(1);
    }

    await mapCard(page, 'map-b').getByTestId('map-place-card-select').click();
    await expect(mapCard(page, 'map-b')).toHaveAttribute('aria-selected', 'true');

    const cardScroller = page.getByTestId('map-itinerary-card-scroller');
    await cardScroller.evaluate((element) => element.scrollBy({ left: 300, behavior: 'auto' }));
    await expect.poll(() => cardScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);

    const [sheetBox, navBox] = await Promise.all([
      page.getByTestId('map-itinerary-sheet').boundingBox(),
      page.getByTestId('mobile-nav-map').boundingBox(),
    ]);
    expect(sheetBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect((sheetBox?.y || 0) + (sheetBox?.height || 0)).toBeLessThanOrEqual((navBox?.y || 0) + 1);

    await page.locator(
      '[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]',
    ).click();
    await expect(page.getByTestId('map-place-card')).toHaveCount(1);
    await expect(mapCard(page, 'map-day-two')).toContainText('第二天地圖景點');
  });
}

test('map card actions remain isolated and selected cards retain details access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await page.getByTestId('mobile-nav-map').click();

  const firstCard = mapCard(page, 'map-a');
  await firstCard.getByTestId('map-place-action-menu-trigger').click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
  await expect(page.getByTestId('itinerary-drag-clone')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await firstCard.getByTestId('map-place-card-select').click();
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
});

test('desktop keeps the existing itinerary and single map composition', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();

  await expect(page.getByTestId('mobile-trip-header')).toHaveCount(0);
  await expect(page.getByTestId('mobile-trip-map-view')).toHaveCount(0);
  await expect(page.getByTestId('itinerary-day-card')).toHaveCount(2);
  await expect(page.getByTestId('map-panel')).toBeVisible();
  await expect(page.locator('[data-testid="map"]')).toHaveCount(1);
});
