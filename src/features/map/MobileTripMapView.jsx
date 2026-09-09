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

const prefersReducedMotion = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
);

const getCurrentZoom = (map) => {
  const zoom = Number(map?.getZoom?.());
  return Number.isFinite(zoom) ? zoom : null;
};

function MapCameraController({
  request,
  active,
}) {
  const map = useMap('main-map');

  useEffect(() => {
    if (!active || !map || request.type === 'idle') return;

    const reducedMotion = prefersReducedMotion();

    if (request.type === 'focus') {
      if (!request.position) return;

      const currentZoom = getCurrentZoom(map);
      const focusZoom = currentZoom === null ? 16 : Math.max(16, currentZoom);

      if (reducedMotion && map.moveCamera) {
        map.moveCamera({ center: request.position, zoom: focusZoom });
        return;
      }

      map.panTo?.(request.position);
      if (currentZoom === null || currentZoom < 16) map.setZoom?.(16);
      if (request.offsetForSheet && map.panBy) {
        const idleListener = window.google?.maps?.event?.addListenerOnce?.(
          map,
          'idle',
          () => map.panBy(0, 72),
        );
        if (!idleListener) map.panBy(0, 72);
        return () => idleListener?.remove?.();
      }
      return;
    }

    const positions = Array.isArray(request.positions) ? request.positions : [];
    if (positions.length === 0) return;

    if (positions.length === 1) {
      if (reducedMotion && map.moveCamera) {
        map.moveCamera({ center: positions[0], zoom: 15 });
      } else {
        map.panTo?.(positions[0]);
        map.setZoom?.(15);
      }
      return;
    }

    const Bounds = window.google?.maps?.LatLngBounds;
    if (!Bounds || !map.fitBounds) return;

    const bounds = new Bounds();
    positions.forEach((position) => bounds.extend(position));
    map.fitBounds(bounds, { top: 88, bottom: 240, left: 36, right: 36 });
  }, [active, map, request]);

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
  selectedExplorePlaceId = '',
  onSelectExploreItem,
  onRouteCalculated,
  onOpenDetails,
  selectedPlaceId,
  onSelectedPlaceChange,
  mapExtraMarkers,
  savedParkingKey = '',
  savedParkingPanel = null,
  hideItinerarySheet = false,
  focusResetRequest = 0,
  dimItinerary = false,
}) {
  const apiStatus = useApiLoadingStatus();
  const entries = useMemo(
    () => buildMapItineraryEntries(itinerary?.[dayId]),
    [dayId, itinerary],
  );
  const validEntries = useMemo(() => getValidMapEntries(entries), [entries]);
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id || '');
  const [cameraRequest, setCameraRequest] = useState({
    type: 'idle',
    key: 0,
    dayId,
    focusResetRequest,
  });
  const effectiveCameraRequest = cameraRequest.dayId === dayId
    && cameraRequest.focusResetRequest === focusResetRequest
    ? cameraRequest
    : { type: 'idle', key: cameraRequest.key, dayId, focusResetRequest };
  const routeState = useMemo(
    () => getRouteDisplayState(entries.map((entry) => entry.item), durations),
    [durations, entries],
  );

  const requestedSelectedEntryId = selectedPlaceId ?? selectedEntryId;
  const effectiveSelectedEntryId = entries.some((entry) => entry.id === requestedSelectedEntryId)
    ? requestedSelectedEntryId
    : (entries[0]?.id || '');
  const apiUnavailable = (
    apiStatus === APILoadingStatus.FAILED
    || apiStatus === APILoadingStatus.AUTH_FAILURE
  );
  const apiLoading = (
    apiStatus === APILoadingStatus.NOT_LOADED
    || apiStatus === APILoadingStatus.LOADING
  );

  const requestEntryFocus = (entry) => {
    setCameraRequest((request) => ({
      type: entry?.position ? 'focus' : 'idle',
      position: entry?.position,
      offsetForSheet: !hideItinerarySheet,
      key: request.key + 1,
      dayId,
      focusResetRequest,
    }));
  };

  const selectEntry = (entry) => {
    setSelectedEntryId(entry.id);
    onSelectedPlaceChange?.(entry.id);
    requestEntryFocus(entry);
  };

  const showFullDay = () => {
    setCameraRequest((request) => ({
      type: 'overview',
      positions: validEntries.map((entry) => entry.position),
      key: request.key + 1,
      dayId,
      focusResetRequest,
    }));
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
          <MapCameraController
            request={effectiveCameraRequest}
            active={active}
          />

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
                    className={`flex h-7 w-7 rotate-45 items-center justify-center rounded-full rounded-br-none border-2 shadow-md transition-[transform,opacity] ${
                      selected
                        ? 'scale-110 border-white bg-blue-700 ring-2 ring-blue-500/50'
                        : `border-white bg-blue-600 ${dimItinerary ? 'scale-90 opacity-45' : ''}`
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
              const selected = String(place.place_id || '') === String(selectedExplorePlaceId || '');
              return (
                <AdvancedMarker
                  key={String(place.place_id)}
                  position={{
                    lat: Number(place.geometry.location.lat()),
                    lng: Number(place.geometry.location.lng()),
                  }}
                  onClick={() => onSelectExploreItem?.(place)}
                  zIndex={selected ? 50 : undefined}
                >
                  <button
                    type="button"
                    data-testid="map-explore-marker"
                    data-place-id={String(place.place_id || '')}
                    aria-label={String(place.name || '探索結果')}
                    aria-pressed={selected}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelectExploreItem?.(place);
                    }}
                    className="flex h-11 w-11 items-center justify-center bg-transparent"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-white text-sm shadow-md transition-transform ${selected ? 'scale-110 ring-2 ring-orange-500/60' : ''}`}
                      style={{ backgroundColor: icon.bg }}
                    >
                      {icon.text}
                    </span>
                  </button>
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

      {!apiUnavailable && effectiveCameraRequest.type === 'focus' && !hideItinerarySheet ? (
        <button
          type="button"
          data-testid="map-show-full-day"
          onClick={showFullDay}
          className={`absolute left-3 top-3 z-20 flex min-h-11 items-center justify-center rounded-2xl border px-4 text-xs font-black shadow-md ${t.headerBg} ${t.cardBorder} ${t.mainText}`}
        >
          顯示全日
        </button>
      ) : null}

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
          onOpenDetails={(item) => {
            const entry = entries.find((candidate) => candidate.item === item);
            requestEntryFocus(entry);
            onOpenDetails?.(item, dayId);
          }}
          savedParkingKey={savedParkingKey}
          savedParkingPanel={savedParkingPanel}
        />
      ) : null}
    </div>
  );
}
