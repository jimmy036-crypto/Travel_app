import { describe, expect, it } from 'vitest';
import { getSuggestedExpenseCurrency, resolveExpenseDefaultDay } from './expenseDefaults.js';

describe('新帳目預設值', () => {
  it('根據目的地建議既有幣別並允許旅程覆寫', () => {
    expect(getSuggestedExpenseCurrency({ destination: '日本・大阪' })).toBe('JPY');
    expect(getSuggestedExpenseCurrency({ destination: '首爾' })).toBe('KRW');
    expect(getSuggestedExpenseCurrency({ destination: '法國巴黎' })).toBe('EUR');
    expect(getSuggestedExpenseCurrency({ destination: '未知目的地' })).toBe('TWD');
    expect(getSuggestedExpenseCurrency({ destination: '日本', expenseCurrency: 'USD' })).toBe('USD');
    expect(getSuggestedExpenseCurrency({ destination: '日本', expenseCurrency: 'INVALID' })).toBe('JPY');
  });

  it('今天在旅程中時預設當日，否則保留使用者正在看的日期', () => {
    const days = ['PRE_TRIP', 'Day 1', 'Day 2', 'Day 3'];
    expect(resolveExpenseDefaultDay({ startDate: '2026-09-22', days, selectedDay: 'Day 1', now: new Date(2026, 8, 23, 23) })).toBe('Day 2');
    expect(resolveExpenseDefaultDay({ startDate: '2026-09-22', days, selectedDay: 'Day 3', now: new Date(2026, 8, 28) })).toBe('Day 3');
    expect(resolveExpenseDefaultDay({ startDate: '', days, selectedDay: 'Day 3', now: new Date(2026, 8, 23) })).toBe('Day 3');
  });
});
