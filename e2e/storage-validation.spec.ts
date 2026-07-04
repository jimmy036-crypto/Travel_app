import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const TICKET_ROOM_ID = 'e2estoragelimitsticket01';
const TICKET_STORAGE_PREFIX = `rooms/${TICKET_ROOM_ID}/tickets`;
const PLACE_ROOM_ID = 'e2estoragelimitsplace01';
const PLACE_STORAGE_PREFIX = `rooms/${PLACE_ROOM_ID}/places`;
const PLACE_NAME = 'E2E 測試餐廳';

const KIB = 1024;
const MIB = 1024 * KIB;

const INVALID_TEXT_FILE = Buffer.from('This file must be rejected.', 'utf8');
const OVERSIZED_TICKET_IMAGE = Buffer.alloc((10 * MIB) + 1, 0);
const OVERSIZED_PLACE_IMAGE = Buffer.alloc((5 * MIB) + 1, 0);
const OVERSIZED_PLACE_PDF = Buffer.alloc((15 * MIB) + 1, 0);

type UploadFile = {
  name: string;
  mimeType: string;
  buffer: Buffer;
};

type PlaceItem = {
  id?: string;
  name?: string;
  placePhoto?: unknown;
  resources?: unknown[];
};

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

async function expectRejectedFile(
  page: Page,
  input: Locator,
  file: UploadFile,
  expectedMessage: string,
): Promise<void> {
  const dialogPromise = page.waitForEvent('dialog');
  const selectionPromise = input.setInputFiles(file);
  const dialog = await dialogPromise;

  expect(dialog.type()).toBe('alert');
  expect(dialog.message()).toBe(expectedMessage);
  await dialog.accept();
  await selectionPromise;

  await expect(input).toHaveValue('');
}

async function openTicketModal(page: Page): Promise<void> {
  await page.goto(`/?room=${TICKET_ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

  const ticketTab = page.locator(
    '[data-testid="ticket-tab-button"]:visible',
  );
  await expect(ticketTab).toHaveCount(1);
  await ticketTab.click();
  await expect(page.getByTestId('ticket-panel')).toBeVisible();
  await page.getByTestId('add-ticket-button').click();
  await expect(page.getByTestId('ticket-modal')).toBeVisible();
}

function placeCard(page: Page) {
  return page
    .getByTestId('place-card')
    .filter({ hasText: PLACE_NAME })
    .first();
}

async function addTestPlace(page: Page): Promise<void> {
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

  await expect(placeCard(page)).toBeVisible({ timeout: 15_000 });
}

async function openPlaceEditor(page: Page): Promise<void> {
  await placeCard(page).click();
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await page.getByTestId('place-detail-edit-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
  await page.getByTestId('place-resources-toggle').click();
}

test.describe('Storage 檔案格式與大小限制', () => {
  test('票券拒絕不支援格式與超過 10 MB 的檔案', async ({ page }) => {
    await clearEmulatorDatabase();
    await clearEmulatorStorage(TICKET_STORAGE_PREFIX);
    await seedTestTrip(TICKET_ROOM_ID, {
      title: 'E2E 票券限制測試旅程',
      members: ['自己', '朋友'],
    });

    await openTicketModal(page);
    const input = page.getByTestId('ticket-file-input');

    await expectRejectedFile(
      page,
      input,
      {
        name: 'phase-4-invalid-ticket.txt',
        mimeType: 'text/plain',
        buffer: INVALID_TEXT_FILE,
      },
      '只允許上傳圖片或 PDF 檔案！',
    );

    await expectRejectedFile(
      page,
      input,
      {
        name: 'phase-4-oversized-ticket.png',
        mimeType: 'image/png',
        buffer: OVERSIZED_TICKET_IMAGE,
      },
      '檔案不可超過 10 MB！',
    );

    const tickets = toList(
      await readEmulatorData<unknown[] | Record<string, unknown>>(
        `rooms/${TICKET_ROOM_ID}/tickets`,
      ),
    );
    expect(tickets).toHaveLength(0);
    expect(
      await listEmulatorStorageObjects(TICKET_STORAGE_PREFIX),
    ).toHaveLength(0);
  });

  test('景點封面、資料圖片與 PDF 會套用格式及大小限制', async ({
    page,
  }) => {
    await clearEmulatorDatabase();
    await clearEmulatorStorage(PLACE_STORAGE_PREFIX);
    await seedTestTrip(PLACE_ROOM_ID, {
      title: 'E2E 景點附件限制測試旅程',
      members: ['自己', '朋友'],
    });

    await page.goto(`/?room=${PLACE_ROOM_ID}`);
    await addTestPlace(page);
    await openPlaceEditor(page);

    const photoInput = page.getByTestId('place-photo-input');
    await expectRejectedFile(
      page,
      photoInput,
      {
        name: 'phase-4-invalid-cover.txt',
        mimeType: 'text/plain',
        buffer: INVALID_TEXT_FILE,
      },
      '只能上傳圖片檔案。',
    );
    await expectRejectedFile(
      page,
      photoInput,
      {
        name: 'phase-4-oversized-cover.png',
        mimeType: 'image/png',
        buffer: OVERSIZED_PLACE_IMAGE,
      },
      '景點照片不可超過 5 MB。',
    );
    await expect(page.getByTestId('place-photo-preview')).toBeHidden();

    await page.getByTestId('place-resource-mode-image-button').click();
    const imageInput = page.getByTestId('place-resource-image-input');
    await expectRejectedFile(
      page,
      imageInput,
      {
        name: 'phase-4-invalid-resource.txt',
        mimeType: 'text/plain',
        buffer: INVALID_TEXT_FILE,
      },
      '只能上傳圖片檔案。',
    );
    await expectRejectedFile(
      page,
      imageInput,
      {
        name: 'phase-4-oversized-resource.png',
        mimeType: 'image/png',
        buffer: OVERSIZED_PLACE_IMAGE,
      },
      '資料圖片不可超過 5 MB。',
    );

    await page.getByTestId('place-resource-mode-pdf-button').click();
    const pdfInput = page.getByTestId('place-resource-pdf-input');
    await expectRejectedFile(
      page,
      pdfInput,
      {
        name: 'phase-4-invalid-resource.txt',
        mimeType: 'text/plain',
        buffer: INVALID_TEXT_FILE,
      },
      '只能上傳 PDF 檔案。',
    );
    await expectRejectedFile(
      page,
      pdfInput,
      {
        name: 'phase-4-oversized-resource.pdf',
        mimeType: 'application/pdf',
        buffer: OVERSIZED_PLACE_PDF,
      },
      'PDF 不可超過 15 MB。',
    );

    await page.getByTestId('save-place-button').click();
    await expect(page.getByTestId('edit-place-modal')).toBeHidden({
      timeout: 20_000,
    });

    const dayOne = toList(
      await readEmulatorData<PlaceItem[] | Record<string, PlaceItem>>(
        `rooms/${PLACE_ROOM_ID}/itinerary/Day 1`,
      ),
    );
    const savedPlace = dayOne.find((item) => item.name === PLACE_NAME);

    expect(savedPlace).toBeDefined();
    expect(Boolean(savedPlace?.placePhoto)).toBe(false);
    expect(savedPlace?.resources || []).toHaveLength(0);
    expect(
      await listEmulatorStorageObjects(PLACE_STORAGE_PREFIX),
    ).toHaveLength(0);
  });
});
