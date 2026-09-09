import React from 'react';

const placeName = (place) => String(place?.name || '未命名地點');

export function MapExploreSelectionSheet({
  place,
  originItem,
  onBack,
  onShowDetails,
  onAdd,
  t,
}) {
  if (!place) return null;

  const ratingText = t.isLight === false ? 'text-orange-200' : 'text-orange-700';

  return (
    <section
      data-testid="map-explore-selection-sheet"
      role="region"
      aria-label="所選附近地點"
      className={`absolute inset-x-2 bottom-2 z-50 max-h-[42%] overflow-y-auto overscroll-contain rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl lg:bottom-4 lg:left-auto lg:right-4 lg:w-96 ${t.headerBg} ${t.cardBorder}`}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className={`min-w-0 break-words text-base font-black leading-tight ${t.mainText}`}>
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
      <p className={`mb-3 line-clamp-2 break-words text-[11px] ${t.subText}`}>
        {String(place.formatted_address || place.vicinity || '地址未提供')}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {place.rating ? (
          <span className={`rounded-md border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-[11px] font-bold ${ratingText}`}>
            ★ {String(place.rating)}
          </span>
        ) : null}
        {place.user_ratings_total ? (
          <span className={`text-[10px] font-bold ${t.subText}`}>
            ({String(place.user_ratings_total)} 則評論)
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onShowDetails}
        className={`min-h-11 w-full rounded-xl border px-3 text-xs font-bold shadow-sm transition-colors ${t.cardMetaBg} ${t.cardBorder} ${t.mainText}`}
      >
        查看詳情與實景照
      </button>
      {originItem ? (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => onAdd?.('before')}
            className="min-h-11 flex-1 rounded-xl bg-blue-700 px-3 text-[11px] font-bold text-white shadow-md active:scale-95"
          >
            加在這站前
          </button>
          <button
            type="button"
            onClick={() => onAdd?.('after')}
            className="min-h-11 flex-1 rounded-xl bg-emerald-700 px-3 text-[11px] font-bold text-white shadow-md active:scale-95"
          >
            加在這站後
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onAdd?.('end')}
          className="mt-2 min-h-11 w-full rounded-xl bg-blue-700 px-3 text-xs font-bold text-white shadow-md active:scale-95"
        >
          加入行程最後
        </button>
      )}
    </section>
  );
}
