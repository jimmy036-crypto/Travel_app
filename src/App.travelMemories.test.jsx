import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

const state = vi.hoisted(() => ({ uid: 'alice', journals: {}, journalDelay: false, callbacks: new Map(), save: vi.fn(), preserve: vi.fn() }));
const cloudCard = () => screen.queryAllByTestId('trip-card').find((card) => card.dataset.roomId === 'kyoto');
const trip = { title: '京都秋遊', destination: '京都', startDate: '2025-10-01', endDate: '2025-10-02', destLat: 35, destLng: 135, ownerUid: 'alice' };
vi.mock('./firebase.js', () => ({ auth: null, db: {}, functions: null, storage: {} }));
vi.mock('./features/auth/useAuthSession.js', () => ({ useAuthSession: () => ({ user: { uid: state.uid, displayName: state.uid }, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn(), clearError: vi.fn() }) }));
vi.mock('./features/memories/journalClient.js', () => ({ createJournalClient: () => ({ saveMemory: state.save, preserveMemory: state.preserve }) }));
vi.mock('firebase/database', () => ({
  ref: (_db, path) => path, update: vi.fn(),
  get: async (path) => ({ exists: () => true, val: () => path.endsWith('/meta') ? trip : {} }),
  onValue: (path, callback) => {
    state.callbacks.set(path, callback);
    if (path.startsWith('personalTravel/')) { if (!state.journalDelay) callback({ val: () => state.journals[path.split('/')[1]] || null }); }
    else if (path.startsWith('travelMemoryArchives/')) callback({ val: () => path.endsWith('/summary') ? { state: 'complete', operationId: 'op', saved: 0, total: 0 } : {} });
    else if (path.startsWith('userTrips/')) callback({ val: () => ({ kyoto: { role: 'editor', status: 'active', aclVersion: 1 } }) });
    return () => state.callbacks.delete(path);
  },
}));
vi.mock('@vis.gl/react-google-maps', () => ({ APIProvider: ({ children }) => children, useMapsLibrary: () => null }));
vi.mock('./features/lobby/LobbyNextTripSummary.jsx', () => ({ default: () => null }));
vi.mock('./components/UIComponents.jsx', () => ({ DestinationSearch: () => null, DateRangePickerModal: () => null }));
vi.mock('./config/releaseNotes.js', () => ({ CURRENT_RELEASE_NOTES: { version: 'test', items: [] }, clearCurrentReleaseTourPending: vi.fn(), hasPendingCurrentReleaseTour: () => false, hasSeenCurrentRelease: () => true, markCurrentReleaseTourPending: vi.fn(), markCurrentReleaseSeen: vi.fn() }));
vi.mock('./features/onboarding/onboardingState.js', () => ({ markFirstRunOnboardingSeen: vi.fn(), readFirstRunEligibilitySnapshot: () => ({}), shouldShowFirstRunOnboarding: () => false }));
vi.mock('./components/ui/useToast.js', () => ({ useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }) }));
vi.mock('./components/ui/useConfirm.js', () => ({ useConfirm: () => vi.fn() }));

beforeEach(() => {
  localStorage.clear(); window.history.replaceState({}, '', '/');
  state.uid = 'alice'; state.journals = {}; state.journalDelay = false; state.callbacks.clear(); state.save.mockReset(); state.preserve.mockResolvedValue({});
  state.save.mockImplementation(async (payload) => {
    // Match RTDB behavior: empty maps disappear in the delivered snapshot.
    const memory = { ...trip, ...payload, roomId: 'kyoto', revision: payload.revision + 1 };
    if (!Object.keys(memory.visits).length) delete memory.visits;
    if (!Object.keys(memory.firsts).length) delete memory.firsts;
    state.journals[state.uid] = { memories: { kyoto: memory } };
    state.callbacks.get(`personalTravel/${state.uid}`)?.({ val: () => state.journals[state.uid] });
    return { memory };
  });
});

