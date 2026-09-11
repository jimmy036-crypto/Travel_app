import { expect, test, type Page } from '@playwright/test';
import { createAttachmentTicket } from './support/tickets';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  readEmulatorData,
  readEmulatorStorageObjectMetadata,
  seedTestTrip,
  storageObjectExists,
} from './support/emulator';

const ROOM_ID = 'e2eticketstorageroom0001';
const STORAGE_PREFIX = `rooms/${ROOM_ID}/tickets`;
const TRIP_TITLE = 'E2E 票券 Storage 測試旅程';
const TICKET_TITLE = 'E2E 圖片票券';
const TICKET_FILE_NAME = 'phase-4-ticket.png';
const TICKET_MEMO = 'Phase 4 圖片上傳與刪除測試';
const PDF_TICKET_TITLE = 'E2E PDF 票券';
const PDF_TICKET_FILE_NAME = 'phase-4-ticket.pdf';
const PDF_TICKET_MEMO = 'Phase 4 PDF 上傳與刪除測試';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const PDF_TICKET_BYTES = Buffer.from(
  'JVBERi0xLjMKJZOMi54gUmVwb3J0TGFiIEdlbmVyYXRlZCBQREYgZG9jdW1lbnQgKG9wZW5zb3VyY2UpCjEgMCBvYmoKPDwKL0YxIDIgMCBSCj4+CmVuZG9iagoyIDAgb2JqCjw8Ci9CYXNlRm9udCAvSGVsdmV0aWNhIC9FbmNvZGluZyAvV2luQW5zaUVuY29kaW5nIC9OYW1lIC9GMSAvU3VidHlwZSAvVHlwZTEgL1R5cGUgL0ZvbnQKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL0NvbnRlbnRzIDcgMCBSIC9NZWRpYUJveCBbIDAgMCA3MiA3MiBdIC9QYXJlbnQgNiAwIFIgL1Jlc291cmNlcyA8PAovRm9udCAxIDAgUiAvUHJvY1NldCBbIC9QREYgL1RleHQgL0ltYWdlQiAvSW1hZ2VDIC9JbWFnZUkgXQo+PiAvUm90YXRlIDAgL1RyYW5zIDw8Cgo+PiAKICAvVHlwZSAvUGFnZQo+PgplbmRvYmoKNCAwIG9iago8PAovUGFnZU1vZGUgL1VzZU5vbmUgL1BhZ2VzIDYgMCBSIC9UeXBlIC9DYXRhbG9nCj4+CmVuZG9iago1IDAgb2JqCjw8Ci9BdXRob3IgKGFub255bW91cykgL0NyZWF0aW9uRGF0ZSAoRDoyMDI2MDcwNTAwMDAwMCswMCcwMCcpIC9DcmVhdG9yIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSB3d3cucmVwb3J0bGFiLmNvbSkgL0tleXdvcmRzICgpIC9Nb2REYXRlIChEOjIwMjYwNzA1MDAwMDAwKzAwJzAwJykgL1Byb2R1Y2VyIChSZXBvcnRMYWIgUERGIExpYnJhcnkgLSB3d3cucmVwb3J0bGFiLmNvbSkgCiAgL1N1YmplY3QgKHVuc3BlY2lmaWVkKSAvVGl0bGUgKHVudGl0bGVkKSAvVHJhcHBlZCAvRmFsc2UKPj4KZW5kb2JqCjYgMCBvYmoKPDwKL0NvdW50IDEgL0tpZHMgWyAzIDAgUiBdIC9UeXBlIC9QYWdlcwo+PgplbmRvYmoKNyAwIG9iago8PAovRmlsdGVyIFsgL0FTQ0lJODVEZWNvZGUgL0ZsYXRlRGVjb2RlIF0gL0xlbmd0aCA5NQo+PgpzdHJlYW0KR2FwUWgwRT1GLDBVXEgzVFxwTllUXlFLaz90Yz5JUCw7VyNVMV4yM2loUEVNXz9DVzRLSVNpOTBNakdeMixGU1w2QVViSVA+X2hrXWZQU2InQmY/TS5XKk0wRlx2RUdkKDplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA4CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDA3MyAwMDAwMCBuIAowMDAwMDAwMTA0IDAwMDAwIG4gCjAwMDAwMDAyMTEgMDAwMDAgbiAKMDAwMDAwMDQwNCAwMDAwMCBuIAowMDAwMDAwNDcyIDAwMDAwIG4gCjAwMDAwMDA3NjggMDAwMDAgbiAKMDAwMDAwMDgyNyAwMDAwMCBuIAp0cmFpbGVyCjw8Ci9JRCAKWzw0ZTRmOTdmYzM0NDRmYTNhNWZlOWI3YTM3ZWU0NDQzNj48NGU0Zjk3ZmMzNDQ0ZmEzYTVmZTliN2EzN2VlNDQ0MzY+XQovSW5mbyA1IDAgUgovUm9vdCA0IDAgUgovU2l6ZSA4Cj4+CnN0YXJ0eHJlZgoxMDExCiUlRU9GCg==',
  'base64',
);

