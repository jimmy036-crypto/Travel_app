import React from 'react';

import { getThemeClasses } from '../helpers.js';
import { Icon } from './ui/Icon.jsx';

export function TripCard({
  trip,
  onOpen,
  onEdit,
  onDelete,
  onRemove,
  onReset,
  offlineSummary,
  titleTestId = 'trip-card-title',
}) {
  const cardColor = String(trip?.themeColor || '#1e293b');
  const theme = getThemeClasses(cardColor);
  const roomId = String(trip?.roomId || '');
  const title = String(trip?.title || '未命名旅程');

  return (
    <article
      data-testid="trip-card"
      data-room-id={roomId}
      onClick={onOpen}
      style={{ backgroundColor: cardColor }}
      className={`group cursor-pointer rounded-3xl border p-5 shadow-[var(--travel-shadow-card)] transition-[box-shadow,transform,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-xl focus-within:ring-2 focus-within:ring-blue-500/40 ${theme.cardBorder}`}
    >
      <div className="mb-3 flex min-h-11 items-start justify-between gap-3">
        <span className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-xl border px-3 text-xs font-extrabold ${theme.isLight ? 'border-black/10 bg-black/5 text-slate-700' : 'border-white/20 bg-white/10 text-white'}`}>
          {String(trip?.transport || '交通未設定')}
        </span>
        <div className="flex flex-wrap justify-end gap-2">
          {onEdit ? (
            <button
              type="button"
              aria-label={`編輯 ${title}`}
              title="編輯旅程"
              onClick={(event) => {
                event.stopPropagation();
                onEdit(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-blue-500/15 hover:text-blue-500 ${theme.subText}`}
            >
              <Icon name="edit" />
              <span className="sr-only">⚙️ 編輯</span>
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              aria-label="刪除"
              title="移除旅程捷徑"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-red-500/15 hover:text-red-500 ${theme.subText}`}
            >
              <Icon name="trash" />
            </button>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              data-testid="remove-example-trip"
              aria-label="從大廳移除"
              title="從大廳移除"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-red-500/15 hover:text-red-500 ${theme.subText}`}
            >
              <Icon name="trash" />
              <span className="sr-only">從大廳移除</span>
            </button>
          ) : null}
          {onReset ? (
            <button
              type="button"
              data-testid="reset-example-trip"
              aria-label="恢復原始內容"
              title="恢復原始內容"
              onClick={(event) => {
                event.stopPropagation();
                onReset(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-blue-500/15 hover:text-blue-500 ${theme.subText}`}
            >
              <Icon name="reset" />
              <span className="sr-only">恢復原始內容</span>
            </button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen?.(event);
        }}
        aria-label={`開啟旅程：${title}`}
        className="block w-full rounded-2xl text-left"
      >
        <h2 data-testid={titleTestId} className={`mb-2 line-clamp-2 text-2xl font-black leading-tight ${theme.mainText}`}>
          {title}
        </h2>
        <p className={`mb-5 flex items-center gap-2 truncate text-sm font-bold ${theme.subText}`}>
          <Icon name="location" size={17} />
          <span className="truncate">{String(trip?.destination || '主要地點未設定')}</span>
        </p>
        <div className={`grid gap-2 rounded-2xl border p-3.5 ${theme.cardMetaBg} ${theme.cardBorder}`}>
          <p className={`flex items-center gap-2 text-xs font-semibold ${theme.subText}`}>
            <Icon name="calendar" size={16} />
            <span>
              {String(trip?.startDate || '').replace(/-/g, '/')}
              <span className="mx-1.5 opacity-60">–</span>
              {String(trip?.endDate || '').replace(/-/g, '/')}
            </span>
          </p>
          <p className={`flex items-center gap-2 truncate text-xs font-semibold ${theme.subText}`}>
            <Icon name="users" size={16} />
            <span className="truncate">{Array.isArray(trip?.members) ? trip.members.join(', ') : '自己'}</span>
          </p>
        </div>
        {offlineSummary ? (
          <div className={`mt-4 border-t pt-3 ${theme.cardBorder}`} data-testid="offline-cache-status">
            <p className={`flex items-center gap-2 text-xs font-semibold ${theme.subText}`}>
              <Icon name="checkCircle" size={16} className="text-emerald-500" />
              離線資料已儲存至 {new Date(offlineSummary.cachedAt).toLocaleString(undefined, {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        ) : null}
      </button>
    </article>
  );
}
