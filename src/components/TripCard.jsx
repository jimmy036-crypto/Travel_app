import React from 'react';

import { getThemeClasses } from '../helpers.js';

export function TripCard({
  trip,
  onOpen,
  onEdit,
  onDelete,
  onReset,
  offlineSummary,
  titleTestId = 'trip-card-title',
}) {
  const cardColor = String(trip?.themeColor || '#1e293b');
  const theme = getThemeClasses(cardColor);
  const roomId = String(trip?.roomId || '');

  return (
    <article
      data-testid="trip-card"
      data-room-id={roomId}
      onClick={onOpen}
      style={{ backgroundColor: cardColor }}
      className={`cursor-pointer rounded-3xl border p-6 shadow-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl ${theme.cardBorder}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${theme.isLight ? 'border-black/10 bg-black/5 text-slate-700' : 'border-white/30 bg-white/20 text-white'}`}>
          {String(trip?.transport || '')}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          {onEdit ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(event);
              }}
              className={`p-1 text-xs transition-colors hover:text-blue-500 ${theme.subText}`}
            >
              ⚙️ 編輯
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(event);
              }}
              className={`p-1 text-xs transition-colors hover:text-red-500 ${theme.subText}`}
            >
              刪除
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              data-testid="reset-example-trip"
              onClick={(event) => {
                event.stopPropagation();
                onReset(event);
              }}
              className={`p-1 text-xs font-bold transition-colors hover:text-blue-500 ${theme.subText}`}
            >
              恢復原始內容
            </button>
          ) : null}
        </div>
      </div>
      <h2 data-testid={titleTestId} className={`mb-1.5 line-clamp-2 text-2xl font-black ${theme.mainText}`}>
        {String(trip?.title || '')}
      </h2>
      <p className={`mb-5 truncate text-sm font-bold ${theme.subText}`}>
        📍 {String(trip?.destination || '尚未設定')}
      </p>
      <div className={`rounded-xl border p-3.5 ${theme.cardMetaBg} ${theme.cardBorder}`}>
        <p className={`mb-1.5 text-xs font-medium ${theme.subText}`}>
          📅 {String(trip?.startDate || '').replace(/-/g, '/')}
          <span className="mx-1 opacity-50">→</span>
          {String(trip?.endDate || '').replace(/-/g, '/')}
        </p>
        <p className={`truncate text-xs font-medium ${theme.subText}`}>
          👥 {Array.isArray(trip?.members) ? trip.members.join(', ') : '自己'}
        </p>
      </div>
      {offlineSummary ? (
        <div className={`mt-4 border-t pt-3 ${theme.cardBorder}`} data-testid="offline-cache-status">
          <p className={`flex items-center gap-1 text-xs font-medium ${theme.subText}`}>
            <span className="text-green-500">●</span>
            離線資料已保存 · {new Date(offlineSummary.cachedAt).toLocaleString(undefined, {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      ) : null}
    </article>
  );
}
