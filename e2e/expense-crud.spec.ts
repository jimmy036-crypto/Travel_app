import { expect, test, type Dialog, type Locator, type Page } from '@playwright/test';
import { skipCompanionIntroduction } from './support/companion';

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
  payments?: Record<string, number>;
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

async function openExpenseTab(page: Page, expandBudget = true): Promise<void> {
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  const expenseTab = page.locator(
    '[data-testid="expense-tab-button"]:visible',
  );

  await expect(expenseTab).toHaveCount(1);
  await expenseTab.click();

  await expect(page.getByTestId('expense-panel')).toBeVisible();
  if (expandBudget) {
    const budgetToggle = page.getByTestId('budget-toggle');
    await expect(budgetToggle).toHaveAttribute('aria-expanded', 'false');
    await budgetToggle.press('Enter');
    await expect(budgetToggle).toHaveAttribute('aria-expanded', 'true');
  }
}

async function openNewExpenseModal(page: Page, selectPayer = true): Promise<void> {
  await page.getByTestId('add-expense-button').click();

  await expect(page.getByTestId('expense-modal')).toBeVisible();
  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'create',
  );
  // B0: this test's fixed financial input explicitly names the payer;
  // opening a new expense no longer guesses the first companion.
  await expect(page.getByTestId('expense-payer-select')).toHaveValue('');
  if (selectPayer) await page.getByTestId('expense-payer-select').selectOption('自己');
}

async function expectVisibleAboveMobileNavigation(locator: Locator): Promise<{ width: number; height: number }> {
  const target = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const navigation = document.querySelector('[data-testid="mobile-bottom-navigation"]');
    const navigationTop = navigation?.getBoundingClientRect().top ?? window.innerHeight;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    return {
      width: rect.width,
      height: rect.height,
      fullyInsideVisibleArea: rect.left >= 0
        && rect.right <= window.innerWidth
        && rect.top >= 0
        && rect.bottom <= Math.min(window.innerHeight, navigationTop),
      receivesCenterHit: element.contains(document.elementFromPoint(centerX, centerY)),
    };
  });

  expect(target.fullyInsideVisibleArea).toBe(true);
  expect(target.receivesCenterHit).toBe(true);
  return target;
}

async function expectUnobscuredTarget(locator: Locator): Promise<void> {
  const target = await expectVisibleAboveMobileNavigation(locator);
  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
}

async function expectUnobscuredModalTarget(locator: Locator): Promise<void> {
  const target = await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    return {
      width: rect.width,
      height: rect.height,
      fullyInsideViewport: rect.left >= 0
        && rect.right <= window.innerWidth
        && rect.top >= 0
        && rect.bottom <= window.innerHeight,
      receivesCenterHit: element.contains(document.elementFromPoint(centerX, centerY)),
    };
  });

  expect(target.width).toBeGreaterThanOrEqual(44);
  expect(target.height).toBeGreaterThanOrEqual(44);
  expect(target.fullyInsideViewport).toBe(true);
  expect(target.receivesCenterHit).toBe(true);
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

test('shows a success toast after creating an expense', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);
  await openNewExpenseModal(page);

  await page.getByTestId('expense-item-input').fill('E2E Toast dinner');
  await page.getByTestId('expense-local-cost-input').fill('1000');
  await page.getByTestId('expense-note-input').fill('E2E create toast note');
  await page.getByTestId('expense-save-button').click();

  await expect(page.getByTestId('expense-modal')).toBeHidden();
  await expect(expenseRecord(page, 'E2E Toast dinner')).toBeVisible();
  await expect(page.getByTestId('expense-total')).toContainText('1,000');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[0]}"]`),
  ).toContainText('500');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[1]}"]`),
  ).toContainText('500');

  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '費用已新增' });
  await expect(successToast).toHaveCount(1);
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('分帳與結算統計已更新。');
});

