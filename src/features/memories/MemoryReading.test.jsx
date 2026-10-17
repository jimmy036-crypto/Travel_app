import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoriesPage } from './MemoriesPage.jsx';

const memory = { roomId: 'a', title: '京都散步', destination: '京都', startDate: '2025-01-01', endDate: '2025-01-07', archived: true, note: '河邊的光', visits: {} };
describe('read-first travel memories', () => {
  it('opens the personal story when the source trip is gone', () => {
    const open = vi.fn();
    render(<MemoriesPage memories={{ a: memory }} trips={[]} onView={open} />);
    fireEvent.click(screen.getByRole('button', { name: '重溫這趟旅行' }));
    expect(open).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('button', { name: '補充回憶與到訪' })).not.toBeInTheDocument();
  });
  it('shows incomplete preservation honestly even after archiving', () => {
    render(<MemoriesPage memories={{ a: memory }} archiveSummaries={{ a: { state: 'partial', saved: 4, total: 12 } }} onView={() => {}} />);
    expect(screen.getByText(/4\/12/)).toBeVisible();
    expect(screen.getByText(/尚未全部保存/)).toBeVisible();
    expect(screen.queryByText('已永久保存')).not.toBeInTheDocument();
  });
});
