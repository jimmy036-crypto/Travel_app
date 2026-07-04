import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const SAME_DAY_ROOM_ID = 'e2eitinerarydragroom0001';
const CROSS_DAY_ROOM_ID = 'e2eitinerarycrossday0001';

type ItineraryItem = {
  id?: string;
  name?: string;
  customName?: string;
  time?: string;
  stayTime?: string | number;
  nextLeg?: {
    mode?: string;
    mins?: number;
  };
};

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function dayCard(page: Page, dayId: string) {
  return page.locator(
    `[data-testid="itinerary-day-card"][data-day-id="${dayId}"]`,
  );
}

function placeCard(page: Page, dayId: string, name: string) {
  return dayCard(page, dayId)
    .getByTestId('place-card')
    .filter({ hasText: name })
    .first();
}

async function readDayItems(
  roomId: string,
  dayId: string,
): Promise<ItineraryItem[]> {
  const value = await readEmulatorData<
    ItineraryItem[] | Record<string, ItineraryItem>
  >(`rooms/${roomId}/itinerary/${dayId}`);

  return toList(value);
}

async function readDaySummary(
  roomId: string,
  dayId: string,
): Promise<Array<{ id: string; time: string }>> {
  const items = await readDayItems(roomId, dayId);

  return items.map((item) => ({
    id: String(item.id || ''),
    time: String(item.time || ''),
  }));
}

async function visibleOrder(page: Page, dayId: string): Promise<string[]> {
  const texts = await dayCard(page, dayId)
    .getByTestId('place-card-title')
    .allTextContents();

  return texts.map((text) => text.trim());
}

async function dragOnePositionUpByKeyboard(
  page: Page,
  dayId: string,
  placeName: string,
): Promise<void> {
  const handle = placeCard(page, dayId, placeName)
    .getByTestId('place-drag-handle');

  await handle.scrollIntoViewIfNeeded();
  await handle.focus();

  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
});

