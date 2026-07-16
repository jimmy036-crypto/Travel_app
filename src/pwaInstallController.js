const STANDALONE_DISPLAY_QUERY = '(display-mode: standalone)';
const IOS_DEVICE_RE = /iPad|iPhone|iPod/i;
const IOS_BROWSER_EXCLUSION_RE = /CriOS|FxiOS|EdgiOS|OPiOS/i;
const CHROMIUM_RE = /Chrome|Chromium|CriOS|Edg|EdgiOS|EdgA|OPR|OPiOS/i;

const listeners = new Set();
let initialized = false;
let deferredPromptEvent = null;
let isPrompting = false;
let promptPromise = null;
let installedByAppEvent = false;
let standaloneByAppInstall = false;
let standaloneMediaQuery = null;
let removeBeforeInstallPromptListener = () => {};
let removeAppInstalledListener = () => {};
let removeDisplayModeListener = () => {};

function getWindow() {
  return typeof window === 'undefined' ? null : window;
}

function getNavigator() {
  const win = getWindow();
  if (win?.navigator) return win.navigator;
  return typeof navigator === 'undefined' ? null : navigator;
}

function safeString(value) {
  return typeof value === 'string' ? value : '';
}

function detectPlatform(nav = getNavigator()) {
  if (!nav) return 'unknown';

  const userAgent = safeString(nav.userAgent);
  const platform = safeString(nav.platform);
  const maxTouchPoints = Number(nav.maxTouchPoints || 0);

  if (IOS_DEVICE_RE.test(userAgent) || IOS_DEVICE_RE.test(platform)) {
    return 'ios';
  }

  if (platform === 'MacIntel' && maxTouchPoints > 1) {
    return 'ios';
  }

  if (/Android/i.test(userAgent)) {
    return 'android';
  }

  if (userAgent || platform) {
    return 'desktop';
  }

  return 'unknown';
}

function detectBrowser(nav = getNavigator()) {
  const userAgent = safeString(nav?.userAgent);
  if (!userAgent) return 'unknown';

  if (CHROMIUM_RE.test(userAgent)) {
    return 'chromium';
  }

  if (/Safari/i.test(userAgent) && !IOS_BROWSER_EXCLUSION_RE.test(userAgent)) {
    return 'safari';
  }

  return 'other';
}

function getStandaloneMediaMatches() {
  if (standaloneMediaQuery) {
    return Boolean(standaloneMediaQuery.matches);
  }

  const win = getWindow();
  if (typeof win?.matchMedia !== 'function') return false;

  try {
    return Boolean(win.matchMedia(STANDALONE_DISPLAY_QUERY)?.matches);
  } catch {
    return false;
  }
}

function computeIsStandalone() {
  const nav = getNavigator();
  return Boolean(
    standaloneByAppInstall
    || getStandaloneMediaMatches()
    || nav?.standalone === true,
  );
}

function computeIsInstalled() {
  return Boolean(installedByAppEvent || computeIsStandalone());
}

function clearDeferredPrompt() {
  deferredPromptEvent = null;
}

function getSnapshot() {
  const isStandalone = computeIsStandalone();
  const isInstalled = Boolean(installedByAppEvent || isStandalone);

  return {
    initialized,
    isInstalled,
    isStandalone,
    nativePromptAvailable: Boolean(deferredPromptEvent && !isInstalled),
    isPrompting,
    platform: detectPlatform(),
    browser: detectBrowser(),
  };
}

function notify() {
  const snapshot = getSnapshot();
  for (const listener of [...listeners]) {
    try {
      listener({ ...snapshot });
    } catch {
      // Subscriber failures should not break other consumers or browser events.
    }
  }
}

function addWindowListener(type, handler) {
  const win = getWindow();
  if (typeof win?.addEventListener !== 'function') return () => {};

  win.addEventListener(type, handler);
  return () => {
    win.removeEventListener?.(type, handler);
  };
}

