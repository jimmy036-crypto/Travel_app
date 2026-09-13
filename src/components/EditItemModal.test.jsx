import React, { useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EditItemModal, PlaceDetailsModal } from './UIComponents.jsx';

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => null,
  useMapsLibrary: () => null,
}));

vi.mock('../firebase.js', () => ({ storage: null }));

const theme = {
  inputBg: 'bg-white',
  modalBg: 'bg-white',
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

const item = {
  id: 'place-1',
  name: '台北車站',
  customName: '',
  time: '09:00',
  stayTime: '30',
  memo: '',
  tags: [],
  navigationUrl: '',
  nextLeg: { mode: 'WALK', mins: 12 },
  resources: [],
  lat: 25.0478,
  lng: 121.517,
};

const ModalHarness = ({ onSave }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleSave = async (...args) => {
    await onSave(...args);
    setIsOpen(false);
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>編輯行程</button>
      {isOpen ? (
        <EditItemModal
          item={item}
          roomId="room-1"
          onSave={handleSave}
          onClose={() => setIsOpen(false)}
          t={theme}
        />
      ) : null}
    </>
  );
};

const PlaceDetailsHarness = ({ isAdding, onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const place = {
    name: '大阪城',
    formatted_address: '大阪府大阪市中央區大阪城 1-1',
    photos: [],
    reviews: [],
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>查看景點詳情</button>
      {isOpen ? (
        <PlaceDetailsModal
          place={place}
          onClose={() => setIsOpen(false)}
          onAdd={onAdd}
          dayTitle="Day 2"
          isAdding={isAdding}
          t={theme}
        />
      ) : null}
    </>
  );
};

const UnmountingMenuHarness = () => {
  const stableTriggerRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [returnFocusTarget, setReturnFocusTarget] = useState(null);

  return (
    <>
      <button ref={stableTriggerRef} type="button" onClick={() => setIsMenuOpen(true)}>
        開啟景點操作
      </button>
      {isMenuOpen ? (
        <button
          type="button"
          onClick={() => {
            setReturnFocusTarget(stableTriggerRef.current);
            setIsMenuOpen(false);
            setIsEditorOpen(true);
          }}
        >
          編輯選單項目
        </button>
      ) : null}
      {isEditorOpen ? (
        <EditItemModal
          item={item}
          roomId="room-1"
          onSave={vi.fn()}
          onClose={() => setIsEditorOpen(false)}
          returnFocusTarget={returnFocusTarget}
          t={theme}
        />
      ) : null}
    </>
  );
};

const openModal = () => {
  const opener = screen.getByRole('button', { name: '編輯行程' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

describe('EditItemModal', () => {
  it.each([
    { kind: 'image', fileName: 'menu.png', contentType: 'image/png', keep: '保留目前圖片；點此可替換', limit: 'JPG／PNG／WebP，最多 5 MB', hint: '菜單照片可在相簿左右滑動查看。' },
    { kind: 'pdf', fileName: 'menu.pdf', contentType: 'application/pdf', keep: '保留目前 PDF；點此可替換', limit: '僅支援 PDF，最多 15 MB', hint: '儲存後可從「菜單」或「資料」開啟 PDF。' },
  ])('keeps $kind attachment limits, replacement guidance and original data after cancelling resource edits', async ({ kind, fileName, contentType, keep, limit, hint }) => {
    const resource = {
      id: 'resource-1', kind: 'file', type: 'menu', title: '合成菜單', url: '',
      storagePath: `rooms/synthetic/resources/${fileName}`, fileName, contentType, size: 128, uploadedAt: 1,
    };
    const onSave = vi.fn();
    render(<EditItemModal item={{ ...item, resources: [resource] }} roomId="room-1" onSave={onSave} onClose={vi.fn()} t={theme} />);
    fireEvent.click(within(screen.getByTestId('place-resource-row')).getByTitle('編輯資料'));
    expect(screen.getByText(keep)).toBeVisible();
    expect(within(screen.getByTestId(`place-resource-${kind}-input`).closest('label')).getByText(limit)).toBeVisible();
    expect(screen.getByText(hint)).toBeVisible();
    fireEvent.change(screen.getByTestId(`place-resource-${kind}-title-input`), { target: { value: '未保存的附件名稱' } });
    fireEvent.click(screen.getByRole('button', { name: '取消編輯', exact: true }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByTestId('place-resource-row')).toHaveTextContent('合成菜單');
    expect(screen.queryByText('未保存的附件名稱')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '儲存變更' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0][0].resources).toEqual([resource]);
  });

  it('returns focus to a stable card action after the opening menu item unmounts', async () => {
    render(<UnmountingMenuHarness />);
    const stableTrigger = screen.getByRole('button', { name: '開啟景點操作' });
    fireEvent.click(stableTrigger);
    const transientEditAction = screen.getByRole('button', { name: '編輯選單項目' });
    transientEditAction.focus();
    fireEvent.click(transientEditAction);

    expect(transientEditAction).not.toBeInTheDocument();
    const dialog = screen.getByRole('dialog', { name: '編輯景點' });
    await waitFor(() => expect(within(dialog).getByRole('heading', { name: '編輯景點' })).toHaveFocus());
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯景點' })).not.toBeInTheDocument());
    expect(stableTrigger).toHaveFocus();
  });

  it('is a labelled modal dialog, focuses its title, exposes form labels, and restores focus on Escape', async () => {
    render(<ModalHarness onSave={vi.fn()} />);
    const opener = openModal();

    const dialog = screen.getByRole('dialog', { name: '編輯景點' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const title = within(dialog).getByRole('heading', { name: '編輯景點' });
    await waitFor(() => expect(title).toHaveFocus());

    expect(within(dialog).getByRole('textbox', { name: '自訂地標名稱（選填）' })).toBeVisible();
    expect(within(dialog).getByLabelText('抵達時間')).toBeVisible();
    expect(within(dialog).getByRole('spinbutton', { name: /^停留（分鐘）/ })).toBeVisible();
    expect(within(dialog).getByRole('combobox', { name: '前往下一站的交通方式' })).toBeVisible();
    expect(within(dialog).getByRole('spinbutton', { name: '前往下一站所需分鐘' })).toBeVisible();
    expect(within(dialog).getByRole('checkbox', { name: /自動順延後續行程/ })).toBeChecked();
    expect(within(dialog).getByRole('textbox', { name: '筆記／備註' })).toBeVisible();

    const closeButton = within(dialog).getByRole('button', { name: '關閉景點編輯視窗' });
    expect(closeButton).toHaveClass('h-11', 'w-11');

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯景點' })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });

  it('cancels without saving and restores focus to the opener', async () => {
    const onSave = vi.fn();
    render(<ModalHarness onSave={onSave} />);
    const opener = openModal();
    const dialog = screen.getByRole('dialog', { name: '編輯景點' });

    fireEvent.change(within(dialog).getByRole('textbox', { name: '自訂地標名稱（選填）' }), {
      target: { value: '新名稱' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: '取消' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯景點' })).not.toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
    expect(opener).toHaveFocus();
  });

  it('allows only one save while pending and disables every close path', async () => {
    let resolveSave;
    const onSave = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    render(<ModalHarness onSave={onSave} />);
    const opener = openModal();
    const dialog = screen.getByRole('dialog', { name: '編輯景點' });

    fireEvent.change(within(dialog).getByRole('textbox', { name: '自訂地標名稱（選填）' }), {
      target: { value: '新名稱' },
    });
    const saveButton = within(dialog).getByRole('button', { name: '儲存變更' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'place-1',
        customName: '新名稱',
        nextLeg: { mode: 'WALK', mins: 12 },
      }),
      true,
    );
    expect(within(dialog).getByRole('button', { name: '儲存中…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '取消' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: '關閉景點編輯視窗' })).toBeDisabled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: '編輯景點' })).toBeInTheDocument();
    expect(onSave).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave();
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '編輯景點' })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});

describe('PlaceDetailsModal', () => {
  it('names and focuses the dialog, exposes a 44px close action, and announces the pending Day add', async () => {
    const onAdd = vi.fn();
    render(<PlaceDetailsHarness isAdding onAdd={onAdd} />);
    const opener = screen.getByRole('button', { name: '查看景點詳情' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: '大阪城' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const title = within(dialog).getByRole('heading', { name: '大阪城' });
    await waitFor(() => expect(title).toHaveFocus());

    const closeButton = within(dialog).getByRole('button', { name: '關閉景點詳情' });
    expect(closeButton).toHaveClass('h-11', 'w-11');
    expect(within(dialog).getByText('將加入 Day 2')).toBeVisible();
    const addButton = within(dialog).getByRole('button', { name: '加入中…' });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAttribute('aria-busy', 'true');
    expect(addButton).toHaveClass('min-h-11');
    expect(within(dialog).getByRole('status')).toHaveTextContent('正在儲存景點，請稍候…');

    fireEvent.click(addButton);
    expect(onAdd).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '大阪城' })).not.toBeInTheDocument());
    expect(opener).toHaveFocus();
  });
});
