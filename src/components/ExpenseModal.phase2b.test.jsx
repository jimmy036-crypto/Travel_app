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

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('新增平均分帳時會產生守恆的兩人分攤', async () => {
    const onSave = vi.fn();
    const view = render(
      <ExpenseModal
        {...commonProps}
        onSave={onSave}
      />,
    );

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
      view.getByLabelText('自己 自訂分帳金額'),
      { target: { value: '300' } },
    );
    fireEvent.change(
      view.getByLabelText('朋友 自訂分帳金額'),
      { target: { value: '120' } },
    );

    expect(view.getByTestId('expense-twd-total')).toHaveTextContent('420');
    expect(view.getByTestId('expense-custom-total')).toHaveTextContent(
      '420 / 420',
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
        自己: 300,
        朋友: 120,
      },
    });
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
    expect(view.getByTestId('expense-local-cost-input')).toHaveValue(880);
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
