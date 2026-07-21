import { expect, test, type Page, type Route } from '@playwright/test';

import {
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  storageObjectExists,
} from './support/emulator';
import {
  PDF_BYTES,
  PNG_1X1,
  createAttachmentTicket,
  createExternalTicket,
  createWebTicket,
  markReleaseSeen,
  openEditTicket,
  openTicketPanel,
  prepareTicketRoom,
  readTicket,
  readTickets,
  storageObjectPath,
  submitTicket,
  ticketCard,
} from './support/tickets';

const ROOM_ID = 'e2eticketeditlifecycle01';
const STORAGE_PREFIX = `rooms/${ROOM_ID}/tickets`;

async function editToExternal(
  page: Page,
  currentTitle: string,
  nextTitle: string,
  appName = 'Lifecycle App',
): Promise<void> {
  await openEditTicket(page, currentTitle);
  await page.getByTestId('ticket-type-external-app').click();
  await page.getByTestId('ticket-title-input').fill(nextTitle);
  await page.getByTestId('ticket-app-name-input').fill(appName);
  await page.getByTestId('ticket-app-url-input')
    .fill('https://lifecycle.example.test/app-ticket');
  await page.getByTestId('ticket-more-settings-toggle').click();
  await page.getByTestId('ticket-fallback-url-input')
    .fill('https://lifecycle.example.test/fallback');
  await submitTicket(page);
}

async function editToWeb(
  page: Page,
  currentTitle: string,
  nextTitle: string,
): Promise<void> {
  await openEditTicket(page, currentTitle);
  await page.getByTestId('ticket-type-web-link').click();
  await page.getByTestId('ticket-title-input').fill(nextTitle);
  await page.getByTestId('ticket-url-input').fill('lifecycle.example.test/web-ticket');
  await submitTicket(page);
}

async function editToAttachment(
  page: Page,
  currentTitle: string,
  nextTitle: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await openEditTicket(page, currentTitle);
  await page.getByTestId('ticket-type-attachment').click();
  await page.getByTestId('ticket-title-input').fill(nextTitle);
  await page.getByTestId('ticket-file-input').setInputFiles(file);
  await submitTicket(page);
}

async function replaceAttachment(
  page: Page,
  currentTitle: string,
  nextTitle: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await openEditTicket(page, currentTitle);
  await page.getByTestId('ticket-title-input').fill(nextTitle);
  await page.getByTestId('ticket-file-input').setInputFiles(file);
  await submitTicket(page);
}

async function failStorageUploadFor(page: Page, fileName: string): Promise<void> {
  await page.route('http://127.0.0.1:9199/**', async (route: Route) => {
    const request = route.request();
    const protocol = String(request.headers()['x-goog-upload-protocol'] || '').toLowerCase();
    const shouldFail = request.method() === 'POST'
      && ['multipart', 'resumable'].includes(protocol)
      && storageObjectPath(request.url()).endsWith(`_${fileName}`);
    if (!shouldFail) return await route.continue();
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 403, message: 'forced upload failure' } }),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await prepareTicketRoom(ROOM_ID);
  await markReleaseSeen(page);
});

test('converts web-link to external-app and back without changing ticket ID', async ({
  page,
}) => {
  await openTicketPanel(page, ROOM_ID);
  await createWebTicket(page, {
    title: 'Lifecycle web ticket',
    url: 'lifecycle.example.test/original',
  });
  const original = await readTicket(ROOM_ID, 'Lifecycle web ticket');

  await editToExternal(
    page,
    'Lifecycle web ticket',
    'Lifecycle external ticket',
  );
  const external = await readTicket(ROOM_ID, 'Lifecycle external ticket');
  expect(external).toMatchObject({
    id: original.id,
    ticketType: 'external-app',
    url: '',
    appUrl: 'https://lifecycle.example.test/app-ticket',
    fallbackUrl: 'https://lifecycle.example.test/fallback',
    storagePath: '',
  });
  expect(await listEmulatorStorageObjects(STORAGE_PREFIX)).toEqual([]);
  await expect(ticketCard(page, 'Lifecycle external ticket')
    .getByRole('link', { name: '在 App 中開啟票券' })).toBeVisible();

  await editToWeb(page, 'Lifecycle external ticket', 'Lifecycle web again');
  const webAgain = await readTicket(ROOM_ID, 'Lifecycle web again');
  expect(webAgain).toMatchObject({
    id: original.id,
    ticketType: 'web-link',
    url: 'https://lifecycle.example.test/web-ticket',
    appName: '',
    appUrl: '',
    fallbackUrl: '',
    orderNumber: '',
    instructions: '',
  });
  const card = ticketCard(page, 'Lifecycle web again');
  await expect(card.getByRole('link', { name: '開啟票券網站' })).toBeVisible();
  await expect(card.getByRole('link', { name: '在 App 中開啟票券' })).toHaveCount(0);
  expect((await readTickets(ROOM_ID)).filter((ticket) => ticket.id === original.id))
    .toHaveLength(1);
});

