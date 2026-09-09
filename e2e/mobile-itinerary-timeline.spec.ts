import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
  writeEmulatorData,
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

async function expectMinimumFontSize(locator: Locator, minimum: number) {
  const fontSize = await locator.evaluate((element) => (
    Number.parseFloat(window.getComputedStyle(element).fontSize)
  ));
  expect(fontSize).toBeGreaterThanOrEqual(minimum);
}

async function expectMinimumContrast(locator: Locator, minimum: number) {
  const contrast = await locator.evaluate((element) => {
    const trip = document.querySelector('[data-testid="active-trip-view"]');
    if (!(trip instanceof HTMLElement)) return 0;

    const toRgb = (color: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) return [0, 0, 0];
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data.slice(0, 3));
    };
    const luminance = (rgb: number[]) => rgb
      .map((channel) => channel / 255)
      .map((channel) => (
        channel <= 0.04045
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4
      ))
      .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);

    const foreground = luminance(toRgb(window.getComputedStyle(element).color));
    const background = luminance(toRgb(window.getComputedStyle(trip).backgroundColor));
    return (Math.max(foreground, background) + 0.05)
      / (Math.min(foreground, background) + 0.05);
  });

  expect(contrast).toBeGreaterThanOrEqual(minimum);
}

async function focusWithTab(page: Page, locator: Locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  for (let index = 0; index < 40; index += 1) {
    await page.keyboard.press('Tab');
    if (await locator.evaluate((element) => document.activeElement === element)) return;
  }

  throw new Error('Keyboard focus did not reach the requested control.');
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

test.beforeEach(async ({ page }) => {
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        daily: {
          time: ['2026-09-20', '2026-09-21'],
          temperature_2m_min: [24, 23],
          temperature_2m_max: [28, 27],
          precipitation_probability_max: [35, 20],
        },
      }),
    });
  });
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
    title: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
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

