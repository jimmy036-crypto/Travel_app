import React from 'react';

export function MobileCompactUtilityBar({ onBack, settingsNode, syncStatusNode, t }) {
  return (
    <header
      data-testid="mobile-compact-utility-bar"
      className={`relative z-50 flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] ${t.headerBg} ${t.cardBorder}`}
    >
      <button
        type="button"
        data-testid="back-to-lobby"
        onClick={onBack}
        aria-label="返回旅程大廳"
        className={`flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
      >
        ‹
      </button>
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {syncStatusNode}
        {settingsNode}
      </div>
    </header>
  );
}
