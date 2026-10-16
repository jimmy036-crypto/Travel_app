import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ listeners: [], onValue: vi.fn(), call: vi.fn() }));
vi.mock('../../firebase.js', () => ({ db: {}, functions: {} }));
vi.mock('firebase/database', () => ({ ref: (_, path) => path, onValue: mocks.onValue }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.call }));
import { useTravelJournal } from './useTravelJournal.js';

describe('account-scoped travel journal', () => {
  beforeEach(() => { mocks.listeners.length = 0; mocks.onValue.mockImplementation((path, success, error) => { const entry = { path, success, error, stop: vi.fn() }; mocks.listeners.push(entry); return entry.stop; }); });
  it('clears the previous account and ignores its late events', () => {
    const { result, rerender } = renderHook(({ uid }) => useTravelJournal(uid, true), { initialProps: { uid: 'alice' } });
    act(() => mocks.listeners[0].success({ val: () => ({ memories: { a: { title: 'Private' } } }) }));
    expect(result.current.memories.a.title).toBe('Private');
    rerender({ uid: 'bob' });
    expect(result.current.memories).toEqual({});
    expect(mocks.listeners[0].stop).toHaveBeenCalledOnce();
    act(() => mocks.listeners[0].success({ val: () => ({ memories: { leak: {} } }) }));
    expect(result.current.memories).toEqual({});
    act(() => mocks.listeners[1].success({ val: () => ({ memories: { b: { title: 'Bob' } } }) }));
    expect(result.current.memories.b.title).toBe('Bob');
  });
  it('rejects offline writes and exposes listener failure with retry', async () => {
    const { result } = renderHook(() => useTravelJournal('alice', false));
    await expect(result.current.saveMemory({ roomId: 'a' })).rejects.toThrow('連線');
    act(() => mocks.listeners[0].error(new Error('permission')));
    expect(result.current.error).toBeTruthy();
    act(() => result.current.retry());
    expect(mocks.listeners).toHaveLength(2);
  });
  it('does not complete a save into a different account', async () => {
    let resolve;
    mocks.call.mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result, rerender } = renderHook(({ uid }) => useTravelJournal(uid, true), { initialProps: { uid: 'alice' } });
    let pending;
    act(() => { pending = result.current.saveMemory({ roomId: 'a' }); });
    rerender({ uid: 'bob' });
    resolve({ data: { memory: { roomId: 'a' } } });
    await expect(pending).rejects.toThrow('帳號');
    expect(result.current.memories).toEqual({});
  });
});
