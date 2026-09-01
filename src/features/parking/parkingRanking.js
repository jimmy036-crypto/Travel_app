const freshnessScore = (value) => {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, 1 - ((Date.now() - timestamp) / (6 * 60 * 60 * 1000)));
};

export function scoreParkingFacility(facility) {
  const distance = Number(facility?.distanceToDestinationMeters);
  const distanceScore = Number.isFinite(distance) ? Math.max(0, 1 - distance / 1000) : 0;
  const openingScore = facility?.opening?.isOpen === true ? 1 : (facility?.opening?.isOpen === false ? 0 : 0.4);
  const availabilityScore = facility?.availability?.availableSpaces > 0
    ? 1 : (facility?.availability?.status === 'full' ? 0 : 0.4);
  const tariffScore = facility?.tariff?.confidence === 'high' ? 1 : (facility?.tariff?.rawText ? 0.5 : 0);
  const capScore = facility?.tariff?.rules?.some((rule) => rule.type === 'maximum') ? 1 : 0;
  return (distanceScore * 0.30) + (openingScore * 0.20) + (availabilityScore * 0.20)
    + (tariffScore * 0.15) + (capScore * 0.10)
    + (freshnessScore(facility?.source?.providerUpdatedAt || facility?.source?.fetchedAt) * 0.05);
}

export function sortParkingFacilities(facilities, sort = 'best') {
  const list = [...(Array.isArray(facilities) ? facilities : [])];
  if (sort === 'distance') return list.sort((a, b) => (a.distanceToDestinationMeters ?? Infinity) - (b.distanceToDestinationMeters ?? Infinity));
  if (sort === 'availability') return list.sort((a, b) => (b.availability?.availableSpaces ?? -1) - (a.availability?.availableSpaces ?? -1));
  if (sort === 'tariff') return list.sort((a, b) => Number(Boolean(b.tariff?.rawText)) - Number(Boolean(a.tariff?.rawText)));
  return list.sort((a, b) => scoreParkingFacility(b) - scoreParkingFacility(a));
}