test('destination suggests currency, trip override persists, and today selects the matching day', async ({ page }) => {
  await seedTestTrip(ROOM_ID, {
    title: 'E2E 日本記帳日期',
    destination: '日本大阪',
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    members: MEMBERS,
    expenses: [{ id: 'existing', dayId: 'Day 1', item: '既有帳目', cost: 100, payer: '自己', split: { 自己: 50, 朋友: 50 } }],
  });
  const originalExpenses = await readExpenses();
  await page.clock.setFixedTime(new Date('2026-09-21T04:00:00Z'));
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await page.getByTestId('add-expense-button').click();
  await expect(page.getByTestId('expense-currency-select')).toHaveValue('JPY');
  await expect(page.getByTestId('expense-day-select')).toHaveValue('Day 2');
  expect(await readExpenses()).toEqual(originalExpenses);
  await page.getByTestId('expense-cancel-button').click();
  await page.getByText('新帳目預設幣別：JPY').click();
  await page.getByLabel('新帳目預設幣別').selectOption('USD');
  await expect.poll(async () => (await readEmulatorData<{ expenseCurrency?: string }>(`rooms/${ROOM_ID}/meta`))?.expenseCurrency).toBe('USD');
  await page.reload();
  await openExpenseTab(page, false);
  await page.getByTestId('add-expense-button').click();
  await expect(page.getByTestId('expense-currency-select')).toHaveValue('USD');
  await expect(page.getByTestId('expense-day-select')).toHaveValue('Day 2');
  expect(await readExpenses()).toEqual(originalExpenses);
});

test('two actual payers persist separately and settlement uses each paid amount', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await openNewExpenseModal(page);
  await page.getByTestId('expense-item-input').fill('E2E 多人付款包車');
  await page.getByTestId('expense-local-cost-input').fill('1000');
  await page.getByTestId('expense-multiple-payers-toggle').click();
  await page.getByLabel('自己 實付金額').fill('700');
  await page.getByLabel('朋友 實付金額').fill('300');
  await page.getByTestId('expense-save-button').click();
  await expect(expenseRecord(page, 'E2E 多人付款包車')).toContainText('自己、朋友');
  await expect.poll(async () => {
    const expense = (await readExpenses()).find((item) => item.item === 'E2E 多人付款包車');
    return expense ? { cost: expense.cost, payer: expense.payer, payments: expense.payments, split: expense.split } : null;
  }).toEqual({ cost: 1000, payer: '自己', payments: { 自己: 700, 朋友: 300 }, split: { 自己: 500, 朋友: 500 } });
  await page.getByTestId('expense-settlement-view-button').click();
  await expect(page.getByTestId('settlement-scope-intrip').getByTestId('pending-settlement-transfer')).toContainText('朋友 → 自己');
  await expect(page.getByTestId('settlement-scope-intrip').getByTestId('pending-settlement-transfer')).toContainText('NT$200');
  await page.reload();
  await openExpenseTab(page, false);
  await expenseRecord(page, 'E2E 多人付款包車').click();
  await expect(page.getByTestId('expense-multiple-payers-toggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('自己 實付金額')).toHaveValue('700');
  await expect(page.getByLabel('朋友 實付金額')).toHaveValue('300');
});

test('foreign-currency custom shares rebalance in the selected currency and persist TWD settlement values', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await openNewExpenseModal(page);
  await page.getByTestId('expense-item-input').fill('E2E 娛樂票券');
  await page.getByTestId('expense-currency-select').selectOption('JPY');
  await page.getByTestId('expense-split-custom-button').click();
  await page.getByLabel('自己 自訂分帳金額（JPY）').fill('1500');
  await page.getByLabel('朋友 自訂分帳金額（JPY）').fill('500');
  await expect(page.getByTestId('expense-local-cost-input')).toHaveValue('2000');
  await expect(page.getByTestId('expense-twd-total')).toContainText('420');
  await page.getByTestId('expense-local-cost-input').fill('3000');
  await page.getByRole('button', { name: '依比例重算' }).click();
  await expect(page.getByLabel('自己 自訂分帳金額（JPY）')).toHaveValue('2250');
  await expect(page.getByLabel('朋友 自訂分帳金額（JPY）')).toHaveValue('750');
  await page.getByTestId('expense-local-cost-input').fill('2000');
  await page.getByRole('button', { name: '依比例重算' }).click();
  await expect(page.getByLabel('自己 自訂分帳金額（JPY）')).toHaveValue('1500');
  await expect(page.getByLabel('朋友 自訂分帳金額（JPY）')).toHaveValue('500');
  await page.locator('[data-testid="expense-category-button"][data-category="entertainment"]').click();
  await page.getByTestId('expense-save-button').click();
  await expect(expenseRecord(page, 'E2E 娛樂票券')).toContainText('娛樂');
  await expect.poll(async () => {
    const expense = (await readExpenses()).find((item) => item.item === 'E2E 娛樂票券');
    return expense ? {
      cost: expense.cost, localCost: expense.localCost, currency: expense.currency,
      category: expense.category, split: expense.split,
    } : null;
  }).toEqual({ cost: 420, localCost: 2000, currency: 'JPY', category: 'entertainment', split: { 自己: 315, 朋友: 105 } });
  await page.reload();
  await openExpenseTab(page, false);
  await expenseRecord(page, 'E2E 娛樂票券').click();
  await expect(page.getByLabel('自己 自訂分帳金額（JPY）')).toHaveValue('1500');
  await expect(page.getByLabel('朋友 自訂分帳金額（JPY）')).toHaveValue('500');
});