test('converts external-app to attachment then removes its object after Database update', async ({
  page,
}) => {
  await openTicketPanel(page, ROOM_ID);
  await createExternalTicket(page, {
    title: 'External before attachment',
    appName: 'Attachment Source App',
  });
  const original = await readTicket(ROOM_ID, 'External before attachment');
  await editToAttachment(page, 'External before attachment', 'External became image', {
    name: 'external-to-image.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const attachment = await readTicket(ROOM_ID, 'External became image');
  expect(attachment).toMatchObject({
    id: original.id,
    ticketType: 'attachment',
    attachmentKind: 'image',
    appName: '',
    appUrl: '',
    fallbackUrl: '',
  });
  expect(String(attachment.storagePath)).toMatch(
    new RegExp(`^${STORAGE_PREFIX}/${original.id}/[^/]+_external-to-image\\.png$`),
  );
  await expect(ticketCard(page, 'External became image')
    .getByRole('button', { name: '全螢幕查看票券' })).toBeVisible();
  expect(await storageObjectExists(String(attachment.storagePath))).toBe(true);

  let recordAtDelete: Record<string, unknown> | undefined;
  await page.route('http://127.0.0.1:9199/**', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE'
      && storageObjectPath(request.url()) === attachment.storagePath) {
      recordAtDelete = await readTicket(ROOM_ID, 'Image became external');
    }
    await route.continue();
  });
  await editToExternal(page, 'External became image', 'Image became external');
  expect(recordAtDelete).toMatchObject({
    id: original.id,
    ticketType: 'external-app',
    storagePath: '',
  });
  expect(await storageObjectExists(String(attachment.storagePath))).toBe(false);
  await expect(ticketCard(page, 'Image became external')
    .getByRole('link', { name: '在 App 中開啟票券' })).toBeVisible();
});

test('converts an attachment to web-link and deletes the old object after persistence', async ({
  page,
}) => {
  await openTicketPanel(page, ROOM_ID);
  await createAttachmentTicket(page, {
    title: 'Attachment before web',
    name: 'attachment-before-web.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const attachment = await readTicket(ROOM_ID, 'Attachment before web');
  let recordAtDelete: Record<string, unknown> | undefined;
  await page.route('http://127.0.0.1:9199/**', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE'
      && storageObjectPath(request.url()) === attachment.storagePath) {
      recordAtDelete = await readTicket(ROOM_ID, 'Attachment became web');
    }
    await route.continue();
  });

  await editToWeb(page, 'Attachment before web', 'Attachment became web');
  expect(recordAtDelete).toMatchObject({
    id: attachment.id,
    ticketType: 'web-link',
    storagePath: '',
    attachmentKind: '',
  });
  expect(await storageObjectExists(String(attachment.storagePath))).toBe(false);
  await expect(ticketCard(page, 'Attachment became web')
    .getByRole('link', { name: '開啟票券網站' })).toHaveAttribute(
      'href',
      'https://lifecycle.example.test/web-ticket',
    );
});

test('keeps an attachment when editing metadata and replaces it with a new revision', async ({
  page,
}) => {
  await openTicketPanel(page, ROOM_ID);
  await createAttachmentTicket(page, {
    title: 'Keep and replace image A',
    name: 'keep-image-a.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
    memo: 'Original attachment note',
  });
  const original = await readTicket(ROOM_ID, 'Keep and replace image A');

  await openEditTicket(page, 'Keep and replace image A');
  await expect(page.getByTestId('ticket-file-status')).toContainText('目前保留原附件');
  await page.getByTestId('ticket-title-input').fill('Kept attachment metadata');
  await page.getByTestId('ticket-more-settings-toggle').click();
  await page.getByTestId('ticket-memo-input').fill('Updated attachment note');
  await submitTicket(page);
  const kept = await readTicket(ROOM_ID, 'Kept attachment metadata');
  expect(kept.storagePath).toBe(original.storagePath);
  expect(kept.createdAt).toBe(original.createdAt);
  expect(Number(kept.updatedAt)).toBeGreaterThan(Number(original.updatedAt));
  expect(await storageObjectExists(String(original.storagePath))).toBe(true);

  let recordAtDelete: Record<string, unknown> | undefined;
  await page.route('http://127.0.0.1:9199/**', async (route) => {
    const request = route.request();
    if (request.method() === 'DELETE'
      && storageObjectPath(request.url()) === original.storagePath) {
      recordAtDelete = await readTicket(ROOM_ID, 'Replacement image B');
    }
    await route.continue();
  });
  await replaceAttachment(page, 'Kept attachment metadata', 'Replacement image B', {
    name: 'replacement-image-b.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([PNG_1X1, Buffer.from('revision-b')]),
  });
  const replaced = await readTicket(ROOM_ID, 'Replacement image B');
  expect(replaced.storagePath).not.toBe(original.storagePath);
  expect(String(replaced.storagePath).split('/').at(-1))
    .toMatch(/^[a-z\d_-]+_replacement-image-b\.png$/i);
  expect(recordAtDelete).toMatchObject({ storagePath: replaced.storagePath });
  expect(await storageObjectExists(String(replaced.storagePath))).toBe(true);
  expect(await storageObjectExists(String(original.storagePath))).toBe(false);
  await page.reload();
  await openTicketPanel(page, ROOM_ID);
  await expect(ticketCard(page, 'Replacement image B')).toBeVisible();
});

