import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const isIosSafari = (platform, browser) => platform === 'ios' && browser === 'safari';

export function PwaInstallInstructionsDialog({
  open = false,
  platform = 'unknown',
  browser = 'unknown',
  onClose,
}) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus?.();
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open) return null;

  const showSafariNote = platform === 'ios' && !isIosSafari(platform, browser);

  return createPortal(
    <div
      data-testid="pwa-install-instructions"
      className="fixed inset-0 z-[10080] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="presentation"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pwa-install-instructions-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-white/10 dark:bg-slate-950 dark:text-white sm:rounded-3xl"
      >
        <header className="flex items-start gap-4 border-b border-slate-200 px-5 py-4 dark:border-white/10">
          <div className="min-w-0 flex-1">
            <h2
              id="pwa-install-instructions-title"
              data-testid="pwa-install-instructions-title"
              className="text-lg font-black"
            >
              將「智の旅行」加入主畫面
            </h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
              加入後可像一般 App 一樣從主畫面開啟，並使用已支援的離線功能。
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            data-testid="pwa-install-instructions-close"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 text-xl font-black text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/15 dark:text-slate-100 dark:hover:bg-white/10"
            aria-label="關閉加入主畫面教學"
          >
            x
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {showSafariNote ? (
            <p
              data-testid="pwa-install-open-in-safari-note"
              className="mb-4 rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm font-black leading-6 text-blue-700 dark:text-blue-200"
            >
              請先使用 Safari 開啟此頁，再依照以下步驟操作。
            </p>
          ) : null}

          <ol
            data-testid="pwa-install-ios-safari-steps"
            className="grid gap-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200"
          >
            <li className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              1. 點擊 Safari 工具列的「分享」按鈕。
            </li>
            <li className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              2. 向下捲動並選擇「加入主畫面」。
            </li>
            <li className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              3. 若看到「以網頁 App 開啟」，保持開啟。
            </li>
            <li className="rounded-2xl border border-slate-200 p-3 dark:border-white/10">
              4. 點擊右上角的「加入」。
            </li>
          </ol>

          <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-xs font-bold leading-5 text-slate-600 dark:bg-white/10 dark:text-slate-300">
            若沒有看到「加入主畫面」，請在分享選單底部選擇「編輯動作」並加入該操作。
          </p>
        </div>
      </section>
    </div>,
    document.body,
  );
}
