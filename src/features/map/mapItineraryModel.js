import { isValidCoordinates } from '../../helpers.js';

export function buildMapItineraryEntries(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const hasCoordinates = isValidCoordinates(item?.lat, item?.lng);
    const lat = Number(item?.lat);
    const lng = Number(item?.lng);

    return {
      id: String(item?.id || item?.place_id || `place-${index + 1}`),
      order: index + 1,
      item,
      name: String(item?.customName || item?.name || '未命名景點'),
      time: String(item?.time || ''),
      photoUrl: String(item?.placePhoto?.url || ''),
      hasCoordinates,
      position: hasCoordinates ? { lat, lng } : null,
    };
  });
}

export function getValidMapEntries(entries) {
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry?.hasCoordinates && entry?.position,
  );
}

export function getRouteDisplayState(items, durations) {
  const dayItems = Array.isArray(items) ? items : [];
  if (dayItems.length < 2) return { state: 'idle', message: '' };

  const legs = Array.isArray(durations) ? durations : [];
  if (legs.length === 0) {
    return { state: 'loading', message: '正在計算本日路線…' };
  }

  if (legs.some((leg) => String(leg?.mode || '').toUpperCase() === 'ERROR')) {
    return {
      state: 'partial',
      message: '部分路段無法計算，仍顯示可定位景點。',
    };
  }

  return { state: 'ready', message: '' };
}
