import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryEditor } from './MemoryEditor.jsx';
import { readJournalDraft } from './journalDraftStore.js';
import userEvent from '@testing-library/user-event';

const trip = { roomId: 'trip-a', title: '京都散步', startDate: '2025-04-01', endDate: '2025-04-03' };
const candidates = [{ visitId: 'day1~p1', dayId: 'day1', itemId: 'p1', name: '美術館', lat: 35, lng: 135, date: '2025-04-01' }];
const cities = [{ cityId: 'kyoto', city: '日本・京都', country: '日本', cityLat: 35, cityLng: 135 }];
vi.mock('@vis.gl/react-google-maps', () => ({ useMapsLibrary: () => null, useMap: () => null }));
beforeEach(() => localStorage.clear());

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
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={candidates} cities={cities} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('美術館的到訪狀態'), { target: { value: 'visited' } });
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('美術館的城市／地區'), { target: { value: '日本・京都' } });
    fireEvent.click(screen.getByRole('option', { name: '日本・京都・日本' }));
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
  it('focuses the missing city and applies bulk status only to selected places', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={[...candidates, { visitId: 'day2~p2', dayId: 'day2', name: '車站' }]} cities={cities} onSave={save} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('選取美術館'));
    fireEvent.change(screen.getByLabelText('批次到訪狀態'), { target: { value: 'visited' } });
    fireEvent.click(screen.getByRole('button', { name: '套用到選取地點' }));
    expect(screen.getByLabelText('車站的到訪狀態')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(screen.getByLabelText('美術館的城市／地區')).toHaveFocus();
    fireEvent.click(screen.getByRole('option', { name: '日本・京都・日本' }));
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ visits: { 'day1~p1': expect.objectContaining({ cityId: 'kyoto', status: 'visited' }) } })));
  });
  it.each(['close', 'escape', 'backdrop'])('protects dirty input when leaving through %s', (method) => {
    const onClose = vi.fn();
    render(<MemoryEditor accountUid="alice" trip={trip} onSave={vi.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('這趟旅行的感想'), { target: { value: '保留這句' } });
    if (method === 'close') fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    if (method === 'escape') fireEvent.keyDown(document, { key: 'Escape' });
    if (method === 'backdrop') fireEvent.mouseDown(screen.getByTestId('memory-editor'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '離開編輯？' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '繼續編輯' }));
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('保留這句');
  });
  it('preserves both versions and saves only after explicit conflict choice', async () => {
    const save = vi.fn().mockResolvedValue({});
    const { rerender } = render(<MemoryEditor accountUid="alice" trip={trip} memory={{ revision: 1, note: 'old' }} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('這趟旅行的感想'), { target: { value: 'mine' } });
    rerender(<MemoryEditor accountUid="alice" trip={trip} memory={{ revision: 2, note: 'theirs' }} onSave={save} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '儲存回憶' }));
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('保留我的內容：旅行感想'));
    fireEvent.click(screen.getByRole('button', { name: '套用選擇並繼續編輯' }));
    fireEvent.click(screen.getByRole('button', { name: '儲存回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, note: 'mine' })));
  });
  it('adds a manual visit without modifying the original itinerary', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor accountUid="alice" trip={trip} cities={cities} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('補登地點名稱'), { target: { value: '河畔咖啡' } });
    fireEvent.click(screen.getByRole('button', { name: '新增補登地點' }));
    fireEvent.focus(screen.getByLabelText('河畔咖啡的城市／地區'));
    fireEvent.click(screen.getByRole('option', { name: '日本・京都・日本' }));
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const visits = save.mock.calls[0][0].visits;
    expect(Object.keys(visits)[0]).toMatch(/^manual~/);
    expect(Object.values(visits)[0]).toMatchObject({ source: 'manual', name: '河畔咖啡', date: '2025-04-01', cityId: 'kyoto', status: 'visited' });
  });
  it('keeps an unfinished manual entry in the local draft and asks to add it before saving', () => {
    const save = vi.fn();
    render(<MemoryEditor accountUid="alice" trip={trip} onSave={save} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('補登地點名稱'), { target: { value: '還沒加的咖啡店' } });
    expect(readJournalDraft({ uid: 'alice', kind: 'memory', recordId: trip.roomId }).draft.value.pendingManualName).toBe('還沒加的咖啡店');
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('補登');
  });
  it('shows the current first-experience owner and requires an explicit move', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor accountUid="alice" trip={trip} memories={{ other: { title: '東京', firsts: { solo: '第一趟獨旅' } } }} onSave={save} onClose={() => {}} />);
    expect(screen.getByText('已指定給「東京」')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('將第一趟獨旅從「東京」改指定為這趟旅行'));
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ firsts: { solo: '第一趟獨旅' }, reassignFirsts: ['solo'] })));
  });
  it('handles seven days and forty places with keyboard selection without marking other places visited', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue({});
    const manyPlaces = Array.from({ length: 40 }, (_, i) => ({ visitId: `day${Math.floor(i / 6) + 1}~p${i}`, dayId: `day${Math.floor(i / 6) + 1}`, name: `景點${i}` }));
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={manyPlaces} cities={[...cities, { cityId: 'tokyo', city: '東京', country: '日本', cityLat: 35.6, cityLng: 139.7 }, { cityId: 'osaka', city: '大阪', country: '日本', cityLat: 34.7, cityLng: 135.5 }]} onSave={save} onClose={() => {}} />);
    const selectDay = screen.getByLabelText('選取day1全部地點');
    selectDay.focus(); await user.keyboard(' ');
    await user.selectOptions(screen.getByLabelText('批次到訪狀態'), 'visited');
    await user.click(screen.getByLabelText('批次城市／地區'));
    await user.click(screen.getByRole('option', { name: '日本・京都・日本' }));
    await user.click(screen.getByRole('button', { name: '套用到選取地點' }));
    expect(screen.getByLabelText('景點6的到訪狀態')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.keys(save.mock.calls[0][0].visits)).toHaveLength(6);
    expect(Object.values(save.mock.calls[0][0].visits).every((visit) => visit.cityId === 'kyoto' && visit.status === 'visited')).toBe(true);
  });
  it('makes failed local backup visible and requires confirmation before losing the input', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const onClose = vi.fn();
    render(<MemoryEditor accountUid="alice" trip={trip} onSave={vi.fn()} onClose={onClose} />);
    fireEvent.change(screen.getByLabelText('這趟旅行的感想'), { target: { value: '尚未備份的話' } });
    expect(screen.getByRole('status')).toHaveTextContent('本機草稿尚未備份');
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '仍要離開' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '繼續編輯' }));
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('尚未備份的話');
  });
});
