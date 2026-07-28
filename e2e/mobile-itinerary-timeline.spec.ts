import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2emobiletimeline0001';
const LONG_CHINESE = '沖繩美麗海水族館 海洋博公園 熱帶夢幻中心紀念品商店';
const LONG_ENGLISH = 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop';

type ItineraryItem = {
  id?: string;
  name?: string;
  time?: string;
};

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value && typeof value === 'object' ? Object.values(value).filter(Boolean) : [];
}

function placeCard(page: Page, name: string) {
  return page.getByTestId('place-card').filter({ hasText: name }).first();
}

async function visibleOrder(page: Page): Promise<string[]> {
  return (await page.getByTestId('place-card-title').allTextContents())
    .map((text) => text.trim());
}

async function dragByKeyboard(
  page: Page,
  name: string,
  direction: 'ArrowUp' | 'ArrowDown',
  moves: number,
) {
  const handle = placeCard(page, name).getByTestId('place-drag-handle');
  await handle.scrollIntoViewIfNeeded();
  await handle.focus();
  await page.keyboard.press('Space');

  const clone = page.getByTestId('itinerary-drag-clone');
  await expect(clone).toContainText(name);
  await expect(clone).toHaveAttribute('data-composition', 'timeline');
  const cloneBox = await clone.boundingBox();
  expect(cloneBox).not.toBeNull();
  expect(cloneBox?.width || 0).toBeLessThanOrEqual(241);
  expect(cloneBox?.height || 0).toBeLessThanOrEqual(72);
  await expect(clone.locator('img, button')).toHaveCount(0);

  for (let index = 0; index < moves; index += 1) {
    await page.keyboard.press(direction);
  }
  await page.keyboard.press('Space');
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  const dayOne = Array.from({ length: 12 }, (_, index) => ({
    id: `timeline-${index + 1}`,
    name: index === 0 ? LONG_CHINESE : (index === 1 ? LONG_ENGLISH : `行程第 ${index + 1} 站`),
    customName: '',
    time: `${String(9 + Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`,
    stayTime: index === 0 ? 90 : 20,
    tags: [],
    nextLeg: {
      mode: index % 2 === 0 ? 'WALK' : 'TRANSIT',
      mins: index % 2 === 0 ? 8 : 15,
    },
  }));

  await seedTestTrip(ROOM_ID, {
    title: 'E2E Mobile Timeline',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': dayOne,
      'Day 2': [{
        id: 'day-two-only',
        name: '第二天唯一景點',
        customName: '',
        time: '10:30',
        stayTime: 30,
        tags: [],
      }],
    },
  });
});

for (const width of [320, 390]) {
  test(`${width}px timeline is dense, connected, and free of horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
    await page.goto(`/?room=${ROOM_ID}`);
    await expect(page.getByTestId('active-trip-view')).toBeVisible();

    await expect(page.getByTestId('mobile-trip-header')).toBeVisible();
    await expect(page.getByTestId('mobile-day-switcher')).toBeVisible();
    await expect(page.getByTestId('itinerary-day-card')).toHaveAttribute(
      'data-mobile-composition',
      'timeline',
    );
    await expect(page.getByTestId('place-card')).toHaveCount(12);
    await expect(page.getByTestId('transit-timeline-row')).toHaveCount(11);
    await expect(page.getByText('預計停留 1 小時 30 分鐘')).toBeVisible();

    const viewportOverflow = await page.evaluate(() => (
      document.documentElement.scrollWidth - window.innerWidth
    ));
    expect(viewportOverflow).toBeLessThanOrEqual(1);

    for (const name of [LONG_CHINESE, LONG_ENGLISH]) {
      const title = placeCard(page, name).getByTestId('place-card-title');
      const box = await title.boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x || 0) + (box?.width || 0)).toBeLessThanOrEqual(width + 1);
      await expect(title).toHaveCSS('-webkit-line-clamp', '2');
    }

    const scroller = page.getByTestId('itinerary-horizontal-scroll');
    await scroller.evaluate((element) => {
      element.scrollTo({ top: 700, behavior: 'instant' });
    });
    await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await expect(page.getByTestId('itinerary-drag-clone')).toHaveCount(0);

    await page.locator(
      '[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]',
    ).click();
    await expect(page.getByTestId('place-card')).toHaveCount(1);
    await expect(page.getByTestId('place-card-title')).toHaveText('第二天唯一景點');
  });
}

test('timeline supports first/last drag, cancellation-safe scrolling, and persistence', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();

  const initialOrder = await visibleOrder(page);
  await dragByKeyboard(page, LONG_CHINESE, 'ArrowDown', 11);
  await expect.poll(() => visibleOrder(page)).toEqual([
    ...initialOrder.slice(1),
    LONG_CHINESE,
  ]);

  await expect.poll(async () => {
    const stored = toList(await readEmulatorData<ItineraryItem[] | Record<string, ItineraryItem>>(
      `rooms/${ROOM_ID}/itinerary/Day 1`,
    ));
    return stored.at(-1)?.name;
  }).toBe(LONG_CHINESE);

  await dragByKeyboard(page, LONG_CHINESE, 'ArrowUp', 11);
  await expect.poll(() => visibleOrder(page)).toEqual(initialOrder);

  await expect.poll(async () => {
    const stored = toList(await readEmulatorData<ItineraryItem[] | Record<string, ItineraryItem>>(
      `rooms/${ROOM_ID}/itinerary/Day 1`,
    ));
    return stored.map((item) => item.name);
  }).toEqual(initialOrder);

  await page.reload();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect.poll(() => visibleOrder(page)).toEqual(initialOrder);
});
