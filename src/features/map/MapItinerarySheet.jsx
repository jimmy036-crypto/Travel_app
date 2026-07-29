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
}) {
  const [sheetState, setSheetState] = useState('cards');
  const cardRefs = useRef({});
  const isExpanded = sheetState === 'cards';
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
      data-state={sheetState}
      role="region"
      aria-label={`${String(dayId)} 地圖行程`}
      aria-expanded={isExpanded}
      className={`absolute inset-x-0 bottom-1 z-20 flex flex-col rounded-t-3xl border-t shadow-[0_-10px_30px_rgba(15,23,42,0.14)] transition-[height] ${
        isExpanded
          ? 'h-[clamp(10.5rem,30%,12.5rem)]'
          : 'h-[calc(4.5rem+env(safe-area-inset-bottom))]'
      } ${t.headerBg} ${t.cardBorder}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isExpanded ? (
        <>
          <button
            type="button"
            data-testid="map-sheet-toggle"
            aria-expanded="true"
            aria-label="收合為精簡列"
            onClick={() => setSheetState('peek')}
            className="mx-auto flex min-h-11 w-20 shrink-0 items-center justify-center"
          >
            <span className="h-1.5 w-12 rounded-full bg-slate-400/70" aria-hidden="true" />
          </button>

          {entries.length === 0 ? (
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
          onClick={() => setSheetState('cards')}
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
