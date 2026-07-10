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
  clearEmulatorStorage,
  readEmulatorData,
  seedTestTrip,
  storageObjectExists,
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
const EXPENSE_SYNC_MEMBER_A = 'E2E Alice';
const EXPENSE_SYNC_MEMBER_B = 'E2E Bob';
const EXPENSE_SYNC_ITEM = 'E2E realtime shared lunch';
const EXPENSE_SYNC_COST = '1200';
const EXPENSE_SYNC_NOTE = 'E2E realtime expense creation note';
const EDITED_EXPENSE_SYNC_ITEM = 'E2E realtime edited ramen';
const EDITED_EXPENSE_SYNC_COST = '2000';
const EDITED_EXPENSE_SYNC_NOTE = 'E2E realtime expense edit note';
const STORAGE_SYNC_PREFIX = `rooms/${ROOM_ID}/tickets`;
const STORAGE_SYNC_TICKET_TITLE = 'E2E realtime storage ticket image';
const STORAGE_SYNC_TICKET_FILE_NAME = 'phase-5b-storage-ticket.png';
const STORAGE_SYNC_TICKET_MEMO = 'E2E realtime storage attachment note';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type PlaceDetails = {
  name: string;
  arrivalTime: string;
  stayMinutes: string;
  note: string;
};

type TicketItem = {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  storagePath?: string;
  memo?: string;
  owner?: string;
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

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

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

async function expectSyncStatus(
  page: Page,
  expectedStatus: string | RegExp,
): Promise<void> {
  await expect(page.getByTestId('sync-status-indicator')).toContainText(
    expectedStatus,
    { timeout: 20_000 },
  );
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

async function seedExpenseSyncTrip(): Promise<void> {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: INITIAL_TITLE,
    members: [EXPENSE_SYNC_MEMBER_A, EXPENSE_SYNC_MEMBER_B],
    memberBudgets: {
      [EXPENSE_SYNC_MEMBER_A]: 10000,
      [EXPENSE_SYNC_MEMBER_B]: 10000,
    },
  });
}

async function seedStorageSyncTrip(): Promise<void> {
  await clearEmulatorDatabase();
  await clearEmulatorStorage(STORAGE_SYNC_PREFIX);
  await seedTestTrip(ROOM_ID, {
    title: INITIAL_TITLE,
    members: [EXPENSE_SYNC_MEMBER_A, EXPENSE_SYNC_MEMBER_B],
  });
}

async function readTickets(): Promise<TicketItem[]> {
  const value = await readEmulatorData<
    TicketItem[] | Record<string, TicketItem>
  >(`rooms/${ROOM_ID}/tickets`);

  return toList(value);
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
  const mobileActionTrigger = placeCard.getByTestId('place-action-menu-trigger');
  if (await mobileActionTrigger.isVisible().catch(() => false)) {
    await mobileActionTrigger.click();
  } else {
    await placeCard.hover();
  }

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('確定刪除此景點');
    await dialog.accept();
  });

  const mobileActionMenu = page.getByTestId('place-action-menu');
  if (await mobileActionMenu.isVisible().catch(() => false)) {
    await mobileActionMenu.getByTestId('place-action-delete').click();
  } else {
    await placeCard.locator('[data-testid="delete-place-button"]:visible').click();
  }
  await expect(placeCardByName(page, place.name)).toBeHidden({
    timeout: 20_000,
  });
}

async function openExpenseTab(page: Page): Promise<void> {
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const expenseTab = page.locator(
    '[data-testid="expense-tab-button"]:visible',
  );

  await expect(expenseTab).toHaveCount(1);
  await expenseTab.click();

  await expect(page.getByTestId('expense-panel')).toBeVisible();
}

async function openTicketPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const ticketTab = page.locator(
    '[data-testid="ticket-tab-button"]:visible',
  );

  await expect(ticketTab).toHaveCount(1);
  await ticketTab.click();

  await expect(page.getByTestId('ticket-panel')).toBeVisible();
}

function ticketCard(page: Page, title = STORAGE_SYNC_TICKET_TITLE) {
  return page
    .getByTestId('ticket-card')
    .filter({ hasText: title })
    .first();
}

async function addTicketImageThroughUi(page: Page): Promise<void> {
  await page.getByTestId('add-ticket-button').click();
  await expect(page.getByTestId('ticket-modal')).toBeVisible();

  await page.getByTestId('ticket-title-input').fill(STORAGE_SYNC_TICKET_TITLE);
  await page.getByTestId('ticket-memo-input').fill(STORAGE_SYNC_TICKET_MEMO);
  await page.getByTestId('ticket-file-input').setInputFiles({
    name: STORAGE_SYNC_TICKET_FILE_NAME,
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });

  await page.getByTestId('ticket-save-button').click();
  await expect(page.getByTestId('ticket-modal')).toBeHidden({
    timeout: 35_000,
  });
}

