import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJournalDraft } from './useJournalDraft.js';
import { readJournalDraft, writeJournalDraft } from './journalDraftStore.js';

const identity = { uid: 'alice', kind: 'memory', recordId: 'trip-a' };
const initialValue = { note: 'old', visits: {} };
beforeEach(() => localStorage.clear());

describe('useJournalDraft', () => {
  it('protects close, keeps local changes across reopening, and clears only after successful save', () => {
    const onClose = vi.fn();
    const first = renderHook(() => useJournalDraft({ ...identity, initialValue, revision: 2, onClose }));
    act(() => first.result.current.setDraft((value) => ({ ...value, note: 'mine' })));
    act(() => first.result.current.requestClose());
    expect(onClose).not.toHaveBeenCalled();
    expect(first.result.current.closeConfirmation).toBe(true);
    act(() => first.result.current.confirmClose());
    expect(onClose).toHaveBeenCalledOnce();
    first.unmount();
    const reopened = renderHook(() => useJournalDraft({ ...identity, initialValue: { note: 'remote' }, revision: 3, onClose }));
    expect(reopened.result.current.draft.note).toBe('mine');
    expect(reopened.result.current.baseRevision).toBe(2);
    act(() => reopened.result.current.markSaved());
    expect(readJournalDraft(identity).draft).toBeNull();
    expect(reopened.result.current.dirty).toBe(false);
  });
  it('immediately switches visible drafts by account without copying the previous account', () => {
    const { result, rerender } = renderHook(({ uid }) => useJournalDraft({ ...identity, uid, initialValue, revision: 1 }), { initialProps: { uid: 'alice' } });
    act(() => result.current.setDraft({ note: 'Alice private', visits: {} }));
    rerender({ uid: 'bob' });
    expect(result.current.draft.note).toBe('old');
    expect(readJournalDraft({ ...identity, uid: 'bob' }).draft).toBeNull();
    rerender({ uid: 'alice' });
    expect(result.current.draft.note).toBe('Alice private');
  });
  it('does not let an old account save completion reset the new account draft', () => {
    const { result, rerender } = renderHook(({ uid }) => useJournalDraft({ ...identity, uid, initialValue, revision: 1 }), { initialProps: { uid: 'alice' } });
    act(() => result.current.setDraft({ note: 'Alice', visits: {} }));
    const finishAlice = result.current.markSaved;
    rerender({ uid: 'bob' });
    act(() => result.current.setDraft({ note: 'Bob', visits: {} }));
    act(() => finishAlice({ note: 'Alice saved', visits: {} }, 2));
    expect(result.current.draft.note).toBe('Bob');
    expect(result.current.dirty).toBe(true);
    expect(readJournalDraft({ ...identity, uid: 'bob' }).draft.value.note).toBe('Bob');
  });
  it('keeps input and refresh protection when browser storage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const { result } = renderHook(() => useJournalDraft({ ...identity, initialValue, revision: 1 }));
    act(() => result.current.setDraft({ note: 'still here', visits: {} }));
    expect(result.current.draft.note).toBe('still here');
    expect(result.current.persistenceError).toBeTruthy();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it('asks before closing on browser back while leaving the draft available', () => {
    const { result } = renderHook(() => useJournalDraft({ ...identity, initialValue, revision: 1 }));
    act(() => result.current.setDraft({ note: 'back draft', visits: {} }));
    act(() => window.dispatchEvent(new PopStateEvent('popstate')));
    expect(result.current.closeConfirmation).toBe(true);
    expect(result.current.draft.note).toBe('back draft');
  });
  it('preserves the original base through restore and resolves competing edits explicitly', () => {
    writeJournalDraft({ ...identity, baseRevision: 1, baseValue: initialValue, value: { note: 'mine', visits: {} } });
    const { result } = renderHook(() => useJournalDraft({ ...identity, initialValue: { note: 'theirs', visits: {} }, revision: 2 }));
    act(() => result.current.beginConflict({ value: { note: 'theirs', visits: { b: { note: 'new' } } }, revision: 2 }));
    expect(result.current.baseRevision).toBe(1);
    expect(result.current.draft.note).toBe('mine');
    act(() => result.current.resolveConflict({ '/note': 'local' }));
    expect(result.current.draft).toEqual({ note: 'mine', visits: { b: { note: 'new' } } });
    expect(result.current.baseRevision).toBe(2);
    expect(readJournalDraft(identity).draft.baseValue.note).toBe('theirs');
  });
});

it('blocks route listeners before browser back can unmount a dirty editor and resumes only after confirmation', () => {
  window.history.replaceState(null, '', '/?view=collections');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
  const routeListener = vi.fn();
  window.addEventListener('popstate', routeListener);
  const { result, unmount } = renderHook(() => useJournalDraft({ ...identity, initialValue, revision: 1, onClose: vi.fn() }));
  act(() => result.current.setDraft({ note: 'unbacked input', visits: {} }));
  act(() => { window.history.replaceState(null, '', '/?room=source'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(routeListener).not.toHaveBeenCalled();
  expect(window.location.search).toBe('?view=collections');
  expect(result.current.closeConfirmation).toBe(true);
  act(() => result.current.cancelClose());
  expect(result.current.draft.note).toBe('unbacked input');
  act(() => { window.history.replaceState(null, '', '/?room=source'); window.dispatchEvent(new PopStateEvent('popstate')); });
  act(() => result.current.confirmClose());
  expect(window.location.search).toBe('?room=source');
  expect(routeListener).toHaveBeenCalledOnce();
  unmount(); window.removeEventListener('popstate', routeListener);
});
