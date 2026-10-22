const validPosition = (lat, lng) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export function cityFromResults(results = []) {
  const countryOf = (result) => result.address_components?.find((component) => component.types?.includes('country'));
  const taiwan = results.some((result) => countryOf(result)?.short_name === 'TW' || /台灣|臺灣|Taiwan/i.test(countryOf(result)?.long_name || ''));
  const levels = taiwan ? ['administrative_area_level_1', 'administrative_area_level_2'] : ['locality', 'postal_town'];
  for (const level of levels) {
    for (const result of results.filter((item) => item.types?.includes(level))) {
      const name = result.address_components?.find((component) => component.types?.includes(level))?.long_name;
      const country = countryOf(result)?.long_name;
      const cityLat = result.geometry?.location?.lat();
      const cityLng = result.geometry?.location?.lng();
      if (name && country && result.place_id && validPosition(cityLat, cityLng)) {
        return { cityId: result.place_id, city: name, country, cityLat, cityLng };
      }
    }
  }
  return null;
}

export async function resolveCitySuggestions(candidates, destination, geocoder) {
  const cities = new Map(); const placeCities = {};
  if (!geocoder) return { cities: [], placeCities };
  const locations = new Map();
  for (const place of candidates) {
    if (!validPosition(place.lat, place.lng)) continue;
    const key = `${place.lat},${place.lng}`;
    if (!locations.has(key)) locations.set(key, { request: { location: { lat: place.lat, lng: place.lng } }, ids: [] });
    locations.get(key).ids.push(place.visitId);
  }
  const requests = [...locations.values()];
  if (!requests.length && typeof destination === 'string' && destination.trim()) requests.push({ request: { address: destination }, ids: [] });
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(3, requests.length) }, async () => {
    while (index < requests.length) {
      const { request, ids } = requests[index++];
      try {
        const city = cityFromResults((await geocoder.geocode(request)).results);
        if (city) { cities.set(city.cityId, city); ids.forEach((id) => { placeCities[id] = city; }); }
      } catch { /* Suggestions are optional; unresolved places remain editable and saveable. */ }
    }
  }));
  return { cities: [...cities.values()].sort((a, b) => a.city.localeCompare(b.city, 'zh-Hant')), placeCities };
}
