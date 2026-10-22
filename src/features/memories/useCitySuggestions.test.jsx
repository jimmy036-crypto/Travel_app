import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { useCitySuggestions } from './useCitySuggestions.js';
const geocode = vi.hoisted(() => vi.fn());
const library = { Geocoder: class { geocode = geocode; } };
vi.mock('@vis.gl/react-google-maps', () => ({ useMapsLibrary: () => library }));
const result = (id) => ({ results: [{ place_id: id, types: ['locality'], address_components: [{ long_name: id, types: ['locality'] }, { long_name: '日本', types: ['country'] }], geometry: { location: { lat: () => 35, lng: () => 135 } } }] });
it('does not publish results from the previous trip/account after a late response', async () => {
  let finishFirst;
  geocode.mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; })).mockResolvedValueOnce(result('osaka'));
  const { result: state, rerender } = renderHook(({ identity }) => useCitySuggestions([], '京都', identity), { initialProps: { identity: 'alice:first' } });
  rerender({ identity: 'bob:second' });
  await waitFor(() => expect(state.current.cities[0]?.cityId).toBe('osaka'));
  await act(async () => finishFirst(result('kyoto')));
  expect(state.current.cities.map((city) => city.cityId)).toEqual(['osaka']);
});
