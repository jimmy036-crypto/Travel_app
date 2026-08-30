import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTripAccessClient, extractInviteToken, getCallableErrorMessage } from './tripAccessClient.js';

const functionsMocks = vi.hoisted(() => ({
  httpsCallable: vi.fn(),
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: functionsMocks.httpsCallable,
}));

vi.mock('../../firebase.js', () => ({ functions: null }));

describe('extractInviteToken', () => {
  const token = 'a'.repeat(43);

  it('accepts only canonical raw tokens or fragment invite parameters', () => {
    expect(extractInviteToken(`  ${token}  `)).toBe(token);
    expect(extractInviteToken(`https://travel.example/#invite=${token}`)).toBe(token);
    expect(extractInviteToken(`/#invite=${token}`)).toBe(token);
    expect(extractInviteToken(`https://travel.example/?invite=${token}`)).toBe('');
    expect(extractInviteToken(`/?invite=${token}`)).toBe('');
    expect(extractInviteToken('short-token')).toBe('');
    expect(extractInviteToken(`https://travel.example/?room=${token}`)).toBe('');
  });
});

describe('createTripAccessClient', () => {
  const functionsInstance = { app: 'test-functions' };

  beforeEach(() => {
    functionsMocks.httpsCallable.mockImplementation((_functions, name) => async (payload) => ({
      data: { name, payload },
    }));
  });

  it.each([
    ['createTrip', [{ roomId: 'room-1', meta: { title: 'Tokyo' } }], { roomId: 'room-1', meta: { title: 'Tokyo' } }],
    ['getOrCreateTripInvite', ['room-1'], { roomId: 'room-1' }],
    ['rotateTripInvite', ['room-1'], { roomId: 'room-1' }],
    ['revokeTripInvite', ['room-1'], { roomId: 'room-1' }],
    ['redeemTripInvite', ['token'], { token: 'token' }],
    ['listTripMembers', ['room-1'], { roomId: 'room-1' }],
    ['removeTripMember', ['room-1', 'member-1'], { roomId: 'room-1', uid: 'member-1' }],
    ['restoreTripMember', ['room-1', 'member-1'], { roomId: 'room-1', uid: 'member-1' }],
  ])('maps %s to its protected callable contract', async (method, args, payload) => {
    const client = createTripAccessClient(functionsInstance);

    await expect(client[method](...args)).resolves.toEqual({ name: method, payload });
    expect(functionsMocks.httpsCallable).toHaveBeenCalledWith(functionsInstance, method);
  });

  it('fails closed when Firebase Functions is unavailable', async () => {
    await expect(createTripAccessClient(null).listTripMembers('room-1'))
      .rejects.toThrow('Firebase Functions 尚未設定。');
  });
});

describe('getCallableErrorMessage', () => {
  it('translates Firebase callable codes and preserves safe server messages', () => {
    expect(getCallableErrorMessage({ code: 'functions/unauthenticated' })).toBe('請先使用 Google 登入。');
    expect(getCallableErrorMessage({ code: 'functions/permission-denied', message: '只有擁有者可操作。' }))
      .toBe('只有擁有者可操作。');
    expect(getCallableErrorMessage({ code: 'functions/unavailable' })).toBe('服務目前無法連線，請稍後再試。');
    expect(getCallableErrorMessage(new Error('自訂錯誤'))).toBe('自訂錯誤');
  });
});