test('真實 DnD 操作會重排同日景點、重算時間並保存', async ({
  page,
}) => {
  await seedTestTrip(SAME_DAY_ROOM_ID, {
    title: 'E2E 同日拖曳測試',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    itinerary: {
      'Day 1': [
        {
          id: 'place-a',
          name: 'E2E 第一站',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: '台北市信義區',
          time: '09:00',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
        {
          id: 'place-b',
          name: 'E2E 第二站',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: '台北市信義區',
          time: '09:40',
          stayTime: '20',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'TRAIN',
            mins: 15,
          },
        },
        {
          id: 'place-c',
          name: 'E2E 第三站',
          customName: '',
          lat: 25.035,
          lng: 121.5674,
          address: '台北市信義區',
          time: '10:15',
          stayTime: '45',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 5,
          },
        },
      ],
    },
  });

  await page.goto(`/?room=${SAME_DAY_ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(dayCard(page, 'Day 1')).toBeVisible();

  await expect
    .poll(() => visibleOrder(page, 'Day 1'), {
      timeout: 10_000,
      message: '初始行程順序應正確',
    })
    .toEqual([
      'E2E 第一站',
      'E2E 第二站',
      'E2E 第三站',
    ]);

  await dragOnePositionUpByKeyboard(
    page,
    'Day 1',
    'E2E 第三站',
  );

  await expect
    .poll(() => visibleOrder(page, 'Day 1'), {
      timeout: 10_000,
      message: '拖曳後第三站應移到第二站前面',
    })
    .toEqual([
      'E2E 第一站',
      'E2E 第三站',
      'E2E 第二站',
    ]);

  await expect(
    placeCard(page, 'Day 1', 'E2E 第一站')
      .getByTestId('place-card-time'),
  ).toHaveText('09:00');
  await expect(
    placeCard(page, 'Day 1', 'E2E 第三站')
      .getByTestId('place-card-time'),
  ).toHaveText('09:40');
  await expect(
    placeCard(page, 'Day 1', 'E2E 第二站')
      .getByTestId('place-card-time'),
  ).toHaveText('10:30');

  await expect
    .poll(
      () => readDaySummary(SAME_DAY_ROOM_ID, 'Day 1'),
      {
        timeout: 15_000,
        message: '拖曳後順序與時間應寫入 Database Emulator',
      },
    )
    .toEqual([
      { id: 'place-a', time: '09:00' },
      { id: 'place-c', time: '09:40' },
      { id: 'place-b', time: '10:30' },
    ]);

  await page.reload();

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  await expect
    .poll(() => visibleOrder(page, 'Day 1'), {
      timeout: 10_000,
      message: '重新整理後排序應維持',
    })
    .toEqual([
      'E2E 第一站',
      'E2E 第三站',
      'E2E 第二站',
    ]);

  await expect(
    placeCard(page, 'Day 1', 'E2E 第二站')
      .getByTestId('place-card-time'),
  ).toHaveText('10:30');
});

test('跨日搬移會使用同一拖曳處理流程並保存兩日資料', async ({
  page,
}) => {
  await seedTestTrip(CROSS_DAY_ROOM_ID, {
    title: 'E2E 跨日拖曳測試',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [
        {
          id: 'day1-a',
          name: 'E2E Day1 起點',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: '台北市信義區',
          time: '09:00',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
        {
          id: 'day1-b',
          name: 'E2E 待跨日景點',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: '台北市信義區',
          time: '09:40',
          stayTime: '20',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'TRAIN',
            mins: 20,
          },
        },
      ],
      'Day 2': [
        {
          id: 'day2-a',
          name: 'E2E Day2 起點',
          customName: '',
          lat: 25.043,
          lng: 121.5754,
          address: '台北市松山區',
          time: '13:00',
          stayTime: '60',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 15,
          },
        },
        {
          id: 'day2-b',
          name: 'E2E Day2 終點',
          customName: '',
          lat: 25.044,
          lng: 121.5764,
          address: '台北市松山區',
          time: '14:30',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 5,
          },
        },
      ],
    },
  });

  await page.goto(`/?room=${CROSS_DAY_ROOM_ID}`);

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
                  moveTestItineraryItem?: (
                    input: Record<string, unknown>,
                  ) => boolean;
                };
              }
            ).__TRAVEL_E2E__?.moveTestItineraryItem === 'function',
        ),
      {
        timeout: 10_000,
        message: 'TripDetail 應註冊跨日拖曳 E2E hook',
      },
    )
    .toBe(true);

  const accepted = await page.evaluate(() => {
    const e2eWindow = window as Window & {
      __TRAVEL_E2E__?: {
        moveTestItineraryItem?: (
          input: Record<string, unknown>,
        ) => boolean;
      };
    };

    return e2eWindow.__TRAVEL_E2E__?.moveTestItineraryItem?.({
      sourceDay: 'Day 1',
      destinationDay: 'Day 2',
      sourceIndex: 1,
      destinationIndex: 1,
    });
  });

  expect(accepted).toBe(true);

  await expect
    .poll(
      async () => ({
        day1: await readDaySummary(CROSS_DAY_ROOM_ID, 'Day 1'),
        day2: await readDaySummary(CROSS_DAY_ROOM_ID, 'Day 2'),
      }),
      {
        timeout: 15_000,
        message: '跨日搬移後兩日資料應同步寫入 Emulator',
      },
    )
    .toEqual({
      day1: [
        { id: 'day1-a', time: '09:00' },
      ],
      day2: [
        { id: 'day2-a', time: '13:00' },
        { id: 'day1-b', time: '14:15' },
        { id: 'day2-b', time: '14:55' },
      ],
    });

  await dayCard(page, 'Day 2').scrollIntoViewIfNeeded();

  await expect
    .poll(() => visibleOrder(page, 'Day 2'), {
      timeout: 10_000,
      message: '跨日搬移後 Day 2 畫面順序應正確',
    })
    .toEqual([
      'E2E Day2 起點',
      'E2E 待跨日景點',
      'E2E Day2 終點',
    ]);

  await expect(
    placeCard(page, 'Day 2', 'E2E 待跨日景點')
      .getByTestId('place-card-time'),
  ).toHaveText('14:15');
  await expect(
    placeCard(page, 'Day 2', 'E2E Day2 終點')
      .getByTestId('place-card-time'),
  ).toHaveText('14:55');

  await page.reload();

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await dayCard(page, 'Day 2').scrollIntoViewIfNeeded();

  await expect
    .poll(() => visibleOrder(page, 'Day 2'), {
      timeout: 10_000,
      message: '重新整理後跨日順序應維持',
    })
    .toEqual([
      'E2E Day2 起點',
      'E2E 待跨日景點',
      'E2E Day2 終點',
    ]);
});
