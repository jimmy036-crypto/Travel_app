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
    fireEvent.change(screen.getByLabelText('查看個人清單'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /個人清單/ }));
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
    fireEvent.click(screen.getByRole('button', { name: /一鍵加入/ }));
    expect(onRequestCompanion).toHaveBeenCalledTimes(2);
    expect(onBulkCreate).not.toHaveBeenCalled();
  });
  it('explicit personal viewing retains the source owner and assignee while editing', () => {
    const onUpdate = vi.fn();
    render(<ChecklistModal {...props} items={[{ ...item, scope: 'personal', owner: 'Bob', assignee: 'Bob' }]} activeMember="Ann" onUpdate={onUpdate} />);
    fireEvent.change(screen.getByLabelText('查看個人清單'), { target: { value: 'Bob' } });
    fireEvent.click(screen.getByRole('button', { name: /個人清單/ }));
    fireEvent.click(screen.getByRole('button', { name: '編輯 合成清單' }));
    fireEvent.click(screen.getByRole('button', { name: /儲存|保存/ }));
    expect(onUpdate.mock.calls[0][0]).toMatchObject({ owner: 'Bob', assignee: 'Bob', completed: false });
  });
});
