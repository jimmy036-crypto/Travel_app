import { skipCompanionIntroduction } from './support/companion';
import { expect, test } from '@playwright/test';

import { clearEmulatorDatabase, seedTestTrip } from './support/emulator';

const ROOM_ID = 'e2edesktopdensity0001';

test.beforeEach(async ({ page }) => {
  // Density must not depend on the live forecast date range or response timing.
  await page.route('https://api.open-meteo.com/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ daily: {
      time: Array.from({ length: 6 }, (_, index) => `2026-09-${20 + index}`),
      temperature_2m_min: Array(6).fill(24),
      temperature_2m_max: Array(6).fill(28),
      precipitation_probability_max: Array(6).fill(35),
    } }),
  }));
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E Desktop Density',
    startDate: '2026-09-20',
    endDate: '2026-09-25',
    itinerary: {
      'Day 1': Array.from({ length: 6 }, (_, index) => ({
        id: `density-${index + 1}`,
        name: `密度景點 ${index + 1}`,
        customName: '',
        time: `${String(9 + index).padStart(2, '0')}:00`,
        stayTime: 20,
        tags: [],
      })),
      'Day 2': [],
      'Day 3': [],
      'Day 4': [],
      'Day 5': [],
      'Day 6': [],
    },
  });
});

test('desktop navigator reaches Day 6 and returns to Day 1 without losing earlier days', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/?room=${ROOM_ID}`);
  await skipCompanionIntroduction(page);
  const navigator = page.getByTestId('desktop-day-navigator');
  await expect(navigator).toBeVisible();
  const dayButtons = navigator.getByTestId('desktop-day-button');
  await expect(dayButtons).toHaveCount(6);

  await dayButtons.nth(5).click();
  await expect(dayButtons.nth(5)).toHaveAttribute('aria-current', 'date');
  await expect(page.locator('[data-testid="itinerary-day-card"][data-day-id="Day 6"]')).toBeInViewport();
  await expect(navigator.getByTestId('desktop-day-next')).toBeDisabled();

  while (await navigator.getByTestId('desktop-day-previous').isEnabled()) {
    await navigator.getByTestId('desktop-day-previous').click();
  }
  await expect(dayButtons.first()).toHaveAttribute('aria-current', 'date');
  await expect(page.locator('[data-testid="itinerary-day-card"][data-day-id="Day 1"]')).toBeInViewport();
  await expect(navigator.getByTestId('desktop-day-previous')).toBeDisabled();
});

test('1440x900 shows at least 4 basic desktop cards per day column without oversized padding', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await skipCompanionIntroduction(page);
  await expect(page.getByTestId('itinerary-day-card').first()).toContainText('24~28°C');

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
  expect(fullyVisibleCount).toBeGreaterThanOrEqual(4);

  // 景點資訊 is always the one CTA on the card now, regardless of whether
  // this place has resources/memo/photo - no separate nav/reference/note
  // buttons and no large empty placeholder.
  const firstCard = cards.first();
  await expect(firstCard.getByTestId('place-info-trigger')).toBeVisible();
  await expect(firstCard.getByRole('button', { name: /導航到/ })).toHaveCount(0);

  const firstCardBox = await cards.first().boundingBox();
  expect(firstCardBox).not.toBeNull();
  expect(firstCardBox?.height || 0).toBeLessThanOrEqual(112);
  await testInfo.attach('desktop-density-with-weather', {
    body: await page.screenshot(), contentType: 'image/png',
  });
});

test('a delayed forecast preserves four visible cards and reflows at 200% text', async ({ page }) => {
  let releaseForecast = () => {};
  const forecastReady = new Promise<void>((resolve) => { releaseForecast = resolve; });
  await page.route('https://api.open-meteo.com/**', async (route) => {
    await forecastReady;
    await route.fallback();
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/?room=${ROOM_ID}`);
    await skipCompanionIntroduction(page);
    const day = page.getByTestId('itinerary-day-card').first();
    const weather = day.getByTestId('desktop-day-weather');
    await expect(day.getByTestId('place-card')).toHaveCount(6);
    await expect(weather).toHaveCount(0);
    const countFullyVisible = () => day.evaluate((element) => {
      const bounds = element.querySelector('[data-testid="itinerary-day-dropzone"]')!
        .getBoundingClientRect();
      return [...element.querySelectorAll('[data-testid="place-card"]')].filter((card) => {
        const box = card.getBoundingClientRect();
        return box.top >= bounds.top && box.bottom <= bounds.bottom + 1;
      }).length;
    });
    expect(await countFullyVisible()).toBeGreaterThanOrEqual(4);
    releaseForecast();
    await expect(weather).toContainText('24~28°C');
    expect(await countFullyVisible()).toBeGreaterThanOrEqual(4);

    // HTML font-size equivalent, not browser zoom or device Dynamic Type.
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expect(weather).toBeVisible();
    const weatherBox = await weather.boundingBox();
    const dayBox = await day.boundingBox();
    expect(weatherBox).not.toBeNull();
    expect(dayBox).not.toBeNull();
    expect(weatherBox!.x).toBeGreaterThanOrEqual(dayBox!.x);
    expect(weatherBox!.x + weatherBox!.width).toBeLessThanOrEqual(dayBox!.x + dayBox!.width);
    const add = day.getByTestId('add-emulator-place-button');
    const addBox = await add.boundingBox();
    expect(addBox).not.toBeNull();
    expect(weatherBox!.y + weatherBox!.height).toBeLessThanOrEqual(addBox!.y);
    await day.getByTestId('place-info-trigger').first().click();
    await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  } finally {
    releaseForecast();
  }
});
