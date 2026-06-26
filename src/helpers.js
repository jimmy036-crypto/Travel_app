const DAY_MS = 24 * 60 * 60 * 1000;
const FIREBASE_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/;

export const parseDateOnlyLocal = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;

  return date;
};

export const getInclusiveDayCount = (startDate, endDate) => {
  const start = parseDateOnlyLocal(startDate);
  const end = parseDateOnlyLocal(endDate);
  if (!start || !end || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
};

const toChineseNumber = (value) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 99) return String(value);
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n < 10) return digits[n];
  if (n === 10) return '十';
  if (n < 20) return `十${digits[n % 10]}`;
  const tens = `${digits[Math.floor(n / 10)]}十`;
  return n % 10 === 0 ? tens : `${tens}${digits[n % 10]}`;
};

export const getDayNumber = (dayId) => {
  const match = /^Day\s+(\d+)$/.exec(String(dayId || '').trim());
  return match ? Math.max(1, Number(match[1])) : 1;
};

export const sortDayIds = (dayIds) => [...dayIds].sort((a, b) => getDayNumber(a) - getDayNumber(b));

export const getDayDisplay = (dayId, startDateStr) => {
  const dayNum = getDayNumber(dayId);
  const dayLabel = `第${toChineseNumber(dayNum)}天`;
  const startDate = parseDateOnlyLocal(startDateStr);
  if (!startDate) return { title: dayLabel, dateStr: '' };

  const dateObj = new Date(startDate);
  dateObj.setDate(dateObj.getDate() + dayNum - 1);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()];
  return {
    title: dayLabel,
    dateStr: `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${weekday})`,
  };
};

export const generateId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `room_${crypto.randomUUID()}`;
  }
  return `room_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
};

export const extractRoomId = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return '';

  let candidate = raw;
  try {
    const url = new URL(raw, typeof window !== 'undefined' ? window.location.origin : 'https://example.com');
    candidate = url.searchParams.get('room') || raw;
  } catch {
    const queryIndex = raw.indexOf('?');
    if (queryIndex >= 0) {
      candidate = new URLSearchParams(raw.slice(queryIndex + 1)).get('room') || raw;
    }
  }

  candidate = decodeURIComponent(String(candidate)).trim();
  if (!candidate || candidate.length > 160 || FIREBASE_FORBIDDEN_KEY_CHARS.test(candidate)) return '';
  return candidate;
};

export const isValidCoordinates = (coordsOrLat, maybeLng) => {
  const lat = typeof coordsOrLat === 'object' && coordsOrLat !== null
    ? Number(coordsOrLat.lat)
    : Number(coordsOrLat);
  const lng = typeof coordsOrLat === 'object' && coordsOrLat !== null
    ? Number(coordsOrLat.lng)
    : Number(maybeLng);

  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const normalizeMembers = (members) => {
  const unique = [];
  const source = Array.isArray(members) ? members : [];
  source.forEach((member) => {
    const name = String(member || '').trim();
    if (name && !unique.includes(name)) unique.push(name);
  });
  return unique.length > 0 ? unique : ['自己'];
};

export const readStorage = (key, fallback = '') => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
};

export const readJsonStorage = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
};

const normalizeHex = (hex) => {
  const raw = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) return raw.split('').map((c) => `${c}${c}`).join('');
  if (/^[0-9a-f]{6}$/i.test(raw)) return raw;
  return '000000';
};

export const getBrightness = (hex) => {
  const value = normalizeHex(hex);
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000;
};

export const getThemeClasses = (hex) => {
  const isLight = getBrightness(hex) > 150;
  return {
    isLight,
    mainText: isLight ? 'text-slate-900' : 'text-slate-100',
    subText: isLight ? 'text-slate-600' : 'text-slate-300',
    cardBg: isLight ? 'bg-white/60' : 'bg-black/40',
    cardBorder: isLight ? 'border-black/10' : 'border-white/10',
    cardHover: isLight ? 'hover:bg-white/80 hover:border-blue-400' : 'hover:bg-black/60 hover:border-blue-500',
    cardMetaBg: isLight ? 'bg-black/5' : 'bg-white/5',
    inputBg: isLight ? 'bg-white/80' : 'bg-black/50',
    modalBg: isLight ? 'bg-white/95' : 'bg-black/90',
    sidebarBg: isLight ? 'bg-white/50' : 'bg-black/50',
    headerBg: isLight ? 'bg-white/70' : 'bg-black/70',
    itemBg: isLight ? 'bg-white/80' : 'bg-black/40',
    itemHover: isLight ? 'hover:border-black/30' : 'hover:border-white/30',
    expenseBlockBg: isLight ? 'bg-black/5' : 'bg-black/20',
  };
};

export const getExploreIcon = (query) => {
  const q = String(query || '').toLowerCase();
  if (q.includes('停車') || q.includes('parking')) return { text: '🅿️', bg: '#64748b', border: '#475569' };
  if (q.includes('咖啡') || q.includes('cafe') || q.includes('coffee')) return { text: '☕', bg: '#78350f', border: '#451a03' };
  if (q.includes('超市') || q.includes('便利') || q.includes('mart') || q.includes('market')) return { text: '🛒', bg: '#16a34a', border: '#14532d' };
  if (q.includes('景點') || q.includes('公園') || q.includes('park')) return { text: '📸', bg: '#db2777', border: '#9d174d' };
  if (q.includes('住宿') || q.includes('飯店') || q.includes('hotel')) return { text: '🏨', bg: '#4f46e5', border: '#312e81' };
  return { text: '📍', bg: '#f97316', border: '#c2410c' };
};

export const timeToMins = (timeStr) => {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(timeStr || '').trim());
  if (!match) return 0;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23) return 0;
  return hour * 60 + minute;
};

export const minsToTime = (mins) => {
  const value = Number(mins);
  if (!Number.isFinite(value)) return '';
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

export const getNextDefaultTimeFromList = (items) => {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return '10:00';
  const last = list[list.length - 1];
  if (!last?.time) return '';
  const travelTime = last.nextLeg?.mode !== 'AUTO'
    ? Number(last.nextLeg?.mins) || 30
    : 30;
  return minsToTime(timeToMins(last.time) + Number(last.stayTime || 0) + travelTime);
};

export const formatStayTime = (mins) => {
  const value = Number(mins);
  if (!Number.isFinite(value) || value <= 0) return '🚶‍♂️ 僅經過';
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded} 分鐘`;
  const hours = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return remaining === 0 ? `${hours} 小時` : `${hours} 小時 ${remaining} 分鐘`;
};

export const safeUrlFormatter = (urlStr) => {
  const raw = String(urlStr || '').trim();
  if (!raw) return '';

  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
};

export const openExternalUrl = (urlStr) => {
  const safeUrl = safeUrlFormatter(urlStr);
  if (!safeUrl || typeof window === 'undefined') return false;
  const opened = window.open(safeUrl, '_blank', 'noopener,noreferrer');
  if (opened) opened.opener = null;
  return Boolean(opened);
};
