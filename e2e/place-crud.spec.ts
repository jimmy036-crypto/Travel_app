import { expect, test, type Dialog, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2eplacecrudroom0001';
const ORIGINAL_NAME = 'E2E 測試餐廳';
const EDITED_NAME = 'E2E 已編輯餐廳';
const EDITED_NOTE = 'E2E 編輯後筆記';

type PlaceItem = {
  id?: string;
  name?: string;
  customName?: string;
  time?: string;
  stayTime?: string | number;
  memo?: string;
};

function placeCardByName(page: Page, dayId: string, name: string) {
  return page
    .locator(`[data-testid="itinerary-day-card"][data-day-id="${dayId}"]`)
    .getByTestId('place-card')
    .filter({ hasText: name })
    .first();
}

async function expectMenuWithinViewport(page: Page) {
  const menu = page.getByTestId('place-action-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.y).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width - 12 + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height - 12 + 1);
}

async function openDeleteConfirmationForPlace(
  page: Page,
  dayId: string,
  name: string,
) {
  const placeCard = placeCardByName(page, dayId, name);
  await expect(placeCard).toBeVisible({ timeout: 20_000 });

  const mobileActionTrigger = placeCard.getByTestId('place-action-menu-trigger');
  if (await mobileActionTrigger.isVisible().catch(() => false)) {
    await mobileActionTrigger.click();
    await page.getByTestId('place-action-delete').click();
    return;
  }

  await placeCard.hover();
  await placeCard.locator('[data-testid="delete-place-button"]:visible').click();
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID);
});

test('新增、編輯景點與詳細資訊會保存到 Firebase Emulator', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            typeof (
              window as Window & {
                __TRAVEL_E2E__?: {
                  addTestPlace?: () => void;
                };
              }
            ).__TRAVEL_E2E__?.addTestPlace === 'function',
        ),
      {
        timeout: 10_000,
        message: 'TripDetail 應註冊 Emulator E2E 景點新增 hook',
      },
    )
    .toBe(true);

  await page.evaluate(() => {
    const e2eWindow = window as Window & {
      __TRAVEL_E2E__?: {
        addTestPlace?: () => void;
      };
    };

    e2eWindow.__TRAVEL_E2E__?.addTestPlace?.();
  });

  let placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: ORIGINAL_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 15_000,
  });

  await expect
    .poll(
      async () => {
        const dayItems = await readEmulatorData<PlaceItem[]>(
          `rooms/${ROOM_ID}/itinerary/Day 1`,
        );

        return Array.isArray(dayItems)
          ? dayItems.some((item) => item.name === ORIGINAL_NAME)
          : false;
      },
      {
        timeout: 15_000,
        message: '新增景點後應寫入 Database Emulator',
      },
    )
    .toBe(true);

  await page.reload();

  placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: ORIGINAL_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 20_000,
  });

  await placeCard.click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await expect(page.getByTestId('place-detail-title')).toHaveText(
    ORIGINAL_NAME,
  );

  await page.getByTestId('place-detail-edit-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();

  await page.getByTestId('place-name-input').fill(EDITED_NAME);
  await page.getByTestId('place-arrival-time-input').fill('12:30');
  await page.getByTestId('place-stay-duration-input').fill('75');
  await page.getByTestId('place-note-input').fill(EDITED_NOTE);
  await page.getByTestId('save-place-button').click();

  placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: EDITED_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 15_000,
  });

  await expect
    .poll(
      async () => {
        const dayItems = await readEmulatorData<PlaceItem[]>(
          `rooms/${ROOM_ID}/itinerary/Day 1`,
        );

        const editedPlace = Array.isArray(dayItems)
          ? dayItems.find((item) => item.customName === EDITED_NAME)
          : null;

        return editedPlace
          ? {
              customName: editedPlace.customName,
              time: editedPlace.time,
              stayTime: String(editedPlace.stayTime),
              memo: editedPlace.memo,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '編輯後的景點資料應寫入 Database Emulator',
      },
    )
    .toEqual({
      customName: EDITED_NAME,
      time: '12:30',
      stayTime: '75',
      memo: EDITED_NOTE,
    });

  await page.reload();

  placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: EDITED_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 20_000,
  });

  await placeCard.click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await expect(page.getByTestId('place-detail-title')).toHaveText(
    EDITED_NAME,
  );
  await expect(page.getByTestId('place-detail-note')).toHaveText(
    EDITED_NOTE,
  );
});

