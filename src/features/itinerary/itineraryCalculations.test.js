import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TRAVEL_MINUTES,
  calculateNextArrivalTime,
  cloneRouteItems,
  getTravelMinutesForLeg,
  isValidClockTime,
  moveArrayItem,
  moveItineraryItem,
  recalculateArrivalTimes,
  recalculateArrivalTimesFromIndex,
} from './itineraryCalculations.js';

const makeItem = (
  id,
  time,
  stayTime = 30,
  nextLeg = { mode: 'AUTO', mins: 30 },
) => ({
  id,
  name: id,
  time,
  stayTime,
  tags: [`tag-${id}`],
  resources: [{ id: `resource-${id}`, title: id }],
  placePhoto: { url: `${id}.jpg` },
  nextLeg,
});

describe('itineraryCalculations', () => {
  describe('clock and travel helpers', () => {
    it('accepts valid 24-hour clock values', () => {
      expect(isValidClockTime('00:00')).toBe(true);
      expect(isValidClockTime('23:59')).toBe(true);
    });

    it('rejects malformed or out-of-range clock values', () => {
      expect(isValidClockTime('9:00')).toBe(false);
      expect(isValidClockTime('24:00')).toBe(false);
      expect(isValidClockTime('12:60')).toBe(false);
      expect(isValidClockTime('')).toBe(false);
    });

    it('uses a manually configured travel time', () => {
      expect(
        getTravelMinutesForLeg(
          makeItem('A', '09:00', 30, { mode: 'DRIVE', mins: 18 }),
          { value: 50 },
        ),
      ).toBe(18);
    });

    it('uses route duration for AUTO legs', () => {
      expect(
        getTravelMinutesForLeg(
          makeItem('A', '09:00'),
          { value: 22 },
        ),
      ).toBe(22);
    });

    it('falls back to 30 minutes when route duration is unavailable', () => {
      expect(getTravelMinutesForLeg(makeItem('A', '09:00'), null))
        .toBe(DEFAULT_TRAVEL_MINUTES);
    });

    it('clamps negative manual travel time to zero', () => {
      expect(
        getTravelMinutesForLeg(
          makeItem('A', '09:00', 30, { mode: 'WALK', mins: -20 }),
          null,
        ),
      ).toBe(0);
    });

    it('calculates the next arrival time', () => {
      expect(
        calculateNextArrivalTime({
          arrivalTime: '09:00',
          stayMinutes: 60,
          travelMinutes: 30,
        }),
      ).toBe('10:30');
    });

    it('wraps arrival time across midnight', () => {
      expect(
        calculateNextArrivalTime({
          arrivalTime: '23:30',
          stayMinutes: 45,
          travelMinutes: 30,
        }),
      ).toBe('00:45');
    });

    it('returns an empty result for an invalid arrival time', () => {
      expect(
        calculateNextArrivalTime({
          arrivalTime: '25:00',
          stayMinutes: 30,
          travelMinutes: 30,
        }),
      ).toBe('');
    });
  });

  describe('route cloning and time recalculation', () => {
    it('deep-clones mutable route fields', () => {
      const original = [makeItem('A', '09:00')];
      const cloned = cloneRouteItems(original);

      cloned[0].tags.push('new-tag');
      cloned[0].resources[0].title = 'changed';
      cloned[0].placePhoto.url = 'changed.jpg';
      cloned[0].nextLeg.mins = 99;

      expect(original[0].tags).toEqual(['tag-A']);
      expect(original[0].resources[0].title).toBe('A');
      expect(original[0].placePhoto.url).toBe('A.jpg');
      expect(original[0].nextLeg.mins).toBe(30);
    });

    it('returns an empty array for a non-array route', () => {
      expect(cloneRouteItems(null)).toEqual([]);
    });

    it('recalculates a basic three-stop itinerary', () => {
      const result = recalculateArrivalTimes([
        makeItem('A', '09:00', 60),
        makeItem('B', '00:00', 45),
        makeItem('C', '00:00', 30),
      ], null, '09:00');

      expect(result.map((item) => item.time)).toEqual([
        '09:00',
        '10:30',
        '11:45',
      ]);
    });

    it('uses route durations when supplied', () => {
      const result = recalculateArrivalTimes([
        makeItem('A', '09:00', 60),
        makeItem('B', '00:00', 30),
        makeItem('C', '00:00', 30),
      ], [{ value: 15 }, { value: 20 }], '09:00');

      expect(result.map((item) => item.time)).toEqual([
        '09:00',
        '10:15',
        '11:05',
      ]);
    });

    it('manual next-leg time overrides route duration', () => {
      const result = recalculateArrivalTimes([
        makeItem('A', '09:00', 60, { mode: 'DRIVE', mins: 10 }),
        makeItem('B', '00:00', 30),
      ], [{ value: 55 }], '09:00');

      expect(result[1].time).toBe('10:10');
    });

    it('uses the first item time when an anchor is not supplied', () => {
      const result = recalculateArrivalTimes([
        makeItem('A', '08:15', 45),
        makeItem('B', '00:00', 30),
      ]);

      expect(result.map((item) => item.time)).toEqual(['08:15', '09:30']);
    });

    it('keeps a cloned route unchanged when the anchor is invalid', () => {
      const original = [
        makeItem('A', 'invalid', 45),
        makeItem('B', '13:00', 30),
      ];
      const result = recalculateArrivalTimes(original);

      expect(result).toEqual(original);
      expect(result).not.toBe(original);
    });

    it('does not mutate original items during recalculation', () => {
      const original = [
        makeItem('A', '09:00', 60),
        makeItem('B', '12:00', 30),
      ];

      const result = recalculateArrivalTimes(original, null, '10:00');

      expect(original.map((item) => item.time)).toEqual(['09:00', '12:00']);
      expect(result.map((item) => item.time)).toEqual(['10:00', '11:30']);
    });

    it('recalculates only items after the edited index', () => {
      const result = recalculateArrivalTimesFromIndex([
        makeItem('A', '08:00', 30),
        makeItem('B', '10:00', 60),
        makeItem('C', '15:00', 30),
      ], 1, [{ value: 10 }, { value: 20 }]);

      expect(result.map((item) => item.time)).toEqual([
        '08:00',
        '10:00',
        '11:20',
      ]);
    });

    it('leaves the list unchanged for an invalid cascade index', () => {
      const original = [makeItem('A', '09:00')];
      expect(recalculateArrivalTimesFromIndex(original, 4)).toEqual(original);
    });
  });

  describe('array and itinerary moves', () => {
    it('moves an item forward in one array', () => {
      const result = moveArrayItem([
        makeItem('A', '09:00'),
        makeItem('B', '10:00'),
        makeItem('C', '11:00'),
      ], 0, 2);

      expect(result.ok).toBe(true);
      expect(result.items.map((item) => item.id)).toEqual(['B', 'C', 'A']);
    });

    it('moves an item backward in one array', () => {
      const result = moveArrayItem([
        makeItem('A', '09:00'),
        makeItem('B', '10:00'),
        makeItem('C', '11:00'),
      ], 2, 0);

      expect(result.items.map((item) => item.id)).toEqual(['C', 'A', 'B']);
    });

    it('reports a no-op without changing order', () => {
      const result = moveArrayItem([
        makeItem('A', '09:00'),
        makeItem('B', '10:00'),
      ], 1, 1);

      expect(result.ok).toBe(true);
      expect(result.noop).toBe(true);
      expect(result.items.map((item) => item.id)).toEqual(['A', 'B']);
    });

    it('rejects an invalid source index', () => {
      const result = moveArrayItem([makeItem('A', '09:00')], 4, 0);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_INDEX');
    });

    it('reorders one day and recalculates times from its original anchor', () => {
      const original = {
        'Day 1': [
          makeItem('A', '09:00', 60),
          makeItem('B', '10:30', 30),
          makeItem('C', '11:30', 45),
        ],
      };

      const result = moveItineraryItem({
        itinerary: original,
        sourceDay: 'Day 1',
        destinationDay: 'Day 1',
        sourceIndex: 2,
        destinationIndex: 1,
      });

      expect(result.ok).toBe(true);
      expect(result.nextItinerary['Day 1'].map((item) => item.id))
        .toEqual(['A', 'C', 'B']);
      expect(result.nextItinerary['Day 1'].map((item) => item.time))
        .toEqual(['09:00', '10:30', '11:45']);
      expect(result.pendingRecalculations).toEqual({
        'Day 1': { anchorTime: '09:00' },
      });
    });

    it('moves an item between days while preserving both day anchors', () => {
      const result = moveItineraryItem({
        itinerary: {
          'Day 1': [
            makeItem('A', '09:00', 30),
            makeItem('B', '10:00', 30),
          ],
          'Day 2': [
            makeItem('C', '13:00', 60),
            makeItem('D', '14:30', 30),
          ],
        },
        sourceDay: 'Day 1',
        destinationDay: 'Day 2',
        sourceIndex: 1,
        destinationIndex: 1,
      });

      expect(result.nextItinerary['Day 1'].map((item) => item.id))
        .toEqual(['A']);
      expect(result.nextItinerary['Day 2'].map((item) => item.id))
        .toEqual(['C', 'B', 'D']);
      expect(result.nextItinerary['Day 2'].map((item) => item.time))
        .toEqual(['13:00', '14:30', '15:30']);
      expect(result.pendingRecalculations).toEqual({
        'Day 1': { anchorTime: '09:00' },
        'Day 2': { anchorTime: '13:00' },
      });
    });

    it('omits pending recalculation when the source day becomes empty', () => {
      const result = moveItineraryItem({
        itinerary: {
          'Day 1': [makeItem('A', '09:00')],
          'Day 2': [makeItem('B', '13:00')],
        },
        sourceDay: 'Day 1',
        destinationDay: 'Day 2',
        sourceIndex: 0,
        destinationIndex: 1,
      });

      expect(result.nextItinerary['Day 1']).toEqual([]);
      expect(result.pendingRecalculations).toEqual({
        'Day 2': { anchorTime: '13:00' },
      });
    });

    it('preserves all IDs and does not mutate the original itinerary', () => {
      const original = {
        'Day 1': [
          makeItem('A', '09:00'),
          makeItem('B', '10:00'),
          makeItem('C', '11:00'),
        ],
      };

      const result = moveItineraryItem({
        itinerary: original,
        sourceDay: 'Day 1',
        destinationDay: 'Day 1',
        sourceIndex: 0,
        destinationIndex: 2,
      });

      expect(result.nextItinerary['Day 1'].map((item) => item.id).sort())
        .toEqual(['A', 'B', 'C']);
      expect(original['Day 1'].map((item) => item.id))
        .toEqual(['A', 'B', 'C']);
    });

    it('rejects an invalid cross-day destination index', () => {
      const result = moveItineraryItem({
        itinerary: {
          'Day 1': [makeItem('A', '09:00')],
          'Day 2': [makeItem('B', '13:00')],
        },
        sourceDay: 'Day 1',
        destinationDay: 'Day 2',
        sourceIndex: 0,
        destinationIndex: 4,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('INVALID_INDEX');
    });
  });
});
