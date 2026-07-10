import React from 'react';

export const LoadingOverlay = ({
  visible = false,
  message = '載入中...',
  progress = null,
}) => {
  if (!visible) return null;

  const numericProgress = Number(progress);
  const hasProgress = Number.isFinite(numericProgress);
  const clampedProgress = Math.min(100, Math.max(0, numericProgress));

  return (
    <div
      data-testid="loading-overlay"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[10080] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    >
      <section className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950/95 p-6 text-center text-white shadow-2xl">
        <div
          data-testid="loading-spinner"
          className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-blue-400"
          aria-hidden="true"
        />
        <h2 className="mt-4 text-base font-black">{String(message)}</h2>
        {hasProgress ? (
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div
                data-testid="loading-progress"
                className="h-full rounded-full bg-blue-400 transition-[width]"
                style={{ width: `${clampedProgress}%` }}
              />
            </div>
            <p className="mt-2 text-xs font-bold text-white/70">{Math.round(clampedProgress)}%</p>
          </div>
        ) : null}
      </section>
    </div>
  );
};