type TicketItem = {
  id?: string;
  title?: string;
  type?: string;
  url?: string;
  storagePath?: string;
  memo?: string;
  owner?: string;
};

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

async function readTickets(): Promise<TicketItem[]> {
  const value = await readEmulatorData<
    TicketItem[] | Record<string, TicketItem>
  >(`rooms/${ROOM_ID}/tickets`);

  return toList(value);
}

async function waitForActiveTrip(page: Page): Promise<void> {
  const routeContext = page.getByTestId('trip-route-context');
  await expect(routeContext).toHaveAttribute('data-room-id', ROOM_ID, {
    timeout: 15_000,
  });

  const activeTripView = page.getByTestId('active-trip-view');
  const loadedOnFirstAttempt = await activeTripView
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (!loadedOnFirstAttempt) {
    const seededMeta = await readEmulatorData<{ title?: string }>(
      `rooms/${ROOM_ID}/meta`,
    );
    expect(seededMeta?.title).toBe(TRIP_TITLE);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(routeContext).toHaveAttribute('data-room-id', ROOM_ID, {
      timeout: 15_000,
    });
  }

  await expect(activeTripView).toBeVisible({ timeout: 20_000 });
}

async function openTicketPanel(page: Page): Promise<void> {
  await waitForActiveTrip(page);

  const ticketTab = page.locator(
    '[data-testid="ticket-tab-button"]:visible',
  );

  await expect(ticketTab).toHaveCount(1);
  await ticketTab.click();
  await expect(page.getByTestId('ticket-panel')).toBeVisible();
}

function ticketCard(page: Page, title = TICKET_TITLE) {
  return page
    .getByTestId('ticket-card')
    .filter({ hasText: title })
    .first();
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await clearEmulatorStorage(STORAGE_PREFIX);
  await seedTestTrip(ROOM_ID, {
    title: TRIP_TITLE,
    members: ['自己', '朋友'],
  });
});

test.afterEach(async () => {
  await clearEmulatorStorage(STORAGE_PREFIX);
});

