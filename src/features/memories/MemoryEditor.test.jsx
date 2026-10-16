import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryEditor } from './MemoryEditor.jsx';

const trip = { roomId: 'trip-a', title: '京都散步', startDate: '2025-04-01', endDate: '2025-04-03' };
const candidates = [{ visitId: 'day1~p1', dayId: 'day1', itemId: 'p1', name: '美術館', lat: 35, lng: 135, date: '2025-04-01' }];

describe('MemoryEditor', () => {
  it('archives a restored memory again when opened from the home archive action', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor trip={trip} memory={{ revision: 2, archived: false, note: '保留的感想' }} archive onSave={save} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ archived: true, revision: 2, note: '保留的感想' })));
  });
  it('allows archiving without claiming any planned place was visited', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor trip={trip} candidates={candidates} onSave={save} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ archived: true, visits: {}, revision: 0 })));
  });

  it('requires a confirmed city for visited places and retains input on failed save', async () => {
    const save = vi.fn().mockRejectedValue(new Error('請重新載入後再試'));
    render(<MemoryEditor trip={trip} candidates={candidates} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('美術館的到訪狀態'), { target: { value: 'visited' } });
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('美術館的城市／地區'), { target: { value: '日本・京都' } });
    fireEvent.change(screen.getByLabelText('這趟旅行的感想'), { target: { value: '下雨也很美' } });
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('請重新載入後再試');
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('下雨也很美');
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ visits: { 'day1~p1': expect.objectContaining({ city: '日本・京都', status: 'visited' }) } }));
  });

  it('disables writes while offline without discarding existing decisions', () => {
    render(<MemoryEditor trip={trip} candidates={candidates} memory={{ revision: 3, archived: true, note: '想再來', visits: {} }} isOnline={false} onSave={vi.fn()} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '儲存回憶' })).toBeDisabled();
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('想再來');
  });
});
