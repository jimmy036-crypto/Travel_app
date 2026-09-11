import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TripDetail from './TripDetail.jsx';
import {
  FIREBASE_TRIP_CAPABILITIES,
  LOCAL_EXAMPLE_TRIP_CAPABILITIES,
} from './features/trip-data/tripCapabilities.js';

const { expenseSectionSpy, mapsState } = vi.hoisted(() => ({
  expenseSectionSpy: vi.fn(),
  mapsState: {
    placesLibrary: null,
    map: null,
  },
}));

vi.mock('./firebase.js', () => ({ db: null, storage: null }));
vi.mock('@vis.gl/react-google-maps', () => ({
  useMapsLibrary: (name) => name === 'places' ? mapsState.placesLibrary : null,
  useMap: () => mapsState.map,
  AdvancedMarker: ({ children }) => <div>{children}</div>,
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
            scope: 'intrip',
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
        lat: 26.6943,
        lng: 127.8779,
      },
      {
        id: 'place-2',
        name: 'OkinawaChuraumiAquariumOceanExpoParkSouvenirShop',
        time: '11:00',
        lat: 26.6938,
        lng: 127.8781,
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
    mapsState.placesLibrary = null;
    mapsState.map = null;
    Reflect.deleteProperty(window, 'google');
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
        scope: 'intrip',
        status: 'paid',
      }),
    ]);
  });

  it.each([0, 10_000])('does not let a listener callback after %i ms overwrite a confirmed sync error', async (elapsed) => {
    let emitSnapshot;
    const repository = createRepository(FIREBASE_TRIP_CAPABILITIES);
    repository.subscribeTrip = vi.fn((listener) => {
      emitSnapshot = listener;
      queueMicrotask(() => listener(snapshot));
      return vi.fn();
    });
    repository.updateSettlements.mockRejectedValueOnce(new Error('write failed'));
    await renderWithRepository(repository, 'firebase-trip');

    fireEvent.click(screen.getByTestId('test-mark-settlement-paid'));
    await waitFor(() => expect(screen.getByTestId('sync-status')).toHaveTextContent('error'));

    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + elapsed);
    act(() => emitSnapshot(snapshot));
    expect(screen.getByTestId('sync-status')).toHaveTextContent('error');
  });

  it('uses only the injected local repository for example settlement writes', async () => {
    const localRepository = createRepository(LOCAL_EXAMPLE_TRIP_CAPABILITIES);
    await renderWithRepository(localRepository, 'local-example-trip');

    fireEvent.click(screen.getByTestId('test-mark-settlement-paid'));
    await waitFor(() => expect(localRepository.updateSettlements).toHaveBeenCalledTimes(1));
    expect(localRepository.updateSettlements).toHaveBeenCalledWith([
      expect.objectContaining({ status: 'paid', currency: 'TWD', scope: 'intrip' }),
    ]);
  });

  it('uses the compact mobile layout, keeps desktop cards to 景點資訊 only, and isolates menu clicks', async () => {
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
    expect(firstCard).toHaveClass('p-2.5', 'md:p-3');
    const mobileActions = firstCard.querySelector('[data-testid="place-card-actions"]');
    expect(mobileActions).toHaveAttribute('data-layout', 'mobile-compact');
    expect(mobileActions).toHaveClass('md:hidden');
    expect(within(mobileActions).getByRole('button', { name: /導航到/ })).toBeInTheDocument();

    const menuTrigger = firstCard.querySelector('[data-testid="place-action-menu-trigger"]');
    expect(menuTrigger).toHaveClass('w-11', 'shrink-0');
    expect(menuTrigger).not.toHaveAttribute('data-rfd-drag-handle-draggable-id');
    // 景點資訊 is now always present as a compact CTA regardless of whether
    // this place has resources/memo/photo - it no longer renders a large
    // inline summary, so there is no empty-placeholder concern.
    expect(firstCard.querySelector('[data-testid="place-info-trigger"]')).toBeInTheDocument();
    // Desktop cards no longer carry a direct navigation button or a hover
    // action row - navigate/edit/nearby/copy/delete all live in Place Details.
    // (The mobile-compact row above still renders its own nav button; jsdom
    // doesn't apply the `md:hidden` that keeps it off-screen at desktop width.)
    expect(firstCard.querySelector('[data-testid="desktop-place-actions"]')).not.toBeInTheDocument();

    fireEvent.click(menuTrigger);
    expect(screen.getByTestId('place-action-menu')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-edit')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-nearby')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-nearby')).toHaveTextContent('找這站附近');
    expect(screen.getByTestId('place-action-copy')).toBeInTheDocument();
    expect(screen.getByTestId('place-action-delete')).toBeInTheDocument();
    expect(screen.queryByTestId('place-detail-sheet')).not.toBeInTheDocument();
    expect(repository.updateItinerary).not.toHaveBeenCalled();
  });

  it('opens the unified nearby surface from a place and keeps parking explicitly anchored', async () => {
    const repository = createRepository(FIREBASE_TRIP_CAPABILITIES);
    await renderWithRepository(repository, 'firebase-trip');

    const firstCard = screen.getAllByTestId('place-card')[0];
    fireEvent.click(within(firstCard).getByTestId('place-action-menu-trigger'));
    fireEvent.click(screen.getByTestId('place-action-nearby'));

    const controls = await screen.findByTestId('map-explore-controls');
    expect(within(controls).getByRole('button', { name: '這站附近' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(controls).getByTestId('parking-layer-trigger')).toBeEnabled();
    expect(within(controls).getByText('沖繩美麗海水族館 海洋博公園 熱帶夢幻中心紀念品商店')).toBeInTheDocument();
    expect(screen.getByTestId('map-panel')).toHaveClass('flex');
  });

  it('keeps the latest Explore response selected and focuses the same place on the map', async () => {
    const pendingSearches = [];
    const map = {
      getBounds: vi.fn(() => null),
      getCenter: vi.fn(() => ({ lat: () => 25.03, lng: () => 121.56 })),
      getZoom: vi.fn(() => 13),
      panTo: vi.fn(),
      setZoom: vi.fn(),
    };
    mapsState.map = map;
    mapsState.placesLibrary = {
      PlacesService: class PlacesServiceMock {
        textSearch(request, callback) {
          pendingSearches.push({ request, callback });
        }
      },
    };
    window.google = {
      maps: {
        places: {
          PlacesServiceStatus: {
            OK: 'OK',
            ZERO_RESULTS: 'ZERO_RESULTS',
          },
        },
      },
    };

    await renderWithRepository(
      createRepository(FIREBASE_TRIP_CAPABILITIES),
      'firebase-trip',
    );
    fireEvent.click(screen.getByTestId('map-explore-trigger'));
    const search = screen.getByRole('searchbox', { name: '搜尋目前地圖區域' });

    fireEvent.change(search, { target: { value: '搜尋 A' } });
    fireEvent.submit(screen.getByRole('search'));
    fireEvent.change(search, { target: { value: '搜尋 B' } });
    fireEvent.submit(screen.getByRole('search'));

    expect(pendingSearches.map(({ request }) => request.query)).toEqual(['搜尋 A', '搜尋 B']);
    const resultA = {
      place_id: 'place-a',
      name: '結果 A',
      geometry: { location: { lat: () => 25.01, lng: () => 121.51 } },
    };
    const resultB = {
      place_id: 'place-b',
      name: '結果 B',
      geometry: { location: { lat: () => 25.02, lng: () => 121.52 } },
    };
    const resultWithoutLocation = {
      place_id: 'place-without-location',
      name: '無法定位的結果',
    };

    await act(async () => pendingSearches[1].callback([resultWithoutLocation, resultB], 'OK'));
    expect(await screen.findByRole('button', { name: '查看結果 B' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '查看無法定位的結果' })).not.toBeInTheDocument();
    await act(async () => pendingSearches[0].callback([resultA], 'OK'));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: '查看結果 A' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '查看結果 B' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '查看結果 B' }));
    const selection = screen.getByTestId('map-explore-selection-sheet');
    expect(selection).toHaveAttribute('data-place-id', 'place-b');
    expect(map.panTo).toHaveBeenLastCalledWith(resultB.geometry.location);
    expect(map.setZoom).toHaveBeenLastCalledWith(16);
    expect(selection).toHaveFocus();

    fireEvent.keyDown(selection, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '查看結果 B' })).toHaveFocus();
    });

    mapsState.placesLibrary.PlacesService = class FailingPlacesService {
      constructor() {
        throw new Error('places unavailable');
      }
    };
    fireEvent.change(search, { target: { value: '重試搜尋' } });
    fireEvent.submit(screen.getByRole('search'));
    expect(await screen.findByRole('alert')).toHaveTextContent('附近搜尋暫時失敗，請重試。');
    expect(screen.getByRole('button', { name: '重試' })).toBeInTheDocument();
  });

  it('opens Place Details from the desktop card and exposes navigate/nearby/copy/delete there', async () => {
    const repository = createRepository(FIREBASE_TRIP_CAPABILITIES);
    await renderWithRepository(repository, 'firebase-trip');

    const firstCard = screen.getAllByTestId('place-card')[0];
    fireEvent.click(firstCard);

    const sheet = await screen.findByTestId('place-detail-sheet');
    expect(within(sheet).getByTestId('place-detail-navigate-button')).toBeInTheDocument();
    expect(within(sheet).getByTestId('place-detail-nearby-button')).toBeInTheDocument();
    expect(within(sheet).getByTestId('place-detail-copy-button')).toBeInTheDocument();
    expect(within(sheet).getByTestId('place-detail-delete-button')).toBeInTheDocument();
    expect(within(sheet).getByTestId('place-detail-edit-button')).toBeInTheDocument();
  });

  it('opens nearby search on the detail target day even after the visible day changes', async () => {
    const repository = createRepository(FIREBASE_TRIP_CAPABILITIES);
    await renderWithRepository(repository, 'firebase-trip');

    fireEvent.click(screen.getAllByTestId('place-card')[0]);
    const sheet = await screen.findByTestId('place-detail-sheet');

    const getDayButton = (dayId) => screen
      .getAllByTestId('desktop-day-button')
      .find((button) => button.dataset.dayId === dayId);

    fireEvent.click(getDayButton('Day 2'));
    await waitFor(() => expect(getDayButton('Day 2')).toHaveAttribute('aria-current', 'date'));

    fireEvent.click(within(sheet).getByTestId('place-detail-nearby-button'));

    const controls = await screen.findByTestId('map-explore-controls');
    expect(within(controls).getByRole('button', { name: '這站附近' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(controls).getByText('沖繩美麗海水族館 海洋博公園 熱帶夢幻中心紀念品商店')).toBeInTheDocument();
    await waitFor(() => expect(getDayButton('Day 1')).toHaveAttribute('aria-current', 'date'));
  });
});
