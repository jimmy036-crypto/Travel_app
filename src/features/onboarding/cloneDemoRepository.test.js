import { describe, expect, it, vi } from 'vitest';
import {
  createCloneDemoRepository,
  ensureCloneDemoEmulatorConnection,
  writeAndVerifyMyTrips,
} from './cloneDemoRepository.js';
import {
  isCloneDemoEmulatorRuntime,
  isEditableDemoCloneEnabled,
} from './cloneDemoFeatureFlag.js';

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
  it('keeps the feature disabled by default and authorizes only local emulator mode', () => {
    expect(isEditableDemoCloneEnabled({ env: {} })).toBe(false);
    expect(isCloneDemoEmulatorRuntime({
      env: { MODE: 'emulator' },
      location: { hostname: '127.0.0.1' },
    })).toBe(true);
    expect(isCloneDemoEmulatorRuntime({
      env: { MODE: 'production' },
      location: { hostname: '127.0.0.1' },
    })).toBe(false);
    expect(isCloneDemoEmulatorRuntime({
      env: { MODE: 'emulator' },
      location: { hostname: 'travel.example.com' },
    })).toBe(false);
  });

  it('connects only a demo-* Firebase project to the local Database Emulator', () => {
    delete globalThis.__TRAVEL_CLONE_DATABASE_EMULATOR_CONNECTED__;
    delete globalThis.__TRAVEL_FIREBASE_EMULATORS_CONNECTED__;
    const connectDatabaseEmulator = vi.fn();
    const database = { app: { options: { projectId: 'demo-travel-e2e' } } };
    expect(ensureCloneDemoEmulatorConnection({
      database,
      emulatorAuthorized: true,
      connectDatabaseEmulator,
    })).toEqual({
      connected: true,
      projectId: 'demo-travel-e2e',
      reused: false,
    });
    expect(connectDatabaseEmulator).toHaveBeenCalledWith(database, '127.0.0.1', 9000);
    expect(() => ensureCloneDemoEmulatorConnection({
      database: { app: { options: { projectId: 'travel-production' } } },
      emulatorAuthorized: true,
      connectDatabaseEmulator,
    })).toThrow(/demo-\*/);
    delete globalThis.__TRAVEL_CLONE_DATABASE_EMULATOR_CONNECTED__;
  });

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
