const finiteOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const haversineMeters = (from, to) => {
  const lat1 = finiteOrNull(from?.lat);
  const lng1 = finiteOrNull(from?.lng);
  const lat2 = finiteOrNull(to?.lat);
  const lng2 = finiteOrNull(to?.lng);
  if ([lat1, lng1, lat2, lng2].some((value) => value === null)) return null;
  const radians = (degrees) => degrees * (Math.PI / 180);
  const dLat = radians(lat2 - lat1);
  const dLng = radians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
};

export const buildGoogleMapsNavigationUrl = ({ googlePlaceId, location }) => {
  const id = String(googlePlaceId || '').trim();
  const lat = finiteOrNull(location?.lat);
  const lng = finiteOrNull(location?.lng);
  const destination = id
    ? `place_id:${id}`
    : (lat !== null && lng !== null ? `${lat},${lng}` : '');
  return destination
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
    : null;
};

export const createParkingFacility = (input = {}) => {
  const provider = String(input.provider || 'unknown');
  const location = {
    lat: finiteOrNull(input.location?.lat),
    lng: finiteOrNull(input.location?.lng),
  };
  const distance = finiteOrNull(input.distanceToDestinationMeters);
  return {
    id: String(input.id || `${provider}:${input.providerFacilityId || input.googlePlaceId || 'unknown'}`),
    provider,
    providerFacilityId: input.providerFacilityId ? String(input.providerFacilityId) : null,
    googlePlaceId: input.googlePlaceId ? String(input.googlePlaceId) : null,
    name: String(input.name || '未命名停車場'),
    address: input.address ? String(input.address) : null,
    location,
    distanceToDestinationMeters: distance,
    walkingMinutes: finiteOrNull(input.walkingMinutes)
      ?? (distance === null ? null : Math.max(1, Math.ceil(distance / 80))),
    opening: {
      isOpen: typeof input.opening?.isOpen === 'boolean' ? input.opening.isOpen : null,
      text: input.opening?.text ? String(input.opening.text) : '營業狀態未知',
    },
    availability: {
      status: String(input.availability?.status || 'unknown'),
      availableSpaces: finiteOrNull(input.availability?.availableSpaces),
      totalSpaces: finiteOrNull(input.availability?.totalSpaces),
      updatedAt: input.availability?.updatedAt ? String(input.availability.updatedAt) : null,
      confidence: String(input.availability?.confidence || 'unknown'),
    },
    tariff: {
      currency: input.tariff?.currency ? String(input.tariff.currency) : null,
      rawText: input.tariff?.rawText ? String(input.tariff.rawText) : null,
      rules: Array.isArray(input.tariff?.rules) ? input.tariff.rules : [],
      hourlyEquivalent: finiteOrNull(input.tariff?.hourlyEquivalent),
      displaySummary: String(input.tariff?.displaySummary || '費率資料未提供'),
      confidence: String(input.tariff?.confidence || 'unknown'),
      updatedAt: input.tariff?.updatedAt ? String(input.tariff.updatedAt) : null,
    },
    restrictions: {
      vehicleType: 'car',
      maxHeightMeters: finiteOrNull(input.restrictions?.maxHeightMeters),
      reservation: input.restrictions?.reservation ?? null,
      evCharging: input.restrictions?.evCharging ?? null,
    },
    source: {
      label: String(input.source?.label || provider),
      url: input.source?.url ? String(input.source.url) : null,
      providerUpdatedAt: input.source?.providerUpdatedAt ? String(input.source.providerUpdatedAt) : null,
      fetchedAt: input.source?.fetchedAt ? String(input.source.fetchedAt) : null,
    },
    navigationUrl: input.navigationUrl
      || buildGoogleMapsNavigationUrl({ googlePlaceId: input.googlePlaceId, location }),
    matchConfidence: String(input.matchConfidence || 'unknown'),
  };
};

export const normalizeGoogleParkingPlace = async (place, anchor) => {
  const lat = typeof place?.location?.lat === 'function' ? place.location.lat() : place?.location?.lat;
  const lng = typeof place?.location?.lng === 'function' ? place.location.lng() : place?.location?.lng;
  const location = { lat: finiteOrNull(lat), lng: finiteOrNull(lng) };
  let isOpen = null;
  try {
    if (typeof place?.isOpen === 'function') isOpen = await place.isOpen();
  } catch {
    isOpen = null;
  }
  return createParkingFacility({
    id: `google:${place?.id}`,
    provider: 'google',
    googlePlaceId: place?.id,
    name: place?.displayName || 'Google Maps 停車場',
    address: place?.formattedAddress,
    location,
    distanceToDestinationMeters: haversineMeters(anchor, location),
    opening: { isOpen, text: isOpen === true ? '營業中' : (isOpen === false ? '已關閉' : '營業狀態未知') },
    source: {
      label: 'Google Maps',
      url: place?.googleMapsURI || null,
      fetchedAt: new Date().toISOString(),
    },
    navigationUrl: buildGoogleMapsNavigationUrl({ googlePlaceId: place?.id, location }),
  });
};