test('expense amount expressions calculate safely across total, split and actual payments', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await openNewExpenseModal(page);
  await page.getByTestId('expense-item-input').fill('E2E 算式車資');
  const totalInput = page.getByTestId('expense-local-cost-input');
  await totalInput.fill('400/0');
  await totalInput.press('Tab');
  await expect(totalInput).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('不能除以零。')).toBeVisible();
  expect(await readExpenses()).toEqual([]);

  await totalInput.fill('(120+80)*2');
  await totalInput.press('Enter');
  await expect(totalInput).toHaveValue('400');
  await page.getByTestId('expense-split-custom-button').click();
  await page.getByLabel('自己 自訂分帳金額（TWD）').fill('100+50');
  await page.getByLabel('朋友 自訂分帳金額（TWD）').fill('500/2');
  await page.getByTestId('expense-multiple-payers-toggle').click();
  await page.getByLabel('自己 實付金額').fill('100*3');
  await page.getByLabel('朋友 實付金額').fill('200/2');
  await page.getByTestId('expense-save-button').click();
  await expect(expenseRecord(page, 'E2E 算式車資')).toBeVisible();
  await expect.poll(async () => {
    const expense = (await readExpenses()).find((item) => item.item === 'E2E 算式車資');
    return expense ? { cost: expense.cost, localCost: expense.localCost, split: expense.split, payments: expense.payments } : null;
  }).toEqual({ cost: 400, localCost: 400, split: { 自己: 150, 朋友: 250 }, payments: { 自己: 300, 朋友: 100 } });
  await page.reload();
  await openExpenseTab(page, false);
  await expenseRecord(page, 'E2E 算式車資').click();
  await expect(page.getByTestId('expense-local-cost-input')).toHaveValue('400');
  await expect(page.getByLabel('自己 實付金額')).toHaveValue('300');
  await expect(page.getByLabel('朋友 實付金額')).toHaveValue('100');
});

test('currency change and tiny custom shares never silently change the saved TWD amount', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await openNewExpenseModal(page);
  await page.getByTestId('expense-item-input').fill('E2E 極小金額');
  const currency = page.getByTestId('expense-currency-select');
  const total = page.getByTestId('expense-local-cost-input');
  await currency.selectOption('JPY');
  await total.fill('50');
  await expect(page.getByTestId('expense-twd-total')).toContainText('11');
  let warning = '';
  page.once('dialog', async (dialog) => {
    warning = dialog.message();
    await dialog.accept();
  });
  await currency.selectOption('USD');
  expect(warning).toContain('無法保持原本台幣總額');
  await expect(currency).toHaveValue('JPY');
  await expect(total).toHaveValue('50');

  await total.fill('');
  await currency.selectOption('USD');
  await total.fill('0.02');
  await page.getByTestId('expense-split-custom-button').click();
  page.once('dialog', async (dialog) => {
    warning = dialog.message();
    await dialog.accept();
  });
  await page.getByTestId('expense-save-button').click();
  expect(warning).toContain('分帳總和');
  expect(await readExpenses()).toEqual([]);
});

test('legacy foreign expense keeps exact member shares on metadata-only edit', async ({ page }) => {
  await seedTestTrip(ROOM_ID, {
    members: MEMBERS,
    expenses: [{
      id: 'legacy-foreign', dayId: 'Day 1', item: 'E2E 舊日幣車資',
      cost: 420, currency: 'JPY', exchangeRate: 0.21,
      payer: '自己', split: { 自己: 300, 朋友: 120 },
    }],
  });
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await expenseRecord(page, 'E2E 舊日幣車資').click();
  await page.getByTestId('expense-item-input').fill('E2E 舊日幣車資更新');
  await page.getByTestId('expense-save-button').click();
  await expect(expenseRecord(page, 'E2E 舊日幣車資更新')).toBeVisible();
  await expect.poll(async () => {
    const expense = (await readExpenses()).find((item) => item.id === 'legacy-foreign');
    return expense ? { item: expense.item, cost: expense.cost, split: expense.split } : null;
  }).toEqual({ item: 'E2E 舊日幣車資更新', cost: 420, split: { 自己: 300, 朋友: 120 } });
});

