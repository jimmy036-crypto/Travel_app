import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoriesPage } from './MemoriesPage.jsx';
import { ShareMemoryDialog } from './ShareMemoryDialog.jsx';
import { CollectionsPage } from './CollectionsPage.jsx';
vi.mock('./SourcePhotos.jsx', () => ({ SourcePhotos: () => null }));

const memories = { a: { roomId: 'a', title: '京都散步', destination: '京都', startDate: '2025-01-01', endDate: '2025-01-02', archived: true, revision: 1, note: '下雪', visits: { p: { name: '美術館', city: '日本・京都', status: 'visited' } } } };

describe('travel journal views', () => {
  it.each(['missed', 'wishlist', undefined])('turns a corrected visit (%s) into an editable wishlist even during editing', async (status) => {
    const save = vi.fn().mockResolvedValue({});
    const collection = { id: 'c', revision: 2, title: '美術館', items: { i: { name: '美術館', city: '日本・京都', roomId: 'a', visitId: 'p' } } };
    const corrected = { a: { ...memories.a, visits: status ? { p: { ...memories.a.visits.p, status } } : {} } };
    const { rerender } = render(<CollectionsPage collections={{ c: collection }} memories={memories} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '編輯收藏' }));
    rerender(<CollectionsPage collections={{ c: collection }} memories={corrected} onSave={save} />);
    expect(screen.getByLabelText('美術館的收藏到訪')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('地點名稱'), { target: { value: '下次看展' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ items: { i: { name: '下次看展', city: '日本・京都', roomId: '', visitId: '' } } })));
  });
  it('preserves the editable memory entry when its original trip is no longer accessible', () => {
    const edit = vi.fn();
    render(<MemoriesPage memories={memories} trips={[]} onEdit={edit} />);
    expect(screen.getByRole('button', { name: '還原到首頁' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '複製成新旅程' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '補充回憶與到訪' }));
    expect(edit).toHaveBeenCalledWith('a');
  });
  it('can edit an empty collection after RTDB has omitted its empty items map', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<CollectionsPage memories={{}} collections={{ empty: { id: 'empty', revision: 1, title: '美術館', deleted: false } }} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '編輯收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '想去的美術館' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ id: 'empty', revision: 1, title: '想去的美術館', deleted: false, items: {} }));
    fireEvent.click(screen.getByRole('button', { name: '刪除收藏' }));
    fireEvent.click(screen.getByRole('button', { name: '確認刪除收藏' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'empty', deleted: true, items: {} })));
  });
  it('filters archived memories and returns selected source when reopening', () => {
    const open = vi.fn();
    render(<MemoriesPage memories={memories} trips={[{ roomId: 'a', accessStatus: 'active' }]} onOpenTrip={open} onEdit={() => {}} onRestore={() => {}} onClone={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '開啟原行程與照片' }));
    expect(open).toHaveBeenCalledWith('a');
    fireEvent.change(screen.getByLabelText('搜尋旅行回憶'), { target: { value: '不存在' } });
    expect(screen.queryByRole('heading', { name: '京都散步' })).not.toBeInTheDocument();
    expect(screen.getByText('找不到符合的回憶')).toBeInTheDocument();
  });
  it('requires an explicit selection before sharing and displays only selected text', () => {
    render(<ShareMemoryDialog memories={memories} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '複製選取的回憶' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '京都散步' }));
    expect(screen.getByLabelText('分享內容預覽')).toHaveValue('京都散步\n2025-01-01 — 2025-01-02\n京都\n下雪\n日本・京都');
    expect(screen.getByRole('button', { name: '複製選取的回憶' })).toBeEnabled();
  });
  it('saves a wishlist without inventing a visit and keeps failed input', async () => {
    const save = vi.fn().mockRejectedValue(new Error('沒有儲存成功'));
    render(<CollectionsPage memories={memories} collections={{}} onSave={save} isOnline />);
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '想看的美術館' } });
    fireEvent.change(screen.getByLabelText('想去的地方'), { target: { value: '另一間美術館' } });
    fireEvent.click(screen.getByRole('button', { name: '加入清單' }));
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.values(save.mock.calls[0][0].items)[0]).toEqual(expect.objectContaining({ name: '另一間美術館', roomId: '', visitId: '' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('沒有儲存成功');
    expect(screen.getByLabelText('收藏主題')).toHaveValue('想看的美術館');
  });
});
