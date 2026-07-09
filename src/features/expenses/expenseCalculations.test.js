import { describe, expect, it } from 'vitest';

import {
  applySettlementsToBalances,
  buildEqualSplit,
  buildSettlementTransfers,
  calculateBalanceSnapshot,
  calculateBalanceTotal,
  calculateCategoryStats,
  calculateCustomTotal,
  calculateExpenseStats,
  calculateMemberCategoryStats,
  calculateSettlementSummary,
  calculateTwdCost,
  inferExpenseSplitState,
  rebalanceCustomAmounts,
  roundMoney,
  validateCustomSplit,
} from './expenseCalculations.js';

const MEMBERS = ['自己', '小明', '小美'];
const CATEGORIES = [
  { id: 'food', label: '飲食' },
  { id: 'transport', label: '交通' },
  { id: 'other', label: '其他' },
];

describe('金額與匯率計算', () => {
  it('可以把外幣金額換算並四捨五入成台幣整數', () => {
    expect(calculateTwdCost(1000, 0.21)).toBe(210);
    expect(calculateTwdCost(10, 32.5)).toBe(325);
    expect(calculateTwdCost(3, 10.49)).toBe(31);
  });

  it('無效或非正數金額不會產生支出', () => {
    expect(calculateTwdCost('', 1)).toBe(0);
    expect(calculateTwdCost(100, 0)).toBe(0);
    expect(calculateTwdCost(-100, 1)).toBe(0);
    expect(calculateTwdCost(100, Number.NaN)).toBe(0);
  });

  it('金額可穩定四捨五入到指定小數位', () => {
    expect(roundMoney(33.335, 2)).toBe(33.34);
    expect(roundMoney(1.005, 2)).toBe(1.01);
    expect(roundMoney('10.444', 1)).toBe(10.4);
  });
});

