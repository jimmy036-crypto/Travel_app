import { describe, expect, it, vi } from 'vitest';

import {
  EXAMPLE_TRIP_VISIBILITY_KEY,
  isExampleTripHidden,
  setExampleTripHidden,
} from './exampleTripVisibility.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn((key) => values.delete(key)),
  };
}

describe('example trip visibility', () => {
  it('is visible by default and persists a versioned hidden preference', () => {
    const storage = createStorage();

    expect(isExampleTripHidden(storage)).toBe(false);
    expect(setExampleTripHidden(true, storage)).toBe(true);
    expect(storage.setItem).toHaveBeenCalledWith(EXAMPLE_TRIP_VISIBILITY_KEY, 'hidden');
    expect(isExampleTripHidden(storage)).toBe(true);
  });

  it('restores visibility by removing only the example preference', () => {
    const storage = createStorage({ [EXAMPLE_TRIP_VISIBILITY_KEY]: 'hidden' });

    expect(setExampleTripHidden(false, storage)).toBe(true);
    expect(storage.removeItem).toHaveBeenCalledWith(EXAMPLE_TRIP_VISIBILITY_KEY);
    expect(isExampleTripHidden(storage)).toBe(false);
  });

  it('fails safely when storage is unavailable', () => {
    const storage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };

    expect(isExampleTripHidden(storage)).toBe(false);
    expect(setExampleTripHidden(true, storage)).toBe(false);
  });
});
