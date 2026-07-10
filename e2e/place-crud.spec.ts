import { expect, test } from '@playwright/test';

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

  const day1Place = page
    .locator('[data-testid="itinerary-day-card"][data-day-id="Day 1"]')
    .getByTestId('place-card')
    .filter({ hasText: 'E2E Day1 museum' })
    .first();

  await expect(day1Place).toBeVisible();
  await expect(day1Place.getByTestId('place-card-actions-menu')).toBeVisible();
  await expect(day1Place.getByTestId('place-card-actions-toggle')).toBeVisible();
  await expect(day1Place.getByTestId('desktop-place-actions')).toBeHidden();
  await expect(
    day1Place
      .getByTestId('place-card-actions-menu')
      .getByTestId('edit-place-button'),
  ).toBeHidden();
  await expect(
    day1Place
      .getByTestId('place-card-actions-menu')
      .getByTestId('delete-place-button'),
  ).toBeHidden();

  await day2Switch.click();

  await expect(day2Switch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await day3Switch.click();

  await expect(day3Switch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  const day3Place = page
    .locator('[data-testid="itinerary-day-card"][data-day-id="Day 3"]')
    .getByTestId('place-card')
    .filter({ hasText: 'E2E Day3 bakery' })
    .first();
  const day3Actions = day3Place.getByTestId('place-card-actions-menu');

  await expect(day3Place).toBeVisible();
  await expect(day3Place.getByTestId('desktop-place-actions')).toBeHidden();
  await expect(day3Actions.getByTestId('edit-place-button')).toBeHidden();
  await expect(day3Actions.getByTestId('delete-place-button')).toBeHidden();
  await day3Actions.getByTestId('place-card-actions-toggle').click();
  await expect(day3Actions.getByTestId('edit-place-button')).toBeVisible();
  await expect(day3Actions.getByTestId('delete-place-button')).toBeVisible();
  await day3Actions.getByTestId('edit-place-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
});
