import React from 'react';
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ExpenseModal } from './UIComponents.jsx';

vi.mock('@vis.gl/react-google-maps', () => ({
  useMapsLibrary: () => null,
  useMap: () => null,
}));

vi.mock('../firebase', () => ({
  storage: null,
}));

const theme = {
  modalBg: '',
  cardBorder: '',
  mainText: '',
  subText: '',
  inputBg: '',
  cardMetaBg: '',
  cardBg: '',
};

const commonProps = {
  members: ['自己', '朋友'],
  defaultPayer: '自己',
  existingDays: ['Day 1'],
  startDate: '2026-09-20',
  defaultDay: 'Day 1',
  onClose: vi.fn(),
  onSave: vi.fn(),
  onDelete: vi.fn(),
  onDuplicate: vi.fn(),
  t: theme,
};

describe('ExpenseModal Phase 2B 表單流程', () => {
  beforeEach(() => {
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('欄位標籤與控制項正式關聯，窄螢幕表單仍保留可達控制', () => {
    const view = render(<ExpenseModal {...commonProps} />);
    expect(view.getByLabelText('項目名稱 *')).toBe(view.getByTestId('expense-item-input'));
    expect(view.getByLabelText('幣別')).toBe(view.getByTestId('expense-currency-select'));
    expect(view.getByLabelText('當地金額 *')).toBe(view.getByTestId('expense-local-cost-input'));
    expect(view.getByLabelText('換算匯率')).toBe(view.getByTestId('expense-rate-input'));
    expect(view.getByLabelText('日期')).toBe(view.getByTestId('expense-day-select'));
    expect(view.getByLabelText('備註（選填）')).toBe(view.getByTestId('expense-note-input'));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('unconfirmed payer requires an explicit choice without changing split inputs', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} defaultPayer="" onSave={onSave} />);
    expect(view.getByTestId('expense-payer-select')).toHaveValue('');
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '晚餐' } });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '1000' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    expect(onSave).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith('請選擇付款人。');
    fireEvent.change(view.getByTestId('expense-payer-select'), { target: { value: '朋友' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ payer: '朋友', cost: 1000, split: { 自己: 500, 朋友: 500 } });
  });

  it('does not overwrite an open draft when the shared preference loads or changes', () => {
    const view = render(<ExpenseModal {...commonProps} defaultPayer="" />);
    expect(view.queryByRole('button', { name: /選擇旅伴|更正旅伴/ })).not.toBeInTheDocument();
    expect(view.queryByText('記錄付款人、分攤方式與外幣金額。')).not.toBeInTheDocument();
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '草稿' } });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '420' } });
    fireEvent.change(view.getByTestId('expense-note-input'), { target: { value: '保留備註' } });
    view.rerender(<ExpenseModal {...commonProps} defaultPayer="朋友" />);
    expect(view.getByTestId('expense-payer-select')).toHaveValue('');
    fireEvent.change(view.getByTestId('expense-payer-select'), { target: { value: '自己' } });
    view.rerender(<ExpenseModal {...commonProps} defaultPayer="朋友" />);
    expect(view.getByTestId('expense-payer-select')).toHaveValue('自己');
    expect(view.getByTestId('expense-item-input')).toHaveValue('草稿');
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('420');
    expect(view.getByTestId('expense-note-input')).toHaveValue('保留備註');
    expect(view.getByTestId('expense-payer-select')).not.toHaveAttribute('aria-describedby');
  });

  it('preserves a removed source payer and blocks both save and duplicate until explicitly corrected', () => {
    const onSave = vi.fn();
    const onDuplicate = vi.fn();
    const expense = { id: 'old', payer: '已離開', item: '原帳目', cost: 1000, localCost: 1000, currency: 'TWD', exchangeRate: 1, dayId: 'Day 1', split: { 自己: 500, 朋友: 500 } };
    const view = render(<ExpenseModal {...commonProps} expense={expense} onSave={onSave} onDuplicate={onDuplicate} />);
    expect(view.getByTestId('expense-payer-select')).toHaveValue('已離開');
    expect(view.getByTestId('expense-payer-select')).toHaveAttribute('aria-invalid', 'true');
    expect(view.getByTestId('expense-payer-select')).toHaveAccessibleDescription('原付款人已不在名單，請明確選擇；其他內容會保留。');
    expect(view.queryByText('修改後，結算、預算與圓餅圖會自動重新計算。')).not.toBeInTheDocument();
    fireEvent.click(view.getByTestId('expense-save-button'));
    fireEvent.click(view.getByTestId('expense-duplicate-button'));
    expect(onSave).not.toHaveBeenCalled();
    expect(onDuplicate).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledTimes(2);
    expect(window.alert).toHaveBeenCalledWith('付款人已不在旅程成員中，請重新選擇。');
    expect(expense.payer).toBe('已離開');
  });

  it('新增平均分帳時會產生守恆的兩人分攤', async () => {
    const onSave = vi.fn();
    const view = render(
      <ExpenseModal
        {...commonProps}
        onSave={onSave}
      />,
    );

    expect(view.getByTestId('expense-payer-select')).toHaveValue('自己');
    expect(view.queryByRole('button', { name: /選擇旅伴|更正旅伴/ })).not.toBeInTheDocument();
    fireEvent.change(view.getByTestId('expense-item-input'), {
      target: { value: '測試晚餐' },
    });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), {
      target: { value: '1000' },
    });
    fireEvent.click(view.getByTestId('expense-save-button'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(onSave.mock.calls[0][0]).toMatchObject({
      item: '測試晚餐',
      cost: 1000,
      payer: '自己',
      split: {
        自己: 500,
        朋友: 500,
      },
    });
  });

  it('切換日幣與自訂分帳時會正確換算及保存', async () => {
    const onSave = vi.fn();
    const view = render(
      <ExpenseModal
        {...commonProps}
        onSave={onSave}
      />,
    );

    fireEvent.change(view.getByTestId('expense-item-input'), {
      target: { value: '日本住宿' },
    });
    fireEvent.change(view.getByTestId('expense-currency-select'), {
      target: { value: 'JPY' },
    });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), {
      target: { value: '2000' },
    });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));

    fireEvent.change(
      view.getByLabelText('自己 自訂分帳金額（JPY）'),
      { target: { value: '1500' } },
    );
    fireEvent.change(
      view.getByLabelText('朋友 自訂分帳金額（JPY）'),
      { target: { value: '500' } },
    );

    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('420');
    expect(view.getByTestId('expense-custom-total')).toHaveTextContent(
      '2,000 / 2,000',
    );

    fireEvent.click(view.getByTestId('expense-save-button'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    expect(onSave.mock.calls[0][0]).toMatchObject({
      item: '日本住宿',
      cost: 420,
      localCost: 2000,
      currency: 'JPY',
      exchangeRate: 0.21,
      split: {
        自己: 315,
        朋友: 105,
      },
    });
  });

  it('以目前幣別輸入分帳並依比例重算，儲存時仍維持台幣守恆', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '日本車資' } });
    fireEvent.change(view.getByTestId('expense-currency-select'), { target: { value: 'JPY' } });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '1500' } });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));
    expect(view.getByLabelText('自己 自訂分帳金額（JPY）')).toHaveAccessibleName('自己 自訂分帳金額（JPY）');
    fireEvent.change(view.getByLabelText('自己 自訂分帳金額（JPY）'), { target: { value: '1000' } });
    fireEvent.change(view.getByLabelText('朋友 自訂分帳金額（JPY）'), { target: { value: '500' } });
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('1500');
    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('315');

    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '3000' } });
    fireEvent.click(view.getByRole('button', { name: '依比例重算' }));
    expect(view.getByLabelText('自己 自訂分帳金額（JPY）')).toHaveValue('2000');
    expect(view.getByLabelText('朋友 自訂分帳金額（JPY）')).toHaveValue('1000');
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      localCost: 3000,
      currency: 'JPY',
      cost: 630,
      split: { 自己: 420, 朋友: 210 },
    });
  });

  it('幣別切換時換算尚未儲存的分帳，而不是靜默改變金額單位', () => {
    const view = render(<ExpenseModal {...commonProps} />);
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '420' } });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));
    fireEvent.change(view.getByLabelText('自己 自訂分帳金額（TWD）'), { target: { value: '300' } });
    fireEvent.change(view.getByLabelText('朋友 自訂分帳金額（TWD）'), { target: { value: '120' } });
    fireEvent.change(view.getByTestId('expense-currency-select'), { target: { value: 'JPY' } });
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('2000');
    expect(view.getByLabelText('自己 自訂分帳金額（JPY）')).toHaveValue('1428.57');
    expect(view.getByLabelText('朋友 自訂分帳金額（JPY）')).toHaveValue('571.43');
    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('420');
  });

  it('多人切換幣別時，分位數尾差不會讓分帳總和失衡', async () => {
    const onSave = vi.fn();
    const members = Array.from({ length: 10 }, (_, index) => `旅伴${index + 1}`);
    const view = render(<ExpenseModal {...commonProps} members={members} defaultPayer={members[0]} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '團體門票' } });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '1000' } });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));
    members.forEach((member) => {
      fireEvent.change(view.getByLabelText(`${member} 自訂分帳金額（TWD）`), { target: { value: '100' } });
    });
    fireEvent.change(view.getByTestId('expense-currency-select'), { target: { value: 'USD' } });
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('30.77');
    expect(view.getByTestId('expense-custom-total')).toHaveTextContent('30.77 / 30.77');
    expect(view.getByLabelText('旅伴10 自訂分帳金額（USD）')).toHaveValue('3.14');
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.cost).toBe(1000);
    expect(Object.values(saved.split).reduce((sum, share) => sum + share, 0)).toBe(1000);
  });

  it('編輯既有外幣帳目只改名稱時，保留原本精確台幣分攤', async () => {
    const onSave = vi.fn();
    const expense = {
      id: 'foreign-1', dayId: 'Day 1', item: '日本住宿', cost: 420,
      localCost: 2000, currency: 'JPY', exchangeRate: 0.21,
      payer: '自己', split: { 自己: 300, 朋友: 120 },
    };
    const view = render(<ExpenseModal {...commonProps} expense={expense} onSave={onSave} />);
    expect(view.getByLabelText('自己 自訂分帳金額（JPY）')).toHaveValue('1428.57');
    expect(view.getByLabelText('朋友 自訂分帳金額（JPY）')).toHaveValue('571.43');
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '住宿與早餐' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      item: '住宿與早餐', cost: 420, localCost: 2000,
      split: { 自己: 300, 朋友: 120 },
    });
    expect(expense.split).toEqual({ 自己: 300, 朋友: 120 });
  });

  it('外幣尾差依比例分配後，台幣分攤仍精確等於總額', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '小額共購' } });
    fireEvent.change(view.getByTestId('expense-currency-select'), { target: { value: 'JPY' } });
    fireEvent.change(view.getByTestId('expense-rate-input'), { target: { value: '2.5' } });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));
    fireEvent.change(view.getByLabelText('自己 自訂分帳金額（JPY）'), { target: { value: '1' } });
    fireEvent.change(view.getByLabelText('朋友 自訂分帳金額（JPY）'), { target: { value: '2' } });
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('3');
    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('8');
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      cost: 8, split: { 自己: 2.66, 朋友: 5.34 },
    });
  });

  it('金額欄可算加減乘除與括號，完成輸入後顯示結果再保存', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '合計餐費' } });
    const amount = view.getByTestId('expense-local-cost-input');
    fireEvent.change(amount, { target: { value: '(100+20)*3-80/4' } });
    fireEvent.blur(amount);
    expect(amount).toHaveValue('340');
    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('340');
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ cost: 340, localCost: 340 });
  });

  it('分帳與多人實付也可輸入算式；錯誤算式與除以零不得寫入', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '共乘車資' } });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '400' } });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));
    fireEvent.change(view.getByLabelText('自己 自訂分帳金額（TWD）'), { target: { value: '100+50' } });
    fireEvent.change(view.getByLabelText('朋友 自訂分帳金額（TWD）'), { target: { value: '500/2' } });
    fireEvent.click(view.getByTestId('expense-multiple-payers-toggle'));
    fireEvent.change(view.getByLabelText('自己 實付金額'), { target: { value: '100*3' } });
    fireEvent.change(view.getByLabelText('朋友 實付金額'), { target: { value: '200/2' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({
      cost: 400,
      split: { 自己: 150, 朋友: 250 },
      payments: { 自己: 300, 朋友: 100 },
    });

    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '400/0' } });
    fireEvent.blur(view.getByTestId('expense-local-cost-input'));
    expect(view.getByTestId('expense-local-cost-input')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(view.getByTestId('expense-save-button'));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('新帳目採用旅程預設幣別與當天日期，但編輯不覆寫原值', () => {
    const view = render(<ExpenseModal {...commonProps} existingDays={['Day 1', 'Day 2']} defaultDay="Day 2" defaultCurrency="JPY" />);
    expect(view.getByTestId('expense-currency-select')).toHaveValue('JPY');
    expect(view.getByTestId('expense-day-select')).toHaveValue('Day 2');
    view.rerender(<ExpenseModal {...commonProps} existingDays={['Day 1', 'Day 2']} defaultDay="Day 1" defaultCurrency="USD" />);
    expect(view.getByTestId('expense-currency-select')).toHaveValue('JPY');
    expect(view.getByTestId('expense-day-select')).toHaveValue('Day 2');
  });

  it('舊帳目沒有幣別時仍按台幣編輯，不被新旅程預設改寫', () => {
    const expense = { id: 'legacy', dayId: 'Day 1', item: '舊餐費', cost: 100, payer: '自己', split: { 自己: 50, 朋友: 50 } };
    const view = render(<ExpenseModal {...commonProps} expense={expense} defaultCurrency="JPY" />);
    expect(view.getByTestId('expense-currency-select')).toHaveValue('TWD');
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('100');
  });

  it('自訂固定分攤輸入後自動推算帳目總額', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '電影' } });
    fireEvent.click(view.getByTestId('expense-split-custom-button'));
    fireEvent.change(view.getByLabelText('自己 自訂分帳金額（TWD）'), { target: { value: '300' } });
    fireEvent.change(view.getByLabelText('朋友 自訂分帳金額（TWD）'), { target: { value: '120' } });
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('420');
    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('420');
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ cost: 420, split: { 自己: 300, 朋友: 120 } });
  });

  it('多人實付需合計等於支出，儲存各人實付而不更動分帳', async () => {
    const onSave = vi.fn();
    const view = render(<ExpenseModal {...commonProps} onSave={onSave} />);
    fireEvent.change(view.getByTestId('expense-item-input'), { target: { value: '包車' } });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), { target: { value: '1000' } });
    fireEvent.click(view.getByTestId('expense-multiple-payers-toggle'));
    fireEvent.change(view.getByLabelText('自己 實付金額'), { target: { value: '700' } });
    fireEvent.change(view.getByLabelText('朋友 實付金額'), { target: { value: '200' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(view.getByLabelText('朋友 實付金額'), { target: { value: '300' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0]).toMatchObject({ cost: 1000, payments: { 自己: 700, 朋友: 300 }, split: { 自己: 500, 朋友: 500 } });
  });

  it('編輯多人付款時成員離開會提示並要求重新分配實付', async () => {
    const onSave = vi.fn();
    const expense = { id: 'multi', dayId: 'Day 1', item: '包車', cost: 1000, localCost: 1000, currency: 'TWD', exchangeRate: 1, payer: '自己', payments: { 自己: 700, 朋友: 300 }, split: { 自己: 500, 朋友: 500 } };
    const view = render(<ExpenseModal {...commonProps} members={['自己', '新朋友']} expense={expense} onSave={onSave} />);
    expect(view.getByText(/原付款人朋友已不在旅伴名單/)).toBeInTheDocument();
    fireEvent.click(view.getByTestId('expense-save-button'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(view.getByLabelText('新朋友 實付金額'), { target: { value: '300' } });
    fireEvent.click(view.getByTestId('expense-save-button'));
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(view.container.querySelector('[data-testid="expense-involved-member"][data-member="新朋友"]'));
    fireEvent.click(view.getByTestId('expense-save-button'));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].payments).toEqual({ 自己: 700, 新朋友: 300 });
    expect(onSave.mock.calls[0][0].split).toEqual({ 自己: 500, 新朋友: 500 });
  });

  it('編輯模式確認後可以刪除指定帳目', () => {
    const onDelete = vi.fn();
    const view = render(
      <ExpenseModal
        {...commonProps}
        expense={{
          id: 'expense-delete-test',
          dayId: 'Day 1',
          item: '待刪除帳目',
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
          note: '',
          createdAt: 1,
          updatedAt: 1,
        }}
        onDelete={onDelete}
      />,
    );

    fireEvent.click(view.getByTestId('expense-delete-button'));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(onDelete).toHaveBeenCalledWith('expense-delete-test');
  });

  it('preserves the expense form when saving fails', async () => {
    const onSave = vi.fn(async () => {
      throw new Error('save failed');
    });
    const view = render(
      <ExpenseModal
        {...commonProps}
        onSave={onSave}
      />,
    );

    fireEvent.change(view.getByTestId('expense-item-input'), {
      target: { value: '失敗保留晚餐' },
    });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), {
      target: { value: '880' },
    });
    fireEvent.change(view.getByTestId('expense-note-input'), {
      target: { value: '表單內容不可遺失' },
    });
    fireEvent.click(view.getByTestId('expense-save-button'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(view.getByTestId('expense-save-button')).not.toBeDisabled();
    });
    expect(view.getByTestId('expense-modal')).toBeInTheDocument();
    expect(view.getByTestId('expense-item-input')).toHaveValue('失敗保留晚餐');
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue('880');
    expect(view.getByTestId('expense-note-input')).toHaveValue('表單內容不可遺失');
  });

  it('prevents duplicate expense submissions while saving', async () => {
    const onSave = vi.fn(() => new Promise(() => {}));
    const view = render(
      <ExpenseModal
        {...commonProps}
        onSave={onSave}
      />,
    );

    fireEvent.change(view.getByTestId('expense-item-input'), {
      target: { value: '防止重複送出' },
    });
    fireEvent.change(view.getByTestId('expense-local-cost-input'), {
      target: { value: '1200' },
    });

    fireEvent.click(view.getByTestId('expense-save-button'));
    fireEvent.click(view.getByTestId('expense-save-button'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });
    expect(view.getByTestId('expense-save-button')).toBeDisabled();
  });
});
