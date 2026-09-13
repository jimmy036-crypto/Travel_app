import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChecklistModal } from './UIComponents.jsx';
vi.mock('@vis.gl/react-google-maps', () => ({ useMapsLibrary: () => null, useMap: () => null }));
vi.mock('../firebase', () => ({ storage: null }));
afterEach(cleanup);
const item = { id: 'c1', scope: 'shared', text: '合成清單', completed: false, category: 'todo' };
const props = { items: [item], members: ['Ann', 'Bob'], activeMember: '', onClose: vi.fn(), t: {} };

describe('checklist attribution and viewing are separate', () => {
  it('unconfirmed completion requests confirmation with zero update; confirming alone does not complete', () => {
    const onUpdate = vi.fn();
    const onRequestCompanion = vi.fn();
    const view = render(<ChecklistModal {...props} onUpdate={onUpdate} onRequestCompanion={onRequestCompanion} />);
    fireEvent.click(screen.getByRole('button', { name: '標記為已完成' }));
    expect(onRequestCompanion).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    view.rerender(<ChecklistModal {...props} activeMember="Bob" onUpdate={onUpdate} onRequestCompanion={onRequestCompanion} />);
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '標記為已完成' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ completed: true, completedBy: 'Bob' });
    expect(item.completed).toBe(false);
  });
  it('viewing another personal list never replaces the actor', () => {
    const onUpdate = vi.fn();
    render(<ChecklistModal {...props} items={[{ ...item, scope: 'personal', owner: 'Bob' }]} activeMember="Ann" onUpdate={onUpdate} />);
    expect(screen.queryByRole('button', { name: /選擇旅伴|更正旅伴/ })).not.toBeInTheDocument();
    expect(screen.queryByText('集中查看待辦與行李；新增和編輯會在獨立視窗完成。')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('查看個人清單'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /個人清單/ }));
    expect(screen.getByText('個人清單僅依旅伴分類，不是私密空間；有此旅程存取權的成員仍可查看。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '標記為已完成' }));
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ owner: 'Bob', completedBy: 'Ann' });
  });
  it('unconfirmed implicit personal creation and template insertion cannot write', () => {
    const onCreate = vi.fn();
    const onBulkCreate = vi.fn();
    const onRequestCompanion = vi.fn();
    render(<ChecklistModal {...props} onCreate={onCreate} onBulkCreate={onBulkCreate} onRequestCompanion={onRequestCompanion} />);
    fireEvent.click(screen.getByRole('button', { name: /個人清單/ }));
    fireEvent.click(screen.getByRole('button', { name: '＋ 新增', exact: true }));
    expect(onRequestCompanion).toHaveBeenCalledTimes(1);
    expect(onCreate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '✨ 範本', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '加入範本項目', exact: true }));
    expect(onRequestCompanion).toHaveBeenCalledTimes(2);
    expect(onBulkCreate).not.toHaveBeenCalled();
  });
  it('explicit personal viewing retains the source owner and assignee while editing', () => {
    const onUpdate = vi.fn();
    render(<ChecklistModal {...props} items={[{ ...item, scope: 'personal', owner: 'Bob', assignee: 'Bob' }]} activeMember="Ann" onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('查看個人清單'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /個人清單/ }));
    fireEvent.click(screen.getByRole('button', { name: '編輯 合成清單' }));
    expect(screen.queryByText('先輸入要完成的事情，分類與負責人可再視需要設定。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /儲存|保存/ }));
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ owner: 'Bob', assignee: 'Bob', completed: false });
  });

  it.each([
    { label: 'empty list', items: [], category: 'all', expected: '這個清單目前是空的' },
    { label: 'all completed', items: [{ ...item, completed: true }], category: 'all', expected: '目前沒有待完成項目' },
    { label: 'category mismatch', items: [item], category: 'document', expected: '目前篩選沒有符合項目' },
  ])('distinguishes $label without changing items', ({ items, category, expected }) => {
    const onCreate = vi.fn();
    const onUpdate = vi.fn();
    render(<ChecklistModal {...props} items={items} onCreate={onCreate} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('分類篩選'), { target: { value: category } });
    expect(screen.getByText(expected)).toBeVisible();
    for (const other of ['這個清單目前是空的', '目前沒有待完成項目', '目前篩選沒有符合項目'].filter(text => text !== expected)) {
      expect(screen.queryByText(other)).not.toBeInTheDocument();
    }
    expect(onCreate).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('completed filter with no match does not describe an existing list as empty', () => {
    render(<ChecklistModal {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '已完成 0', exact: true }));
    expect(screen.getByText('目前篩選沒有符合項目')).toBeVisible();
    expect(screen.getByText('切換完成狀態或分類，查看其他項目。')).toBeVisible();
    expect(screen.queryByText('這個清單目前是空的')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全部 1', exact: true }));
    expect(screen.getByRole('button', { name: '編輯 合成清單' })).toBeVisible();
  });

  it('template insertion adds only missing items and never promises the full template count', () => {
    const existing = { ...item, text: '  確認所有人的護照效期  ', category: 'document' };
    const onBulkCreate = vi.fn();
    const view = render(<ChecklistModal {...props} items={[existing]} onBulkCreate={onBulkCreate} />);
    fireEvent.click(screen.getByRole('button', { name: '✨ 範本', exact: true }));
    expect(screen.getByText('共用行前基本範本')).toBeVisible();
    expect(screen.getByText('僅加入尚未存在的項目。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '加入範本項目', exact: true }));
    expect(onBulkCreate).toHaveBeenCalledTimes(1);
    const inserted = onBulkCreate.mock.calls[0][0];
    expect(inserted.map(entry => entry.text)).toEqual([
      '下載機票、住宿與活動確認單', '購買網卡 / eSIM', '準備萬用轉接頭',
      '確認機場往返交通', '購買旅遊保險', '準備共用常備藥品', '確認海外刷卡與外幣需求',
    ]);
    expect(inserted.every(entry => entry.scope === 'shared' && entry.owner === '' && entry.assignee === '所有人')).toBe(true);
    expect(existing.text).toBe('  確認所有人的護照效期  ');
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    view.rerender(<ChecklistModal {...props} items={[existing, ...inserted]} onBulkCreate={onBulkCreate} />);
    fireEvent.click(screen.getByRole('button', { name: '✨ 範本', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '加入範本項目', exact: true }));
    expect(onBulkCreate).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith('常用範本已經全部加入囉！');
    alert.mockRestore();
  });
});