describe('home and private travel journal integration', () => {
  it('waits for private archive state before displaying hydrated trip cards', async () => {
    state.journalDelay = true;
    render(<App />);
    await act(async () => {});
    expect(screen.getByTestId('lobby-skeleton')).toBeInTheDocument();
    expect(cloudCard()).toBeUndefined();
    await act(async () => state.callbacks.get('personalTravel/alice')({ val: () => ({ memories: { kyoto: { ...trip, roomId: 'kyoto', archived: true } } }) }));
    await screen.findByText('下一趟旅行，從這裡開始');
    expect(cloudCard()).toBeUndefined();
  });
  it('archives only after confirmation, reloads into memories and restores an empty memory', async () => {
    const first = render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '完成並收進回憶' }));
    expect(cloudCard()).toBeInTheDocument();
    const dialog = await screen.findByTestId('archive-trip-dialog');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: '收好這趟旅行' }));
    await waitFor(() => expect(cloudCard()).toBeUndefined());
    expect(state.save).toHaveBeenCalledWith(expect.objectContaining({ visits: {}, archived: true }));
    first.unmount(); render(<App />);
    await screen.findByText('下一趟旅行，從這裡開始');
    fireEvent.click(screen.getByRole('button', { name: '旅行回憶', exact: true }));
    expect(await screen.findByTestId('memory-card')).toHaveTextContent('京都秋遊');
    fireEvent.click(screen.getByRole('button', { name: '重溫這趟旅行' }));
    fireEvent.click(screen.getByText('整理這份回憶', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: '還原到首頁' }));
    await waitFor(() => expect(state.save).toHaveBeenLastCalledWith(expect.objectContaining({ visits: {}, firsts: {}, archived: false, revision: 1 })));
    fireEvent.click(screen.getByRole('button', { name: '我的旅程', exact: true }));
    await waitFor(() => expect(cloudCard()).toHaveTextContent('京都秋遊'));
  });
  it('keeps the trip visible when quick archive persistence fails', async () => {
    state.save.mockRejectedValue(new Error('另一個畫面已更新'));
    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: '完成並收進回憶' }));
    const dialog = await screen.findByTestId('archive-trip-dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: '收好這趟旅行' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('另一個畫面已更新');
    expect(cloudCard()).toBeInTheDocument();
    expect(state.preserve).not.toHaveBeenCalled();
  });
  it('keeps the memory draft editable when personal editing persistence fails', async () => {
    state.journals.alice = { memories: { kyoto: { ...trip, roomId: 'kyoto', archived: true, revision: 1 } } };
    state.save.mockRejectedValue(new Error('另一個畫面已更新'));
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '旅行回憶', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: '重溫這趟旅行' }));
    fireEvent.click(screen.getByRole('button', { name: '補充回憶與到訪' }));
    const dialog = await screen.findByTestId('memory-editor');
    fireEvent.change(within(dialog).getByLabelText('這趟旅行的感想'), { target: { value: '保留這句話' } });
    fireEvent.click(within(dialog).getByRole('button', { name: '儲存回憶' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('另一個畫面已更新');
    expect(within(dialog).getByLabelText('這趟旅行的感想')).toHaveValue('保留這句話');
  });
  it('blocks back into an original trip until an unbacked collection draft is explicitly closed', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '我的收藏', exact: true }));
    fireEvent.click(await screen.findByRole('button', { name: '建立主題收藏' }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    fireEvent.change(screen.getByLabelText('收藏主題'), { target: { value: '尚未備份的清單' } });
    act(() => { window.history.replaceState(null, '', '/?room=kyoto'); window.dispatchEvent(new PopStateEvent('popstate')); });
    expect(screen.getByLabelText('收藏主題')).toHaveValue('尚未備份的清單');
    expect(window.location.search).toBe('?view=collections');
    fireEvent.click(screen.getByRole('button', { name: '繼續編輯' }));
    expect(screen.getByLabelText('收藏主題')).toHaveValue('尚未備份的清單');
  });
  it('clears account-specific memory UI when switching to a traveling companion', async () => {
    state.journals.alice = { memories: { kyoto: { ...trip, roomId: 'kyoto', archived: true, revision: 1, note: 'Alice 的私人回憶' } } };
    const { rerender } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '旅行回憶', exact: true }));
    expect(await screen.findByText('Alice 的私人回憶')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '重溫這趟旅行' }));
    fireEvent.click(screen.getByRole('button', { name: '補充回憶與到訪' }));
    await screen.findByTestId('memory-editor');
    await act(async () => { state.uid = 'bob'; rerender(<App />); });
    expect(screen.queryByTestId('memory-editor')).not.toBeInTheDocument();
    expect(screen.queryByText('Alice 的私人回憶')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '我的旅程', exact: true }));
    await waitFor(() => expect(cloudCard()).toHaveTextContent('京都秋遊'));
  });
  it('requires sign-in before opening a collection editor', async () => {
    state.uid = '';
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '我的收藏', exact: true }));
    expect(await screen.findByRole('button', { name: '登入並保存回憶' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '建立主題收藏' })).not.toBeInTheDocument();
  });
});
