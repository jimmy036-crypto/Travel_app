import React, { useEffect, useMemo, useRef, useState } from 'react';

import { ParkingLayerToggle } from './ParkingLayerToggle.jsx';
import { ParkingMarkerLayer } from './ParkingMarkerLayer.jsx';
import { ParkingResultSheet } from './ParkingResultSheet.jsx';
import { SavedParkingCard } from './SavedParkingCard.jsx';
import { searchNearbyParking } from './parkingClient.js';
import { sortParkingFacilities } from './parkingRanking.js';

const validCoordinate = (value) => value !== null && value !== '' && Number.isFinite(Number(value));
const validAnchor = (anchor) => validCoordinate(anchor?.lat) && validCoordinate(anchor?.lng);

const createLayerState = (identity) => ({
  identity,
  radius: 500,
  facilities: [],
  selectedId: '',
  sort: 'best',
  status: 'idle',
  providerStatus: { google: 'idle', tdx: 'idle' },
});

export function ParkingLayerController({
  children,
  mode,
  onModeChange,
  roomId,
  dayId,
  anchor,
  placesLib,
  canEdit,
  onSavePlan,
  onRemovePlan,
  t,
  searchParking = searchNearbyParking,
  enableE2EProvider = false,
  showSavedParkingCard = true,
}) {
  const parkingAvailable = validAnchor(anchor);
  const parkingOpen = mode === 'parking' && parkingAvailable;
  const layerIdentity = JSON.stringify([
    parkingOpen ? 'open' : 'closed',
    String(roomId || ''),
    String(dayId || ''),
    String(anchor?.id || ''),
    String(anchor?.lat ?? ''),
    String(anchor?.lng ?? ''),
  ]);
  const [layerState, setLayerState] = useState(() => createLayerState(layerIdentity));
  const requestRef = useRef(null);

  // The render-prop child owns the Google Map. Keep it at one stable
  // reconciliation position and reset only the parking session when the
  // mode/day/anchor changes, otherwise selecting a place destroys the map.
  if (layerState.identity !== layerIdentity) {
    setLayerState(createLayerState(layerIdentity));
  }

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, [layerIdentity]);

  const openParking = () => {
    if (!parkingAvailable) return;
    onModeChange('parking');
  };

  const closeParking = () => {
    requestRef.current?.abort();
    requestRef.current = null;
    onModeChange('none');
  };

  const updateLayerState = (changes) => {
    setLayerState((state) => (
      state.identity === layerIdentity ? { ...state, ...changes } : state
    ));
  };

  const changeRadius = (radius) => {
    requestRef.current?.abort();
    requestRef.current = null;
    updateLayerState({
      radius,
      facilities: [],
      selectedId: '',
      status: 'idle',
      providerStatus: { google: 'idle', tdx: 'idle' },
    });
  };

  const search = async () => {
    if (!parkingOpen) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    updateLayerState({ status: 'searching' });

    try {
      const e2eProvider = enableE2EProvider
        ? globalThis.window?.__TRAVEL_E2E__?.searchParking
        : null;
      const searchImplementation = typeof e2eProvider === 'function' ? e2eProvider : searchParking;
      const result = await searchImplementation({
        roomId,
        dayId,
        placeId: String(anchor.id || ''),
        anchor: { lat: Number(anchor.lat), lng: Number(anchor.lng) },
        radius: layerState.radius,
        placesLib,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      requestRef.current = null;
      updateLayerState({
        facilities: result.facilities,
        selectedId: result.facilities[0]?.id || '',
        providerStatus: { google: result.googleStatus, tdx: result.tdxStatus },
        status: result.facilities.length ? 'ready' : 'empty',
      });
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== controller || error?.name === 'AbortError') return;
      requestRef.current = null;
      updateLayerState({
        facilities: [],
        status: 'error',
        providerStatus: { google: 'unavailable', tdx: 'unavailable' },
      });
    }
  };

  const sortedFacilities = useMemo(
    () => sortParkingFacilities(layerState.facilities, layerState.sort),
    [layerState.facilities, layerState.sort],
  );
  const errorText = t.isLight === false ? 'text-red-200' : 'text-red-700';
  const savedParkingKey = anchor?.parkingPlan
    ? String(
      anchor.parkingPlan.selectedAt
      || anchor.parkingPlan.googlePlaceId
      || anchor.parkingPlan.providerFacilityId
      || anchor.id
      || 'saved-parking',
    )
    : '';
  const savedParkingPanel = anchor?.parkingPlan ? (
    <SavedParkingCard
      plan={anchor.parkingPlan}
      onReplace={openParking}
      onRemove={() => void onRemovePlan()}
      canEdit={canEdit}
      t={t}
      placement="sheet"
    />
  ) : null;
  const markers = parkingOpen ? (
    <ParkingMarkerLayer
      facilities={sortedFacilities}
      selectedId={layerState.selectedId}
      onSelect={(selectedId) => updateLayerState({ selectedId })}
    />
  ) : null;
  const overlays = parkingOpen ? (
    <>
      <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-1.5rem)]">
        <ParkingLayerToggle
          radius={layerState.radius}
          anchorName={anchor?.customName || anchor?.name}
          onClose={closeParking}
          onRadiusChange={changeRadius}
          onSearch={() => void search()}
          searching={layerState.status === 'searching'}
          t={t}
        />
        {layerState.status === 'empty' ? <p className={`mt-2 rounded-xl border p-2 text-xs ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>{anchor?.customName || anchor?.name || '此景點'}附近找不到停車場，請調整搜尋半徑後再試。</p> : null}
        {layerState.status === 'error' ? <p role="alert" className={`mt-2 rounded-xl border p-2 text-xs ${errorText} ${t.headerBg} ${t.cardBorder}`}>停車資料暫時無法取得，請稍後重新搜尋；原行程不受影響。</p> : null}
        {layerState.providerStatus.tdx === 'not_configured' ? <p className={`mt-2 rounded-xl border p-2 text-[10px] ${t.headerBg} ${t.cardBorder} ${t.subText}`}>官方停車資料尚未啟用；仍顯示 Google Maps 停車位置。</p> : null}
        {layerState.providerStatus.tdx === 'timeout' ? <p className={`mt-2 rounded-xl border p-2 text-[10px] ${t.headerBg} ${t.cardBorder} ${t.subText}`}>官方停車資料回應逾時；目前顯示 Google Maps 停車位置。</p> : null}
        {layerState.providerStatus.tdx === 'rate_limited' ? <p className={`mt-2 rounded-xl border p-2 text-[10px] ${t.headerBg} ${t.cardBorder} ${t.subText}`}>官方停車資料查詢次數已達上限；仍顯示 Google Maps 停車位置。</p> : null}
        {layerState.providerStatus.tdx === 'access_denied' ? <p role="alert" className={`mt-2 rounded-xl border p-2 text-[10px] ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>無法確認旅程權限；請重新登入或確認你仍是旅程成員。</p> : null}
      </div>
      <ParkingResultSheet
        facilities={sortedFacilities}
        selectedId={layerState.selectedId}
        onSelect={(selectedId) => updateLayerState({ selectedId })}
        onSave={(facility) => void onSavePlan(facility)}
        canEdit={canEdit}
        anchor={anchor}
        sort={layerState.sort}
        onSortChange={(sort) => updateLayerState({ sort })}
        t={t}
      />
    </>
  ) : (mode === 'none' && showSavedParkingCard ? (
    <SavedParkingCard
      plan={anchor?.parkingPlan}
      onReplace={openParking}
      onRemove={() => void onRemovePlan()}
      canEdit={canEdit}
      t={t}
    />
  ) : null);

  return children({
    markers,
    overlays,
    openParking,
    parkingOpen,
    parkingAvailable,
    savedParkingKey: parkingOpen ? '' : savedParkingKey,
    savedParkingPanel: parkingOpen || showSavedParkingCard ? null : savedParkingPanel,
  });
}
