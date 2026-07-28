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
  activeActionMenuId,
  registerActionTrigger,
  onSelect,
  onOpenDetails,
  onNavigate,
  onOpenActionMenu,
}) {
  const [expanded, setExpanded] = useState(false);
  const cardRefs = useRef({});

  useEffect(() => {
    const selectedCard = cardRefs.current[selectedEntryId];
    selectedCard?.scrollIntoView?.({
      block: 'nearest',
      inline: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [selectedEntryId]);

  return (
    <section
      data-testid="map-itinerary-sheet"
      role="region"
      aria-label={`${String(dayId)} 地圖行程`}
      aria-expanded={expanded}
      className={`absolute inset-x-0 bottom-1 z-20 flex flex-col rounded-t-3xl border-t px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-10px_30px_rgba(15,23,42,0.14)] transition-[height] ${
        expanded ? 'h-[62%]' : 'h-[clamp(9.5rem,36%,15rem)]'
      } ${t.headerBg} ${t.cardBorder}`}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        data-testid="map-sheet-toggle"
        aria-label={expanded ? '縮小地圖行程面板' : '展開地圖行程面板'}
        onClick={() => setExpanded((current) => !current)}
        className="mx-auto flex min-h-11 w-20 shrink-0 items-center justify-center"
      >
        <span className="h-1.5 w-12 rounded-full bg-slate-400/70" aria-hidden="true" />
      </button>

      {entries.length === 0 ? (
        <div
          data-testid="map-sheet-empty-state"
          className={`flex min-h-24 flex-1 items-center justify-center text-center text-xs font-bold ${t.subText}`}
        >
          這一天還沒有景點
        </div>
      ) : (
        <div
          data-testid="map-itinerary-card-scroller"
          className="scrollbar-hide flex min-h-0 flex-1 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 touch-pan-x"
          aria-label="依行程順序瀏覽景點"
        >
          {entries.map((entry) => {
            const actionMenuId = `${String(dayId)}-${entry.id}`;
            return (
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
                  actionMenuId={actionMenuId}
                  actionMenuExpanded={activeActionMenuId === actionMenuId}
                  registerActionTrigger={registerActionTrigger}
                  onSelect={onSelect}
                  onOpenDetails={onOpenDetails}
                  onNavigate={onNavigate}
                  onOpenActionMenu={(event, item) => onOpenActionMenu?.(event, dayId, item)}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
