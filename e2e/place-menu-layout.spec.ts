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

function boxesOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return !(
    first.x + first.width <= second.x + 1
    || second.x + second.width <= first.x + 1
    || first.y + first.height <= second.y + 1
    || second.y + second.height <= first.y + 1
  );
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
      const mobileActions = card.getByTestId('place-card-actions');
      const surface = card.getByTestId('timeline-place-card-surface');
      const dragHandle = card.getByTestId('place-drag-handle');
      await expect(title).toBeVisible();
      await expect(menu).toBeVisible();
      await expect(card).toHaveAttribute('data-mobile-layout', 'timeline');
      await expect(mobileActions).toHaveAttribute('data-layout', 'mobile-timeline');
      await expect(card.getByTestId('place-info-trigger')).toBeHidden();
      await expect(card.getByTestId('desktop-place-actions')).toBeHidden();
      await expect(card.locator('button:visible')).toHaveCount(2);
      await expect(dragHandle).toBeVisible();
      await expect(card.getByRole('button', { name: /導航到/ })).toBeVisible();
      await expect(surface).toHaveCSS('padding-top', '12px');

      const [cardBox, titleBox, menuBox] = await Promise.all([
        card.boundingBox(),
        title.boundingBox(),
        menu.boundingBox(),
      ]);
      expect(cardBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(menuBox).not.toBeNull();
      expect(cardBox?.height || 0).toBeLessThanOrEqual(120);
      expect(boxesOverlap(titleBox!, menuBox!)).toBe(false);
      expect(menuBox?.width || 0).toBeGreaterThanOrEqual(44);
      expect(menuBox?.height || 0).toBeGreaterThanOrEqual(44);
      await expect(title).toHaveCSS('-webkit-line-clamp', '2');
    }

    const firstCard = placeCard(page, NAMES[0]);
    await firstCard.getByTestId('place-action-menu-trigger').click();
    await expect(page.getByTestId('place-action-menu')).toBeVisible();
    await expect(page.getByTestId('place-action-edit')).toBeVisible();
    await expect(page.getByTestId('place-action-nearby')).toBeVisible();
    await expect(page.getByTestId('place-action-copy')).toBeVisible();
    await expect(page.getByTestId('place-action-delete')).toBeVisible();
    await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
    await expect(page.getByTestId('itinerary-drag-clone')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

    const ids = await readEmulatorData<Array<{ id: string }> | Record<string, { id: string }>>(
      `rooms/${ROOM_ID}/itinerary/Day 1`,
    );
    const order = Array.isArray(ids) ? ids : Object.values(ids || {});
    expect(order.map((item) => item.id)).toEqual(['long-place-0', 'long-place-1']);
  });
}

test('desktop breakpoint keeps only 景點資訊 on the card and moves actions into Place Details', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();

  const card = placeCard(page, NAMES[0]);
  await expect(card).toHaveCSS('padding-top', '12px');
  await expect(card.getByTestId('place-card-actions')).toBeHidden();
  // Desktop cards no longer carry a direct navigation button or a hover
  // action row; navigate/edit/nearby/copy/delete all live in Place Details.
  await expect(card.getByTestId('desktop-place-actions')).toHaveCount(0);
  await expect(card.getByRole('button', { name: /導航到/ })).toHaveCount(0);
  // No resources, memo, or photo are seeded for this place, so the compact
  // info trigger renders nothing instead of a large empty placeholder.
  await expect(card.getByTestId('place-info-trigger')).toHaveCount(0);

  await card.click();
  const sheet = page.getByTestId('place-detail-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('place-detail-navigate-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-nearby-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-copy-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-delete-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-edit-button')).toBeVisible();
});
