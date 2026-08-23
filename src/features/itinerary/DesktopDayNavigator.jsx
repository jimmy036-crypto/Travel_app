import React, { useEffect, useRef } from 'react';

import { Icon } from '../../components/ui/Icon.jsx';
import { getDayDisplay } from '../../helpers.js';

export function DesktopDayNavigator({
  days,
  currentDay,
  startDate,
  onSelectDay,
  t,
}) {
  const safeDays = Array.isArray(days) ? days : [];
  const currentIndex = Math.max(0, safeDays.indexOf(currentDay));
  const buttonRefs = useRef({});

  useEffect(() => {
    buttonRefs.current[currentDay]?.scrollIntoView?.({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'auto',
    });
  }, [currentDay]);

  const selectAt = (index, event) => {
    const dayId = safeDays[index];
    if (dayId) onSelectDay(dayId, event);
  };

  return (
    <nav
      data-testid="desktop-day-navigator"
      aria-label="桌面行程日期導覽"
      className={`hidden shrink-0 items-center gap-2 border-b px-4 py-2 md:flex ${t.headerBg} ${t.cardBorder}`}
    >
      <button
        type="button"
        data-testid="desktop-day-previous"
        aria-label="前一天"
        disabled={currentIndex <= 0}
        onClick={(event) => selectAt(currentIndex - 1, event)}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-black transition-colors hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
      >
        <Icon name="chevronLeft" />
      </button>
      <div className="scrollbar-hide flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain">
        {safeDays.map((dayId) => {
          const { title } = getDayDisplay(dayId, startDate);
          const isCurrent = dayId === currentDay;
          return (
            <button
              key={dayId}
              ref={(node) => {
                if (node) buttonRefs.current[dayId] = node;
                else delete buttonRefs.current[dayId];
              }}
              type="button"
              data-testid="desktop-day-button"
              data-day-id={dayId}
              aria-current={isCurrent ? 'date' : undefined}
              onClick={(event) => onSelectDay(dayId, event)}
              className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-black transition-[background-color,border-color,color,box-shadow] duration-200 ${
                isCurrent
                  ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : `${t.cardBg} ${t.cardBorder} ${t.mainText} hover:border-blue-400`
              }`}
            >
              {String(title)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        data-testid="desktop-day-next"
        aria-label="後一天"
        disabled={currentIndex >= safeDays.length - 1}
        onClick={(event) => selectAt(currentIndex + 1, event)}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border font-black transition-colors hover:border-blue-400 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
      >
        <Icon name="chevronRight" />
      </button>
    </nav>
  );
}
