const listeners = new Set();
const WORKER_SETTLED_STATES = new Set(['installed', 'activated', 'redundant']);
const UPDATE_CHECK_TIMEOUT_MS = 10_000;
let currentCheckPromise = null;

const state = {
  dismissedUntil: 0,
  needRefresh: false,
  registration: null,
  swUrl: '',
  updateSW: null,
};

function getNavigatorServiceWorker() {
  if (typeof navigator === 'undefined') return null;
  return navigator.serviceWorker || null;
}

function getTimerHost() {
  return typeof window !== 'undefined' ? window : globalThis;
}

function addEventListener(target, type, handler) {
  if (!target || typeof target.addEventListener !== 'function') {
    return () => {};
  }

  target.addEventListener(type, handler);
  return () => target.removeEventListener?.(type, handler);
}

function createTimeoutError(message) {
  const error = new Error(message);
  error.code = 'PWA_UPDATE_TIMEOUT';
  return error;
}

function withTimeout(promise, message, timeoutMs = UPDATE_CHECK_TIMEOUT_MS) {
  const timerHost = getTimerHost();
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = timerHost.setTimeout(() => {
      reject(createTimeoutError(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    timerHost.clearTimeout(timeoutId);
  });
}

export function waitForWorkerState(worker, timeoutMs = UPDATE_CHECK_TIMEOUT_MS) {
  if (!worker) return Promise.resolve('missing');

  const currentState = String(worker.state || '');
  if (WORKER_SETTLED_STATES.has(currentState)) {
    return Promise.resolve(currentState);
  }

  const timerHost = getTimerHost();

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutId;
    let removeStateChangeListener = () => {};

    const cleanup = () => {
      if (settled) return;
      settled = true;
      timerHost.clearTimeout(timeoutId);
      removeStateChangeListener();
    };

    const handleStateChange = () => {
      const nextState = String(worker.state || '');
      if (!WORKER_SETTLED_STATES.has(nextState)) return;

      cleanup();
      resolve(nextState);
    };

    removeStateChangeListener = addEventListener(worker, 'statechange', handleStateChange);
    timeoutId = timerHost.setTimeout(() => {
      cleanup();
      reject(createTimeoutError('Timed out waiting for service worker statechange.'));
    }, timeoutMs);

    handleStateChange();
  });
}

async function waitForExistingInstallingWorker(registration) {
  const installingWorker = registration?.installing;
  if (!installingWorker) return null;

  await waitForWorkerState(installingWorker);
  return String(installingWorker.state || '');
}

async function waitForRegistrationUpdate(registration) {
  if (typeof registration?.update !== 'function') {
    return { status: 'unsupported' };
  }

  let updateFoundWorker = null;
  const removeUpdateFoundListener = addEventListener(registration, 'updatefound', () => {
    updateFoundWorker = registration.installing || null;
  });

  try {
    await withTimeout(
      Promise.resolve().then(() => registration.update()),
      'Timed out waiting for service worker update check.',
    );
  } finally {
    removeUpdateFoundListener();
  }

  const installingWorker = updateFoundWorker || registration.installing;
  if (!installingWorker) {
    return { status: 'settled' };
  }

  await waitForWorkerState(installingWorker);
  return { status: 'settled' };
}

function notify() {
  const snapshot = getPwaUpdateSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

export function getPwaUpdateSnapshot() {
  return {
    hasWaitingWorker: Boolean(state.registration?.waiting),
    needRefresh: state.needRefresh,
  };
}

export function subscribePwaUpdate(listener) {
  listeners.add(listener);
  listener(getPwaUpdateSnapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function setPwaUpdateRegistration({ registration, swUrl, updateSW } = {}) {
  if (registration) state.registration = registration;
  if (swUrl) state.swUrl = String(swUrl);
  if (updateSW) state.updateSW = updateSW;
  notify();
}

export function revealWaitingPwaUpdate({ ignoreDismissal = false } = {}) {
  if (!state.registration?.waiting) return false;
  if (!ignoreDismissal && Date.now() < state.dismissedUntil) return false;

  state.needRefresh = true;
  notify();
  return true;
}

export function dismissPwaUpdateFor(ms) {
  state.dismissedUntil = Date.now() + Number(ms || 0);
  state.needRefresh = false;
  notify();
}

async function runPwaUpdateCheck({ forceReveal = false } = {}) {
  const serviceWorker = getNavigatorServiceWorker();
  if (!state.registration && !serviceWorker) {
    return { status: 'unsupported' };
  }

  if (!state.registration && typeof serviceWorker?.getRegistration === 'function') {
    state.registration = await serviceWorker.getRegistration();
  }

  const registration = state.registration;
  if (!registration) {
    return { status: 'unsupported' };
  }

  if (revealWaitingPwaUpdate({ ignoreDismissal: forceReveal })) {
    return { status: 'update-available' };
  }

  if (registration.installing) {
    await waitForExistingInstallingWorker(registration);

    if (revealWaitingPwaUpdate({ ignoreDismissal: forceReveal })) {
      return { status: 'update-available' };
    }

    if (registration.installing) {
      return { status: 'failed' };
    }

    return { status: 'up-to-date' };
  }

  if (state.swUrl) {
    const response = await fetch(state.swUrl, {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    });

    if (!response.ok) {
      throw new Error(`Unable to fetch service worker: ${response.status}`);
    }
  }

  const updateResult = await waitForRegistrationUpdate(registration);
  if (updateResult.status === 'unsupported') {
    return updateResult;
  }

  if (revealWaitingPwaUpdate({ ignoreDismissal: forceReveal })) {
    return { status: 'update-available' };
  }

  if (registration.installing) {
    return { status: 'failed' };
  }

  return { status: 'up-to-date' };
}

export async function checkForPwaUpdate(options = {}) {
  if (currentCheckPromise) {
    return { status: 'checking' };
  }

  currentCheckPromise = runPwaUpdateCheck(options)
    .catch((error) => {
      if (error?.code === 'PWA_UPDATE_TIMEOUT') {
        return { status: 'failed', error };
      }
      throw error;
    })
    .finally(() => {
      currentCheckPromise = null;
    });

  return currentCheckPromise;
}

export async function applyWaitingPwaUpdate() {
  if (typeof state.updateSW !== 'function') {
    throw new Error('No service worker update handler is registered.');
  }

  await state.updateSW(true);
}

export function resetPwaUpdateControllerForTest() {
  state.dismissedUntil = 0;
  state.needRefresh = false;
  state.registration = null;
  state.swUrl = '';
  state.updateSW = null;
  currentCheckPromise = null;
  listeners.clear();
}
