import React from 'react';

const EXPLORE_CATEGORIES = Object.freeze([
  { id: 'food', label: '餐廳', query: '餐廳' },
  { id: 'cafe', label: '咖啡', query: '咖啡廳' },
  { id: 'market', label: '超市', query: '超市' },
  { id: 'sightseeing', label: '景點', query: '景點' },
]);

const placeName = (value) => String(value || '所選景點');

export function MapExploreControls({
  open,
  query,
  scope,
  anchorName,
  anchorAvailable,
  resultCount,
  searchStatus,
  showDrivingParkingHint,
  onOpen,
  onClose,
  onScopeChange,
  onQueryChange,
  onSearch,
  onClear,
  onSelectCategory,
  onOpenParking,
  t,
}) {
  const parkingText = t.isLight === false ? 'text-blue-200' : 'text-blue-700';
  const errorText = t.isLight === false ? 'text-red-200' : 'text-red-700';
  if (!open) {
    return (
      <button
        type="button"
        data-testid="map-explore-trigger"
        aria-label="探索附近地點與停車"
        onClick={onOpen}
        className={`flex min-h-11 items-center justify-center rounded-2xl border px-3 text-xs font-black shadow-md ${t.headerBg} ${t.cardBorder} ${t.mainText}`}
      >
        探索附近
      </button>
    );
  }

  const anchored = scope === 'place' && anchorAvailable;
  const safeAnchorName = placeName(anchorName);
  const searchLabel = anchored
    ? `搜尋${safeAnchorName}附近`
    : '搜尋目前地圖區域';
  const searching = searchStatus === 'searching';

  return (
    <section
      data-testid="map-explore-controls"
      data-expanded="true"
      aria-label="地圖附近搜尋"
      className={`rounded-2xl border p-2 shadow-lg ${t.headerBg} ${t.cardBorder}`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-wide ${t.subText}`}>
            {anchored ? '找這站附近' : '探索目前區域'}
          </p>
          <p className={`truncate text-xs font-black ${t.mainText}`}>
            {anchored ? safeAnchorName : '依目前地圖畫面搜尋'}
          </p>
        </div>
        <button
          type="button"
          aria-label="關閉附近搜尋"
          onClick={onClose}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl text-lg font-black ${t.mainText}`}
        >
          ×
        </button>
      </div>

      <div role="group" aria-label="附近搜尋範圍" className={`mt-1 grid grid-cols-2 rounded-xl p-1 ${t.cardMetaBg}`}>
        <button
          type="button"
          aria-pressed={!anchored}
          onClick={() => onScopeChange?.('map')}
          className={`min-h-11 rounded-lg px-2 text-[11px] font-black ${!anchored ? 'bg-blue-700 text-white shadow-sm' : t.mainText}`}
        >
          目前區域
        </button>
        <button
          type="button"
          aria-pressed={anchored}
          disabled={!anchorAvailable}
          onClick={() => onScopeChange?.('place')}
          className={`min-h-11 rounded-lg px-2 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-45 ${anchored ? 'bg-blue-700 text-white shadow-sm' : t.mainText}`}
        >
          這站附近
        </button>
      </div>

      <form
        role="search"
        className="mt-2 flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          onSearch?.();
        }}
      >
        <input
          value={String(query || '')}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder={anchored ? `搜尋「${safeAnchorName}」附近` : '搜尋目前地圖區域'}
          aria-label={searchLabel}
          className={`min-h-11 min-w-0 flex-1 rounded-xl border bg-transparent px-3 text-base font-bold outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:text-xs ${t.cardBorder} ${t.mainText}`}
        />
        <button
          type="submit"
          disabled={searching}
          className="min-h-11 rounded-xl bg-orange-700 px-3 text-xs font-black text-white transition-colors hover:bg-orange-800 disabled:cursor-wait disabled:opacity-60"
        >
          {searching ? '搜尋中…' : '搜尋'}
        </button>
        {resultCount > 0 || query ? (
          <button
            type="button"
            onClick={onClear}
            className={`min-h-11 rounded-xl px-2 text-[11px] font-black ${t.mainText}`}
          >
            清除
          </button>
        ) : null}
      </form>

      <div className="scrollbar-hide mt-2 flex gap-2 overflow-x-auto overscroll-x-contain pb-0.5 touch-pan-x" aria-label="附近地點分類">
        {EXPLORE_CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory?.(category.query)}
            className={`min-h-11 shrink-0 rounded-xl border px-3 text-[11px] font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
          >
            {category.label}
          </button>
        ))}
        <button
          type="button"
          data-testid="parking-layer-trigger"
          disabled={!anchored}
          aria-label={anchored ? `為${safeAnchorName}尋找停車場` : '請先切換到這站附近'}
          onClick={onOpenParking}
          className={`min-h-11 shrink-0 rounded-xl border border-blue-600/35 bg-blue-600/10 px-3 text-[11px] font-black disabled:cursor-not-allowed disabled:opacity-45 ${parkingText}`}
        >
          這站停車
        </button>
      </div>

      {searchStatus === 'empty' ? (
        <p role="status" className={`mt-1 px-1 text-[10px] font-bold ${t.subText}`}>
          找不到符合結果，請改用其他關鍵字或調整搜尋範圍。
        </p>
      ) : null}
      {searchStatus === 'error' ? (
        <p role="alert" className={`mt-1 px-1 text-[10px] font-bold ${errorText}`}>
          附近搜尋暫時失敗，請稍後再試。
        </p>
      ) : null}

      {showDrivingParkingHint && anchored ? (
        <p data-testid="parking-driving-hint" className={`mt-1 px-1 text-[10px] font-bold ${t.subText}`}>
          開車前往這站？可先比較附近停車場，再決定是否儲存。
        </p>
      ) : null}
    </section>
  );
}
