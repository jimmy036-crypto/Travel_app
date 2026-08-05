import React, { useEffect, useMemo, useState } from 'react';
import {
  APILoadingStatus,
  AdvancedMarker,
  Map,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';

import { Directions } from '../../components/UIComponents.jsx';
import { MAP_ID } from '../../constants.js';
import { getExploreIcon } from '../../helpers.js';
import {
  buildMapItineraryEntries,
  getRouteDisplayState,
  getValidMapEntries,
} from './mapItineraryModel.js';
import { MapItinerarySheet } from './MapItinerarySheet.jsx';

function MapSelectionController({ entry, active }) {
  const map = useMap('main-map');

  useEffect(() => {
    if (!active || !map || !entry?.position) return;
    map.panTo(entry.position);
  }, [active, entry, map]);

  return null;
}

export function MobileTripMapView({
  active,
  itinerary,
  dayId,
  durations,
  t,
  exploreQuery,
  exploreResults,
  onExploreQueryChange,
  onExploreSearch,
  onClearExplore,
  onSelectExploreItem,
  onRouteCalculated,
  onOpenDetails,
  selectedPlaceId,
  onSelectedPlaceChange,
  mapExtraMarkers,
  exploreDisabled = false,
  onExploreOpen,
  hideItinerarySheet = false,
}) {
  const apiStatus = useApiLoadingStatus();
  const entries = useMemo(
    () => buildMapItineraryEntries(itinerary?.[dayId]),
    [dayId, itinerary],
  );
  const validEntries = useMemo(() => getValidMapEntries(entries), [entries]);
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id || '');
  const [exploreOpen, setExploreOpen] = useState(false);
  const routeState = useMemo(
    () => getRouteDisplayState(entries.map((entry) => entry.item), durations),
    [durations, entries],
  );

  const requestedSelectedEntryId = selectedPlaceId ?? selectedEntryId;
  const effectiveSelectedEntryId = entries.some((entry) => entry.id === requestedSelectedEntryId)
    ? requestedSelectedEntryId
    : (entries[0]?.id || '');
  const selectedEntry = entries.find((entry) => entry.id === effectiveSelectedEntryId) || null;
  const apiUnavailable = (
    apiStatus === APILoadingStatus.FAILED
    || apiStatus === APILoadingStatus.AUTH_FAILURE
  );
  const apiLoading = (
    apiStatus === APILoadingStatus.NOT_LOADED
    || apiStatus === APILoadingStatus.LOADING
  );

  const selectEntry = (entry) => {
    setSelectedEntryId(entry.id);
    onSelectedPlaceChange?.(entry.id);
  };

  return (
    <div data-testid="mobile-trip-map-view" className="relative h-full min-h-0 w-full overflow-hidden">
      {apiUnavailable ? (
        <div
          data-testid="map-api-unavailable-state"
          className={`absolute inset-0 flex items-start justify-center px-6 pt-20 text-center ${t.cardMetaBg}`}
        >
          <div className={`max-w-xs rounded-2xl border p-4 ${t.modalBg} ${t.cardBorder}`}>
            <p className={`text-sm font-black ${t.mainText}`}>地圖服務暫時無法使用</p>
            <p className={`mt-1 text-xs ${t.subText}`}>仍可從下方行程卡選擇並查看景點詳情。</p>
          </div>
        </div>
      ) : (
        <Map
          id="main-map"
          data-testid="mobile-google-map"
          style={{ width: '100%', height: '100%' }}
          defaultCenter={{ lat: 22.99, lng: 120.20 }}
          defaultZoom={13}
          mapId={MAP_ID}
          gestureHandling="greedy"
          disableDefaultUI={false}
        >
          <Directions
            itinerary={itinerary}
            dayId={dayId}
            onRouteCalculated={onRouteCalculated}
          />
          <MapSelectionController entry={selectedEntry} active={active} />

          {validEntries.map((entry) => {
            const selected = entry.id === effectiveSelectedEntryId;
            return (
              <AdvancedMarker
                key={entry.id}
                position={entry.position}
                onClick={() => selectEntry(entry)}
                zIndex={selected ? 20 : entry.order}
              >
                <button
                  type="button"
                  data-testid="map-itinerary-marker"
                  data-place-id={entry.id}
                  data-order={String(entry.order)}
                  aria-label={`第 ${entry.order} 站 ${entry.name}`}
                  aria-pressed={selected}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectEntry(entry);
                  }}
                  // The visible pin is smaller than the touch target, so markers
                  // stay tappable without crowding the map.
                  className="flex h-11 w-11 items-center justify-center bg-transparent"
                >
                  {/* A circle with one square corner, rotated 45°, reads as an
                      inverted teardrop with the point at the bottom. */}
                  <span
                    data-testid="map-itinerary-marker-pin"
                    className={`flex h-7 w-7 rotate-45 items-center justify-center rounded-full rounded-br-none border-2 shadow-md transition-transform ${
                      selected
                        ? 'scale-110 border-white bg-blue-700 ring-2 ring-blue-500/50'
                        : 'border-white bg-blue-600'
                    }`}
                  >
                    <span className="-rotate-45 text-[11px] font-black leading-none text-white">
                      {entry.order}
                    </span>
                  </span>
                </button>
              </AdvancedMarker>
            );
          })}

          {mapExtraMarkers}

          {(Array.isArray(exploreResults) ? exploreResults : [])
            .filter((place) => place?.geometry?.location)
            .map((place) => {
              const icon = getExploreIcon(exploreQuery);
              return (
                <AdvancedMarker
                  key={String(place.place_id)}
                  position={{
                    lat: Number(place.geometry.location.lat()),
                    lng: Number(place.geometry.location.lng()),
                  }}
                  onClick={() => onSelectExploreItem?.(place)}
                >
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-sm shadow-md"
                    style={{ backgroundColor: icon.bg }}
                    aria-label={String(place.name || '探索結果')}
                  >
                    {icon.text}
                  </span>
                </AdvancedMarker>
              );
            })}
        </Map>
      )}

      {apiLoading ? (
        <div
          data-testid="map-loading-state"
          className="pointer-events-none absolute inset-x-0 top-16 z-10 flex justify-center"
        >
          <span className={`rounded-full border px-3 py-2 text-[10px] font-black ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>
            正在載入地圖…
          </span>
        </div>
      ) : null}

      {entries.length > 0 && validEntries.length === 0 ? (
        <div
          data-testid="map-no-valid-coordinates"
          className="pointer-events-none absolute inset-x-3 top-20 z-10 text-center"
        >
          <span className={`inline-flex rounded-xl border px-3 py-2 text-[10px] font-black ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>
            本日景點尚無有效定位
          </span>
        </div>
      ) : null}

      {!exploreDisabled ? <div
        data-testid="map-explore-controls"
        data-expanded={exploreOpen}
        className={`absolute top-3 z-20 ${exploreOpen ? 'inset-x-3' : 'right-3'}`}
      >
        {exploreOpen ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onExploreSearch?.(exploreQuery, null);
            }}
            className={`flex items-center gap-1 rounded-2xl border p-1.5 shadow-md ${t.headerBg} ${t.cardBorder}`}
          >
            <input
              autoFocus
              value={String(exploreQuery || '')}
              onChange={(event) => onExploreQueryChange?.(event.target.value)}
              placeholder="探索周邊"
              aria-label="探索周邊"
              className={`min-h-10 min-w-0 flex-1 bg-transparent px-2 text-xs font-bold outline-none ${t.mainText}`}
            />
            <button
              type="submit"
              className="min-h-10 rounded-xl bg-orange-500 px-3 text-[10px] font-black text-white"
            >
              搜尋
            </button>
            {exploreResults.length > 0 ? (
              <button
                type="button"
                onClick={onClearExplore}
                className={`min-h-10 rounded-xl px-2 text-[10px] font-black ${t.mainText}`}
              >
                清除
              </button>
            ) : null}
            <button
              type="button"
              aria-label="關閉周邊搜尋"
              onClick={() => setExploreOpen(false)}
              className={`flex min-h-10 min-w-10 items-center justify-center rounded-xl text-lg font-black ${t.mainText}`}
            >
              ×
            </button>
          </form>
        ) : (
          <button
            type="button"
            data-testid="map-explore-trigger"
            aria-label="搜尋周邊景點"
            onClick={() => { onExploreOpen?.(); setExploreOpen(true); }}
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-lg shadow-md ${t.headerBg} ${t.cardBorder} ${t.mainText}`}
          >
            🔍
          </button>
        )}
      </div> : null}

      {routeState.message ? (
        <div
          data-testid="map-route-state"
          data-state={routeState.state}
          className="pointer-events-none absolute inset-x-3 top-16 z-10 flex justify-center"
        >
          <span className={`rounded-full border px-3 py-1.5 text-[9px] font-bold ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>
            {routeState.message}
          </span>
        </div>
      ) : null}

      {active && !hideItinerarySheet ? (
        <MapItinerarySheet
          dayId={dayId}
          entries={entries}
          selectedEntryId={effectiveSelectedEntryId}
          t={t}
          onSelect={selectEntry}
          onOpenDetails={(item) => onOpenDetails?.(item, dayId)}
        />
      ) : null}
    </div>
  );
}
