import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpenseSection } from './ExpenseSection.jsx';

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
  onCreateExpense: vi.fn(),
  onEditExpense: vi.fn(),
  onOpenSettlement: vi.fn(),
  onDeleteSettlement: vi.fn(),
  onUpdateBudget: vi.fn(),
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

    const spentAlice = screen.getByText('已花 NT$300');
    expect(spentAlice).toBeInTheDocument();
    
    const spentBob = screen.getByText('已花 NT$200');
    expect(spentBob).toBeInTheDocument();
  });

  it('顯示 Settlement Summary', () => {
    const settleProps = {
      ...defaultProps,
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
    
    // 檢查結算總覽
    expect(screen.getByText('應收回 +NT$100')).toBeInTheDocument();
    expect(screen.getByText('須支付 -NT$100')).toBeInTheDocument();
    expect(screen.getAllByText('NT$100').length).toBeGreaterThan(0); // transfer amount and others
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
});
