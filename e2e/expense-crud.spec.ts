import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2eexpensecrudroom0001';
const MEMBERS = ['自己', '朋友'];

type ExpenseItem = {
  id?: string;
  dayId?: string;
  item?: string;
  cost?: number;
  localCost?: number;
  currency?: string;
  exchangeRate?: number;
  category?: string;
  payer?: string;
  split?: Record<string, number>;
  note?: string;
  createdAt?: number;
  updatedAt?: number;
};

function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

async function readExpenses(): Promise<ExpenseItem[]> {
  const value = await readEmulatorData<
    ExpenseItem[] | Record<string, ExpenseItem>
  >(`rooms/${ROOM_ID}/expenses`);

  return toList(value);
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

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E 記帳測試旅程',
    members: MEMBERS,
    memberBudgets: {
      自己: 10000,
      朋友: 10000,
    },
  });
});

test('新增平均分帳後會更新統計並保存到 Firebase Emulator', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);
  await openNewExpenseModal(page);

  await page.getByTestId('expense-item-input').fill('E2E 晚餐');
  await page.getByTestId('expense-local-cost-input').fill('1000');
  await page.getByTestId('expense-note-input').fill('兩人平均分帳');

  await expect(page.getByTestId('expense-twd-total')).toContainText('1,000');
  await expect(
    page.locator(
      '[data-testid="expense-involved-member"][data-member="自己"]',
    ),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    page.locator(
      '[data-testid="expense-involved-member"][data-member="朋友"]',
    ),
  ).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('expense-save-button').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden();

  const record = expenseRecord(page, 'E2E 晚餐');
  await expect(record).toBeVisible();
  await expect(record.getByTestId('expense-record-cost')).toHaveText(
    /^NT\$\s*1,000$/,
  );
  await expect(page.getByTestId('expense-total')).toContainText('1,000');

  await expect(
    page.locator('[data-testid="member-spent"][data-member="自己"]'),
  ).toContainText('500');
  await expect(
    page.locator('[data-testid="member-spent"][data-member="朋友"]'),
  ).toContainText('500');

  await expect
    .poll(
      async () => {
        const expenses = await readExpenses();
        const expense = expenses.find((item) => item.item === 'E2E 晚餐');

        return expense
          ? {
              cost: expense.cost,
              payer: expense.payer,
              self: expense.split?.自己,
              friend: expense.split?.朋友,
              note: expense.note,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '平均分帳應寫入 Database Emulator',
      },
    )
    .toEqual({
      cost: 1000,
      payer: '自己',
      self: 500,
      friend: 500,
      note: '兩人平均分帳',
    });

  await page.reload();
  await openExpenseTab(page);

  await expect(expenseRecord(page, 'E2E 晚餐')).toBeVisible();
  await expect(page.getByTestId('expense-total')).toContainText('1,000');
});

