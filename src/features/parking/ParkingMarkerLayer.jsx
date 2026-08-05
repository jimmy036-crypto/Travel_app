import React from 'react';
import { AdvancedMarker } from '@vis.gl/react-google-maps';

const markerLabel = (facility) => {
  if (facility.tariff?.hourlyEquivalent !== null && facility.tariff?.hourlyEquivalent !== undefined) return `P NT$${facility.tariff.hourlyEquivalent}/時`;
  const maximum = facility.tariff?.rules?.find((rule) => rule.type === 'maximum');
  if (maximum) return `P 最高NT$${maximum.maximumPrice}`;
  if (facility.tariff?.rawText) return `P ${String(facility.tariff.rawText).slice(0, 8)}`;
  return 'P 費率未提供';
};

export function ParkingMarkerLayer({ facilities, selectedId, onSelect }) {
  return (Array.isArray(facilities) ? facilities : []).map((facility, index) => (
    <AdvancedMarker key={facility.id} position={facility.location} zIndex={facility.id === selectedId ? 12 : 5} onClick={() => onSelect(facility.id)}>
      <button
        type="button"
        data-testid="parking-marker"
        data-price-visible={index < 3 ? 'true' : 'false'}
        aria-label={`${facility.name} 停車場`}
        aria-pressed={facility.id === selectedId}
        onClick={(event) => { event.stopPropagation(); onSelect(facility.id); }}
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-full border-2 border-white px-2 text-[9px] font-black text-white shadow-md ${facility.id === selectedId ? 'bg-indigo-700 ring-4 ring-indigo-400/50' : 'bg-slate-700'}`}
      >
        {index < 3 ? markerLabel(facility) : 'P'}
      </button>
    </AdvancedMarker>
  ));
}
