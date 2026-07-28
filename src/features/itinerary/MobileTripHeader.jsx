import React, { useEffect, useRef, useState } from 'react';

import { getDayDisplay } from '../../helpers.js';

export function MobileTripHeader({
  meta,
  dayId,
  weather,
  t,
  syncStatusNode,
  settingsNode,
  onBack,
  onExport,
  onChecklist,
  onShare,
}) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsRef = useRef(null);
  const { dateStr } = getDayDisplay(dayId, meta?.startDate);

  useEffect(() => {
    if (!toolsOpen) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (!toolsRef.current?.contains(event.target)) setToolsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setToolsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [toolsOpen]);

  return (
    <header
      data-testid="mobile-trip-header"
      className={`relative z-50 shrink-0 border-b px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2 ${t.headerBg} ${t.cardBorder}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          data-testid="back-to-lobby"
          onClick={onBack}
          aria-label="返回旅程大廳"
          className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
        >
          ‹
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1
              data-testid="trip-detail-title"
              className={`min-w-0 truncate text-lg font-black ${t.mainText}`}
            >
              {String(meta?.title || '旅程')}
            </h1>
            {syncStatusNode}
          </div>
          <p className={`truncate text-[10px] font-bold ${t.subText}`}>
            {[dateStr, meta?.destination].filter(Boolean).join('・')}
            {weather ? `・${weather.temp}・降雨 ${weather.rain}%` : ''}
          </p>
        </div>

        <div ref={toolsRef} className="relative shrink-0">
          <button
            type="button"
            data-testid="mobile-trip-tools-trigger"
            aria-label="開啟旅程工具"
            aria-haspopup="menu"
            aria-expanded={toolsOpen}
            onClick={() => setToolsOpen((current) => !current)}
            className={`flex min-h-11 w-11 items-center justify-center rounded-xl border text-lg ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
          >
            ⋯
          </button>
          {toolsOpen ? (
            <div
              role="menu"
              data-testid="mobile-trip-tools-menu"
              aria-label="旅程工具"
              className={`absolute right-0 top-12 z-60 grid w-44 gap-1 rounded-2xl border p-2 shadow-xl ${t.modalBg} ${t.cardBorder}`}
            >
              {[
                ['匯出行程', onExport, '🖨️'],
                ['共享清單', onChecklist, '✅'],
                ['分享共編', onShare, '🔗'],
              ].map(([label, handler, icon]) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setToolsOpen(false);
                    handler?.();
                  }}
                  className={`min-h-11 rounded-xl px-3 text-left text-xs font-black hover:bg-blue-500/10 ${t.mainText}`}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {settingsNode}
      </div>
    </header>
  );
}
