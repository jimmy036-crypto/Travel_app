import React from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_RELEASE_SEEN_KEY } from './config/releaseNotes.js';
import { GlobalModalProvider } from './components/ui/GlobalModalProvider.jsx';
import { ToastProvider } from './components/ui/ToastProvider.jsx';

const firebaseMocks = vi.hoisted(() => ({
  latestValueCallback: null,
  latestErrorCallback: null,
  unsubscribe: vi.fn(),
  ref: vi.fn((_db, path) => ({ path })),
  get: vi.fn(async () => ({ val: () => null })),
  set: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
  onValue: vi.fn((_ref, valueCallback, errorCallback) => {
    firebaseMocks.latestValueCallback = valueCallback;
    firebaseMocks.latestErrorCallback = errorCallback;
    return firebaseMocks.unsubscribe;
  }),
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => children,
  useMapsLibrary: () => null,
  useMap: () => null,
  AdvancedMarker: ({ children }) => children,
  Pin: () => null,
  Map: ({ children }) => <div data-testid="mock-map">{children}</div>,
}));

vi.mock('@hello-pangea/dnd', () => ({
  DragDropContext: ({ children }) => children,
  Droppable: ({ children }) => children({
    droppableProps: {},
    innerRef: () => {},
    placeholder: null,
  }),
  Draggable: ({ children }) => children(
    {
      innerRef: () => {},
      draggableProps: {},
      dragHandleProps: {},
    },
    { isDragging: false },
  ),
}));

vi.mock('./firebase', () => ({
  db: { app: 'mock-db' },
  storage: null,
}));

vi.mock('firebase/database', () => ({
  ref: firebaseMocks.ref,
  get: firebaseMocks.get,
  set: firebaseMocks.set,
  update: firebaseMocks.update,
  onValue: firebaseMocks.onValue,
}));

const createRoomData = (itinerary = { 'Day 1': [] }) => ({
  meta: {
    title: 'E2E skeleton trip',
    destination: '台北',
    destLat: 25.033,
    destLng: 121.5654,
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    members: ['自己'],
    memberBudgets: { 自己: 10000 },
    transport: '汽車',
    themeColor: '#3b82f6',
    dayThemes: {},
  },
  itinerary,
  expenses: [],
  settlements: [],
  tickets: [],
  checklist: {},
});

const createPlace = (id, name) => ({
  id,
  name,
  place_id: `${id}-place-id`,
  customName: '',
  lat: 25.033,
  lng: 121.5654,
  address: `${name} address`,
  time: '09:00',
  stayTime: '60',
  memo: '',
  tags: [],
});

const renderWithProviders = (children) => render(
  <GlobalModalProvider>
    <ToastProvider>
      {children}
    </ToastProvider>
  </GlobalModalProvider>,
);

async function waitForRoomListener() {
  await waitFor(() => {
    expect(firebaseMocks.onValue).toHaveBeenCalled();
    expect(firebaseMocks.latestValueCallback).toBeTypeOf('function');
  });
  await act(async () => {});
}

