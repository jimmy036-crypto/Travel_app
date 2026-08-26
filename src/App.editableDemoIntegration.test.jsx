import React, { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';
import { isEditableDemoCloneEnabled } from './features/onboarding/cloneDemoFeatureFlag.js';
import { EXAMPLE_TRIP_VISIBILITY_KEY } from './features/onboarding/exampleTripVisibility.js';

const firebaseMocks = vi.hoisted(() => ({
  ref: vi.fn((_db, path) => path),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
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
  default: function MockTripDetail({ tripId, repository, onBack }) {
    const [status, setStatus] = useState('');
    return (
      <div data-testid="shared-trip-detail" data-trip-id={tripId}>
        <button type="button" data-testid="trip-back" onClick={onBack}>Back</button>
        <button
          type="button"
          data-testid="local-expense-write"
          onClick={async () => {
            await repository.updateExpenses([{ id: 'expense-1', cost: 100 }]);
            setStatus('saved');
          }}
        >
          Save expense
        </button>
        <button
          type="button"
          data-testid="local-attachment-write"
          onClick={async () => {
            await repository.uploadAttachment({
              scope: 'ticket',
              ownerId: 'ticket-1',
              file: new File(['pdf'], 'ticket.pdf', { type: 'application/pdf' }),
            });
            setStatus('attached');
          }}
        >
          Save attachment
        </button>
        <output data-testid="local-write-status">{status}</output>
      </div>
    );
  },
}));
vi.mock('./features/offline/OfflineTripPreview.jsx', () => ({
  OfflineTripPreview: () => null,
}));
vi.mock('./features/offline/offlineTripCache.js', () => ({
  listOfflineTripSummaries: () => [],
  readOfflineTripSnapshot: vi.fn(),
  removeOfflineTripSnapshot: vi.fn(),
}));
vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: ({ value }) => <input value={value} readOnly />,
  DateRangePickerModal: () => null,
}));
vi.mock('./components/FeatureTour.jsx', () => ({ FeatureTour: () => null }));
vi.mock('./config/releaseNotes.js', () => ({
  CURRENT_RELEASE_NOTES: { version: 'editable-test', title: 'Test', items: [] },
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
  roomId: 'real-trip',
  title: '京都旅行',
  destination: '京都',
  transport: '電車',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  members: ['自己'],
};

const renderLobby = async (trips = []) => {
  localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
  localStorage.setItem('google-travel-my-trips', JSON.stringify(trips));
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
  return user;
};

const openExample = async (user) => {
  await user.click(
    within(screen.getByTestId('demo-trip-entry-card')).getByTestId('example-trip-card-title'),
  );
  await waitFor(() => expect(screen.getByTestId('shared-trip-detail')).toBeInTheDocument());
};

describe('editable local example App integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.clearAllMocks();
  });

  it('keeps the production Clone feature flag disabled by default', () => {
    expect(isEditableDemoCloneEnabled()).toBe(false);
  });

  it('does not render a Clone action', async () => {
    await renderLobby();
    expect(screen.queryByText(/Clone/i)).not.toBeInTheDocument();
  });

  it('opens the lobby appearance dialog and restores focus after Escape', async () => {
    const user = await renderLobby([REAL_TRIP]);
    const trigger = screen.getByTestId('app-settings-trigger');

    await user.click(trigger);
    await user.click(screen.getByTestId('app-settings-appearance'));
    expect(screen.getByRole('dialog', { name: '自訂外觀' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('appearance-color-input')).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '自訂外觀' })).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('saves structured edits without Firebase or myTrips writes', async () => {
    const user = await renderLobby([REAL_TRIP]);
    await openExample(user);
    await user.click(screen.getByTestId('local-expense-write'));
    await waitFor(() => expect(screen.getByTestId('local-write-status')).toHaveTextContent('saved'));
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([REAL_TRIP]);
  });

  it('stores a PDF attachment locally without Storage or Database calls', async () => {
    const user = await renderLobby();
    await openExample(user);
    await user.click(screen.getByTestId('local-attachment-write'));
    await waitFor(() => expect(screen.getByTestId('local-write-status')).toHaveTextContent('attached'));
    expect(firebaseMocks.set).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('reset remains isolated from regular trips', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = await renderLobby([REAL_TRIP]);
    await user.click(screen.getByRole('button', { name: '恢復原始內容' }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([REAL_TRIP]));
    expect(firebaseMocks.update).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('removes the example locally, survives reload, and restores it from Settings', async () => {
    const user = await renderLobby([REAL_TRIP]);

    await user.click(screen.getByRole('button', { name: '從大廳移除' }));
    await waitFor(() => expect(screen.queryByTestId('demo-trip-entry-card')).not.toBeInTheDocument());
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([REAL_TRIP]);
    expect(localStorage.getItem(EXAMPLE_TRIP_VISIBILITY_KEY)).toBe('hidden');
    expect(firebaseMocks.update).not.toHaveBeenCalled();

    await user.click(screen.getByTestId('app-settings-trigger'));
    const restore = screen.getByTestId('app-settings-demo-trip');
    expect(restore).toHaveTextContent('恢復示範旅程');
    await user.click(restore);

    await waitFor(() => expect(screen.getByTestId('demo-trip-entry-card')).toBeVisible());
    expect(localStorage.getItem(EXAMPLE_TRIP_VISIBILITY_KEY)).toBeNull();
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([REAL_TRIP]);
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('explicit feature-introduction open restores a hidden example before opening it', async () => {
    localStorage.setItem(EXAMPLE_TRIP_VISIBILITY_KEY, 'hidden');
    const user = await renderLobby([REAL_TRIP]);
    expect(screen.queryByTestId('demo-trip-entry-card')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('app-settings-trigger'));
    await user.click(screen.getByTestId('app-settings-feature-introduction'));
    for (let index = 1; index < 5; index += 1) {
      await user.click(screen.getByTestId('feature-introduction-next'));
    }
    await user.click(screen.getByTestId('feature-introduction-open-demo'));

    await waitFor(() => expect(screen.getByTestId('shared-trip-detail')).toBeInTheDocument());
    expect(localStorage.getItem(EXAMPLE_TRIP_VISIBILITY_KEY)).toBeNull();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([REAL_TRIP]);
  });
});