test('long expense history collapses by day and reveals every record without writing', async ({ page }) => {
  const expenses = Array.from({ length: 23 }, (_, index) => ({
    id: `long-${index}`,
    dayId: index === 22 ? 'Day 2' : 'Day 1',
    item: `合成帳目 ${index}`,
    cost: 100,
    currency: 'TWD',
    localCost: 100,
    exchangeRate: 1,
    category: 'entertainment',
    payer: '自己',
    split: { 自己: 50, 朋友: 50 },
  }));
  await seedTestTrip(ROOM_ID, { expenses, members: MEMBERS });
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  const firstDay = page.getByTestId('expense-day-Day 1');
  await expect(firstDay).not.toHaveAttribute('open');
  await expect(page.getByTestId('expense-day-Day 2')).toHaveAttribute('open', '');
  await firstDay.locator('summary').click();
  await expect(firstDay.getByTestId('expense-record')).toHaveCount(10);
  await firstDay.getByRole('button', { name: '顯示較早的 12 筆' }).click();
  await expect(firstDay.getByTestId('expense-record')).toHaveCount(22);
  await expect(firstDay.getByTestId('expense-record').first()).toContainText('娛樂');
  expect(await readExpenses()).toEqual(expenses);
});

test('keeps the expense workflow visible before six-person budget details', async ({ page }, testInfo) => {
  const sixMembers = ['王小明', '陳小華', '林小美', '張大同', '李安', '周怡君'];
  await seedTestTrip(ROOM_ID, {
    title: 'E2E 六人首屏測試旅程',
    members: sixMembers,
    memberBudgets: {
      王小明: 10000,
      陳小華: 10000,
      林小美: 10000,
      張大同: 10000,
      李安: 10000,
      周怡君: 10000,
    },
    expenses: [{
      id: 'six-person-first-expense',
      dayId: 'Day 1',
      item: '合成六人首屏第一筆帳目',
      cost: 1200,
      localCost: 1200,
      currency: 'TWD',
      exchangeRate: 1,
      category: 'food',
      payer: sixMembers[0],
      split: Object.fromEntries(sixMembers.map((member) => [member, 200])),
      createdAt: 1,
      updatedAt: 1,
    }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);

  const addExpense = page.getByTestId('add-expense-button');
  const listView = page.getByTestId('expense-list-view-button');
  const settlementView = page.getByTestId('expense-settlement-view-button');
  const chartView = page.getByTestId('expense-chart-view-button');
  const budgetToggle = page.getByTestId('budget-toggle');
  const firstExpense = expenseRecord(page, '合成六人首屏第一筆帳目');
  const beforeUiOnlyOperations = await readEmulatorData(`rooms/${ROOM_ID}`);

  // Do not scroll before this measurement: each target must be usable in the
  // collapsed 390×844 first screen above the mobile navigation.
  for (const control of [addExpense, listView, settlementView, chartView, budgetToggle]) {
    await expectUnobscuredTarget(control);
  }
  await expectVisibleAboveMobileNavigation(firstExpense.getByTestId('expense-record-title'));
  await expect(budgetToggle).toContainText('6 人');
  await expect(budgetToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('member-budget-row')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const collapsedScreenshot = await page.screenshot({ path: `.tmp/t5a-evidence/expense-collapsed-390-${testInfo.project.name}.png` });
  await testInfo.attach('t5a-expense-collapsed-390', { body: collapsedScreenshot, contentType: 'image/png' });

  await addExpense.focus();
  await page.keyboard.press('Tab');
  await expect(listView).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(settlementView).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(chartView).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(budgetToggle).toBeFocused();

  await budgetToggle.press('Enter');
  await expect(budgetToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('member-budget-row')).toHaveCount(6);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel(`${sixMembers[0]} 個人預算（新台幣）`)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(budgetToggle).toBeFocused();
  for (const member of sixMembers) {
    const input = page.getByLabel(`${member} 個人預算（新台幣）`);
    await input.scrollIntoViewIfNeeded();
    await expect(input).toHaveValue('10000');
    await expectUnobscuredTarget(input);
  }
  const expandedScreenshot = await page.screenshot({ path: `.tmp/t5a-evidence/expense-expanded-390-${testInfo.project.name}.png` });
  await testInfo.attach('t5a-expense-expanded-390', { body: expandedScreenshot, contentType: 'image/png' });
  await budgetToggle.focus();
  await budgetToggle.press(' ');
  await expect(budgetToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(budgetToggle).toBeFocused();
  expect(await readEmulatorData(`rooms/${ROOM_ID}`)).toEqual(beforeUiOnlyOperations);
});

test('keeps long expense content and native selects usable across widths, themes, and html font-size 200%', async ({ page }, testInfo) => {
  const longMembers = ['合成旅伴很長的中文名字用來驗證換行', 'SyntheticCompanionWithAnUnbrokenLongEnglishName'];
  const longItem = '合成帳目名稱用於驗證長中文與不含空格英文SyntheticExpenseNameWithoutSpaces';
  const now = Date.now();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E 記帳寬度與主題驗證',
    members: longMembers,
    themeColor: '#d9f3fb',
    expenses: [{
      id: 'long-expense',
      dayId: 'Day 1',
      item: longItem,
      cost: 9876543,
      localCost: 47030681,
      currency: 'JPY',
      exchangeRate: 0.21,
      category: 'accommodation',
      payer: longMembers[0],
      split: { [longMembers[0]]: 4938272, [longMembers[1]]: 4938271 },
      createdAt: now,
      updatedAt: now,
    }],
  });

  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/?room=${ROOM_ID}`);
    await openExpenseTab(page, false);
    const record = expenseRecord(page, longItem);
    await expect(record).toContainText('NT$9,876,543');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByTestId('add-expense-button').click();
    const currency = page.getByTestId('expense-currency-select');
    const day = page.getByTestId('expense-day-select');
    const payer = page.getByTestId('expense-payer-select');
    for (const control of [currency, day, payer]) {
      await expect(control).toHaveCSS('color-scheme', 'light');
      const box = await control.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press('Escape');
  }

  await seedTestTrip(ROOM_ID, {
    title: 'E2E 深色記帳原生選單驗證',
    members: longMembers,
    themeColor: '#172b4d',
  });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page, false);
  await page.getByTestId('add-expense-button').click();
  for (const control of [
    page.getByTestId('expense-currency-select'),
    page.getByTestId('expense-day-select'),
    page.getByTestId('expense-payer-select'),
  ]) {
    await expect(control).toHaveCSS('color-scheme', 'dark');
  }
  await page.keyboard.press('Escape');

  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const addExpense = page.getByTestId('add-expense-button');
  await addExpense.focus();
  await addExpense.press('Enter');
  const modal = page.getByTestId('expense-modal');
  const cancel = page.getByTestId('expense-cancel-button');
  const save = page.getByTestId('expense-save-button');
  await expect(modal).toBeVisible();
  await expectUnobscuredModalTarget(cancel);
  await expectUnobscuredModalTarget(save);
  await save.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('expense-close-button')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(save).toBeFocused();
  const zoomedScreenshot = await page.screenshot({ path: `.tmp/t5a-evidence/expense-modal-200pct-${testInfo.project.name}.png` });
  await testInfo.attach('t5a-expense-modal-200pct', { body: zoomedScreenshot, contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(addExpense).toBeFocused();
});

test('shows a success toast after editing an expense', async ({ page }) => {
  const now = Date.now();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E expense edit toast trip',
    members: MEMBERS,
    memberBudgets: {
      [MEMBERS[0]]: 10000,
      [MEMBERS[1]]: 10000,
    },
    expenses: [
      {
        id: 'expense-edit-toast',
        dayId: 'Day 1',
        item: 'E2E Toast original expense',
        cost: 1000,
        localCost: 1000,
        currency: 'TWD',
        exchangeRate: 1,
        category: 'food',
        payer: MEMBERS[0],
        split: {
          [MEMBERS[0]]: 500,
          [MEMBERS[1]]: 500,
        },
        note: 'E2E original toast note',
        createdAt: now,
        updatedAt: now,
      },
    ],
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);
  await expenseRecord(page, 'E2E Toast original expense').click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );

  await page.getByTestId('expense-item-input').fill('E2E Toast edited expense');
  await page.getByTestId('expense-currency-select').selectOption('JPY');
  await page.getByTestId('expense-local-cost-input').fill('2000');
  await page.getByTestId('expense-payer-select').selectOption(MEMBERS[1]);
  await page.getByTestId('expense-note-input').fill('E2E edit toast note');
  await page.getByTestId('expense-save-button').click();

  await expect(page.getByTestId('expense-modal')).toBeHidden();
  await expect(expenseRecord(page, 'E2E Toast edited expense')).toBeVisible();
  await expect(page.getByTestId('expense-total')).toContainText('420');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[0]}"]`),
  ).toContainText('210');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[1]}"]`),
  ).toContainText('210');

  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '費用已更新' });
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('最新分帳結果已同步給協作者。');
});

