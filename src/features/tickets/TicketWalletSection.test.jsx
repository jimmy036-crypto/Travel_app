import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TicketWalletSection } from './TicketWalletSection.jsx';

const members = ['王泓文', '成員 B', '成員 C'];

const commonTicket = {
  id: 'common',
  title: '共同車票',
  ticketType: 'web-link',
  url: 'https://tickets.example/common',
  audienceType: 'all',
  dayId: 'Day 2',
  usageTime: '09:00',
  reminderMinutes: 30,
  memo: '集合前開啟',
};

const privateA = {
  id: 'private-a',
  title: '王泓文票券',
  ticketType: 'web-link',
  url: 'https://tickets.example/a',
  audienceType: 'members',
  assignedMembers: ['王泓文'],
  dayId: 'Day 1',
};

const privateB = {
  id: 'private-b',
  title: '成員 B 票券',
  ticketType: 'web-link',
  url: 'https://tickets.example/b',
  audienceType: 'members',
  assignedMembers: ['成員 B'],
};

const renderWallet = (props = {}) => {
  const callbacks = {
    onSelectActiveMember: vi.fn(),
    onCreateTicket: vi.fn(),
    onEditTicket: vi.fn(),
    onDeleteTicket: vi.fn(),
    onOpenImage: vi.fn(),
    onCopyOrderNumber: vi.fn(),
  };
  const view = render(
    <TicketWalletSection
      tickets={[commonTicket, privateA, privateB]}
      members={members}
      activeMember="王泓文"
      startDate="2026-09-20"
      t={{}}
      {...callbacks}
      {...props}
    />,
  );
  return { ...view, callbacks };
};

const cardFor = (title) => screen.getByText(title).closest('[data-testid="ticket-card"]');

