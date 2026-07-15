import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useOnlineStatus } from './useOnlineStatus';

describe('useOnlineStatus', () => {
  let onLineSpy;

  beforeEach(() => {
    onLineSpy = vi.spyOn(navigator, 'onLine', 'get');
    onLineSpy.mockReturnValue(true);
    vi.spyOn(window, 'addEventListener');
    vi.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('UT-01: returns true initially when navigator.onLine is true', () => {
    onLineSpy.mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);
    expect(result.current.hasBeenOffline).toBe(false);
  });

  it('UT-02: returns false initially when navigator.onLine is false', () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);
    expect(result.current.hasBeenOffline).toBe(true);
  });

  it('UT-03: updates state to offline when receiving offline event', () => {
    onLineSpy.mockReturnValue(true);
    const { result } = renderHook(() => useOnlineStatus());
    
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    
    expect(result.current.isOnline).toBe(false);
    expect(result.current.hasBeenOffline).toBe(true);
  });

  it('UT-04: updates state to online when receiving online event and retains hasBeenOffline', () => {
    onLineSpy.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    
    expect(result.current.isOnline).toBe(true);
    expect(result.current.hasBeenOffline).toBe(true);
  });

  it('UT-05: removes event listeners on unmount', () => {
    const { unmount } = renderHook(() => useOnlineStatus());
    unmount();
    
    expect(window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
