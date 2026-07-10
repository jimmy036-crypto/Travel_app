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
const EDITED_PLACE_NAME = 'E2E realtime sync edited museum';
const EDITED_PLACE_ARRIVAL_TIME = '15:45';
const EDITED_PLACE_STAY_MINUTES = '90';
const EDITED_PLACE_NOTE = 'E2E realtime place edit note';
const DRAG_SYNC_PLACE_A = 'E2E drag sync breakfast';
const DRAG_SYNC_PLACE_B = 'E2E drag sync gallery';
const DRAG_SYNC_PLACE_C = 'E2E drag sync market';

type PlaceDetails = {
  name: string;
  arrivalTime: string;
  stayMinutes: string;
  note: string;
};

const CREATED_PLACE: PlaceDetails = {
  name: SYNCED_PLACE_NAME,
  arrivalTime: SYNCED_PLACE_ARRIVAL_TIME,
  stayMinutes: SYNCED_PLACE_STAY_MINUTES,
  note: SYNCED_PLACE_NOTE,
};

const EDITED_PLACE: PlaceDetails = {
  name: EDITED_PLACE_NAME,
  arrivalTime: EDITED_PLACE_ARRIVAL_TIME,
  stayMinutes: EDITED_PLACE_STAY_MINUTES,
  note: EDITED_PLACE_NOTE,
};

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

function placeCardByName(page: Page, name: string) {
  return page
    .getByTestId('place-card')
    .filter({ hasText: name })
    .first();
}

function dayCard(page: Page, dayId: string) {
  return page.locator(
    `[data-testid="itinerary-day-card"][data-day-id="${dayId}"]`,
  );
}

function placeCardInDay(page: Page, dayId: string, name: string) {
  return dayCard(page, dayId)
    .getByTestId('place-card')
    .filter({ hasText: name })
    .first();
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
  const handle = placeCardInDay(page, dayId, placeName)
    .getByTestId('place-drag-handle');

  await handle.scrollIntoViewIfNeeded();
  await handle.focus();

  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
}