test('uses the shared confirmation dialog before deleting a place', async ({
  page,
}) => {
  const placeName = 'E2E Shared Confirm Place';
  await seedTestTrip(ROOM_ID, {
    title: 'E2E shared delete confirmation trip',
    itinerary: {
      'Day 1': [
        {
          id: 'shared-confirm-delete-place',
          name: placeName,
          place_id: 'shared-confirm-delete-place-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Shared Confirm address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
        },
      ],
    },
  });

  let nativeDialogSeen = false;
  const nativeDialogHandler = async (dialog: Dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  };
  page.on('dialog', nativeDialogHandler);

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(placeCardByName(page, 'Day 1', placeName)).toBeVisible();

  await openDeleteConfirmationForPlace(page, 'Day 1', placeName);
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await expect(page.getByTestId('confirm-dialog')).toContainText('刪除這個景點？');
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    '刪除後，這個景點會從所有協作者的行程中移除。',
  );
  await expect(page.getByTestId('confirm-cancel')).toHaveText('保留景點');
  await expect(page.getByTestId('confirm-accept')).toHaveText('刪除景點');

  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(placeCardByName(page, 'Day 1', placeName)).toBeVisible();
  expect(nativeDialogSeen).toBe(false);

  await openDeleteConfirmationForPlace(page, 'Day 1', placeName);
  await page.getByTestId('confirm-accept').click();

  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(placeCardByName(page, 'Day 1', placeName)).toBeHidden({
    timeout: 20_000,
  });
  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '景點已刪除' });
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('行程與協作者畫面已更新。');

  await expect
    .poll(
      async () => {
        const dayItems = await readEmulatorData<PlaceItem[]>(
          `rooms/${ROOM_ID}/itinerary/Day 1`,
        );

        return Array.isArray(dayItems)
          ? dayItems.some((item) => item.id === 'shared-confirm-delete-place')
          : false;
      },
      {
        timeout: 15_000,
        message: 'deleted place should be removed from Database Emulator',
      },
    )
    .toBe(false);

  page.off('dialog', nativeDialogHandler);
});

