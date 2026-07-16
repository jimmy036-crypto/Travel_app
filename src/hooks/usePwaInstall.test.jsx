import React from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPwaInstallSnapshot,
  initializePwaInstallController,
  resetPwaInstallControllerForTest,
} from '../pwaInstallController.js';
import { usePwaInstall } from './usePwaInstall.js';

const DISPLAY_MODE_QUERY = '(display-mode: standalone)';

let originalMatchMedia;
let navigatorDescriptors;

function captureNavigatorDescriptors() {
  navigatorDescriptors = new Map();
  for (const key of ['userAgent', 'platform', 'maxTouchPoints', 'standalone']) {
    navigatorDescriptors.set(key, Object.getOwnPropertyDescriptor(window.navigator, key));
  }
}

function restoreNavigatorDescriptors() {
  for (const [key, descriptor] of navigatorDescriptors) {
    if (descriptor) {
      Object.defineProperty(window.navigator, key, descriptor);
    } else {
      delete window.navigator[key];
    }
  }
}

function installMatchMedia({ matches = false } = {}) {
  const changeListeners = new Set();
  const mql = {
    matches,
    media: DISPLAY_MODE_QUERY,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    addEventListener: vi.fn((type, listener) => {
      if (type === 'change') changeListeners.add(listener);
    }),
    removeEventListener: vi.fn((type, listener) => {
      if (type === 'change') changeListeners.delete(listener);
    }),
    setMatches(nextMatches) {
      this.matches = nextMatches;
      const event = { matches: nextMatches, media: this.media };
      for (const listener of [...changeListeners]) {
        listener.call(this, event);
      }
    },
  };

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query) => {
      mql.media = query;
      return mql;
    }),
  });

  return mql;
}

function dispatchBeforeInstallPrompt({
  prompt = vi.fn(async () => undefined),
  userChoice = Promise.resolve({ outcome: 'accepted' }),
} = {}) {
  const event = new Event('beforeinstallprompt');
  Object.defineProperty(event, 'preventDefault', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(event, 'prompt', {
    configurable: true,
    value: prompt,
  });
  Object.defineProperty(event, 'userChoice', {
    configurable: true,
    value: userChoice,
  });
  window.dispatchEvent(event);
  return { prompt };
}

describe('usePwaInstall', () => {
  beforeEach(() => {
    resetPwaInstallControllerForTest();
    originalMatchMedia = window.matchMedia;
    captureNavigatorDescriptors();
    installMatchMedia();
    initializePwaInstallController();
  });

  afterEach(() => {
    resetPwaInstallControllerForTest();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
    restoreNavigatorDescriptors();
    vi.restoreAllMocks();
  });

  it('HOOK-01 reads the initial controller snapshot', () => {
    const { result } = renderHook(() => usePwaInstall());

    expect(result.current).toMatchObject(getPwaInstallSnapshot());
    expect(typeof result.current.requestInstall).toBe('function');
  });

  it('HOOK-02 updates when beforeinstallprompt becomes available', () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      dispatchBeforeInstallPrompt();
    });

    expect(result.current.nativePromptAvailable).toBe(true);
  });

  it('HOOK-03 updates after appinstalled', () => {
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isStandalone).toBe(true);
  });

  it('HOOK-04 updates after display-mode changes', () => {
    resetPwaInstallControllerForTest();
    const mql = installMatchMedia({ matches: false });
    initializePwaInstallController();
    const { result } = renderHook(() => usePwaInstall());

    act(() => {
      mql.setMatches(true);
    });

    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isStandalone).toBe(true);
  });

  it('HOOK-05 does not update an unmounted consumer', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { unmount } = renderHook(() => usePwaInstall());

    unmount();

    act(() => {
      dispatchBeforeInstallPrompt();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('HOOK-06 requestInstall calls the controller request flow', async () => {
    const prompt = vi.fn(async () => undefined);
    act(() => {
      dispatchBeforeInstallPrompt({ prompt });
    });
    const { result } = renderHook(() => usePwaInstall());

    await act(async () => {
      await expect(result.current.requestInstall()).resolves.toEqual({ status: 'accepted' });
    });

    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('HOOK-07 rendering does not automatically call prompt', () => {
    const prompt = vi.fn(async () => undefined);
    act(() => {
      dispatchBeforeInstallPrompt({ prompt });
    });

    renderHook(() => usePwaInstall());

    expect(prompt).not.toHaveBeenCalled();
  });

  it('HOOK-08 uses a safe server snapshot during SSR rendering', () => {
    const Reader = () => {
      const snapshot = usePwaInstall();
      return <span>{snapshot.platform}</span>;
    };

    expect(() => renderToString(<Reader />)).not.toThrow();
  });

  it('HOOK-09 supports multiple simultaneous consumers', () => {
    const Consumer = ({ testId }) => {
      const snapshot = usePwaInstall();
      return <span data-testid={testId}>{snapshot.nativePromptAvailable ? 'available' : 'missing'}</span>;
    };

    render(
      <>
        <Consumer testId="consumer-a" />
        <Consumer testId="consumer-b" />
      </>,
    );

    act(() => {
      dispatchBeforeInstallPrompt();
    });

    expect(screen.getByTestId('consumer-a')).toHaveTextContent('available');
    expect(screen.getByTestId('consumer-b')).toHaveTextContent('available');
  });

  it('HOOK-10 unmounting one consumer does not affect another', () => {
    const Consumer = ({ testId, visible = true }) => {
      const snapshot = usePwaInstall();
      if (!visible) return null;
      return <span data-testid={testId}>{snapshot.isInstalled ? 'installed' : 'tab'}</span>;
    };

    const { rerender } = render(
      <>
        <Consumer testId="consumer-a" />
        <Consumer testId="consumer-b" />
      </>,
    );

    rerender(
      <>
        <Consumer testId="consumer-b" />
      </>,
    );

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(screen.getByTestId('consumer-b')).toHaveTextContent('installed');
    expect(screen.queryByTestId('consumer-a')).not.toBeInTheDocument();
  });
});
