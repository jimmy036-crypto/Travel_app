import React from 'react';

export function ParkingLayerToggle({ open, radius, onOpen, onClose, onRadiusChange, onSearch, searching, disabled, t }) {
  if (!open) {
    return (
      <button
        type="button"
        data-testid="parking-layer-trigger"
        disabled={disabled}
        onClick={onOpen}
        className={`min-h-11 rounded-2xl border px-3 text-xs font-black shadow-md ${t.headerBg} ${t.cardBorder} ${t.mainText} disabled:opacity-50`}
      >
        附近停車
      </button>
    );
  }
  return (
    <div data-testid="parking-layer-controls" className={`flex flex-wrap items-center gap-2 rounded-2xl border p-2 shadow-lg ${t.headerBg} ${t.cardBorder}`}>
      <label className={`text-[10px] font-black ${t.mainText}`}>
        半徑
        <select
          aria-label="停車搜尋半徑"
          value={radius}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
          className={`ml-1 min-h-11 rounded-xl border bg-transparent px-2 ${t.cardBorder}`}
        >
          <option value={300}>300m</option>
          <option value={500}>500m</option>
          <option value={1000}>1km</option>
        </select>
      </label>
      <button type="button" data-testid="parking-search-button" disabled={searching} onClick={onSearch} className="min-h-11 rounded-xl bg-blue-700 px-3 text-xs font-black text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
        {searching ? '搜尋中…' : '搜尋／重新搜尋'}
      </button>
      <button type="button" aria-label="關閉附近停車" onClick={onClose} className={`min-h-11 min-w-11 rounded-xl text-lg font-black ${t.mainText}`}>×</button>
    </div>
  );
}
