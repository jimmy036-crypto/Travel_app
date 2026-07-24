import React from 'react';

export function DemoTripEntryCard({ t, onOpenDemo }) {
  const theme = {
    card: t?.cardBg || 'bg-white dark:bg-slate-900',
    border: t?.cardBorder || 'border-slate-200 dark:border-slate-700',
    main: t?.mainText || 'text-slate-950 dark:text-slate-50',
    sub: t?.subText || 'text-slate-600 dark:text-slate-300',
  };

  return (
    <section
      data-testid="demo-trip-entry-card"
      aria-labelledby="demo-trip-entry-title"
      className={`mx-auto w-full max-w-2xl overflow-x-hidden rounded-3xl border p-5 shadow-lg sm:p-6 ${theme.card} ${theme.border}`}
    >
      <div className="flex min-w-0 flex-wrap gap-2">
        <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">示範模式</span>
        <span data-testid="demo-trip-entry-readonly" className="rounded-full bg-slate-700 px-3 py-1 text-xs font-black text-white">唯讀</span>
        <span data-testid="demo-trip-entry-local-only" className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-black text-white">不會同步</span>
      </div>
      <h2 id="demo-trip-entry-title" className={`mt-4 break-words text-xl font-black ${theme.main}`}>先看看東京三日範例</h2>
      <p className={`mt-2 break-words text-sm leading-6 ${theme.sub}`}>
        使用內建唯讀資料快速了解行程、票券、記帳與清單功能。範例不會同步，也不會建立雲端旅程。
      </p>
      <button
        type="button"
        data-testid="demo-trip-entry-open"
        aria-label="查看東京三日示範旅程"
        onClick={() => onOpenDemo?.()}
        className="mt-5 min-h-11 w-full rounded-xl border-2 border-blue-600 px-4 text-sm font-black text-blue-700 transition-colors hover:bg-blue-600 hover:text-white dark:text-blue-300"
      >
        查看示範旅程
      </button>
    </section>
  );
}

export default DemoTripEntryCard;
