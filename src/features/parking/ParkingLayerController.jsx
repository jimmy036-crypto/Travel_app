import React, { useEffect, useMemo, useRef, useState } from 'react';

import { ParkingLayerToggle } from './ParkingLayerToggle.jsx';
import { ParkingMarkerLayer } from './ParkingMarkerLayer.jsx';
import { ParkingResultSheet } from './ParkingResultSheet.jsx';
import { SavedParkingCard } from './SavedParkingCard.jsx';
import { searchNearbyParking } from './parkingClient.js';
import { sortParkingFacilities } from './parkingRanking.js';

const validAnchor = (anchor) => Number.isFinite(Number(anchor?.lat)) && Number.isFinite(Number(anchor?.lng));
const dismissedDrivingHints = new Set();

export function ParkingLayerController({
  children,
  mode,
  onModeChange,
  anchor,
  placesLib,
  canEdit,
  isDriving,
  onSavePlan,
  onRemovePlan,
  t,
  searchParking = searchNearbyParking,
}) {
  const [radius, setRadius] = useState(500);
  const [facilities, setFacilities] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [sort, setSort] = useState('best');
  const [status, setStatus] = useState('idle');
  const [providerStatus, setProviderStatus] = useState({ google: 'idle', tdx: 'idle' });
  const [hintDismissed, setHintDismissed] = useState(() => dismissedDrivingHints.has(String(anchor?.id || '')));
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const open = () => {
    if (!validAnchor(anchor)) return;
    onModeChange('parking');
  };
  const close = () => {
    requestRef.current?.abort();
    setFacilities([]);
    setSelectedId('');
    setStatus('idle');
    onModeChange('none');
  };
  const search = async () => {
    if (!validAnchor(anchor)) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus('searching');
    try {
      const result = await searchParking({
        anchor: { lat: Number(anchor.lat), lng: Number(anchor.lng) },
        radius,
        placesLib,
        signal: controller.signal,
      });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setFacilities(result.facilities);
      setSelectedId(result.facilities[0]?.id || '');
      setProviderStatus({ google: result.googleStatus, tdx: result.tdxStatus });
      setStatus(result.facilities.length ? 'ready' : 'empty');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      setFacilities([]);
      setStatus('error');
      setProviderStatus({ google: 'unavailable', tdx: 'unavailable' });
    }
  };
  const sortedFacilities = useMemo(() => sortParkingFacilities(facilities, sort), [facilities, sort]);
  const parkingOpen = mode === 'parking';
  const markers = parkingOpen ? (
    <ParkingMarkerLayer facilities={sortedFacilities} selectedId={selectedId} onSelect={setSelectedId} />
  ) : null;

  return children({
    markers,
    overlays: (
      <>
        <div className="absolute left-3 top-3 z-30 max-w-[calc(100%-1.5rem)]">
          <ParkingLayerToggle
            open={parkingOpen}
            radius={radius}
            onOpen={open}
            onClose={close}
            onRadiusChange={setRadius}
            onSearch={() => void search()}
            searching={status === 'searching'}
            disabled={!validAnchor(anchor)}
            t={t}
          />
          {!parkingOpen && isDriving && !hintDismissed && validAnchor(anchor) ? (
            <div data-testid="parking-driving-hint" className={`mt-2 flex items-center gap-1 rounded-xl border p-2 text-[10px] shadow-md ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>
              <button type="button" className="min-h-11 font-black" onClick={open}>開車前往？查看附近停車</button>
              <button type="button" aria-label="關閉停車提示" className="min-h-11 min-w-11" onClick={() => { dismissedDrivingHints.add(String(anchor.id)); setHintDismissed(true); }}>×</button>
            </div>
          ) : null}
          {parkingOpen && status === 'empty' ? <p className={`mt-2 rounded-xl border p-2 text-xs ${t.headerBg} ${t.cardBorder} ${t.mainText}`}>找不到附近停車場</p> : null}
          {parkingOpen && status === 'error' ? <p className={`mt-2 rounded-xl border p-2 text-xs text-red-500 ${t.headerBg} ${t.cardBorder}`}>停車 Provider 暫時無法使用；原行程不受影響。</p> : null}
          {parkingOpen && providerStatus.tdx === 'not_configured' ? <p className={`mt-2 rounded-xl border p-2 text-[10px] ${t.headerBg} ${t.cardBorder} ${t.subText}`}>TDX 尚未設定；仍顯示 Google Maps 停車位置。</p> : null}
          {parkingOpen && providerStatus.tdx === 'timeout' ? <p className={`mt-2 rounded-xl border p-2 text-[10px] ${t.headerBg} ${t.cardBorder} ${t.subText}`}>TDX 逾時；已降級顯示 Google Maps。</p> : null}
        </div>
        {parkingOpen ? (
          <ParkingResultSheet
            facilities={sortedFacilities}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onSave={(facility) => void onSavePlan(facility)}
            canEdit={canEdit}
            anchor={anchor}
            sort={sort}
            onSortChange={setSort}
            t={t}
          />
        ) : (
          <SavedParkingCard
            plan={anchor?.parkingPlan}
            onRefresh={() => { open(); void search(); }}
            onReplace={open}
            onRemove={() => void onRemovePlan()}
            canEdit={canEdit}
            t={t}
          />
        )}
      </>
    ),
  });
}
