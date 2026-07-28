import { expect, test, type Page } from '@playwright/test';

import {
  assertNoExampleCloudArtifacts,
  clearEmulatorDatabase,
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  readEmulatorData,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const IMAGE_TITLE = '本機圖片票券';
const PDF_TITLE = '本機 PDF 票券';
const EXPENSE_TITLE = '本機晚餐';
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
const PDF_BYTES = Buffer.from(
  'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZz4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4KJSVFT0Y=',
  'base64',
);

async function seedReturningEmptyLobby(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    localStorage.setItem('google-travel-my-trips', '[]');
  });
}

async function openExample(page: Page): Promise<void> {
  await expect(page.getByTestId('demo-trip-entry-card')).toBeVisible();
  await page
    .getByTestId('demo-trip-entry-card')
    .getByTestId('example-trip-card-title')
    .click();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-trip-source',
    'example',
  );
}

async function reopenAfterReload(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' });
  await openExample(page);
}

async function openTicketPanel(page: Page): Promise<void> {
  await page.locator('[data-testid="ticket-tab-button"]:visible').click();
  await expect(page.getByTestId('ticket-panel')).toBeVisible();
}

async function addAttachment(
  page: Page,
  title: string,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  await page.getByTestId('add-ticket-button').click();
  await page.getByTestId('ticket-title-input').fill(title);
  await page.getByTestId('ticket-file-input').setInputFiles(file);
  await page.getByTestId('ticket-submit-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeHidden();
  await expect(
    page.getByTestId('ticket-card').filter({ hasText: title }).first(),
  ).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await clearEmulatorStorage();
  await seedReturningEmptyLobby(page);
});

test('local example persists itinerary and expense edits with zero cloud writes', async ({ page }) => {
  await page.goto('/');
  await openExample(page);

  await expect.poll(() => page.evaluate(() => typeof (
    window as Window & {
      __TRAVEL_E2E__?: { addTestPlace?: () => void };
    }
  ).__TRAVEL_E2E__?.addTestPlace)).toBe('function');
  await page.evaluate(() => (
    window as Window & {
      __TRAVEL_E2E__?: { addTestPlace?: () => void };
    }
  ).__TRAVEL_E2E__?.addTestPlace?.());
  await expect(page.getByTestId('place-card').filter({ hasText: 'E2E 測試餐廳' })).toBeVisible();

  await page.locator('[data-testid="expense-tab-button"]:visible').click();
  await page.getByTestId('add-expense-button').click();
  await page.getByTestId('expense-item-input').fill(EXPENSE_TITLE);
  await page.getByTestId('expense-local-cost-input').fill('900');
  await page.getByTestId('expense-save-button').click();
  await expect(page.getByTestId('expense-record').filter({ hasText: EXPENSE_TITLE })).toBeVisible();

  await reopenAfterReload(page);
  await expect(page.getByTestId('place-card').filter({ hasText: 'E2E 測試餐廳' })).toBeVisible();
  await page.locator('[data-testid="expense-tab-button"]:visible').click();
  await expect(page.getByTestId('expense-record').filter({ hasText: EXPENSE_TITLE })).toBeVisible();

  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  await assertNoExampleCloudArtifacts();
  expect(await page.evaluate(() => localStorage.getItem('google-travel-my-trips'))).toBe('[]');
  expect(await page.evaluate(() => (
    localStorage.getItem('google-travel-offline-trip-cache-v1') || ''
  ).includes('local-example-trip'))).toBe(false);
});

test('local image and PDF attachments survive reload and reset stays isolated', async ({ page }) => {
  await page.goto('/');
  await openExample(page);
  await openTicketPanel(page);

  await addAttachment(page, IMAGE_TITLE, {
    name: 'local-image.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await addAttachment(page, PDF_TITLE, {
    name: 'local-ticket.pdf',
    mimeType: 'application/pdf',
    buffer: PDF_BYTES,
  });

  await reopenAfterReload(page);
  await openTicketPanel(page);
  await expect(page.getByTestId('ticket-card').filter({ hasText: IMAGE_TITLE })).toBeVisible();
  await expect(page.getByTestId('ticket-card').filter({ hasText: PDF_TITLE })).toBeVisible();

  await page.getByTestId('back-to-lobby').click();
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('確定要清除目前修改，並恢復原始內容嗎？');
    await dialog.accept();
  });
  await page.getByRole('button', { name: '恢復原始內容' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: '已恢復原始內容' })).toBeVisible();
  await openExample(page);
  await openTicketPanel(page);
  await expect(page.getByTestId('ticket-card').filter({ hasText: IMAGE_TITLE })).toHaveCount(0);
  await expect(page.getByTestId('ticket-card').filter({ hasText: PDF_TITLE })).toHaveCount(0);

  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  await assertNoExampleCloudArtifacts();
  expect(await page.evaluate(() => localStorage.getItem('google-travel-my-trips'))).toBe('[]');
});

test('cloud-only collaboration keeps its position and explains availability', async ({ page }) => {
  await page.goto('/');
  await openExample(page);

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toBe('建立自己的旅程後即可使用此功能');
    await dialog.accept();
  });
  let collaborationControl = page.getByRole('button', { name: /共編/ });
  if (await collaborationControl.count() === 0) {
    await page.getByTestId('mobile-trip-tools-trigger').click();
    collaborationControl = page.getByRole('menuitem', { name: /共編/ });
  }
  await collaborationControl.click();

  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  await assertNoExampleCloudArtifacts();
});
