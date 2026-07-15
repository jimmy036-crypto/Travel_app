import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import TripDetail from './TripDetail.jsx';
import { onValue } from 'firebase/database';
import {
  buildOfflineTripSnapshot,
  writeOfflineTripSnapshot,
} from './features/offline/offlineTripCache.js';

const firebaseState = vi.hoisted(() => ({
  db: { mocked: true },
}));

vi.mock('./firebase.js', () => ({
  get db() {
    return firebaseState.db;
  },
  storage: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((db, path) => ({ db, path })),
  onValue: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  deleteObject: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  useMapsLibrary: vi.fn(() => null),
  useMap: vi.fn(() => null),
  AdvancedMarker: () => null,
  Pin: () => null,
  Map: ({ children }) => <div data-testid="mock-map">{children}</div>,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => <div>{children}</div>,
  Droppable: ({ children }) => children({ innerRef: vi.fn(), droppableProps: {}, placeholder: null }, {}),
  Draggable: ({ children }) => children({ innerRef: vi.fn(), draggableProps: {}, dragHandleProps: {} }, { isDragging: false }),
}));

vi.mock('html2canvas-pro', () => ({
  default: vi.fn(),
}));

vi.mock('./components/UIComponents.jsx', () => ({
  MemoViewModal: () => null,
  PlaceDetailsModal: () => null,
  EditItemModal: () => null,
  CopyItemModal: () => null,
  ExpenseModal: () => null,
  SettlementModal: () => null,
  TicketModal: () => null,
  FullscreenTicketModal: () => null,
  ChecklistModal: () => null,
  ExportItineraryModal: () => null,
  SearchBox: () => null,
  Directions: () => null,
}));

vi.mock('./components/SyncStatusIndicator.jsx', () => ({
  SyncStatusIndicator: ({ status }) => <div data-testid="sync-status">{status}</div>,
}));

vi.mock('./components/AppSettingsMenu.jsx', () => ({
  AppSettingsMenu: () => null,
}));

vi.mock('./components/ui/EmptyState.jsx', () => ({
  EmptyState: ({ testId }) => <div data-testid={testId || 'empty-state'} />,
}));

vi.mock('./components/ui/Skeleton.jsx', () => ({
  SkeletonButton: () => <div />,
  SkeletonText: () => <div />,
}));

vi.mock('./components/ui/useConfirm.js', () => ({
  useConfirm: () => vi.fn(),
}));

vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));

vi.mock('./features/places/usePlaceActions.js', () => ({
  usePlaceActions: () => ({
    addPlaceFromSearch: vi.fn(),
    savePlace: vi.fn(),
    deletePlace: vi.fn(),
    duplicatePlace: vi.fn(),
  }),
}));

vi.mock('./features/expenses/useExpenseActions.js', () => ({
  useExpenseActions: () => ({
    saveExpense: vi.fn(),
    deleteExpense: vi.fn(),
  }),
}));

vi.mock('./services/placesService.js', () => ({
  persistItinerary: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./features/offline/offlineTripCache.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    buildOfflineTripSnapshot: vi.fn(actual.buildOfflineTripSnapshot),
    writeOfflineTripSnapshot: vi.fn(() => ({ ok: true })),
  };
});

const firebaseRoom = {
  meta: {
    title: 'Loaded Trip',
    destination: 'Taipei',
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    members: ['Ann'],
    transport: 'Train',
    themeColor: '#123456',
  },
  itinerary: {
    'Day 1': [
      { id: 'p1', name: 'Place 1', time: '10:00', address: 'Addr 1', memo: 'Memo 1', category: 'Food' },
    ],
  },
  expenses: [{ id: 'e1', cost: 100, payer: 'Ann', dayId: 'Day 1' }],
  tickets: [{ id: 't1', title: 'Ticket' }],
  checklist: {
    c1: { id: 'c1', text: 'Pack', completed: true },
    c2: { id: 'c2', text: 'Book', completed: false },
  },
};

function mockOnValueSuccess(data = firebaseRoom) {
  onValue.mockImplementation((ref, next) => {
    queueMicrotask(() => next({ val: () => data }));
    return vi.fn();
  });
}

