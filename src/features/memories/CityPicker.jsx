import React, { useEffect, useId, useRef, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';
import { useDestinationPredictions } from '../../hooks/useDestinationPredictions.js';

const IS_FIREBASE_EMULATOR = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';
const CITY_TYPES = Object.freeze(['(cities)']);

export function CityPicker({ value = {}, onChange, cities = [], label = '城市／地區', disabled = false, inputRef, invalid = false }) {
  const lib = useMapsLibrary('places');
  const placesLibrary = IS_FIREBASE_EMULATOR ? window.__TRAVEL_E2E_DESTINATION_PLACES__ || lib : lib;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(0);
  const listId = useId();
  const { suggestions, status, clearPredictions, finishSession } = useDestinationPredictions({ input: value.cityId ? '' : value.city || '', placesLibrary, includedPrimaryTypes: CITY_TYPES });
  useEffect(() => () => { request.current += 1; }, []);
  const known = cities.filter((city, index, all) => city.cityId && all.findIndex((item) => item.cityId === city.cityId) === index
    && (!value.city || `${city.city} ${city.country || ''}`.toLocaleLowerCase().includes(value.city.toLocaleLowerCase())));
  const options = [
    ...known.map((city) => ({ key: city.cityId, label: [city.city, city.country].filter(Boolean).join('・'), city })),
    ...suggestions.filter((prediction) => !known.some((city) => city.cityId === prediction.placeId)).map((prediction) => ({ key: prediction.placeId, label: String(prediction.text), prediction })),
  ];
  const visible = open && options.length > 0;
  const select = async (option) => {
    request.current += 1;
    const requestId = request.current;
    setError(''); setOpen(false); setPending(false); clearPredictions(); finishSession();
    if (option.city) {
      const city = option.city;
      onChange({ city: city.city, cityId: city.cityId, country: city.country || '', cityLat: city.cityLat ?? city.lat ?? null, cityLng: city.cityLng ?? city.lng ?? null });
      return;
    }
    setPending(true);
    try {
      const place = option.prediction.toPlace();
      await place.fetchFields({ fields: ['location', 'addressComponents', 'displayName'] });
      if (requestId !== request.current) return;
      const country = place.addressComponents?.find((component) => component.types?.includes('country'))?.longText;
      const cityLat = place.location?.lat();
      const cityLng = place.location?.lng();
      if (!country || !Number.isFinite(cityLat) || !Number.isFinite(cityLng)) throw new Error('missing city details');
      onChange({ cityId: option.prediction.placeId, city: place.displayName || option.label, country, cityLat, cityLng });
    } catch {
      if (requestId === request.current) setError('無法取得城市資料，請重新選擇。');
    } finally { if (requestId === request.current) setPending(false); }
  };
  return <div className="journal-city-picker">
    <label className="journal-field">{label}<input
      ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={listId}
      aria-activedescendant={visible ? `${listId}-${Math.min(active, options.length - 1)}` : undefined}
      aria-invalid={invalid || undefined} disabled={disabled} maxLength={120} value={value.city || ''}
      onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onChange={(event) => {
        request.current += 1; setPending(false); setError(''); setOpen(true); setActive(0);
        onChange({ city: event.target.value, cityId: '', country: '', cityLat: null, cityLng: null });
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) { event.preventDefault(); setOpen(false); }
        if (visible && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
          event.preventDefault(); setActive((previous) => (previous + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
        }
        if (event.key === 'Enter' && visible) { event.preventDefault(); void select(options[Math.min(active, options.length - 1)]); }
      }} placeholder="搜尋並選擇城市" />
    </label>
    {visible ? <ul role="listbox" id={listId} className="journal-city-options">{options.map((option, index) => <li key={option.key}>
      <button type="button" id={`${listId}-${index}`} role="option" aria-selected={index === active} className="journal-city-option" onMouseDown={(event) => event.preventDefault()} onClick={() => void select(option)}>{option.label}</button>
    </li>)}</ul> : null}
    {pending ? <p role="status">正在取得城市資料…</p> : null}
    {error ? <p role="alert" className="journal-error">{error}</p> : null}
    {!value.cityId && value.city ? <p className="text-xs opacity-75">尚未指定城市，請選擇搜尋結果或你用過的城市。</p> : null}
    {open && status === 'error' ? <p role="status">城市搜尋暫時無法使用，可以選擇你用過的城市。</p> : null}
    {open && status === 'empty' && !known.length ? <p role="status">找不到城市，請試著加上國家名稱。</p> : null}
  </div>;
}
