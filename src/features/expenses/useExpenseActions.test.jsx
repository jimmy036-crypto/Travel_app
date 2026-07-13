import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useExpenseActions } from './useExpenseActions.js';

const firebaseMocks = vi.hoisted(() => ({
  ref: vi.fn((_db, path) => ({ path })),
  update: vi.fn(async () => undefined),
}));

vi.mock('firebase/database', () => ({
  ref: firebaseMocks.ref,
  update: firebaseMocks.update,
}));

describe('useExpenseActions', () => {
  let mockRoom;
  let mockData;
  let mockState;
  let mockRefs;
  let mockFeedback;
  let mockCallbacks;

  beforeEach(() => {
    firebaseMocks.ref.mockClear();
    firebaseMocks.update.mockReset();
    firebaseMocks.update.mockResolvedValue(undefined);

    mockRoom = {
      db: { app: 'mock-db' },
      roomId: 'test-room',
    };

    mockData = {
      expenses: [{ id: 'expense-1', amount: 100 }],
    };

    mockState = {
      setExpensesState: vi.fn(),
      setSyncStatus: vi.fn(),
    };

    mockRefs = {
      dirtyBranchesRef: { current: { expenses: true } },
      lastLocalWriteAtRef: { current: 0 },
      expenseDeleteConfirmRef: { current: false },
    };

    mockFeedback = {
      confirm: vi.fn().mockResolvedValue(true),
      toast: {
        success: vi.fn(),
        error: vi.fn(),
      },
    };

    mockCallbacks = {
      closeExpenseEditor: vi.fn(),
    };
  });

  const renderExpenseActions = () => {
    return renderHook(() => useExpenseActions({
      room: mockRoom,
      data: mockData,
      state: mockState,
      refs: mockRefs,
      feedback: mockFeedback,
      callbacks: mockCallbacks,
    }));
  };

  it('1. create success', async () => {
    const { result } = renderExpenseActions();
    const newExpense = { id: 'expense-2', amount: 200 };

    await act(async () => {
      await result.current.saveExpense(newExpense);
    });

    expect(firebaseMocks.update).toHaveBeenCalledTimes(1);
    expect(mockState.setExpensesState).toHaveBeenCalledWith([
      { id: 'expense-1', amount: 100 },
      { id: 'expense-2', amount: 200 },
    ]);
    expect(mockState.setSyncStatus).toHaveBeenCalledWith('saved');
    expect(mockCallbacks.closeExpenseEditor).toHaveBeenCalledTimes(1);
    expect(mockFeedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '費用已新增' }));
  });

  it('2. create failure', async () => {
    const { result } = renderExpenseActions();
    const newExpense = { id: 'expense-2', amount: 200 };
    firebaseMocks.update.mockRejectedValueOnce(new Error('Network error'));

    await expect(async () => {
      await act(async () => {
        await result.current.saveExpense(newExpense);
      });
    }).rejects.toThrow('Network error');

    expect(mockState.setExpensesState).not.toHaveBeenCalled();
    expect(mockState.setSyncStatus).toHaveBeenCalledWith('error');
    expect(mockCallbacks.closeExpenseEditor).not.toHaveBeenCalled();
    expect(mockFeedback.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: '無法新增費用' }));
  });

  it('3. update success', async () => {
    const { result } = renderExpenseActions();
    const updatedExpense = { id: 'expense-1', amount: 150 };

    await act(async () => {
      await result.current.saveExpense(updatedExpense);
    });

    expect(firebaseMocks.update).toHaveBeenCalledTimes(1);
    expect(mockState.setExpensesState).toHaveBeenCalledWith([
      { id: 'expense-1', amount: 150 },
    ]);
    expect(mockCallbacks.closeExpenseEditor).toHaveBeenCalledTimes(1);
    expect(mockFeedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '費用已更新' }));
  });

  it('4. update failure', async () => {
    const { result } = renderExpenseActions();
    const updatedExpense = { id: 'expense-1', amount: 150 };
    firebaseMocks.update.mockRejectedValueOnce(new Error('Network error'));

    await expect(async () => {
      await act(async () => {
        await result.current.saveExpense(updatedExpense);
      });
    }).rejects.toThrow('Network error');

    expect(mockState.setExpensesState).not.toHaveBeenCalled();
    expect(mockCallbacks.closeExpenseEditor).not.toHaveBeenCalled();
    expect(mockFeedback.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: '無法更新費用' }));
  });

  it('5. delete cancel', async () => {
    const { result } = renderExpenseActions();
    mockFeedback.confirm.mockResolvedValueOnce(false);

    await act(async () => {
      await result.current.deleteExpense('expense-1');
    });

    expect(firebaseMocks.update).not.toHaveBeenCalled();
    expect(mockState.setExpensesState).not.toHaveBeenCalled();
    expect(mockCallbacks.closeExpenseEditor).not.toHaveBeenCalled();
  });

  it('6. delete success', async () => {
    const { result } = renderExpenseActions();

    await act(async () => {
      await result.current.deleteExpense('expense-1');
    });

    expect(mockFeedback.confirm).toHaveBeenCalled();
    expect(firebaseMocks.update).toHaveBeenCalledTimes(1);
    expect(mockState.setExpensesState).toHaveBeenCalledWith([]);
    expect(mockCallbacks.closeExpenseEditor).toHaveBeenCalledTimes(1);
    expect(mockFeedback.toast.success).toHaveBeenCalledWith(expect.objectContaining({ title: '費用已刪除' }));
    expect(mockRefs.expenseDeleteConfirmRef.current).toBe(false);
  });

  it('7. delete failure', async () => {
    const { result } = renderExpenseActions();
    firebaseMocks.update.mockRejectedValueOnce(new Error('Network error'));

    await act(async () => {
      await result.current.deleteExpense('expense-1');
    });

    expect(mockState.setExpensesState).not.toHaveBeenCalled();
    expect(mockState.setSyncStatus).toHaveBeenCalledWith('error');
    expect(mockCallbacks.closeExpenseEditor).not.toHaveBeenCalled();
    expect(mockFeedback.toast.error).toHaveBeenCalledWith(expect.objectContaining({ title: '無法刪除費用' }));
    expect(mockRefs.expenseDeleteConfirmRef.current).toBe(false);
  });

  it('8. duplicate delete prevention', async () => {
    const { result } = renderExpenseActions();
    mockRefs.expenseDeleteConfirmRef.current = true;

    await act(async () => {
      await result.current.deleteExpense('expense-1');
    });

    expect(mockFeedback.confirm).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('9. Firebase failure 不會提前修改本地 state', async () => {
    const { result } = renderExpenseActions();
    const newExpense = { id: 'expense-2', amount: 200 };
    firebaseMocks.update.mockRejectedValueOnce(new Error('Network error'));

    await expect(async () => {
      await act(async () => {
        await result.current.saveExpense(newExpense);
      });
    }).rejects.toThrow('Network error');

    // state modification happens after update
    expect(mockState.setExpensesState).not.toHaveBeenCalled();
  });

  it('10. 成功與失敗 callback／Toast 正確觸發', async () => {
    const { result } = renderExpenseActions();
    const newExpense = { id: 'expense-2', amount: 200 };

    await act(async () => {
      await result.current.saveExpense(newExpense);
    });

    expect(mockFeedback.toast.success).toHaveBeenCalled();
    expect(mockCallbacks.closeExpenseEditor).toHaveBeenCalled();
  });
});