for (const { width, height } of [
  { width: 320, height: 568 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
]) {
  test(`${width}px timeline is dense, connected, and free of horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/?room=${ROOM_ID}`);
    await expect(page.getByTestId('active-trip-view')).toBeVisible();

    await expect(page.getByTestId('mobile-trip-header')).toBeVisible();
    await expect(page.getByTestId('mobile-day-switcher')).toBeVisible();
    await expect(page.getByTestId('mobile-trip-tools-trigger')).toHaveCount(0);
    await expect(page.getByTestId('app-settings-trigger')).toHaveCount(1);
    await expect(page.getByTestId('mobile-trip-weather-temperature')).toHaveText('24~28°C');
    await expect(page.getByTestId('mobile-trip-weather-rain')).toHaveText('降雨 35%');
    const currentDate = page.locator(
      '[data-testid="itinerary-day-switch-button"][aria-current="date"]',
    );
    await expect(currentDate).toContainText('9/20');
    await expect(page.getByTestId('place-search-input')).toBeVisible();
    await expect(page.getByTestId('place-search-input')).toHaveAttribute('placeholder', /搜尋|新增/);

    const [titleBox, weatherBox, settingsBox, summaryBox] = await Promise.all([
      page.getByTestId('trip-detail-title').boundingBox(),
      page.getByTestId('mobile-trip-weather').boundingBox(),
      page.getByTestId('app-settings-trigger').boundingBox(),
      page.getByTestId('mobile-trip-summary').boundingBox(),
    ]);
    expect(titleBox).not.toBeNull();
    expect(weatherBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();
    expect(summaryBox).not.toBeNull();
    expect((titleBox?.x || 0) + (titleBox?.width || 0)).toBeLessThanOrEqual(
      (weatherBox?.x || 0) + 1,
    );
    expect((settingsBox?.y || 0) + (settingsBox?.height || 0)).toBeLessThanOrEqual(
      (summaryBox?.y || 0) + 1,
    );

    await page.getByTestId('app-settings-trigger').click();
    await expect(page.getByRole('dialog', { name: '旅程工具與設定' })).toBeVisible();
    await expect(page.getByTestId('app-settings-trip-section')).toContainText('旅程工具');
    await expect(page.getByTestId('app-settings-trip-share')).toBeVisible();
    await expect(page.getByTestId('app-settings-trip-checklist')).toBeVisible();
    await expect(page.getByTestId('app-settings-trip-export')).toBeVisible();
    await expect(page.getByTestId('app-settings-app-section')).toContainText('App 設定');
    await expect(page.getByTestId('app-settings-appearance')).toBeVisible();
    await page.getByTestId('app-settings-close').click();
    await expect(page.getByTestId('app-settings-trigger')).toBeFocused();

    await expect(page.getByTestId('itinerary-day-card')).toHaveAttribute(
      'data-mobile-composition',
      'timeline',
    );
    await expect(page.getByTestId('place-card')).toHaveCount(12);
    await expect(page.getByTestId('transit-timeline-row')).toHaveCount(11);
    await expect(page.getByText('預計停留 1 小時 30 分鐘')).toBeVisible();

    const firstCard = placeCard(page, LONG_CHINESE);
    await expect(firstCard).toBeInViewport();
    await expect(firstCard.getByTestId('place-details-trigger')).toBeVisible();
    await expectMinimumFontSize(page.getByTestId('mobile-day-theme-label'), 12);
    await expectMinimumFontSize(page.getByTestId('mobile-day-theme-name'), 14);
    await expectMinimumFontSize(firstCard.getByTestId('place-card-time'), 14);
    await expectMinimumFontSize(firstCard.getByTestId('place-card-title'), 14);
    await expectMinimumFontSize(firstCard.getByTestId('place-card-stay'), 14);
    const firstTransitAction = page.getByTestId('transit-timeline-row').first().getByRole('button');
    await expectMinimumFontSize(firstTransitAction, 14);
    const transitBox = await firstTransitAction.boundingBox();
    expect(transitBox).not.toBeNull();
    expect(transitBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(transitBox?.height || 0).toBeGreaterThanOrEqual(44);

    const bottomNavigation = page.getByTestId('mobile-bottom-navigation');
    const bottomNavigationButtons = bottomNavigation.locator(':scope > button');
    await expect(bottomNavigationButtons).toHaveCount(4);
    const bottomNavigationLabels = ['行程', '地圖', '票券', '記帳'];
    for (const [index, button] of (await bottomNavigationButtons.all()).entries()) {
      await expect(button).toHaveAccessibleName(new RegExp(`^${bottomNavigationLabels[index]}$`));
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box?.width || 0).toBeGreaterThanOrEqual(44);
      expect(box?.height || 0).toBeGreaterThanOrEqual(44);
      await expectMinimumFontSize(button.locator(':scope > span'), 12);
    }

    const [firstTimeBox, firstTitleBox, bottomNavigationBox] = await Promise.all([
      firstCard.getByTestId('place-card-time').boundingBox(),
      firstCard.getByTestId('place-card-title').boundingBox(),
      bottomNavigation.boundingBox(),
    ]);
    expect(bottomNavigationBox).not.toBeNull();
    for (const box of [firstTimeBox, firstTitleBox]) {
      expect(box).not.toBeNull();
      expect(box?.y || 0).toBeGreaterThanOrEqual(0);
      expect((box?.y || 0) + (box?.height || 0))
        .toBeLessThanOrEqual((bottomNavigationBox?.y || height) + 1);
    }

    const viewportOverflow = await page.evaluate(() => (
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
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

test('mobile date overflow stays inside the date switcher', async ({ page }) => {
  await writeEmulatorData(`rooms/${ROOM_ID}/meta/endDate`, '2026-09-28');
  await Promise.all(Array.from({ length: 7 }, (_, index) => {
    const dayNumber = index + 3;
    return writeEmulatorData(`rooms/${ROOM_ID}/itinerary/Day ${dayNumber}`, [{
      id: `overflow-day-${dayNumber}`,
      name: `第 ${dayNumber} 天景點`,
      time: '10:00',
      stayTime: 30,
      tags: [],
    }]);
  }));

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('itinerary-day-switch-button')).toHaveCount(9);

  const dateScroller = page.getByTestId('mobile-day-switcher').locator(':scope > div');
  const initialMetrics = await dateScroller.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollLeft: element.scrollLeft,
    scrollWidth: element.scrollWidth,
  }));
  expect(initialMetrics.scrollWidth).toBeGreaterThan(initialMetrics.clientWidth);
  expect(initialMetrics.scrollLeft).toBe(0);

  await dateScroller.evaluate((element) => element.scrollTo({
    left: element.scrollWidth,
    behavior: 'instant',
  }));
  await expect.poll(() => dateScroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
  expect(await page.evaluate(() => (
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
  ))).toBeLessThanOrEqual(1);
});

test('place details supports Tab, Enter, and Space without tool or drag misfires', async ({ page }) => {
  await page.addInitScript(() => {
    const externalOpen = { lastUrl: '' };
    (window as unknown as { __t1ExternalOpen: typeof externalOpen }).__t1ExternalOpen = externalOpen;
    Object.defineProperty(window, 'open', {
      configurable: true,
      value: (url: unknown) => {
        externalOpen.lastUrl = String(url || '');
        return null;
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();

  const card = placeCard(page, LONG_CHINESE);
  const details = card.getByTestId('place-details-trigger');
  await expect(details).toHaveAttribute('aria-label', `查看 ${LONG_CHINESE} 詳細資訊`);
  await expect(details).toHaveAttribute('aria-haspopup', 'dialog');
  expect(await details.evaluate((element) => element.tagName)).toBe('BUTTON');
  await expect(card.locator(
    'button button, button a[href], a[href] button, [role="button"] button, button [role="button"]',
  )).toHaveCount(0);

  await focusWithTab(page, details);
  const focusOutline = await details.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      color: style.outlineColor,
      style: style.outlineStyle,
      width: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusOutline.style).toBe('solid');
  expect(focusOutline.width).toBeGreaterThanOrEqual(3);
  expect(focusOutline.color).toBe('rgb(37, 99, 235)');

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await page.getByTestId('place-detail-sheet').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  await details.focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await page.getByTestId('place-detail-sheet').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  await card.getByRole('button', { name: /導航到/ }).click();
  expect(await page.evaluate(() => (
    (window as unknown as { __t1ExternalOpen: { lastUrl: string } }).__t1ExternalOpen.lastUrl
  ))).toContain('google.com/maps');
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  await card.getByTestId('place-action-menu-trigger').click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await card.getByTestId('place-drag-handle').click();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
});

test('390px itinerary reflows at 200% text size and keeps actions operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });

  const firstCard = placeCard(page, LONG_CHINESE);
  await firstCard.scrollIntoViewIfNeeded();
  const title = firstCard.getByTestId('place-card-title');
  const actions = firstCard.getByTestId('place-card-actions');
  const [titleBox, actionsBox] = await Promise.all([title.boundingBox(), actions.boundingBox()]);
  expect(titleBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(titleBox?.width || 0).toBeGreaterThan(0);
  expect((titleBox?.x || 0) + (titleBox?.width || 0)).toBeLessThanOrEqual((actionsBox?.x || 0) + 1);

  const details = firstCard.getByTestId('place-details-trigger');
  const navigation = firstCard.getByRole('button', { name: /導航到/ });
  const menu = firstCard.getByTestId('place-action-menu-trigger');
  for (const action of [details, navigation, menu]) {
    const actionBox = await action.boundingBox();
    expect(actionBox).not.toBeNull();
    expect(actionBox?.width || 0).toBeGreaterThanOrEqual(44);
    expect(actionBox?.height || 0).toBeGreaterThanOrEqual(44);
    expect(await action.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      return hit === element || (hit instanceof Node && element.contains(hit));
    })).toBe(true);
  }
  await menu.click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await details.click();
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await page.getByTestId('place-detail-sheet').getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  for (const { content, container } of [
    {
      content: firstCard.getByTestId('place-card-stay'),
      container: firstCard.getByTestId('timeline-place-card-surface'),
    },
    {
      content: page.getByTestId('transit-timeline-row').first().getByRole('button'),
      container: page.getByTestId('transit-timeline-row').first(),
    },
  ]) {
    const overflow = await content.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    expect(overflow.horizontal).toBeLessThanOrEqual(1);
    expect(overflow.vertical).toBeLessThanOrEqual(1);
    const [contentBox, containerBox] = await Promise.all([
      content.boundingBox(),
      container.boundingBox(),
    ]);
    expect(contentBox).not.toBeNull();
    expect(containerBox).not.toBeNull();
    expect(contentBox?.x || 0).toBeGreaterThanOrEqual((containerBox?.x || 0) - 1);
    expect(contentBox?.y || 0).toBeGreaterThanOrEqual((containerBox?.y || 0) - 1);
    expect((contentBox?.x || 0) + (contentBox?.width || 0))
      .toBeLessThanOrEqual((containerBox?.x || 0) + (containerBox?.width || 0) + 1);
    expect((contentBox?.y || 0) + (contentBox?.height || 0))
      .toBeLessThanOrEqual((containerBox?.y || 0) + (containerBox?.height || 0) + 1);
  }

  const englishCard = placeCard(page, LONG_ENGLISH);
  await englishCard.scrollIntoViewIfNeeded();
  const [englishTitleBox, englishActionsBox] = await Promise.all([
    englishCard.getByTestId('place-card-title').boundingBox(),
    englishCard.getByTestId('place-card-actions').boundingBox(),
  ]);
  expect(englishTitleBox).not.toBeNull();
  expect(englishActionsBox).not.toBeNull();
  expect(englishTitleBox?.width || 0).toBeGreaterThan(0);
  expect((englishTitleBox?.x || 0) + (englishTitleBox?.width || 0))
    .toBeLessThanOrEqual((englishActionsBox?.x || 0) + 1);

  expect(await page.evaluate(() => (
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
  ))).toBeLessThanOrEqual(1);

  const scroller = page.getByTestId('itinerary-horizontal-scroll');
  await scroller.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const bottomNavigation = page.getByTestId('mobile-bottom-navigation');
  const bottomNavigationButtons = bottomNavigation.locator(':scope > button');
  await expect(bottomNavigationButtons).toHaveCount(4);
  const bottomNavigationLabels = ['行程', '地圖', '票券', '記帳'];
  const viewportHeight = await page.evaluate(() => window.innerHeight);
  for (const [index, button] of (await bottomNavigationButtons.all()).entries()) {
    const label = button.locator(':scope > span');
    await expect(button).toHaveAccessibleName(new RegExp(`^${bottomNavigationLabels[index]}$`));
    const [buttonBox, labelBox] = await Promise.all([button.boundingBox(), label.boundingBox()]);
    expect(buttonBox).not.toBeNull();
    expect(labelBox).not.toBeNull();
    expect(labelBox?.x || 0).toBeGreaterThanOrEqual((buttonBox?.x || 0) - 1);
    expect(labelBox?.y || 0).toBeGreaterThanOrEqual((buttonBox?.y || 0) - 1);
    expect((labelBox?.x || 0) + (labelBox?.width || 0))
      .toBeLessThanOrEqual((buttonBox?.x || 0) + (buttonBox?.width || 0) + 1);
    expect((labelBox?.y || 0) + (labelBox?.height || 0))
      .toBeLessThanOrEqual(Math.min(
        (buttonBox?.y || 0) + (buttonBox?.height || 0) + 1,
        viewportHeight + 1,
      ));
    const labelOverflow = await label.evaluate((element) => ({
      horizontal: element.scrollWidth - element.clientWidth,
      vertical: element.scrollHeight - element.clientHeight,
    }));
    expect(labelOverflow.horizontal).toBeLessThanOrEqual(1);
    expect(labelOverflow.vertical).toBeLessThanOrEqual(1);
  }
  await page.getByTestId('ticket-tab-button').filter({ visible: true }).click();
  await expect(page.getByTestId('ticket-panel')).toBeVisible();
  await page.getByTestId('mobile-nav-plan').click();
  await expect(page.getByTestId('place-details-trigger').first()).toBeVisible();
});

test('itinerary details focus and readable text remain visible in light and dark themes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const theme of [
    {
      color: '#f8fafc',
      background: 'rgb(248, 250, 252)',
      mainText: 'text-slate-900',
      subText: 'text-slate-600',
    },
    {
      color: '#0f172a',
      background: 'rgb(15, 23, 42)',
      mainText: 'text-slate-100',
      subText: 'text-slate-300',
    },
  ]) {
    await writeEmulatorData(`rooms/${ROOM_ID}/meta/themeColor`, theme.color);
    await page.goto(`/?room=${ROOM_ID}`);
    const activeTrip = page.getByTestId('active-trip-view');
    await expect(activeTrip).toBeVisible();
    await expect(activeTrip).toHaveCSS('background-color', theme.background);

    const card = placeCard(page, LONG_CHINESE);
    const title = card.getByTestId('place-card-title');
    const stay = card.getByTestId('place-card-stay');
    const transit = page.getByTestId('transit-timeline-row').first().getByRole('button');
    const mainTextClass = new RegExp(`(?:^|\\s)${theme.mainText}(?:\\s|$)`);
    const subTextClass = new RegExp(`(?:^|\\s)${theme.subText}(?:\\s|$)`);
    await expect(title).toHaveClass(mainTextClass);
    await expect(stay).toHaveClass(subTextClass);
    await expect(transit).toHaveClass(subTextClass);
    for (const readableText of [title, stay, transit]) {
      await expectMinimumContrast(readableText, 4.5);
    }

    const details = card.getByTestId('place-details-trigger');
    await focusWithTab(page, details);
    const outline = await details.evaluate((element) => window.getComputedStyle(element).outline);
    expect(outline).toContain('rgb(37, 99, 235)');
  }
});

for (const { width, height } of [
  { width: 768, height: 800 },
  { width: 1024, height: 768 },
]) {
  test(`${width}px keeps the desktop itinerary and map composition intact`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/?room=${ROOM_ID}`);
    await expect(page.getByTestId('active-trip-view')).toBeVisible();
    await expect(page.getByTestId('mobile-trip-header')).toHaveCount(0);
    await expect(page.getByTestId('mobile-bottom-navigation')).toBeHidden();
    await expect(page.getByTestId('desktop-day-navigator')).toBeVisible();
    await expect(page.getByTestId('map-panel')).toBeVisible();
    await expect(page.getByTestId('place-card-title').filter({ hasText: LONG_CHINESE }).first())
      .toBeVisible();
    expect(await page.evaluate(() => (
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
    ))).toBeLessThanOrEqual(1);
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
