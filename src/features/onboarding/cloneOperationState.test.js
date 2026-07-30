import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearCloneOperationLocks,
  hasCloneCollision,
  runCloneBrowserLock,
  runCloneOperationOnce,
  sameCloneOperation,
  transitionCloneOperation,
} from './cloneOperationState.js';

const JOURNAL = {
  state: 'prepared',
  operationId: 'operation-12345678',
  roomId: 'trip-1234567',
  payloadFingerprint: 'fnv1a-abc1234',
};

describe('Clone operation state machine', () => {
  beforeEach(() => clearCloneOperationLocks());

  it('follows room, myTrips, repair, and completion states explicitly', () => {
    const writing = transitionCloneOperation(JOURNAL, 'BEGIN_ROOM_WRITE');
    const verified = transitionCloneOperation(writing, 'ROOM_VERIFIED');
    const linking = transitionCloneOperation(verified, 'BEGIN_MYTRIPS_WRITE');
    const repair = transitionCloneOperation(linking, 'MYTRIPS_FAILED');
    const retry = transitionCloneOperation(repair, 'RETRY_MYTRIPS');
    const completed = transitionCloneOperation(retry, 'MYTRIPS_VERIFIED');
    expect([writing.state, verified.state, linking.state, repair.state, retry.state, completed.state]).toEqual([
      'writing-room',
      'room-verified',
      'linking-mytrips',
      'repair-required',
      'linking-mytrips',
      'completed',
    ]);
  });

  it('keeps ambiguous room outcome in read-back-required state', () => {
    const writing = transitionCloneOperation(JOURNAL, 'BEGIN_ROOM_WRITE');
    expect(transitionCloneOperation(writing, 'ROOM_AMBIGUOUS').state).toBe('writing-room');
    expect(() => transitionCloneOperation(writing, 'MYTRIPS_VERIFIED')).toThrow(/Invalid Clone transition/);
  });

  it('detects collisions but recognizes an exact retry identity', () => {
    expect(sameCloneOperation(JOURNAL, { ...JOURNAL })).toBe(true);
    expect(hasCloneCollision(JOURNAL, { ...JOURNAL })).toBe(false);
    expect(hasCloneCollision(JOURNAL, { ...JOURNAL, operationId: 'operation-87654321' })).toBe(true);
    expect(hasCloneCollision(JOURNAL, { ...JOURNAL, payloadFingerprint: 'fnv1a-zzz9999' })).toBe(true);
  });

  it('shares one in-flight promise for double-click and permits a later explicit run', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const executor = vi.fn(async () => {
      await gate;
      return 'done';
    });
    const first = runCloneOperationOnce(JOURNAL.operationId, executor);
    const second = runCloneOperationOnce(JOURNAL.operationId, executor);
    expect(second).toBe(first);
    await vi.waitFor(() => expect(executor).toHaveBeenCalledTimes(1));
    release();
    await expect(first).resolves.toBe('done');
    await expect(runCloneOperationOnce(JOURNAL.operationId, executor)).resolves.toBe('done');
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it('serializes different initial operations through one browser-wide lock', async () => {
    let chain = Promise.resolve();
    let active = 0;
    let maxActive = 0;
    const locks = {
      request: vi.fn((_name, _options, executor) => {
        const result = chain.then(async () => {
          active += 1;
          maxActive = Math.max(maxActive, active);
          await Promise.resolve();
          try {
            return await executor();
          } finally {
            active -= 1;
          }
        });
        chain = result.catch(() => {});
        return result;
      }),
    };
    const order = [];
    await Promise.all([
      runCloneBrowserLock(() => order.push('first'), { locks }),
      runCloneBrowserLock(() => order.push('second'), { locks }),
    ]);
    expect(order).toEqual(['first', 'second']);
    expect(maxActive).toBe(1);
    expect(locks.request).toHaveBeenNthCalledWith(
      1,
      'travel-app-demo-clone-operation',
      { mode: 'exclusive' },
      expect.any(Function),
    );
  });
});
