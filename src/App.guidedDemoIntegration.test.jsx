import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';

const firebaseMocks = vi.hoisted(() => ({
  ref: vi.fn((_db, path) => path),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
}));

const offlineMocks = vi.hoisted(() => ({
  build: vi.fn(),
  list: vi.fn(() => []),
  read: vi.fn(),
  remove: vi.fn(),
  write: vi.fn(),
}));

vi.mock('./firebase.js', () => ({ db: {}, storage: {} }));
vi.mock('firebase/database', () => ({
  ref: firebaseMocks.ref,
  get: firebaseMocks.get,
  set: firebaseMocks.set,
  update: firebaseMocks.update,
  onValue: vi.fn(),
}));
vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div>{children}</div>,
  useMapsLibrary: vi.fn(),
  useMap: vi.fn(),
}));
vi.mock('./TripDetail.jsx', () => ({
  default: ({
    tripId,
    repository,
    onBack,
    onUpdateTripMeta,
  }) => (
    <div
      data-testid="mock-trip-detail"
      data-trip-id={tripId}
      data-cloud-sync={String(repository?.getCapabilities?.().cloudSync)}
      data-local-attachments={String(repository?.getCapabilities?.().localAttachmentStorage)}
    >
      <button type="button" data-testid="mock-trip-back" onClick={onBack}>Back</button>
      <button
        type="button"
        data-testid="mock-trip-meta-update"
        onClick={() => onUpdateTripMeta?.(tripId, { title: 'Changed' })}
      >
        Update
      </button>
    </div>
  ),
}));
vi.mock('./features/offline/OfflineTripPreview.jsx', () => ({
  OfflineTripPreview: () => <div data-testid="mock-offline-trip-preview" />,
}));
vi.mock('./features/offline/offlineTripCache.js', () => ({
  buildOfflineTripSnapshot: offlineMocks.build,
  listOfflineTripSummaries: offlineMocks.list,
  readOfflineTripSnapshot: offlineMocks.read,
  removeOfflineTripSnapshot: offlineMocks.remove,
  writeOfflineTripSnapshot: offlineMocks.write,
}));
vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: ({ value }) => <input value={value} readOnly />,
  DateRangePickerModal: () => null,
}));
vi.mock('./components/FeatureTour.jsx', () => ({
  FeatureTour: () => <div data-testid="mock-feature-tour" />,
}));
vi.mock('./config/releaseNotes.js', () => ({
  CURRENT_RELEASE_NOTES: { version: 'unified-test', title: 'Test', items: [] },
  clearCurrentReleaseTourPending: vi.fn(),
  hasPendingCurrentReleaseTour: () => false,
  hasSeenCurrentRelease: () => true,
  markCurrentReleaseTourPending: vi.fn(),
  markCurrentReleaseSeen: vi.fn(),
}));
vi.mock('./hooks/useOnlineStatus.js', () => ({
  useOnlineStatus: () => ({ isOnline: true, hasBeenOffline: false }),
}));
vi.mock('./hooks/usePwaInstall.js', () => ({
  usePwaInstall: () => ({
    initialized: true,
    isInstalled: false,
    nativePromptAvailable: false,
    isPrompting: false,
    platform: 'desktop',
    browser: 'chromium',
    requestInstall: vi.fn(),
  }),
}));
vi.mock('./components/ui/useToast.js', () => ({
  useToast: () => ({ info: vi.fn(), error: vi.fn(), success: vi.fn() }),
}));
vi.mock('./components/ui/useConfirm.js', () => ({
  useConfirm: () => vi.fn(async () => true),
}));

const REAL_TRIP = {
  roomId: 'real-trip-1',
  title: '大阪三日行',
  destination: '大阪',
  transport: '電車',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  members: ['自己'],
  themeColor: '#3b82f6',
};

const NEXT_TRIP = {
  ...REAL_TRIP,
  roomId: 'next-real-trip',
  title: '北海道雪季旅行',
  destination: '日本北海道',
  startDate: '2099-10-01',
  endDate: '2099-10-06',
};

const seedTrips = (trips) => {
  localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
  localStorage.setItem('google-travel-my-trips', JSON.stringify(trips));
};

const renderLobby = async (trips = []) => {
  seedTrips(trips);
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
  return user;
};

const openExample = async (user) => {
  const entry = screen.getByTestId('demo-trip-entry-card');
  await user.click(within(entry).getByTestId('example-trip-card-title'));
  await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
};

