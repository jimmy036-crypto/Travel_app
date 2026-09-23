import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpenseSection } from './ExpenseSection.jsx';
import { buildSettlementBalanceModel } from './settlementBalanceModel.js';

// 模擬 Firebase 模組確保不直接呼叫 Firebase
vi.mock('../../firebase', () => ({
  db: {},
  storage: {}
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  onValue: vi.fn(),
  update: vi.fn(),
}));

const mockT = {
  expenseBlockBg: 'bg-white',
  cardBorder: 'border-gray-200',
  mainText: 'text-black',
  subText: 'text-gray-500',
  headerBg: 'bg-gray-100',
  cardBg: 'bg-white',
  itemBg: 'bg-gray-50',
  sidebarBg: 'bg-gray-50'
};

const defaultProps = {
  t: mockT,
  isActive: true,
  expenses: [],
  settlements: [],
  membersList: ['Alice', 'Bob'],
  meta: { startDate: '2025-01-01', memberBudgets: { Alice: 1000, Bob: 1000 } },
  expenseStats: {
    totalExpense: 0,
    personalSpent: { Alice: 0, Bob: 0 },
    preTripTotal: 0,
    preTripSettlementTotal: 0,
    preTripSettlementSummary: { receivableTotal: 0, transferCount: 0 },
    preTripTransfers: [],
    settlementSummary: { receivableTotal: 0, payableTotal: 0, transferCount: 0, balancedMemberCount: 2 },
    balances: { Alice: 0, Bob: 0 },
    transfers: [],
    groupedExpenses: [],
  },
  settlementModel: buildSettlementBalanceModel({
    expenses: [],
    settlements: [],
    members: ['Alice', 'Bob'],
  }),
  onCreateExpense: vi.fn(),
  onEditExpense: vi.fn(),
  onMarkTransferPaid: vi.fn(),
  onCancelTransferPaid: vi.fn(),
  settlementMutationId: '',
  onUpdateBudget: vi.fn(),
  onUpdateDefaultCurrency: vi.fn(),
};

