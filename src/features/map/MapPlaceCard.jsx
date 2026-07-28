import React, { useState } from 'react';

export function MapPlaceCard({
  entry,
  selected,
  t,
  actionMenuId,
  actionMenuExpanded,
  registerActionTrigger,
  onSelect,
  onOpenDetails,
  onNavigate,
  onOpenActionMenu,
}) {
  const [failedPhotoUrl, setFailedPhotoUrl] = useState('');
  const showPhoto = Boolean(entry.photoUrl) && failedPhotoUrl !== entry.photoUrl;

  return (
    <article
      data-testid="map-place-card"
      data-place-id={entry.id}
      data-order={String(entry.order)}
      aria-selected={selected}
      className={`w-[min(72vw,15rem)] shrink-0 snap-center rounded-2xl border p-2 transition-[border-color,background-color,transform] ${
        selected
          ? 'border-blue-500 ring-2 ring-blue-500/30'
          : t.cardBorder
      } ${t.itemBg}`}
    >
      <button
        type="button"
        data-testid="map-place-card-select"
        onClick={() => {
          if (selected) onOpenDetails?.(entry.item);
          else onSelect?.(entry);
        }}
        className="w-full min-w-0 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-blue-500"
        aria-label={`${selected ? '查看' : '選擇'}第 ${entry.order} 站 ${entry.name}`}
      >
        <div className={`relative h-18 overflow-hidden rounded-xl ${t.cardMetaBg}`}>
          {showPhoto ? (
            <img
              src={entry.photoUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              onError={() => setFailedPhotoUrl(entry.photoUrl)}
            />
          ) : (
            <div
              data-testid="map-place-photo-fallback"
              className={`flex h-full items-center justify-center text-2xl ${t.subText}`}
              aria-label="沒有景點照片"
            >
              📍
            </div>
          )}
          <span className="absolute left-2 top-2 flex h-7 min-w-7 items-center justify-center rounded-full bg-blue-600 px-2 text-[10px] font-black text-white">
            {entry.order}
          </span>
        </div>
        <div className="mt-2 min-w-0">
          <p className={`text-sm font-black tabular-nums ${t.mainText}`}>
            {entry.time || '時間未定'}
          </p>
          <h3 className={`line-clamp-2 text-xs font-black leading-4 [overflow-wrap:anywhere] ${t.mainText}`}>
            {entry.name}
          </h3>
          {!entry.hasCoordinates ? (
            <span
              data-testid="map-place-no-location"
              className="mt-1 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black text-amber-600"
            >
              無定位
            </span>
          ) : null}
        </div>
      </button>

      <div className="mt-2 flex justify-end gap-1">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onNavigate?.(entry.item);
          }}
          aria-label={`導航到${entry.name}`}
          className="flex min-h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10"
        >
          🧭
        </button>
        <button
          type="button"
          data-testid="map-place-action-menu-trigger"
          aria-label={`開啟${entry.name}的景點操作`}
          aria-haspopup="menu"
          aria-expanded={actionMenuExpanded}
          aria-controls={actionMenuExpanded ? `place-action-menu-${actionMenuId}` : undefined}
          ref={(node) => registerActionTrigger?.(actionMenuId, node)}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onOpenActionMenu?.(event, entry.item);
          }}
          className={`flex min-h-11 w-11 items-center justify-center rounded-xl border text-lg font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
        >
          ⋯
        </button>
      </div>
    </article>
  );
}
