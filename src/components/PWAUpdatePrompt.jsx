import React, { useCallback, useEffect, useState } from 'react';
import {
  applyWaitingPwaUpdate,
  checkForPwaUpdate,
  dismissPwaUpdateFor,
  getPwaUpdateSnapshot,
  revealWaitingPwaUpdate,
  setPwaUpdateRegistration,
  subscribePwaUpdate,
} from '../pwaUpdateController.js';
import { registerAppServiceWorker } from '../pwaRegister.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const REMIND_LATER_MS = 30 * 60 * 1000;

export default function PWAUpdatePrompt() {
  const [pwaUpdateState, setPwaUpdateState] = useState(() => getPwaUpdateSnapshot());
  const [updating, setUpdating] = useState(false);

  const checkForUpdate = useCallback(async () => {
    if (!navigator.onLine) return;

    try {
      await checkForPwaUpdate();
    } catch (error) {
      console.warn('Check app update failed:', error);
    }
  }, []);

  useEffect(() => subscribePwaUpdate(setPwaUpdateState), []);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    let disposed = false;

    const updateSW = registerAppServiceWorker({
      immediate: true,

      onNeedRefresh() {
        if (!disposed) {
          revealWaitingPwaUpdate();
        }
      },

      onRegisteredSW(swUrl, registration) {
        if (disposed || !registration) return;

        setPwaUpdateRegistration({ registration, swUrl, updateSW });
        revealWaitingPwaUpdate();
        void checkForUpdate();
      },

      onRegisterError(error) {
        console.error('Service Worker registration failed:', error);
      },
    });

    setPwaUpdateRegistration({ updateSW });

    const handleFocus = () => {
      void checkForUpdate();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void checkForUpdate();
      }
    };

    const handleOnline = () => {
      void checkForUpdate();
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const intervalId = window.setInterval(() => {
      void checkForUpdate();
      revealWaitingPwaUpdate();
    }, CHECK_INTERVAL_MS);

    return () => {
      disposed = true;
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  }, [checkForUpdate]);

  const handleUpdate = async () => {
    if (updating) return;

    setUpdating(true);

    try {
      await applyWaitingPwaUpdate();

      window.setTimeout(() => {
        window.location.reload();
      }, 4000);
    } catch (error) {
      console.error('Apply app update failed:', error);
      setUpdating(false);
    }
  };

  const handleLater = () => {
    dismissPwaUpdateFor(REMIND_LATER_MS);
  };

  if (!pwaUpdateState.needRefresh) return null;

  return (
    <div
      className="fixed inset-x-3 bottom-3 z-[100000] mx-auto max-w-md rounded-2xl border border-blue-400/30 bg-slate-950/95 p-4 text-white shadow-2xl backdrop-blur-xl"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      role="status"
      aria-live="polite"
      aria-label="有新的 App 版本"
      data-testid="pwa-update-prompt"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 text-xl" aria-hidden="true">
          ↑
        </div>

        <div className="min-w-0 flex-1">
          <p className="font-black">有新的 App 版本</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-300">
            立即更新即可使用最新功能，正在編輯的內容不會被自動中斷。
          </p>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={handleLater}
          disabled={updating}
          className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-300 transition-colors hover:bg-white/10 disabled:opacity-50"
        >
          稍後
        </button>

        <button
          type="button"
          onClick={handleUpdate}
          disabled={updating}
          className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {updating ? '更新中...' : '立即更新'}
        </button>
      </div>
    </div>
  );
}
