import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTokyoDemoTrip } from './demoTripData.js';
import {
  checkDemoSandboxStorage,
  clearDemoSandboxMemory,
  createDemoSandbox,
  readDemoSandbox,
  resetDemoSandbox,
  validateDemoSandbox,
  writeDemoSandbox,
} from './demoSandboxStore.js';
import {
  DEMO_SANDBOX_ID,
  DEMO_SANDBOX_SCHEMA_VERSION,
  DEMO_SANDBOX_STORAGE_KEY,
  DEMO_SANDBOX_TEMPLATE_VERSION,
} from './demoSandboxConstants.js';

const NOW = new Date('2026-07-23T04:00:00.000Z');
const LATER = new Date('2026-07-23T05:00:00.000Z');

function options(overrides = {}) {
  return {
    now: NOW,
    templateOptions: { startDate: '2026-08-01', now: NOW },
    ...overrides,
  };
}

function failingStorage(method = 'setItem') {
  const values = new Map();
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => {
      if (method === 'setItem') throw new Error('blocked');
      values.set(key, value);
    }),
    removeItem: vi.fn((key) => {
      if (method === 'removeItem') throw new Error('blocked');
      values.delete(key);
    }),
  };
}

describe('Demo Sandbox store', () => {
  beforeEach(() => {
    localStorage.clear();
    clearDemoSandboxMemory();
  });

  it('creates the versioned local Sandbox from a fresh immutable template', () => {
    const source = createTokyoDemoTrip(options().templateOptions);
    const sourceBefore = structuredClone(source);
    const sandbox = createDemoSandbox(options({ createTemplate: () => source }));
    expect(sandbox).toMatchObject({
      schemaVersion: DEMO_SANDBOX_SCHEMA_VERSION,
      templateVersion: DEMO_SANDBOX_TEMPLATE_VERSION,
      sandboxId: DEMO_SANDBOX_ID,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    });
    expect(sandbox.trip).toMatchObject({
      roomId: DEMO_SANDBOX_ID,
      isDemo: true,
      readOnly: false,
      source: 'local-sandbox',
    });
    sandbox.trip.meta.title = 'changed';
    expect(source).toEqual(sourceBefore);
  });

  it('preflights write read and remove behavior', () => {
    expect(checkDemoSandboxStorage(localStorage)).toEqual({ available: true, reason: null });
    expect([...Object.keys(localStorage)]).not.toContain(`${DEMO_SANDBOX_STORAGE_KEY}:probe`);
    expect(checkDemoSandboxStorage(null)).toEqual({ available: false, reason: 'unavailable' });
  });

  it('creates and persists a missing Sandbox', () => {
    const result = readDemoSandbox(options());
    expect(result.persistence).toBe('localStorage');
    expect(result.reason).toBe('missing');
    expect(JSON.parse(localStorage.getItem(DEMO_SANDBOX_STORAGE_KEY))).toEqual(result.sandbox);
  });

  it('returns defensive copies from every read', () => {
    const first = readDemoSandbox(options());
    first.sandbox.trip.meta.title = 'mutated by caller';
    const second = readDemoSandbox(options({ now: LATER }));
    expect(second.sandbox.trip.meta.title).not.toBe('mutated by caller');
    second.sandbox.trip.itinerary['Day 1'][0].name = 'also mutated';
    const third = readDemoSandbox(options({ now: LATER }));
    expect(third.sandbox.trip.itinerary['Day 1'][0].name).not.toBe('also mutated');
  });

  it.each([
    ['corrupted JSON', '{nope', 'corrupted'],
    ['wrong schema version', JSON.stringify({ ...createDemoSandbox(options()), schemaVersion: '2.0.0' }), 'invalid'],
    ['wrong template version', JSON.stringify({ ...createDemoSandbox(options()), templateVersion: 999 }), 'invalid'],
    ['wrong Sandbox identity', JSON.stringify({ ...createDemoSandbox(options()), sandboxId: 'real-room' }), 'invalid'],
  ])('recovers %s with a safe fresh local copy', (_label, raw, reason) => {
    localStorage.setItem(DEMO_SANDBOX_STORAGE_KEY, raw);
    const result = readDemoSandbox(options());
    expect(result).toMatchObject({ persistence: 'localStorage', recovered: true, reason });
    expect(validateDemoSandbox(result.sandbox)).toEqual({ valid: true, errors: [] });
  });

  it('rejects untrusted invalid values without writing them', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const result = writeDemoSandbox({ sandboxId: DEMO_SANDBOX_ID }, options());
    expect(result).toMatchObject({ ok: false, persistence: 'none', reason: 'invalid' });
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('persists edits and updates only updatedAt', () => {
    const sandbox = createDemoSandbox(options());
    sandbox.trip.meta.title = 'My edited Demo';
    const result = writeDemoSandbox(sandbox, options({ now: LATER }));
    expect(result).toMatchObject({ ok: true, persistence: 'localStorage' });
    expect(result.sandbox.createdAt).toBe(NOW.toISOString());
    expect(result.sandbox.updatedAt).toBe(LATER.toISOString());
    expect(readDemoSandbox(options()).sandbox.trip.meta.title).toBe('My edited Demo');
  });

  it('uses a memory-only fallback when storage is unavailable', () => {
    const storage = failingStorage('setItem');
    const first = readDemoSandbox(options({ storage }));
    expect(first).toMatchObject({ persistence: 'memory', reason: 'preflight-failed' });
    first.sandbox.trip.meta.title = 'memory edit';
    expect(writeDemoSandbox(first.sandbox, options({ storage, now: LATER }))).toMatchObject({
      ok: true,
      persistence: 'memory',
      reason: 'preflight-failed',
    });
    expect(readDemoSandbox(options({ storage })).sandbox.trip.meta.title).toBe('memory edit');
  });

  it('reports a final write failure and retains the validated memory copy', () => {
    let writes = 0;
    const values = new Map();
    const storage = {
      setItem(key, value) {
        writes += 1;
        if (writes > 1) throw new Error('quota');
        values.set(key, value);
      },
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    };
    const sandbox = createDemoSandbox(options());
    const result = writeDemoSandbox(sandbox, options({ storage, now: LATER }));
    expect(result).toMatchObject({ ok: false, persistence: 'memory', reason: 'write-failed' });
    expect(result.error).toBeInstanceOf(Error);
  });

  it('resets only the Sandbox key from the latest template', () => {
    localStorage.setItem('google-travel-my-trips', '[{"roomId":"real"}]');
    localStorage.setItem('google-travel-offline-trip-cache-v1', '{"real":true}');
    const edited = createDemoSandbox(options());
    edited.trip.meta.title = 'edited';
    writeDemoSandbox(edited, options());
    const reset = resetDemoSandbox(options({ now: LATER }));
    expect(reset).toMatchObject({ persistence: 'localStorage', recovered: true, reason: 'reset' });
    expect(reset.sandbox.trip.meta.title).not.toBe('edited');
    expect(reset.sandbox.createdAt).toBe(LATER.toISOString());
    expect(localStorage.getItem('google-travel-my-trips')).toBe('[{"roomId":"real"}]');
    expect(localStorage.getItem('google-travel-offline-trip-cache-v1')).toBe('{"real":true}');
  });
});
