import { useEffect, useMemo, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { resolveCitySuggestions } from './citySuggestions.js';

const EMPTY = { cities: [], placeCities: {} };
export function useCitySuggestions(candidates, destination, identity) {
  const library = useMapsLibrary('geocoding');
  const geocoding = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' ? window.__TRAVEL_E2E_DESTINATION_PLACES__ || library : library;
  const geocoder = useMemo(() => geocoding?.Geocoder ? new geocoding.Geocoder() : null, [geocoding]);
  const key = JSON.stringify([identity, destination, candidates.map(({ visitId, lat, lng }) => ({ visitId, lat, lng }))]);
  const [state, setState] = useState({ key: '', ...EMPTY });
  useEffect(() => {
    if (!geocoder) return undefined;
    let active = true;
    const [, address, places] = JSON.parse(key);
    resolveCitySuggestions(places, address, geocoder).then((result) => { if (active) setState({ key, ...result }); });
    return () => { active = false; };
  }, [key, geocoder]);
  return { ...(state.key === key ? state : EMPTY), loading: Boolean(geocoder && state.key !== key) };
}
