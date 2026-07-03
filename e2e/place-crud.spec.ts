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
