import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { TicketEditorModal } from './TicketEditorModal.jsx';

const members = ['王泓文', '陳小美', '林大同'];
const existingDays = ['Day 1', 'Day 2'];

const attachmentTicket = {
  id: 'ticket-1',
  title: '原本的圖片票券',
  ticketType: 'attachment',
  attachmentKind: 'image',
  type: 'image',
  url: 'https://tickets.example/original.png',
  storagePath: 'rooms/room-1/tickets/ticket-1/original.png',
  audienceType: 'members',
  assignedMembers: ['王泓文'],
  presenterMember: '',
  dayId: 'Day 1',
  memo: '原備註',
  createdAt: 100,
  updatedAt: 200,
};

const webTicket = {
  id: 'ticket-web',
  title: '網頁票券',
  ticketType: 'web-link',
  url: 'https://tickets.example/web',
  audienceType: 'all',
  assignedMembers: [],
  dayId: 'Day 2',
  createdAt: 300,
  updatedAt: 400,
};

const defaultProps = {
  mode: 'create',
  ticket: null,
  members,
  existingDays,
  startDate: '2026-09-20',
  defaultDayId: 'Day 1',
  activeMember: '王泓文',
  t: {},
  onClose: vi.fn(),
  onSubmit: vi.fn(),
};

const renderEditor = (overrides = {}) => {
  const props = {
    ...defaultProps,
    onClose: vi.fn(),
    onSubmit: vi.fn(),
    ...overrides,
  };
  return {
    props,
    ...render(<TicketEditorModal {...props} />),
  };
};

const chooseWebLink = async (user, { title = '電子票券', url = 'tickets.example/item' } = {}) => {
  await user.click(screen.getByTestId('ticket-type-web-link'));
  await user.clear(screen.getByTestId('ticket-title-input'));
  await user.type(screen.getByTestId('ticket-title-input'), title);
  await user.type(screen.getByTestId('ticket-url-input'), url);
};

const chooseExternalApp = async (user, { title = 'App 票券', appName = 'Rail App' } = {}) => {
  await user.click(screen.getByTestId('ticket-type-external-app'));
  await user.clear(screen.getByTestId('ticket-title-input'));
  await user.type(screen.getByTestId('ticket-title-input'), title);
  if (appName) await user.type(screen.getByTestId('ticket-app-name-input'), appName);
};