async function waitForStoredTicketAttachment(): Promise<TicketItem> {
  let savedTicket: TicketItem | undefined;

  await expect
    .poll(
      async () => {
        savedTicket = (await readTickets()).find(
          (ticket) => ticket.title === STORAGE_SYNC_TICKET_TITLE,
        );

        return savedTicket
          ? {
              type: savedTicket.type,
              memo: savedTicket.memo,
              hasDownloadUrl: Boolean(savedTicket.url),
              correctPrefix: String(savedTicket.storagePath || '').startsWith(
                `${STORAGE_SYNC_PREFIX}/`,
              ),
              correctFileName: String(savedTicket.storagePath || '').endsWith(
                `/${STORAGE_SYNC_TICKET_FILE_NAME}`,
              ),
            }
          : null;
      },
      {
        timeout: 15_000,
        message: 'ticket image attachment is persisted to the emulator',
      },
    )
    .toEqual({
      type: 'image',
      memo: STORAGE_SYNC_TICKET_MEMO,
      hasDownloadUrl: true,
      correctPrefix: true,
      correctFileName: true,
    });

  const storagePath = String(savedTicket?.storagePath || '');
  expect(storagePath).not.toBe('');
  await expect.poll(async () => await storageObjectExists(storagePath))
    .toBe(true);

  return savedTicket as TicketItem;
}

async function expectNoTicketAttachment(page: Page): Promise<void> {
  await expect(ticketCard(page)).toHaveCount(0);
}

async function expectSyncedTicketAttachment(page: Page): Promise<void> {
  const card = ticketCard(page);

  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(STORAGE_SYNC_TICKET_TITLE);
  await expect(card).toContainText(STORAGE_SYNC_TICKET_MEMO);
  await expect(
    card.getByRole('button', { name: /全螢幕驗票模式/ }),
  ).toBeVisible();
}

async function openNewExpenseModal(page: Page): Promise<void> {
  await page.getByTestId('add-expense-button').click();

  await expect(page.getByTestId('expense-modal')).toBeVisible();
  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'create',
  );
}

function expenseRecord(page: Page, itemName: string) {
  return page
    .getByTestId('expense-record')
    .filter({ hasText: itemName })
    .first();
}

async function addEqualSplitExpenseThroughUi(page: Page): Promise<void> {
  await openNewExpenseModal(page);

  await page.getByTestId('expense-item-input').fill(EXPENSE_SYNC_ITEM);
  await page.getByTestId('expense-currency-select').selectOption('TWD');
  await page.getByTestId('expense-local-cost-input').fill(EXPENSE_SYNC_COST);
  await page
    .getByTestId('expense-payer-select')
    .selectOption(EXPENSE_SYNC_MEMBER_A);
  await page.getByTestId('expense-note-input').fill(EXPENSE_SYNC_NOTE);

  await expect(page.getByTestId('expense-twd-total')).toContainText('1,200');
  await expect(
    page.locator(
      `[data-testid="expense-involved-member"][data-member="${EXPENSE_SYNC_MEMBER_A}"]`,
    ),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator(
      `[data-testid="expense-involved-member"][data-member="${EXPENSE_SYNC_MEMBER_B}"]`,
    ),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('expense-save-button').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden({
    timeout: 15_000,
  });
}

async function expectSyncedExpense(page: Page): Promise<void> {
  const record = expenseRecord(page, EXPENSE_SYNC_ITEM);

  await expect(record).toBeVisible({ timeout: 20_000 });
  await expect(record.getByTestId('expense-record-title')).toHaveText(
    EXPENSE_SYNC_ITEM,
  );
  await expect(record.getByTestId('expense-record-cost')).toHaveText(
    /^NT\$\s*1,200$/,
  );
  await expect(record).toContainText(EXPENSE_SYNC_MEMBER_A);
  await expect(record).toContainText(EXPENSE_SYNC_NOTE);
  await expect(page.getByTestId('expense-total')).toContainText('1,200');
  await expect(
    page.locator(
      `[data-testid="member-spent"][data-member="${EXPENSE_SYNC_MEMBER_A}"]`,
    ),
  ).toContainText('600');
  await expect(
    page.locator(
      `[data-testid="member-spent"][data-member="${EXPENSE_SYNC_MEMBER_B}"]`,
    ),
  ).toContainText('600');
}

async function editExpenseThroughUi(page: Page): Promise<void> {
  await expenseRecord(page, EXPENSE_SYNC_ITEM).click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );

  await page.getByTestId('expense-item-input').fill(EDITED_EXPENSE_SYNC_ITEM);
  await page.getByTestId('expense-currency-select').selectOption('JPY');
  await page
    .getByTestId('expense-local-cost-input')
    .fill(EDITED_EXPENSE_SYNC_COST);
  await page
    .getByTestId('expense-payer-select')
    .selectOption(EXPENSE_SYNC_MEMBER_B);
  await page.getByTestId('expense-note-input').fill(EDITED_EXPENSE_SYNC_NOTE);

  await expect(page.getByTestId('expense-rate-input')).toHaveValue('0.21');
  await expect(page.getByTestId('expense-twd-total')).toContainText('420');

  await page.getByTestId('expense-save-button').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden({
    timeout: 15_000,
  });
}

