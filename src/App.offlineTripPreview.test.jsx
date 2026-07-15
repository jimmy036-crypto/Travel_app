import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';
import * as offlineCache from './features/offline/offlineTripCache.js';
import { set, update, get } from 'firebase/database';

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

let mockIsOnline = true;
vi.mock('./hooks/useOnlineStatus', () => ({
  useOnlineStatus: () => ({ isOnline: mockIsOnline, hasBeenOffline: !mockIsOnline })
}));

const mockToast = {
  info: vi.fn(),
  error: vi.fn(),
  success: vi.fn()
};
vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => mockToast
}));

vi.mock('./components/ui/useConfirm.js', () => ({
  useConfirm: () => vi.fn().mockResolvedValue(true)
}));

describe('App offline trip preview', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/');
    mockIsOnline = true;
    
    mockToast.info.mockReset();
    mockToast.error.mockReset();
    mockToast.success.mockReset();

    set.mockReset();
    update.mockReset();
    get.mockReset();

    // Set up a mock trip in localStorage
    localStorage.setItem('google-travel-my-trips', JSON.stringify([{
      roomId: 'room1', title: 'Trip 1', destination: 'Tokyo'
    }]));
  });

  const renderApp = () => {
    return render(<App />);
  };

  it('APP-01 在線點卡片仍開啟 TripDetail', async () => {
    mockIsOnline = true;
    renderApp();
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

    mockIsOnline = false;
    renderApp();
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    
    await waitFor(() => {
      expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
      expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    });
  });

  it('APP-05 APP-06 離線無快取時顯示 Toast，保持 Lobby', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([]);
    
    mockIsOnline = false;
    renderApp();
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    });
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({
      title: '尚無離線資料'
    }));
  });

  it('APP-07 快取 badge 顯示', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    mockIsOnline = true;
    renderApp();
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

    mockIsOnline = false;
    renderApp();
    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-back'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
    });
  });

  it('APP-09 APP-10 清除快取成功後 badge 消失，不呼叫 Firebase 且 myTrips 仍存在', async () => {
    let summaries = [{ roomId: 'room1', cachedAt: 123 }];
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockImplementation(() => summaries);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue({
      roomId: 'room1', meta: { title: 'Trip 1', members: [] }, days: [], summary: {}
    });
    vi.spyOn(offlineCache, 'removeOfflineTripSnapshot').mockImplementation(() => {
      summaries = [];
      return { ok: true };
    });

    mockIsOnline = false;
    renderApp();
    
    await waitFor(() => expect(screen.getByTestId('offline-cache-status')).toBeInTheDocument());
    
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));
    
    await waitFor(() => {
      expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
    });

    expect(screen.queryByTestId('offline-cache-status')).not.toBeInTheDocument();

    expect(set).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();

    const myTripsRaw = localStorage.getItem('google-travel-my-trips');
    expect(myTripsRaw).toContain('room1');
  });

  it('APP-11 預覽中 offline -> online, Preview 仍存在且不自動 mount TripDetail', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue({
      roomId: 'room1', meta: { title: 'Trip 1', members: [] }, days: [], summary: {}
    });

    mockIsOnline = false;
    const { rerender } = renderApp();

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());

    mockIsOnline = true;
    rerender(<App />);

    expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
  });

  it('APP-12 恢復 online 後點「開啟最新旅程」 Preview 關閉且 TripDetail mount 且 URL room query 正確', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue({
      roomId: 'room1', meta: { title: 'Trip 1', members: [] }, days: [], summary: {}
    });

    mockIsOnline = false;
    const { rerender } = renderApp();

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());

    mockIsOnline = true;
    rerender(<App />);

    const openOnlineBtn = screen.getByTestId('offline-preview-open-online');
    expect(openOnlineBtn).toBeInTheDocument();
    fireEvent.click(openOnlineBtn);

    await waitFor(() => expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument());
    expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument();
    expect(window.location.search).toContain('room=room1');
  });

  it('APP-13 正常 TripDetail 已 mount 後發生 offline, TripDetail 仍存在且不切換 OfflineTripPreview', async () => {
    mockIsOnline = true;
    const { rerender } = renderApp();

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());

    mockIsOnline = false;
    rerender(<App />);

    expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
  });

  it('留在 Lobby 且顯示「尚無離線資料」當快取損壞/不存在時', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue(null);

    mockIsOnline = false;
    renderApp();

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));

    expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({
      title: '尚無離線資料'
    }));
  });

  it('remove 失敗時 Preview 不關閉且顯示錯誤 Toast', async () => {
    vi.spyOn(offlineCache, 'listOfflineTripSummaries').mockReturnValue([
      { roomId: 'room1', cachedAt: 123 }
    ]);
    vi.spyOn(offlineCache, 'readOfflineTripSnapshot').mockReturnValue({
      roomId: 'room1', meta: { title: 'Trip 1', members: [] }, days: [], summary: {}
    });
    vi.spyOn(offlineCache, 'removeOfflineTripSnapshot').mockReturnValue({
      ok: false, reason: 'quota-error'
    });

    mockIsOnline = false;
    renderApp();

    await waitFor(() => expect(screen.getByTestId('trip-card')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('trip-card'));
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));

    expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({
        title: '清除離線快取失敗'
      }));
    });
  });
});