function mockOnValueError(error = new Error('load failed')) {
  onValue.mockImplementation((ref, next, fail) => {
    queueMicrotask(() => fail(error));
    return vi.fn();
  });
}

async function renderTripDetail(props = {}) {
  render(
    <TripDetail
      roomId="room1"
      onBack={vi.fn()}
      onUpdateTripMeta={vi.fn()}
      onOpenReleaseNotes={vi.fn()}
      onStartFeatureTour={vi.fn()}
      onCheckUpdates={vi.fn()}
      isCheckingUpdates={false}
      onTourAvailabilityChange={vi.fn()}
      isOnline={true}
      {...props}
    />
  );
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function advanceCacheDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(500);
  });
}

describe('TripDetail offline cache integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    firebaseState.db = { mocked: true };
    mockOnValueSuccess();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('CACHE-INTEGRATION-01 writes cache after a valid Firebase snapshot loads', async () => {
    await renderTripDetail();
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).toHaveBeenCalledTimes(1);
  });

  it('CACHE-INTEGRATION-02 passes roomId, meta, itinerary object, expenses, checklist, and tickets', async () => {
    await renderTripDetail();
    await advanceCacheDebounce();

    expect(buildOfflineTripSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      roomId: 'room1',
      meta: expect.objectContaining({ title: 'Loaded Trip' }),
      itinerary: expect.objectContaining({
        'Day 1': expect.arrayContaining([expect.objectContaining({ id: 'p1' })]),
      }),
      expenses: expect.arrayContaining([expect.objectContaining({ id: 'e1' })]),
      checklistItems: expect.arrayContaining([expect.objectContaining({ id: 'c1' })]),
      tickets: expect.arrayContaining([expect.objectContaining({ id: 't1' })]),
    }));
    expect(buildOfflineTripSnapshot.mock.calls[0][0].expenseStats.totalExpense).toBe(100);
  });

  it('CACHE-INTEGRATION-03 does not write while offline', async () => {
    await renderTripDetail({ isOnline: false });
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).not.toHaveBeenCalled();
  });

  it('CACHE-INTEGRATION-04 does not write after Firebase load error', async () => {
    mockOnValueError();
    await renderTripDetail();
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).not.toHaveBeenCalled();
  });

  it('CACHE-INTEGRATION-05 does not write in standalone fallback without db', async () => {
    firebaseState.db = null;
    await renderTripDetail();
    await advanceCacheDebounce();

    expect(onValue).not.toHaveBeenCalled();
    expect(writeOfflineTripSnapshot).not.toHaveBeenCalled();
  });

  it('does not write when Firebase room data is missing', async () => {
    mockOnValueSuccess(null);
    await renderTripDetail();
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).not.toHaveBeenCalled();
  });

  it('CACHE-INTEGRATION-06 clears the debounce timer on unmount', async () => {
    const view = render(
      <TripDetail
        roomId="room1"
        onBack={vi.fn()}
        onUpdateTripMeta={vi.fn()}
        isOnline={true}
      />
    );
    await act(async () => {});
    view.unmount();
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).not.toHaveBeenCalled();
  });

  it('CACHE-INTEGRATION-07 does not crash when cache write reports failure', async () => {
    writeOfflineTripSnapshot.mockReturnValue({ ok: false, reason: 'storage-unavailable' });

    await expect(renderTripDetail()).resolves.toBeUndefined();
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).toHaveBeenCalledTimes(1);
  });

  it('CACHE-INTEGRATION-08 does not write while sync status is not saved', async () => {
    // Initial load reaches saved and writes once. A later remote update sets remote-updated first,
    // which is intentionally not cacheable until it returns to saved.
    let nextCallback;
    onValue.mockImplementation((ref, next) => {
      nextCallback = next;
      queueMicrotask(() => next({ val: () => firebaseRoom }));
      return vi.fn();
    });

    await renderTripDetail();
    await advanceCacheDebounce();
    writeOfflineTripSnapshot.mockClear();

    await act(async () => {
      nextCallback({ val: () => ({ ...firebaseRoom, meta: { ...firebaseRoom.meta, title: 'Remote Update' } }) });
    });
    await advanceCacheDebounce();

    expect(writeOfflineTripSnapshot).not.toHaveBeenCalled();
  });
});
