import React from 'react';

import { MobileDaySwitcher } from '../itinerary/MobileDaySwitcher.jsx';

export function MobileMapTopBar({
  days,
  currentDay,
  startDate,
  onSelectDay,
  onBack,
  settingsNode,
  syncStatusNode,
  t,
}) {
  return (
    <header
      data-testid="mobile-map-top-bar"
      className={`relative z-50 flex shrink-0 items-center gap-2 border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] ${t.headerBg} ${t.cardBorder}`}
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
      <MobileDaySwitcher
        days={days}
        currentDay={currentDay}
        startDate={startDate}
        onSelectDay={onSelectDay}
        t={t}
        wrapperClassName="min-w-0 flex-1"
      />
      {syncStatusNode}
      {settingsNode}
    </header>
  );
}
