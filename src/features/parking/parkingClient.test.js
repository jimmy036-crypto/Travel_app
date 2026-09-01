import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseMocks = vi.hoisted(() => ({
  callable: vi.fn(),
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: firebaseMocks.httpsCallable,
}));

vi.mock('../../firebase.js', () => ({
  functions: { app: 'default-functions' },
}));

import {
  clearParkingSessionCacheForTest,
  searchNearbyParking,
} from './parkingClient.js';

const anchor = { lat: 25.033, lng: 121.5654 };
const emptyPlaces = {
  Place: {
    searchNearby: vi.fn().mockResolvedValue({ places: [] }),
  },
};

const tdxFacility = (id = 'T1') => ({
  id: `tdx:${id}`,
  provider: 'tdx',
  providerFacilityId: id,
  name: '官方停車場',
  address: '台北市信義區',
  location: { lat: 25.0331, lng: 121.5655 },
  tariff: { currency: 'TWD', rawText: '每小時 60 元' },
  availability: { status: 'available', availableSpaces: 8, totalSpaces: 20 },
  source: { label: 'TDX', fetchedAt: '2026-09-01T00:00:00Z' },
});

describe('searchNearbyParking protected provider boundary', () => {
  beforeEach(() => {
    clearParkingSessionCacheForTest();
    emptyPlaces.Place.searchNearby.mockClear();
    firebaseMocks.callable.mockReset();
    firebaseMocks.httpsCallable.mockReset();
    firebaseMocks.httpsCallable.mockReturnValue(firebaseMocks.callable);
  });

  it('sends the room and validated search shape through the Firebase callable', async () => {
    firebaseMocks.callable.mockResolvedValue({
      data: { providerStatus: 'ok', facilities: [tdxFacility()] },
    });

    const result = await searchNearbyParking({
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-1',
      anchor,
      radius: 500,
      placesLib: emptyPlaces,
    });

    expect(firebaseMocks.httpsCallable).toHaveBeenCalledWith(
      { app: 'default-functions' },
      'searchParking',
    );
    expect(firebaseMocks.callable).toHaveBeenCalledWith({
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-1',
      radius: 500,
    });
    expect(result).toMatchObject({
      googleStatus: 'ok',
      tdxStatus: 'ok',
      facilities: [{ providerFacilityId: 'T1', tariff: { hourlyEquivalent: 60 } }],
    });
  });

  it('does not invoke the protected provider for the local example trip', async () => {
    await expect(searchNearbyParking({
      roomId: '',
      dayId: 'Day 1',
      placeId: 'place-1',
      anchor,
      radius: 500,
      placesLib: emptyPlaces,
    })).resolves.toMatchObject({
      googleStatus: 'ok',
      tdxStatus: 'not_available_for_local_trip',
    });

    expect(firebaseMocks.httpsCallable).not.toHaveBeenCalled();
  });

  it.each([
    ['functions/resource-exhausted', 'rate_limited'],
    ['functions/permission-denied', 'access_denied'],
    ['functions/unavailable', 'unavailable'],
  ])('degrades callable %s without hiding Google results', async (code, status) => {
    firebaseMocks.callable.mockRejectedValue({ code });
    const placesLib = {
      Place: {
        searchNearby: vi.fn().mockResolvedValue({
          places: [{
            id: 'google-1',
            displayName: 'Google 停車場',
            location: anchor,
          }],
        }),
      },
    };

    await expect(searchNearbyParking({
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-1',
      anchor,
      radius: 500,
      placesLib,
    })).resolves.toMatchObject({
      googleStatus: 'ok',
      tdxStatus: status,
      facilities: [{ googlePlaceId: 'google-1' }],
    });
  });

  it('does not cache access failures across account or membership changes', async () => {
    firebaseMocks.callable
      .mockRejectedValueOnce({ code: 'functions/permission-denied' })
      .mockResolvedValueOnce({
        data: { providerStatus: 'ok', facilities: [tdxFacility()] },
      });
    const request = {
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-1',
      anchor,
      radius: 500,
      placesLib: emptyPlaces,
    };

    await expect(searchNearbyParking(request)).resolves.toMatchObject({
      tdxStatus: 'access_denied',
      cacheHit: false,
    });
    await expect(searchNearbyParking(request)).resolves.toMatchObject({
      tdxStatus: 'ok',
      cacheHit: false,
    });
    expect(firebaseMocks.callable).toHaveBeenCalledTimes(2);
  });

  it('uses a two-minute room-scoped session cache', async () => {
    firebaseMocks.callable.mockResolvedValue({
      data: { providerStatus: 'ok', facilities: [tdxFacility()] },
    });

    const request = {
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-1',
      anchor,
      radius: 500,
      placesLib: emptyPlaces,
    };
    const first = await searchNearbyParking(request);
    const second = await searchNearbyParking(request);
    await searchNearbyParking({ ...request, roomId: 'room-2' });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(firebaseMocks.callable).toHaveBeenCalledTimes(2);
  });

  it('bounds the session cache instead of retaining arbitrary coordinate searches', async () => {
    firebaseMocks.callable.mockResolvedValue({
      data: { providerStatus: 'ok', facilities: [] },
    });

    for (let index = 0; index < 21; index += 1) {
      await searchNearbyParking({
        roomId: 'room-1',
        dayId: 'Day 1',
        placeId: `place-${index}`,
        anchor: { lat: anchor.lat + (index / 1000), lng: anchor.lng },
        radius: 500,
        placesLib: emptyPlaces,
      });
    }
    await searchNearbyParking({
      roomId: 'room-1',
      dayId: 'Day 1',
      placeId: 'place-0',
      anchor,
      radius: 500,
      placesLib: emptyPlaces,
    });

    expect(firebaseMocks.callable).toHaveBeenCalledTimes(22);
  });
});
