import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoriesPage } from './MemoriesPage.jsx';
import { ShareMemoryDialog } from './ShareMemoryDialog.jsx';
import { CollectionsPage } from './CollectionsPage.jsx';

const memories = { a: { roomId: 'a', title: '京都散步', destination: '京都', startDate: '2025-01-01', endDate: '2025-01-02', archived: true, revision: 1, note: '下雪', visits: { p: { name: '美術館', city: '日本・京都', status: 'visited' } } } };

describe('travel journal views', () => {
  beforeEach(() => localStorage.clear());
  it.each(['missed', 'wishlist', undefined])('turns a corrected visit (%s) into an editable wishlist even during editing', async (status) => {
    const save = vi.fn().mockResolvedValue({});
    const collection = { id: 'c', revision: 2, title: '美術館', items: { i: { name: '美術館', city: '日本・京都', roomId: 'a', visitId: 'p' } } };
    const corrected = { a: { ...memories.a, visits: status ? { p: { ...memories.a.visits.p, status } } : {} } };
    const { rerender } = render(<CollectionsPage accountUid="alice" collections={{ c: collection }} memories={memories} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '編輯收藏' }));
    rerender(<CollectionsPage accountUid="alice" collections={{ c: collection }} memories={corrected} onSave={save} />);
    expect(screen.getByLabelText('美術館的收藏到訪')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('地點名稱'), { target: { value: '下次看展' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ items: { i: { name: '下次看展', city: '日本・京都', roomId: '', visitId: '' } } })));
  });
  it('opens saved memory reading when its original trip is no longer accessible', () => {
    const view = vi.fn();
    render(<MemoriesPage memories={memories} onView={view} />);
    fireEvent.click(screen.getByRole('button', { name: '重溫這趟旅行' }));
    expect(view).toHaveBeenCalledWith('a');
    expect(screen.getByText('下雪')).toBeInTheDocument();
  });
  it('can edit an empty collection after RTDB has omitted its empty items map', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<CollectionsPage accountUid="alice" memories={{}} collections={{ empty: { id: 'empty', revision: 1, title: '美術館', deleted: false } }} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '編輯收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '想去的美術館' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ id: 'empty', revision: 1, title: '想去的美術館', deleted: false, items: {} }));
    fireEvent.click(screen.getByRole('button', { name: '刪除收藏' }));
    fireEvent.click(screen.getByRole('button', { name: '確認刪除收藏' }));
    await waitFor(() => expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'empty', deleted: true, items: {} })));
  });
  it('filters archived memories and reports the query for URL navigation', () => {
    const query = vi.fn();
    const { rerender } = render(<MemoriesPage memories={memories} onView={vi.fn()} onQueryChange={query} />);
    fireEvent.change(screen.getByLabelText('搜尋旅行回憶'), { target: { value: '不存在' } });
    expect(query).toHaveBeenCalledWith('不存在');
    rerender(<MemoriesPage memories={memories} onView={vi.fn()} query="不存在" />);
    expect(screen.queryByRole('heading', { name: '京都散步' })).not.toBeInTheDocument();
    expect(screen.getByText('找不到符合的回憶')).toBeInTheDocument();
  });
  it('requires an explicit selection before sharing and displays only selected text', () => {
    render(<ShareMemoryDialog memories={memories} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: '複製選取的回憶' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '京都散步' }));
    expect(screen.getByLabelText('分享內容預覽')).toHaveValue('京都散步\n2025-01-01 — 2025-01-02\n京都\n日本・京都');
    expect(screen.getByRole('button', { name: '複製選取的回憶' })).toBeEnabled();
  });
  it('saves a wishlist without inventing a visit and keeps failed input', async () => {
    const save = vi.fn().mockRejectedValue(new Error('沒有儲存成功'));
    render(<CollectionsPage accountUid="alice" memories={memories} collections={{}} onSave={save} isOnline />);
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


describe('collection additions and drafts', () => {
  beforeEach(() => localStorage.clear());
  it('includes valid pending place input when saving without requiring a separate add action', async () => {
    const save = vi.fn().mockResolvedValue({});
    render(<CollectionsPage accountUid="alice" onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '咖啡店' } });
    fireEvent.change(screen.getByLabelText('想去的地方'), { target: { value: '河邊咖啡' } });
    fireEvent.change(screen.getByLabelText('城市／地區'), { target: { value: '京都' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.values(save.mock.calls[0][0].items)).toEqual([{ name: '河邊咖啡', city: '京都', roomId: '', visitId: '' }]);
  });
  it('offers existing collection selection, includes only selected items and deduplicates source links', async () => {
    const save = vi.fn().mockResolvedValue({});
    const existing = { id: 'art', title: '看展', revision: 3, items: { original: { name: '美術館', city: '京都', roomId: '', visitId: '', sourceRoomId: 'a', sourceVisitId: 'p' } } };
    render(<CollectionsPage accountUid="alice" memories={memories} collections={{ art: existing }} incomingCollection={{ title: '京都・再訪', items: [{ name: '美術館', city: '京都', roomId: 'a', visitId: 'p' }, { name: '庭園', city: '京都', roomId: 'a', visitId: 'q' }, { name: '寺院', city: '京都', roomId: 'a', visitId: 'r' }] }} onSave={save} />);
    fireEvent.change(screen.getByLabelText('加入哪份收藏'), { target: { value: 'art' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '寺院' }));
    fireEvent.click(screen.getByRole('button', { name: '加入選取地點' }));
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const saved = save.mock.calls[0][0];
    expect(saved).toMatchObject({ id: 'art', revision: 3 });
    expect(Object.values(saved.items)).toHaveLength(2);
    expect(Object.values(saved.items).find((item) => item.name === '庭園')).toMatchObject({ roomId: '', visitId: '', sourceRoomId: 'a', sourceVisitId: 'q' });
  });
  it('retains new collection text and pending item after closing and reopening', async () => {
    render(<CollectionsPage accountUid="alice" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '未完成主題' } });
    fireEvent.change(screen.getByLabelText('想去的地方'), { target: { value: '下次再去' } });
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    fireEvent.click(await screen.findByRole('button', { name: '保留草稿並關閉' }));
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    expect(screen.getByLabelText('收藏主題')).toHaveValue('未完成主題');
    expect(screen.getByLabelText('想去的地方')).toHaveValue('下次再去');
  });
});