describe('core skeleton loading states', () => {
  beforeEach(() => {
    firebaseMocks.latestValueCallback = null;
    firebaseMocks.latestErrorCallback = null;
    firebaseMocks.unsubscribe.mockClear();
    firebaseMocks.ref.mockClear();
    firebaseMocks.get.mockClear();
    firebaseMocks.set.mockClear();
    firebaseMocks.update.mockClear();
    firebaseMocks.onValue.mockClear();

    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(CURRENT_RELEASE_SEEN_KEY, 'true');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: [],
          temperature_2m_min: [],
          temperature_2m_max: [],
          precipitation_probability_max: [],
        },
      }),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('hydrates lobby trips synchronously without a skeleton flash', async () => {
    localStorage.setItem(
      'google-travel-my-trips',
      JSON.stringify([{
        roomId: 'skeleton-lobby-room',
        title: 'Lobby loaded trip',
        destination: '台北',
        startDate: '2026-09-20',
        endDate: '2026-09-21',
        members: ['自己'],
        transport: '汽車',
        themeColor: '#3b82f6',
      }]),
    );

    const { default: App } = await import('./App.jsx');
    const view = renderWithProviders(<App />);

    expect(view.queryByTestId('lobby-skeleton')).not.toBeInTheDocument();
    expect(view.queryByTestId('lobby-empty-state')).not.toBeInTheDocument();
    expect(view.getByTestId('trip-card-title')).toHaveTextContent('Lobby loaded trip');
  });

  it('renders lobby empty state synchronously when stored trips are empty', async () => {
    localStorage.setItem('google-travel-my-trips', '[]');

    const { default: App } = await import('./App.jsx');
    const view = renderWithProviders(<App />);

    expect(view.queryByTestId('lobby-skeleton')).not.toBeInTheDocument();
    expect(view.getByTestId('lobby-empty-state')).toBeInTheDocument();
  });

  it('renders trip detail skeleton until the first room snapshot resolves', async () => {
    const { default: TripDetail } = await import('./TripDetail.jsx');
    const view = renderWithProviders(
      <TripDetail roomId="skeleton-trip-room" onBack={() => {}} />,
    );

    expect(view.getByTestId('trip-detail-skeleton')).toBeInTheDocument();
    expect(view.queryByTestId('itinerary-empty-state')).not.toBeInTheDocument();

    await waitForRoomListener();
    await act(async () => {
      firebaseMocks.latestValueCallback({ val: () => createRoomData({ 'Day 1': [] }) });
    });

    await waitFor(() => {
      expect(view.getByTestId('active-trip-view')).toBeInTheDocument();
    });
    expect(view.queryByTestId('trip-detail-skeleton')).not.toBeInTheDocument();
    expect(view.getByTestId('itinerary-empty-state')).toBeInTheDocument();
  });

  it('does not restore the trip detail skeleton during later realtime updates', async () => {
    const { default: TripDetail } = await import('./TripDetail.jsx');
    const firstPlace = createPlace('first-place', 'Initial realtime place');
    const secondPlace = createPlace('second-place', 'Updated realtime place');
    const view = renderWithProviders(
      <TripDetail roomId="skeleton-realtime-room" onBack={() => {}} />,
    );

    await waitForRoomListener();
    await act(async () => {
      firebaseMocks.latestValueCallback({
        val: () => createRoomData({ 'Day 1': [firstPlace] }),
      });
    });

    await waitFor(() => {
      expect(view.getByText('Initial realtime place')).toBeInTheDocument();
    });
    expect(view.queryByTestId('trip-detail-skeleton')).not.toBeInTheDocument();

    await act(async () => {
      firebaseMocks.latestValueCallback({
        val: () => createRoomData({ 'Day 1': [firstPlace, secondPlace] }),
      });
    });

    await waitFor(() => {
      expect(view.getByText('Updated realtime place')).toBeInTheDocument();
    });
    expect(view.queryByTestId('trip-detail-skeleton')).not.toBeInTheDocument();
  });

  it('replaces trip detail skeleton with an error state when the room listener fails', async () => {
    const { default: TripDetail } = await import('./TripDetail.jsx');
    const view = renderWithProviders(
      <TripDetail roomId="skeleton-error-room" onBack={() => {}} />,
    );

    expect(view.getByTestId('trip-detail-skeleton')).toBeInTheDocument();

    await waitForRoomListener();
    await act(async () => {
      firebaseMocks.latestErrorCallback(new Error('permission denied'));
    });

    await waitFor(() => {
      expect(view.getByText('無法載入旅程資料')).toBeInTheDocument();
    });
    expect(view.queryByTestId('trip-detail-skeleton')).not.toBeInTheDocument();
    expect(view.queryByTestId('itinerary-empty-state')).not.toBeInTheDocument();
  });

  it('shows the error state instead of skeleton when a room snapshot is missing', async () => {
    const { default: TripDetail } = await import('./TripDetail.jsx');
    const view = renderWithProviders(
      <TripDetail roomId="skeleton-missing-room" onBack={() => {}} />,
    );

    expect(view.getByTestId('trip-detail-skeleton')).toBeInTheDocument();

    await waitForRoomListener();
    await act(async () => {
      firebaseMocks.latestValueCallback({ val: () => null });
    });

    await waitFor(() => {
      expect(view.getByText('無法載入旅程資料')).toBeInTheDocument();
    });
    expect(view.queryByTestId('trip-detail-skeleton')).not.toBeInTheDocument();
    expect(view.queryByTestId('itinerary-empty-state')).not.toBeInTheDocument();
  });

  it('resets to skeleton when switching to another trip route', async () => {
    const { default: TripDetail } = await import('./TripDetail.jsx');
    const firstPlace = createPlace('first-route-place', 'First route place');
    const secondPlace = createPlace('second-route-place', 'Second route place');
    const renderTrip = (roomId) => (
      <GlobalModalProvider>
        <ToastProvider>
          <TripDetail roomId={roomId} onBack={() => {}} />
        </ToastProvider>
      </GlobalModalProvider>
    );
    const view = render(renderTrip('skeleton-route-room-a'));

    await waitForRoomListener();
    await act(async () => {
      firebaseMocks.latestValueCallback({
        val: () => createRoomData({ 'Day 1': [firstPlace] }),
      });
    });
    await waitFor(() => {
      expect(view.getByText('First route place')).toBeInTheDocument();
    });

    firebaseMocks.latestValueCallback = null;
    await act(async () => {
      view.rerender(renderTrip('skeleton-route-room-b'));
    });

    await waitFor(() => {
      expect(view.getByTestId('trip-detail-skeleton')).toBeInTheDocument();
    });
    await waitForRoomListener();
    await act(async () => {
      firebaseMocks.latestValueCallback({
        val: () => createRoomData({ 'Day 1': [secondPlace] }),
      });
    });

    await waitFor(() => {
      expect(view.getByText('Second route place')).toBeInTheDocument();
    });
    expect(view.queryByTestId('trip-detail-skeleton')).not.toBeInTheDocument();
  });
});
