import { createParkingFacility, haversineMeters } from './parkingFacilityModel.js';

export const normalizeParkingIdentityText = (value) => String(value || '')
  .normalize('NFKC').toLowerCase()
  .replace(/停車場|parking|car\s*park/gi, '')
  .replace(/[^\p{L}\p{N}]/gu, '');

export function getParkingMatchConfidence(google, provider) {
  if (google?.providerFacilityId && google.providerFacilityId === provider?.providerFacilityId) return 'high';
  if (provider?.googlePlaceId && provider.googlePlaceId === google?.googlePlaceId) return 'high';
  const distance = haversineMeters(google?.location, provider?.location);
  const nameA = normalizeParkingIdentityText(google?.name);
  const nameB = normalizeParkingIdentityText(provider?.name);
  const addressA = normalizeParkingIdentityText(google?.address);
  const addressB = normalizeParkingIdentityText(provider?.address);
  const nameMatches = nameA.length >= 3 && nameB.length >= 3 && (nameA.includes(nameB) || nameB.includes(nameA));
  const addressMatches = addressA.length >= 5 && addressB.length >= 5 && (addressA.includes(addressB) || addressB.includes(addressA));
  if (distance !== null && distance <= 40 && nameMatches && addressMatches) return 'high';
  if (distance !== null && distance <= 80 && (nameMatches || addressMatches)) return 'medium';
  return 'low';
}

export function mergeParkingProviders(googleFacilities = [], providerFacilities = []) {
  const unused = new Set(providerFacilities.map((_, index) => index));
  const merged = googleFacilities.map((google) => {
    let best = null;
    unused.forEach((index) => {
      const provider = providerFacilities[index];
      const confidence = getParkingMatchConfidence(google, provider);
      const priority = { high: 3, medium: 2, low: 1 }[confidence];
      const distance = haversineMeters(google.location, provider.location) ?? Infinity;
      if (!best || priority > best.priority || (priority === best.priority && distance < best.distance)) {
        best = { index, provider, confidence, priority, distance };
      }
    });
    if (!best || best.confidence === 'low') return google;
    unused.delete(best.index);
    const official = best.provider;
    return createParkingFacility({
      ...google,
      id: `${google.id}+${official.id}`,
      provider: 'google+tdx',
      providerFacilityId: official.providerFacilityId,
      name: official.name,
      address: official.address,
      location: official.location,
      distanceToDestinationMeters: google.distanceToDestinationMeters,
      tariff: official.tariff,
      availability: official.availability,
      restrictions: official.restrictions,
      source: official.source,
      matchConfidence: best.confidence,
    });
  });
  unused.forEach((index) => merged.push(providerFacilities[index]));
  return merged;
}
