import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from './App.jsx';

const firebaseMocks = vi.hoisted(() => ({
  ref: vi.fn((_database, path) => path),
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  runTransaction: vi.fn(),
  connectDatabaseEmulator: vi.fn(),
  rooms: new Map(),
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

const featureMocks = vi.hoisted(() => ({
  enabled: false,
  emulator: true,
}));

vi.mock('./firebase.js', () => ({
  db: { app: { options: { projectId: 'demo-travel-e2e' } } },
  storage: {},
}));

vi.mock('firebase/database', () => ({
  ref: firebaseMocks.ref,
  get: firebaseMocks.get,
  set: firebaseMocks.set,
  update: firebaseMocks.update,
  runTransaction: firebaseMocks.runTransaction,
  connectDatabaseEmulator: firebaseMocks.connectDatabaseEmulator,
}));

vi.mock('./features/onboarding/cloneDemoFeatureFlag.js', () => ({
  isEditableDemoCloneEnabled: () => featureMocks.enabled,
  isCloneDemoEmulatorRuntime: () => featureMocks.emulator,
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => <div>{children}</div>,
  useMapsLibrary: vi.fn(),
  useMap: vi.fn(),
}));

vi.mock('./TripDetail.jsx', () => ({
  default: ({ roomId }) => <div data-testid="mock-trip-detail">{roomId}</div>,
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
  CURRENT_RELEASE_NOTES: { version: 'editable-demo-test', title: 'Test', items: [] },
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

function seedLobby() {
  localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
  localStorage.setItem('google-travel-my-trips', '[]');
}

async function renderLobby() {
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
  return user;
}

async function openDemo(user) {
  await user.click(screen.getByTestId('demo-trip-entry-open'));
  await waitFor(() => expect(screen.getByTestId('demo-trip-preview')).toBeInTheDocument());
}

describe('editable Demo Sandbox App integration', () => {
  beforeEach(() => {
    delete globalThis.__TRAVEL_CLONE_DATABASE_EMULATOR_CONNECTED__;
    delete globalThis.__TRAVEL_FIREBASE_EMULATORS_CONNECTED__;
    localStorage.clear();
    window.history.pushState({}, '', '/');
    seedLobby();
    featureMocks.enabled = false;
    featureMocks.emulator = true;
    firebaseMocks.rooms.clear();
    firebaseMocks.get.mockImplementation(async (path) => ({
      val: () => firebaseMocks.rooms.get(path) ?? null,
    }));
    firebaseMocks.runTransaction.mockImplementation(async (path, updateValue) => {
      const current = firebaseMocks.rooms.get(path) ?? null;
      const next = updateValue(current);
      if (next !== undefined) firebaseMocks.rooms.set(path, next);
      return {
        committed: next !== undefined,
        snapshot: { val: () => firebaseMocks.rooms.get(path) ?? null },
      };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('keeps the Clone feature flag disabled by default', async () => {
    const user = await renderLobby();
    await openDemo(user);
    expect(screen.queryByTestId('demo-clone-trip-button')).not.toBeInTheDocument();
  });

  it('persists local Demo edits across reload and resets only the Sandbox', async () => {
    const user = await renderLobby();
    await openDemo(user);
    await user.click(screen.getByTestId('demo-tab-itinerary'));
    const originalCount = screen.getAllByTestId('demo-editable-place').length;
    await user.click(screen.getByTestId('demo-add-place'));
    expect(screen.getAllByTestId('demo-editable-place')).toHaveLength(originalCount + 1);
    expect(firebaseMocks.runTransaction).not.toHaveBeenCalled();
    expect(offlineMocks.read).not.toHaveBeenCalled();

    cleanup();
    const reloadUser = await renderLobby();
    await openDemo(reloadUser);
    await reloadUser.click(screen.getByTestId('demo-tab-itinerary'));
    expect(screen.getAllByTestId('demo-editable-place')).toHaveLength(originalCount + 1);

    await reloadUser.click(screen.getByTestId('demo-reset-button'));
    await reloadUser.click(screen.getByTestId('demo-reset-confirm'));
    expect(screen.getAllByTestId('demo-editable-place')).toHaveLength(originalCount);
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toEqual([]);
    expect(firebaseMocks.runTransaction).not.toHaveBeenCalled();
    expect(offlineMocks.read).not.toHaveBeenCalled();
  });

  it('keeps Feature Introduction replay separate from the trip Feature Tour', async () => {
    const onboardingBefore = localStorage.getItem('travel-app-seen-onboarding-v1');
    const user = await renderLobby();
    expect(screen.getByTestId('feature-introduction-button')).toHaveAccessibleName('開啟功能介紹');
    await user.click(screen.getByTestId('feature-introduction-button'));
    expect(screen.getByTestId('feature-introduction-dialog')).toHaveAttribute('data-mode', 'replay');
    await user.click(screen.getByTestId('feature-introduction-close'));
    expect(localStorage.getItem('travel-app-seen-onboarding-v1')).toBe(onboardingBefore);

    await user.click(screen.getByTestId('app-settings-trigger'));
    const menu = screen.getByTestId('app-settings-menu');
    expect(within(menu).getByTestId('app-settings-feature-introduction')).toHaveAccessibleName('重新開啟功能介紹');
    expect(within(menu).getByTestId('app-settings-feature-tour')).toHaveAccessibleName('開啟旅程功能導覽');
  });

  it('rejects Clone before any database write outside an Emulator runtime', async () => {
    featureMocks.enabled = true;
    featureMocks.emulator = false;
    const user = await renderLobby();
    await openDemo(user);
    await user.click(screen.getByTestId('demo-clone-trip-button'));
    await user.click(screen.getByTestId('clone-demo-confirm'));
    expect(await screen.findByText('Clone 僅能在本機 Firebase Emulator 環境執行。')).toBeInTheDocument();
    expect(firebaseMocks.runTransaction).not.toHaveBeenCalled();
  });

  it('clones the edited validated Sandbox, verifies myTrips, and then opens TripDetail', async () => {
    featureMocks.enabled = true;
    const user = await renderLobby();
    await openDemo(user);
    await user.click(screen.getByTestId('demo-tab-itinerary'));
    await user.click(screen.getByTestId('demo-add-place'));
    const places = screen.getAllByTestId('demo-editable-place');
    const added = places.at(-1);
    const nameInput = within(added).getByRole('textbox', { name: /新增景點.*名稱/ });
    await user.clear(nameInput);
    await user.type(nameInput, '已編輯 Sandbox 景點');

    await user.click(screen.getByTestId('demo-clone-trip-button'));
    await user.click(screen.getByTestId('clone-demo-confirm'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('myTrips'));
    expect(firebaseMocks.runTransaction).toHaveBeenCalledTimes(1);
    const roomPayload = [...firebaseMocks.rooms.values()][0];
    expect(Object.values(roomPayload.itinerary).flat().some((place) => place.name === '已編輯 Sandbox 景點')).toBe(true);
    expect(roomPayload.meta.members).toHaveLength(1);
    expect(roomPayload).not.toHaveProperty('expenses');
    expect(roomPayload).not.toHaveProperty('tickets');
    expect(roomPayload).not.toHaveProperty('attachments');
    expect(JSON.parse(localStorage.getItem('google-travel-my-trips'))).toHaveLength(1);

    await user.click(screen.getByTestId('clone-demo-open-trip'));
    expect(await screen.findByTestId('mock-trip-detail')).toHaveTextContent(roomPayload.roomId);
  });
});
