import React from 'react';

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
      className={`relative z-50 shrink-0 border-b px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] ${t.headerBg} ${t.cardBorder}`}
    >
      <div
        data-testid="mobile-trip-utility-row"
        className="flex min-w-0 items-center justify-between gap-3"
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
        {settingsNode}
      </div>

      <div
        data-testid="mobile-trip-summary"
        className={`mt-2 grid min-w-0 gap-2 rounded-2xl border p-3 ${t.cardBg} ${t.cardBorder}`}
        style={{
          gridTemplateColumns: 'minmax(0, 1fr) clamp(5.25rem, 27vw, 6.75rem)',
        }}
      >
        <div className="min-w-0">
          <div className="min-w-0">
            <h1
              data-testid="trip-detail-title"
              className={`line-clamp-2 min-w-0 text-lg font-black leading-5 [overflow-wrap:anywhere] ${t.mainText}`}
            >
              {String(meta?.title || '旅程')}
            </h1>
          </div>
          <div
            data-testid="mobile-trip-metadata"
            className={`mt-1 grid min-w-0 gap-0.5 text-xs font-bold leading-4 ${t.subText}`}
          >
            {dateStr ? <span>{dateStr}</span> : null}
            {meta?.destination ? (
              <span className="[overflow-wrap:anywhere]">📍 {String(meta.destination)}</span>
            ) : null}
          </div>
          {syncStatusNode ? (
            <div data-testid="mobile-trip-sync-status" className="mt-1 min-w-0">
              {syncStatusNode}
            </div>
          ) : null}
        </div>

        <div
          data-testid="mobile-trip-weather"
          className={`min-w-0 border-l pl-2 text-right ${t.cardBorder}`}
        >
          {weather ? (
            <>
              <span aria-hidden="true" className="block text-xl leading-none">
                {weather.icon || '🌦️'}
              </span>
              <strong
                data-testid="mobile-trip-weather-temperature"
                className={`mt-1 block text-xl font-black leading-6 tabular-nums [overflow-wrap:anywhere] ${t.mainText}`}
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
