import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCompanionIdentity } from './useCompanionIdentity.js';
import { companionStorageKey, exactCompanionCandidate, readCompanionPreference, writeCompanionPreference } from './companionIdentity.js';

let sequence = 0;
const setup = (overrides = {}) => {
  const props = { source: 'firebase', uid: 'A', tripId: `hook-${++sequence}`, members: ['Ann', 'Bob'], ready: true, ...overrides };
  return { props, ...renderHook(p => useCompanionIdentity(p), { initialProps: props }) };
};
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe('single shared companion state', () => {
  it('never guesses the first, only, owner-like, or exact name candidate', () => {
    const { result } = setup({ members: ['Ann'], displayName: 'Ann' });
    expect(result.current.member).toBe('');
    expect(result.current.known).toBe(false);
    expect(result.current.candidate).toBe('Ann');
    expect(exactCompanionCandidate('ann', ['Ann'])).toBe('');
    expect(exactCompanionCandidate('Ann', ['Ann', 'Ann'])).toBe('');
    act(() => result.current.confirm('Ann'));
    expect(result.current.member).toBe('Ann');
    expect(result.current.known).toBe(true);
  });
  it('restores persisted records and isolates UID, trip, demo, and signed-out contexts', () => {
    const { result, props, rerender } = setup();
    act(() => result.current.confirm('Ann'));
    const originalKey = result.current.key;
    expect(readCompanionPreference(originalKey).member).toBe('Ann');
    for (const change of [{ uid: 'B' }, { tripId: 'another-trip' }, { source: 'example' }, { uid: '' }]) {
      rerender({ ...props, ...change });
      expect(result.current.member).toBe('');
    }
    rerender(props);
    expect(result.current.member).toBe('Ann');
    expect(companionStorageKey({ source: 'firebase', uid: 'a:b', tripId: 'c' }))
      .not.toBe(companionStorageKey({ source: 'firebase', uid: 'a', tripId: 'b:c' }));
  });
  it('loads a confirmed record created before mounting', () => {
    const props = { source: 'firebase', uid: 'restore', tripId: `hook-${++sequence}`, members: ['Ann'], ready: true };
    writeCompanionPreference(companionStorageKey(props), 'Ann', props.members);
    const { result } = renderHook(() => useCompanionIdentity(props));
    expect(result.current.member).toBe('Ann');
    expect(result.current.known).toBe(true);
  });
  it('keeps temporary unloaded members from invalidating a stored preference', () => {
    const { result, props, rerender } = setup();
    act(() => result.current.confirm('Ann'));
    rerender({ ...props, members: [], ready: false });
    expect(result.current.member).toBe('');
    expect(readCompanionPreference(result.current.key).member).toBe('Ann');
    rerender(props);
    expect(result.current.member).toBe('Ann');
    rerender({ ...props, members: ['Bob'] });
    expect(result.current.member).toBe('');
    expect(result.current.invalidated).toBe(true);
    rerender(props);
    expect(result.current.member).toBe('');
  });
  it('rejects callbacks from a previous context, even after switching back', () => {
    const { result, props, rerender, unmount } = setup();
    const oldConfirm = result.current.confirm;
    rerender({ ...props, uid: 'B' });
    act(() => expect(oldConfirm('Ann')).toBe(false));
    rerender(props);
    act(() => expect(oldConfirm('Ann')).toBe(false));
    const finalConfirm = result.current.confirm;
    unmount();
    expect(finalConfirm('Ann')).toBe(false);
  });
  it('reads legacy hints without mutation and never revives them after clearing', () => {
    const tripId = `legacy-${++sequence}`;
    localStorage.setItem(`travel-active-member-${tripId}`, 'Ann');
    localStorage.setItem(`travel-checklist-actor-${tripId}`, 'Ann');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    const { result, props, rerender } = setup({ tripId });
    expect(result.current.candidate).toBe('Ann');
    expect(result.current.member).toBe('');
    expect(write).not.toHaveBeenCalled();
    act(() => result.current.confirm('Ann'));
    act(() => result.current.confirm(''));
    rerender({ ...props, members: [...props.members] });
    expect(result.current.member).toBe('');
    expect(result.current.candidate).toBe('');
    expect(result.current.known).toBe(true);
    expect(localStorage.getItem(`travel-active-member-${tripId}`)).toBe('Ann');
  });
  it('shares session choices when get/set/remove fail, including reopening the trip', () => {
    for (const method of ['getItem', 'setItem', 'removeItem']) vi.spyOn(Storage.prototype, method).mockImplementation(() => { throw Error('blocked'); });
    const { result, props, rerender, unmount } = setup();
    act(() => result.current.confirm('Bob'));
    expect(result.current.member).toBe('Bob');
    expect(result.current.storageError).toBe(true);
    rerender({ ...props, members: [...props.members] });
    expect(result.current.member).toBe('Bob');
    unmount();
    const next = renderHook(() => useCompanionIdentity(props));
    expect(next.result.current.member).toBe('Bob');
    act(() => next.result.current.confirm(''));
    expect(next.result.current.storageError).toBe(true);
    expect(next.result.current.member).toBe('');
  });
  it.each(['invalid-json', '{"version":2,"confirmed":true,"member":"Ann"}', '{"version":1,"confirmed":false,"member":"Ann"}'])('rejects corrupt or unsupported records: %s', raw => {
    const props = { source: 'firebase', uid: 'A', tripId: `corrupt-${++sequence}`, members: ['Ann'], ready: true };
    localStorage.setItem(companionStorageKey(props), raw);
    const { result } = renderHook(() => useCompanionIdentity(props));
    expect(result.current.member).toBe('');
    expect(result.current.storageError).toBe(true);
    act(() => result.current.confirm('Ann'));
    expect(result.current.storageError).toBe(false);
  });
  it('skip only changes local session prompting, not confirmation or persisted records', () => {
    const { result } = setup();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    act(() => result.current.skip());
    expect(result.current.skipped).toBe(true);
    expect(result.current.member).toBe('');
    expect(result.current.known).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});
