import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
  writeEmulatorData,
} from './support/emulator';

const ROOM_ID = 'e2erealtimesyncroom0001';
const INITIAL_TITLE = 'E2E realtime sync initial trip';
const FIRST_UPDATED_TITLE = 'E2E realtime sync first update';
const SECOND_UPDATED_TITLE = 'E2E realtime sync second update';
const LOCAL_STORAGE_KEY = 'e2e-realtime-sync-context-marker';
const SYNCED_PLACE_NAME = 'E2E realtime sync coffee stop';
const SYNCED_PLACE_ARRIVAL_TIME = '12:30';
const SYNCED_PLACE_STAY_MINUTES = '75';
const SYNCED_PLACE_NOTE = 'E2E realtime place creation note';

function contextOptionsForProject(projectName: string): BrowserContextOptions {
  const deviceOptions = projectName === 'Mobile Safari'
    ? devices['iPhone 13']
    : devices['Desktop Chrome'];

  return {
    ...deviceOptions,
    baseURL: 'http://127.0.0.1:4174',
    serviceWorkers: 'block',
  };
}

async function openRoom(
  browser: Browser,
  projectName: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(
    contextOptionsForProject(projectName),
  );
  const page = await context.newPage();

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-room-id',
    ROOM_ID,
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expectTripTitle(page, INITIAL_TITLE);

  return { context, page };
}

async function expectTripTitle(page: Page, title: string): Promise<void> {
  await expect(
    page.getByTestId('active-trip-view').getByRole('heading', {
      exact: true,
      name: title,
    }),
  ).toBeVisible({ timeout: 20_000 });
}

async function setLocalStorageMarker(
  page: Page,
  value: string,
): Promise<void> {
  await page.evaluate(
    ([key, marker]) => {
      localStorage.setItem(key, marker);
    },
    [LOCAL_STORAGE_KEY, value],
  );
}

async function getLocalStorageMarker(page: Page): Promise<string | null> {
  return await page.evaluate(
    (key) => localStorage.getItem(key),
    LOCAL_STORAGE_KEY,
  );
}

function syncedPlaceCard(page: Page) {
  return page
    .getByTestId('place-card')
    .filter({ hasText: SYNCED_PLACE_NAME })
    .first();
}

async function addPlaceThroughUi(page: Page): Promise<void> {
  const cards = page.getByTestId('place-card');
  const initialCount = await cards.count();

  await page.getByTestId('add-emulator-place-button').first().click();

  await expect
    .poll(async () => await cards.count(), {
      timeout: 15_000,
      message: 'new place card appears after adding through the UI',
    })
    .toBe(initialCount + 1);
}

async function editNewestPlaceThroughUi(page: Page): Promise<void> {
  await page.getByTestId('place-card').last().click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId('place-detail-edit-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
  await page.getByTestId('place-name-input').fill(SYNCED_PLACE_NAME);
  await page
    .getByTestId('place-arrival-time-input')
    .fill(SYNCED_PLACE_ARRIVAL_TIME);
  await page
    .getByTestId('place-stay-duration-input')
    .fill(SYNCED_PLACE_STAY_MINUTES);
  await page.getByTestId('place-note-input').fill(SYNCED_PLACE_NOTE);
  await page.getByTestId('save-place-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeHidden({
    timeout: 15_000,
  });
  await expect(syncedPlaceCard(page)).toBeVisible({ timeout: 15_000 });
}

async function expectSyncedPlaceDetails(page: Page): Promise<void> {
  const placeCard = syncedPlaceCard(page);

  await expect(placeCard).toBeVisible({ timeout: 20_000 });
  await expect(placeCard.getByTestId('place-card-title')).toContainText(
    SYNCED_PLACE_NAME,
  );
  await expect(placeCard.getByTestId('place-card-time')).toHaveText(
    SYNCED_PLACE_ARRIVAL_TIME,
  );

  await placeCard.click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('place-detail-title')).toHaveText(
    SYNCED_PLACE_NAME,
  );
  await expect(page.getByTestId('place-detail-note')).toHaveText(
    SYNCED_PLACE_NOTE,
  );

  await page.getByTestId('place-detail-edit-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
  await expect(page.getByTestId('place-name-input')).toHaveValue(
    SYNCED_PLACE_NAME,
  );
  await expect(page.getByTestId('place-arrival-time-input')).toHaveValue(
    SYNCED_PLACE_ARRIVAL_TIME,
  );
  await expect(page.getByTestId('place-stay-duration-input')).toHaveValue(
    SYNCED_PLACE_STAY_MINUTES,
  );
  await expect(page.getByTestId('place-note-input')).toHaveValue(
    SYNCED_PLACE_NOTE,
  );
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, { title: INITIAL_TITLE });
});

test('keeps isolated contexts synced through Firebase realtime listener', async ({
  browser,
}, testInfo) => {
  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await setLocalStorageMarker(contextA.page, 'context-a');
    await setLocalStorageMarker(contextB.page, 'context-b');

    await expect.poll(async () => await getLocalStorageMarker(contextA.page))
      .toBe('context-a');
    await expect.poll(async () => await getLocalStorageMarker(contextB.page))
      .toBe('context-b');

    await writeEmulatorData(
      `rooms/${ROOM_ID}/meta/title`,
      FIRST_UPDATED_TITLE,
    );

    await expectTripTitle(contextA.page, FIRST_UPDATED_TITLE);
    await expectTripTitle(contextB.page, FIRST_UPDATED_TITLE);

    await contextA.context.close();

    await writeEmulatorData(
      `rooms/${ROOM_ID}/meta/title`,
      SECOND_UPDATED_TITLE,
    );

    await expectTripTitle(contextB.page, SECOND_UPDATED_TITLE);
  } finally {
    if (!contextA.context.pages().every((page) => page.isClosed())) {
      await contextA.context.close();
    }
    await contextB.context.close();
  }
});

test('syncs place creation between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await addPlaceThroughUi(contextA.page);
    await editNewestPlaceThroughUi(contextA.page);

    await expectSyncedPlaceDetails(contextB.page);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await expectSyncedPlaceDetails(contextB.page);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});
