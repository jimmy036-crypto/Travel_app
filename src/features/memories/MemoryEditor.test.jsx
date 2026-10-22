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
const openPlaces = () => fireEvent.click(screen.getByRole('button', { name: /^(補上景點|編輯景點)$/ }));
const openNotes = () => { const button = screen.queryByRole('button', { name: '寫下感想與首次體驗' }); if (button) fireEvent.click(button); };
const openManual = () => { openPlaces(); fireEvent.click(screen.getByRole('button', { name: '補登行程外地點' })); };

describe('MemoryEditor', () => {
  it('confirms all suggested cities explicitly without confirming their planned attractions', async () => {
    const save = vi.fn().mockResolvedValue({});
    const osaka = { ...cities[0], cityId: 'osaka', city: '大阪' };
    render(<MemoryEditor accountUid="alice" trip={trip} suggestedCities={[cities[0], osaka]} candidates={candidates} onSave={save} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '這些城市都去過' }));
    expect(screen.getByRole('checkbox', { name: '去過大阪' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ cities: { kyoto: cities[0], osaka }, visits: {} })));
  });
  it('confirms a city with one checkbox and saves without typing or inventing attraction visits', async () => {
    const save = vi.fn().mockResolvedValue({ memory: { revision: 1 } });
    const close = vi.fn();
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={candidates} suggestedCities={cities} placeCities={{ 'day1~p1': cities[0] }} onSave={save} onClose={close} />);
    expect(screen.getByRole('checkbox', { name: '去過日本・京都' })).not.toBeChecked();
    expect(screen.queryByLabelText('這趟旅行的感想')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: '去過美術館' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: '去過日本・京都' }));
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ cities: { kyoto: cities[0] }, visits: {} })));
    await waitFor(() => expect(close).toHaveBeenCalled());
  });
  it('removes city evidence without losing attraction notes and does not reselect from late suggestions', async () => {
    const save = vi.fn().mockResolvedValue({});
    const memory = { revision: 1, archived: true, cities: { kyoto: cities[0] }, visits: { 'day1~p1': { ...candidates[0], ...cities[0], status: 'visited', note: '留下來' } } };
    const { rerender } = render(<MemoryEditor trip={trip} memory={memory} onSave={save} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '去過日本・京都' }));
    rerender(<MemoryEditor trip={trip} memory={memory} suggestedCities={cities} onSave={save} onClose={() => {}} />);
    expect(screen.getByRole('checkbox', { name: '去過日本・京都' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '儲存回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ cities: {}, visits: { 'day1~p1': expect.objectContaining({ note: '留下來', city: '', status: 'visited' }) } })));
    expect(save.mock.calls[0][0].visits['day1~p1'].cityId).toBeUndefined();
  });
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

  it('saves an unassigned place and retains every input on failed save', async () => {
    const save = vi.fn().mockRejectedValue(new Error('請重新載入後再試'));
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={candidates} cities={cities} onSave={save} onClose={() => {}} />);
    openPlaces();
    fireEvent.click(screen.getByRole('checkbox', { name: '去過美術館' }));
    openNotes();
    openNotes();
    fireEvent.change(screen.getByLabelText('這趟旅行的感想'), { target: { value: '下雨也很美' } });
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('請重新載入後再試');
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('下雨也很美');
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ visits: { 'day1~p1': expect.objectContaining({ city: '', status: 'visited' }) } }));
  });

  it('disables writes while offline without discarding existing decisions', () => {
    render(<MemoryEditor trip={trip} candidates={candidates} memory={{ revision: 3, archived: true, note: '想再來', visits: {} }} isOnline={false} onSave={vi.fn()} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '儲存回憶' })).toBeDisabled();
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('想再來');
  });
  it('confirms only the selected day and uses its suggested city without extra typing', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={[...candidates, { visitId: 'day2~p2', dayId: 'day2', name: '車站' }]} cities={cities} placeCities={{ 'day1~p1': cities[0] }} onSave={save} onClose={() => {}} />);
    openPlaces();
    fireEvent.click(screen.getByLabelText('確認2025-04-01全部去過'));
    expect(screen.getByLabelText('去過車站')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ visits: { 'day1~p1': expect.objectContaining({ cityId: 'kyoto', status: 'visited' }) } })));
  });
  it.each(['close', 'escape', 'backdrop'])('protects dirty input when leaving through %s', (method) => {
    const onClose = vi.fn();
    render(<MemoryEditor accountUid="alice" trip={trip} onSave={vi.fn()} onClose={onClose} />);
    openNotes();
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
    openNotes();
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
    openManual();
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
    openManual();
    fireEvent.change(screen.getByLabelText('補登地點名稱'), { target: { value: '還沒加的咖啡店' } });
    expect(readJournalDraft({ uid: 'alice', kind: 'memory', recordId: trip.roomId }).draft.value.pendingManualName).toBe('還沒加的咖啡店');
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('補登');
  });
  it('shows the current first-experience owner and requires an explicit move', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<MemoryEditor accountUid="alice" trip={trip} memories={{ other: { title: '東京', firsts: { solo: '第一趟獨旅' } } }} onSave={save} onClose={() => {}} />);
    openNotes();
    expect(screen.getByText('已指定給「東京」')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('將第一趟獨旅從「東京」改指定為這趟旅行'));
    fireEvent.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ firsts: { solo: '第一趟獨旅' }, reassignFirsts: ['solo'] })));
  });
  it('handles seven days and forty places with keyboard selection without marking other places visited', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue({});
    const manyPlaces = Array.from({ length: 40 }, (_, i) => ({ visitId: `day${Math.floor(i / 6) + 1}~p${i}`, dayId: `day${Math.floor(i / 6) + 1}`, name: `景點${i}` }));
    render(<MemoryEditor accountUid="alice" trip={trip} candidates={manyPlaces} cities={cities} placeCities={Object.fromEntries(manyPlaces.map((place) => [place.visitId, cities[0]]))} onSave={save} onClose={() => {}} />);
    openPlaces();
    const selectDay = screen.getByLabelText('確認day1全部去過');
    selectDay.focus(); await user.keyboard(' ');
    expect(screen.getByLabelText('去過景點6')).not.toBeChecked();
    await user.click(screen.getByRole('button', { name: '完成並收進回憶' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.keys(save.mock.calls[0][0].visits)).toHaveLength(6);
    expect(Object.values(save.mock.calls[0][0].visits).every((visit) => visit.cityId === 'kyoto' && visit.status === 'visited')).toBe(true);
  });
  it('makes failed local backup visible and requires confirmation before losing the input', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const onClose = vi.fn();
    render(<MemoryEditor accountUid="alice" trip={trip} onSave={vi.fn()} onClose={onClose} />);
    openNotes();
    fireEvent.change(screen.getByLabelText('這趟旅行的感想'), { target: { value: '尚未備份的話' } });
    expect(screen.getByRole('status')).toHaveTextContent('本機草稿尚未備份');
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '仍要離開' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '繼續編輯' }));
    expect(screen.getByLabelText('這趟旅行的感想')).toHaveValue('尚未備份的話');
  });
});
