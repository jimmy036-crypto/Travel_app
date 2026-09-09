import React, { useEffect, useRef, useState } from 'react';

import { MapPlaceCard } from './MapPlaceCard.jsx';

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

export function MapItinerarySheet({
  dayId,
  entries,
  selectedEntryId,
  t,
  onSelect,
  onOpenDetails,
  savedParkingKey = '',
  savedParkingPanel = null,
}) {
  const [sheetState, setSheetState] = useState('cards');
  const [managedParkingKey, setManagedParkingKey] = useState('');
  const cardRefs = useRef({});
  const showingSavedParking = sheetState === 'saved-parking'
    && Boolean(savedParkingPanel)
    && managedParkingKey === savedParkingKey;
  const effectiveSheetState = sheetState === 'saved-parking' && !showingSavedParking
    ? 'cards'
    : sheetState;
  const isExpanded = effectiveSheetState !== 'peek';
  const manageParkingText = t.isLight === false ? 'text-blue-200' : 'text-blue-700';
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) || null;

  useEffect(() => {
    if (!isExpanded) return;
    const selectedCard = cardRefs.current[selectedEntryId];
    selectedCard?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [isExpanded, selectedEntryId]);

  const peekLabel = selectedEntry
    ? `${selectedEntry.time ? `${selectedEntry.time} ・ ` : ''}${selectedEntry.name}`
    : (entries.length > 0 ? `今日 ${entries.length} 個景點` : '展開今日行程');

  return (
    <section
      data-testid="map-itinerary-sheet"
      data-state={effectiveSheetState}
      role="region"
      aria-label={`${String(dayId)} 地圖行程`}
      aria-expanded={isExpanded}
      className={`absolute inset-x-0 bottom-1 z-20 flex flex-col rounded-t-3xl border-t shadow-[0_-10px_30px_rgba(15,23,42,0.14)] transition-[height] ${
        isExpanded
          ? (showingSavedParking ? 'h-[clamp(13rem,38%,16rem)]' : 'h-[clamp(10.5rem,30%,12.5rem)]')
          : 'h-[calc(4.5rem+env(safe-area-inset-bottom))]'
      } ${t.headerBg} ${t.cardBorder}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isExpanded ? (
        <>
          {showingSavedParking ? (
            <div className="flex min-h-11 shrink-0 items-center justify-between gap-2 px-3">
              <button
                type="button"
                data-testid="map-saved-parking-back"
                onClick={() => {
                  setManagedParkingKey('');
                  setSheetState('cards');
                }}
                className={`flex min-h-11 items-center rounded-xl px-2 text-xs font-black ${t.mainText}`}
              >
                ← 返回行程
              </button>
              <strong className={`truncate text-xs ${t.mainText}`}>已選停車場</strong>
            </div>
          ) : (
            <div className="relative flex min-h-11 shrink-0 items-center justify-center px-3">
              <button
                type="button"
                data-testid="map-sheet-toggle"
                aria-expanded="true"
                aria-label="收合為精簡列"
                onClick={() => setSheetState('peek')}
                className="flex min-h-11 w-20 items-center justify-center"
              >
                <span className="h-1.5 w-12 rounded-full bg-slate-400/70" aria-hidden="true" />
              </button>
              {savedParkingPanel ? (
                <button
                  type="button"
                  data-testid="map-saved-parking-manage"
                  onClick={() => {
                    setManagedParkingKey(savedParkingKey);
                    setSheetState('saved-parking');
                  }}
                  className={`absolute right-3 flex min-h-11 items-center rounded-xl px-2 text-[10px] font-black ${manageParkingText}`}
                >
                  管理停車
                </button>
              ) : null}
            </div>
          )}

          {showingSavedParking ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {savedParkingPanel}
            </div>
          ) : entries.length === 0 ? (
            <div
              data-testid="map-sheet-empty-state"
              className={`flex min-h-24 flex-1 items-center justify-center px-3 text-center text-xs font-bold ${t.subText}`}
            >
              這一天還沒有景點
            </div>
          ) : (
            <div
              data-testid="map-itinerary-card-scroller"
              className="scrollbar-hide flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] touch-pan-x"
              aria-label="依行程順序瀏覽景點"
            >
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  ref={(node) => {
                    if (node) cardRefs.current[entry.id] = node;
                    else delete cardRefs.current[entry.id];
                  }}
                >
                  <MapPlaceCard
                    entry={entry}
                    selected={entry.id === selectedEntryId}
                    t={t}
                    onSelect={onSelect}
                    onOpenDetails={onOpenDetails}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <button
          type="button"
          data-testid="map-sheet-peek"
          aria-expanded="false"
          aria-label={`展開地圖行程面板：${peekLabel}`}
          onClick={() => {
            setManagedParkingKey('');
            setSheetState('cards');
          }}
          className="flex min-h-11 w-full flex-1 items-center gap-2 px-4 pb-[env(safe-area-inset-bottom)]"
        >
          <span className="h-1.5 w-12 shrink-0 rounded-full bg-slate-400/70" aria-hidden="true" />
          <span
            data-testid="map-sheet-peek-label"
            className={`min-w-0 flex-1 truncate text-left text-xs font-black ${t.mainText}`}
          >
            {peekLabel}
          </span>
        </button>
      )}
    </section>
  );
}
