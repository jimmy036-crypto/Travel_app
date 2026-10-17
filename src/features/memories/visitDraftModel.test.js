import { describe, expect, it } from 'vitest';
import { applyVisitPatch, groupVisitCandidates, newManualVisit, firstMissingCity } from './visitDraftModel.js';

const candidates = [{ visitId: 'day1~a', dayId: 'day1', name: 'A' }, { visitId: 'day2~b', dayId: 'day2', name: 'B' }];
describe('visit drafts', () => {
  it('applies batch city only to selected records without declaring them visited', () => {
    const result = applyVisitPatch({}, candidates, ['day1~a'], { city: '京都', cityId: 'kyoto' });
    expect(result['day1~a']).toMatchObject({ cityId: 'kyoto' });
    expect(result['day1~a'].status).toBeUndefined();
    expect(result['day2~b']).toBeUndefined();
  });
  it('keeps saved visits visible after source loss and groups manual entries separately', () => {
    const groups = groupVisitCandidates(candidates, { 'manual~123': { source: 'manual', name: 'C' }, 'day3~c': { dayId: 'day3', name: 'D', status: 'visited' } });
    expect(groups.map((group) => group.id)).toEqual(['day1', 'day2', 'day3', 'manual']);
    expect(groups[3].places[0].name).toBe('C');
  });
  it('marks unassigned text as missing and locates the first missing visited city', () => {
    expect(firstMissingCity({ a: { status: 'wishlist' }, b: { status: 'visited', city: '京都' }, c: { status: 'visited', cityId: 'osaka', city: '大阪' } })).toBe('b');
  });
  it('locates the first missing city in displayed order rather than selection order', () => {
    expect(firstMissingCity({ b: { status: 'visited' }, a: { status: 'visited' } }, ['a', 'b'])).toBe('a');
  });
  it('creates manual visits in their own namespace without inventing coordinates or city', () => {
    const manual = newManualVisit('臨時咖啡店');
    expect(manual).toMatchObject({ source: 'manual', name: '臨時咖啡店', status: 'visited', city: '' });
    expect(manual.visitId).toMatch(/^manual~[a-f0-9-]{36}$/);
    expect(manual.cityId).toBeUndefined();
  });
});
