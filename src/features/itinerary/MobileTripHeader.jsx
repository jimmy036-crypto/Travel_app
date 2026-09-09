import React from 'react';

import { Icon } from '../../components/ui/Icon.jsx';
import { getDayDisplay } from '../../helpers.js';

export function MobileTripHeader({
  meta,
  dayId,
  weather,
  t,
  syncStatusNode,
  settingsNode,
  onBack,
}) {
  const { dateStr } = getDayDisplay(dayId, meta?.startDate);
  const weatherTemperature = String(weather?.temp || '');
  const weatherRain = Number.isFinite(Number(weather?.rain))
    ? `${Number(weather.rain)}%`
    : '';

  return (
    <header
      data-testid="mobile-trip-header"
      className={`relative z-50 shrink-0 border-b px-[12px] pb-[2px] pt-[max(8px,env(safe-area-inset-top))] ${t.headerBg} ${t.cardBorder}`}
    >
      <div
        data-testid="mobile-trip-utility-row"
        className="flex min-w-0 items-center justify-between gap-[12px]"
      >
        <button
          type="button"
          data-testid="back-to-lobby"
          onClick={onBack}
          aria-label="返回旅程大廳"
          className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl border shadow-sm transition-colors hover:border-blue-400 hover:text-blue-500 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
        >
          <Icon name="arrowLeft" />
        </button>
        <div className="shrink-0 [&>button]:h-[44px]! [&>button]:min-h-[44px]! [&>button]:w-[44px]! [&>button>svg]:h-[20px]! [&>button>svg]:w-[20px]!">
          {settingsNode}
        </div>
      </div>

      <div
        data-testid="mobile-trip-summary"
        className={`mt-[4px] grid min-w-0 gap-[12px] rounded-3xl border p-[8px] shadow-[var(--travel-shadow-card)] ${t.cardBg} ${t.cardBorder}`}
        style={{
          gridTemplateColumns: 'minmax(0, 1fr) clamp(5.25rem, 27vw, 6.75rem)',
        }}
      >
        <div className="min-w-0">
          <div className="min-w-0">
            <h1
              data-testid="trip-detail-title"
              className={`line-clamp-2 min-w-0 text-lg font-black leading-6 tracking-tight [overflow-wrap:anywhere] ${t.mainText}`}
            >
              {String(meta?.title || '旅程')}
            </h1>
          </div>
          <div
            data-testid="mobile-trip-metadata"
            className={`mt-[4px] flex min-w-0 flex-wrap items-start gap-x-[8px] gap-y-[2px] text-xs font-bold leading-4 ${t.subText}`}
          >
            {dateStr ? <span>{dateStr}</span> : null}
            {meta?.destination ? (
              <span className="flex items-start gap-1.5 [overflow-wrap:anywhere]"><Icon name="location" size={15} className="mt-0.5 shrink-0" />{String(meta.destination)}</span>
            ) : null}
          </div>
          {syncStatusNode ? (
            <div data-testid="mobile-trip-sync-status" className="min-w-0">
              {syncStatusNode}
            </div>
          ) : null}
        </div>

        <div
          data-testid="mobile-trip-weather"
          className={`min-w-0 border-l pl-[8px] text-right ${t.cardBorder}`}
        >
          {weather ? (
            <>
              <span aria-hidden="true" className="block text-xl leading-none">
                {weather.icon || '🌦️'}
              </span>
              <strong
                data-testid="mobile-trip-weather-temperature"
                className={`mt-[4px] block text-xl font-black leading-6 tabular-nums [overflow-wrap:anywhere] ${t.mainText}`}
              >
                {weatherTemperature}
              </strong>
              {weather.description ? (
                <span className={`block text-xs font-bold leading-4 [overflow-wrap:anywhere] ${t.subText}`}>
                  {String(weather.description)}
                </span>
              ) : null}
              {weatherRain ? (
                <span
                  data-testid="mobile-trip-weather-rain"
                  className={`block text-xs font-bold leading-4 ${t.subText}`}
                >
                  降雨 {weatherRain}
                </span>
              ) : null}
            </>
          ) : (
            <span className={`block text-xs font-bold leading-4 ${t.subText}`}>
              天氣未載入
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
