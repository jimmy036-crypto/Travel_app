import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mapsMocks = vi.hoisted(() => ({
  map: { id: 'main-map' },
  routesLibrary: null,
}));

vi.mock('@vis.gl/react-google-maps', () => ({
  useMap: () => mapsMocks.map,
  useMapsLibrary: (name) => (name === 'routes' ? mapsMocks.routesLibrary : null),
}));

import { Directions } from './UIComponents.jsx';

const itinerary = {
  'Day 1': [
    { lat: 26.2064, lng: 127.6462, nextLeg: { mode: 'AUTO' } },
    { lat: 26.2124, lng: 127.6809, nextLeg: { mode: 'AUTO' } },
    { lat: 26.5915, lng: 127.9774, nextLeg: { mode: 'AUTO' } },
  ],
};

describe('Directions', () => {
  beforeEach(() => {
    mapsMocks.routesLibrary = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('computes and renders an ordered whole-day route with the new Route class', async () => {
    const setMap = vi.fn();
    const route = {
      legs: [{ durationMillis: 15 * 60000 }, { durationMillis: 35 * 60000 }],
      createPolylines: vi.fn(() => [{ setMap }]),
    };
    const computeRoutes = vi.fn().mockResolvedValue({ routes: [route] });
    mapsMocks.routesLibrary = { Route: { computeRoutes } };
    const onRouteCalculated = vi.fn();

    const view = render(
      <Directions itinerary={itinerary} dayId="Day 1" onRouteCalculated={onRouteCalculated} />,
    );

    await waitFor(() => expect(onRouteCalculated).toHaveBeenCalledWith('Day 1', [
      { text: '15 分鐘', value: 15, mode: 'AUTO' },
      { text: '35 分鐘', value: 35, mode: 'AUTO' },
    ]));
    expect(computeRoutes).toHaveBeenCalledWith(expect.objectContaining({
      intermediates: [{ location: { lat: 26.2124, lng: 127.6809 } }],
      travelMode: 'DRIVING',
      fields: ['path', 'legs'],
    }));
    expect(route.createPolylines).toHaveBeenCalledOnce();
    expect(setMap).toHaveBeenCalledWith(mapsMocks.map);

    view.unmount();
    expect(setMap).toHaveBeenLastCalledWith(null);
  });

  it('falls back to individual legs and preserves partial failures', async () => {
    const successfulRoute = {
      legs: [{ durationMillis: 12 * 60000 }],
      createPolylines: vi.fn(() => [{ setMap: vi.fn() }]),
    };
    const computeRoutes = vi.fn()
      .mockRejectedValueOnce(new Error('whole day denied'))
      .mockResolvedValueOnce({ routes: [successfulRoute] })
      .mockRejectedValueOnce(new Error('leg unavailable'));
    mapsMocks.routesLibrary = { Route: { computeRoutes } };
    const onRouteCalculated = vi.fn();

    render(<Directions itinerary={itinerary} dayId="Day 1" onRouteCalculated={onRouteCalculated} />);

    await waitFor(() => expect(onRouteCalculated).toHaveBeenCalledWith('Day 1', [
      { text: '12 分鐘', value: 12, mode: 'AUTO' },
      { text: '無法計算', value: 30, mode: 'ERROR' },
    ]));
    expect(computeRoutes).toHaveBeenCalledTimes(3);
  });
});
