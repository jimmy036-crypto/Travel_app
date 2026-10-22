import { describe, expect, it } from 'vitest';
import { applyVisitPatch, groupVisitCandidates, newManualVisit, removeCity, cityKey } from './visitDraftModel.js';

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
  it('removes a city confirmation and its footprint assignments without losing place notes', () => {
    const draft = { note: '旅程感想', cities: { kyoto: { cityId: 'kyoto' }, osaka: { cityId: 'osaka' } }, visits: { a: { status: 'visited', cityId: 'kyoto', city: '京都', country: '日本', cityLat: 35, cityLng: 135, name: '寺廟', note: '下雨', lat: 35.1 }, b: { status: 'visited', cityId: 'osaka', city: '大阪' } } };
    const next = removeCity(draft, 'kyoto');
    expect(next.cities).toEqual({ osaka: { cityId: 'osaka' } });
    expect(next.visits.a).toEqual({ status: 'visited', city: '', name: '寺廟', note: '下雨', lat: 35.1 });
    expect(next.visits.b).toEqual(draft.visits.b);
    expect(draft.visits.a.cityId).toBe('kyoto');
    expect(next.note).toBe('旅程感想');
  });
  it('keeps notes when a place becomes unconfirmed and encodes database-unsafe city IDs', () => {
    expect(applyVisitPatch({ 'day1~a': { status: 'visited', note: '留著', cityId: 'kyoto' } }, candidates, ['day1~a'], { status: 'unconfirmed' })['day1~a']).toMatchObject({ status: 'unconfirmed', note: '留著', cityId: 'kyoto' });
    expect(cityKey('city.a/~')).toBe('city%2Ea%2F%7E');
  });
  it('creates manual visits in their own namespace without inventing coordinates or city', () => {
    const manual = newManualVisit('臨時咖啡店');
    expect(manual).toMatchObject({ source: 'manual', name: '臨時咖啡店', status: 'visited', city: '' });
    expect(manual.visitId).toMatch(/^manual~[a-f0-9-]{36}$/);
    expect(manual.cityId).toBeUndefined();
  });
});
