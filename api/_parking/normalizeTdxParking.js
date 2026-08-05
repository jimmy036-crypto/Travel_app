const text = (value) => String(value ?? '').trim();
const numberOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const nameText = (value) => text(value?.Zh_tw || value?.En || value);

export function normalizeTdxPayload({ carParks = [], rates = [], availabilities = [], fetchedAt }) {
  const rateById = new Map(rates.map((rate) => [text(rate.CarParkID), rate]));
  const availabilityById = new Map(availabilities.map((availability) => [text(availability.CarParkID), availability]));
  return carParks.map((carPark) => {
    const id = text(carPark.CarParkID);
    const rate = rateById.get(id);
    const availability = availabilityById.get(id);
    const availableSpaces = numberOrNull(availability?.AvailableSpaces ?? availability?.Availabilities?.[0]?.AvailableSpaces);
    const totalSpaces = numberOrNull(availability?.TotalSpaces ?? carPark.TotalSpaces);
    const providerUpdatedAt = availability?.SrcUpdateTime || availability?.UpdateTime || rate?.UpdateTime || carPark.UpdateTime || null;
    const rawText = text(carPark.FareDescription || rate?.FareDescription || rate?.Description) || null;
    const serviceStatus = Number(availability?.ServiceStatus);
    return {
      id: `tdx:${id}`,
      provider: 'tdx',
      providerFacilityId: id,
      googlePlaceId: null,
      name: nameText(carPark.CarParkName) || 'TDX 官方停車場',
      address: text(carPark.Address) || null,
      location: {
        lat: numberOrNull(carPark.CarParkPosition?.PositionLat),
        lng: numberOrNull(carPark.CarParkPosition?.PositionLon),
      },
      opening: { isOpen: serviceStatus === 1 ? true : null, text: serviceStatus === 1 ? '營業中' : '營業狀態未知' },
      availability: {
        status: availableSpaces === null ? 'unknown' : (availableSpaces > 0 ? 'available' : 'full'),
        availableSpaces,
        totalSpaces,
        updatedAt: providerUpdatedAt,
        confidence: availableSpaces === null ? 'unknown' : 'high',
      },
      tariff: {
        currency: rawText ? 'TWD' : null,
        rawText,
        rules: [],
        hourlyEquivalent: null,
        displaySummary: rawText || '費率資料未提供',
        confidence: rawText ? 'official_raw' : 'unknown',
        updatedAt: rate?.UpdateTime || carPark.UpdateTime || null,
      },
      restrictions: {
        vehicleType: 'car',
        maxHeightMeters: numberOrNull(carPark.MaximumVehicleHeight),
        reservation: carPark.ReservationAvailable === 1 ? true : null,
        evCharging: carPark.EVRechargingAvailable === 1 ? true : null,
      },
      source: {
        label: 'TDX 運輸資料流通服務',
        url: 'https://tdx.transportdata.tw/',
        providerUpdatedAt,
        fetchedAt,
      },
      navigationUrl: null,
      matchConfidence: 'official',
    };
  }).filter((facility) => facility.providerFacilityId && facility.location.lat !== null && facility.location.lng !== null);
}
