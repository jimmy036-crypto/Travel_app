import React, { useEffect, useRef } from 'react';

export const ConfirmDialog = ({
  open = false,
  title,
  description,
  confirmLabel = '確認',
  cancelLabel = '取消',
  danger = false,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousActiveElement = document.activeElement;
    window.requestAnimationFrame(() => cancelRef.current?.focus?.());

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus?.();
      }
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 z-[10085] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl dark:border-white/10 dark:bg-slate-950 dark:text-white"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-xl font-black">
          {String(title || '')}
        </h2>
        {description ? (
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-500 dark:text-slate-300">
            {String(description)}
          </p>
        ) : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            data-testid="confirm-cancel"
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-slate-300 px-5 text-sm font-black text-slate-700 dark:border-white/15 dark:text-slate-100"
          >
            {String(cancelLabel)}
          </button>
          <button
            type="button"
            data-testid="confirm-accept"
            onClick={onConfirm}
            className={`min-h-11 rounded-xl px-5 text-sm font-black text-white shadow-lg ${
              danger
                ? 'bg-red-600 shadow-red-500/25 hover:bg-red-500'
                : 'bg-blue-600 shadow-blue-500/25 hover:bg-blue-500'
            }`}
          >
            {String(confirmLabel)}
          </button>
        </div>
      </section>
    </div>
  );
};