async function seedDragSyncTrip(): Promise<void> {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: INITIAL_TITLE,
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    itinerary: {
      'Day 1': [
        {
          id: 'drag-sync-place-a',
          name: DRAG_SYNC_PLACE_A,
          place_id: 'drag-sync-place-a-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E drag sync address A',
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
          id: 'drag-sync-place-b',
          name: DRAG_SYNC_PLACE_B,
          place_id: 'drag-sync-place-b-id',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: 'E2E drag sync address B',
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
          id: 'drag-sync-place-c',
          name: DRAG_SYNC_PLACE_C,
          place_id: 'drag-sync-place-c-id',
          customName: '',
          lat: 25.035,
          lng: 121.5674,
          address: 'E2E drag sync address C',
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

async function expectPlaceCount(page: Page, count: number): Promise<void> {
  await expect
    .poll(async () => await page.getByTestId('place-card').count(), {
      timeout: 20_000,
      message: `place card count reaches ${count}`,
    })
    .toBe(count);
}

async function expectPlaceCardVisible(
  page: Page,
  place: PlaceDetails,
): Promise<void> {
  const placeCard = placeCardByName(page, place.name);

  await expect(placeCard).toBeVisible({ timeout: 20_000 });
  await expect(placeCard.getByTestId('place-card-title')).toContainText(
    place.name,
  );
  await expect(placeCard.getByTestId('place-card-time')).toHaveText(
    place.arrivalTime,
  );
}

async function fillOpenPlaceEditor(
  page: Page,
  place: PlaceDetails,
): Promise<void> {
  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
  await page.getByTestId('place-name-input').fill(place.name);
  await page
    .getByTestId('place-arrival-time-input')
    .fill(place.arrivalTime);
  await page
    .getByTestId('place-stay-duration-input')
    .fill(place.stayMinutes);
  await page.getByTestId('place-note-input').fill(place.note);
  await page.getByTestId('save-place-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeHidden({
    timeout: 15_000,
  });
  await expect(placeCardByName(page, place.name)).toBeVisible({
    timeout: 15_000,
  });
}

async function editNewestPlaceThroughUi(
  page: Page,
  place: PlaceDetails,
): Promise<void> {
  await page.getByTestId('place-card').last().click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId('place-detail-edit-button').click();

  await fillOpenPlaceEditor(page, place);
}

async function editPlaceThroughUi(
  page: Page,
  currentName: string,
  nextPlace: PlaceDetails,
): Promise<void> {
  await placeCardByName(page, currentName).click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible({
    timeout: 15_000,
  });
  await page.getByTestId('place-detail-edit-button').click();

  await fillOpenPlaceEditor(page, nextPlace);
}

async function expectSyncedPlaceDetails(
  page: Page,
  place: PlaceDetails,
): Promise<void> {
  await expectPlaceCardVisible(page, place);

  await placeCardByName(page, place.name).click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('place-detail-title')).toHaveText(
    place.name,
  );
  await expect(page.getByTestId('place-detail-note')).toHaveText(
    place.note,
  );

  await page.getByTestId('place-detail-edit-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
  await expect(page.getByTestId('place-name-input')).toHaveValue(
    place.name,
  );
  await expect(page.getByTestId('place-arrival-time-input')).toHaveValue(
    place.arrivalTime,
  );
  await expect(page.getByTestId('place-stay-duration-input')).toHaveValue(
    place.stayMinutes,
  );
  await expect(page.getByTestId('place-note-input')).toHaveValue(
    place.note,
  );
}

async function deletePlaceThroughUi(
  page: Page,
  place: PlaceDetails,
): Promise<void> {
  const placeCard = placeCardByName(page, place.name);

  await expect(placeCard).toBeVisible({ timeout: 20_000 });
  await placeCard.hover();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('確定刪除此景點');
    await dialog.accept();
  });

  await placeCard.getByRole('button', { name: '刪除' }).click();
  await expect(placeCardByName(page, place.name)).toBeHidden({
    timeout: 20_000,
  });
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

test('syncs place deletion between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await addPlaceThroughUi(contextA.page);
    await editNewestPlaceThroughUi(contextA.page, CREATED_PLACE);

    await expectPlaceCount(contextB.page, 2);
    await expectPlaceCardVisible(contextB.page, CREATED_PLACE);

    await deletePlaceThroughUi(contextA.page, CREATED_PLACE);

    await expect(placeCardByName(contextB.page, CREATED_PLACE.name))
      .toBeHidden({ timeout: 20_000 });
    await expectPlaceCount(contextB.page, 1);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await expect(placeCardByName(contextB.page, CREATED_PLACE.name))
      .toBeHidden({ timeout: 20_000 });
    await expectPlaceCount(contextB.page, 1);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});

test('syncs itinerary drag changes between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  await seedDragSyncTrip();

  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);
  const initialOrder = [
    DRAG_SYNC_PLACE_A,
    DRAG_SYNC_PLACE_B,
    DRAG_SYNC_PLACE_C,
  ];
  const reordered = [
    DRAG_SYNC_PLACE_A,
    DRAG_SYNC_PLACE_C,
    DRAG_SYNC_PLACE_B,
  ];

  try {
    await expect(dayCard(contextB.page, 'Day 1')).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(() => visibleOrder(contextB.page, 'Day 1'), {
        timeout: 20_000,
        message: 'Context B shows initial same-day itinerary order',
      })
      .toEqual(initialOrder);

    await dragOnePositionUpByKeyboard(
      contextA.page,
      'Day 1',
      DRAG_SYNC_PLACE_C,
    );

    await expect
      .poll(() => visibleOrder(contextB.page, 'Day 1'), {
        timeout: 20_000,
        message: 'Context B receives reordered itinerary without reload',
      })
      .toEqual(reordered);
    await expect(
      placeCardInDay(contextB.page, 'Day 1', DRAG_SYNC_PLACE_A)
        .getByTestId('place-card-time'),
    ).toHaveText('09:00');
    await expect(
      placeCardInDay(contextB.page, 'Day 1', DRAG_SYNC_PLACE_C)
        .getByTestId('place-card-time'),
    ).toHaveText('09:40');
    await expect(
      placeCardInDay(contextB.page, 'Day 1', DRAG_SYNC_PLACE_B)
        .getByTestId('place-card-time'),
    ).toHaveText('10:30');

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await expect
      .poll(() => visibleOrder(contextB.page, 'Day 1'), {
        timeout: 20_000,
        message: 'Context B keeps reordered itinerary after reload',
      })
      .toEqual(reordered);
    await expect(
      placeCardInDay(contextB.page, 'Day 1', DRAG_SYNC_PLACE_B)
        .getByTestId('place-card-time'),
    ).toHaveText('10:30');
  } finally {
    await contextA.context.close();
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
    await editNewestPlaceThroughUi(contextA.page, CREATED_PLACE);

    await expectSyncedPlaceDetails(contextB.page, CREATED_PLACE);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await expectSyncedPlaceDetails(contextB.page, CREATED_PLACE);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});

test('syncs place edits between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await addPlaceThroughUi(contextA.page);
    await editNewestPlaceThroughUi(contextA.page, CREATED_PLACE);

    await expectPlaceCount(contextB.page, 2);
    await expect(placeCardByName(contextB.page, CREATED_PLACE.name))
      .toBeVisible({ timeout: 20_000 });

    await editPlaceThroughUi(
      contextA.page,
      CREATED_PLACE.name,
      EDITED_PLACE,
    );

    await expect(placeCardByName(contextB.page, CREATED_PLACE.name))
      .toBeHidden({ timeout: 20_000 });
    await expectSyncedPlaceDetails(contextB.page, EDITED_PLACE);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await expect(placeCardByName(contextB.page, CREATED_PLACE.name))
      .toBeHidden({ timeout: 20_000 });
    await expectSyncedPlaceDetails(contextB.page, EDITED_PLACE);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});
