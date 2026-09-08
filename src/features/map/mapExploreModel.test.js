import { describe, expect, it } from 'vitest';

import { createExploreSearchRequest, resolveExploreOrigin } from './mapExploreModel.js';

describe('map explore model', () => {
  it('resolves an anchored place from the current itinerary instead of retaining a stale object', () => {
    const places = [{ id: 'station', name: '更新後的台北車站', lat: 25.0478, lng: 121.517 }];
    const context = { scope: 'place', dayId: 'Day 1', placeId: 'station' };

    expect(resolveExploreOrigin({ context, dayId: 'Day 1', places })).toBe(places[0]);
    expect(resolveExploreOrigin({ context, dayId: 'Day 2', places })).toBeNull();
    expect(resolveExploreOrigin({ context, dayId: 'Day 1', places: [] })).toBeNull();
  });

  it('keeps every anchored category search on the selected place', () => {
    const origin = { id: 'station', lat: '25.0478', lng: 121.517 };

    for (const query of ['餐廳', '咖啡廳', '超市', '景點']) {
      expect(createExploreSearchRequest({
        query,
        scope: 'place',
        origin,
        bounds: { shouldNotBeUsed: true },
      })).toEqual({
        query,
        location: { lat: 25.0478, lng: 121.517 },
        radius: 1500,
      });
    }
  });

  it('uses map bounds for global exploration and never leaks an old anchor into it', () => {
    const bounds = { north: 25.1, south: 25 };
    expect(createExploreSearchRequest({
      query: '拉麵',
      scope: 'map',
      origin: { lat: 1, lng: 2 },
      bounds,
      center: { lat: 3, lng: 4 },
    })).toEqual({ query: '拉麵', bounds });
  });

  it('falls back to the map center and rejects an invalid anchored search', () => {
    expect(createExploreSearchRequest({
      query: '超市',
      scope: 'map',
      center: { lat: 25, lng: 121 },
    })).toEqual({
      query: '超市',
      location: { lat: 25, lng: 121 },
      radius: 2000,
    });
    expect(createExploreSearchRequest({
      query: '超市',
      scope: 'place',
      origin: { lat: '', lng: '' },
    })).toBeNull();
  });
});