describe('平均分帳', () => {
  it('100 元三人平分時最後一人承接尾差', () => {
    const result = buildEqualSplit({
      total: 100,
      members: MEMBERS,
      involved: MEMBERS,
    });

    expect(result.ok).toBe(true);
    expect(result.split).toEqual({
      自己: 33.33,
      小明: 33.33,
      小美: 33.34,
    });
    expect(Object.values(result.split).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('只會分給實際參與的人', () => {
    const result = buildEqualSplit({
      total: 500,
      members: MEMBERS,
      involved: ['自己', '小美'],
    });

    expect(result.split).toEqual({
      自己: 250,
      小明: 0,
      小美: 250,
    });
  });

  it('會忽略不存在於旅程中的參與者與重複名稱', () => {
    const result = buildEqualSplit({
      total: 300,
      members: ['自己', '小明', '小明'],
      involved: ['自己', '陌生人', '自己'],
    });

    expect(result.activeMembers).toEqual(['自己']);
    expect(result.split).toEqual({ 自己: 300, 小明: 0 });
  });

  it('沒有參與成員時會明確拒絕', () => {
    const result = buildEqualSplit({
      total: 100,
      members: MEMBERS,
      involved: [],
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('NO_INVOLVED_MEMBERS');
  });

  it('總額無效時不建立分帳', () => {
    const result = buildEqualSplit({
      total: 0,
      members: MEMBERS,
      involved: MEMBERS,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('INVALID_TOTAL');
  });
});

describe('自訂分帳', () => {
  it('分帳總和等於支出時通過', () => {
    const result = validateCustomSplit({
      total: 500,
      members: MEMBERS,
      customAmounts: { 自己: 200, 小明: 200, 小美: 100 },
    });

    expect(result.ok).toBe(true);
    expect(result.customTotal).toBe(500);
    expect(result.difference).toBe(0);
  });

  it('允許兩分錢以內的浮點尾差', () => {
    const result = validateCustomSplit({
      total: 100,
      members: MEMBERS,
      customAmounts: { 自己: 33.33, 小明: 33.33, 小美: 33.35 },
    });

    expect(result.ok).toBe(true);
    expect(result.difference).toBe(0.01);
  });

  it('分帳總和不符時會回傳差額', () => {
    const result = validateCustomSplit({
      total: 500,
      members: MEMBERS,
      customAmounts: { 自己: 200, 小明: 200, 小美: 50 },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('TOTAL_MISMATCH');
    expect(result.customTotal).toBe(450);
    expect(result.difference).toBe(-50);
  });

  it('不接受負數分帳', () => {
    const result = validateCustomSplit({
      total: 100,
      members: MEMBERS,
      customAmounts: { 自己: 120, 小明: -20, 小美: 0 },
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('NEGATIVE_AMOUNT');
    expect(result.negativeMembers).toEqual(['小明']);
  });

  it('可以計算目前自訂分帳總和', () => {
    expect(calculateCustomTotal(MEMBERS, {
      自己: '100.5',
      小明: '50',
      小美: '',
    })).toBe(150.5);
  });
});

describe('自訂分帳依比例重算', () => {
  it('保留既有比例並將總額調整為新金額', () => {
    const next = rebalanceCustomAmounts({
      total: 600,
      members: MEMBERS,
      customAmounts: { 自己: 200, 小明: 100, 小美: '' },
    });

    expect(next).toEqual({
      自己: '400',
      小明: '200',
      小美: '',
    });
  });

  it('沒有既有金額時平均分配給所有成員', () => {
    const next = rebalanceCustomAmounts({
      total: 100,
      members: MEMBERS,
      customAmounts: {},
    });

    expect(next).toEqual({
      自己: '33.33',
      小明: '33.33',
      小美: '33.34',
    });
  });

  it('總額無效時不改變表單', () => {
    expect(rebalanceCustomAmounts({
      total: 0,
      members: MEMBERS,
      customAmounts: {},
    })).toBeNull();
  });
});

describe('編輯帳目時辨識分帳方式', () => {
  it('沒有既有分帳時預設所有成員平均分帳', () => {
    expect(inferExpenseSplitState({
      expense: null,
      isEditing: false,
      members: MEMBERS,
    })).toEqual({
      type: 'EQUAL',
      involved: MEMBERS,
      customAmounts: { 自己: '', 小明: '', 小美: '' },
    });
  });

  it('正數金額近似相等時辨識為平均分帳', () => {
    const state = inferExpenseSplitState({
      expense: { split: { 自己: 33.33, 小明: 33.33, 小美: 33.34 } },
      isEditing: true,
      members: MEMBERS,
    });

    expect(state.type).toBe('EQUAL');
    expect(state.involved).toEqual(MEMBERS);
  });

  it('金額不同時辨識為自訂分帳', () => {
    const state = inferExpenseSplitState({
      expense: { split: { 自己: 70, 小明: 30, 小美: 0 } },
      isEditing: true,
      members: MEMBERS,
    });

    expect(state.type).toBe('CUSTOM');
    expect(state.involved).toEqual(['自己', '小明']);
    expect(state.customAmounts).toEqual({ 自己: '70', 小明: '30', 小美: '' });
  });
});

describe('成員餘額與個人實際負擔', () => {
  it('代墊人增加應收，參與者減少應付', () => {
    const snapshot = calculateBalanceSnapshot({
      expenses: [
        {
          cost: 900,
          payer: '自己',
          split: { 自己: 300, 小明: 300, 小美: 300 },
        },
      ],
      members: MEMBERS,
    });

    expect(snapshot.balances).toEqual({
      自己: 600,
      小明: -300,
      小美: -300,
    });
    expect(snapshot.personal).toEqual({
      自己: 300,
      小明: 300,
      小美: 300,
    });
    expect(calculateBalanceTotal(snapshot.balances)).toBe(0);
  });

  it('舊資料沒有 split 時會退回全員平均分攤', () => {
    const snapshot = calculateBalanceSnapshot({
      expenses: [{ cost: 100, payer: '小明' }],
      members: ['自己', '小明'],
    });

    expect(snapshot.balances).toEqual({ 自己: -50, 小明: 50 });
    expect(snapshot.personal).toEqual({ 自己: 50, 小明: 50 });
  });

  it('可以只計算行前支出', () => {
    const snapshot = calculateBalanceSnapshot({
      expenses: [
        { dayId: 'PRE', cost: 400, payer: '自己', split: { 自己: 200, 小明: 200 } },
        { dayId: 'Day 1', cost: 100, payer: '小明', split: { 自己: 50, 小明: 50 } },
      ],
      members: ['自己', '小明'],
      expenseFilter: (expense) => expense.dayId === 'PRE',
    });

    expect(snapshot.balances).toEqual({ 自己: 200, 小明: -200 });
  });
});

describe('結算與誰欠誰', () => {
  it('實際轉帳會正確抵銷雙方餘額且不破壞守恆', () => {
    const balances = applySettlementsToBalances({
      balances: { 自己: 500, 小明: -500 },
      settlements: [
        { scope: 'pretrip', from: '小明', to: '自己', amount: 200 },
      ],
      scope: 'pretrip',
    });

    expect(balances).toEqual({ 自己: 300, 小明: -300 });
    expect(calculateBalanceTotal(balances)).toBe(0);
  });

  it('會忽略付款人與收款人相同或無效的結算', () => {
    const balances = applySettlementsToBalances({
      balances: { 自己: 100, 小明: -100 },
      settlements: [
        { scope: 'pretrip', from: '自己', to: '自己', amount: 100 },
        { scope: 'pretrip', from: '小明', to: '自己', amount: -50 },
        { scope: 'other', from: '小明', to: '自己', amount: 50 },
      ],
      scope: 'pretrip',
    });

    expect(balances).toEqual({ 自己: 100, 小明: -100 });
  });

  it('兩人餘額會產生一筆最簡轉帳', () => {
    expect(buildSettlementTransfers({ 自己: 500, 小明: -500 })).toEqual([
      { from: '小明', to: '自己', amount: 500 },
    ]);
  });

  it('多人餘額可以產生守恆的最簡轉帳組合', () => {
    const transfers = buildSettlementTransfers({
      自己: 600,
      小明: -300,
      小美: -300,
    });

    expect(transfers).toEqual([
      { from: '小明', to: '自己', amount: 300 },
      { from: '小美', to: '自己', amount: 300 },
    ]);
  });

  it('小於門檻的浮點尾差不產生轉帳', () => {
    expect(buildSettlementTransfers({ 自己: 0.4, 小明: -0.4 })).toEqual([]);
  });

  it('會產生結算摘要供 UI 顯示應收應付與轉帳筆數', () => {
    const transfers = buildSettlementTransfers({
      自己: 600,
      小明: -300,
      小美: -300,
      小王: 0,
    });

    expect(calculateSettlementSummary({
      balances: { 自己: 600, 小明: -300, 小美: -300, 小王: 0 },
      transfers,
      members: ['自己', '小明', '小美', '小王'],
    })).toEqual({
      receivableTotal: 600,
      payableTotal: 600,
      balancedMemberCount: 1,
      receivableMemberCount: 1,
      payableMemberCount: 2,
      unsettledMemberCount: 3,
      transferCount: 2,
      transfersTotal: 600,
      isSettled: false,
    });
  });

  it('已結清時結算摘要會標示沒有未結清成員', () => {
    expect(calculateSettlementSummary({
      balances: { 自己: 0.2, 小明: -0.2 },
      members: ['自己', '小明'],
    })).toMatchObject({
      receivableTotal: 0,
      payableTotal: 0,
      balancedMemberCount: 2,
      unsettledMemberCount: 0,
      transferCount: 0,
      transfersTotal: 0,
      isSettled: true,
    });
  });
});

describe('完整支出統計', () => {
  const expenses = [
    {
      id: 'pre-1',
      dayId: 'PRE_TRIP',
      item: '機票',
      cost: 1000,
      category: 'transport',
      payer: '自己',
      split: { 自己: 500, 小明: 500 },
    },
    {
      id: 'day-1',
      dayId: 'Day 1',
      item: '午餐',
      cost: 600,
      category: 'food',
      payer: '小明',
      split: { 自己: 300, 小明: 300 },
    },
  ];

  it('總花費、行前花費與日期分組正確', () => {
    const stats = calculateExpenseStats({
      expenses,
      settlements: [],
      members: ['自己', '小明'],
      existingDays: ['Day 1', 'Day 2'],
      preTripId: 'PRE_TRIP',
    });

    expect(stats.totalExpense).toBe(1600);
    expect(stats.preTripTotal).toBe(1000);
    expect(stats.groupedExpenses.map((group) => [group.day, group.items.length])).toEqual([
      ['PRE_TRIP', 1],
      ['Day 1', 1],
      ['Day 2', 0],
    ]);
    expect(stats.balanceTotal).toBe(0);
    expect(stats.settlementSummary).toMatchObject({
      receivableTotal: 200,
      payableTotal: 200,
      transferCount: 1,
      unsettledMemberCount: 2,
    });
    expect(stats.preTripSettlementSummary).toMatchObject({
      receivableTotal: 500,
      payableTotal: 500,
      transferCount: 1,
      unsettledMemberCount: 2,
    });
  });

  it('結算只抵銷餘額，不改變總花費與個人負擔', () => {
    const before = calculateExpenseStats({
      expenses,
      settlements: [],
      members: ['自己', '小明'],
      existingDays: ['Day 1'],
      preTripId: 'PRE_TRIP',
    });
    const after = calculateExpenseStats({
      expenses,
      settlements: [
        { scope: 'pretrip', from: '小明', to: '自己', amount: 200 },
      ],
      members: ['自己', '小明'],
      existingDays: ['Day 1'],
      preTripId: 'PRE_TRIP',
    });

    expect(after.totalExpense).toBe(before.totalExpense);
    expect(after.personalSpent).toEqual(before.personalSpent);
    expect(after.preTripSettlementTotal).toBe(200);
    expect(after.preTripBalances).toEqual({ 自己: 300, 小明: -300 });
  });

  it('全部與行前餘額都維持總和為零', () => {
    const stats = calculateExpenseStats({
      expenses,
      settlements: [
        { scope: 'pretrip', from: '小明', to: '自己', amount: 200 },
      ],
      members: ['自己', '小明'],
      existingDays: ['Day 1'],
      preTripId: 'PRE_TRIP',
    });

    expect(stats.balanceTotal).toBe(0);
    expect(stats.preTripBalanceTotal).toBe(0);
  });
});

describe('分類與個人支出統計', () => {
  const expenses = [
    {
      cost: 600,
      category: 'food',
      split: { 自己: 400, 小明: 200 },
    },
    {
      cost: 300,
      category: 'transport',
      split: { 自己: 100, 小明: 200 },
    },
    {
      cost: 100,
      category: 'unknown',
      split: { 自己: 50, 小明: 50 },
    },
  ];

  it('全團分類統計依金額由大到小排列', () => {
    expect(calculateCategoryStats(expenses, CATEGORIES)).toEqual([
      { id: 'food', label: '飲食', amount: 600 },
      { id: 'transport', label: '交通', amount: 300 },
    ]);
  });

  it('個人統計依實際分攤金額而不是代墊金額', () => {
    const stats = calculateMemberCategoryStats(
      expenses,
      ['自己', '小明'],
      CATEGORIES,
    );

    expect(stats.自己.total).toBe(550);
    expect(stats.自己.categories).toEqual([
      { id: 'food', label: '飲食', amount: 400 },
      { id: 'transport', label: '交通', amount: 100 },
      { id: 'other', label: '其他', amount: 50 },
    ]);
    expect(stats.小明.total).toBe(450);
  });

  it('舊資料沒有 split 時平均計入個人分類', () => {
    const stats = calculateMemberCategoryStats(
      [{ cost: 100, category: 'food' }],
      ['自己', '小明'],
      CATEGORIES,
    );

    expect(stats.自己.total).toBe(50);
    expect(stats.小明.total).toBe(50);
  });
});
