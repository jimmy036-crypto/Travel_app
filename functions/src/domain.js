import { createHash, randomBytes, randomUUID } from 'node:crypto';

const FIREBASE_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/;
const RESERVED_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export const MEMBER_ROLES = Object.freeze({
  OWNER: 'owner',
  EDITOR: 'editor',
});

export const MEMBER_STATUSES = Object.freeze({
  ACTIVE: 'active',
  REMOVED: 'removed',
});

export class CollaborationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CollaborationError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new CollaborationError(code, message);
};

const isRecord = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const cleanRequiredString = (value, label, maxLength) => {
  const result = String(value ?? '').trim();
  if (!result || result.length > maxLength) {
    fail('invalid-argument', `${label}格式不正確。`);
  }
  return result;
};

const cleanOptionalString = (value, maxLength) => {
  const result = String(value ?? '').trim();
  return result && result.length <= maxLength ? result : '';
};

const parseDateOnly = (value, label) => {
  const normalized = cleanRequiredString(value, label, 10);
  const match = DATE_ONLY_PATTERN.exec(normalized);
  if (!match) fail('invalid-argument', `${label}格式不正確。`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcTime = Date.UTC(year, month - 1, day);
  const parsed = new Date(utcTime);
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    fail('invalid-argument', `${label}格式不正確。`);
  }

  return { normalized, utcTime };
};

const cleanCoordinate = (value, label, minimum, maximum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < minimum || numeric > maximum) {
    fail('invalid-argument', `${label}格式不正確。`);
  }
  return numeric;
};

const normalizeTravelMembers = (members) => {
  if (!Array.isArray(members) || members.length < 1 || members.length > 30) {
    fail('invalid-argument', '旅伴名單格式不正確。');
  }

  const unique = [];
  const seen = new Set();
  for (const rawMember of members) {
    const member = cleanRequiredString(rawMember, '旅伴名稱', 80);
    if (FIREBASE_FORBIDDEN_KEY_CHARS.test(member) || RESERVED_OBJECT_KEYS.has(member)) {
      fail('invalid-argument', '旅伴名稱包含不支援的字元。');
    }
    if (!seen.has(member)) {
      seen.add(member);
      unique.push(member);
    }
  }
  return unique;
};

const normalizeMemberBudgets = (rawBudgets, members) => {
  const budgets = isRecord(rawBudgets) ? rawBudgets : {};
  return Object.fromEntries(members.map((member) => {
    const numeric = Number(budgets[member]);
    const amount = Number.isFinite(numeric) && numeric >= 0 && numeric <= 1_000_000_000
      ? numeric
      : 10_000;
    return [member, amount];
  }));
};

export const validateRoomId = (value) => {
  const roomId = cleanRequiredString(value, '旅程 ID', 160);
  if (FIREBASE_FORBIDDEN_KEY_CHARS.test(roomId) || RESERVED_OBJECT_KEYS.has(roomId)) {
    fail('invalid-argument', '旅程 ID 格式不正確。');
  }
  return roomId;
};

export const validateMemberUid = (value) => {
  const uid = cleanRequiredString(value, '成員 ID', 128);
  if (FIREBASE_FORBIDDEN_KEY_CHARS.test(uid) || RESERVED_OBJECT_KEYS.has(uid)) {
    fail('invalid-argument', '成員 ID 格式不正確。');
  }
  return uid;
};

export const normalizeTripMeta = (rawMeta, now = Date.now()) => {
  if (!isRecord(rawMeta)) fail('invalid-argument', '旅程資料格式不正確。');

  const title = cleanRequiredString(rawMeta.title, '旅程名稱', 120);
  const destination = cleanRequiredString(rawMeta.destination, '目的地', 160);
  const start = parseDateOnly(rawMeta.startDate, '出發日期');
  const end = parseDateOnly(rawMeta.endDate, '回程日期');
  const durationDays = Math.floor((end.utcTime - start.utcTime) / 86_400_000) + 1;
  if (durationDays < 1 || durationDays > 30) {
    fail('invalid-argument', '旅程日期必須介於 1 到 30 天。');
  }

  const members = normalizeTravelMembers(rawMeta.members);
  const transport = cleanOptionalString(rawMeta.transport, 60) || '汽車 🚗';
  const requestedTheme = cleanOptionalString(rawMeta.themeColor, 20);
  const themeColor = /^#[0-9a-fA-F]{6}$/.test(requestedTheme)
    ? requestedTheme.toLowerCase()
    : '#3b82f6';

  return {
    title,
    destination,
    destLat: cleanCoordinate(rawMeta.destLat, '目的地緯度', -90, 90),
    destLng: cleanCoordinate(rawMeta.destLng, '目的地經度', -180, 180),
    startDate: start.normalized,
    endDate: end.normalized,
    members,
    memberBudgets: normalizeMemberBudgets(rawMeta.memberBudgets, members),
    transport,
    themeColor,
    dayThemes: {},
    createdAt: now,
    updatedAt: now,
  };
};