async function expectEditedExpense(page: Page): Promise<void> {
  const record = expenseRecord(page, EDITED_EXPENSE_SYNC_ITEM);

  await expect(expenseRecord(page, EXPENSE_SYNC_ITEM)).toHaveCount(0);
  await expect(record).toBeVisible({ timeout: 20_000 });
  await expect(record.getByTestId('expense-record-title')).toHaveText(
    EDITED_EXPENSE_SYNC_ITEM,
  );
  await expect(record.getByTestId('expense-record-cost')).toHaveText(
    /^NT\$\s*420$/,
  );
  await expect(record).toContainText(EXPENSE_SYNC_MEMBER_B);
  await expect(record).toContainText(EDITED_EXPENSE_SYNC_NOTE);
  await expect(page.getByTestId('expense-total')).toContainText('420');
  await expect(
    page.locator(
      `[data-testid="member-spent"][data-member="${EXPENSE_SYNC_MEMBER_A}"]`,
    ),
  ).toContainText('210');
  await expect(
    page.locator(
      `[data-testid="member-spent"][data-member="${EXPENSE_SYNC_MEMBER_B}"]`,
    ),
  ).toContainText('210');
}

async function deleteExpenseThroughUi(page: Page): Promise<void> {
  const record = expenseRecord(page, EXPENSE_SYNC_ITEM);

  await expect(record).toBeVisible({ timeout: 20_000 });
  await record.click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );

  await page.getByTestId('expense-more-actions').locator('summary').click();

  page.once('dialog', (dialog) => {
    expect(dialog.type()).toBe('confirm');
    void dialog.accept();
  });

  await page.getByTestId('expense-delete-button').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden({
    timeout: 15_000,
  });
  await expect(expenseRecord(page, EXPENSE_SYNC_ITEM)).toHaveCount(0);
}

async function expectDeletedExpense(page: Page): Promise<void> {
  await expect(expenseRecord(page, EXPENSE_SYNC_ITEM)).toHaveCount(0);
  await expect(page.getByTestId('expense-total')).toContainText('NT$ 0');
  await expect(
    page.locator(
      `[data-testid="member-spent"][data-member="${EXPENSE_SYNC_MEMBER_A}"]`,
    ),
  ).toContainText('0');
  await expect(
    page.locator(
      `[data-testid="member-spent"][data-member="${EXPENSE_SYNC_MEMBER_B}"]`,
    ),
  ).toContainText('0');
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

test('shows realtime sync status when another context updates the trip', async ({
  browser,
}, testInfo) => {
  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await expectSyncStatus(contextB.page, '已同步');

    await addPlaceThroughUi(contextA.page);

    await expectSyncStatus(contextB.page, '遠端已更新');
    await expectPlaceCount(contextB.page, 2);
    await expectSyncStatus(contextB.page, '已同步');
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});

test('syncs storage attachment status between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  await seedStorageSyncTrip();

  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await openTicketPanel(contextA.page);
    await openTicketPanel(contextB.page);

    await expectNoTicketAttachment(contextB.page);

    await addTicketImageThroughUi(contextA.page);
    await waitForStoredTicketAttachment();

    await expectSyncedTicketAttachment(contextB.page);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await openTicketPanel(contextB.page);
    await expectSyncedTicketAttachment(contextB.page);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});

test('syncs expense creation between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  await seedExpenseSyncTrip();

  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await openExpenseTab(contextA.page);
    await openExpenseTab(contextB.page);

    await addEqualSplitExpenseThroughUi(contextA.page);

    await expectSyncedExpense(contextB.page);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await openExpenseTab(contextB.page);
    await expectSyncedExpense(contextB.page);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});

test('syncs expense edits between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  await seedExpenseSyncTrip();

  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await openExpenseTab(contextA.page);
    await openExpenseTab(contextB.page);

    await addEqualSplitExpenseThroughUi(contextA.page);
    await expectSyncedExpense(contextB.page);

    await editExpenseThroughUi(contextA.page);
    await expectEditedExpense(contextB.page);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await openExpenseTab(contextB.page);
    await expectEditedExpense(contextB.page);
  } finally {
    await contextA.context.close();
    await contextB.context.close();
  }
});

test('syncs expense deletion between active browser contexts in realtime', async ({
  browser,
}, testInfo) => {
  await seedExpenseSyncTrip();

  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await openExpenseTab(contextA.page);
    await openExpenseTab(contextB.page);

    await addEqualSplitExpenseThroughUi(contextA.page);
    await expectSyncedExpense(contextB.page);

    await deleteExpenseThroughUi(contextA.page);
    await expectDeletedExpense(contextB.page);

    await contextB.page.reload();
    await expect(contextB.page.getByTestId('active-trip-view')).toBeVisible({
      timeout: 20_000,
    });
    await expectTripTitle(contextB.page, INITIAL_TITLE);
    await openExpenseTab(contextB.page);
    await expectDeletedExpense(contextB.page);
  } finally {
    await contextA.context.close();
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
