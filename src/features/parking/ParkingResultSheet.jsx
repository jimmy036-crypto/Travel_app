import React from 'react';
import { estimateParkingCost } from './parkingEstimate.js';
import { getMaximumLabel } from './parkingTariffModel.js';

const openSafely = (url) => {
  if (/^https:\/\/(?:www\.)?google\.com\/maps\//i.test(String(url || '')) || /^https:\/\/tdx\.transportdata\.tw\//i.test(String(url || ''))) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

export function ParkingResultSheet({ facilities, selectedId, onSelect, onSave, canEdit, anchor, sort, onSortChange, t }) {
  if (!facilities.length) return null;
  return (
    <section data-testid="parking-result-sheet" className={`absolute inset-x-2 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 max-h-[55%] overflow-y-auto rounded-3xl border p-3 shadow-2xl md:left-auto md:right-4 md:w-96 md:bottom-4 ${t.headerBg} ${t.cardBorder}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className={`text-sm ${t.mainText}`}>附近停車（最多 8 筆）</strong>
        <select aria-label="停車排序" value={sort} onChange={(event) => onSortChange(event.target.value)} className={`min-h-11 rounded-xl border bg-transparent px-2 text-xs ${t.cardBorder} ${t.mainText}`}>
          <option value="best">最適合</option><option value="distance">距離最近</option><option value="availability">仍有車位</option><option value="tariff">費率完整</option>
        </select>
      </div>
      <p className={`mb-2 text-[10px] ${t.subText}`} translate="no">Google Maps 與 TDX 資料分開標示；價格以現場公告為準。</p>
      <div className="grid gap-2">
        {facilities.map((facility) => {
          const selected = facility.id === selectedId;
          const estimate = estimateParkingCost({ tariff: facility.tariff, stayTime: anchor?.stayTime, arrivalTime: anchor?.time });
          return (
            <article key={facility.id} data-testid="parking-result" className={`rounded-2xl border p-3 ${selected ? 'border-blue-500 ring-2 ring-blue-500/20' : t.cardBorder}`}>
              <button type="button" onClick={() => onSelect(facility.id)} className="min-h-11 w-full text-left">
                <div className="flex justify-between gap-2"><strong className={`text-xs ${t.mainText}`}>{facility.name}</strong><span className={`text-[10px] ${t.subText}`}>{facility.distanceToDestinationMeters ?? '—'}m · 步行 {facility.walkingMinutes ?? '—'} 分</span></div>
                <p className={`mt-1 text-[10px] ${t.subText}`}>{facility.opening.text} · {facility.availability.availableSpaces === null ? '車位未知' : `剩餘 ${facility.availability.availableSpaces}/${facility.availability.totalSpaces ?? '—'}`}</p>
                <p className={`mt-1 text-[10px] ${t.mainText}`}>官方原始費率：{facility.tariff.rawText || '費率資料未提供'}</p>
                {facility.tariff.hourlyEquivalent !== null ? <p className="text-[10px] text-emerald-600">約 NT${facility.tariff.hourlyEquivalent}／小時</p> : null}
                {getMaximumLabel(facility.tariff) ? <p className="text-[10px] text-emerald-600">{getMaximumLabel(facility.tariff)}</p> : null}
                <p className={`text-[10px] ${estimate.amount === null ? t.subText : 'text-blue-600'}`}>{estimate.message}</p>
                <p className={`mt-1 text-[9px] ${t.subText}`}>Provider: {facility.source.label} · confidence: {facility.matchConfidence} · 更新 {facility.source.providerUpdatedAt || facility.source.fetchedAt || '未知'}</p>
                {facility.matchConfidence === 'medium' ? <p className="mt-1 text-[9px] font-black text-amber-600">官方資料為可能配對，請確認名稱與位置。</p> : null}
                {facility.restrictions.maxHeightMeters !== null ? <p className={`text-[9px] ${t.subText}`}>限高 {facility.restrictions.maxHeightMeters}m</p> : null}
                {facility.restrictions.reservation === true ? <p className={`text-[9px] ${t.subText}`}>支援預約（MVP 不提供預約操作）</p> : null}
              </button>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={!canEdit} onClick={() => onSave(facility)} className="min-h-11 flex-1 rounded-xl bg-blue-600 px-2 text-[10px] font-black text-white disabled:opacity-50">設為此景點停車場</button>
                <button type="button" onClick={() => openSafely(facility.navigationUrl)} className={`min-h-11 rounded-xl border px-3 text-[10px] font-black ${t.cardBorder} ${t.mainText}`}>導航</button>
                {facility.source.url ? <button type="button" onClick={() => openSafely(facility.source.url)} className={`min-h-11 rounded-xl border px-3 text-[10px] font-black ${t.cardBorder} ${t.mainText}`}>來源</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