describe('TicketEditorModal progressive form', () => {
  it('EDITOR-01 defaults create audience to a valid active member', () => {
    renderEditor();

    expect(screen.getByTestId('ticket-audience-members')).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '王泓文' })).toBeChecked();
  });

  it('EDITOR-02 defaults create audience to all when activeMember is invalid', () => {
    renderEditor({ activeMember: '已離開成員' });

    expect(screen.getByTestId('ticket-audience-all')).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: '已離開成員' })).not.toBeInTheDocument();
  });

  it('EDITOR-03 switches among all three ticket types', async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getByTestId('ticket-type-attachment')).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByTestId('ticket-type-web-link'));
    expect(screen.getByTestId('ticket-url-input')).toBeInTheDocument();
    await user.click(screen.getByTestId('ticket-type-external-app'));
    expect(screen.getByTestId('ticket-app-name-input')).toBeInTheDocument();
    await user.click(screen.getByTestId('ticket-type-attachment'));
    expect(screen.getByTestId('ticket-file-input')).toBeInTheDocument();
  });

  it('EDITOR-04 keeps progressive settings collapsed initially', () => {
    renderEditor();

    expect(screen.getByTestId('ticket-more-settings-toggle')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('ticket-more-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('ticket-memo-input')).not.toBeInTheDocument();
  });

  it('EDITOR-05 expands more settings on demand', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByTestId('ticket-more-settings-toggle'));

    expect(screen.getByTestId('ticket-more-settings-toggle')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('ticket-usage-time-input')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-reminder-select')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-memo-input')).toBeInTheDocument();
  });

  it('EDITOR-06 requires a file for attachment create', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await user.type(screen.getByTestId('ticket-title-input'), '圖片票券');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('請選擇圖片或 PDF 票券。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-07 keeps an existing valid attachment during edit', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: attachmentTicket });

    expect(screen.getByTestId('ticket-existing-attachment-kind')).toHaveTextContent('圖片');
    expect(screen.getByTestId('ticket-file-status')).toHaveTextContent('保留原附件');
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      attachmentChange: { action: 'keep', file: null },
    }));
  });

  it('EDITOR-08 returns replace when an edit selects a new attachment', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: attachmentTicket });
    const file = new File(['pdf'], 'replacement.pdf', { type: 'application/pdf' });

    await user.upload(screen.getByTestId('ticket-file-input'), file);
    expect(screen.getByTestId('ticket-file-status')).toHaveTextContent('replacement.pdf');
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].attachmentChange).toEqual({ action: 'replace', file });
    expect(props.onSubmit.mock.calls[0][0].ticket.attachmentKind).toBe('pdf');
  });

  it('EDITOR-09 cancels a replacement and returns keep', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: attachmentTicket });
    const file = new File(['pdf'], 'replacement.pdf', { type: 'application/pdf' });

    await user.upload(screen.getByTestId('ticket-file-input'), file);
    await user.click(screen.getByTestId('ticket-file-cancel-replacement'));
    expect(screen.getByTestId('ticket-file-status')).toHaveTextContent('保留原附件');
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].attachmentChange).toEqual({ action: 'keep', file: null });
  });

  it('EDITOR-10 returns remove when an attachment edit changes to web-link', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: attachmentTicket });

    await user.click(screen.getByTestId('ticket-type-web-link'));
    await user.type(screen.getByTestId('ticket-url-input'), 'https://tickets.example/new');
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].attachmentChange).toEqual({ action: 'remove', file: null });
    expect(props.onSubmit.mock.calls[0][0].ticket.storagePath).toBe('');
  });

  it('EDITOR-11 requires a new file when a non-attachment edit changes to attachment', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: webTicket });

    await user.click(screen.getByTestId('ticket-type-attachment'));
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('請選擇圖片或 PDF 票券。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-12 submits and normalizes a valid web-link URL', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.url).toBe('https://tickets.example/item');
    expect(props.onSubmit.mock.calls[0][0].ticket.ticketType).toBe('web-link');
  });

  it('EDITOR-13 rejects javascript: web-link URLs near the field', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user, { url: 'javascript:alert(1)' });

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('請輸入有效的 HTTP 或 HTTPS 票券網址。')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-url-input')).toHaveAttribute('aria-describedby', 'ticket-url-error');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-14 requires external-app appName', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user, { appName: '' });

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('請輸入 App 名稱。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-15 allows an external app with an empty appUrl and shows manual preview', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);

    expect(screen.getByTestId('ticket-app-launch-preview')).toHaveTextContent('手動開啟 App');
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.appUrl).toBe('');
    expect(props.onSubmit.mock.calls[0][0].attachmentChange).toEqual({ action: 'keep', file: null });
  });

  it('EDITOR-16 normalizes a valid external-app appUrl', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);
    await user.type(screen.getByTestId('ticket-app-url-input'), 'app.example/ticket');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.appUrl).toBe('https://app.example/ticket');
  });

  it('EDITOR-17 rejects a custom external-app scheme', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);
    await user.type(screen.getByTestId('ticket-app-url-input'), 'railapp://ticket/1');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('票券開啟連結只接受 HTTP 或 HTTPS。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-18 validates a non-empty external-app fallbackUrl', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));
    await user.type(screen.getByTestId('ticket-fallback-url-input'), 'data:text/html,bad');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('備用網頁連結只接受 HTTP 或 HTTPS。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-19 submits all audience with no assigned members', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);
    await user.click(screen.getByTestId('ticket-audience-all'));
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket).toMatchObject({
      audienceType: 'all',
      assignedMembers: [],
      owner: '所有人',
    });
  });

  it('EDITOR-20 submits one assigned member', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket).toMatchObject({
      audienceType: 'members',
      assignedMembers: ['王泓文'],
      owner: '王泓文',
    });
  });

  it('EDITOR-21 submits multiple assigned members in selection order', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);
    await user.click(screen.getByRole('checkbox', { name: '陳小美' }));
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.assignedMembers).toEqual(['王泓文', '陳小美']);
  });

  it('EDITOR-22 rejects an empty members audience', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);
    await user.click(screen.getByRole('checkbox', { name: '王泓文' }));

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('指定成員時至少選擇一位旅程成員。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-23 hides presenter for a single-member ticket', async () => {
    const user = userEvent.setup();
    renderEditor();

    await user.click(screen.getByTestId('ticket-more-settings-toggle'));

    expect(screen.queryByTestId('ticket-presenter-select')).not.toBeInTheDocument();
  });

  it('EDITOR-24 shows presenter for a multi-member ticket with only assigned options', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('checkbox', { name: '陳小美' }));
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));

    const presenter = screen.getByTestId('ticket-presenter-select');
    expect(presenter).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '王泓文' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '陳小美' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '林大同' })).not.toBeInTheDocument();
  });

  it('EDITOR-25 clears presenter automatically when assignments make it invalid', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('checkbox', { name: '陳小美' }));
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));
    await user.selectOptions(screen.getByTestId('ticket-presenter-select'), '陳小美');

    await user.click(screen.getByRole('checkbox', { name: '陳小美' }));
    expect(screen.queryByTestId('ticket-presenter-select')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: '陳小美' }));

    expect(screen.getByTestId('ticket-presenter-select')).toHaveValue('');
  });

  it('EDITOR-26 uses defaultDayId and displays locally derived dates', () => {
    renderEditor({ defaultDayId: 'Day 2' });

    expect(screen.getByTestId('ticket-day-select')).toHaveValue('Day 2');
    expect(screen.getByRole('option', { name: '第 1 天・2026/09/20' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '第 2 天・2026/09/21' })).toBeInTheDocument();
  });

  it('EDITOR-27 shows an error and disables submit when existingDays is empty', () => {
    renderEditor({ existingDays: [] });

    expect(screen.getByTestId('ticket-days-empty-error')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-submit-button')).toBeDisabled();
  });

  it('EDITOR-28 submits an allowed reminderMinutes value and explains notification limits', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));
    await user.selectOptions(screen.getByTestId('ticket-reminder-select'), '30');

    expect(screen.getByText('此設定只會顯示建議提前時間，不會發送系統通知。')).toBeInTheDocument();
    await user.click(screen.getByTestId('ticket-submit-button'));
    expect(props.onSubmit.mock.calls[0][0].ticket.reminderMinutes).toBe(30);
  });

  it('EDITOR-29 submits external-app network, login, and dynamic-code flags', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));
    await user.click(screen.getByTestId('ticket-requires-network'));
    await user.click(screen.getByTestId('ticket-requires-login'));
    await user.click(screen.getByTestId('ticket-dynamic-code'));
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket).toMatchObject({
      requiresNetwork: true,
      requiresLogin: true,
      dynamicCode: true,
    });
  });

  it('EDITOR-30 prefills edit mode from the normalized ticket', async () => {
    const user = userEvent.setup();
    renderEditor({ mode: 'edit', ticket: webTicket });

    expect(screen.getByTestId('ticket-title-input')).toHaveValue('網頁票券');
    expect(screen.getByTestId('ticket-type-web-link')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('ticket-url-input')).toHaveValue('https://tickets.example/web');
    expect(screen.getByTestId('ticket-day-select')).toHaveValue('Day 2');
    expect(screen.getByTestId('ticket-audience-all')).toBeChecked();
    expect(screen.getByTestId('ticket-submit-button')).toHaveTextContent('儲存變更');
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));
    expect(screen.getByTestId('ticket-presenter-select')).toBeInTheDocument();
  });

  it('EDITOR-31 uses an empty compatibility owner for multiple members', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);
    await user.click(screen.getByRole('checkbox', { name: '陳小美' }));
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.owner).toBe('');
  });

  it('EDITOR-32 never places File inside the canonical ticket record', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    const file = new File(['image'], 'ticket.png', { type: 'image/png' });
    await user.type(screen.getByTestId('ticket-title-input'), '圖片票券');
    await user.upload(screen.getByTestId('ticket-file-input'), file);

    await user.click(screen.getByTestId('ticket-submit-button'));

    const payload = props.onSubmit.mock.calls[0][0];
    expect(payload.attachmentChange.file).toBe(file);
    expect(Object.values(payload.ticket).some((value) => value instanceof File)).toBe(false);
    expect(payload.ticket).not.toHaveProperty('file');
    expect(() => JSON.stringify(payload.ticket)).not.toThrow();
  });

  it('EDITOR-33 keeps the modal and entered content after validation fails', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await user.click(screen.getByTestId('ticket-type-web-link'));
    await user.type(screen.getByTestId('ticket-title-input'), '保留內容');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByTestId('ticket-editor-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-title-input')).toHaveValue('保留內容');
    expect(props.onClose).not.toHaveBeenCalled();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-34 calls onClose from cancel', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();

    await user.click(screen.getByTestId('ticket-cancel-button'));

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('EDITOR-35 shows the dangerous credential warning for external apps', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByTestId('ticket-type-external-app'));

    expect(screen.getByText('請優先使用該 App 的「分享票券」或「複製連結」功能。')).toBeInTheDocument();
    expect(screen.getByText('不要輸入帳號密碼、驗證碼、登入 Cookie 或付款資訊。')).toBeInTheDocument();
  });
});

