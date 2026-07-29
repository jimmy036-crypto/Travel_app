import { expect, test } from '@playwright/test';

import { clearEmulatorDatabase, seedTestTrip } from './support/emulator';

const ROOM_ID = 'e2edesktopdensity0001';

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E Desktop Density',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    itinerary: {
      'Day 1': Array.from({ length: 6 }, (_, index) => ({
        id: `density-${index + 1}`,
        name: `密度景點 ${index + 1}`,
        customName: '',
        time: `${String(9 + index).padStart(2, '0')}:00`,
        stayTime: 20,
        tags: [],
      })),
    },
  });
});

test('1440x900 shows at least 3 basic desktop cards per day column without oversized padding', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();

  const dropzone = page.getByTestId('itinerary-day-dropzone').first();
  const dropzoneBox = await dropzone.boundingBox();
  expect(dropzoneBox).not.toBeNull();

  const cards = page.getByTestId('place-card');
  await expect(cards).toHaveCount(6);

  let fullyVisibleCount = 0;
  for (let index = 0; index < 6; index += 1) {
    const box = await cards.nth(index).boundingBox();
    if (!box) continue;
    if (box.y >= (dropzoneBox?.y || 0) && box.y + box.height <= (dropzoneBox?.y || 0) + (dropzoneBox?.height || 0) + 1) {
      fullyVisibleCount += 1;
    }
  }
  expect(fullyVisibleCount).toBeGreaterThanOrEqual(3);

  // No data was seeded with resources/memo/photo, so the compact info
  // trigger should not reserve a large empty placeholder block.
  await expect(page.getByTestId('place-info-trigger')).toHaveCount(0);

  const firstCardBox = await cards.first().boundingBox();
  expect(firstCardBox).not.toBeNull();
  expect(firstCardBox?.height || 0).toBeLessThanOrEqual(140);
});