function setupDisplayModeListener() {
  const win = getWindow();
  if (typeof win?.matchMedia !== 'function') return () => {};

  try {
    standaloneMediaQuery = win.matchMedia(STANDALONE_DISPLAY_QUERY);
  } catch {
    standaloneMediaQuery = null;
    return () => {};
  }

  if (!standaloneMediaQuery) return () => {};

  const handleDisplayModeChange = () => {
    standaloneByAppInstall = false;

    if (computeIsStandalone()) {
      clearDeferredPrompt();
      isPrompting = false;
    }

    notify();
  };

  if (typeof standaloneMediaQuery.addEventListener === 'function') {
    standaloneMediaQuery.addEventListener('change', handleDisplayModeChange);
    return () => {
      standaloneMediaQuery?.removeEventListener?.('change', handleDisplayModeChange);
      standaloneMediaQuery = null;
    };
  }

  if (typeof standaloneMediaQuery.addListener === 'function') {
    standaloneMediaQuery.addListener(handleDisplayModeChange);
    return () => {
      standaloneMediaQuery?.removeListener?.(handleDisplayModeChange);
      standaloneMediaQuery = null;
    };
  }

  return () => {
    standaloneMediaQuery = null;
  };
}

function handleBeforeInstallPrompt(event) {
  event?.preventDefault?.();

  if (computeIsInstalled() || typeof event?.prompt !== 'function') {
    clearDeferredPrompt();
    notify();
    return;
  }

  deferredPromptEvent = event;
  notify();
}

function handleAppInstalled() {
  installedByAppEvent = true;
  standaloneByAppInstall = true;
  clearDeferredPrompt();
  isPrompting = false;
  promptPromise = null;
  notify();
}

function cleanupListeners() {
  removeBeforeInstallPromptListener();
  removeAppInstalledListener();
  removeDisplayModeListener();
  removeBeforeInstallPromptListener = () => {};
  removeAppInstalledListener = () => {};
  removeDisplayModeListener = () => {};
  standaloneMediaQuery = null;
  initialized = false;
}

export function initializePwaInstallController() {
  if (initialized) {
    return cleanupListeners;
  }

  initialized = true;
  removeBeforeInstallPromptListener = addWindowListener('beforeinstallprompt', handleBeforeInstallPrompt);
  removeAppInstalledListener = addWindowListener('appinstalled', handleAppInstalled);
  removeDisplayModeListener = setupDisplayModeListener();

  if (computeIsInstalled()) {
    clearDeferredPrompt();
  }

  return cleanupListeners;
}

export function getPwaInstallSnapshot() {
  return { ...getSnapshot() };
}

export function subscribePwaInstall(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);

  try {
    listener(getPwaInstallSnapshot());
  } catch {
    // Keep subscription semantics consistent with async notifications.
  }

  return () => {
    listeners.delete(listener);
  };
}

export async function requestPwaInstall() {
  if (computeIsInstalled()) {
    return { status: 'already-installed' };
  }

  if (isPrompting || promptPromise) {
    return { status: 'prompting' };
  }

  const promptEvent = deferredPromptEvent;
  if (!promptEvent || typeof promptEvent.prompt !== 'function') {
    return { status: 'unavailable' };
  }

  isPrompting = true;
  notify();

  promptPromise = (async () => {
    try {
      await promptEvent.prompt();
      const choice = await Promise.resolve(promptEvent.userChoice);
      return choice?.outcome === 'accepted'
        ? { status: 'accepted' }
        : { status: 'dismissed' };
    } catch (error) {
      return { status: 'failed', error };
    } finally {
      if (deferredPromptEvent === promptEvent) {
        clearDeferredPrompt();
      }
      isPrompting = false;
      promptPromise = null;
      notify();
    }
  })();

  return promptPromise;
}

export function resetPwaInstallControllerForTest() {
  cleanupListeners();
  clearDeferredPrompt();
  isPrompting = false;
  promptPromise = null;
  installedByAppEvent = false;
  standaloneByAppInstall = false;
  listeners.clear();
}
