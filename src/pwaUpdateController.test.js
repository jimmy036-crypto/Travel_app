import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkForPwaUpdate,
  resetPwaUpdateControllerForTest,
  setPwaUpdateRegistration,
  subscribePwaUpdate,
} from './pwaUpdateController.js';

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.addCount = 0;
    this.removeCount = 0;
  }

  addEventListener(type, handler) {
    this.addCount += 1;
    const handlers = this.listeners.get(type) || new Set();
    handlers.add(handler);
    this.listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this.removeCount += 1;
    this.listeners.get(type)?.delete(handler);
  }

  dispatch(type) {
    for (const handler of this.listeners.get(type) || []) {
      handler();
    }
  }
}

class FakeWorker extends FakeEventTarget {
  constructor(state = 'installing') {
    super();
    this.state = state;
  }

  setState(nextState) {
    this.state = nextState;
    this.dispatch('statechange');
  }
}

class FakeRegistration extends FakeEventTarget {
  constructor({ waiting = null, installing = null, update = async () => undefined } = {}) {
    super();
    this.waiting = waiting;
    this.installing = installing;
    this.update = vi.fn(update);
  }

  triggerUpdateFound(worker) {
    this.installing = worker;
    this.dispatch('updatefound');
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

describe('pwaUpdateController', () => {
  beforeEach(() => {
    resetPwaUpdateControllerForTest();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    resetPwaUpdateControllerForTest();
  });

  it('reveals a waiting worker immediately during manual checks', async () => {
    const listener = vi.fn();
    const registration = new FakeRegistration({
      waiting: {},
    });
    subscribePwaUpdate(listener);
    setPwaUpdateRegistration({
      registration,
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });

    const result = await checkForPwaUpdate({ forceReveal: true });

    expect(result.status).toBe('update-available');
    expect(listener).toHaveBeenLastCalledWith({
      hasWaitingWorker: true,
      needRefresh: true,
    });
    expect(registration.update).not.toHaveBeenCalled();
  });

  it('waits for an installing worker before reporting the result', async () => {
    const worker = new FakeWorker('installing');
    const registration = new FakeRegistration({
      installing: worker,
    });
    setPwaUpdateRegistration({ registration });

    const resultPromise = checkForPwaUpdate({ forceReveal: true });
    await Promise.resolve();

    expect(registration.update).not.toHaveBeenCalled();

    registration.waiting = {};
    registration.installing = null;
    worker.setState('installed');

    await expect(resultPromise).resolves.toEqual({ status: 'update-available' });
  });

  it('waits for updatefound before reporting up-to-date', async () => {
    let worker;
    const registration = new FakeRegistration({
      update: async () => {
        worker = new FakeWorker('installing');
        registration.triggerUpdateFound(worker);
      },
    });
    setPwaUpdateRegistration({
      registration,
      swUrl: '/sw.js',
    });

    const resultPromise = checkForPwaUpdate({ forceReveal: true });
    await vi.waitFor(() => {
      expect(worker?.addCount).toBe(1);
    });

    registration.waiting = {};
    registration.installing = null;
    worker.setState('installed');

    const result = await resultPromise;

    expect(result.status).toBe('update-available');
    expect(registration.update).toHaveBeenCalledTimes(1);
    expect(worker.removeCount).toBe(1);
  });

  it('handles the specification order where update resolves before updatefound is dispatched', async () => {
    let worker;
    let settled = false;
    const registration = new FakeRegistration({
      update: async () => {
        worker = new FakeWorker('installing');
        registration.installing = worker;
      },
    });
    setPwaUpdateRegistration({
      registration,
      swUrl: '/sw.js',
    });

    const resultPromise = checkForPwaUpdate({ forceReveal: true }).then((result) => {
      settled = true;
      return result;
    });

    await vi.waitFor(() => {
      expect(worker?.addCount).toBe(1);
    });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(registration.update).toHaveBeenCalledTimes(1);

    registration.dispatch('updatefound');
    registration.waiting = worker;
    registration.installing = null;
    worker.setState('installed');

    await expect(resultPromise).resolves.toEqual({ status: 'update-available' });
    expect(worker.removeCount).toBe(1);
    expect(registration.removeCount).toBe(1);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('reports up-to-date only after an update check settles without a new worker', async () => {
    const registration = new FakeRegistration();
    setPwaUpdateRegistration({
      registration,
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });

    const result = await checkForPwaUpdate({ forceReveal: true });

    expect(result.status).toBe('up-to-date');
    expect(fetch).toHaveBeenCalledWith('/sw.js', {
      cache: 'no-store',
      headers: {
        'cache-control': 'no-cache',
      },
    });
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate update checks', async () => {
    const update = deferred();
    const registration = new FakeRegistration({
      update: () => update.promise,
    });
    setPwaUpdateRegistration({
      registration,
      swUrl: '/sw.js',
    });

    const firstCheck = checkForPwaUpdate({ forceReveal: true });
    const secondCheck = checkForPwaUpdate({ forceReveal: true });

    await expect(secondCheck).resolves.toEqual({ status: 'checking' });
    expect(registration.update).toHaveBeenCalledTimes(1);

    update.resolve();
    await expect(firstCheck).resolves.toEqual({ status: 'up-to-date' });
  });

  it('surfaces check failures without swallowing them', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('network failed'));
    const registration = new FakeRegistration();
    setPwaUpdateRegistration({
      registration,
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });

    await expect(checkForPwaUpdate({ forceReveal: true })).rejects.toThrow('network failed');
  });

  it('removes event listeners after success, failure, and timeout', async () => {
    const successWorker = new FakeWorker('installing');
    const successRegistration = new FakeRegistration({
      update: async () => {
        successRegistration.triggerUpdateFound(successWorker);
      },
    });
    setPwaUpdateRegistration({
      registration: successRegistration,
      swUrl: '/sw.js',
    });

    const successResult = checkForPwaUpdate({ forceReveal: true });
    await vi.waitFor(() => {
      expect(successWorker.addCount).toBe(1);
    });

    successRegistration.waiting = {};
    successRegistration.installing = null;
    successWorker.setState('installed');

    await expect(successResult).resolves.toEqual({
      status: 'update-available',
    });
    expect(successRegistration.removeCount).toBe(1);
    expect(successWorker.removeCount).toBe(1);

    resetPwaUpdateControllerForTest();
    const failureRegistration = new FakeRegistration({
      update: async () => {
        throw new Error('update failed');
      },
    });
    setPwaUpdateRegistration({
      registration: failureRegistration,
      swUrl: '/sw.js',
    });

    await expect(checkForPwaUpdate({ forceReveal: true })).rejects.toThrow('update failed');
    expect(failureRegistration.removeCount).toBe(1);

    resetPwaUpdateControllerForTest();
    vi.useFakeTimers();
    const timeoutWorker = new FakeWorker('installing');
    const timeoutRegistration = new FakeRegistration({
      installing: timeoutWorker,
    });
    setPwaUpdateRegistration({
      registration: timeoutRegistration,
    });

    const timeoutResult = checkForPwaUpdate({ forceReveal: true });
    await vi.advanceTimersByTimeAsync(10_000);

    await expect(timeoutResult).resolves.toMatchObject({ status: 'failed' });
    expect(timeoutWorker.removeCount).toBe(1);
  });
});