const normalizePhotoUrl = (value) => {
  const raw = cleanOptionalString(value, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
};

export const requireGoogleIdentity = (auth) => {
  if (!auth?.uid || !auth?.token) {
    fail('unauthenticated', '請先使用 Google 登入。');
  }
  if (auth.token.firebase?.sign_in_provider !== 'google.com') {
    fail('permission-denied', '此功能只支援 Google 登入帳號。');
  }

  return {
    uid: validateMemberUid(auth.uid),
    displayName: cleanOptionalString(auth.token.name, 80) || '旅伴',
    photoURL: normalizePhotoUrl(auth.token.picture),
  };
};

export const buildMemberRecord = ({
  profile,
  role,
  joinedAt,
}) => ({
  uid: validateMemberUid(profile.uid),
  displayName: cleanOptionalString(profile.displayName, 80) || '旅伴',
  photoURL: normalizePhotoUrl(profile.photoURL),
  role: role === MEMBER_ROLES.OWNER ? MEMBER_ROLES.OWNER : MEMBER_ROLES.EDITOR,
  status: MEMBER_STATUSES.ACTIVE,
  aclVersion: 1,
  joinedAt,
  updatedAt: joinedAt,
});

export const generateInviteToken = () => randomBytes(32).toString('base64url');

export const hashInviteToken = (token) => {
  const normalized = String(token ?? '').trim();
  if (!INVITE_TOKEN_PATTERN.test(normalized)) {
    fail('invalid-argument', '邀請連結格式不正確。');
  }
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
};

export const createOperationId = () => randomUUID();

export const sanitizeMemberForClient = (value) => {
  if (!isRecord(value)) return null;
  const uid = cleanOptionalString(value.uid, 128);
  if (!uid) return null;
  const role = value.role === MEMBER_ROLES.OWNER ? MEMBER_ROLES.OWNER : MEMBER_ROLES.EDITOR;
  const status = value.status === MEMBER_STATUSES.REMOVED
    ? MEMBER_STATUSES.REMOVED
    : MEMBER_STATUSES.ACTIVE;
  const joinedAt = Number(value.joinedAt);
  const removedAt = Number(value.removedAt);
  return {
    uid,
    displayName: cleanOptionalString(value.displayName, 80) || '旅伴',
    photoURL: normalizePhotoUrl(value.photoURL),
    role,
    status,
    joinedAt: Number.isFinite(joinedAt) ? joinedAt : null,
    removedAt: Number.isFinite(removedAt) ? removedAt : null,
  };
};

export const sortMembers = (members) => [...members].sort((left, right) => {
  const roleDifference = Number(right.role === MEMBER_ROLES.OWNER) - Number(left.role === MEMBER_ROLES.OWNER);
  if (roleDifference !== 0) return roleDifference;
  const statusDifference = Number(left.status === MEMBER_STATUSES.REMOVED) - Number(right.status === MEMBER_STATUSES.REMOVED);
  if (statusDifference !== 0) return statusDifference;
  return left.displayName.localeCompare(right.displayName, 'zh-Hant');
});

export const isActiveMember = (member) => (
  isRecord(member)
  && member.status === MEMBER_STATUSES.ACTIVE
  && (member.role === MEMBER_ROLES.OWNER || member.role === MEMBER_ROLES.EDITOR)
);

export const isOwnerMember = (member, ownerUid, uid) => (
  isActiveMember(member)
  && member.role === MEMBER_ROLES.OWNER
  && ownerUid === uid
  && member.uid === uid
);
