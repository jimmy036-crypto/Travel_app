import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TripDetail from './TripDetail.jsx';
import { FIREBASE_TRIP_CAPABILITIES } from './features/trip-data/tripCapabilities.js';

const { dndHandlers, routeCalculatedHandlers, toastSpies } = vi.hoisted(() => ({
  dndHandlers: { onDragEnd: null },
  routeCalculatedHandlers: new Map(),
  toastSpies: { info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() },
}));

vi.mock('./firebase.js', () => ({ db: null, storage: null }));
vi.mock('@vis.gl/react-google-maps', () => ({
  useMapsLibrary: () => null,
  useMap: () => null,
  AdvancedMarker: () => null,
  Pin: () => null,
  Map: ({ children }) => <div>{children}</div>,
}));
vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children, onDragEnd }) => {
    dndHandlers.onDragEnd = onDragEnd;
    return <div>{children}</div>;
  },
  Droppable: ({ children }) => children({
    innerRef: vi.fn(),
    droppableProps: {},
    placeholder: null,
  }, {}),
  Draggable: ({ children }) => children({
    innerRef: vi.fn(),
    draggableProps: {},
    dragHandleProps: {},
  }, { isDragging: false }),
}));
vi.mock('html2canvas-pro', () => ({ default: vi.fn() }));
vi.mock('./components/UIComponents.jsx', () => ({
  MemoViewModal: () => null,
  PlaceDetailsModal: () => null,
  EditItemModal: () => null,
  CopyItemModal: () => null,
  ExpenseModal: () => null,
  SettlementModal: () => null,
  FullscreenTicketModal: () => null,
  ChecklistModal: () => null,
  ExportItineraryModal: () => null,
  SearchBox: () => null,
  Directions: ({ dayId, onRouteCalculated }) => {
    routeCalculatedHandlers.set(dayId, onRouteCalculated);
    return null;
  },
}));
vi.mock('./components/AppSettingsMenu.jsx', () => ({ AppSettingsMenu: () => null }));
vi.mock('./components/SyncStatusIndicator.jsx', () => ({
  SyncStatusIndicator: () => null,
}));
vi.mock('./components/ui/EmptyState.jsx', () => ({ EmptyState: () => <div /> }));
vi.mock('./components/ui/Skeleton.jsx', () => ({
  SkeletonButton: () => <div />,
  SkeletonText: () => <div />,
}));
vi.mock('./components/ui/useConfirm.js', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => toastSpies,
}));
vi.mock('./features/expenses/ExpenseSection.jsx', () => ({
  ExpenseSection: () => <section data-testid="expense-section" />,
}));
vi.mock('./features/tickets/TicketWalletSection.jsx', () => ({
  TicketWalletSection: () => <section data-testid="ticket-section" />,
}));
vi.mock('./features/tickets/TicketEditorModal.jsx', () => ({
  TicketEditorModal: () => null,
}));

const snapshot = {
  meta: {
    title: '狀態機測試行程',
    destination: '東京',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    members: ['自己'],
    transport: '電車',
    themeColor: '#2563eb',
  },
  itinerary: {
    'Day 1': [
      { id: 'place-1', name: '景點一', time: '09:00', lat: 35.1, lng: 139.1 },
      { id: 'place-2', name: '景點二', time: '10:00', lat: 35.2, lng: 139.2 },
      { id: 'place-3', name: '景點三', time: '11:00', lat: 35.3, lng: 139.3 },
    ],
    'Day 2': [
      { id: 'place-4', name: '景點四', time: '09:00', lat: 35.4, lng: 139.4 },
      { id: 'place-5', name: '景點五', time: '10:00', lat: 35.5, lng: 139.5 },
    ],
  },
  expenses: [],
  settlements: [],
  tickets: [],
  checklist: [],
};

const createRepository = () => ({
  subscribeTrip(listener) {
    queueMicrotask(() => listener(snapshot));
    return vi.fn();
  },
  loadTrip: vi.fn(async () => snapshot),
  updateMeta: vi.fn(),
  updateItinerary: vi.fn(),
  updateExpenses: vi.fn(),
  updateSettlements: vi.fn(),
  updateTickets: vi.fn(),
  updateChecklist: vi.fn(),
  uploadAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  readAttachment: vi.fn(),
  dispose: vi.fn(),
  getCapabilities: () => FIREBASE_TRIP_CAPABILITIES,
});

