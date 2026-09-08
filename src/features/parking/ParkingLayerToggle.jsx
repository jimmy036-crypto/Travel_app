import React from 'react';

export function ParkingLayerToggle({ radius, anchorName, onClose, onRadiusChange, onSearch, searching, t }) {
  return (
    <div data-testid="parking-layer-controls" className={`rounded-2xl border p-2 shadow-lg ${t.headerBg} ${t.cardBorder}`}>
      <div className="flex items-center justify-between gap-2">
        <strong className={`min-w-0 text-xs ${t.mainText}`}>為 {anchorName || '此景點'} 找停車</strong>
        <button
          type="button"
          aria-label={`關閉為 ${anchorName || '此景點'} 找停車`}
          onClick={onClose}
          className={`min-h-11 min-w-11 rounded-xl text-lg font-black transition-opacity hover:opacity-70 ${t.mainText}`}
        >
          ×
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className={`text-[10px] font-black ${t.mainText}`}>
          半徑
          <select
            aria-label={`為 ${anchorName || '此景點'} 找停車的搜尋半徑`}
            value={radius}
            onChange={(event) => onRadiusChange(Number(event.target.value))}
            className={`ml-1 min-h-11 rounded-xl border bg-transparent px-2 text-base md:text-xs ${t.cardBorder}`}
          >
            <option value={300}>300m</option>
            <option value={500}>500m</option>
            <option value={1000}>1km</option>
          </select>
        </label>
        <button type="button" data-testid="parking-search-button" disabled={searching} onClick={onSearch} className="min-h-11 rounded-xl bg-blue-700 px-3 text-xs font-black text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
          {searching ? '搜尋中…' : '搜尋／重新搜尋'}
        </button>
      </div>
    </div>
  );
}