describe('collection conflict recovery', () => {
  beforeEach(() => localStorage.clear());
  it('combines a local title with remote item edits only after showing the merge', async () => {
    const save = vi.fn().mockResolvedValue({});
    const collection = { id: 'c', revision: 1, title: '主題', items: { p: { name: '公園', city: '京都', roomId: '', visitId: '' } } };
    const { rerender } = render(<CollectionsPage accountUid="alice" collections={{ c: collection }} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '編輯收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '我的主題' } });
    const latest = { ...collection, revision: 2, items: { p: { ...collection.items.p, name: '公園新名稱' } } };
    rerender(<CollectionsPage accountUid="alice" collections={{ c: latest }} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '合併另一個畫面的更新' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '套用選擇並繼續編輯' }));
    expect(screen.getByLabelText('收藏主題')).toHaveValue('我的主題');
    expect(screen.getByLabelText('地點名稱')).toHaveValue('公園新名稱');
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ title: '我的主題', revision: 2, items: { p: { name: '公園新名稱', city: '京都', roomId: '', visitId: '' } } })));
  });
  it('requires an explicit same-field choice and retains local pending input during conflict', async () => {
    const save = vi.fn().mockResolvedValue({});
    const collection = { id: 'c', revision: 1, title: '主題', items: {} };
    const { rerender } = render(<CollectionsPage accountUid="alice" collections={{ c: collection }} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '編輯收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '我的主題' } });
    fireEvent.change(screen.getByLabelText('想去的地方'), { target: { value: '新公園' } });
    rerender(<CollectionsPage accountUid="alice" collections={{ c: { ...collection, title: '遠端主題', revision: 2 } }} onSave={save} />);
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    expect(screen.getByRole('button', { name: '套用選擇並繼續編輯' })).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: '保留最新內容：標題' }));
    fireEvent.click(screen.getByRole('button', { name: '套用選擇並繼續編輯' }));
    expect(screen.getByLabelText('收藏主題')).toHaveValue('遠端主題');
    expect(screen.getByLabelText('地點名稱')).toHaveValue('新公園');
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(Object.values(save.mock.calls[0][0].items)).toHaveLength(1);
  });
  it('does not render a previous account draft after account switch', () => {
    const { rerender } = render(<CollectionsPage accountUid="alice" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: 'Alice 的私人主題' } });
    rerender(<CollectionsPage accountUid="bob" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    expect(screen.getByLabelText('收藏主題')).toHaveValue('');
  });
  it('shows a pending input error beside the field and preserves it on invalid submit', () => {
    render(<CollectionsPage accountUid="alice" onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '建立主題收藏' }));
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '主題' } });
    fireEvent.change(screen.getByLabelText('城市／地區'), { target: { value: '京都' } });
    fireEvent.click(screen.getByRole('button', { name: '儲存收藏' }));
    expect(screen.getByLabelText('想去的地方')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('想去的地方')).toHaveFocus();
    expect(screen.getByLabelText('城市／地區')).toHaveValue('京都');
  });
});
