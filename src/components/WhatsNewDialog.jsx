import React, { useEffect, useRef } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const WhatsNewDialog = ({
  notes,
  t,
  tourCtaMode = 'trip',
  onStartTour,
  onRemindLater,
  onDismissVersion,
  onClose,
}) => {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const previousActiveElement = document.activeElement;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';
    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus?.();
    });

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      const focusableElements = dialog
        ? [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
        : [];
      if (focusableElements.length === 0) return;

      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus?.();
      }
    };
  }, [onClose]);

  const highlights = Array.isArray(notes?.highlights) ? notes.highlights : [];
  const primaryAction = (() => {
    if (tourCtaMode === 'lobby-empty') {
      return {
        testId: 'whats-new-create-trip',
        label: '建立第一個旅程',
      };
    }
    if (tourCtaMode === 'lobby-trips') {
      return {
        testId: 'whats-new-choose-trip-tour',
        label: '選擇旅程並開始導覽',
      };
    }
    return {
      testId: 'whats-new-start-tour',
      label: '開始導覽',
    };
  })();

  return (
    <div
      data-testid="whats-new-dialog"
      className="fixed inset-0 z-10040 flex items-end justify-center bg-slate-950/65 p-0 backdrop-blur-sm md:items-center md:p-6"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className={`flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border shadow-2xl md:rounded-3xl ${t.modalBg} ${t.cardBorder}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={`flex items-start justify-between gap-4 border-b px-5 pt-5 pb-4 md:px-6 md:pt-6 ${t.headerBg} ${t.cardBorder}`}>
          <div className="min-w-0">
            <p className={`mb-1 text-[10px] font-black uppercase tracking-[0.18em] ${t.subText}`}>
              {String(notes?.publishedAt || '')} · {String(notes?.version || '')}
            </p>
            <h2 id="whats-new-title" className={`text-2xl font-black ${t.mainText}`}>
              本次更新
            </h2>
            <p className={`mt-1 text-sm font-bold ${t.subText}`}>
              {String(notes?.title || '')}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="關閉本次更新"
            onClick={onClose}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
          >
            ×
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 md:px-6">
          {tourCtaMode === 'lobby-empty' ? (
            <p className={`mb-4 rounded-2xl border px-4 py-3 text-sm font-bold leading-6 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>
              建立旅程後，即可體驗天數切換、景點操作與多人同步導覽。
            </p>
          ) : null}
          <div className="grid gap-3">
            {highlights.map((item) => (
              <article
                key={String(item.id)}
                className={`grid grid-cols-[2.75rem_1fr] gap-3 rounded-2xl border p-3 ${t.cardBg} ${t.cardBorder}`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-sm font-black text-blue-600">
                  {String(item.icon || '•')}
                </div>
                <div className="min-w-0">
                  <h3 className={`text-sm font-black ${t.mainText}`}>{String(item.title)}</h3>
                  <p className={`mt-1 text-xs leading-5 ${t.subText}`}>{String(item.description)}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className={`grid gap-2 border-t px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:grid-cols-[1fr_auto_auto] md:px-6 md:pb-4 ${t.headerBg} ${t.cardBorder}`}>
          <button
            type="button"
            data-testid={primaryAction.testId}
            aria-label={primaryAction.label}
            onClick={onStartTour}
            className="min-h-11 rounded-xl bg-blue-600 px-5 text-[0px] font-black text-white shadow-lg shadow-blue-500/25 active:scale-95"
          >
            <span className="text-sm">{primaryAction.label}</span>
            開始導覽
          </button>
          <button
            type="button"
            data-testid="whats-new-remind-later"
            onClick={onRemindLater}
            className={`min-h-11 rounded-xl border px-4 text-sm font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
          >
            稍後再看
          </button>
          <button
            type="button"
            data-testid="whats-new-dismiss-version"
            onClick={onDismissVersion}
            className={`min-h-11 rounded-xl px-4 text-sm font-black ${t.subText}`}
          >
            不再顯示此版本
          </button>
        </footer>
      </section>
    </div>
  );
};
