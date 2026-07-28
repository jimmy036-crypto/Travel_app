import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TripDetail from './TripDetail.jsx';
import {
  FIREBASE_TRIP_CAPABILITIES,
  LOCAL_EXAMPLE_TRIP_CAPABILITIES,
} from './features/trip-data/tripCapabilities.js';

const { expenseSectionSpy } = vi.hoisted(() => ({
  expenseSectionSpy: vi.fn(),
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
  DragDropContext: ({ children }) => <div>{children}</div>,
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
  Directions: () => null,
}));
vi.mock('./components/AppSettingsMenu.jsx', () => ({ AppSettingsMenu: () => null }));
vi.mock('./components/SyncStatusIndicator.jsx', () => ({
  SyncStatusIndicator: ({ status }) => <span data-testid="sync-status">{status}</span>,
}));
vi.mock('./components/ui/EmptyState.jsx', () => ({ EmptyState: () => <div /> }));
vi.mock('./components/ui/Skeleton.jsx', () => ({
  SkeletonButton: () => <div />,
  SkeletonText: () => <div />,
}));
vi.mock('./components/ui/useConfirm.js', () => ({ useConfirm: () => vi.fn() }));
vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => ({ info: vi.fn(), warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock('./features/expenses/ExpenseSection.jsx', () => ({
  ExpenseSection: (props) => {
    expenseSectionSpy(props);
    return (
      <section data-testid="expense-section">
        <span data-testid="settlement-record-count">{props.settlements.length}</span>
        <button
          type="button"
          data-testid="test-mark-settlement-paid"
          onClick={() => props.onMarkTransferPaid({
            fromParticipantId: '自己',
            toParticipantId: '朋友',
            amount: 100,
            currency: 'TWD',
          })}
        >
          mark
        </button>
      </section>
    );
  },
}));
vi.mock('./features/tickets/TicketWalletSection.jsx', () => ({
  TicketWalletSection: () => <section data-testid="ticket-section" />,
}));
vi.mock('./features/tickets/TicketEditorModal.jsx', () => ({
  TicketEditorModal: () => null,
}));

const snapshot = {
  meta: {
    title: '東京三日自由行（範例）',
    destination: '東京',
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    members: ['自己'],
    transport: '電車',
    themeColor: '#2563eb',
  },
  itinerary: {
    'Day 1': [
      {
        id: 'place-1',
        name: '沖繩美麗海水族館 海洋博公園 熱帶夢幻中心紀念品商店',
        time: '10:00',
      },
      {
        id: 'place-2',
        name: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
        time: '11:00',
      },
    ],
  },
  expenses: [],
  settlements: [],
  tickets: [],
  checklist: [],
};

const createRepository = (capabilities) => ({
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
  getCapabilities: () => capabilities,
});

const renderWithRepository = async (repository, tripId) => {
  render(
    <TripDetail
      tripId={tripId}
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
  return {
    title: screen.getByTestId('trip-detail-title').textContent,
    expenseTabs: screen.getAllByTestId('expense-tab-button').length,
    ticketTabs: screen.getAllByTestId('ticket-tab-button').length,
    itineraryDays: screen.getAllByTestId('itinerary-day-card').length,
  };
};

describe('TripDetail repository injection', () => {
  afterEach(() => {
    expenseSectionSpy.mockClear();
    vi.restoreAllMocks();
  });

  it('renders a Firebase repository through the shared TripDetail root', async () => {
    const layout = await renderWithRepository(
      createRepository(FIREBASE_TRIP_CAPABILITIES),
      'firebase-trip',
    );
    expect(layout).toEqual({
      title: '東京三日自由行（範例）',
      expenseTabs: 2,
      ticketTabs: 2,
      itineraryDays: 3,
    });
    expect(screen.getByTestId('sync-status')).toBeInTheDocument();
  });

  it('renders the local repository with the same header, tabs, and itinerary controls', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const layout = await renderWithRepository(
      createRepository(LOCAL_EXAMPLE_TRIP_CAPABILITIES),
      'local-example-trip',
    );
    expect(layout).toEqual({
      title: '東京三日自由行（範例）',
      expenseTabs: 2,
      ticketTabs: 2,
      itineraryDays: 3,
    });
    expect(screen.queryByTestId('sync-status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /共編/ }));
    expect(alert).toHaveBeenCalledWith('建立自己的旅程後即可使用此功能');
  });

  it('rolls settlement state back when repository persistence fails', async () => {
    const repository = createRepository(FIREBASE_TRIP_CAPABILITIES);
    repository.updateSettlements.mockRejectedValueOnce(new Error('write failed'));
    await renderWithRepository(repository, 'firebase-trip');

    fireEvent.click(screen.getByTestId('test-mark-settlement-paid'));
    await waitFor(() => expect(screen.getByTestId('settlement-record-count')).toHaveTextContent('1'));
    await waitFor(() => expect(screen.getByTestId('settlement-record-count')).toHaveTextContent('0'));
    expect(repository.updateSettlements).toHaveBeenCalledWith([
      expect.objectContaining({
        fromParticipantId: '自己',
        toParticipantId: '朋友',
        amount: 100,
        currency: 'TWD',
        status: 'paid',
      }),
    ]);
  });

  it('uses only the injected local repository for example settlement writes', async () => {
    const localRepository = createRepository(LOCAL_EXAMPLE_TRIP_CAPABILITIES);
    await renderWithRepository(localRepository, 'local-example-trip');

    fireEvent.click(screen.getByTestId('test-mark-settlement-paid'));
    await waitFor(() => expect(localRepository.updateSettlements).toHaveBeenCalledTimes(1));
    expect(localRepository.updateSettlements).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'paid', currency: 'TWD' }),
    ]);
  });

  it('uses the compact mobile layout while preserving desktop actions and isolating menu clicks', async () => {
    const repository = createRepository(FIREBASE_TRIP_CAPABILITIES);
    await renderWithRepository(repository, 'firebase-trip');

    const titles = screen.getAllByTestId('place-card-title');
    expect(titles).toHaveLength(2);
    titles.forEach((title) => {
      expect(title).toHaveClass('line-clamp-2');
      expect(title).toHaveClass('[overflow-wrap:anywhere]');
    });

    const firstCard = screen.getAllByTestId('place-card')[0];
    expect(firstCard).toHaveAttribute('data-mobile-layout', 'compact');
    expect(firstCard).toHaveClass('p-2.5', 'md:p-4');
    const mobileActions = firstCard.querySelector('[data-testid="place-card-actions"]');
    expect(mobileActions).toHaveAttribute('data-layout', 'mobile-compact');
    expect(mobileActions).toHaveClass('md:hidden');
    expect(within(mobileActions).getByRole('button', { name: /導航到/ })).toBeInTheDocument();

    const menuTrigger = firstCard.querySelector('[data-testid="place-action-menu-trigger"]');
    expect(menuTrigger).toHaveClass('w-11', 'shrink-0');
    expect(menuTrigger).not.toHaveAttribute('data-rfd-drag-handle-draggable-id');
    expect(firstCard.querySelector('[data-testid="place-info-trigger"]')).toHaveClass('hidden', 'md:flex');
    expect(firstCard.querySelector('[data-testid="desktop-place-actions"]')).toHaveClass('hidden', 'md:flex');

    fireEvent.click(menuTrigger);
    expect(screen.getByTestId('place-action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-nearby')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-copy')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('place-detail-sheet')).not.toBeInTheDocument();
    expect(repository.updateItinerary).not.toHaveBeenCalled();
  });
});
