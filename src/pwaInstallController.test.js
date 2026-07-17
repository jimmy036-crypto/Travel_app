import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getPwaInstallSnapshot,
  initializePwaInstallController,
  requestPwaInstall,
  resetPwaInstallControllerForTest,
  subscribePwaInstall,
} from './pwaInstallController.js';

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

function setNavigatorValue(key, value) {
  Object.defineProperty(window.navigator, key, {
    configurable: true,
    value,
  });
}

function installMatchMedia({ matches = false, modern = true } = {}) {
  const changeListeners = new Set();
  const legacyListeners = new Set();
  const mql = {
    matches,
    media: DISPLAY_MODE_QUERY,
    onchange: null,
    addListener: vi.fn((listener) => legacyListeners.add(listener)),
    removeListener: vi.fn((listener) => legacyListeners.delete(listener)),
    dispatchEvent: vi.fn(),
    setMatches(nextMatches) {
      this.matches = nextMatches;
      const event = { matches: nextMatches, media: this.media };
      for (const listener of [...changeListeners]) {
        listener.call(this, event);
      }
      for (const listener of [...legacyListeners]) {
        listener.call(this, event);
      }
      this.onchange?.(event);
    },
  };

  if (modern) {
    mql.addEventListener = vi.fn((type, listener) => {
      if (type === 'change') changeListeners.add(listener);
    });
    mql.removeEventListener = vi.fn((type, listener) => {
      if (type === 'change') changeListeners.delete(listener);
    });
  }

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
  const preventDefault = vi.fn();
  Object.defineProperty(event, 'preventDefault', {
    configurable: true,
    value: preventDefault,
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
  return { event, preventDefault, prompt };
}

describe('pwaInstallController', () => {
  beforeEach(() => {
    resetPwaInstallControllerForTest();
    originalMatchMedia = window.matchMedia;
    captureNavigatorDescriptors();
    installMatchMedia();
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

  it('INSTALL-01 initializes as a browser tab without a native prompt', () => {
    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      initialized: true,
      isInstalled: false,
      isStandalone: false,
      nativePromptAvailable: false,
      isPrompting: false,
    });
  });

  it('INSTALL-02 detects standalone display mode as installed', () => {
    installMatchMedia({ matches: true });

    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: true,
      isStandalone: true,
    });
  });

  it('INSTALL-03 detects navigator.standalone as installed', () => {
    setNavigatorValue('standalone', true);

    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: true,
      isStandalone: true,
    });
  });

  it('INSTALL-04 captures beforeinstallprompt and prevents the browser default', () => {
    initializePwaInstallController();

    const { preventDefault } = dispatchBeforeInstallPrompt();

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: false,
      nativePromptAvailable: true,
    });
  });

  it('INSTALL-05 immediately emits a snapshot to subscribers', () => {
    initializePwaInstallController();
    const listener = vi.fn();

    subscribePwaInstall(listener);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      initialized: true,
      nativePromptAvailable: false,
    }));
  });

  it('INSTALL-06 stops emitting after unsubscribe', () => {
    initializePwaInstallController();
    const listener = vi.fn();
    const unsubscribe = subscribePwaInstall(listener);

    unsubscribe();
    dispatchBeforeInstallPrompt();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('INSTALL-07 reports unavailable when no deferred prompt exists', async () => {
    initializePwaInstallController();

    await expect(requestPwaInstall()).resolves.toEqual({ status: 'unavailable' });
  });

  it('INSTALL-08 runs an accepted prompt once and clears the event', async () => {
    initializePwaInstallController();
    const prompt = vi.fn(async () => undefined);
    dispatchBeforeInstallPrompt({
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });

    await expect(requestPwaInstall()).resolves.toEqual({ status: 'accepted' });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(getPwaInstallSnapshot()).toMatchObject({
      nativePromptAvailable: false,
      isPrompting: false,
    });
  });

  it('INSTALL-09 handles dismissed prompts without marking the app installed', async () => {
    initializePwaInstallController();
    dispatchBeforeInstallPrompt({
      userChoice: Promise.resolve({ outcome: 'dismissed' }),
    });

    await expect(requestPwaInstall()).resolves.toEqual({ status: 'dismissed' });

    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: false,
      nativePromptAvailable: false,
    });
  });

  it('INSTALL-10 catches prompt failures and clears prompting state', async () => {
    initializePwaInstallController();
    const error = new Error('prompt failed');
    dispatchBeforeInstallPrompt({
      prompt: vi.fn(async () => {
        throw error;
      }),
    });

    await expect(requestPwaInstall()).resolves.toEqual({ status: 'failed', error });

    expect(getPwaInstallSnapshot()).toMatchObject({
      isPrompting: false,
      nativePromptAvailable: false,
    });
  });

  it('INSTALL-11 prevents concurrent prompt calls', async () => {
    initializePwaInstallController();
    let resolveChoice;
    const userChoice = new Promise((resolve) => {
      resolveChoice = resolve;
    });
    const prompt = vi.fn(async () => undefined);
    dispatchBeforeInstallPrompt({ prompt, userChoice });

    const firstRequest = requestPwaInstall();
    await Promise.resolve();
    const secondRequest = requestPwaInstall();

    await expect(secondRequest).resolves.toEqual({ status: 'prompting' });
    expect(prompt).toHaveBeenCalledTimes(1);

    resolveChoice({ outcome: 'accepted' });
    await expect(firstRequest).resolves.toEqual({ status: 'accepted' });
  });

  it('INSTALL-12 marks appinstalled as installed and clears native prompt state', () => {
    initializePwaInstallController();
    dispatchBeforeInstallPrompt();

    window.dispatchEvent(new Event('appinstalled'));

    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: true,
      isStandalone: true,
      nativePromptAvailable: false,
      isPrompting: false,
    });
  });

  it('INSTALL-13 updates snapshots when display-mode changes', () => {
    const mql = installMatchMedia({ matches: false });
    initializePwaInstallController();
    const listener = vi.fn();
    subscribePwaInstall(listener);

    mql.setMatches(true);

    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: true,
      isStandalone: true,
    });
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({
      isInstalled: true,
      isStandalone: true,
    }));
  });

  it('INSTALL-14 initializes idempotently without duplicate window listeners', () => {
    const addListenerSpy = vi.spyOn(window, 'addEventListener');

    initializePwaInstallController();
    initializePwaInstallController();

    expect(addListenerSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt')).toHaveLength(1);
    expect(addListenerSpy.mock.calls.filter(([type]) => type === 'appinstalled')).toHaveLength(1);
  });

  it('INSTALL-15 reset removes listeners and allows reinitialization', () => {
    const mql = installMatchMedia({ matches: false });
    const removeListenerSpy = vi.spyOn(window, 'removeEventListener');

    initializePwaInstallController();
    resetPwaInstallControllerForTest();

    expect(removeListenerSpy.mock.calls.filter(([type]) => type === 'beforeinstallprompt')).toHaveLength(1);
    expect(removeListenerSpy.mock.calls.filter(([type]) => type === 'appinstalled')).toHaveLength(1);
    expect(mql.removeEventListener).toHaveBeenCalledTimes(1);

    initializePwaInstallController();
    dispatchBeforeInstallPrompt();

    expect(getPwaInstallSnapshot()).toMatchObject({
      initialized: true,
      nativePromptAvailable: true,
    });
  });

  it('INSTALL-16 is safe in an SSR-like environment', () => {
    const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    try {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: undefined,
      });

      expect(() => initializePwaInstallController()).not.toThrow();
      expect(getPwaInstallSnapshot()).toMatchObject({
        initialized: true,
        isInstalled: false,
        isStandalone: false,
        nativePromptAvailable: false,
        platform: 'unknown',
        browser: 'unknown',
      });
    } finally {
      if (windowDescriptor) {
        Object.defineProperty(globalThis, 'window', windowDescriptor);
      }
      if (navigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
      }
    }
  });

  it('INSTALL-17 identifies iPhone Safari', () => {
    setNavigatorValue('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
    setNavigatorValue('platform', 'iPhone');

    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      platform: 'ios',
      browser: 'safari',
    });
  });

  it('INSTALL-18 identifies iPadOS desktop-style user agents as iOS', () => {
    setNavigatorValue('userAgent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');
    setNavigatorValue('platform', 'MacIntel');
    setNavigatorValue('maxTouchPoints', 5);

    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      platform: 'ios',
      browser: 'safari',
    });
  });

  it('INSTALL-19 does not classify CriOS as Safari', () => {
    setNavigatorValue('userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1');
    setNavigatorValue('platform', 'iPhone');

    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      platform: 'ios',
      browser: 'chromium',
    });
  });

  it('INSTALL-20 identifies desktop Chromium browsers', () => {
    setNavigatorValue('userAgent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
    setNavigatorValue('platform', 'Win32');

    initializePwaInstallController();

    expect(getPwaInstallSnapshot()).toMatchObject({
      platform: 'desktop',
      browser: 'chromium',
    });
  });

  it('INSTALL-21 returns isolated snapshots that cannot mutate internal state', () => {
    initializePwaInstallController();
    const snapshot = getPwaInstallSnapshot();

    snapshot.isInstalled = true;
    snapshot.nativePromptAvailable = true;

    expect(getPwaInstallSnapshot()).toMatchObject({
      isInstalled: false,
      nativePromptAvailable: false,
    });
  });

  it('INSTALL-22 keeps notifying subscribers after one listener throws', () => {
    initializePwaInstallController();
    const throwingListener = vi.fn(() => {
      throw new Error('listener failed');
    });
    const healthyListener = vi.fn();

    subscribePwaInstall(throwingListener);
    subscribePwaInstall(healthyListener);
    dispatchBeforeInstallPrompt();

    expect(throwingListener).toHaveBeenCalledTimes(2);
    expect(healthyListener).toHaveBeenCalledTimes(2);
    expect(healthyListener).toHaveBeenLastCalledWith(expect.objectContaining({
      nativePromptAvailable: true,
    }));
  });
});
