const listeners = new Set();

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

export async function checkForPwaUpdate({ forceReveal = false } = {}) {
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
    return { status: 'checking' };
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

  if (typeof registration.update !== 'function') {
    return { status: 'unsupported' };
  }

  await registration.update();

  if (revealWaitingPwaUpdate({ ignoreDismissal: forceReveal })) {
    return { status: 'update-available' };
  }

  return { status: 'up-to-date' };
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
  listeners.clear();
}