describe('App unified example trip integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
    offlineMocks.list.mockReturnValue([]);
  });

  it('shows the example with the shared TripCard in an empty lobby', async () => {
    await renderLobby();
    expect(within(screen.getByTestId('demo-trip-entry-card')).getByTestId('trip-card')).toBeVisible();
    expect(await screen.findByTestId('lobby-next-trip-summary')).toHaveAttribute('data-state', 'empty');
    expect(screen.queryByRole('button', { name: /開啟下一趟旅程/ })).not.toBeInTheDocument();
  });

  it('keeps the example card beside regular trip cards', async () => {
    await renderLobby([REAL_TRIP]);
    expect(screen.getAllByTestId('trip-card')).toHaveLength(2);
    expect(screen.getByTestId('demo-trip-entry-card')).toBeInTheDocument();
  });

  it('opens the earliest real upcoming trip from the Lobby summary', async () => {
    const user = await renderLobby([
      { ...NEXT_TRIP, roomId: 'later-real-trip', startDate: '2099-11-01', endDate: '2099-11-03' },
      NEXT_TRIP,
    ]);
    const summary = await screen.findByRole('button', {
      name: '開啟下一趟旅程：北海道雪季旅行',
    });

    expect(summary).toHaveAttribute('data-room-id', 'next-real-trip');
    await user.click(summary);

    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toHaveAttribute(
      'data-trip-id',
      'next-real-trip',
    ));
    expect(window.location.search).toBe('?room=next-real-trip');
    expect(screen.queryByTestId('lobby-next-trip-summary')).not.toBeInTheDocument();
  });

  it('opens the example through the shared TripDetail route', async () => {
    const user = await renderLobby();
    await openExample(user);
    expect(screen.getByTestId('mock-trip-detail')).toHaveAttribute('data-trip-id', 'local-example-trip');
  });

  it('injects local capabilities without cloud sync', async () => {
    const user = await renderLobby();
    await openExample(user);
    expect(screen.getByTestId('mock-trip-detail')).toHaveAttribute('data-cloud-sync', 'false');
    expect(screen.getByTestId('mock-trip-detail')).toHaveAttribute('data-local-attachments', 'true');
  });

  it('uses the title suffix exactly once', async () => {
    await renderLobby();
    const title = within(screen.getByTestId('demo-trip-entry-card')).getByTestId('example-trip-card-title');
    expect(title).toHaveTextContent('東京三日自由行（範例）');
    expect(title.textContent.match(/（範例）/g)).toHaveLength(1);
  });

  it('does not put local-example-trip in myTrips after meta updates', async () => {
    const user = await renderLobby([REAL_TRIP]);
    await openExample(user);
    await user.click(screen.getByTestId('mock-trip-meta-update'));
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([REAL_TRIP]);
  });

  it('does not call Firebase or Offline Cache while opening the example', async () => {
    const user = await renderLobby();
    await openExample(user);
    expect(firebaseMocks.get).not.toHaveBeenCalled();
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
    expect(offlineMocks.read).not.toHaveBeenCalled();
  });

  it('does not add a room query parameter for the example', async () => {
    const user = await renderLobby();
    await openExample(user);
    expect(window.location.search).toBe('');
  });

  it('returns to the unchanged lobby', async () => {
    const user = await renderLobby([REAL_TRIP]);
    await openExample(user);
    await user.click(screen.getByTestId('mock-trip-back'));
    expect(screen.getAllByTestId('trip-card')).toHaveLength(2);
  });

  it('offers reset with the approved confirmation text', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = await renderLobby();
    await user.click(screen.getByRole('button', { name: '恢復原始內容' }));
    expect(confirm).toHaveBeenCalledWith('確定要清除目前修改，並恢復原始內容嗎？');
    confirm.mockRestore();
  });

  it('replays the five-step introduction from the lobby without changing onboarding state', async () => {
    const user = await renderLobby([REAL_TRIP]);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    await user.click(screen.getByTestId('app-settings-trigger'));
    await user.click(screen.getByTestId('app-settings-feature-introduction'));

    const dialog = await screen.findByTestId('feature-introduction-dialog');
    expect(dialog).toHaveAttribute('data-mode', 'replay');
    expect(screen.getByTestId('feature-introduction-progress')).toHaveTextContent('第 1 / 5 步');

    for (let index = 2; index <= 5; index += 1) {
      await user.click(screen.getByTestId('feature-introduction-next'));
      expect(screen.getByTestId('feature-introduction-progress'))
        .toHaveTextContent(`第 ${index} / 5 步`);
    }

    expect(screen.getByTestId('feature-introduction-open-demo')).toBeInTheDocument();
    expect(screen.getByTestId('feature-introduction-create-trip')).toBeInTheDocument();

    await user.click(screen.getByTestId('feature-introduction-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('feature-introduction-dialog')).not.toBeInTheDocument();
    });
    expect(setItem).not.toHaveBeenCalledWith('travel-app-seen-onboarding-v1', expect.anything());
    setItem.mockRestore();
  });

  it('does not render forbidden mode or preview labels', async () => {
    await renderLobby();
    expect(document.body).not.toHaveTextContent(/示範旅程|本機示範|僅供預覽|範例模式|示範資料|Demo Preview/);
  });
});
