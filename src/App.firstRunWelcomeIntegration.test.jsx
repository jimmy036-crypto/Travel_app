import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { FIRST_RUN_ONBOARDING_SEEN_KEY } from './features/onboarding/onboardingState.js';

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
  hasSeen: vi.fn(() => false),
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
  default: ({ onBack }) => (
    <div data-testid="mock-trip-detail">
      <button type="button" data-testid="mock-trip-back" onClick={onBack}>Back</button>
    </div>
  ),
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

vi.mock('./components/WhatsNewDialog.jsx', () => ({
  WhatsNewDialog: () => <div data-testid="mock-whats-new" role="dialog">What&apos;s New</div>,
}));

vi.mock('./config/releaseNotes.js', () => ({
  CURRENT_RELEASE_NOTES: { version: 'first-run-test', title: 'Test', items: [] },
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
  title: 'Existing trip',
  destination: 'Taipei',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  members: ['Me'],
  themeColor: '#3b82f6',
};

const advanceToFinalStep = async (user) => {
  await user.click(screen.getByTestId('first-run-next'));
  await user.click(screen.getByTestId('first-run-next'));
  await user.click(screen.getByTestId('first-run-next'));
};

const renderFreshApp = async () => {
  const user = userEvent.setup();
  const view = render(<App />);
  await waitFor(() => expect(screen.getByTestId('first-run-welcome-dialog')).toBeInTheDocument());
  return { user, ...view };
};

describe('App first-run welcome integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
    releaseMocks.hasSeen.mockReturnValue(false);
    releaseMocks.hasPending.mockReturnValue(false);
    offlineMocks.list.mockReturnValue([]);
  });

  it('shows Welcome for fresh storage before What’s New or FeatureTour', async () => {
    await renderFreshApp();
    expect(screen.getByTestId('travel-lobby')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-welcome-dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.queryByTestId('mock-whats-new')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-feature-tour')).not.toBeInTheDocument();
  });

  it('captures eligibility before App writes the empty trips default', async () => {
    await renderFreshApp();
    await waitFor(() => expect(localStorage.getItem('google-travel-my-trips')).toBe('[]'));
    expect(screen.getByTestId('first-run-welcome-dialog')).toBeInTheDocument();
  });

  it('does not mark completion while navigating steps', async () => {
    const { user } = await renderFreshApp();
    await user.click(screen.getByTestId('first-run-next'));
    await user.click(screen.getByTestId('first-run-back'));
    expect(localStorage.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY)).toBeNull();
  });

  it('marks onboarding before opening the exclusive local demo without Firebase or cache writes', async () => {
    const { user } = await renderFreshApp();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    firebaseMocks.get.mockClear();
    firebaseMocks.set.mockClear();
    firebaseMocks.update.mockClear();
    await advanceToFinalStep(user);
    await user.click(screen.getByTestId('first-run-open-demo'));
    await waitFor(() => expect(screen.getByTestId('demo-trip-preview')).toBeInTheDocument());
    expect(localStorage.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY)).toBe('true');
    expect(screen.getByTestId('demo-trip-title')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('travel-lobby')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-offline-trip-preview')).not.toBeInTheDocument();
    expect(firebaseMocks.get).not.toHaveBeenCalled();
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalledWith('google-travel-offline-trip-cache-v1', expect.anything());
    expect(releaseMocks.markSeen).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('opens only the existing blank create Modal after completing onboarding', async () => {
    const { user } = await renderFreshApp();
    await advanceToFinalStep(user);
    firebaseMocks.set.mockClear();
    firebaseMocks.update.mockClear();
    await user.click(screen.getByTestId('first-run-create-trip'));
    expect(localStorage.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY)).toBe('true');
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('trip-modal')).toBeInTheDocument();
    expect(screen.getByTestId('trip-name-input')).toHaveValue('');
    expect(screen.getByTestId('mock-destination-input')).toHaveValue('');
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('skips to Lobby, writes only onboarding, and suppresses What’s New for this session', async () => {
    const { user } = await renderFreshApp();
    await user.click(screen.getByTestId('first-run-skip'));
    expect(localStorage.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY)).toBe('true');
    expect(screen.getByTestId('travel-lobby')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-whats-new')).not.toBeInTheDocument();
    expect(releaseMocks.markSeen).not.toHaveBeenCalled();
  });

  it('does not show Welcome after reload and restores the unseen release flow', async () => {
    const { user, unmount } = await renderFreshApp();
    await user.click(screen.getByTestId('first-run-skip'));
    unmount();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('mock-whats-new')).toBeInTheDocument());
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    expect(releaseMocks.markSeen).not.toHaveBeenCalled();
  });

  it.each([
    ['non-empty trips', () => localStorage.setItem('google-travel-my-trips', JSON.stringify([REAL_TRIP]))],
    ['release history', () => localStorage.setItem('travel-app-seen-release-old', 'true')],
    ['custom appearance', () => localStorage.setItem('google-travel-custom-bg', '#123456')],
    ['offline cache', () => localStorage.setItem('google-travel-offline-trip-cache-v1', JSON.stringify({
      room1: {
        version: 1,
        roomId: 'room1',
        cachedAt: 1,
        meta: { title: 'Trip' },
        days: [],
        summary: {},
      },
    }))],
  ])('does not show Welcome for returning users with %s', async (_label, seed) => {
    seed();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
  });

  it('still shows Welcome when an empty trips key already exists', async () => {
    localStorage.setItem('google-travel-my-trips', '[]');
    await renderFreshApp();
    expect(screen.getByTestId('first-run-welcome-dialog')).toBeInTheDocument();
  });

  it('defers Welcome and What’s New for a room deep link until returning to Lobby', async () => {
    window.history.pushState({}, '', '/?room=shared-room');
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-whats-new')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('mock-trip-back'));
    await waitFor(() => expect(screen.getByTestId('first-run-welcome-dialog')).toBeInTheDocument());
    expect(localStorage.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY)).toBeNull();
  });

  it('resolves the session even when storage writes fail and does not reopen', async () => {
    const { user } = await renderFreshApp();
    const originalSetItem = Storage.prototype.setItem;
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function mockSet(key, value) {
      if (key === FIRST_RUN_ONBOARDING_SEEN_KEY) throw new Error('blocked');
      return originalSetItem.call(this, key, value);
    });
    await user.click(screen.getByTestId('first-run-skip'));
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('travel-lobby')).toBeInTheDocument();
    await user.click(screen.getByTestId('demo-trip-entry-open'));
    await user.click(screen.getByTestId('demo-back-button'));
    expect(screen.queryByTestId('first-run-welcome-dialog')).not.toBeInTheDocument();
    set.mockRestore();
  });

  it('guards completion against duplicate user events', async () => {
    const { user } = await renderFreshApp();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await user.dblClick(screen.getByTestId('first-run-skip'));
    const markerWrites = setItem.mock.calls.filter(([key]) => key === FIRST_RUN_ONBOARDING_SEEN_KEY);
    expect(markerWrites).toHaveLength(1);
    setItem.mockRestore();
  });
});
