import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';
import * as offlineCache from './features/offline/offlineTripCache.js';

vi.mock('./firebase.js', () => ({
  db: {}, storage: {}
}));
vi.mock('firebase/database', () => ({
  ref: vi.fn(), set: vi.fn(), update: vi.fn(), get: vi.fn(), onValue: vi.fn()
}));
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div>{children}</div>,
  useMapsLibrary: vi.fn(),
  useMap: vi.fn()
}));
vi.mock('./TripDetail.jsx', () => ({
  default: () => <div data-testid="mock-trip-detail" />
}));
vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: () => <input />,
  DateRangePickerModal: () => <div />
}));
vi.mock('./components/FeatureTour.jsx', () => ({
  FeatureTour: () => <div />
}));

import * as useOnlineStatusHook from './hooks/useOnlineStatus';

const renderApp = (online = true) => {
  vi.spyOn(useOnlineStatusHook, 'useOnlineStatus').mockReturnValue({ isOnline: online, hasBeenOffline: false });
  // Instead of ToastProvider, we just render App. If ToastProvider is needed:
  // App actually wraps everything in ToastContext internally or we need to wrap it.
  // Actually, App uses useToast inside TravelApp which is the default export.
  // Wait, TravelApp uses useToast. Let's mock useToast directly so we don't need a provider.
  return render(<App />);
};

vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() })
}));

vi.mock('./components/ui/useConfirm.js', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true)
}));

describe('App offline trip preview', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
    
    // Set up a mock trip in localStorage
    localStorage.setItem('google-travel-my-trips', JSON.stringify([{
      roomId: 'room1', title: 'Trip 1', destination: 'Tokyo'
    }]));
  });

  it('APP-01 在線點卡片仍開啟 TripDetail', async () => {
    renderApp(true);
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
  });

  it('APP-02 APP-03 APP-04 離線有快取時開啟 OfflineTripPreview', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue({
      roomId: 'room1',
      cachedAt: 123,
      meta: { title: 'Trip 1', members: [], startDate: '2023-01-01', endDate: '2023-01-02' },
      days: [],
      summary: {}
    });

    renderApp(false);
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    
    await waitFor(() => {
      expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    });
  });

  it('APP-05 APP-06 離線無快取時顯示 Toast，保持 Lobby', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([]);
    
    renderApp(false);
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    });
  });

  it('APP-07 快取 badge 顯示', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    renderApp(true);
    await waitFor(() => {
      expect(screen.getByTestId('offline-cache-status')).toBeInTheDocument();
    });
  });

  it('APP-08 返回後回到 Lobby', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue({
      roomId: 'room1', meta: { title: 'T', members: [] }, days: [], summary: {}
    });

    renderApp(false);
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-back'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
    });
  });
});