test('replaces image with PDF and preserves the old record when a later upload fails', async ({
  page,
}) => {
  await openTicketPanel(page, ROOM_ID);
  await createAttachmentTicket(page, {
    title: 'Image before PDF',
    name: 'image-before-pdf.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const image = await readTicket(ROOM_ID, 'Image before PDF');
  await replaceAttachment(page, 'Image before PDF', 'PDF replacement', {
    name: 'replacement-ticket.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BYTES,
  });
  const pdf = await readTicket(ROOM_ID, 'PDF replacement');
  expect(pdf).toMatchObject({ attachmentKind: 'pdf', type: 'pdf' });
  expect(await storageObjectExists(String(image.storagePath))).toBe(false);
  expect(await storageObjectExists(String(pdf.storagePath))).toBe(true);
  const pdfCard = ticketCard(page, 'PDF replacement');
  await expect(pdfCard.getByRole('link', { name: '開啟 PDF 票券' }))
    .toHaveAttribute('rel', /noopener.*noreferrer|noreferrer.*noopener/);
  await expect(pdfCard.getByRole('button', { name: '全螢幕查看票券' })).toHaveCount(0);

  const objectsBeforeFailure = await listEmulatorStorageObjects(STORAGE_PREFIX);
  await failStorageUploadFor(page, 'forced-failure.png');
  await openEditTicket(page, 'PDF replacement');
  await page.getByTestId('ticket-title-input').fill('Must not be persisted');
  await page.getByTestId('ticket-file-input').setInputFiles({
    name: 'forced-failure.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.getByTestId('ticket-submit-button').click();
  await expect(page.getByTestId('toast').filter({ hasText: '附件上傳失敗' }))
    .toBeVisible();
  await expect(page.getByTestId('ticket-editor-modal')).toBeVisible();
  await expect(page.getByTestId('ticket-submit-button')).toBeEnabled();
  expect(await readTicket(ROOM_ID, 'PDF replacement')).toEqual(pdf);
  expect(await storageObjectExists(String(pdf.storagePath))).toBe(true);
  expect(await listEmulatorStorageObjects(STORAGE_PREFIX)).toEqual(objectsBeforeFailure);
});

test('treats old-object cleanup failure as a saved replacement warning', async ({
  page,
}) => {
  await openTicketPanel(page, ROOM_ID);
  await createAttachmentTicket(page, {
    title: 'Cleanup failure old image',
    name: 'cleanup-old.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  const oldTicket = await readTicket(ROOM_ID, 'Cleanup failure old image');
  const cleanupRoute = async (route: Route) => {
    const request = route.request();
    if (request.method() === 'DELETE'
      && storageObjectPath(request.url()) === oldTicket.storagePath) {
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 403, message: 'forced cleanup failure' } }),
      });
      return;
    }
    await route.continue();
  };
  await page.route('http://127.0.0.1:9199/**', cleanupRoute);

  await replaceAttachment(page, 'Cleanup failure old image', 'Cleanup failure new image', {
    name: 'cleanup-new.png',
    mimeType: 'image/png',
    buffer: Buffer.concat([PNG_1X1, Buffer.from('new-object')]),
  });
  const replacement = await readTicket(ROOM_ID, 'Cleanup failure new image');
  expect(replacement.storagePath).not.toBe(oldTicket.storagePath);
  expect(await storageObjectExists(String(replacement.storagePath))).toBe(true);
  expect(await storageObjectExists(String(oldTicket.storagePath))).toBe(true);
  await expect(ticketCard(page, 'Cleanup failure new image')).toBeVisible();
  await expect(page.getByTestId('sync-status-indicator')).toContainText('已同步');
  const warning = page.getByTestId('toast').filter({ hasText: '票券已儲存' });
  await expect(warning).toBeVisible();
  await expect(warning).toContainText('舊附件暫時無法清除');
  await expect(page.getByTestId('ticket-editor-modal')).toBeHidden();
  expect((await readTickets(ROOM_ID)).filter((ticket) => ticket.id === oldTicket.id))
    .toHaveLength(1);

  await page.unroute('http://127.0.0.1:9199/**', cleanupRoute);
  await clearEmulatorStorage(STORAGE_PREFIX);
  expect(await listEmulatorStorageObjects(STORAGE_PREFIX)).toEqual([]);
});
