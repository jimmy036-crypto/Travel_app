import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { MemoryConflictDialog } from './MemoryConflictDialog.jsx';
import { createJournalConflict } from './journalDraftStore.js';

it('shows both competing values and blocks resolution until every conflict is chosen', () => {
  const onResolve = vi.fn();
  const conflict = createJournalConflict({ baseValue: { note: 'old' }, localValue: { note: 'mine' }, value: { note: 'theirs' }, revision: 2 });
  render(<MemoryConflictDialog conflict={conflict} onResolve={onResolve} onClose={() => {}} />);
  expect(screen.getByText('mine')).toBeInTheDocument();
  expect(screen.getByText('theirs')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '套用選擇並繼續編輯' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('保留我的內容：旅行感想'));
  fireEvent.click(screen.getByRole('button', { name: '套用選擇並繼續編輯' }));
  expect(onResolve).toHaveBeenCalledWith({ '/note': 'local' });
});