describe('ExpenseSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('顯示沒有費用時的空狀態', () => {
    render(<ExpenseSection {...defaultProps} />);
    expect(screen.getByText('尚無記帳紀錄')).toBeInTheDocument();
  });

  it('顯示費用列表', () => {
    const expensesProps = {
      ...defaultProps,
      expenses: [{ id: '1', item: 'Test Item', cost: 100, payer: 'Alice', split: { Alice: 50, Bob: 50 } }],
      expenseStats: {
        ...defaultProps.expenseStats,
        totalExpense: 100,
        groupedExpenses: [
          { day: 'Day 1', items: [{ id: '1', item: 'Test Item', cost: 100, payer: 'Alice', split: { Alice: 50, Bob: 50 } }] }
        ]
      }
    };
    render(<ExpenseSection {...expensesProps} />);
    expect(screen.getByText('Test Item')).toBeInTheDocument();
    expect(screen.getByTestId('expense-record-cost')).toHaveTextContent('NT$100');
  });

  it('顯示目的地建議幣別並可設定旅程之後新帳目的預設', () => {
    render(<ExpenseSection {...defaultProps} meta={{ ...defaultProps.meta, destination: '日本大阪' }} />);
    const selector = screen.getByLabelText('新帳目預設幣別');
    expect(selector).toHaveValue('AUTO');
    expect(screen.getByRole('option', { name: '依目的地（JPY）' })).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: 'USD' } });
    expect(defaultProps.onUpdateDefaultCurrency).toHaveBeenCalledWith('USD');
  });

  it('多人付款摘要分開呈現實付與分攤，娛樂分類有自己的標籤', () => {
    const expense = { id: 'entertainment-1', dayId: 'Day 1', item: '電影', cost: 100, category: 'entertainment', payer: 'Alice', payments: { Alice: 60, Bob: 40 }, split: { Alice: 50, Bob: 50 } };
    render(<ExpenseSection {...defaultProps} expenses={[expense]} expenseStats={{ ...defaultProps.expenseStats, groupedExpenses: [{ day: 'Day 1', items: [expense] }] }} />);
    expect(screen.getByTestId('expense-record')).toHaveTextContent(/娛樂.*Alice、Bob.*先付/);
  });

  it('娛樂分類圖例在明暗主題使用對應可讀文字色', () => {
    const expense = { id: 'entertainment-2', dayId: 'Day 1', item: '演出', cost: 100, category: 'entertainment', payer: 'Alice', split: { Alice: 50, Bob: 50 } };
    const props = { ...defaultProps, expenses: [expense], expenseStats: { ...defaultProps.expenseStats, totalExpense: 100 } };
    const view = render(<ExpenseSection {...props} t={{ ...mockT, isLight: true }} />);
    fireEvent.click(screen.getByTestId('expense-chart-view-button'));
    expect(screen.getByText('NT$100', { selector: 'p' })).toHaveClass('text-rose-700');
    view.rerender(<ExpenseSection {...props} t={{ ...mockT, isLight: false }} />);
    expect(screen.getByText('NT$100', { selector: 'p' })).toHaveClass('text-rose-400');
  });

  it('大量明細按日期收合並可展開更多單日帳目', () => {
    const firstDay = Array.from({ length: 22 }, (_, index) => ({ id: `old-${index}`, dayId: 'Day 1', item: `舊帳目 ${index}`, cost: 10, payer: 'Alice' }));
    const latest = [{ id: 'new', dayId: 'Day 2', item: '最新帳目', cost: 30, payer: 'Bob' }];
    render(<ExpenseSection {...defaultProps} expenses={[...firstDay, ...latest]} expenseStats={{ ...defaultProps.expenseStats, groupedExpenses: [{ day: 'Day 1', items: firstDay }, { day: 'Day 2', items: latest }] }} />);
    expect(screen.getByTestId('expense-day-Day 1')).not.toHaveAttribute('open');
    expect(screen.getByTestId('expense-day-Day 2')).toHaveAttribute('open');
    fireEvent.click(screen.getByText(/第一天.*22 筆/));
    expect(screen.getByTestId('expense-day-Day 1')).toHaveAttribute('open');
    expect(screen.getAllByTestId('expense-record')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: /顯示較早的 12 筆/ }));
    expect(screen.getAllByTestId('expense-record')).toHaveLength(23);
  });

  it('顯示總支出與個人分攤', () => {
    const statsProps = {
      ...defaultProps,
      expenseStats: {
        ...defaultProps.expenseStats,
        totalExpense: 500,
        personalSpent: { Alice: 300, Bob: 200 }
      }
    };
    render(<ExpenseSection {...statsProps} />);
    
    const totalEl = screen.getByTestId('expense-total');
    expect(totalEl).toHaveTextContent('NT$ 500');

    fireEvent.click(screen.getByTestId('budget-toggle'));
    const spentAlice = screen.getByText('已花 NT$300');
    expect(spentAlice).toBeInTheDocument();
    
    const spentBob = screen.getByText('已花 NT$200');
    expect(spentBob).toBeInTheDocument();
  });

  it('顯示 Settlement Summary', () => {
    const expenses = [{
      id: 'day-1',
      dayId: 'Day 1',
      cost: 200,
      payer: 'Alice',
      split: { Alice: 100, Bob: 100 },
    }];
    const settleProps = {
      ...defaultProps,
      expenses,
      settlementModel: buildSettlementBalanceModel({
        expenses,
        settlements: [],
        members: ['Alice', 'Bob'],
      }),
      expenseStats: {
        ...defaultProps.expenseStats,
        balances: { Alice: 100, Bob: -100 },
        settlementSummary: { receivableTotal: 100, payableTotal: 100, transferCount: 1, balancedMemberCount: 0 },
        transfers: [{ from: 'Bob', to: 'Alice', amount: 100 }]
      }
    };
    // 點擊結算表
    render(<ExpenseSection {...settleProps} />);
    fireEvent.click(screen.getByTestId('expense-settlement-view-button'));
    expect(screen.getByTestId('settlement-scope-tab-all')).toHaveAttribute('aria-pressed', 'true');
    
    // 檢查結算總覽
    expect(screen.getAllByText('剩餘應收 +NT$100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('剩餘應付 -NT$100').length).toBeGreaterThan(0);
    expect(screen.getAllByText('NT$100').length).toBeGreaterThan(0); // transfer amount and others
  });

  it('顯示待轉帳並可標記為已轉帳', () => {
    const expenses = [{
      id: 'day-1',
      dayId: 'Day 1',
      cost: 2500,
      payer: 'Alice',
      split: { Alice: 1250, Bob: 1250 },
    }];
    render(<ExpenseSection
      {...defaultProps}
      expenses={expenses}
      settlementModel={buildSettlementBalanceModel({
        expenses,
        settlements: [],
        members: ['Alice', 'Bob'],
      })}
      expenseStats={{
        ...defaultProps.expenseStats,
        balances: { Alice: 1250, Bob: -1250 },
        transfers: [],
      }}
    />);

    fireEvent.click(screen.getByTestId('expense-settlement-view-button'));
    expect(screen.getByTestId('pending-settlement-transfer')).toHaveTextContent('Bob → Alice');
    expect(screen.getByTestId('pending-settlement-transfer')).toHaveTextContent('NT$1,250');
    fireEvent.click(screen.getByTestId('mark-settlement-paid'));
    expect(defaultProps.onMarkTransferPaid).toHaveBeenCalledWith(expect.objectContaining({
      fromParticipantId: 'Bob',
      toParticipantId: 'Alice',
      amount: 1250,
      currency: 'TWD',
      scope: 'intrip',
    }));
  });

  it('顯示已完成紀錄並可取消已轉帳', () => {
    const expenses = [{
      id: 'day-1',
      dayId: 'Day 1',
      cost: 200,
      payer: 'Alice',
      split: { Alice: 100, Bob: 100 },
    }];
    const settlements = [{
      id: 'transfer-1',
      fromParticipantId: 'Bob',
      toParticipantId: 'Alice',
      amount: 100,
      currency: 'TWD',
      scope: 'intrip',
      status: 'paid',
      paidAt: '2026-07-28T04:30:00.000Z',
      createdAt: '2026-07-28T04:30:00.000Z',
      updatedAt: '2026-07-28T04:30:00.000Z',
    }];
    render(<ExpenseSection
      {...defaultProps}
      expenses={expenses}
      settlementModel={buildSettlementBalanceModel({
        expenses,
        settlements,
        members: ['Alice', 'Bob'],
      })}
      expenseStats={{
        ...defaultProps.expenseStats,
        transfers: [{ from: 'Bob', to: 'Alice', amount: 100 }],
      }}
    />);

    fireEvent.click(screen.getByTestId('expense-settlement-view-button'));
    expect(screen.queryByTestId('pending-settlement-transfer')).not.toBeInTheDocument();
    expect(screen.getByTestId('completed-settlement-transfer')).toHaveTextContent('已轉帳');
    fireEvent.click(screen.getByTestId('cancel-settlement-paid'));
    expect(defaultProps.onCancelTransferPaid).toHaveBeenCalledWith('transfer-1');
  });

  it('金額或幣別改變後不沿用舊 paid 狀態', () => {
    const paidRecord = {
      id: 'transfer-1',
      fromParticipantId: 'Bob',
      toParticipantId: 'Alice',
      amount: 100,
      currency: 'TWD',
      scope: 'intrip',
      status: 'paid',
      paidAt: '2026-07-28T04:30:00.000Z',
      createdAt: '2026-07-28T04:30:00.000Z',
      updatedAt: '2026-07-28T04:30:00.000Z',
    };
    const expenses = [{
      id: 'day-1',
      dayId: 'Day 1',
      cost: 240,
      payer: 'Alice',
      split: { Alice: 120, Bob: 120 },
    }];
    render(<ExpenseSection
      {...defaultProps}
      expenses={expenses}
      settlementModel={buildSettlementBalanceModel({
        expenses,
        settlements: [paidRecord],
        members: ['Alice', 'Bob'],
      })}
      expenseStats={{
        ...defaultProps.expenseStats,
        transfers: [
          { from: 'Bob', to: 'Alice', amount: 120 },
          { from: 'Bob', to: 'Alice', amount: 100, currency: 'JPY' },
        ],
      }}
    />);

    fireEvent.click(screen.getByTestId('expense-settlement-view-button'));
    expect(screen.getAllByTestId('pending-settlement-transfer')).toHaveLength(1);
    expect(screen.getByTestId('completed-settlement-transfer')).toHaveTextContent('NT$100');
    expect(screen.getByTestId('completed-settlement-transfer')).toHaveTextContent('未抵銷剩餘款項');
  });

  it('點新增費用呼叫 onCreateExpense', () => {
    render(<ExpenseSection {...defaultProps} />);
    fireEvent.click(screen.getByTestId('add-expense-button'));
    expect(defaultProps.onCreateExpense).toHaveBeenCalledTimes(1);
  });

  it('點編輯費用呼叫 correct callback', () => {
    const mockExpense = { id: 'exp-123', item: 'Test', cost: 100, payer: 'Alice' };
    const expensesProps = {
      ...defaultProps,
      expenses: [mockExpense],
      expenseStats: {
        ...defaultProps.expenseStats,
        groupedExpenses: [
          { day: 'Day 1', items: [mockExpense] }
        ]
      }
    };
    render(<ExpenseSection {...expensesProps} />);
    fireEvent.click(screen.getByTestId('expense-record'));
    expect(defaultProps.onEditExpense).toHaveBeenCalledWith(mockExpense);
  });

  it('Mobile rendering 支援主要操作', () => {
    render(<ExpenseSection {...defaultProps} />);
    // 確保新增按鈕存在 (responsive 不會隱藏此按鈕)
    expect(screen.getByTestId('add-expense-button')).toBeVisible();
    
    // 確保 View 切換按鈕存在
    expect(screen.getByTestId('expense-list-view-button')).toBeVisible();
    expect(screen.getByTestId('expense-chart-view-button')).toBeVisible();
    expect(screen.getByTestId('expense-settlement-view-button')).toBeVisible();
  });

  it('主要視圖、統計對象與預算輸入具備選取語意與可存取名稱', () => {
    render(<ExpenseSection {...defaultProps} />);
    expect(screen.getByTestId('expense-list-view-button')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('budget-toggle')).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByTestId('budget-toggle'));
    expect(screen.getByLabelText('Alice 個人預算（新台幣）')).toBeInTheDocument();
    expect(screen.getByTestId('budget-toggle')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByTestId('expense-chart-view-button'));
    expect(screen.getByRole('button', { name: '👥 全團' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '👤 Bob' }));
    expect(screen.getByRole('button', { name: '👤 Bob' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('budget-toggle'));
    expect(screen.getByTestId('budget-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('將可聚焦的視圖與預算控制依畫面順序放在 DOM 中', () => {
    const { container } = render(<ExpenseSection {...defaultProps} />);
    const controls = Array.from(container.querySelectorAll(
      '[data-testid="add-expense-button"], [data-testid="expense-list-view-button"], [data-testid="expense-settlement-view-button"], [data-testid="expense-chart-view-button"], [data-testid="budget-toggle"]',
    ));

    expect(controls.map((element) => element.getAttribute('data-testid'))).toEqual([
      'add-expense-button',
      'expense-list-view-button',
      'expense-settlement-view-button',
      'expense-chart-view-button',
      'budget-toggle',
    ]);
    expect(
      Array.from(container.querySelectorAll('[class]')).some((element) => (
        Array.from(element.classList).some((className) => className.startsWith('order-'))
      )),
    ).toBe(false);
  });

  it('六位旅伴預算預設收合，展開只呈現資料且不觸發預算寫入', () => {
    const onUpdateBudget = vi.fn();
    render(<ExpenseSection
      {...defaultProps}
      membersList={['甲', '乙', '丙', '丁', '戊', '己']}
      meta={{ ...defaultProps.meta, memberBudgets: { 甲: 1000, 乙: 2000, 丙: 3000, 丁: 4000, 戊: 5000, 己: 6000 } }}
      expenseStats={{ ...defaultProps.expenseStats, personalSpent: { 甲: 100, 乙: 200, 丙: 300, 丁: 400, 戊: 500, 己: 600 } }}
      onUpdateBudget={onUpdateBudget}
    />);
    expect(screen.getByTestId('budget-toggle')).toHaveTextContent('6 人');
    expect(screen.getByTestId('budget-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('member-budget-row')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('budget-toggle'));
    expect(screen.getAllByTestId('member-budget-row')).toHaveLength(6);
    expect(screen.getByLabelText('己 個人預算（新台幣）')).toHaveValue(6000);
    expect(onUpdateBudget).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('budget-toggle'));
    expect(screen.queryByTestId('member-budget-row')).not.toBeInTheDocument();
    expect(onUpdateBudget).not.toHaveBeenCalled();
  });

  it('將明確輸入的預算交給既有更新 callback', () => {
    const onUpdateBudget = vi.fn();
    render(<ExpenseSection {...defaultProps} onUpdateBudget={onUpdateBudget} />);
    fireEvent.click(screen.getByTestId('budget-toggle'));
    fireEvent.change(screen.getByLabelText('Alice 個人預算（新台幣）'), {
      target: { value: '12345' },
    });
    expect(onUpdateBudget).toHaveBeenCalledTimes(1);
    expect(onUpdateBudget).toHaveBeenCalledWith('Alice', '12345');
  });

  it('labels group and personal distribution and explains allocation only once', () => {
    render(<ExpenseSection {...defaultProps} />);
    fireEvent.click(screen.getByTestId('expense-chart-view-button'));
    expect(screen.getByRole('heading', { name: '📊 全團花費分布' })).toBeVisible();
    expect(screen.getByText('依所有記帳項目的完整金額統計')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '👤 Alice', exact: true }));
    expect(screen.getByRole('heading', { name: '👤 Alice 的個人花費分布' })).toBeVisible();
    expect(screen.getAllByText(/分攤金額.*代墊金額/)).toHaveLength(1);
    expect(screen.getByText('依實際分攤金額計算，不是代墊金額。')).toBeVisible();
    expect(screen.queryByText(/個人圓餅圖依/)).not.toBeInTheDocument();
  });

  it('explains separate settlement once in all scopes and keeps it when viewing one scope', () => {
    render(<ExpenseSection {...defaultProps} />);
    fireEvent.click(screen.getByTestId('expense-settlement-view-button'));
    expect(screen.getByRole('group', { name: '結算範圍' })).toBeInTheDocument();
    const allScopeNote = '行前與旅途中分開結算，不會跨範圍互相抵銷。';
    const singleScopeNote = '付款紀錄只抵銷本範圍，與其他範圍分開核對。';
    expect(screen.getAllByText(allScopeNote)).toHaveLength(1);
    expect(screen.queryByText(singleScopeNote)).not.toBeInTheDocument();
    expect(screen.getByTestId('settlement-scope-pretrip')).toBeVisible();
    expect(screen.getByTestId('settlement-scope-intrip')).toBeVisible();
    for (const scope of ['pretrip', 'intrip']) {
      fireEvent.click(screen.getByTestId(`settlement-scope-tab-${scope}`));
      expect(screen.getByTestId(`settlement-scope-tab-${scope}`)).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getAllByText(singleScopeNote)).toHaveLength(1);
      expect(screen.queryByText(allScopeNote)).not.toBeInTheDocument();
      expect(screen.getByTestId(`settlement-scope-${scope}`)).toBeVisible();
      expect(screen.queryByTestId(`settlement-scope-${scope === 'pretrip' ? 'intrip' : 'pretrip'}`)).not.toBeInTheDocument();
    }
  });
});