test('protected image reading can fail, cancel a delayed read and reopen after reload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await openTicketPanel(page);
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 800, 1000);
    context.fillStyle = '#0f172a';
    context.font = 'bold 46px sans-serif';
    ['SYNTHETIC TICKET', 'NOT VALID FOR TRAVEL', 'Day 1 / 09:15', 'Sample passenger', 'Seat 12A', 'No usable barcode'].forEach((line, index) => context.fillText(line, 40, 100 + index * 120));
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await createAttachmentTicket(page, { title: '合成閱讀票券', name: 'synthetic-reading.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.reload();
  await openTicketPanel(page);
  await page.getByTestId('ticket-filter-common').click();
  const records = await readTickets();
  const card = ticketCard(page, '合成閱讀票券');
  const open = card.getByRole('button', { name: '全螢幕查看票券' });
  let mode = 'error';
  let releaseRead: (() => void) | undefined;
  await page.route('http://127.0.0.1:9199/**', async (route) => {
    if (route.request().method() !== 'GET' || new URL(route.request().url()).searchParams.get('alt') !== 'media') return route.continue();
    if (mode === 'error') return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: { code: 403, message: 'synthetic denied read' } }) });
    if (mode === 'pending') await new Promise<void>((resolve) => { releaseRead = resolve; });
    await route.continue();
  });
  await open.click();
  const error = page.getByTestId('toast').filter({ hasText: '無法開啟票券' });
  await expect(error).toBeVisible();
  expect(await readTickets()).toEqual(records);
  await expect(page.getByTestId('fullscreen-ticket-modal')).toHaveCount(0);
  await error.getByTestId('toast-dismiss').click();

  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = create(blob);
      document.documentElement.dataset.ticketReadReady = 'true';
      return url;
    };
  });
  mode = 'pending';
  await open.click();
  await expect(card.getByRole('button', { name: '正在讀取票券…' })).toBeDisabled();
  await expect.poll(() => Boolean(releaseRead)).toBe(true);
  await card.getByRole('button', { name: '取消開啟' }).click();
  releaseRead!();
  await expect(page.locator('html')).toHaveAttribute('data-ticket-read-ready', 'true');
  await expect(page.getByTestId('fullscreen-ticket-modal')).toHaveCount(0);
  mode = 'ready';
  await open.click();
  const modal = page.getByTestId('fullscreen-ticket-modal');
  const image = modal.getByRole('img', { name: '合成閱讀票券' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(800);
  await expect(image).toHaveCSS('object-fit', 'contain');
  await expect(image).toHaveAttribute('src', /^blob:/);
  await expect(modal.getByRole('button', { name: '關閉票券' })).toBeFocused();
  await testInfo.attach('image-reading-390', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(open).toBeFocused();
  await expect(page.getByTestId('ticket-filter-common')).toHaveAttribute('aria-pressed', 'true');
  expect(await readTickets()).toEqual(records);
});

test('圖片票券會上傳、持久化並從 Database 與 Storage 一併刪除', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openTicketPanel(page);

  await page.getByTestId('add-ticket-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeVisible();

  await page.getByTestId('ticket-title-input').fill(TICKET_TITLE);
  await page.getByTestId('ticket-more-settings-toggle').click();
  await page.getByTestId('ticket-memo-input').fill(TICKET_MEMO);
  await page.getByTestId('ticket-file-input').setInputFiles({
    name: TICKET_FILE_NAME,
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });

  await page.getByTestId('ticket-submit-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeHidden({
    timeout: 35_000,
  });
  await expect(ticketCard(page)).toBeVisible();

  let savedTicket: TicketItem | undefined;

  await expect
    .poll(
      async () => {
        savedTicket = (await readTickets()).find(
          (ticket) => ticket.title === TICKET_TITLE,
        );

        return savedTicket
          ? {
              type: savedTicket.type,
              memo: savedTicket.memo,
              owner: savedTicket.owner,
              hasDownloadUrl: Boolean(savedTicket.url),
              correctPrefix: String(savedTicket.storagePath || '').startsWith(
                `${STORAGE_PREFIX}/`,
              ),
              correctFileName: String(savedTicket.storagePath || '').endsWith(
                `_${TICKET_FILE_NAME}`,
              ),
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '圖片票券應寫入 Database Emulator',
      },
    )
    .toEqual({
      type: 'image',
      memo: TICKET_MEMO,
      owner: '所有人',
      hasDownloadUrl: false,
      correctPrefix: true,
      correctFileName: true,
    });

  const storagePath = String(savedTicket?.storagePath || '');
  expect(storagePath).not.toBe('');

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(true);

  const metadata = await readEmulatorStorageObjectMetadata(storagePath);
  expect(metadata?.contentType).toBe('image/png');
  expect(Number(metadata?.size)).toBe(PNG_1X1.byteLength);
  expect(metadata?.metadata?.roomId).toBe(ROOM_ID);
  expect(metadata?.metadata?.ticketId).toBe(savedTicket?.id);

  await page.reload();
  await openTicketPanel(page);
  await expect(ticketCard(page)).toBeVisible();

  await ticketCard(page).getByTestId('ticket-delete-button').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('刪除這張票券？');
  await page.getByTestId('confirm-accept').click();
  await expect(ticketCard(page)).toBeHidden();

  await expect
    .poll(
      async () => {
        return (await readTickets()).some(
          (ticket) => ticket.title === TICKET_TITLE,
        );
      },
      {
        timeout: 15_000,
        message: '刪除後 Database Emulator 不應保留票券紀錄',
      },
    )
    .toBe(false);

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(false);
});

test('PDF 票券會上傳、持久化並從 Database 與 Storage 一併刪除', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openTicketPanel(page);

  await page.getByTestId('add-ticket-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeVisible();

  await page.getByTestId('ticket-title-input').fill(PDF_TICKET_TITLE);
  await page.getByTestId('ticket-more-settings-toggle').click();
  await page.getByTestId('ticket-memo-input').fill(PDF_TICKET_MEMO);
  await page.getByTestId('ticket-file-input').setInputFiles({
    name: PDF_TICKET_FILE_NAME,
    mimeType: 'application/pdf',
    buffer: PDF_TICKET_BYTES,
  });

  await page.getByTestId('ticket-submit-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeHidden({
    timeout: 35_000,
  });

  const pdfCard = ticketCard(page, PDF_TICKET_TITLE);
  await expect(pdfCard).toBeVisible();
  await expect(
    pdfCard.getByRole('button', { name: /開啟 PDF 票券/ }),
  ).toBeVisible();

  let savedTicket: TicketItem | undefined;

  await expect
    .poll(
      async () => {
        savedTicket = (await readTickets()).find(
          (ticket) => ticket.title === PDF_TICKET_TITLE,
        );

        return savedTicket
          ? {
              type: savedTicket.type,
              memo: savedTicket.memo,
              owner: savedTicket.owner,
              hasDownloadUrl: Boolean(savedTicket.url),
              correctPrefix: String(savedTicket.storagePath || '').startsWith(
                `${STORAGE_PREFIX}/`,
              ),
              correctFileName: String(savedTicket.storagePath || '').endsWith(
                `_${PDF_TICKET_FILE_NAME}`,
              ),
            }
          : null;
      },
      {
        timeout: 15_000,
        message: 'PDF 票券應寫入 Database Emulator',
      },
    )
    .toEqual({
      type: 'pdf',
      memo: PDF_TICKET_MEMO,
      owner: '所有人',
      hasDownloadUrl: false,
      correctPrefix: true,
      correctFileName: true,
    });

  const storagePath = String(savedTicket?.storagePath || '');
  expect(storagePath).not.toBe('');

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(true);

  const metadata = await readEmulatorStorageObjectMetadata(storagePath);
  expect(metadata?.contentType).toBe('application/pdf');
  expect(Number(metadata?.size)).toBe(PDF_TICKET_BYTES.byteLength);
  expect(metadata?.metadata?.roomId).toBe(ROOM_ID);
  expect(metadata?.metadata?.ticketId).toBe(savedTicket?.id);

  await page.reload();
  await openTicketPanel(page);

  const reloadedPdfCard = ticketCard(page, PDF_TICKET_TITLE);
  await expect(reloadedPdfCard).toBeVisible();
  await expect(
    reloadedPdfCard.getByRole('button', { name: /開啟 PDF 票券/ }),
  ).toBeVisible();

  // Observe the real object URL without replacing the browser's open behavior.
  await page.evaluate(() => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (object) => {
      const url = create(object);
      document.documentElement.dataset.openedAttachmentUrl = url;
      return url;
    };
  });
  const popupPromise = page.waitForEvent('popup');
  await reloadedPdfCard.getByRole('button', { name: /開啟 PDF 票券/ }).click();
  const popup = await popupPromise;
  await expect(page.locator('html')).toHaveAttribute('data-opened-attachment-url', /^blob:/);
  const opened = await page.evaluate(async () => {
    const url = document.documentElement.dataset.openedAttachmentUrl!;
    const response = await fetch(url);
    return {
      contentType: response.headers.get('content-type'),
      bytes: Array.from(new Uint8Array(await response.arrayBuffer())),
    };
  });
  expect(opened.contentType).toBe('application/pdf');
  expect(opened.bytes).toEqual(Array.from(PDF_TICKET_BYTES));
  await popup.close();

  await reloadedPdfCard.getByTestId('ticket-delete-button').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('刪除這張票券？');
  await page.getByTestId('confirm-accept').click();
  await expect(reloadedPdfCard).toBeHidden();

  await expect
    .poll(
      async () => {
        return (await readTickets()).some(
          (ticket) => ticket.title === PDF_TICKET_TITLE,
        );
      },
      {
        timeout: 15_000,
        message: '刪除後 Database Emulator 不應保留 PDF 票券紀錄',
      },
    )
    .toBe(false);

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(false);
});
