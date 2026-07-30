import { describe, expect, it } from 'vitest';

import {
  buildMapItineraryEntries,
  getRouteDisplayState,
  getValidMapEntries,
} from './mapItineraryModel.js';

describe('map itinerary model', () => {
  it('preserves itinerary numbering while excluding invalid coordinates from markers', () => {
    const entries = buildMapItineraryEntries([
      { id: 'a', name: 'A', lat: 25.03, lng: 121.56 },
      { id: 'b', name: 'B', lat: '', lng: '' },
      { id: 'c', name: 'C', lat: 25.04, lng: 121.57 },
    ]);

    expect(entries.map((entry) => [entry.id, entry.order, entry.hasCoordinates])).toEqual([
      ['a', 1, true],
      ['b', 2, false],
      ['c', 3, true],
    ]);
    expect(getValidMapEntries(entries).map((entry) => entry.order)).toEqual([1, 3]);
  });

  it('reports route loading and partial failures without fabricating route data', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(getRouteDisplayState(items, [])).toEqual({
      state: 'loading',
      message: '正在計算本日路線…',
    });
    expect(getRouteDisplayState(items, [{ mode: 'ERROR' }])).toEqual({
      state: 'partial',
      message: '部分路段無法計算，仍顯示可定位景點。',
    });
  });
});