test('expense editor uses an accessible responsive sheet and supports every close action', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await openExpenseTab(page);
  await openNewExpenseModal(page, false);

  const overlay = page.getByTestId('expense-modal');
  const dialog = page.getByRole('dialog');
  const viewport = page.viewportSize();

  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(dialog).toHaveAccessibleName(/新增記帳/);
  await expect(dialog.locator(':focus')).toHaveCount(1);

  if (!viewport) throw new Error('Expense E2E requires a browser viewport');

  const dialogBox = await dialog.boundingBox();
  if (!dialogBox) throw new Error('Expense dialog has no bounding box');

  if (viewport.width < 640) {
    expect(Math.abs(dialogBox.y + dialogBox.height - viewport.height)).toBeLessThanOrEqual(1);
  } else {
    const dialogCenter = dialogBox.y + dialogBox.height / 2;
    expect(Math.abs(dialogCenter - viewport.height / 2)).toBeLessThanOrEqual(2);
  }

  await page.keyboard.press('Escape');
  await expect(overlay).toBeHidden();
  if (viewport.width >= 640) {
    await expect(page.getByTestId('add-expense-button')).toBeFocused();
  }

  await openNewExpenseModal(page, false);
  await page.getByTestId('expense-modal').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('expense-modal')).toBeHidden();

  await openNewExpenseModal(page, false);
  await page.getByTestId('expense-close-button').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden();
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

