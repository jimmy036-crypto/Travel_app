import { httpsCallable } from 'firebase/functions';

import { functions as defaultFunctions } from '../../firebase.js';

const CALLABLE_NAMES = Object.freeze([
  'createTrip',
  'getOrCreateTripInvite',
  'rotateTripInvite',
  'revokeTripInvite',
  'redeemTripInvite',
  'listTripMembers',
  'removeTripMember',
  'restoreTripMember',
]);

const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

export function extractInviteToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (INVITE_TOKEN_PATTERN.test(raw)) return raw;
  try {
    const url = new URL(raw, typeof window === 'undefined' ? 'https://travel.invalid' : window.location.origin);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/u, ''));
    const token = String(hashParams.get('invite') || '').trim();
    return INVITE_TOKEN_PATTERN.test(token) ? token : '';
  } catch {
    return '';
  }
}

export function createTripAccessClient(functionsInstance = defaultFunctions) {
  const invoke = async (name, payload) => {
    if (!functionsInstance) throw new Error('Firebase Functions 尚未設定。');
    if (!CALLABLE_NAMES.includes(name)) throw new Error('未知的旅程權限操作。');
    const callable = httpsCallable(functionsInstance, name);
    const response = await callable(payload);
    return response.data;
  };

  return {
    createTrip: ({ roomId, meta }) => invoke('createTrip', { roomId, meta }),
    getOrCreateTripInvite: (roomId) => invoke('getOrCreateTripInvite', { roomId }),
    rotateTripInvite: (roomId) => invoke('rotateTripInvite', { roomId }),
    revokeTripInvite: (roomId) => invoke('revokeTripInvite', { roomId }),
    redeemTripInvite: (token) => invoke('redeemTripInvite', { token }),
    listTripMembers: (roomId) => invoke('listTripMembers', { roomId }),
    removeTripMember: (roomId, uid) => invoke('removeTripMember', { roomId, uid }),
    restoreTripMember: (roomId, uid) => invoke('restoreTripMember', { roomId, uid }),
  };
}

export const getCallableErrorMessage = (error) => {
  const code = String(error?.code || '').replace(/^functions\//u, '');
  if (code === 'unauthenticated') return '請先使用 Google 登入。';
  if (code === 'permission-denied') return error?.message || '你沒有執行此操作的權限。';
  if (code === 'not-found') return error?.message || '邀請連結無效或已撤銷。';
  if (code === 'failed-precondition') return error?.message || '目前狀態無法執行此操作。';
  if (code === 'already-exists') return '旅程 ID 已存在，請再試一次。';
  if (code === 'resource-exhausted') return error?.message || '旅程成員已達上限。';
  if (code === 'unavailable') return '服務目前無法連線，請稍後再試。';
  return error?.message || '操作失敗，請稍後再試。';
};