describe('TicketWalletSection', () => {
  afterEach(cleanup);

  it('shows the complete empty state without an identity picker when members are empty', () => {
    renderWallet({ tickets: [], members: [], activeMember: '' });
    expect(screen.getByText('尚未加入票券')).toBeInTheDocument();
    expect(screen.getByText(/可加入圖片、PDF、網頁票券/)).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-active-member-picker')).not.toBeInTheDocument();
  });

  it('shows a filtered empty state and can return to all tickets', () => {
    renderWallet({ tickets: [privateA] });
    fireEvent.click(screen.getByTestId('ticket-filter-common'));
    expect(screen.getByText('尚未加入共同票券')).toBeInTheDocument();
    fireEvent.click(screen.getByText('查看全部票券'));
    expect(screen.getByText('王泓文票券')).toBeInTheDocument();
  });

  it('filters all, common, and member views while keeping common tickets unique', () => {
    renderWallet();
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    expect(screen.getAllByTestId('ticket-card')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('ticket-filter-common'));
    expect(screen.getAllByTestId('ticket-card')).toHaveLength(1);
    expect(screen.getByText('共同車票')).toBeInTheDocument();

    fireEvent.click(screen.getAllByTestId('ticket-filter-member').find((button) => button.dataset.member === '王泓文'));
    expect(screen.getAllByTestId('ticket-card')).toHaveLength(2);
    expect(screen.getByText('共同車票')).toBeInTheDocument();
    expect(screen.getByText('王泓文票券')).toBeInTheDocument();
    expect(screen.queryByText('成員 B 票券')).not.toBeInTheDocument();
    expect(screen.getAllByText('共同車票')).toHaveLength(1);
  });

  it('marks filters with aria-pressed and labels the active identity as mine', () => {
    renderWallet();
    const own = screen.getAllByTestId('ticket-filter-member').find((button) => button.dataset.member === '王泓文');
    expect(own).toHaveTextContent('我的・王泓文');
    expect(own).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    expect(screen.getByTestId('ticket-filter-all')).toHaveAttribute('aria-pressed', 'true');
    expect(own).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows the inline identity picker and selection changes identity plus the view', () => {
    const { callbacks } = renderWallet({ activeMember: '' });
    expect(screen.getByTestId('ticket-active-member-picker')).toBeInTheDocument();
    const memberButton = screen.getAllByTestId('ticket-active-member-button').find((button) => button.dataset.member === '成員 B');
    fireEvent.click(memberButton);
    expect(callbacks.onSelectActiveMember).toHaveBeenCalledWith('成員 B');
    expect(screen.getByText('成員 B 票券')).toBeInTheDocument();
    expect(screen.queryByText('王泓文票券')).not.toBeInTheDocument();
  });

  it('viewing another member does not change device identity', () => {
    const { callbacks } = renderWallet();
    const memberButton = screen.getAllByTestId('ticket-filter-member').find((button) => button.dataset.member === '成員 B');
    fireEvent.click(memberButton);
    expect(callbacks.onSelectActiveMember).not.toHaveBeenCalled();
    expect(screen.getByText('成員 B 票券')).toBeInTheDocument();
  });

  it('normalizes legacy image, PDF, and link tickets without mutating them', () => {
    const tickets = [
      { id: 'image', title: '舊圖片', type: 'image', owner: '所有人', url: 'https://example.com/image.png', storagePath: 'old/image' },
      { id: 'pdf', title: '舊 PDF', type: 'pdf', owner: '王泓文', url: 'https://example.com/ticket.pdf', storagePath: 'old/pdf' },
      { id: 'link', title: '舊連結', type: 'link', owner: '所有人', url: 'https://example.com/ticket' },
    ];
    const before = structuredClone(tickets);
    renderWallet({ tickets });
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    expect(screen.getByText('圖片票券')).toBeInTheDocument();
    expect(screen.getByText('PDF 票券')).toBeInTheDocument();
    expect(screen.getByText('網頁票券')).toBeInTheDocument();
    expect(tickets).toEqual(before);
  });

  it('renders canonical image and opens it only after a user click', () => {
    const ticket = { ...commonTicket, id: 'image', title: '圖片', ticketType: 'attachment', attachmentKind: 'image', type: 'image', url: 'https://example.com/image.jpg', storagePath: 'rooms/r/tickets/i' };
    const { callbacks } = renderWallet({ tickets: [ticket] });
    expect(callbacks.onOpenImage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('全螢幕查看票券'));
    expect(callbacks.onOpenImage).toHaveBeenCalledWith(expect.objectContaining({ id: 'image', ticketType: 'attachment' }));
  });

  it('renders PDF and web links as safe anchors', () => {
    renderWallet({ tickets: [
      { ...commonTicket, id: 'pdf', title: 'PDF', ticketType: 'attachment', attachmentKind: 'pdf', type: 'pdf', url: 'https://example.com/ticket.pdf', storagePath: 'p' },
      { ...commonTicket, id: 'web', title: 'WEB', ticketType: 'web-link', url: 'tickets.example/web' },
    ] });
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    for (const link of [screen.getByText('開啟 PDF 票券'), ...screen.getAllByText('開啟票券網站')]) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link.getAttribute('href')).toMatch(/^https:\/\//);
    }
  });

  it('does not navigate or render an anchor for an invalid web URL', () => {
    renderWallet({ tickets: [{ ...commonTicket, id: 'bad', title: '危險網址', url: 'javascript:alert(1)' }] });
    expect(cardFor('危險網址').querySelector('a')).toBeNull();
    expect(within(cardFor('危險網址')).getByRole('button', { name: /無法開啟/ })).toBeDisabled();
  });

  it('supports external App link, fallback-only, and manual launch modes', () => {
    renderWallet({ tickets: [
      { ...commonTicket, id: 'app', title: 'App link', ticketType: 'external-app', appName: 'Klook', appUrl: 'https://app.example/ticket' },
      { ...commonTicket, id: 'fallback', title: 'Fallback', ticketType: 'external-app', appName: 'KKday', appUrl: '', fallbackUrl: 'https://web.example/ticket' },
      { ...commonTicket, id: 'manual', title: 'Manual', ticketType: 'external-app', appName: 'JR App', appUrl: '', fallbackUrl: '' },
    ] });
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    expect(screen.getByText('在 App 中開啟票券')).toHaveAttribute('href', 'https://app.example/ticket');
    expect(screen.getByText('開啟票券網站')).toHaveAttribute('href', 'https://web.example/ticket');
    expect(screen.getByText('查看開啟方式')).toBeInTheDocument();
  });

  it('shows a distinct fallback only when it differs from the App URL', () => {
    renderWallet({ tickets: [
      { ...commonTicket, id: 'same', title: '相同', ticketType: 'external-app', appName: 'App', appUrl: 'https://same.example/ticket', fallbackUrl: 'https://same.example/ticket' },
      { ...commonTicket, id: 'different', title: '不同', ticketType: 'external-app', appName: 'App', appUrl: 'https://app.example/ticket', fallbackUrl: 'https://fallback.example/ticket' },
    ] });
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    expect(within(cardFor('相同')).queryByText('開啟備用網頁')).not.toBeInTheDocument();
    expect(within(cardFor('不同')).getByText('開啟備用網頁')).toHaveAttribute('href', 'https://fallback.example/ticket');
  });

  it('expands safe manual instructions and custom instructions', () => {
    renderWallet({ tickets: [
      { ...commonTicket, id: 'manual', title: '手動', ticketType: 'external-app', appName: 'Klook' },
      { ...commonTicket, id: 'custom', title: '說明', ticketType: 'external-app', appName: 'JR', appUrl: 'https://app.example', instructions: '到收藏頁打開票券' },
    ] });
    fireEvent.click(screen.getByTestId('ticket-filter-all'));
    fireEvent.click(within(cardFor('手動')).getByText('查看開啟方式'));
    expect(within(cardFor('手動')).getByText('請手動開啟 Klook')).toBeInTheDocument();
    expect(within(cardFor('手動')).getByText('開啟原 App')).toBeInTheDocument();
    expect(within(cardFor('手動')).getByText('找到這張票券')).toBeInTheDocument();
    fireEvent.click(within(cardFor('說明')).getByText('查看使用說明'));
    expect(within(cardFor('說明')).getByText('到收藏頁打開票券')).toBeInTheDocument();
  });

  it('shows order details and invokes the copy callback with only the number', () => {
    const { callbacks } = renderWallet({ tickets: [{
      ...commonTicket,
      id: 'order',
      title: '訂單票',
      ticketType: 'external-app',
      appName: 'Klook',
      orderNumber: 'KL-100',
      usageDetails: '12A・車次 101',
    }] });
    expect(screen.getByText('訂單編號：KL-100')).toBeInTheDocument();
    expect(screen.getByText('座位／車次／班次：12A・車次 101')).toBeInTheDocument();
    fireEvent.click(screen.getByText('複製訂單編號'));
    expect(callbacks.onCopyOrderNumber).toHaveBeenCalledWith('KL-100');
  });

  it('presents audience, presenter, date, time, reminder, and memo', () => {
    renderWallet({ tickets: [{
      ...commonTicket,
      id: 'details',
      title: '詳細票券',
      audienceType: 'members',
      assignedMembers: ['王泓文', '成員 B', '成員 C'],
      presenterMember: '王泓文',
    }] });
    const card = cardFor('詳細票券');
    expect(card).toHaveTextContent('王泓文、成員 B等 3 人');
    expect(card).toHaveTextContent('由王泓文負責出示');
    expect(card).toHaveTextContent('第 2 天・2026/09/21 09:00');
    expect(card).toHaveTextContent('建議提前 30 分鐘開啟');
    expect(card).toHaveTextContent('備註：集合前開啟');
  });

  it('shows all three external App safety states only when enabled', () => {
    renderWallet({ tickets: [{
      ...commonTicket,
      id: 'safety',
      title: '安全提示',
      ticketType: 'external-app',
      appName: 'App',
      dynamicCode: true,
      requiresNetwork: true,
      requiresLogin: true,
    }] });
    expect(screen.getByText('⚠️ 動態條碼，請勿依賴截圖')).toBeInTheDocument();
    expect(screen.getByText('使用時需要網路')).toBeInTheDocument();
    expect(screen.getByText('請提前確認已登入原 App')).toBeInTheDocument();
  });

  it('uses callbacks for edit and delete, and blocks only a deleting ticket', () => {
    const { callbacks } = renderWallet({ deletingTicketId: 'private-a' });
    const card = cardFor('王泓文票券');
    fireEvent.click(within(card).getByTestId('ticket-edit-button'));
    expect(callbacks.onEditTicket).toHaveBeenCalledWith(expect.objectContaining({ id: 'private-a' }));
    expect(within(card).getByTestId('ticket-delete-button')).toBeDisabled();
    expect(within(card).getByTestId('ticket-delete-button')).toHaveTextContent('刪除中…');
    const commonCard = cardFor('共同車票');
    fireEvent.click(within(commonCard).getByTestId('ticket-delete-button'));
    expect(callbacks.onDeleteTicket).toHaveBeenCalledWith('common');
  });

  it('disables both create entry points while saving', () => {
    renderWallet({ tickets: [], isSavingTicket: true });
    expect(screen.getAllByRole('button', { name: '新增票券' })).toHaveLength(2);
    screen.getAllByRole('button', { name: '新增票券' }).forEach((button) => expect(button).toBeDisabled());
  });

  it('keeps the panel mounted, hidden when inactive, and constrains horizontal overflow', () => {
    renderWallet({ isActive: false });
    const panel = screen.getByTestId('ticket-panel');
    expect(panel).toHaveAttribute('hidden');
    expect(panel).toHaveClass('overflow-x-hidden');
    expect(screen.getByLabelText('票券篩選')).toHaveClass('overflow-x-auto', 'max-w-full');
  });

  it('shows 日期未指定 for legacy tickets without dayId', () => {
    renderWallet({ tickets: [{ id: 'old', title: '舊票', type: 'link', owner: '所有人', url: 'https://example.com' }] });
    expect(screen.getByText('日期未指定')).toBeInTheDocument();
  });
});
