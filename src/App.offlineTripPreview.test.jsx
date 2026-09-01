import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App.jsx';
import * as offlineCache from './features/offline/offlineTripCache.js';
import { set, update, get, onValue } from 'firebase/database';

const authState = vi.hoisted(() => ({
  user: { uid: 'test-user', displayName: '測試使用者', photoURL: '' },
}));
const tripDetailRenders = vi.hoisted(() => []);
const offlinePreviewRenders = vi.hoisted(() => []);
const deleteDialogRenders = vi.hoisted(() => []);
const tripModalRenders = vi.hoisted(() => []);
const tripAccessMock = vi.hoisted(() => ({
  createTrip: vi.fn(),
  redeemTripInvite: vi.fn(),
  deleteTrip: vi.fn(),
}));

vi.mock('./firebase.js', () => ({
  auth: null,
  db: {},
  functions: null,
  storage: {},
}));

vi.mock('./features/auth/useAuthSession.js', () => ({
  useAuthSession: () => ({
    user: authState.user,
    loading: false,
    busy: false,
    error: '',
    clearError: vi.fn(),
    signInWithGoogle: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('./features/trip-access/tripAccessClient.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    createTripAccessClient: () => tripAccessMock,
  };
});

vi.mock('./features/offline/OfflineTripPreview.jsx', async (importOriginal) => {
  const original = await importOriginal();
  const OriginalOfflineTripPreview = original.OfflineTripPreview;
  return {
    ...original,
    OfflineTripPreview: (props) => {
      offlinePreviewRenders.push({
        roomId: props.summary?.roomId || '',
        accountUid: authState.user?.uid || '',
      });
      return <OriginalOfflineTripPreview {...props} />;
    },
  };
});

vi.mock('./features/trip-access/DeleteTripDialog.jsx', async (importOriginal) => {
  const original = await importOriginal();
  const OriginalDeleteTripDialog = original.DeleteTripDialog;
  return {
    ...original,
    DeleteTripDialog: (props) => {
      if (props.open) {
        deleteDialogRenders.push({
          accountUid: authState.user?.uid || '',
          tripTitle: props.tripTitle || '',
        });
      }
      return <OriginalDeleteTripDialog {...props} />;
    },
  };
});

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => path),
  set: vi.fn(),
  update: vi.fn(),
  get: vi.fn(),
  onValue: vi.fn(),
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  APIProvider: ({ children }) => {
    const rendersTripModal = React.Children.toArray(children).some((child) => (
      React.isValidElement(child) && child.props['data-testid'] === 'trip-modal'
    ));
    if (rendersTripModal) {
      tripModalRenders.push({ accountUid: authState.user?.uid || '' });
    }
    return <div>{children}</div>;
  },
  useMapsLibrary: vi.fn(),
  useMap: vi.fn(),
}));

vi.mock('./TripDetail.jsx', () => ({
  default: ({ tripId, accountUser }) => {
    tripDetailRenders.push({ tripId, accountUid: accountUser?.uid || '' });
    return <div data-testid="mock-trip-detail" />;
  },
}));