test('mobile day switching does not accidentally trigger place editing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await seedTestTrip(ROOM_ID, {
    title: 'E2E mobile day switch trip',
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    itinerary: {
      'Day 1': [
        {
          id: 'mobile-day1-place',
          name: 'E2E Day1 museum',
          place_id: 'mobile-day1-place-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Day1 address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
      ],
      'Day 2': [
        {
          id: 'mobile-day2-place',
          name: 'E2E Day2 coffee',
          place_id: 'mobile-day2-place-id',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: 'E2E Day2 address',
          time: '10:00',
          stayTime: '45',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 5,
          },
        },
      ],
      'Day 3': [
        {
          id: 'mobile-day3-place',
          name: 'E2E Day3 bakery',
          place_id: 'mobile-day3-place-id',
          customName: '',
          lat: 25.035,
          lng: 121.5674,
          address: 'E2E Day3 address',
          time: '11:00',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 6,
          },
        },
      ],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const day1Switch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 1"]',
  );
  const day2Switch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]',
  );
  const day3Switch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 3"]',
  );

  await expect(day1Switch).toBeVisible();
  await expect(day2Switch).toBeVisible();
  await expect(day3Switch).toBeVisible();
  await expect(day1Switch).toHaveAttribute('aria-pressed', 'true');

  const day1Place = placeCardByName(page, 'Day 1', 'E2E Day1 museum');
  const day1ActionTrigger = day1Place.getByTestId('place-action-menu-trigger');

  await expect(day1Place).toBeVisible();
  await expect(day1ActionTrigger).toBeVisible();
  await expect(day1ActionTrigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(day1ActionTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(day1Place.getByTestId('desktop-place-actions')).toBeHidden();
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await day2Switch.click();

  await expect(day2Switch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await day3Switch.click();

  await expect(day3Switch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  const day3Place = placeCardByName(page, 'Day 3', 'E2E Day3 bakery');
  const day3ActionTrigger = day3Place.getByTestId('place-action-menu-trigger');

  await expect(day3Place).toBeVisible();
  await expect(day3Place.getByTestId('desktop-place-actions')).toBeHidden();
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await day3ActionTrigger.click();
  await expect(page.getByTestId('place-action-edit')).toBeVisible();
  await expect(page.getByTestId('place-action-delete')).toBeVisible();
  await page.getByTestId('place-action-edit').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
});

test('mobile place action menu stays visible and closes on outside interaction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedTestTrip(ROOM_ID, {
    title: 'E2E mobile action menu trip',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [
        {
          id: 'mobile-menu-place-a',
          name: 'E2E Action first',
          place_id: 'mobile-menu-place-a-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Action first address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
        {
          id: 'mobile-menu-place-b',
          name: 'E2E Action second',
          place_id: 'mobile-menu-place-b-id',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: 'E2E Action second address',
          time: '10:10',
          stayTime: '45',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 5,
          },
        },
      ],
      'Day 2': [
        {
          id: 'mobile-menu-place-c',
          name: 'E2E Action third',
          place_id: 'mobile-menu-place-c-id',
          customName: '',
          lat: 25.035,
          lng: 121.5674,
          address: 'E2E Action third address',
          time: '11:00',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 6,
          },
        },
      ],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const firstPlace = placeCardByName(page, 'Day 1', 'E2E Action first');
  const secondPlace = placeCardByName(page, 'Day 1', 'E2E Action second');
  const firstTrigger = firstPlace.getByTestId('place-action-menu-trigger');
  const secondTrigger = secondPlace.getByTestId('place-action-menu-trigger');

  await expect(firstPlace).toBeVisible();
  await expect(secondPlace).toBeVisible();
  await firstTrigger.click();

  await expect(page.getByTestId('place-action-menu')).toHaveCount(1);
  await expect(page.getByTestId('place-action-menu')).toHaveAttribute(
    'data-place-id',
    'mobile-menu-place-a',
  );
  await expectMenuWithinViewport(page);

  await secondTrigger.click();

  await expect(page.getByTestId('place-action-menu')).toHaveCount(1);
  await expect(page.getByTestId('place-action-menu')).toHaveAttribute(
    'data-place-id',
    'mobile-menu-place-b',
  );
  await expectMenuWithinViewport(page);

  await page.getByTestId('mobile-day-switcher').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await firstTrigger.click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await expect(firstTrigger).toBeFocused();

  await firstTrigger.click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await page
    .locator('[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]')
    .click();
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await page
    .locator('[data-testid="itinerary-day-switch-button"][data-day-id="Day 1"]')
    .click();
  await firstTrigger.click();
  await page.getByTestId('place-action-nearby').click();

  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await expect(page.getByTestId('map-panel')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const reloadedFirstPlace = placeCardByName(page, 'Day 1', 'E2E Action first');
  await reloadedFirstPlace.getByTestId('place-action-menu-trigger').click();
  await page.getByTestId('place-action-edit').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();

  await page.reload();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const desktopPlace = placeCardByName(page, 'Day 1', 'E2E Action first');
  await expect(desktopPlace.getByTestId('place-action-menu-trigger')).toBeHidden();
  await desktopPlace.hover();
  await expect(desktopPlace.getByTestId('desktop-place-actions')).toBeVisible();
});
