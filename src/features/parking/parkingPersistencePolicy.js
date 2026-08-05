const textOrNull = (value) => String(value || '').trim() || null;

export function sanitizeParkingPlan(facility, now = new Date().toISOString()) {
  if (!facility || typeof facility !== 'object') return null;
  const googleOnly = facility.provider === 'google';
  const base = {
    schemaVersion: 1,
    provider: textOrNull(facility.provider) || 'unknown',
    providerFacilityId: textOrNull(facility.providerFacilityId),
    googlePlaceId: textOrNull(facility.googlePlaceId),
    selectedAt: now,
    refreshedAt: now,
  };
  if (googleOnly) return base;
  return {
    ...base,
    name: textOrNull(facility.name),
    address: textOrNull(facility.address),
    location: Number.isFinite(Number(facility.location?.lat)) && Number.isFinite(Number(facility.location?.lng))
      ? { lat: Number(facility.location.lat), lng: Number(facility.location.lng) }
      : null,
    walkingDistanceMeters: Number.isFinite(Number(facility.distanceToDestinationMeters)) ? Number(facility.distanceToDestinationMeters) : null,
    walkingMinutes: Number.isFinite(Number(facility.walkingMinutes)) ? Number(facility.walkingMinutes) : null,
    tariffSnapshot: {
      currency: textOrNull(facility.tariff?.currency),
      rawText: textOrNull(facility.tariff?.rawText),
      hourlyEquivalent: Number.isFinite(Number(facility.tariff?.hourlyEquivalent)) ? Number(facility.tariff.hourlyEquivalent) : null,
      maximumPrice: facility.tariff?.rules?.find((rule) => rule.type === 'maximum')?.maximumPrice ?? null,
      maximumLabel: facility.tariff?.rules?.find((rule) => rule.type === 'maximum')?.maximumPeriod ?? null,
      confidence: textOrNull(facility.tariff?.confidence) || 'unknown',
      capturedAt: now,
    },
    availabilitySnapshot: {
      status: textOrNull(facility.availability?.status) || 'unknown',
      availableSpaces: Number.isFinite(Number(facility.availability?.availableSpaces)) ? Number(facility.availability.availableSpaces) : null,
      totalSpaces: Number.isFinite(Number(facility.availability?.totalSpaces)) ? Number(facility.availability.totalSpaces) : null,
      capturedAt: now,
    },
    source: {
      label: textOrNull(facility.source?.label),
      providerUpdatedAt: textOrNull(facility.source?.providerUpdatedAt),
    },
  };
}

export function updatePlaceParkingPlan(itinerary, dayId, placeId, parkingPlan) {
  const list = Array.isArray(itinerary?.[dayId]) ? itinerary[dayId] : [];
  return {
    ...itinerary,
    [dayId]: list.map((place) => {
      if (String(place?.id) !== String(placeId)) return place;
      if (parkingPlan === null) {
        const { parkingPlan: _removed, ...rest } = place;
        return rest;
      }
      return { ...place, parkingPlan };
    }),
  };
}
