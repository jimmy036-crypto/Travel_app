import { describe, expect, it } from 'vitest';

import {
  TRIP_REPOSITORY_METHODS,
  assertTripRepository,
  createEmptyTripSnapshot,
  normalizeTripSnapshot,
} from './tripRepositoryContract.js';

const createRepository = () => Object.fromEntries(
  TRIP_REPOSITORY_METHODS.map((method) => [
    method,
    method === 'getCapabilities' ? () => ({ export: true }) : () => undefined,
  ]),
);

describe('trip repository contract', () => {
  it('normalizes every repository snapshot to one shape', () => {
    const input = {
      meta: { title: 'Trip' },
      itinerary: { 'Day 1': [{ id: 'place-1' }] },
      expenses: null,
      checklist: {
        first: { id: 'first', text: 'Passport' },
        removed: null,
      },
    };
    const result = normalizeTripSnapshot(input);

    expect(result).toEqual({
      meta: { title: 'Trip' },
      itinerary: { 'Day 1': [{ id: 'place-1' }] },
      expenses: [],
      settlements: [],
      tickets: [],
      checklist: [{ id: 'first', text: 'Passport' }],
    });
    result.meta.title = 'Changed';
    expect(input.meta.title).toBe('Trip');
  });

  it('creates independent empty snapshots', () => {
    const first = createEmptyTripSnapshot();
    const second = createEmptyTripSnapshot();
    first.expenses.push({ id: 'expense-1' });
    expect(second.expenses).toEqual([]);
  });

  it('rejects incomplete repositories', () => {
    expect(assertTripRepository(createRepository())).toBeTruthy();
    const incomplete = createRepository();
    Reflect.deleteProperty(incomplete, 'updateTickets');
    expect(() => assertTripRepository(incomplete)).toThrow(/updateTickets/);
  });
});
