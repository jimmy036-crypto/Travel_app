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

    await expect(page.getByTestId('mobile-trip-header')).toHaveCount(0);
    await expect(page.getByTestId('mobile-map-top-bar')).toBeVisible();
    await expect(page.getByTestId('mobile-day-switcher')).toBeVisible();
    await expect(page.getByTestId('back-to-lobby')).toBeVisible();
    await expect(page.getByTestId('app-settings-trigger')).toBeVisible();
    await expect(page.getByTestId('mobile-trip-map-view')).toBeVisible();
    await expect(page.getByTestId('map-itinerary-sheet')).toBeVisible();
    await expect(page.getByTestId('map-itinerary-sheet')).toHaveAttribute('data-state', 'cards');
    await expect(page.getByTestId('map-place-card')).toHaveCount(3);
    await expect(mapCard(page, 'map-b').getByTestId('map-place-no-location')).toBeVisible();
    await expect(page.getByTestId('map-explore-trigger')).toBeVisible();
    await expect(page.getByRole('textbox', { name: '探索周邊' })).toHaveCount(0);

    const mapCards = page.getByTestId('map-place-card');
    const firstCardBox = await mapCards.first().boundingBox();
    expect(firstCardBox).not.toBeNull();
    expect(firstCardBox?.width || 0).toBeGreaterThanOrEqual(131);
    expect(firstCardBox?.width || 0).toBeLessThanOrEqual(161);
    await expect(mapCards.first().getByRole('button', { name: /導航到/ })).toHaveCount(0);
    await expect(mapCards.first().getByTestId('map-place-action-menu-trigger')).toHaveCount(0);

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
    await mapCard(page, 'map-b').getByTestId('map-place-card-select').click();
    await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
    await page.getByRole('button', { name: '關閉景點詳細資訊' }).click();

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

    await page.getByTestId('map-sheet-toggle').click();
    await expect(page.getByTestId('map-itinerary-sheet')).toHaveAttribute('data-state', 'peek');
    await expect(page.getByTestId('map-sheet-peek-label')).toContainText('第二天地圖景點');
    const peekBox = await page.getByTestId('map-sheet-peek').boundingBox();
    expect(peekBox).not.toBeNull();
    expect(peekBox?.height || 0).toBeGreaterThanOrEqual(44);
    const [peekSheetBox, mobileNavBox] = await Promise.all([
      page.getByTestId('map-itinerary-sheet').boundingBox(),
      page.getByTestId('mobile-nav-map').boundingBox(),
    ]);
    expect((peekSheetBox?.y || 0) + (peekSheetBox?.height || 0)).toBeLessThanOrEqual((mobileNavBox?.y || 0) + 1);

    await page.getByTestId('map-sheet-peek').click();
    await expect(page.getByTestId('map-itinerary-sheet')).toHaveAttribute('data-state', 'cards');
    await expect(page.getByTestId('map-place-card')).toHaveCount(1);
  });
}

test('map cards use two-stage details access without timeline-only actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await page.getByTestId('mobile-nav-map').click();

  const thirdCard = mapCard(page, 'map-c');
  await expect(thirdCard.getByTestId('map-place-action-menu-trigger')).toHaveCount(0);
  await expect(thirdCard.getByRole('button', { name: /導航到/ })).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
  await expect(page.getByTestId('itinerary-drag-clone')).toHaveCount(0);

  await thirdCard.getByTestId('map-place-card-select').click();
  await expect(thirdCard).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
  await thirdCard.getByTestId('map-place-card-select').click();
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
