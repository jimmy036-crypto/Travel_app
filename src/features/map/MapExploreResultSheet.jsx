import React from 'react';

const resultName = (place) => String(place?.name || '未命名地點');

export function MapExploreResultSheet({
  results,
  query,
  originItem,
  selectedPlaceId,
  onSelect,
  t,
}) {
  const safeResults = Array.isArray(results) ? results.slice(0, 8) : [];
  if (safeResults.length === 0) return null;

  const contextLabel = originItem
    ? `「${String(originItem.customName || originItem.name || '所選景點')}」附近`
    : '目前地圖區域';
  const ratingText = t.isLight === false ? 'text-orange-200' : 'text-orange-700';

  return (
    <section
      data-testid="map-explore-result-sheet"
      role="region"
      aria-label="附近搜尋結果"
      className={`absolute inset-x-2 bottom-2 z-30 max-h-[42%] overflow-y-auto rounded-3xl border p-3 shadow-2xl lg:bottom-4 lg:left-auto lg:right-4 lg:w-96 ${t.headerBg} ${t.cardBorder}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-wide ${t.subText}`}>搜尋結果</p>
          <h2 className={`truncate text-sm font-black ${t.mainText}`}>
            {query ? `${query}・` : ''}{contextLabel}
          </h2>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black ${t.cardMetaBg} ${t.mainText}`}>
          {safeResults.length} 筆
        </span>
      </div>
      <div className="grid gap-2">
        {safeResults.map((place) => {
          const id = String(place?.place_id || '');
          const selected = id !== '' && id === String(selectedPlaceId || '');
          return (
            <button
              key={id || resultName(place)}
              type="button"
              data-testid="map-explore-result"
              aria-pressed={selected}
              aria-label={`查看${resultName(place)}`}
              onClick={() => onSelect?.(place)}
              className={`min-h-11 rounded-2xl border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 ${selected ? 'border-orange-600 ring-2 ring-orange-500/25' : t.cardBorder} ${t.itemBg}`}
            >
              <div className="flex items-start justify-between gap-3">
                <strong className={`text-xs ${t.mainText}`}>{resultName(place)}</strong>
                {place?.rating ? (
                  <span className={`shrink-0 text-[10px] font-black ${ratingText}`}>★ {String(place.rating)}</span>
                ) : null}
              </div>
              <p className={`mt-1 line-clamp-2 text-[10px] ${t.subText}`}>
                {String(place?.formatted_address || place?.vicinity || '地址未提供')}
              </p>
            </button>
          );
        })}
      </div>
      <p className={`mt-2 text-[9px] ${t.subText}`} translate="no">Google Maps 搜尋結果；營業資訊請以店家公告為準。</p>
    </section>
  );
}
