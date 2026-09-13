import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ticketMocks = vi.hoisted(() => ({
  walletProps: null,
  editorProps: null,
  actionDeps: null,
  saveTicket: vi.fn(),
  deleteTicket: vi.fn(),
  toastInfo: vi.fn(),
}));

const firebaseMocks = vi.hoisted(() => ({
  db: { mocked: true },
  storage: { mocked: true },
  listeners: new Map(),
  rooms: new Map(),
  deferInitialValue: false,
}));

vi.mock('./firebase.js', () => ({
  get db() { return firebaseMocks.db; },
  get storage() { return firebaseMocks.storage; },
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((db, path) => ({ db, path })),
  update: vi.fn().mockResolvedValue(undefined),
  onValue: vi.fn((ref, next) => {
    firebaseMocks.listeners.set(ref.path, next);
    if (!firebaseMocks.deferInitialValue) queueMicrotask(() => next({ val: () => firebaseMocks.rooms.get(ref.path) || null }));
    return vi.fn();
  }),
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  useMapsLibrary: () => null,
  useMap: () => null,
  AdvancedMarker: () => null,
  Pin: () => null,
  Map: ({ children }) => <div>{children}</div>,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => <div>{children}</div>,
  Droppable: ({ children }) => children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, {}),
  Draggable: ({ children }) => children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

vi.mock('html2canvas-pro', () => ({ default: vi.fn() }));

vi.mock('./components/UIComponents.jsx', () => ({
  MemoViewModal: () => null,
  PlaceDetailsModal: () => null,
  EditItemModal: () => null,
  CopyItemModal: () => null,
  ExpenseModal: () => null,
  SettlementModal: () => null,
  FullscreenTicketModal: ({ ticket }) => <div data-testid="fullscreen-ticket">{ticket.title}</div>,
  ChecklistModal: () => null,
  ExportItineraryModal: () => null,
  SearchBox: () => null,
  Directions: () => null,
}));

vi.mock('./components/SyncStatusIndicator.jsx', () => ({ SyncStatusIndicator: () => null }));
vi.mock('./components/AppSettingsMenu.jsx', () => ({ AppSettingsMenu: ({ tripActions = [] }) => (
  <div>{tripActions.map(action => <button key={action.id} data-testid={`settings-${action.id}`} onClick={action.onSelect}>{action.label}</button>)}</div>
) }));
vi.mock('./components/ui/EmptyState.jsx', () => ({ EmptyState: () => <div /> }));
vi.mock('./components/ui/Skeleton.jsx', () => ({ SkeletonButton: () => <div />, SkeletonText: () => <div /> }));
vi.mock('./components/ui/useConfirm.js', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => ({ info: ticketMocks.toastInfo, warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock('./features/places/usePlaceActions.js', () => ({
  usePlaceActions: () => ({ addPlaceFromSearch: vi.fn(), savePlace: vi.fn(), deletePlace: vi.fn(), duplicatePlace: vi.fn() }),
}));
vi.mock('./features/expenses/useExpenseActions.js', () => ({
  useExpenseActions: () => ({ saveExpense: vi.fn(), deleteExpense: vi.fn() }),
}));
vi.mock('./features/expenses/ExpenseSection.jsx', () => ({ ExpenseSection: () => <div /> }));
vi.mock('./services/placesService.js', () => ({ persistItinerary: vi.fn().mockResolvedValue(undefined) }));
vi.mock('./features/offline/offlineTripCache.js', () => ({
  buildOfflineTripSnapshot: vi.fn(() => null),
  writeOfflineTripSnapshot: vi.fn(() => ({ ok: true })),
}));

vi.mock('./features/tickets/TicketWalletSection.jsx', () => ({
  TicketWalletSection: (props) => {
    ticketMocks.walletProps = props;
    const firstTicket = props.tickets[0];
    return (
      <section data-testid="ticket-panel" data-active={String(props.isActive)}>
        <span data-testid="wallet-active-member">{props.activeMember}</span>
        <span data-testid="wallet-ticket-count">{props.tickets.length}</span>
        <button data-testid="wallet-create" onClick={props.onCreateTicket}>create</button>
        <button data-testid="wallet-edit" onClick={() => props.onEditTicket(firstTicket)}>edit</button>
        <button data-testid="wallet-delete" onClick={() => props.onDeleteTicket(firstTicket?.id)}>delete</button>
        <button data-testid="wallet-image" onClick={() => props.onOpenImage(firstTicket)}>image</button>
      </section>
    );
  },
}));

vi.mock('./features/tickets/TicketEditorModal.jsx', () => ({
  TicketEditorModal: (props) => {
    ticketMocks.editorProps = props;
    const payload = {
      ticket: { id: props.mode === 'edit' ? props.ticket?.id : '', title: 'Submitted ticket', ticketType: 'web-link' },
      attachmentChange: { action: 'keep', file: null },
    };
    return (
      <div data-testid="ticket-editor-modal">
        <span data-testid="editor-mode">{props.mode}</span>
        <span data-testid="editor-default-day">{props.defaultDayId}</span>
        <span data-testid="editor-upload-progress">{String(props.uploadProgress)}</span>
        <button data-testid="editor-submit" onClick={() => { void props.onSubmit(payload).catch(() => {}); }}>submit</button>
      </div>
    );
  },
}));

vi.mock('./features/tickets/useTicketActions.js', () => ({
  useTicketActions: (deps) => {
    ticketMocks.actionDeps = deps;
    return {
      saveTicket: async (payload) => {
        const result = await ticketMocks.saveTicket(payload);
        deps.callbacks.closeTicketEditor();
        return result;
      },
      deleteTicket: ticketMocks.deleteTicket,
      isSavingTicket: false,
      deletingTicketId: 'deleting-ticket',
      uploadProgress: 45,
    };
  },
}));

import TripDetail from './TripDetail.jsx';

const roomData = (members = ['Ann', 'Bob']) => ({
  meta: {
    title: 'Ticket Trip',
    destination: 'Taipei',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    members,
    themeColor: '#123456',
  },
  itinerary: { 'Day 1': [], 'Day 2': [] },
  expenses: [],
  settlements: [],
  tickets: [{
    id: 'ticket-1',
    title: 'Ticket One',
    ticketType: 'attachment',
    attachmentKind: 'image',
    type: 'image',
    url: 'https://example.com/ticket.jpg',
    storagePath: 'rooms/room/tickets/ticket-1/file.jpg',
    audienceType: 'all',
  }],
  checklist: {},
});

const renderTrip = async (roomId = 'room-1', keepIntroduction = false) => {
  const props = {
    roomId,
    accountUser: { uid: `test-account-${++accountSequence}` },
    onBack: vi.fn(),
    onUpdateTripMeta: vi.fn(),
    onOpenReleaseNotes: vi.fn(),
    onStartFeatureTour: vi.fn(),
    onCheckUpdates: vi.fn(),
    isCheckingUpdates: false,
    onTourAvailabilityChange: vi.fn(),
    isOnline: true,
  };
  const view = render(<TripDetail {...props} />);
  await waitFor(() => expect(screen.getByTestId('wallet-ticket-count')).toHaveTextContent('1'));
  if (!keepIntroduction && screen.queryByRole('button', { name: '先看看' })) {
    fireEvent.click(screen.getByRole('button', { name: '先看看' }));
  }
  return { ...view, props };
};

let accountSequence = 0;

describe('TripDetail ticket wallet integration', () => {
  beforeEach(() => {
    ticketMocks.walletProps = null;
    ticketMocks.editorProps = null;
    ticketMocks.actionDeps = null;
    ticketMocks.saveTicket.mockReset().mockResolvedValue({ id: 'saved' });
    ticketMocks.deleteTicket.mockReset().mockResolvedValue(true);
    ticketMocks.toastInfo.mockReset();
    firebaseMocks.listeners.clear();
    firebaseMocks.deferInitialValue = false;
    firebaseMocks.rooms.clear();
    firebaseMocks.rooms.set('rooms/room-1', roomData());
    firebaseMocks.rooms.set('rooms/room-2', roomData(['Carol']));
    localStorage.clear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ daily: { time: [] } }) });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the formal Wallet and opens create/edit Editor with current-day and progress props', async () => {
    await renderTrip();
    expect(screen.getByTestId('ticket-panel')).toBeInTheDocument();
    expect(ticketMocks.walletProps.deletingTicketId).toBe('deleting-ticket');

    fireEvent.click(screen.getByTestId('wallet-create'));
    expect(screen.getByTestId('editor-mode')).toHaveTextContent('create');
    expect(screen.getByTestId('editor-default-day')).toHaveTextContent('Day 1');
    expect(screen.getByTestId('editor-upload-progress')).toHaveTextContent('45');

    await act(async () => ticketMocks.editorProps.onClose());
    fireEvent.click(screen.getByTestId('wallet-edit'));
    expect(screen.getByTestId('editor-mode')).toHaveTextContent('edit');
    expect(ticketMocks.editorProps.ticket).toEqual(expect.objectContaining({ id: 'ticket-1' }));
  });

  it('passes Editor payload to saveTicket, closes only on success, and retains Editor on failure', async () => {
    await renderTrip();
    fireEvent.click(screen.getByTestId('wallet-create'));
    fireEvent.click(screen.getByTestId('editor-submit'));
    await waitFor(() => expect(ticketMocks.saveTicket).toHaveBeenCalledWith(expect.objectContaining({
      ticket: expect.objectContaining({ title: 'Submitted ticket' }),
      attachmentChange: { action: 'keep', file: null },
    })));
    await waitFor(() => expect(screen.queryByTestId('ticket-editor-modal')).not.toBeInTheDocument());

    ticketMocks.saveTicket.mockRejectedValueOnce(new Error('save failed'));
    fireEvent.click(screen.getByTestId('wallet-create'));
    fireEvent.click(screen.getByTestId('editor-submit'));
    await waitFor(() => expect(ticketMocks.saveTicket).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('ticket-editor-modal')).toBeInTheDocument();
  });

  it('routes delete through useTicketActions and images through FullscreenTicketModal', async () => {
    await renderTrip();
    fireEvent.click(screen.getByTestId('wallet-delete'));
    expect(ticketMocks.deleteTicket).toHaveBeenCalledWith('ticket-1');
    fireEvent.click(screen.getByTestId('wallet-image'));
    expect(screen.getByTestId('fullscreen-ticket')).toHaveTextContent('Ticket One');
  });

  it('passes the raw state setter to the actions Hook without marking tickets dirty', async () => {
    await renderTrip();
    expect(ticketMocks.actionDeps.state.setTicketsState).toEqual(expect.any(Function));
    expect(ticketMocks.actionDeps.refs.dirtyBranchesRef.current.tickets).toBe(false);

    act(() => ticketMocks.actionDeps.state.setTicketsState([{ id: 'raw-update', title: 'Raw update' }]));
    expect(screen.getByTestId('wallet-ticket-count')).toHaveTextContent('1');
    expect(ticketMocks.walletProps.tickets[0]).toEqual({ id: 'raw-update', title: 'Raw update' });
    expect(ticketMocks.actionDeps.refs.dirtyBranchesRef.current.tickets).toBe(false);
  });

  it('does not show an empty wallet before the trip listener supplies tickets', async () => {
    firebaseMocks.deferInitialValue = true;
    render(<TripDetail roomId="room-1" onBack={vi.fn()} />);
    // Finish the mount's queued loading initialization before delivering the delayed listener.
    await act(async () => {});
    expect(screen.queryByTestId('ticket-panel')).not.toBeInTheDocument();
    await act(async () => firebaseMocks.listeners.get('rooms/room-1')({ val: () => roomData() }));
    expect(screen.getByTestId('wallet-ticket-count')).toHaveTextContent('1');
  });

  it('does not open a stale image after switching trips', async () => {
    const view = await renderTrip();
    let finishRead;
    vi.spyOn(ticketMocks.actionDeps.room.repository, 'readAttachment').mockImplementation(
      () => new Promise((resolve) => { finishRead = resolve; }),
    );
    let pending;
    act(() => { pending = ticketMocks.walletProps.onOpenAttachment(ticketMocks.walletProps.tickets[0]); });
    view.rerender(<TripDetail {...view.props} roomId="room-2" />);
    await act(async () => { finishRead('blob:old-ticket'); await pending; });
    expect(screen.queryByTestId('fullscreen-ticket')).not.toBeInTheDocument();
  });

  it('opens one protected PDF window while an attachment read is pending', async () => {
    await renderTrip();
    let finishRead;
    const read = vi.spyOn(ticketMocks.actionDeps.room.repository, 'readAttachment').mockImplementation(
      () => new Promise((resolve) => { finishRead = resolve; }),
    );
    const popup = { opener: null, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup);
    const ticket = { ...ticketMocks.walletProps.tickets[0], attachmentKind: 'pdf' };
    let first;
    let second;
    act(() => {
      first = ticketMocks.walletProps.onOpenAttachment(ticket);
      second = ticketMocks.walletProps.onOpenAttachment(ticket);
    });
    expect(open).toHaveBeenCalledTimes(1);
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => { finishRead('blob:protected-pdf'); await Promise.all([first, second]); });
    expect(popup.location.replace).toHaveBeenCalledWith('blob:protected-pdf');
  });

  it('requires legacy confirmation, scopes it to account and room, excludes invalid choices, and invalidates removed members', async () => {
    localStorage.setItem('travel-active-member-room-1', 'Ann');
    const view = await renderTrip('room-1', true);
    expect(screen.getByTestId('wallet-active-member').textContent).toBe('');
    expect(screen.getByRole('dialog', { name: '你是這趟旅程中的哪位旅伴？' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ghost', exact: true })).not.toBeInTheDocument();
    const { update } = await import('firebase/database');
    update.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Bob', exact: true }));
    expect(update).not.toHaveBeenCalled();
    expect(ticketMocks.saveTicket).not.toHaveBeenCalled();
    expect(ticketMocks.deleteTicket).not.toHaveBeenCalled();
    expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('Bob');
    expect(localStorage.getItem('travel-active-member-room-1')).toBe('Ann');

    localStorage.setItem('travel-active-member-room-2', 'Carol');
    view.rerender(<TripDetail {...view.props} roomId="room-2" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Carol', exact: true })).toBeEnabled());
    expect(screen.getByTestId('wallet-active-member').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Carol', exact: true }));
    expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('Carol');

    act(() => firebaseMocks.listeners.get('rooms/room-2')({ val: () => roomData(['Dana']) }));
    await waitFor(() => expect(screen.getByTestId('wallet-active-member')).toHaveTextContent(''));
    expect(ticketMocks.toastInfo).toHaveBeenCalledWith({
      title: '請重新確認旅伴',
      description: '原旅伴已不在名單中。可在旅程設定更正，或在需要本人歸屬時選擇。',
    });
    expect(screen.queryByTestId('companion-picker')).not.toBeInTheDocument();
    expect(localStorage.getItem('travel-active-member-room-2')).toBe('Carol');
  });

  it('introduces the companion on entry, defers the tour, and skips without any business write', async () => {
    const view = await renderTrip('room-1', true);
    const { update } = await import('firebase/database');
    update.mockClear();
    await waitFor(() => expect(view.props.onTourAvailabilityChange).toHaveBeenLastCalledWith(expect.objectContaining({ ready: false })));
    expect(screen.getByRole('button', { name: '先看看' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '先看看' }));
    expect(screen.queryByTestId('companion-picker')).not.toBeInTheDocument();
    expect(screen.queryByTestId('companion-notice')).not.toBeInTheDocument();
    expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('');
    expect(update).not.toHaveBeenCalled();
    expect(ticketMocks.saveTicket).not.toHaveBeenCalled();
    await waitFor(() => expect(view.props.onTourAvailabilityChange).toHaveBeenLastCalledWith(expect.objectContaining({ ready: true })));
    view.rerender(<TripDetail {...view.props} />);
    expect(screen.queryByTestId('companion-picker')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('settings-companion'));
    expect(screen.getByRole('button', { name: '取消', exact: true })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Bob', exact: true }));
    expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('Bob');
    expect(update).not.toHaveBeenCalled();
    view.unmount();
    render(<TripDetail {...view.props} />);
    await waitFor(() => expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('Bob'));
    expect(screen.queryByTestId('companion-picker')).not.toBeInTheDocument();
  });

  it.each(['getItem throws', 'corrupt preference'])('does not claim a confirmed companion when %s leaves no member', async failure => {
    const key = `travel-companion-v1:${JSON.stringify(['firebase', `test-account-${accountSequence + 1}`, 'room-1'])}`;
    if (failure === 'corrupt preference') {
      localStorage.setItem(key, 'invalid-json');
    } else {
      const getItem = Storage.prototype.getItem;
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (storageKey) {
        if (storageKey === key) throw new DOMException('Preference read blocked', 'SecurityError');
        return getItem.call(this, storageKey);
      });
    }
    const { update } = await import('firebase/database');
    update.mockClear();
    const view = await renderTrip('room-1', true);
    const neutralWarning = {
      title: '無法記住旅伴設定',
      description: '無法確認瀏覽器已記住的旅伴；重新載入後請再次檢查設定。',
    };
    await waitFor(() => expect(ticketMocks.toastInfo).toHaveBeenCalledExactlyOnceWith(neutralWarning));
    expect(screen.getByTestId('wallet-active-member').textContent).toBe('');
    expect(screen.queryByTestId('companion-picker')).not.toBeInTheDocument();
    expect(screen.getByTestId('settings-companion')).toHaveTextContent('選擇本趟旅伴');
    view.rerender(<TripDetail {...view.props} />);
    expect(ticketMocks.toastInfo).toHaveBeenCalledExactlyOnceWith(neutralWarning);
    expect(update).not.toHaveBeenCalled();
    expect(ticketMocks.saveTicket).not.toHaveBeenCalled();
    expect(ticketMocks.deleteTicket).not.toHaveBeenCalled();
  });

  it('keeps an explicit companion usable after setItem fails and gives neutral feedback if clearing also fails', async () => {
    const key = `travel-companion-v1:${JSON.stringify(['firebase', `test-account-${accountSequence + 1}`, 'room-1'])}`;
    const setItem = Storage.prototype.setItem;
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (storageKey, value) {
      if (storageKey === key) throw new DOMException('Preference write blocked', 'QuotaExceededError');
      return setItem.call(this, storageKey, value);
    });
    const { update } = await import('firebase/database');
    update.mockClear();
    const view = await renderTrip('room-1', true);
    expect(ticketMocks.toastInfo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bob', exact: true }));
    await waitFor(() => expect(ticketMocks.toastInfo).toHaveBeenCalledExactlyOnceWith({
      title: '無法記住旅伴設定',
      description: '本次已確認的選擇仍可使用；重新載入後請再確認設定。',
    }));
    expect(write).toHaveBeenCalledWith(key, JSON.stringify({ version: 1, confirmed: true, member: 'Bob' }));
    expect(localStorage.getItem(key)).toBeNull();
    expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('Bob');
    expect(screen.getByTestId('settings-companion')).toHaveTextContent('本趟旅伴：Bob · 更正旅伴');
    view.rerender(<TripDetail {...view.props} />);
    expect(screen.getByTestId('wallet-active-member')).toHaveTextContent('Bob');
    expect(ticketMocks.toastInfo).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('settings-companion'));
    expect(screen.getByRole('button', { name: 'Bob', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(ticketMocks.toastInfo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: '清除本趟旅伴設定' }));
    await waitFor(() => expect(ticketMocks.toastInfo).toHaveBeenCalledTimes(2));
    expect(ticketMocks.toastInfo).toHaveBeenLastCalledWith({
      title: '無法記住旅伴設定',
      description: '無法確認瀏覽器已記住的旅伴；重新載入後請再次檢查設定。',
    });
    expect(write).toHaveBeenCalledWith(key, JSON.stringify({ version: 1, confirmed: false, member: '' }));
    expect(screen.getByTestId('wallet-active-member').textContent).toBe('');
    expect(screen.queryByTestId('companion-picker')).not.toBeInTheDocument();
    expect(localStorage.getItem(key)).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(ticketMocks.saveTicket).not.toHaveBeenCalled();
    expect(ticketMocks.deleteTicket).not.toHaveBeenCalled();
  });

  it('has removed the legacy formal TicketModal and direct ticket Storage deletion paths', () => {
    const source = readFileSync('src/TripDetail.jsx', 'utf8');
    expect(source).not.toMatch(/\bTicketModal\b/);
    expect(source).not.toMatch(/\bhandleDeleteTicket\b/);
    expect(source).not.toMatch(/\bdeleteObject\b/);
    expect(source).toContain('<TicketWalletSection');
    expect(source).toContain('state: { setTicketsState, setSyncStatus }');
  });

  it('closes a pending PDF window when another ticket is selected, without stale navigation', async () => {
    await renderTrip();
    let finishPdf;
    const read = vi.spyOn(ticketMocks.actionDeps.room.repository, 'readAttachment');
    read.mockImplementationOnce(() => new Promise((resolve) => { finishPdf = resolve; }));
    read.mockResolvedValueOnce('blob:latest-image');
    const popup = { opener: null, closed: false, location: { replace: vi.fn() }, close: vi.fn() };
    vi.spyOn(window, 'open').mockReturnValue(popup);
    const source = ticketMocks.walletProps.tickets[0];
    let pending;
    act(() => { pending = ticketMocks.walletProps.onOpenAttachment({ ...source, attachmentKind: 'pdf' }); });
    await act(async () => ticketMocks.walletProps.onOpenAttachment({ ...source, id: 'new-image', title: 'Latest image' }));
    expect(popup.close).toHaveBeenCalledOnce();
    await act(async () => { finishPdf('blob:old-pdf'); await pending; });
    expect(popup.location.replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('fullscreen-ticket')).toHaveTextContent('Latest image');
  });
});