const renderTrip = async () => {
  const repository = createRepository();
  render(
    <TripDetail
      tripId="firebase-trip"
      repository={repository}
      capabilities={repository.getCapabilities()}
      onBack={vi.fn()}
      onUpdateTripMeta={vi.fn()}
      onOpenReleaseNotes={vi.fn()}
      onStartFeatureTour={vi.fn()}
      onCheckUpdates={vi.fn()}
      onTourAvailabilityChange={vi.fn()}
    />,
  );
  await waitFor(() => expect(screen.getByTestId('active-trip-view')).toBeInTheDocument());
  await waitFor(() => expect(dndHandlers.onDragEnd).toBeInstanceOf(Function));
  await waitFor(() => expect(routeCalculatedHandlers.get('Day 1')).toBeInstanceOf(Function));
};

const reorderDay1 = () => act(() => {
  dndHandlers.onDragEnd({
    source: { droppableId: 'Day 1', index: 0 },
    destination: { droppableId: 'Day 1', index: 2 },
    reason: 'DROP',
  });
});

function recalcBadge(dayId) {
  return document
    .querySelector(`[data-testid="itinerary-day-card"][data-day-id="${dayId}"]`)
    ?.textContent || '';
}

describe('Arrival-time recalculation state machine', () => {
  beforeEach(() => {
    dndHandlers.onDragEnd = null;
    routeCalculatedHandlers.clear();
    toastSpies.error.mockClear();
    toastSpies.success.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shows pending only while a request is in flight, then settles on success', async () => {
    await renderTrip();

    reorderDay1();
    expect(recalcBadge('Day 1')).toContain('正在依新順序精算時間');

    const onRouteCalculated = routeCalculatedHandlers.get('Day 1');
    act(() => {
      onRouteCalculated('Day 1', [
        { text: '5 分鐘', value: 5, mode: 'AUTO' },
        { text: '5 分鐘', value: 5, mode: 'AUTO' },
      ]);
    });

    await waitFor(() => expect(recalcBadge('Day 1')).not.toContain('精算'));
    expect(toastSpies.error).not.toHaveBeenCalled();
  });

  it('settles to a one-time error toast and clears pending if nothing ever calls back (Map unavailable / timeout)', async () => {
    await renderTrip();
    vi.useFakeTimers();

    reorderDay1();
    expect(recalcBadge('Day 1')).toContain('精算');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });

    expect(recalcBadge('Day 1')).not.toContain('精算');
    expect(toastSpies.error).toHaveBeenCalledTimes(1);
    expect(toastSpies.error).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('無法取得新的移動時間') }),
    );
  });

  it('settles quietly (no error toast) when the user switches away from the pending day', async () => {
    await renderTrip();
    vi.useFakeTimers();

    reorderDay1();
    expect(recalcBadge('Day 1')).toContain('正在依新順序精算時間');

    const day2Card = screen.getAllByTestId('itinerary-day-card')
      .find((node) => node.getAttribute('data-day-id') === 'Day 2');
    await act(async () => {
      fireEvent.click(day2Card);
    });

    // The Day 1 badge should now read the deferred label, not the active one,
    // and switching away must not fire the failure toast.
    expect(recalcBadge('Day 1')).toContain('已重排，切換此日後精算');
    expect(recalcBadge('Day 1')).not.toContain('正在依新順序精算時間');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(toastSpies.error).not.toHaveBeenCalled();
  });

  it('does not mark a day left with one item as needing recalculation', async () => {
    await renderTrip();

    act(() => {
      dndHandlers.onDragEnd({
        source: { droppableId: 'Day 2', index: 0 },
        destination: { droppableId: 'Day 1', index: 0 },
        reason: 'DROP',
      });
    });

    // Day 1 gained a fourth item and still needs recalculation.
    expect(recalcBadge('Day 1')).toContain('精算');
    // Day 2 was left with exactly one item - there is no leg to recalculate.
    expect(recalcBadge('Day 2')).not.toContain('精算');
  });
});
