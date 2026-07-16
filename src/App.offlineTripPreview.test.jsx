import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';
import * as offlineCache from './features/offline/offlineTripCache.js';
import { set, update, get, onValue } from 'firebase/database';

vi.mock('./firebase.js', () => ({
  db: {},
  storage: {},
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
  onValue: vi.fn(),
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div>{children}</div>,
  useMapsLibrary: vi.fn(),
  useMap: vi.fn(),
}));

vi.mock('./TripDetail.jsx', () => ({
  default: () => <div data-testid="mock-trip-detail" />,
}));

vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: () => <input />,
  DateRangePickerModal: () => <div />,
}));

vi.mock('./components/FeatureTour.jsx', () => ({
  FeatureTour: () => <div />,
}));

let mockIsOnline = true;
vi.mock('./hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: mockIsOnline, hasBeenOffline: !mockIsOnline }),
}));

const mockToast = {
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
};

vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => mockToast,
}));

let confirmMock;
vi.mock('./components/ui/useConfirm.js', () => ({
  useConfirm: () => confirmMock,
}));

const validSnapshot = {
  version: 1,
  roomId: 'room1',
  cachedAt: 1672531200000,
  meta: {
    title: 'Trip 1',
    destination: 'Tokyo',
    members: ['Ann'],
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    themeColor: '#123456',
  },
  days: [],
  summary: {},
};

function seedTrip() {
  localStorage.setItem('google-travel-my-trips', JSON.stringify([{
    roomId: 'room1',
    title: 'Trip 1',
    destination: 'Tokyo',
    transport: 'Train',
    startDate: '2026-01-01',
    endDate: '2026-01-02',
    members: ['Ann'],
    themeColor: '#123456',
  }]));
}

function mockValidOfflineCache() {
  vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
    { roomId: 'room1', cachedAt: 1672531200000, title: 'Trip 1', destination: 'Tokyo' },
  ]);
  vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue(validSnapshot);
}

function expectFirebaseNotCalled() {
  expect(set).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
  expect(get).not.toHaveBeenCalled();
  expect(onValue).not.toHaveBeenCalled();
}

describe('App offline trip preview', () => {
  beforeEach(() => {
    localStorage.clear();
    seedTrip();
    window.history.pushState({}, '', '/');
    mockIsOnline = true;
    confirmMock = vi.fn().mockResolvedValue(true);

    vi.restoreAllMocks();
    mockToast.info.mockReset();
    mockToast.error.mockReset();
    mockToast.success.mockReset();
    set.mockReset();
    update.mockReset();
    get.mockReset();
    onValue.mockReset();
  });

  it('APP-01 OPEN-01 opens a valid online room and mounts TripDetail', async () => {
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));

    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
    expect(screen.queryByTestId('travel-lobby')).not.toBeInTheDocument();
    expect(window.location.search).toContain('room=room1');
  });

  it('APP-02 VIEW-01 OPEN-02 opens valid offline cache as Preview', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));

    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    expect(screen.getByTestId('offline-preview-title')).toHaveTextContent('Trip 1');
  });

  it('APP-03 VIEW-02 VIEW-03 VIEW-04 unmounts Lobby and TripDetail while Preview is open', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));

    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    expect(screen.queryByTestId('travel-lobby')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trip-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
  });

  it('APP-04 verifies offline Preview opening does not call Firebase', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());

    expectFirebaseNotCalled();
  });

  it('APP-05 OPEN-03 OPEN-05 corrupted cache stays in Lobby and does not call Firebase', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 1672531200000 },
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue(null);
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));

    expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    expect(screen.getByTestId('travel-lobby')).toBeInTheDocument();
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({
      title: '尚無離線資料',
      description: expect.stringContaining('損壞'),
    }));
    expectFirebaseNotCalled();
  });

  it('APP-06 OPEN-04 refreshes stale offline badge after corrupted cache', async () => {
    let summaries = [{ roomId: 'room1', cachedAt: 1672531200000 }];
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockImplementation(() => summaries);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockImplementation(() => {
      summaries = [];
      return null;
    });
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('offline-cache-status')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));

    await waitFor(() => expect(screen.queryByTestId('offline-cache-status')).not.toBeInTheDocument());
    expect(screen.getByTestId('travel-lobby')).toBeInTheDocument();
  });

  it('APP-07 shows the offline cache badge in Lobby when a summary exists', async () => {
    mockValidOfflineCache();
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('offline-cache-status')).toBeInTheDocument());
  });

  it('APP-08 returns from Preview to Lobby without mounting TripDetail', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-back'));

    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
  });

  it('APP-09 CLEAR-01 CLEAR-04 CLEAR-05 CLEAR-06 CLEAR-07 CLEAR-08 clears only local cache and keeps myTrips', async () => {
    let summaries = [{ roomId: 'room1', cachedAt: 1672531200000 }];
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockImplementation(() => summaries);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue(validSnapshot);
    vi.spyOn(offlineCache, 'removeOfflineTripSnapshot').mockImplementation(() => {
      summaries = [];
      return { ok: true };
    });
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));

    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.queryByTestId('offline-cache-status')).not.toBeInTheDocument();
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({ title: '已清除離線資料' }));
    expect(localStorage.getItem('google-travel-my-trips')).toContain('room1');
    expectFirebaseNotCalled();
  });

  it('APP-10 CLEAR-02 keeps Preview and uses error toast when remove fails', async () => {
    mockValidOfflineCache();
    vi.spyOn(offlineCache, 'removeOfflineTripSnapshot').mockReturnValue({ ok: false, reason: 'storage-unavailable' });
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({
      title: '清除離線資料失敗',
    })));
    expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
    expectFirebaseNotCalled();
  });

  it('APP-11 CLEAR-03 confirm cancel keeps Preview and does not remove cache', async () => {
    mockValidOfflineCache();
    const removeSpy = vi.spyOn(offlineCache, 'removeOfflineTripSnapshot');
    confirmMock.mockResolvedValue(false);
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(removeSpy).not.toHaveBeenCalled();
    expect(mockToast.info).not.toHaveBeenCalledWith(expect.objectContaining({ title: '已清除離線資料' }));
    expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
  });

  it('APP-12 stays on Preview after online recovery, then opens latest trip with correct URL', async () => {
    mockValidOfflineCache();
    const removeSpy = vi.spyOn(offlineCache, 'removeOfflineTripSnapshot');
    mockIsOnline = false;
    const { rerender } = render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    const searchBeforeOnline = window.location.search;

    mockIsOnline = true;
    rerender(<App />);

    expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    expect(window.location.search).toBe(searchBeforeOnline);
    fireEvent.click(screen.getByTestId('offline-preview-open-online'));

    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
    expect(window.location.search).toContain('room=room1');
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('APP-13 keeps TripDetail mounted when an open online trip goes offline', async () => {
    const { rerender } = render(<App />);

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());

    mockIsOnline = false;
    rerender(<App />);

    expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
  });
});
