import { expect, test, type Page } from '@playwright/test';

import {
  assertNoExampleCloudArtifacts,
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const ROOM_ID = 'e2esettlementroom0001';

type TransferRecord = {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'paid';
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

async function openSettlement(page: Page): Promise<void> {
  await page.locator('[data-testid="expense-tab-button"]:visible').click();
  await page.getByTestId('expense-settlement-view-button').click();
}

async function seedReturningEmptyLobby(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    localStorage.setItem('google-travel-my-trips', '[]');
  });
}

async function openExample(page: Page): Promise<void> {
  await page.getByTestId('demo-trip-entry-card')
    .getByTestId('example-trip-card-title')
    .click();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute('data-trip-source', 'example');
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
});

test('regular trip persists mark and cancel settlement status in the Emulator', async ({ page }) => {
  await seedTestTrip(ROOM_ID, {
    title: 'E2E settlement',
    members: ['王小明', '陳小華'],
    expenses: [{
      id: 'expense-1',
      dayId: 'Day 1',
      item: '住宿',
      cost: 2500,
      localCost: 2500,
      currency: 'TWD',
      exchangeRate: 1,
      category: 'stay',
      payer: '陳小華',
      split: { 王小明: 1250, 陳小華: 1250 },
    }],
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await openSettlement(page);
  const pending = page.getByTestId('pending-settlement-transfer');
  await expect(pending).toContainText('王小明 → 陳小華');
  await expect(pending).toContainText('NT$1,250');
  await page.getByTestId('mark-settlement-paid').click();
  await expect(page.getByTestId('completed-settlement-transfer')).toContainText('已轉帳');

  await expect.poll(async () => {
    const value = await readEmulatorData<TransferRecord[] | Record<string, TransferRecord>>(
      `rooms/${ROOM_ID}/settlements`,
    );
    return toList(value)[0];
  }).toMatchObject({
    fromParticipantId: '王小明',
    toParticipantId: '陳小華',
    amount: 1250,
    currency: 'TWD',
    status: 'paid',
  });
  const savedValue = await readEmulatorData<TransferRecord[] | Record<string, TransferRecord>>(
    `rooms/${ROOM_ID}/settlements`,
  );
  const savedRecord = toList(savedValue)[0];
  if (!savedRecord) throw new Error('Settlement transfer record was not persisted.');
  expect(savedRecord.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(savedRecord.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(savedRecord.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  await page.reload();
  await openSettlement(page);
  await expect(page.getByTestId('completed-settlement-transfer')).toContainText('已轉帳');
  await page.getByTestId('cancel-settlement-paid').click();
  await expect(page.getByTestId('pending-settlement-transfer')).toBeVisible();

  await expect.poll(async () => {
    const value = await readEmulatorData<TransferRecord[] | Record<string, TransferRecord>>(
      `rooms/${ROOM_ID}/settlements`,
    );
    const record = toList(value)[0];
    return record
      ? { status: record.status, paidAt: record.paidAt ?? null }
      : null;
  }).toMatchObject({
    status: 'pending',
    paidAt: null,
  });
});

test('example trip keeps settlement status in IndexedDB with zero Firebase writes', async ({ page }) => {
  await seedReturningEmptyLobby(page);
  await page.goto('/');
  await openExample(page);
  await openSettlement(page);

  const pending = page.getByTestId('pending-settlement-transfer').first();
  await expect(pending).toBeVisible();
  await pending.getByTestId('mark-settlement-paid').click();
  const completed = page.getByTestId('completed-settlement-transfer').first();
  await expect(completed).toContainText('已轉帳');
  const completedPair = await completed.locator('p').nth(0).textContent();
  const completedAmount = await completed.locator('p').nth(1).textContent();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await openExample(page);
  await openSettlement(page);
  const reloadedCompleted = page.getByTestId('completed-settlement-transfer').first();
  await expect(reloadedCompleted).toContainText(completedPair || '');
  await expect(reloadedCompleted).toContainText(completedAmount || '');
  await expect(reloadedCompleted).toContainText('已轉帳');

  expect(await readEmulatorData('rooms')).toBeNull();
  await assertNoExampleCloudArtifacts();
  expect(await page.evaluate(() => localStorage.getItem('google-travel-my-trips'))).toBe('[]');
  expect(await page.evaluate(() => (
    localStorage.getItem('google-travel-offline-trip-cache-v1') || ''
  ).includes('local-example-trip'))).toBe(false);
});