describe('TicketEditorModal attachment safety and accessibility', () => {
  it('EDITOR-36 rejects SVG attachments near the file input', async () => {
    const user = userEvent.setup();
    renderEditor();
    const file = new File(['<svg />'], 'ticket.svg', { type: 'image/svg+xml' });

    await user.upload(screen.getByTestId('ticket-file-input'), file);

    expect(screen.getByText('僅接受 JPEG、PNG、WebP、GIF 圖片或 PDF。')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-file-input')).toHaveAttribute('aria-describedby', 'ticket-file-error');
  });

  it('EDITOR-37 rejects files larger than the existing 10 MiB limit', async () => {
    const user = userEvent.setup();
    renderEditor();
    const file = new File([new Uint8Array((10 * 1024 * 1024) + 1)], 'large.png', { type: 'image/png' });

    await user.upload(screen.getByTestId('ticket-file-input'), file);

    expect(screen.getByText('檔案大小不可超過 10 MB。')).toBeInTheDocument();
  });

  it('EDITOR-38 accepts a recognizable PDF extension when MIME is empty', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    const file = new File(['pdf'], 'ticket.pdf', { type: '' });
    await user.type(screen.getByTestId('ticket-title-input'), 'PDF 票券');

    fireEvent.change(screen.getByTestId('ticket-file-input'), { target: { files: [file] } });
    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.attachmentKind).toBe('pdf');
    expect(props.onSubmit.mock.calls[0][0].attachmentChange.action).toBe('replace');
  });

  it('EDITOR-39 rejects an empty MIME with an unrecognizable extension', async () => {
    renderEditor();
    const file = new File(['binary'], 'ticket.bin', { type: '' });

    fireEvent.change(screen.getByTestId('ticket-file-input'), { target: { files: [file] } });

    expect(screen.getByText('僅接受 JPEG、PNG、WebP、GIF 圖片或 PDF。')).toBeInTheDocument();
  });

  it('EDITOR-40 rejects URLs with embedded credentials', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);
    await user.type(screen.getByTestId('ticket-app-url-input'), 'https://user:pass@example.com/ticket');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('票券開啟連結只接受 HTTP 或 HTTPS。')).toBeInTheDocument();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it('EDITOR-41 closes on Escape', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();

    await user.keyboard('{Escape}');

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('EDITOR-42 focuses title initially and restores the prior focus on unmount', async () => {
    const priorButton = document.createElement('button');
    priorButton.textContent = 'prior';
    document.body.appendChild(priorButton);
    priorButton.focus();
    const { unmount } = renderEditor();

    await waitFor(() => expect(screen.getByTestId('ticket-title-input')).toHaveFocus());
    unmount();

    expect(priorButton).toHaveFocus();
    priorButton.remove();
  });

  it('EDITOR-43 exposes a dialog and required stable test IDs', () => {
    renderEditor();

    expect(screen.getByRole('dialog', { name: '新增票券' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('ticket-editor-modal')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-type-attachment')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-type-web-link')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-type-external-app')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-title-input')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-day-select')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-submit-button')).toHaveTextContent('新增票券');
    expect(screen.getByTestId('ticket-cancel-button')).toBeInTheDocument();
  });

  it('EDITOR-44 uses a safe member token without creating name-based DOM ids', () => {
    renderEditor();

    expect(screen.getByTestId('ticket-member-u738b-u6cd3-u6587')).toBeInTheDocument();
    expect(document.querySelector('#王泓文')).toBeNull();
  });

  it('EDITOR-45 preserves edit id and timestamps without generating new values', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: webTicket });

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket).toMatchObject({
      id: 'ticket-web',
      createdAt: 300,
      updatedAt: 400,
    });
  });

  it('EDITOR-46 returns replace when a non-attachment edit selects an attachment', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: webTicket });
    const file = new File(['image'], 'new-ticket.webp', { type: 'image/webp' });
    await user.click(screen.getByTestId('ticket-type-attachment'));
    await user.upload(screen.getByTestId('ticket-file-input'), file);

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].attachmentChange).toEqual({ action: 'replace', file });
  });

  it('EDITOR-47 keeps attachment intent when switching between non-attachment types', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor({ mode: 'edit', ticket: webTicket });
    await user.click(screen.getByTestId('ticket-type-external-app'));
    await user.type(screen.getByTestId('ticket-app-name-input'), 'Rail App');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].attachmentChange).toEqual({ action: 'keep', file: null });
  });

  it('EDITOR-48 does not generate create timestamps or a usageDate copy', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseWebLink(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket).toMatchObject({
      id: '',
      createdAt: null,
      updatedAt: null,
      dayId: 'Day 1',
    });
    expect(props.onSubmit.mock.calls[0][0].ticket).not.toHaveProperty('usageDate');
  });

  it('EDITOR-49 normalizes a valid external-app fallback URL', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await chooseExternalApp(user);
    await user.click(screen.getByTestId('ticket-more-settings-toggle'));
    await user.type(screen.getByTestId('ticket-fallback-url-input'), 'fallback.example/ticket');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(props.onSubmit.mock.calls[0][0].ticket.fallbackUrl).toBe('https://fallback.example/ticket');
  });

  it('EDITOR-50 requires a non-blank title near the title input', async () => {
    const user = userEvent.setup();
    const { props } = renderEditor();
    await user.click(screen.getByTestId('ticket-type-web-link'));
    await user.type(screen.getByTestId('ticket-url-input'), 'https://tickets.example/item');

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByText('請輸入票券名稱。')).toBeInTheDocument();
    expect(screen.getByTestId('ticket-title-input')).toHaveAttribute('aria-describedby', 'ticket-title-error');
    expect(props.onSubmit).not.toHaveBeenCalled();
  });
});

