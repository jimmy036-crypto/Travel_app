import React from 'react';

const safeNavigationUrl = (plan) => plan?.googlePlaceId
  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`place_id:${plan.googlePlaceId}`)}`
  : (plan?.location ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${plan.location.lat},${plan.location.lng}`)}` : null);

export function SavedParkingCard({ plan, onRefresh, onReplace, onRemove, canEdit, t }) {
  if (!plan) return null;
  const accentText = t.isLight === false ? 'text-blue-200' : 'text-blue-800';
  const dangerTone = t.isLight === false
    ? 'border-red-300 text-red-200'
    : 'border-red-600 text-red-700';
  const title = plan.name || 'Google Maps 已選停車場';
  const tariff = plan.tariffSnapshot?.rawText || '開啟時重新取得最新費率';
  const capturedAt = plan.tariffSnapshot?.capturedAt || plan.refreshedAt || plan.selectedAt;
  const navigationUrl = safeNavigationUrl(plan);
  return (
    <aside data-testid="saved-parking-card" className={`absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-2 z-20 max-w-[calc(100%-1rem)] rounded-2xl border p-3 shadow-xl md:bottom-4 md:left-4 md:max-w-sm ${t.headerBg} ${t.cardBorder}`}>
      <p className={`text-[10px] font-black ${accentText}`}>已選停車場</p>
      <strong className={`text-xs ${t.mainText}`}>{title}</strong>
      <p className={`text-[10px] ${t.subText}`}>步行約 {plan.walkingMinutes ?? '—'} 分鐘 · 儲存時費率：{tariff}</p>
      <p className={`text-[9px] ${t.subText}`}>快照時間：{capturedAt || '未知'}；過期資料不代表即時狀態</p>
      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" onClick={onRefresh} className="min-h-11 rounded-xl bg-blue-700 px-2 text-[10px] font-black text-white transition-colors hover:bg-blue-800">查看最新資訊</button>
        {navigationUrl ? <a href={navigationUrl} target="_blank" rel="noreferrer" className={`flex min-h-11 items-center rounded-xl border px-2 text-[10px] font-black ${t.cardBorder} ${t.mainText}`}>導航到停車場</a> : null}
        <button type="button" onClick={onReplace} className={`min-h-11 rounded-xl border px-2 text-[10px] font-black ${t.cardBorder} ${t.mainText}`}>更換</button>
        <button type="button" disabled={!canEdit} onClick={onRemove} className={`min-h-11 rounded-xl border px-2 text-[10px] font-black disabled:cursor-not-allowed disabled:opacity-50 ${dangerTone}`}>移除</button>
      </div>
    </aside>
  );
}
