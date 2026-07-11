import { expect, test, type Dialog, type Page, type Route } from '@playwright/test';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const TICKET_ROOM_ID = 'e2estoragefailureticket01';
const TICKET_STORAGE_PREFIX = `rooms/${TICKET_ROOM_ID}/tickets`;
const TICKET_TITLE = 'E2E 上傳失敗票券';
const TICKET_FILE_NAME = 'phase-4-ticket-upload-failure.png';

const PLACE_ROOM_ID = 'e2estoragefailureplace01';
const PLACE_STORAGE_PREFIX = `rooms/${PLACE_ROOM_ID}/places`;
const PLACE_NAME = 'E2E 測試餐廳';
const PLACE_PHOTO_FILE_NAME = 'phase-4-successful-cover-before-failure.png';
const PLACE_RESOURCE_FILE_NAME = 'phase-4-forced-resource-failure.png';
const PLACE_RESOURCE_TITLE = 'E2E 失敗附件';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type TicketItem = {
  title?: string;
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

function storageObjectName(requestUrl: string): string {
  const url = new URL(requestUrl);
  return decodeURIComponent(url.searchParams.get('name') || '');
}

async function failStorageUploadForFile(
  page: Page,
  fileName: string,
): Promise<void> {
  await page.route('http://127.0.0.1:9199/**', async (route: Route) => {
    const request = route.request();
    const objectName = storageObjectName(request.url());
    const uploadProtocol = String(
      request.headers()['x-goog-upload-protocol'] || '',
    ).toLowerCase();

    // Firebase Storage SDK only uses resumable uploads for files larger
    // than 256 KiB. Small E2E fixtures are sent with multipart instead,
    // so the failure injector must cover both upload protocols.
    const shouldFail = request.method() === 'POST'
      && ['multipart', 'resumable'].includes(uploadProtocol)
      && objectName.endsWith(`/${fileName}`);

    if (!shouldFail) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        error: {
          code: 403,
          message: 'E2E forced Storage upload failure',
          status: 'PERMISSION_DENIED',
        },
      }),
    });
  });
}


async function failNthStorageUpload(
  page: Page,
  uploadNumber: number,
): Promise<void> {
  let observedUploads = 0;

  await page.route('http://127.0.0.1:9199/**', async (route: Route) => {
    const request = route.request();
    const uploadProtocol = String(
      request.headers()['x-goog-upload-protocol'] || '',
    ).toLowerCase();
    const isUploadStart = request.method() === 'POST'
      && ['multipart', 'resumable'].includes(uploadProtocol);

    if (!isUploadStart) {
      await route.continue();
      return;
    }

    observedUploads += 1;
    if (observedUploads !== uploadNumber) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 403,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify({
        error: {
          code: 403,
          message: 'E2E forced Storage upload failure',
          status: 'PERMISSION_DENIED',
        },
      }),
    });
  });
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

