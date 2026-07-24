import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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
  list: vi.fn(() => []),
  read: vi.fn(),
  remove: vi.fn(),
}));

const releaseMocks = vi.hoisted(() => ({
  hasSeen: vi.fn(() => true),
  hasPending: vi.fn(() => false),
  markSeen: vi.fn(),
  markPending: vi.fn(),
  clearPending: vi.fn(),
}));

vi.mock('./firebase.js', () => ({ db: {}, storage: {} }));

vi.mock('firebase/database', () => ({
  ref: firebaseMocks.ref,
  get: firebaseMocks.get,
  set: firebaseMocks.set,
  update: firebaseMocks.update,
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div>{children}</div>,
  useMapsLibrary: vi.fn(),
  useMap: vi.fn(),
}));

vi.mock('./TripDetail.jsx', () => ({
  default: () => <div data-testid="mock-trip-detail" />,
}));

vi.mock('./features/offline/OfflineTripPreview.jsx', () => ({
  OfflineTripPreview: () => <div data-testid="mock-offline-trip-preview" />,
}));

vi.mock('./features/offline/offlineTripCache.js', () => ({
  listOfflineTripSummaries: offlineMocks.list,
  readOfflineTripSnapshot: offlineMocks.read,
  removeOfflineTripSnapshot: offlineMocks.remove,
}));

vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: ({ value }) => <input data-testid="mock-destination-input" value={value} readOnly />,
  DateRangePickerModal: () => <div data-testid="mock-date-picker" />,
}));

vi.mock('./components/FeatureTour.jsx', () => ({
  FeatureTour: () => <div data-testid="mock-feature-tour" />,
}));

