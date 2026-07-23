import { describe, expect, it, vi } from 'vitest';
import {
  createCloneDemoRepository,
  writeAndVerifyMyTrips,
} from './cloneDemoRepository.js';

function payload(overrides = {}) {
  return {
    roomId: 'trip-operation-room',
    meta: { title: 'Clone' },
    itinerary: {},
    checklist: [],
    cloneOperation: {
      operationId: 'operation-1234',
      payloadFingerprint: 'fnv1a-abc1234',
    },
    ...overrides,
  };
}

function dependencies(initialRoom = null) {
  let room = initialRoom;
  const reference = { path: 'rooms/trip-operation-room' };
  return {
    database: {},
    emulatorAuthorized: true,
    ref: vi.fn(() => reference),
    get: vi.fn(async () => ({ val: () => room })),
    runTransaction: vi.fn(async (_reference, update) => {
      const next = update(room);
      if (next !== undefined) room = next;
      return { committed: next !== undefined, snapshot: { val: () => room } };
    }),
    getRoom: () => room,
  };
}

describe('Clone Demo Emulator repository', () => {
  it('rejects every write outside an explicitly authorized Emulator runtime', async () => {
    const deps = dependencies();
    const repository = createCloneDemoRepository({ ...deps, emulatorAuthorized: false });
    await expect(repository.createRoom(payload())).rejects.toMatchObject({
      code: 'CLONE_EMULATOR_REQUIRED',
    });
    expect(deps.runTransaction).not.toHaveBeenCalled();
  });

  it('creates a whole room with create-only transaction semantics', async () => {
    const deps = dependencies();
    const repository = createCloneDemoRepository(deps);
    const result = await repository.createRoom(payload());
    expect(result.status).toBe('created');
    expect(deps.getRoom()).toEqual(payload());
    expect(deps.runTransaction).toHaveBeenCalledTimes(1);
  });

  it('treats a matching retry as the same successful operation', async () => {
    const current = payload();
    const deps = dependencies(current);
    const repository = createCloneDemoRepository(deps);
    const result = await repository.createRoom(payload());
    expect(result.status).toBe('created');
    expect(deps.getRoom()).toEqual(current);
  });

  it('rejects a room collision without overwriting the existing room', async () => {
    const current = payload({
      cloneOperation: {
        operationId: 'operation-other',
        payloadFingerprint: 'fnv1a-zzz9999',
      },
    });
    const deps = dependencies(current);
    const repository = createCloneDemoRepository(deps);
    await expect(repository.createRoom(payload())).rejects.toMatchObject({
      code: 'CLONE_ROOM_COLLISION',
    });
    expect(deps.getRoom()).toEqual(current);
  });

  it('read-backs an ambiguous transaction result and never deletes the room', async () => {
    const deps = dependencies();
    deps.runTransaction = vi.fn(async () => {
      throw new Error('connection lost after commit');
    });
    deps.get = vi.fn(async () => ({ val: () => payload() }));
    const repository = createCloneDemoRepository(deps);
    await expect(repository.createRoom(payload())).resolves.toMatchObject({
      status: 'verified-after-ambiguous-result',
    });
  });

  it('writes and synchronously verifies one myTrips reference', () => {
    const result = writeAndVerifyMyTrips([], {
      roomId: 'trip-operation-room',
      title: 'Clone',
    });
    expect(result.trips).toEqual([{ roomId: 'trip-operation-room', title: 'Clone' }]);
    expect(result.reference.roomId).toBe('trip-operation-room');
  });
});
