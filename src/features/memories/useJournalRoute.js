import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const VIEWS = new Set(['trips', 'memories', 'footprints', 'collections']);
const KEYS = { view: 'view', memory: 'memory', city: 'city', year: 'year', highlight: 'highlight', photo: 'photo', collection: 'collection', query: 'q' };
const EMPTY = { view: 'trips', memory: '', city: '', year: '', highlight: '', photo: '', collection: '', query: '' };
export function readJournalRoute(search = window.location.search) {
  const params = new URLSearchParams(search);
  const route = Object.fromEntries(Object.entries(KEYS).map(([key, param]) => [key, (params.get(param) || '').slice(0, 300)]));
  route.view = VIEWS.has(route.view) ? route.view : 'trips';
  return route;
}
function writeJournalRoute(route, replace) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, param] of Object.entries(KEYS)) {
    if (route[key] && !(key === 'view' && route[key] === 'trips')) params.set(param, route[key]);
    else params.delete(param);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
}
export function useJournalRoute(uid) {
  const [state, setState] = useState(() => ({ uid, route: readJournalRoute() }));
  const previousUid = useRef(uid);
  if (state.uid !== uid) setState({ uid, route: state.uid ? EMPTY : state.route });
  const navigate = useCallback((patch, { replace = false } = {}) => {
    const route = { ...readJournalRoute(), ...patch };
    writeJournalRoute(route, replace);
    setState({ uid, route });
  }, [uid]);
  useLayoutEffect(() => {
    const previous = previousUid.current;
    previousUid.current = uid;
    if (previous && previous !== uid) writeJournalRoute(EMPTY, true);
  }, [uid]);
  useEffect(() => {
    const update = () => setState({ uid, route: readJournalRoute() });
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, [uid]);
  return { route: state.uid === uid ? state.route : EMPTY, navigate };
}
