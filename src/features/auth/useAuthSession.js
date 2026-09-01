import { useCallback, useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

import { auth as defaultAuth } from '../../firebase.js';

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

const authErrorMessage = (error) => {
  const code = String(error?.code || '');
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return '登入視窗已關閉，尚未登入。';
  }
  if (code === 'auth/network-request-failed') return '網路連線異常，請恢復連線後再試。';
  if (code === 'auth/unauthorized-domain') return '目前網域尚未加入 Firebase 授權網域。';
  return 'Google 登入失敗，請稍後再試。';
};

const createProvider = () => {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
};

const createEmulatorCredential = (uid) => GoogleAuthProvider.credential(JSON.stringify({
  sub: uid,
  email: `${uid}@example.test`,
  email_verified: true,
  name: 'E2E Owner',
  picture: 'https://example.test/e2e-owner.png',
}));

export function useAuthSession(authInstance = defaultAuth) {
  const [user, setUser] = useState(() => authInstance?.currentUser || null);
  const [loading, setLoading] = useState(Boolean(authInstance));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authInstance) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    const unsubscribe = onAuthStateChanged(
      authInstance,
      (nextUser) => {
        if (!active) return;
        setUser(nextUser);
        setLoading(false);
      },
      (nextError) => {
        if (!active) return;
        setError(authErrorMessage(nextError));
        setLoading(false);
      },
    );

    void getRedirectResult(authInstance).catch((nextError) => {
      if (active) setError(authErrorMessage(nextError));
    });

    const emulatorUid = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true'
      ? String(import.meta.env.VITE_E2E_AUTH_UID || '').trim()
      : '';
    if (emulatorUid && !authInstance.currentUser) {
      void signInWithCredential(authInstance, createEmulatorCredential(emulatorUid))
        .catch((nextError) => {
          if (active) setError(authErrorMessage(nextError));
        });
    }

    return () => {
      active = false;
      unsubscribe();
    };
  }, [authInstance]);

  const signInWithGoogle = useCallback(async () => {
    if (!authInstance) {
      setError('Firebase Authentication 尚未設定。');
      return { ok: false };
    }
    setBusy(true);
    setError('');
    try {
      const result = await signInWithPopup(authInstance, createProvider());
      return { ok: true, user: result.user };
    } catch (nextError) {
      if (POPUP_FALLBACK_CODES.has(String(nextError?.code || ''))) {
        try {
          await signInWithRedirect(authInstance, createProvider());
          return { ok: true, redirected: true };
        } catch (redirectError) {
          setError(authErrorMessage(redirectError));
          return { ok: false, error: redirectError };
        }
      }
      setError(authErrorMessage(nextError));
      return { ok: false, error: nextError };
    } finally {
      setBusy(false);
    }
  }, [authInstance]);

  const signOutAccount = useCallback(async () => {
    if (!authInstance) return { ok: true };
    setBusy(true);
    setError('');
    try {
      await signOut(authInstance);
      return { ok: true };
    } catch (nextError) {
      setError('登出失敗，請稍後再試。');
      return { ok: false, error: nextError };
    } finally {
      setBusy(false);
    }
  }, [authInstance]);

  return {
    user,
    loading,
    busy,
    error,
    clearError: () => setError(''),
    signInWithGoogle,
    signOut: signOutAccount,
  };
}