vi.mock('./components/UIComponents.jsx', () => ({
  DestinationSearch: ({ onChange }) => (
    <button
      type="button"
      data-testid="mock-select-destination"
      onClick={() => onChange('台北市', { lat: 25.033, lng: 121.5654 })}
    >
      選擇測試地點
    </button>
  ),
  DateRangePickerModal: ({ onConfirm }) => (
    <button
      type="button"
      data-testid="mock-confirm-dates"
      onClick={() => onConfirm('2026-09-10', '2026-09-12')}
    >
      選擇測試日期
    </button>
  ),
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
  localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
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

function getTripCard(roomId) {
  return screen.getAllByTestId('trip-card').find(
    (card) => card.getAttribute('data-room-id') === roomId,
  );
}

function getRoomCard() {
  return getTripCard('room1');
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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
  expect(get).toHaveBeenCalledTimes(1);
  expect(onValue).toHaveBeenCalledTimes(1);
}

describe('App offline trip preview', () => {
  beforeEach(() => {
    localStorage.clear();
    seedTrip();
    window.history.pushState({}, '', '/');
    authState.user = { uid: 'test-user', displayName: '測試使用者', photoURL: '' };
    tripDetailRenders.length = 0;
    offlinePreviewRenders.length = 0;
    deleteDialogRenders.length = 0;
    tripModalRenders.length = 0;
    tripAccessMock.createTrip.mockReset();
    tripAccessMock.redeemTripInvite.mockReset();
    tripAccessMock.deleteTrip.mockReset();
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
    get.mockImplementation(async (path) => {
      const trip = JSON.parse(localStorage.getItem('google-travel-my-trips') || '[]')[0] || null;
      return {
        exists: () => String(path) === 'rooms/room1/meta' && Boolean(trip),
        val: () => (String(path) === 'rooms/room1/meta' ? trip : null),
      };
    });
    onValue.mockImplementation((path, callback) => {
      if (path === 'userTrips/test-user') {
        callback({ val: () => ({ room1: { role: 'owner', status: 'active', aclVersion: 1, updatedAt: 1 } }) });
      } else if (String(path).startsWith('roomAccess/')) {
        callback({ val: () => ({ role: 'owner', status: 'active' }) });
      }
      return vi.fn();
    });
  });

  it('APP-01 OPEN-01 opens a valid online room and mounts TripDetail', async () => {
    render(<App />);

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());

    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
    expect(screen.queryByTestId('travel-lobby')).not.toBeInTheDocument();
    expect(window.location.search).toContain('room=room1');
  });

  it('APP-02 VIEW-01 OPEN-02 opens valid offline cache as Preview', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());

    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    expect(screen.getByTestId('offline-preview-title')).toHaveTextContent('Trip 1');
  });

  it('APP-03 VIEW-02 VIEW-03 VIEW-04 unmounts Lobby and TripDetail while Preview is open', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());

    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    expect(screen.queryByTestId('travel-lobby')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trip-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
  });

  it('APP-04 verifies offline Preview opening does not call Firebase', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
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

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());

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
    fireEvent.click(getRoomCard());

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

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
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

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('offline-preview-clear-cache'));

    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.queryByTestId('offline-cache-status')).not.toBeInTheDocument();
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({ title: '已清除離線資料' }));
    expect(getRoomCard()).toBeInTheDocument();
    expectFirebaseNotCalled();
  });

  it('APP-10 CLEAR-02 keeps Preview and uses error toast when remove fails', async () => {
    mockValidOfflineCache();
    vi.spyOn(offlineCache, 'removeOfflineTripSnapshot').mockReturnValue({ ok: false, reason: 'storage-unavailable' });
    mockIsOnline = false;
    render(<App />);

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
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

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
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

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
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

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());

    mockIsOnline = false;
    rerender(<App />);

    expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument();
    expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
  });

  it('keeps readable trips when one room meta request is denied and marks only that card unavailable', async () => {
    const deniedRoomId = 'room-denied';
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    onValue.mockImplementation((path, callback) => {
      if (path === 'userTrips/test-user') {
        callback({
          val: () => ({
            room1: {
              role: 'owner',
              status: 'active',
              aclVersion: 1,
              titleSnapshot: 'Trip 1',
            },
            [deniedRoomId]: {
              role: 'editor',
              status: 'active',
              aclVersion: 2,
              titleSnapshot: '暫時無法讀取的旅程',
            },
          }),
        });
      }
      return vi.fn();
    });
    get.mockImplementation(async (path) => {
      if (String(path) === `rooms/${deniedRoomId}/meta`) {
        throw Object.assign(new Error('Permission denied'), {
          code: 'PERMISSION_DENIED',
        });
      }
      return {
        exists: () => String(path) === 'rooms/room1/meta',
        val: () => (String(path) === 'rooms/room1/meta' ? {
          roomId: 'room1',
          title: 'Trip 1',
          destination: 'Tokyo',
          startDate: '2026-01-01',
          endDate: '2026-01-02',
          members: ['Ann'],
        } : null),
      };
    });

    render(<App />);

    await waitFor(() => expect(getTripCard(deniedRoomId)).toBeInTheDocument());
    expect(getRoomCard()).toBeInTheDocument();
    expect(getRoomCard()).toHaveAttribute('data-access-status', 'ready');
    expect(getTripCard(deniedRoomId)).toHaveAttribute(
      'data-access-status',
      'unavailable',
    );
    expect(getTripCard(deniedRoomId)).toHaveTextContent('暫時無法讀取的旅程');
    expect(getTripCard(deniedRoomId)).toHaveTextContent(
      '旅程資料暫時無法載入，其他旅程仍可正常使用。',
    );
    expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({
      title: '部分旅程暫時無法載入',
    }));
    expect(consoleError).toHaveBeenCalledWith(
      'Load some account trips failed:',
      [deniedRoomId],
    );
  });

  it('hides the previous account trips immediately while a switched account hydrates', async () => {
    const accountListeners = new Map();
    onValue.mockImplementation((path, callback) => {
      accountListeners.set(String(path), callback);
      if (path === 'userTrips/test-user') {
        callback({
          val: () => ({
            room1: {
              role: 'owner',
              status: 'active',
              aclVersion: 1,
              titleSnapshot: 'Trip 1',
            },
          }),
        });
      }
      return vi.fn();
    });

    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    expect(screen.getAllByText('Trip 1').length).toBeGreaterThan(0);

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);

    await waitFor(() => expect(accountListeners.has('userTrips/second-user')).toBe(true));
    expect(screen.queryByText('Trip 1')).not.toBeInTheDocument();
    expect(screen.getByTestId('lobby-skeleton')).toBeInTheDocument();
  });

  it('never renders an open trip from the previous Google account after switching uid', async () => {
    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
    expect(tripDetailRenders).toContainEqual({ tripId: 'room1', accountUid: 'test-user' });

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);

    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    expect(tripDetailRenders).not.toContainEqual({ tripId: 'room1', accountUid: 'second-user' });
  });

  it('never renders an offline preview from the previous Google account after switching uid', async () => {
    mockValidOfflineCache();
    mockIsOnline = false;
    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
    await waitFor(() => expect(screen.getByTestId('offline-trip-preview')).toBeInTheDocument());
    expect(offlinePreviewRenders).toContainEqual({
      roomId: 'room1',
      accountUid: 'test-user',
    });
    offlinePreviewRenders.length = 0;

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);

    expect(offlinePreviewRenders).not.toContainEqual({
      roomId: 'room1',
      accountUid: 'second-user',
    });
    expect(screen.queryByTestId('offline-trip-preview')).not.toBeInTheDocument();
  });

  it('closes the previous account destructive dialog when switching uid', async () => {
    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '永久刪除旅程：Trip 1' }));
    expect(screen.getByTestId('delete-trip-dialog')).toBeInTheDocument();
    expect(deleteDialogRenders).toContainEqual({
      accountUid: 'test-user',
      tripTitle: 'Trip 1',
    });
    deleteDialogRenders.length = 0;

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);

    await waitFor(() => expect(screen.queryByTestId('delete-trip-dialog')).not.toBeInTheDocument());
    expect(deleteDialogRenders).not.toContainEqual({
      accountUid: 'second-user',
      tripTitle: 'Trip 1',
    });
  });

  it('never renders the previous account edit form after switching uid', async () => {
    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '編輯 Trip 1' }));
    expect(screen.getByTestId('trip-modal')).toBeInTheDocument();
    expect(tripModalRenders).toContainEqual({ accountUid: 'test-user' });
    tripModalRenders.length = 0;

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);

    expect(tripModalRenders).not.toContainEqual({ accountUid: 'second-user' });
    await waitFor(() => expect(screen.queryByTestId('trip-modal')).not.toBeInTheDocument());
  });

  it('ignores an old delete response after switching A to B and back to A', async () => {
    const deletion = createDeferred();
    tripAccessMock.deleteTrip.mockReturnValue(deletion.promise);
    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '永久刪除旅程：Trip 1' }));
    fireEvent.change(screen.getByTestId('delete-trip-confirmation'), {
      target: { value: 'Trip 1' },
    });
    fireEvent.click(screen.getByTestId('delete-trip-confirm'));
    await waitFor(() => expect(tripAccessMock.deleteTrip).toHaveBeenCalledWith('room1'));

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(screen.queryByTestId('delete-trip-dialog')).not.toBeInTheDocument());
    authState.user = { uid: 'test-user', displayName: '測試使用者', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    await act(async () => {
      deletion.resolve({
        accepted: true,
        roomId: 'room1',
        deletionId: 'stale-delete',
        state: 'requested',
      });
      await deletion.promise;
    });

    expect(getRoomCard()).toHaveAttribute('data-access-status', 'ready');
    expect(mockToast.info).not.toHaveBeenCalledWith(expect.objectContaining({
      title: '已送出永久刪除要求',
    }));
  });

  it('ignores an old create response after switching A to B and back to A', async () => {
    const creation = createDeferred();
    tripAccessMock.createTrip.mockReturnValue(creation.promise);
    const view = render(<App />);
    await waitFor(() => expect(screen.getByTestId('create-trip-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('create-trip-button'));
    fireEvent.change(screen.getByTestId('trip-name-input'), {
      target: { value: '不應開啟的舊建立結果' },
    });
    fireEvent.click(screen.getByTestId('mock-select-destination'));
    fireEvent.click(screen.getByTestId('trip-date-picker-button'));
    fireEvent.click(screen.getByTestId('mock-confirm-dates'));
    fireEvent.click(screen.getByTestId('create-trip-submit'));
    await waitFor(() => expect(tripAccessMock.createTrip).toHaveBeenCalledTimes(1));
    const staleRoomId = tripAccessMock.createTrip.mock.calls[0][0].roomId;

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(screen.queryByTestId('trip-modal')).not.toBeInTheDocument());
    authState.user = { uid: 'test-user', displayName: '測試使用者', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    await act(async () => {
      creation.resolve({ meta: { title: '不應開啟的舊建立結果' } });
      await creation.promise;
    });

    expect(window.location.search).not.toContain(encodeURIComponent(staleRoomId));
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    expect(getTripCard(staleRoomId)).toBeUndefined();
  });

  it('ignores an old invite response after switching A to B and back to A', async () => {
    const redemption = createDeferred();
    tripAccessMock.redeemTripInvite.mockReturnValue(redemption.promise);
    const view = render(<App />);
    await waitFor(() => expect(screen.getByTestId('import-trip-button')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('import-trip-button'));
    fireEvent.change(screen.getByLabelText('旅程邀請連結'), {
      target: { value: `https://example.test/#invite=${'a'.repeat(43)}` },
    });
    fireEvent.click(screen.getByRole('button', { name: '驗證並加入' }));
    await waitFor(() => expect(tripAccessMock.redeemTripInvite).toHaveBeenCalledTimes(1));

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(screen.queryByLabelText('旅程邀請連結')).not.toBeInTheDocument());
    authState.user = { uid: 'test-user', displayName: '測試使用者', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    await act(async () => {
      redemption.resolve({ roomId: 'stale-invite-room', joined: true });
      await redemption.promise;
    });

    expect(window.location.search).not.toContain('stale-invite-room');
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
  });

  it('redeems a new automatic invite after switching accounts without a pending invite', async () => {
    const token = 'b'.repeat(43);
    tripAccessMock.redeemTripInvite.mockResolvedValue({
      roomId: 'second-account-invite-room',
      joined: true,
    });
    const view = render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    authState.user = { uid: 'second-user', displayName: '第二個帳號', photoURL: '' };
    view.rerender(<App />);
    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());

    window.history.pushState({}, '', `/#invite=${token}`);
    window.dispatchEvent(new PopStateEvent('popstate'));

    await waitFor(() => expect(tripAccessMock.redeemTripInvite).toHaveBeenCalledWith(token));
    await waitFor(() => expect(window.location.search).toContain(
      'room=second-account-invite-room',
    ));
  });

  it('keeps the trip active when the deletion callable response is malformed', async () => {
    tripAccessMock.deleteTrip.mockResolvedValue({
      accepted: false,
      roomId: 'room1',
      deletionId: 'delete-1',
      state: 'requested',
    });
    const removeCache = vi.spyOn(offlineCache, 'removeOfflineTripSnapshot');
    render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '永久刪除旅程：Trip 1' }));
    fireEvent.change(screen.getByTestId('delete-trip-confirmation'), {
      target: { value: 'Trip 1' },
    });
    fireEvent.click(screen.getByTestId('delete-trip-confirm'));

    await waitFor(() => expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({
      title: '旅程刪除尚未完成',
    })));
    expect(getRoomCard()).toHaveAttribute('data-access-status', 'ready');
    expect(screen.getByTestId('delete-trip-dialog')).toBeInTheDocument();
    expect(removeCache).not.toHaveBeenCalled();
  });

  it('blocks reopening and warns when accepted cloud deletion cannot clear local cache', async () => {
    tripAccessMock.deleteTrip.mockResolvedValue({
      accepted: true,
      roomId: 'room1',
      deletionId: 'delete-1',
      state: 'requested',
    });
    vi.spyOn(offlineCache, 'removeOfflineTripSnapshot').mockReturnValue({
      ok: false,
      reason: 'storage-unavailable',
    });
    render(<App />);
    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '永久刪除旅程：Trip 1' }));
    fireEvent.change(screen.getByTestId('delete-trip-confirmation'), {
      target: { value: 'Trip 1' },
    });
    fireEvent.click(screen.getByTestId('delete-trip-confirm'));

    await waitFor(() => expect(getRoomCard()).toHaveAttribute('data-access-status', 'deleting'));
    expect(screen.queryByRole('button', { name: '開啟旅程：Trip 1' })).not.toBeInTheDocument();
    expect(mockToast.error).toHaveBeenCalledWith(expect.objectContaining({
      title: '雲端刪除已排入，但離線副本未清除',
    }));
  });

  it('exits an active TripDetail and clears only that account cache when access starts deleting', async () => {
    const listeners = new Map();
    const activeAccess = {
      role: 'owner',
      status: 'active',
      aclVersion: 1,
      titleSnapshot: 'Trip 1',
    };
    const deletingAccess = {
      ...activeAccess,
      status: 'deleting',
    };
    onValue.mockImplementation((path, callback) => {
      const listenerPath = String(path);
      listeners.set(listenerPath, callback);
      if (listenerPath === 'userTrips/test-user') {
        callback({ val: () => ({ room1: activeAccess }) });
      } else if (listenerPath === 'userTrips/test-user/room1') {
        callback({ val: () => activeAccess });
      }
      return vi.fn();
    });
    expect(offlineCache.writeOfflineTripSnapshot(validSnapshot, 'test-user')).toEqual({
      ok: true,
    });
    expect(offlineCache.writeOfflineTripSnapshot(validSnapshot, 'other-user')).toEqual({
      ok: true,
    });
    const removeCache = vi.spyOn(offlineCache, 'removeOfflineTripSnapshot');

    render(<App />);

    await waitFor(() => expect(getRoomCard()).toBeInTheDocument());
    fireEvent.click(getRoomCard());
    await waitFor(() => expect(screen.getByTestId('mock-trip-detail')).toBeInTheDocument());
    await waitFor(() => expect(
      listeners.has('userTrips/test-user/room1'),
    ).toBe(true));

    await act(async () => {
      await listeners.get('userTrips/test-user')({
        val: () => ({ room1: deletingAccess }),
      });
    });
    act(() => {
      listeners.get('userTrips/test-user/room1')({ val: () => deletingAccess });
    });

    await waitFor(() => expect(screen.getByTestId('travel-lobby')).toBeInTheDocument());
    expect(screen.queryByTestId('mock-trip-detail')).not.toBeInTheDocument();
    expect(getRoomCard()).toHaveAttribute('data-access-status', 'deleting');
    expect(removeCache).toHaveBeenCalledWith('room1', 'test-user');
    expect(offlineCache.readOfflineTripSnapshot('room1', 'test-user')).toBeNull();
    expect(offlineCache.readOfflineTripSnapshot('room1', 'other-user')).toEqual(
      expect.objectContaining({ roomId: 'room1' }),
    );
    expect(mockToast.info).toHaveBeenCalledWith(expect.objectContaining({
      title: '旅程正在永久刪除',
      description: expect.stringContaining('完成後會自動從清單移除'),
    }));
    expect(window.location.search).not.toContain('room=room1');
  });
});
