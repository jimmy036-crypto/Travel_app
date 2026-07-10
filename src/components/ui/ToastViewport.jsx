import React from 'react';

const TOAST_STYLES = {
  success: 'border-emerald-500/30 bg-emerald-950/95 text-emerald-50',
  info: 'border-blue-500/30 bg-slate-950/95 text-blue-50',
  warning: 'border-amber-500/35 bg-amber-950/95 text-amber-50',
  error: 'border-red-500/35 bg-red-950/95 text-red-50',
};

const TOAST_ACCENTS = {
  success: 'bg-emerald-400',
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  error: 'bg-red-400',
};

export const ToastViewport = ({ toasts, onDismiss }) => (
  <div
    data-testid="toast-viewport"
    aria-live="polite"
    aria-relevant="additions removals"
    className="pointer-events-none fixed inset-x-3 bottom-3 z-[10090] flex flex-col-reverse gap-2 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-96 sm:flex-col"
  >
    {toasts.map((toast) => {
      const type = String(toast.type || 'info');
      const style = TOAST_STYLES[type] || TOAST_STYLES.info;
      const accent = TOAST_ACCENTS[type] || TOAST_ACCENTS.info;

      return (
        <section
          key={toast.id}
          data-testid="toast"
          data-toast-type={type}
          className={`pointer-events-auto relative overflow-hidden rounded-2xl border p-4 pr-11 shadow-2xl backdrop-blur-xl ${style}`}
          role={type === 'error' ? 'alert' : 'status'}
        >
          <span className={`absolute left-0 top-0 h-full w-1 ${accent}`} aria-hidden="true" />
          <button
            type="button"
            data-testid="toast-dismiss"
            aria-label="關閉通知"
            onClick={() => onDismiss(toast.id)}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-xl text-lg font-black opacity-75 transition-opacity hover:opacity-100"
          >
            x
          </button>
          <h2 className="text-sm font-black">{String(toast.title || '')}</h2>
          {toast.description ? (
            <p className="mt-1 text-xs font-semibold leading-5 opacity-80">
              {String(toast.description)}
            </p>
          ) : null}
          {toast.action?.label ? (
            <button
              type="button"
              data-testid="toast-action"
              onClick={() => {
                toast.action.onClick?.();
                onDismiss(toast.id);
              }}
              className="mt-3 min-h-10 rounded-xl border border-white/20 px-3 text-xs font-black transition-colors hover:bg-white/10"
            >
              {String(toast.action.label)}
            </button>
          ) : null}
        </section>
      );
    })}
  </div>
);
