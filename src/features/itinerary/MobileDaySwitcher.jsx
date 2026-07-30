import React from 'react';

import { getDayDisplay } from '../../helpers.js';

export function MobileDaySwitcher({
  days,
  currentDay,
  startDate,
  onSelectDay,
  t,
  wrapperClassName,
}) {
  return (
    <nav
      data-testid="mobile-day-switcher"
      aria-label="選擇行程日期"
      className={wrapperClassName ?? `shrink-0 border-b px-3 py-2 ${t.headerBg} ${t.cardBorder}`}
    >
      <div className="scrollbar-hide flex gap-2 overflow-x-auto overscroll-x-contain">
        {(Array.isArray(days) ? days : []).map((dayId) => {
          const { title, dateStr } = getDayDisplay(dayId, startDate);
          const isCurrent = currentDay === dayId;

          return (
            <button
              key={String(dayId)}
              type="button"
              data-testid="itinerary-day-switch-button"
              data-day-id={String(dayId)}
              aria-pressed={isCurrent}
              aria-current={isCurrent ? 'date' : undefined}
              onClick={(event) => onSelectDay(dayId, event)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-xs font-black transition-[background-color,border-color,color,transform] active:scale-95 ${
                isCurrent
                  ? 'border-blue-500 bg-blue-600 text-white ring-2 ring-blue-500/25'
                  : `${t.cardBg} ${t.cardBorder} ${t.mainText}`
              }`}
            >
              <span>{String(title)}</span>
              {dateStr ? <span className="ml-1 opacity-75">{String(dateStr).split(' ')[0]}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