describe('TicketEditorModal async submission contract', () => {
  const prepareValidWebForm = async (user) => {
    await chooseWebLink(user);
  };

  it('EDITOR-51 calls an async onSubmit only once during duplicate submission', async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    const onSubmit = vi.fn(() => new Promise((resolve) => {
      resolveSubmit = resolve;
    }));
    renderEditor({ onSubmit });
    await prepareValidWebForm(user);
    const form = screen.getByTestId('ticket-submit-button').closest('form');

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    resolveSubmit();
    await waitFor(() => expect(screen.getByTestId('ticket-submit-button')).toBeEnabled());
  });

  it('EDITOR-52 disables submit while the Promise is pending', async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    renderEditor({
      onSubmit: () => new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    });
    await prepareValidWebForm(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByTestId('ticket-submit-button')).toBeDisabled();
    expect(screen.getByTestId('ticket-submit-button')).toHaveTextContent('儲存中…');
    resolveSubmit();
    await waitFor(() => expect(screen.getByTestId('ticket-submit-button')).toBeEnabled());
  });

  it('EDITOR-53 disables cancel while the Promise is pending', async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    renderEditor({
      onSubmit: () => new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    });
    await prepareValidWebForm(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    expect(screen.getByTestId('ticket-cancel-button')).toBeDisabled();
    resolveSubmit();
    await waitFor(() => expect(screen.getByTestId('ticket-cancel-button')).toBeEnabled());
  });

  it('EDITOR-54 ignores Escape while submission is pending', async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    const onClose = vi.fn();
    renderEditor({
      onClose,
      onSubmit: () => new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    });
    await prepareValidWebForm(user);
    await user.click(screen.getByTestId('ticket-submit-button'));

    await user.keyboard('{Escape}');

    expect(onClose).not.toHaveBeenCalled();
    resolveSubmit();
    await waitFor(() => expect(screen.getByTestId('ticket-submit-button')).toBeEnabled());
  });

  it('EDITOR-55 keeps the modal open after onSubmit rejects', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderEditor({ onClose, onSubmit: vi.fn().mockRejectedValue(new Error('database failed')) });
    await prepareValidWebForm(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    await waitFor(() => expect(screen.getByTestId('ticket-submission-error')).toHaveTextContent('票券暫時無法儲存'));
    expect(screen.getByTestId('ticket-editor-modal')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('EDITOR-56 preserves entered fields after onSubmit rejects', async () => {
    const user = userEvent.setup();
    renderEditor({ onSubmit: vi.fn().mockRejectedValue(new Error('database failed')) });
    await chooseWebLink(user, { title: '保留的票券', url: 'tickets.example/preserved' });

    await user.click(screen.getByTestId('ticket-submit-button'));

    await waitFor(() => expect(screen.getByTestId('ticket-submission-error')).not.toBeEmptyDOMElement());
    expect(screen.getByTestId('ticket-title-input')).toHaveValue('保留的票券');
    expect(screen.getByTestId('ticket-url-input')).toHaveValue('tickets.example/preserved');
  });

  it('EDITOR-57 exposes submission failure through an assertive aria-live region', async () => {
    const user = userEvent.setup();
    renderEditor({ onSubmit: vi.fn().mockRejectedValue(new Error('database failed')) });
    await prepareValidWebForm(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    await waitFor(() => expect(screen.getByTestId('ticket-submission-error')).toHaveTextContent('票券暫時無法儲存，請稍後再試。'));
    expect(screen.getByTestId('ticket-submission-error')).toHaveAttribute('aria-live', 'assertive');
  });

  it('EDITOR-58 hides progress for null and shows an accessible progressbar for a number', () => {
    const view = renderEditor({ uploadProgress: null });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();

    view.rerender(<TicketEditorModal {...view.props} uploadProgress={45} />);

    expect(screen.getByRole('progressbar', { name: '附件上傳進度' })).toHaveAttribute('aria-valuemin', '0');
    expect(screen.getByRole('progressbar', { name: '附件上傳進度' })).toHaveAttribute('aria-valuemax', '100');
  });

  it('EDITOR-59 reports progress value and uses it in pending button copy', async () => {
    const user = userEvent.setup();
    let resolveSubmit;
    renderEditor({
      uploadProgress: 45,
      onSubmit: () => new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    });
    await prepareValidWebForm(user);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '45');
    await user.click(screen.getByTestId('ticket-submit-button'));
    expect(screen.getByTestId('ticket-submit-button')).toHaveTextContent('上傳中 45%');

    resolveSubmit();
    await waitFor(() => expect(screen.getByTestId('ticket-submit-button')).toBeEnabled());
  });

  it('EDITOR-60 does not close itself after async onSubmit succeeds', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderEditor({ onClose, onSubmit });
    await prepareValidWebForm(user);

    await user.click(screen.getByTestId('ticket-submit-button'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('ticket-editor-modal')).toBeInTheDocument();
  });
});
