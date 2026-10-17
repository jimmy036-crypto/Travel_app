import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useJournalRoute } from './useJournalRoute.js';
beforeEach(() => window.history.replaceState(null, '', '/'));
it('keeps view, city, search and return navigation in the URL', () => {
  const { result } = renderHook(() => useJournalRoute('alice'));
  act(() => result.current.navigate({ view: 'footprints', city: 'kyoto', query: '光' }));
  expect(new URLSearchParams(window.location.search).get('view')).toBe('footprints');
  expect(result.current.route.city).toBe('kyoto');
  const { result: reopened } = renderHook(() => useJournalRoute('alice'));
  expect(reopened.current.route.query).toBe('光');
  act(() => { window.history.replaceState(null, '', '/?view=memories&memory=trip'); window.dispatchEvent(new PopStateEvent('popstate')); });
  expect(result.current.route.memory).toBe('trip');
});
it('clears private selection on account switch', () => {
  window.history.replaceState(null, '', '/?view=memories&memory=alice-trip&q=private');
  const { result, rerender } = renderHook(({ uid }) => useJournalRoute(uid), { initialProps: { uid: 'alice' } });
  rerender({ uid: 'bob' });
  expect(result.current.route.memory).toBe('');
  expect(result.current.route.query).toBe('');
});
