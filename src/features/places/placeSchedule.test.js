import { describe, expect, it } from 'vitest';
import { hasPlaceScheduleChanged } from './placeSchedule.js';

const original = { time: '09:00', stayTime: '30', nextLeg: { mode: 'WALK', mins: 12 } };

describe('hasPlaceScheduleChanged', () => {
  it.each([
    { memo: '筆記', customName: '別名', tags: ['預約'], resources: [{ id: 'file' }] },
    { stayTime: 30, nextLeg: { mode: 'WALK', mins: '12' } },
    { time: '09:00', stayTime: '030' },
  ])('ignores content and equivalent representations: %j', (changes) => {
    expect(hasPlaceScheduleChanged(original, { ...original, ...changes })).toBe(false);
  });

  it.each([
    { time: '10:00' }, { time: '' }, { stayTime: '45' },
    { nextLeg: { mode: 'WALK', mins: 20 } },
    { nextLeg: { mode: 'AUTO', mins: 12 } },
    { nextLeg: { mode: 'TRAIN', mins: 12 } },
  ])('detects effective schedule changes: %j', (changes) => {
    expect(hasPlaceScheduleChanged(original, { ...original, ...changes })).toBe(true);
  });

  it('ignores stored AUTO minutes and absent defaults without mutating either input', () => {
    const previous = Object.freeze({ time: '09:00' });
    const next = Object.freeze({ time: '09:00', stayTime: '0', nextLeg: { mode: 'AUTO', mins: 50 } });
    expect(hasPlaceScheduleChanged(previous, next)).toBe(false);
    expect(previous).toEqual({ time: '09:00' });
    expect(next.nextLeg.mins).toBe(50);
  });
});
