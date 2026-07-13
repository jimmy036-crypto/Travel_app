import { useCallback } from 'react';
import { ref as dbRef, update } from 'firebase/database';

export function useExpenseActions({
  room,
  data,
  state,
  refs,
  feedback,
  callbacks,
}) {
  const { db, roomId } = room;
  const { expenses } = data;
  const { setExpensesState, setSyncStatus } = state;
  const { dirtyBranchesRef, lastLocalWriteAtRef, expenseDeleteConfirmRef } = refs;
  const { confirm, toast } = feedback;
  const { closeExpenseEditor } = callbacks;

  const saveExpense = useCallback(async (nextExpense) => {
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const exists = safeExpenses.some((expense) => String(expense.id) === String(nextExpense.id));
    const nextExpenses = exists
      ? safeExpenses.map((expense) => (String(expense.id) === String(nextExpense.id) ? nextExpense : expense))
      : [...safeExpenses, nextExpense];

    try {
      if (!db || !roomId) {
        setExpensesState(nextExpenses);
      } else {
        setSyncStatus('saving');
        lastLocalWriteAtRef.current = Date.now();
        await update(dbRef(db, `rooms/${roomId}`), { expenses: nextExpenses });

        dirtyBranchesRef.current.expenses = false;
        lastLocalWriteAtRef.current = Date.now();
        setExpensesState(nextExpenses);
        setSyncStatus('saved');
      }

      closeExpenseEditor();
      toast.success({
        title: exists ? '費用已更新' : '費用已新增',
        description: exists ? '最新分帳結果已同步給協作者。' : '分帳與結算統計已更新。',
      });
    } catch (error) {
      console.error('Save expense failed:', error);
      setSyncStatus('error');
      toast.error({
        title: exists ? '無法更新費用' : '無法新增費用',
        description: '請檢查網路連線後再試一次。',
      });
      throw error;
    }
  }, [closeExpenseEditor, db, dirtyBranchesRef, expenses, lastLocalWriteAtRef, roomId, setExpensesState, setSyncStatus, toast]);

  const deleteExpense = useCallback(async (expenseId) => {
    if (expenseDeleteConfirmRef.current) return;
    expenseDeleteConfirmRef.current = true;

    try {
      const shouldDelete = await confirm({
        title: '刪除這筆費用？',
        description: '刪除後，這筆費用與相關分帳統計會從所有協作者的畫面中移除。',
        cancelLabel: '保留費用',
        confirmLabel: '刪除費用',
        danger: true,
      });

      if (!shouldDelete) return;

      const targetId = String(expenseId || '');
      const safeExpenses = Array.isArray(expenses) ? expenses : [];
      const nextExpenses = safeExpenses.filter((expense) => String(expense.id) !== targetId);

      if (!targetId || nextExpenses.length === safeExpenses.length) return;

      if (!db || !roomId) {
        throw new Error('Realtime Database is not available for expense deletion.');
      }

      setSyncStatus('saving');
      lastLocalWriteAtRef.current = Date.now();
      await update(dbRef(db, `rooms/${roomId}`), { expenses: nextExpenses });

      dirtyBranchesRef.current.expenses = false;
      lastLocalWriteAtRef.current = Date.now();
      setExpensesState(nextExpenses);
      closeExpenseEditor();
      setSyncStatus('saved');
      toast.success({
        title: '費用已刪除',
        description: '分帳與結算統計已更新。',
      });
    } catch (error) {
      console.error('Delete expense failed:', error);
      setSyncStatus('error');
      toast.error({
        title: '無法刪除費用',
        description: '請檢查網路連線後再試一次。',
      });
    } finally {
      expenseDeleteConfirmRef.current = false;
    }
  }, [closeExpenseEditor, confirm, db, dirtyBranchesRef, expenseDeleteConfirmRef, expenses, lastLocalWriteAtRef, roomId, setExpensesState, setSyncStatus, toast]);

  return {
    saveExpense,
    deleteExpense,
  };
}
