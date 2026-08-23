import { describe, expect, it, vi } from 'vitest';

import {
  buildDrivingRouteRequest,
  computeDrivingRouteOptimization,
  getOptimizedIntermediateOrder,
  getRouteLegMinutes,
  getRouteTotals,
} from './googleRoutes.js';

const points = [
  { lat: 26.2064, lng: 127.6462 },
  { lat: 26.2124, lng: 127.6809 },
  { lat: 26.5915, lng: 127.9774 },
];

describe('Google Routes API helpers', () => {
  it('builds a display request with ordered intermediate stops and a narrow field mask', () => {
    expect(buildDrivingRouteRequest(points, { includePath: true })).toEqual({
      origin: { lat: 26.2064, lng: 127.6462 },
      destination: { lat: 26.5915, lng: 127.9774 },
      intermediates: [{ location: { lat: 26.2124, lng: 127.6809 } }],
      travelMode: 'DRIVING',
      optimizeWaypointOrder: false,
      fields: ['path', 'legs'],
    });
  });

  it('requests the optimized waypoint order only for optimization calls', () => {
    const request = buildDrivingRouteRequest(points, { optimizeWaypointOrder: true });

    expect(request.optimizeWaypointOrder).toBe(true);
    expect(request.fields).toEqual(['legs', 'optimizedIntermediateWaypointIndices']);
  });

  it('converts millisecond route values into itinerary minutes and totals', () => {
    const route = {
      legs: [
        { durationMillis: 62000, distanceMeters: 1250 },
        { durationMillis: 118000, distanceMeters: 2750 },
      ],
    };

    expect(getRouteLegMinutes(route.legs[0])).toBe(1);
    expect(getRouteLegMinutes(route.legs[1])).toBe(2);
    expect(getRouteTotals(route)).toEqual({ minutes: 3, meters: 4000 });
  });

  it('accepts only a complete optimized waypoint permutation', () => {
    expect(getOptimizedIntermediateOrder({
      optimizedIntermediateWaypointIndices: [2, 0, 1],
    }, 3)).toEqual([2, 0, 1]);

    expect(getOptimizedIntermediateOrder({
      optimizedIntermediateWaypointIndices: [2, 2, 0],
    }, 3)).toEqual([0, 1, 2]);
  });

  it('computes current and optimized routes with the matching field masks', async () => {
    const currentRoute = { legs: [{ durationMillis: 180000 }] };
    const optimizedRoute = {
      legs: [{ durationMillis: 120000 }],
      optimizedIntermediateWaypointIndices: [0],
    };
    const Route = {
      computeRoutes: vi.fn()
        .mockResolvedValueOnce({ routes: [currentRoute] })
        .mockResolvedValueOnce({ routes: [optimizedRoute] }),
    };

    await expect(computeDrivingRouteOptimization(Route, points)).resolves.toEqual({
      currentRoute,
      optimizedRoute,
      order: [0],
    });
    expect(Route.computeRoutes).toHaveBeenNthCalledWith(1, expect.objectContaining({
      optimizeWaypointOrder: false,
      fields: ['legs'],
    }));
    expect(Route.computeRoutes).toHaveBeenNthCalledWith(2, expect.objectContaining({
      optimizeWaypointOrder: true,
      fields: ['legs', 'optimizedIntermediateWaypointIndices'],
    }));
  });
});
