import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthSession } from './useAuthSession.js';

const authMocks = vi.hoisted(() => ({
  credential: vi.fn(),
  getRedirectResult: vi.fn(),
  onAuthStateChanged: vi.fn(),
  setCustomParameters: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/auth', () => {
  class GoogleAuthProvider {
    static credential(...args) {
      return authMocks.credential(...args);
    }

    setCustomParameters(...args) {
      return authMocks.setCustomParameters(...args);
    }
  }

  return {
    GoogleAuthProvider,
    getRedirectResult: authMocks.getRedirectResult,
    onAuthStateChanged: authMocks.onAuthStateChanged,
    signInWithCredential: authMocks.signInWithCredential,
    signInWithPopup: authMocks.signInWithPopup,
    signInWithRedirect: authMocks.signInWithRedirect,
    signOut: authMocks.signOut,
  };
});

vi.mock('../../firebase.js', () => ({ auth: null }));

describe('useAuthSession', () => {
  const auth = { currentUser: null };
  const signedInUser = { uid: 'google-user', displayName: 'Jimmy' };

  beforeEach(() => {
    auth.currentUser = null;
    authMocks.getRedirectResult.mockResolvedValue(null);
    authMocks.onAuthStateChanged.mockImplementation((_auth, onNext) => {
      onNext(signedInUser);
      return authMocks.unsubscribe;
    });
    authMocks.unsubscribe = vi.fn();
    authMocks.signInWithPopup.mockResolvedValue({ user: signedInUser });
    authMocks.signInWithRedirect.mockResolvedValue(undefined);
    authMocks.signOut.mockResolvedValue(undefined);
  });

  it('observes the Firebase account and unsubscribes on unmount', async () => {
    const { result, unmount } = renderHook(() => useAuthSession(auth));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(signedInUser);
    expect(authMocks.getRedirectResult).toHaveBeenCalledWith(auth);

    unmount();
    expect(authMocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('signs in with a Google popup and requests explicit account selection', async () => {
    const { result } = renderHook(() => useAuthSession(auth));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.signInWithGoogle();
    });

    expect(response).toEqual({ ok: true, user: signedInUser });
    expect(authMocks.setCustomParameters).toHaveBeenCalledWith({ prompt: 'select_account' });
    expect(authMocks.signInWithPopup).toHaveBeenCalledWith(auth, expect.anything());
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('falls back to redirect when the browser blocks popups', async () => {
    authMocks.signInWithPopup.mockRejectedValue({ code: 'auth/popup-blocked' });
    const { result } = renderHook(() => useAuthSession(auth));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let response;
    await act(async () => {
      response = await result.current.signInWithGoogle();
    });

    expect(response).toEqual({ ok: true, redirected: true });
    expect(authMocks.signInWithRedirect).toHaveBeenCalledWith(auth, expect.anything());
    expect(result.current.error).toBe('');
  });

  it('reports missing configuration and sign-out failures without throwing', async () => {
    const missing = renderHook(() => useAuthSession(null));
    await act(async () => {
      await expect(missing.result.current.signInWithGoogle()).resolves.toEqual({ ok: false });
    });
    expect(missing.result.current.error).toBe('Firebase Authentication 尚未設定。');

    authMocks.signOut.mockRejectedValue(new Error('network'));
    const configured = renderHook(() => useAuthSession(auth));
    await waitFor(() => expect(configured.result.current.loading).toBe(false));
    await act(async () => {
      await expect(configured.result.current.signOut()).resolves.toMatchObject({ ok: false });
    });
    expect(configured.result.current.error).toBe('登出失敗，請稍後再試。');
  });
});
