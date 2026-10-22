import { describe, expect, it, vi } from 'vitest';
import { cityFromResults, resolveCitySuggestions } from './citySuggestions.js';

const result = (id = 'kyoto', types = ['locality'], country = '日本') => ({ place_id: id, types, address_components: [{ long_name: id === 'kyoto' ? '京都' : id, types }, { long_name: country, types: ['country'] }], geometry: { location: { lat: () => 35, lng: () => 135 } } });
describe('city suggestions', () => {
  it('selects a city result rather than an address or neighbourhood', () => {
    expect(cityFromResults([result('street', ['street_address']), result('ward', ['sublocality']), result()])).toEqual({ cityId: 'kyoto', city: '京都', country: '日本', cityLat: 35, cityLng: 135 });
    expect(cityFromResults([result('street', ['street_address'])])).toBeNull();
    expect(cityFromResults([result('bad', ['locality'], '')])).toBeNull();
  });
  it('uses Taiwan city/county results instead of township localities', () => {
    expect(cityFromResults([result('中壢區', ['locality'], '台灣'), result('桃園市', ['administrative_area_level_1'], '台灣')]).city).toBe('桃園市');
  });
  it('deduplicates exact coordinates, keeps city identity and never declares a visit', async () => {
    const geocoder = { geocode: vi.fn().mockResolvedValue({ results: [result()] }) };
    const suggestions = await resolveCitySuggestions([{ visitId: 'a', lat: 35, lng: 135 }, { visitId: 'b', lat: 35, lng: 135 }, { visitId: 'c', lat: null, lng: null }], '', geocoder);
    expect(geocoder.geocode).toHaveBeenCalledTimes(1);
    expect(suggestions.cities).toHaveLength(1);
    expect(suggestions.placeCities).toEqual({ a: suggestions.cities[0], b: suggestions.cities[0] });
    expect(suggestions.cities[0].status).toBeUndefined();
  });
  it('keeps successful suggestions when another request fails and bounds concurrency', async () => {
    let active = 0; let peak = 0;
    const geocoder = { geocode: vi.fn(async ({ location }) => {
      active += 1; peak = Math.max(peak, active);
      await Promise.resolve(); active -= 1;
      if (location.lat === 2) throw new Error('unavailable');
      return { results: [result()] };
    }) };
    const suggestions = await resolveCitySuggestions(Array.from({ length: 8 }, (_, i) => ({ visitId: String(i), lat: i, lng: 135 })), '', geocoder);
    expect(suggestions.cities).toHaveLength(1);
    expect(suggestions.placeCities['2']).toBeUndefined();
    expect(Object.keys(suggestions.placeCities)).toHaveLength(7);
    expect(peak).toBeLessThanOrEqual(3);
  });
  it('can suggest the destination when no itinerary coordinates exist', async () => {
    const geocoder = { geocode: vi.fn().mockResolvedValue({ results: [result()] }) };
    expect((await resolveCitySuggestions([], '京都', geocoder)).cities[0].cityId).toBe('kyoto');
    expect(geocoder.geocode).toHaveBeenCalledWith({ address: '京都' });
    expect(await resolveCitySuggestions([], '', null)).toEqual({ cities: [], placeCities: {} });
  });
});
