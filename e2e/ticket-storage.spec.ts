import { expect, test, type Page } from '@playwright/test';

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
const TICKET_TITLE = 'E2E 圖片票券';
const TICKET_FILE_NAME = 'phase-4-ticket.png';
const TICKET_MEMO = 'Phase 4 圖片上傳與刪除測試';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
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

function ticketCard(page: Page) {
  return page
    .getByTestId('ticket-card')
    .filter({ hasText: TICKET_TITLE })
    .first();
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await clearEmulatorStorage(STORAGE_PREFIX);
  await seedTestTrip(ROOM_ID, {
    title: 'E2E 票券 Storage 測試旅程',
    members: ['自己', '朋友'],
  });
});

test.afterEach(async () => {
  await clearEmulatorStorage(STORAGE_PREFIX);
});

test('圖片票券會上傳、持久化並從 Database 與 Storage 一併刪除', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openTicketPanel(page);

  await page.getByTestId('add-ticket-button').click();
  await expect(page.getByTestId('ticket-modal')).toBeVisible();

  await page.getByTestId('ticket-title-input').fill(TICKET_TITLE);
  await page.getByTestId('ticket-memo-input').fill(TICKET_MEMO);
  await page.getByTestId('ticket-file-input').setInputFiles({
    name: TICKET_FILE_NAME,
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });

  await page.getByTestId('ticket-save-button').click();
  await expect(page.getByTestId('ticket-modal')).toBeHidden({
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
                `/${TICKET_FILE_NAME}`,
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
      hasDownloadUrl: true,
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

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm');
    await dialog.accept();
  });
  await ticketCard(page).getByTestId('ticket-delete-button').click();
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