test('uses the shared confirmation dialog before deleting an expense', async ({ page }) => {
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
  await expect(page.getByTestId('expense-total')).toContainText('600');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[0]}"]`),
  ).toContainText('300');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[1]}"]`),
  ).toContainText('300');
  await record.click();

  await expect(page.getByTestId('expense-modal')).toHaveAttribute(
    'data-mode',
    'edit',
  );

  const moreActions = page.getByTestId('expense-more-actions');
  await moreActions.locator('summary').click();

  let nativeDialogSeen = false;
  const nativeDialogHandler = async (dialog: Dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  };
  page.on('dialog', nativeDialogHandler);

  await page.getByTestId('expense-delete-button').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await expect(page.getByTestId('confirm-dialog')).toContainText('刪除這筆費用？');
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    '刪除後，這筆費用與相關分帳統計會從所有協作者的畫面中移除。',
  );
  await expect(page.getByTestId('confirm-cancel')).toHaveText('保留費用');
  await expect(page.getByTestId('confirm-accept')).toHaveText('刪除費用');

  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('expense-modal')).toBeVisible();
  await expect(expenseRecord(page, 'E2E 待刪除餐費')).toBeVisible();
  await expect(page.getByTestId('expense-total')).toContainText('600');
  expect(nativeDialogSeen).toBe(false);

  await page.getByTestId('expense-delete-button').click();
  await page.getByTestId('confirm-accept').click();
  await expect(page.getByTestId('expense-modal')).toBeHidden({
    timeout: 15_000,
  });
  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '費用已刪除' });
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('分帳與結算統計已更新。');

  await expect(expenseRecord(page, 'E2E 待刪除餐費')).toHaveCount(0);
  await expect(page.getByTestId('expense-total')).toContainText('NT$ 0');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[0]}"]`),
  ).toContainText('0');
  await expect(
    page.locator(`[data-testid="member-spent"][data-member="${MEMBERS[1]}"]`),
  ).toContainText('0');

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
  page.off('dialog', nativeDialogHandler);
});
