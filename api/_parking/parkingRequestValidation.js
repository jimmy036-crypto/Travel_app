export const ALLOWED_RADII = Object.freeze([300, 500, 1000]);

export function validateParkingSearchQuery(query = {}) {
  const lat = Number(query.lat);
  const lng = Number(query.lng);
  const radius = Number(query.radius);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new TypeError('lat must be between -90 and 90.');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new TypeError('lng must be between -180 and 180.');
  if (!ALLOWED_RADII.includes(radius)) throw new TypeError('radius must be 300, 500, or 1000.');
  return { lat, lng, radius };
}