test('編輯幣別、金額與代墊人後會重新計算分帳', async ({ page }) => {
  const now = Date.now();

  await seedTestTrip(ROOM_ID, {
    title: 'E2E 記帳編輯測試',
    members: MEMBERS,
    memberBudgets: {
      自己: 10000,
      朋友: 10000,
    },
    expenses: [
      {
        id: 'expense-edit-1',
        dayId: 'Day 1',
        item: 'E2E 原始住宿',
        cost: 1000,
        localCost: 1000,
        currency: 'TWD',
        exchangeRate: 1,
        category: 'food',
        payer: '自己',
        split: {
          自己: 500,
          朋友: 500,
        },
        note: '原始帳目',
        createdAt: now - 1000,
        updatedAt: now - 1000,
      },
    ],
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);

  await expenseRecord(page, 'E2E 原始住宿').click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );

  await page.getByTestId('expense-item-input').fill('E2E 日本住宿');
  await page.getByTestId('expense-currency-select').selectOption('JPY');
  await page.getByTestId('expense-local-cost-input').fill('2000');
  await page.getByTestId('expense-payer-select').selectOption('朋友');
  await page.getByTestId('expense-note-input').fill('改為日幣並由朋友代墊');

  await expect(page.getByTestId('expense-rate-input')).toHaveValue('0.21');
  await expect(page.getByTestId('expense-twd-total')).toContainText('420');

  await page.getByTestId('expense-save-button').click();

  const editedRecord = expenseRecord(page, 'E2E 日本住宿');
  await expect(editedRecord).toBeVisible();
  await expect(editedRecord).toContainText('朋友');
  await expect(editedRecord.getByTestId('expense-record-cost')).toHaveText(
    /^NT\$\s*420$/,
  );
  await expect(page.getByTestId('expense-total')).toContainText('420');

  await expect(
    page.locator('[data-testid="member-spent"][data-member="自己"]'),
  ).toContainText('210');
  await expect(
    page.locator('[data-testid="member-spent"][data-member="朋友"]'),
  ).toContainText('210');

  await expect
    .poll(
      async () => {
        const [expense] = await readExpenses();

        return expense
          ? {
              id: expense.id,
              item: expense.item,
              cost: expense.cost,
              localCost: expense.localCost,
              currency: expense.currency,
              rate: expense.exchangeRate,
              payer: expense.payer,
              self: expense.split?.自己,
              friend: expense.split?.朋友,
              note: expense.note,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '編輯後的帳目應重新計算並寫入 Emulator',
      },
    )
    .toEqual({
      id: 'expense-edit-1',
      item: 'E2E 日本住宿',
      cost: 420,
      localCost: 2000,
      currency: 'JPY',
      rate: 0.21,
      payer: '朋友',
      self: 210,
      friend: 210,
      note: '改為日幣並由朋友代墊',
    });

  await page.reload();
  await openExpenseTab(page);

  await expect(expenseRecord(page, 'E2E 日本住宿')).toBeVisible();
  await expect(page.getByTestId('expense-total')).toContainText('420');
});

test('自訂分帳會維持金額守恆並在重新整理後保留', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);
  await openNewExpenseModal(page);

  await page.getByTestId('expense-item-input').fill('E2E 自訂分帳車資');
  await page.getByTestId('expense-local-cost-input').fill('1000');
  await page.getByTestId('expense-split-custom-button').click();

  await page
    .locator(
      '[data-testid="expense-custom-amount-input"][data-member="自己"]',
    )
    .fill('700');
  await page
    .locator(
      '[data-testid="expense-custom-amount-input"][data-member="朋友"]',
    )
    .fill('300');

  await expect(page.getByTestId('expense-custom-total')).toContainText(
    '1,000 / 1,000',
  );

  await page.getByTestId('expense-save-button').click();

  await expect(expenseRecord(page, 'E2E 自訂分帳車資')).toBeVisible();

  await expect(
    page.locator('[data-testid="member-spent"][data-member="自己"]'),
  ).toContainText('700');
  await expect(
    page.locator('[data-testid="member-spent"][data-member="朋友"]'),
  ).toContainText('300');

  await expect
    .poll(
      async () => {
        const [expense] = await readExpenses();

        return expense
          ? {
              cost: expense.cost,
              self: expense.split?.自己,
              friend: expense.split?.朋友,
              splitTotal:
                Number(expense.split?.自己 || 0) +
                Number(expense.split?.朋友 || 0),
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '自訂分帳應完整寫入 Emulator 且總額守恆',
      },
    )
    .toEqual({
      cost: 1000,
      self: 700,
      friend: 300,
      splitTotal: 1000,
    });

  await page.reload();
  await openExpenseTab(page);

  const record = expenseRecord(page, 'E2E 自訂分帳車資');
  await expect(record).toBeVisible();
  await record.click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );
  await expect(
    page.locator(
      '[data-testid="expense-custom-amount-input"][data-member="自己"]',
    ),
  ).toHaveValue('700');
  await expect(
    page.locator(
      '[data-testid="expense-custom-amount-input"][data-member="朋友"]',
    ),
  ).toHaveValue('300');
});

test('刪除帳目後畫面與 Firebase Emulator 都會清空', async ({ page }) => {
  const now = Date.now();

  await seedTestTrip(ROOM_ID, {
    title: 'E2E 記帳刪除測試',
    members: MEMBERS,
    memberBudgets: {
      自己: 10000,
      朋友: 10000,
    },
    expenses: [
      {
        id: 'expense-delete-1',
        dayId: 'Day 1',
        item: 'E2E 待刪除餐費',
        cost: 600,
        localCost: 600,
        currency: 'TWD',
        exchangeRate: 1,
        category: 'food',
        payer: '自己',
        split: {
          自己: 300,
          朋友: 300,
        },
        note: '這筆帳目將由 E2E 刪除',
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);

  const record = expenseRecord(page, 'E2E 待刪除餐費');
  await expect(record).toBeVisible();
  await record.click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );

  const moreActions = page.getByTestId('expense-more-actions');
  await moreActions.locator('summary').click();

  page.once('dialog', (dialog) => {
    void dialog.accept();
  });

  await page.getByTestId('expense-delete-button').click();

  await expect(expenseRecord(page, 'E2E 待刪除餐費')).toHaveCount(0);
  await expect(page.getByTestId('expense-total')).toContainText('NT$ 0');

  await expect
    .poll(
      async () => (await readExpenses()).length,
      {
        timeout: 15_000,
        message: '刪除帳目後 Database Emulator 應為空',
      },
    )
    .toBe(0);

  await page.reload();
  await openExpenseTab(page);

  await expect(expenseRecord(page, 'E2E 待刪除餐費')).toHaveCount(0);
  await expect(page.getByTestId('expense-total')).toContainText('NT$ 0');
});
