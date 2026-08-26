import { extractRoomId, parseDateOnlyLocal } from '../../helpers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function toLocalDateKey(value) {
  const date = value instanceof Date
    ? value
    : parseDateOnlyLocal(value);

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toCalendarDayIndex(date) {
  return Math.floor(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ) / DAY_MS);
}

function normalizeCandidate(trip, index, todayIndex) {
  if (!trip || typeof trip !== 'object') return null;

  let roomId = '';
  try {
    roomId = extractRoomId(trip.roomId);
  } catch {
    return null;
  }
  if (!roomId) return null;

  const startDate = String(trip.startDate || '').trim();
  const endDate = String(trip.endDate || '').trim();
  const start = parseDateOnlyLocal(startDate);
  const end = parseDateOnlyLocal(endDate);
  if (!start || !end) return null;

  const startIndex = toCalendarDayIndex(start);
  const endIndex = toCalendarDayIndex(end);
  if (endIndex < startIndex || endIndex < todayIndex) return null;
  const durationDays = (endIndex - startIndex) + 1;
  if (durationDays > 30) return null;

  const timing = startIndex <= todayIndex ? 'ongoing' : 'upcoming';

  return {
    roomId,
    timing,
    title: String(trip.title || '').trim() || '未命名旅程',
    destination: String(trip.destination || '').trim() || '主要地點未設定',
    startDate,
    endDate,
    durationDays,
    daysUntil: Math.max(0, startIndex - todayIndex),
    currentDay: timing === 'ongoing' ? (todayIndex - startIndex) + 1 : null,
    startIndex,
    endIndex,
    originalIndex: index,
  };
}

function compareCandidates(left, right) {
  if (left.timing !== right.timing) return left.timing === 'ongoing' ? -1 : 1;

  if (left.timing === 'ongoing') {
    if (left.endIndex !== right.endIndex) return left.endIndex - right.endIndex;
    if (left.startIndex !== right.startIndex) return right.startIndex - left.startIndex;
  } else {
    if (left.startIndex !== right.startIndex) return left.startIndex - right.startIndex;
    if (left.endIndex !== right.endIndex) return left.endIndex - right.endIndex;
  }

  return left.originalIndex - right.originalIndex;
}

export function selectLobbyTripSummary(trips, { now = new Date() } = {}) {
  if (!Array.isArray(trips)) return null;

  const todayKey = toLocalDateKey(now);
  const today = parseDateOnlyLocal(todayKey);
  if (!today) return null;
  const todayIndex = toCalendarDayIndex(today);

  const candidate = trips
    .map((trip, index) => normalizeCandidate(trip, index, todayIndex))
    .filter(Boolean)
    .sort(compareCandidates)[0];

  if (!candidate) return null;
  return {
    roomId: candidate.roomId,
    timing: candidate.timing,
    title: candidate.title,
    destination: candidate.destination,
    startDate: candidate.startDate,
    endDate: candidate.endDate,
    durationDays: candidate.durationDays,
    daysUntil: candidate.daysUntil,
    currentDay: candidate.currentDay,
  };
}
