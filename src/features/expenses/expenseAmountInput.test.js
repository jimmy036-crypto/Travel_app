import { describe, expect, it } from 'vitest';
import { parseExpenseAmount, parseOptionalExpenseAmount } from './expenseAmountInput.js';

describe('expense amount expressions', () => {
  it('uses ordinary precedence and parentheses, then rounds to cents', () => {
    expect(parseExpenseAmount('120+80*2')).toEqual({ ok: true, value: 280 });
    expect(parseExpenseAmount('(120+80)*2')).toEqual({ ok: true, value: 400 });
    expect(parseExpenseAmount('100 ÷ 4 − 0.1')).toEqual({ ok: true, value: 24.9 });
    expect(parseExpenseAmount('1/3')).toEqual({ ok: true, value: 0.33 });
    expect(parseExpenseAmount('0.1+0.2')).toEqual({ ok: true, value: 0.3 });
  });

  it('rejects incomplete, unsafe, negative and zero-division expressions', () => {
    expect(parseExpenseAmount('100+')).toEqual({ ok: false, error: 'INVALID_EXPRESSION' });
    expect(parseExpenseAmount('1/0')).toEqual({ ok: false, error: 'DIVIDE_BY_ZERO' });
    expect(parseExpenseAmount('100-200')).toEqual({ ok: false, error: 'NEGATIVE_AMOUNT' });
    expect(parseExpenseAmount('window.alert(1)')).toEqual({ ok: false, error: 'INVALID_EXPRESSION' });
    expect(parseOptionalExpenseAmount('')).toEqual({ ok: true, value: 0 });
  });
});
