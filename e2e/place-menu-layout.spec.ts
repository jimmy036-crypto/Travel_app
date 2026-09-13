import { skipCompanionIntroduction } from './support/companion';
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

for (const width of [320, 375, 390]) {
  test(`${width}px long place titles reserve space for the menu trigger`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/?room=${ROOM_ID}`);
    await expect(page.getByTestId('active-trip-view')).toBeVisible();
    await skipCompanionIntroduction(page);

    for (const name of NAMES) {
      const card = placeCard(page, name);
      const title = card.getByTestId('place-card-title');
      const menu = card.getByTestId('place-action-menu-trigger');
      const mobileActions = card.getByTestId('place-card-actions');
      const details = card.getByTestId('place-details-trigger');
      const navigation = card.getByRole('button', { name: /導航到/ });
      const surface = card.getByTestId('timeline-place-card-surface');
      const dragHandle = card.getByTestId('place-drag-handle');
      await expect(title).toBeVisible();
      await expect(menu).toBeVisible();
      await expect(card).toHaveAttribute('data-mobile-layout', 'timeline');
      await expect(mobileActions).toHaveAttribute('data-layout', 'mobile-timeline');
      await expect(card.getByTestId('place-info-trigger')).toBeHidden();
      await expect(card.getByTestId('desktop-place-actions')).toBeHidden();
      await expect(mobileActions.locator(':scope > button')).toHaveCount(2);
      await expect(navigation).toHaveCount(1);
      await expect(menu).toHaveCount(1);
      await expect(details).toHaveCount(1);
      expect(await details.evaluate((element) => element.tagName)).toBe('BUTTON');
      await expect(details.locator('button, a[href], [role="button"]')).toHaveCount(0);
      await expect(dragHandle).toBeVisible();
      await expect(navigation).toBeVisible();
      await expect(surface).toHaveCSS('padding-top', '12px');

      const [cardBox, titleBox, actionsBox, navigationBox, menuBox, detailsBox, dragHandleBox] = await Promise.all([
        card.boundingBox(),
        title.boundingBox(),
        mobileActions.boundingBox(),
        navigation.boundingBox(),
        menu.boundingBox(),
        details.boundingBox(),
        dragHandle.boundingBox(),
      ]);
      expect(cardBox).not.toBeNull();
      expect(titleBox).not.toBeNull();
      expect(actionsBox).not.toBeNull();
      expect(navigationBox).not.toBeNull();
      expect(menuBox).not.toBeNull();
      expect(detailsBox).not.toBeNull();
      expect(dragHandleBox).not.toBeNull();
      expect(cardBox?.height || 0).toBeLessThanOrEqual(120);
      expect(boxesOverlap(titleBox!, actionsBox!)).toBe(false);
      expect(navigationBox?.width || 0).toBeGreaterThanOrEqual(44);
      expect(navigationBox?.height || 0).toBeGreaterThanOrEqual(44);
      expect(menuBox?.width || 0).toBeGreaterThanOrEqual(44);
      expect(menuBox?.height || 0).toBeGreaterThanOrEqual(44);
      expect(detailsBox?.width || 0).toBeGreaterThanOrEqual(44);
      expect(detailsBox?.height || 0).toBeGreaterThanOrEqual(44);
      expect(dragHandleBox?.width || 0).toBeGreaterThanOrEqual(44);
      expect(dragHandleBox?.height || 0).toBeGreaterThanOrEqual(44);
      expect((menuBox?.x || 0) - ((navigationBox?.x || 0) + (navigationBox?.width || 0)))
        .toBeGreaterThanOrEqual(7.5);
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
  await skipCompanionIntroduction(page);

  const card = placeCard(page, NAMES[0]);
  await expect(card).toHaveCSS('padding-top', '12px');
  await expect(card.getByTestId('place-card-actions')).toBeHidden();
  // Desktop cards no longer carry a direct navigation button or a hover
  // action row; navigate/edit/nearby/copy/delete all live in Place Details.
  await expect(card.getByTestId('desktop-place-actions')).toHaveCount(0);
  await expect(card.getByRole('button', { name: /導航到/ })).toHaveCount(0);
  // 景點資訊 is always present as one compact CTA, regardless of whether this
  // place has resources/memo/photo - it no longer renders a large inline
  // summary, so there is no empty-placeholder concern.
  await expect(card.getByTestId('place-info-trigger')).toBeVisible();

  await card.click();
  const sheet = page.getByTestId('place-detail-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('place-detail-navigate-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-nearby-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-copy-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-delete-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-edit-button')).toBeVisible();
});