vi.mock('./config/releaseNotes.js', () => ({
  CURRENT_RELEASE_NOTES: { version: 'guided-demo-test', title: 'Test', items: [] },
  clearCurrentReleaseTourPending: releaseMocks.clearPending,
  hasPendingCurrentReleaseTour: releaseMocks.hasPending,
  hasSeenCurrentRelease: releaseMocks.hasSeen,
  markCurrentReleaseTourPending: releaseMocks.markPending,
  markCurrentReleaseSeen: releaseMocks.markSeen,
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
  title: '真實旅程',
  destination: '大阪',
  transport: '電車',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  members: ['自己'],
  themeColor: '#3b82f6',
};

function seedTrips(trips) {
  localStorage.setItem('google-travel-my-trips', JSON.stringify(trips));
}

async function renderLobby(trips = []) {
  seedTrips(trips);
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
  return user;
}

async function openDemoFromEmptyLobby(user) {
  await user.click(screen.getByTestId('demo-trip-entry-open'));
  await waitFor(() => expect(screen.getByTestId('demo-trip-preview')).toBeInTheDocument());
}

async function openDemoFromSettings(user) {
  await user.click(screen.getByTestId('app-settings-trigger'));
  await user.click(screen.getByTestId('app-settings-demo-trip'));
  await waitFor(() => expect(screen.getByTestId('demo-trip-preview')).toBeInTheDocument());
}

describe('App guided demo integration', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
    offlineMocks.list.mockReturnValue([]);
    releaseMocks.hasSeen.mockReturnValue(true);
    releaseMocks.hasPending.mockReturnValue(false);
  });

  it('shows one local demo card in an empty Lobby and no duplicate settings entry', async () => {
    const user = await renderLobby([]);
    expect(screen.getByTestId('lobby-empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('demo-trip-entry-card')).toBeInTheDocument();
    await user.click(screen.getByTestId('app-settings-trigger'));
    expect(screen.queryByTestId('app-settings-demo-trip')).not.toBeInTheDocument();
  });

  it('moves the demo entry to Settings when real trips exist', async () => {
    const user = await renderLobby([REAL_TRIP]);
    expect(screen.getByTestId('trip-card')).toHaveAttribute('data-room-id', REAL_TRIP.roomId);
    expect(screen.queryByTestId('demo-trip-entry-card')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('app-settings-trigger'));
    expect(screen.getByTestId('app-settings-demo-trip')).toBeInTheDocument();
  });

  it('opens the Tokyo demo from the empty Lobby as an exclusive App view', async () => {
    const user = await renderLobby([]);
    await openDemoFromEmptyLobby(user);
    expect(screen.getByTestId('demo-trip-title')).toHaveTextContent('東京三日示範旅程');
    expect(screen.getByTestId('demo-overview')).toBeVisible();
    expect(screen.queryByTestId('travel-lobby')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-offline-trip-preview')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-feature-tour')).not.toBeInTheDocument();
  });

  it('opens the demo from Settings with the existing-trip create label', async () => {
    const user = await renderLobby([REAL_TRIP]);
    await openDemoFromSettings(user);
    expect(screen.getByTestId('demo-create-trip-button')).toHaveTextContent('建立另一個旅程');
    expect(screen.queryByTestId('demo-clone-trip-button')).not.toBeInTheDocument();
  });

  it('uses the first-trip create label and hides the unfinished clone action', async () => {
    const user = await renderLobby([]);
    await openDemoFromEmptyLobby(user);
    expect(screen.getByTestId('demo-create-trip-button')).toHaveTextContent('建立我的第一個旅程');
    expect(screen.queryByTestId('demo-clone-trip-button')).not.toBeInTheDocument();
  });

  it('returns to the unchanged Lobby without changing myTrips or URL', async () => {
    const user = await renderLobby([REAL_TRIP]);
    const tripsBefore = localStorage.getItem('google-travel-my-trips');
    const urlBefore = window.location.href;
    await openDemoFromSettings(user);
    await user.click(screen.getByTestId('demo-back-button'));
    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.getByTestId('trip-card-title')).toHaveTextContent('真實旅程');
    expect(localStorage.getItem('google-travel-my-trips')).toBe(tripsBefore);
    expect(window.location.href).toBe(urlBefore);
  });

  it('does not call Firebase, Offline Cache, or myTrips storage while opening the demo', async () => {
    const user = await renderLobby([]);
    firebaseMocks.get.mockClear();
    firebaseMocks.set.mockClear();
    firebaseMocks.update.mockClear();
    offlineMocks.list.mockClear();
    offlineMocks.read.mockClear();
    offlineMocks.remove.mockClear();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await openDemoFromEmptyLobby(user);
    expect(firebaseMocks.get).not.toHaveBeenCalled();
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
    expect(offlineMocks.list).not.toHaveBeenCalled();
    expect(offlineMocks.read).not.toHaveBeenCalled();
    expect(offlineMocks.remove).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalledWith('google-travel-my-trips', expect.anything());
    setItem.mockRestore();
  });

  it('opens only the existing blank create Modal from the demo CTA', async () => {
    const user = await renderLobby([]);
    await openDemoFromEmptyLobby(user);
    firebaseMocks.set.mockClear();
    firebaseMocks.update.mockClear();
    await user.click(screen.getByTestId('demo-create-trip-button'));
    expect(screen.queryByTestId('demo-trip-preview')).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-modal')).toBeInTheDocument();
    expect(screen.getByTestId('trip-modal-title')).toHaveTextContent('建立新旅程');
    expect(screen.getByTestId('trip-name-input')).toHaveValue('');
    expect(screen.getByTestId('mock-destination-input')).toHaveValue('');
    expect(screen.getByTestId('trip-date-range')).toHaveTextContent('點擊選擇出發與回程日期');
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('does not modify the URL when opening or closing the demo', async () => {
    const user = await renderLobby([]);
    const url = window.location.href;
    await openDemoFromEmptyLobby(user);
    expect(window.location.href).toBe(url);
    await user.click(screen.getByTestId('demo-back-button'));
    expect(window.location.href).toBe(url);
  });

  it('does not mark release notes seen or start FeatureTour', async () => {
    const user = await renderLobby([]);
    releaseMocks.markSeen.mockClear();
    releaseMocks.markPending.mockClear();
    await openDemoFromEmptyLobby(user);
    expect(releaseMocks.markSeen).not.toHaveBeenCalled();
    expect(releaseMocks.markPending).not.toHaveBeenCalled();
    expect(screen.queryByTestId('mock-feature-tour')).not.toBeInTheDocument();
  });

  it('can open and close repeatedly without accumulating duplicate previews', async () => {
    const user = await renderLobby([]);
    await openDemoFromEmptyLobby(user);
    expect(screen.getAllByTestId('demo-trip-preview')).toHaveLength(1);
    await user.click(screen.getByTestId('demo-back-button'));
    await waitFor(() => expect(screen.getByTestId('demo-trip-entry-open')).toBeInTheDocument());
    await openDemoFromEmptyLobby(user);
    expect(screen.getAllByTestId('demo-trip-preview')).toHaveLength(1);
  });

});
