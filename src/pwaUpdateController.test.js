import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkForPwaUpdate,
  resetPwaUpdateControllerForTest,
  setPwaUpdateRegistration,
  subscribePwaUpdate,
} from './pwaUpdateController.js';

describe('pwaUpdateController', () => {
  beforeEach(() => {
    resetPwaUpdateControllerForTest();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPwaUpdateControllerForTest();
  });

  it('reveals a waiting worker immediately during manual checks', async () => {
    const listener = vi.fn();
    subscribePwaUpdate(listener);
    setPwaUpdateRegistration({
      registration: {
        waiting: {},
        update: vi.fn(async () => undefined),
      },
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });

    const result = await checkForPwaUpdate({ forceReveal: true });

    expect(result.status).toBe('update-available');
    expect(listener).toHaveBeenLastCalledWith({
      hasWaitingWorker: true,
      needRefresh: true,
    });
  });

  it('reports up-to-date after a successful update check with no waiting worker', async () => {
    const update = vi.fn(async () => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    });
    setPwaUpdateRegistration({
      registration: {
        waiting: null,
        update,
      },
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
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('surfaces check failures without swallowing them', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failed'));
    setPwaUpdateRegistration({
      registration: {
        waiting: null,
        update: vi.fn(async () => undefined),
      },
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });

    await expect(checkForPwaUpdate({ forceReveal: true })).rejects.toThrow('network failed');
  });
});
