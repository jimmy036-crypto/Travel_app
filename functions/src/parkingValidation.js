import { CollaborationError, validateRoomId } from './domain.js';

export const PARKING_SEARCH_RADII = Object.freeze([300, 500, 1000]);

const fail = (message) => {
  throw new CollaborationError('invalid-argument', message);
};

const parseDayId = (value) => {
  if (typeof value !== 'string') fail('行程日期格式不正確。');
  const dayId = value.trim();
  if (!/^Day (?:[1-9]|[12]\d|30)$/.test(dayId)) fail('行程日期格式不正確。');
  return dayId;
};

const parsePlaceId = (value) => {
  if (typeof value !== 'string') fail('行程地點 ID 格式不正確。');
  const placeId = value.trim();
  const containsControlCharacter = [...placeId].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (!placeId || placeId.length > 200 || containsControlCharacter) {
    fail('行程地點 ID 格式不正確。');
  }
  return placeId;
};

const parseRadius = (value) => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) {
    fail('搜尋半徑格式不正確。');
  }
  const radius = Number(value);
  if (!PARKING_SEARCH_RADII.includes(radius)) {
    fail('搜尋半徑只支援 300、500 或 1000 公尺。');
  }
  return radius;
};

export const validateParkingSearchRequest = (data) => ({
  roomId: validateRoomId(data?.roomId),
  dayId: parseDayId(data?.dayId),
  placeId: parsePlaceId(data?.placeId),
  radius: parseRadius(data?.radius),
});