test.describe('Storage 上傳失敗與垃圾檔案清理', () => {
  test('票券上傳失敗時不寫入 Database，也不留下 Storage object', async ({
    page,
  }) => {
    await clearEmulatorDatabase();
    await clearEmulatorStorage(TICKET_STORAGE_PREFIX);
    await seedTestTrip(TICKET_ROOM_ID, {
      title: 'E2E 票券上傳失敗測試旅程',
      members: ['自己', '朋友'],
    });

    await failStorageUploadForFile(page, TICKET_FILE_NAME);
    await openTicketModal(page);

    await page.getByTestId('ticket-title-input').fill(TICKET_TITLE);
    await page.getByTestId('ticket-file-input').setInputFiles({
      name: TICKET_FILE_NAME,
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    const dialogPromise = page.waitForEvent('dialog');
    await page.getByTestId('ticket-save-button').click();
    const dialog = await dialogPromise;

    expect(dialog.type()).toBe('alert');
    expect(dialog.message()).toBe('上傳失敗，請稍後再試！');
    await dialog.accept();

    await expect(page.getByTestId('ticket-modal')).toBeVisible();
    await expect(page.getByTestId('ticket-save-button')).toBeEnabled();

    const tickets = toList(
      await readEmulatorData<TicketItem[] | Record<string, TicketItem>>(
        `rooms/${TICKET_ROOM_ID}/tickets`,
      ),
    );
    expect(tickets.some((ticket) => ticket.title === TICKET_TITLE)).toBe(false);

    await expect.poll(async () => {
      return await listEmulatorStorageObjects(TICKET_STORAGE_PREFIX);
    }).toEqual([]);
  });

  test('景點第二個附件上傳失敗時會清除先前已上傳的封面', async ({
    page,
  }) => {
    await clearEmulatorDatabase();
    await clearEmulatorStorage(PLACE_STORAGE_PREFIX);
    await seedTestTrip(PLACE_ROOM_ID, {
      title: 'E2E 景點垃圾檔案清理測試旅程',
      members: ['自己', '朋友'],
    });

    await failNthStorageUpload(page, 2);
    await page.goto(`/?room=${PLACE_ROOM_ID}`);
    await addTestPlace(page);

    let placeId = '';
    await expect
      .poll(
        async () => {
          const places = toList(
            await readEmulatorData<
              PlaceItem[] | Record<string, PlaceItem>
            >(`rooms/${PLACE_ROOM_ID}/itinerary/Day 1`),
          );
          const place = places.find((item) => item.name === PLACE_NAME);
          placeId = String(place?.id || '');
          return placeId;
        },
        {
          timeout: 15_000,
          message: '測試景點應寫入 Database Emulator',
        },
      )
      .not.toBe('');

    await openPlaceEditor(page);
    await page.getByTestId('place-photo-input').setInputFiles({
      name: PLACE_PHOTO_FILE_NAME,
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await expect(page.getByTestId('place-photo-preview')).toBeVisible();

    await page.getByTestId('place-resource-mode-image-button').click();
    await page.getByTestId('place-resource-image-input').setInputFiles({
      name: PLACE_RESOURCE_FILE_NAME,
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await page
      .getByTestId('place-resource-image-title-input')
      .fill(PLACE_RESOURCE_TITLE);
    await page.getByTestId('place-resource-image-add-button').click();

    const pendingResourceRow = page
      .getByTestId('place-resource-row')
      .filter({ hasText: PLACE_RESOURCE_TITLE })
      .first();
    await expect(pendingResourceRow).toBeVisible();
    await expect(pendingResourceRow).toContainText('待儲存上傳');

    let nativeDialogSeen = false;
    const nativeDialogHandler = async (dialog: Dialog) => {
      nativeDialogSeen = true;
      await dialog.dismiss();
    };
    page.on('dialog', nativeDialogHandler);

    await page.getByTestId('save-place-button').click();

    const errorToast = page
      .getByTestId('toast')
      .filter({ hasText: '無法更新景點' });
    await expect(errorToast).toHaveCount(1);
    await expect(errorToast).toHaveAttribute('data-toast-type', 'error');
    await expect(errorToast).toContainText('請檢查網路連線後再試一次。');
    expect(nativeDialogSeen).toBe(false);

    await expect(page.getByTestId('edit-place-modal')).toBeVisible();
    await expect(page.getByTestId('save-place-button')).toBeEnabled();
    await expect(pendingResourceRow).toBeVisible();
    await expect(page.getByTestId('place-photo-preview')).toBeVisible();

    const savedPlace = toList(
      await readEmulatorData<PlaceItem[] | Record<string, PlaceItem>>(
        `rooms/${PLACE_ROOM_ID}/itinerary/Day 1`,
      ),
    ).find((item) => String(item.id) === placeId);

    expect(savedPlace?.placePhoto ?? null).toBeNull();
    expect(savedPlace?.resources || []).toHaveLength(0);

    await expect
      .poll(
        async () => {
          return (
            await listEmulatorStorageObjects(
              `${PLACE_STORAGE_PREFIX}/${placeId}`,
            )
          ).map((object) => object.name);
        },
        {
          timeout: 15_000,
          message: '上傳失敗後應清除已成功上傳的景點封面',
        },
      )
      .toEqual([]);

    page.off('dialog', nativeDialogHandler);
  });
});
