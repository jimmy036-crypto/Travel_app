import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useLobbyTodayKey } from './useLobbyTodayKey.js';

const originalHiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden');

function setDocumentHidden(hidden) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    value: hidden,
  });
}

describe('useLobbyTodayKey', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 25, 23, 59, 59, 500));
    setDocumentHidden(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalHiddenDescriptor) {
      Object.defineProperty(document, 'hidden', originalHiddenDescriptor);
    } else {
      delete document.hidden;
    }
  });

  it('returns the current local calendar date', () => {
    const { result } = renderHook(() => useLobbyTodayKey());

    expect(result.current).toBe('2026-08-25');
  });

  it('refreshes once local midnight passes', () => {
    const { result } = renderHook(() => useLobbyTodayKey());

    act(() => vi.advanceTimersByTime(2_000));

    expect(result.current).toBe('2026-08-26');
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stops in the background and refreshes when the page returns', () => {
    const { result, unmount } = renderHook(() => useLobbyTodayKey());

    setDocumentHidden(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(vi.getTimerCount()).toBe(0);

    vi.setSystemTime(new Date(2026, 7, 26, 9));
    setDocumentHidden(false);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current).toBe('2026-08-26');
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not schedule Lobby work while the Lobby is inactive', () => {
    const { result } = renderHook(() => useLobbyTodayKey(false));

    expect(result.current).toBe('2026-08-25');
    expect(vi.getTimerCount()).toBe(0);
  });
});
