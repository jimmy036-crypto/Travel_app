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
const COMPANION_KEY = `travel-companion-v1:${JSON.stringify(['example', '', 'local-example-trip'])}`;
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

async function readExampleExpenses(page: Page): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('travel-app-local-example-trip');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const record = await new Promise<{
        snapshot: { expenses: Array<Record<string, unknown>> };
      }>((resolve, reject) => {
        const request = database.transaction('tripRecords', 'readonly')
          .objectStore('tripRecords').get('local-example-trip');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return record.snapshot.expenses;
    } finally {
      database.close();
    }
  });
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
  const expensesBefore = await readExampleExpenses(page);
  expect(await page.evaluate(key => localStorage.getItem(key), COMPANION_KEY)).toBeNull();
  await page.getByTestId('add-expense-button').click();
  const payer = page.getByTestId('expense-payer-select');
  await expect(payer).toHaveValue('');
  await page.getByTestId('expense-item-input').fill(EXPENSE_TITLE);
  await page.getByTestId('expense-local-cost-input').fill('900');

  // An unconfirmed companion no longer defaults to the first payer. Rejection
  // must preserve every existing expense, not merely hide a success message.
  await Promise.all([
    page.waitForEvent('dialog').then(async dialog => {
      expect(dialog.message()).toBe('請選擇付款人。');
      await dialog.accept();
    }),
    page.getByTestId('expense-save-button').click(),
  ]);
  await expect(page.getByTestId('expense-modal')).toBeVisible();
  await expect(page.getByTestId('expense-record').filter({ hasText: EXPENSE_TITLE })).toHaveCount(0);
  expect(await readExampleExpenses(page)).toEqual(expensesBefore);

  // Explicitly keep the original fixture's payer and exact monetary inputs.
  // Selecting this expense's payer must not confirm the shared companion.
  await payer.selectOption('自己');
  await page.getByTestId('expense-save-button').click();
  await expect(page.getByTestId('expense-record').filter({ hasText: EXPENSE_TITLE })).toBeVisible();
  const expensesAfter = await readExampleExpenses(page);
  const added = expensesAfter.filter(expense => expense.item === EXPENSE_TITLE);
  expect(expensesAfter).toHaveLength(expensesBefore.length + 1);
  expect(added).toHaveLength(1);
  expect(added[0]).toMatchObject({
    payer: '自己',
    cost: 900,
    localCost: 900,
    currency: 'TWD',
    exchangeRate: 1,
  });
  expect(added[0].split).toEqual({ 自己: 300, '旅伴 A': 300, '旅伴 B': 300 });
  expect(expensesAfter.filter(expense => expense.id !== added[0].id)).toEqual(expensesBefore);
  expect(await page.evaluate(key => localStorage.getItem(key), COMPANION_KEY)).toBeNull();

  // Also check the current in-memory preference, before a reload could hide
  // an accidental session-only confirmation caused by manual payer selection.
  await page.getByTestId('add-expense-button').click();
  await expect(payer).toHaveValue('');
  await page.getByTestId('expense-close-button').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden();
  expect(await readExampleExpenses(page)).toEqual(expensesAfter);

  await reopenAfterReload(page);
  await expect(page.getByTestId('place-card').filter({ hasText: 'E2E 測試餐廳' })).toBeVisible();
  await page.locator('[data-testid="expense-tab-button"]:visible').click();
  await expect(page.getByTestId('expense-record').filter({ hasText: EXPENSE_TITLE })).toBeVisible();
  expect(await readExampleExpenses(page)).toEqual(expensesAfter);
  expect(await page.evaluate(key => localStorage.getItem(key), COMPANION_KEY)).toBeNull();

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
    await page.getByTestId('app-settings-trigger').click();
    collaborationControl = page.getByTestId('app-settings-trip-share');
  }
  await collaborationControl.click();

  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  await assertNoExampleCloudArtifacts();
});

test('example can be removed, stays hidden after reload, and is restored from Settings', async ({ page }) => {
  await page.goto('/');
  const card = page.getByTestId('demo-trip-entry-card');
  await expect(card).toBeVisible();
  await card.getByTestId('remove-example-trip').click();

  const confirmDialog = page.getByTestId('confirm-dialog');
  await expect(confirmDialog).toContainText('從這台裝置的大廳移除示範旅程？');
  await expect(confirmDialog).toContainText('正式旅程不受影響');
  await confirmDialog.getByTestId('confirm-accept').click();
  await expect(card).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('demo-trip-entry-card')).toHaveCount(0);
  const settingsTrigger = page.getByTestId('app-settings-trigger');
  await settingsTrigger.click();
  const restore = page.getByTestId('app-settings-demo-trip');
  await expect(restore).toHaveText('恢復示範旅程');
  await restore.click();
  await expect(page.getByTestId('demo-trip-entry-card')).toBeVisible();
  await expect(settingsTrigger).toBeFocused();

  expect(await readEmulatorData('rooms')).toBeNull();
  expect(await listEmulatorStorageObjects()).toEqual([]);
  await assertNoExampleCloudArtifacts();
  expect(await page.evaluate(() => localStorage.getItem('google-travel-my-trips'))).toBe('[]');
});
