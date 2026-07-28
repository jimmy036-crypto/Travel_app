import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2eplacemenulayout0001';
const NAMES = [
  '沖繩美麗海水族館 海洋博公園 熱帶夢幻中心紀念品商店',
  'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
];

function placeCard(page: Page, name: string) {
  return page.getByTestId('place-card').filter({ hasText: name }).first();
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E place menu layout',
    itinerary: {
      'Day 1': NAMES.map((name, index) => ({
        id: `long-place-${index}`,
        name,
        customName: '',
        time: `${String(9 + index).padStart(2, '0')}:00`,
        stayTime: 30,
        tags: [],
        nextLeg: { mode: 'WALK', mins: 10 },
      })),
    },
  });
});

for (const width of [320, 390]) {
  test(`${width}px long place titles reserve space for the menu trigger`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/?room=${ROOM_ID}`);
    await expect(page.getByTestId('active-trip-view')).toBeVisible();

    for (const name of NAMES) {
      const card = placeCard(page, name);
      const title = card.getByTestId('place-card-title');
      const menu = card.getByTestId('place-action-menu-trigger');
      await expect(title).toBeVisible();
      await expect(menu).toBeVisible();
      const [titleBox, menuBox] = await Promise.all([title.boundingBox(), menu.boundingBox()]);
      expect(titleBox).not.toBeNull();
      expect(menuBox).not.toBeNull();
      expect((titleBox?.x || 0) + (titleBox?.width || 0)).toBeLessThanOrEqual((menuBox?.x || 0) + 1);
      expect(menuBox?.width || 0).toBeGreaterThanOrEqual(44);
      expect(menuBox?.height || 0).toBeGreaterThanOrEqual(44);
      await expect(title).toHaveCSS('-webkit-line-clamp', '2');
    }

    const firstCard = placeCard(page, NAMES[0]);
    await firstCard.getByTestId('place-action-menu-trigger').click();
    await expect(page.getByTestId('place-action-menu')).toBeVisible();
    await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

    const ids = await readEmulatorData<Array<{ id: string }> | Record<string, { id: string }>>(
      `rooms/${ROOM_ID}/itinerary/Day 1`,
    );
    const order = Array.isArray(ids) ? ids : Object.values(ids || {});
    expect(order.map((item) => item.id)).toEqual(['long-place-0', 'long-place-1']);
  });
}
