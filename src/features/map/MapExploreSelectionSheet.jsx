import React, { useEffect, useRef } from 'react';

const placeName = (place) => String(place?.name || '未命名地點');

export function MapExploreSelectionSheet({
  place,
  originItem,
  onBack,
  onShowDetails,
  onAdd,
  dayLabel,
  isAdding = false,
  isFetchingDetails = false,
  detailsError = '',
  t,
}) {
  const sheetRef = useRef(null);
  const headingId = React.useId();

  useEffect(() => {
    sheetRef.current?.focus();
  }, [place?.place_id]);

  if (!place) return null;

  const ratingText = t.isLight === false ? 'text-orange-200' : 'text-orange-700';
  const errorText = t.isLight === false ? 'text-red-200' : 'text-red-700';
  const targetDayLabel = String(dayLabel || '目前日期');

  return (
    <section
      ref={sheetRef}
      data-testid="map-explore-selection-sheet"
      data-place-id={String(place.place_id || '')}
      role="region"
      aria-labelledby={headingId}
      tabIndex={-1}
      className={`absolute inset-x-2 bottom-2 z-50 max-h-[42%] overflow-y-auto overscroll-contain rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl outline-none focus-visible:ring-2 focus-visible:ring-blue-500 lg:bottom-4 lg:left-auto lg:right-4 lg:w-96 ${t.headerBg} ${t.cardBorder}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        onBack?.();
      }}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 id={headingId} className={`min-w-0 break-words text-base font-black leading-tight ${t.mainText}`}>
          {placeName(place)}
        </h3>
        <button
          type="button"
          aria-label="返回附近搜尋結果"
          onClick={onBack}
          className={`-mr-1 -mt-1 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold ${t.cardMetaBg} ${t.mainText}`}
        >
          ×
        </button>
      </div>
      <p className={`mb-3 line-clamp-2 break-words text-sm leading-relaxed ${t.subText}`}>
        {String(place.formatted_address || place.vicinity || '地址未提供')}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {place.rating ? (
          <span className={`rounded-md border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-sm font-bold ${ratingText}`}>
            ★ {String(place.rating)}
          </span>
        ) : null}
        {place.user_ratings_total ? (
          <span className={`text-sm font-bold ${t.subText}`}>
            ({String(place.user_ratings_total)} 則評論)
          </span>
        ) : null}
      </div>
      <p data-testid="map-explore-add-target" className={`mb-2 text-sm font-bold ${t.subText}`}>
        將加入 {targetDayLabel}
      </p>
      <button
        type="button"
        onClick={onShowDetails}
        disabled={isFetchingDetails}
        aria-busy={isFetchingDetails}
        className={`min-h-11 w-full rounded-xl border px-3 text-sm font-bold shadow-sm transition-colors disabled:cursor-wait disabled:opacity-60 ${t.cardMetaBg} ${t.cardBorder} ${t.mainText}`}
      >
        {isFetchingDetails ? '正在載入詳情…' : detailsError ? '重試載入詳情' : '查看詳情與實景照'}
      </button>
      {detailsError ? (
        <p role="alert" className={`mt-2 text-sm font-bold ${errorText}`}>
          {String(detailsError)}
        </p>
      ) : null}
      {originItem ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            aria-label={`加到 ${targetDayLabel}：這站前`}
            onClick={() => onAdd?.('before')}
            disabled={isAdding}
            aria-busy={isAdding}
            className="min-h-11 flex-1 rounded-xl bg-blue-700 px-3 text-sm font-bold text-white shadow-md active:scale-95 disabled:cursor-wait disabled:opacity-60"
          >
            {isAdding ? '加入中…' : '加在這站前'}
          </button>
          <button
            type="button"
            aria-label={`加到 ${targetDayLabel}：這站後`}
            onClick={() => onAdd?.('after')}
            disabled={isAdding}
            aria-busy={isAdding}
            className="min-h-11 flex-1 rounded-xl bg-emerald-700 px-3 text-sm font-bold text-white shadow-md active:scale-95 disabled:cursor-wait disabled:opacity-60"
          >
            {isAdding ? '加入中…' : '加在這站後'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          aria-label={`加入 ${targetDayLabel} 行程最後`}
          onClick={() => onAdd?.('end')}
          disabled={isAdding}
          aria-busy={isAdding}
          className="mt-2 min-h-11 w-full rounded-xl bg-blue-700 px-3 text-sm font-bold text-white shadow-md active:scale-95 disabled:cursor-wait disabled:opacity-60"
        >
          {isAdding ? '加入中…' : '加入行程最後'}
        </button>
      )}
      {isAdding ? (
        <p role="status" className={`mt-2 text-sm font-bold ${t.subText}`}>
          正在加入 {targetDayLabel}，請稍候…
        </p>
      ) : null}
    </section>
  );
}
