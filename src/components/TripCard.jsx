import React from 'react';

import { getThemeClasses } from '../helpers.js';
import { Icon } from './ui/Icon.jsx';

export function TripCard({
  trip,
  onOpen,
  onEdit,
  onDelete,
  onHide,
  onRetry,
  onRemove,
  onReset,
  offlineSummary,
  titleTestId = 'trip-card-title',
}) {
  const cardColor = String(trip?.themeColor || '#1e293b');
  const theme = getThemeClasses(cardColor);
  const roomId = String(trip?.roomId || '');
  const title = String(trip?.title || '未命名旅程');
  const role = ['owner', 'editor'].includes(String(trip?.role)) ? String(trip.role) : '';
  const isOwner = role === 'owner';
  const isDeleting = trip?.accessStatus === 'deleting';
  const isUnavailable = trip?.accessStatus === 'unavailable';
  const canOpen = !isDeleting && !isUnavailable && typeof onOpen === 'function';
  const roleTone = theme.isLight
    ? 'border-blue-700/25 bg-blue-50/80 text-blue-800'
    : 'border-blue-200/25 bg-blue-950/55 text-blue-100';
  const cardContent = (
    <>
      <h2 data-testid={titleTestId} className={`mb-2 line-clamp-2 text-2xl font-black leading-tight ${theme.mainText}`}>
        {title}
      </h2>
      {isDeleting || isUnavailable ? (
        <p
          role={isUnavailable ? 'status' : undefined}
          className={`text-sm font-bold leading-6 ${theme.subText}`}
        >
          {isDeleting
            ? '永久刪除要求處理中；系統正凍結存取並在背景清除資料。'
            : '旅程資料暫時無法載入，其他旅程仍可正常使用。'}
        </p>
      ) : (
        <>
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
        </>
      )}
    </>
  );

  return (
    <article
      data-testid="trip-card"
      data-room-id={roomId}
      data-access-role={role || undefined}
      data-access-status={isDeleting ? 'deleting' : isUnavailable ? 'unavailable' : 'ready'}
      onClick={canOpen ? onOpen : undefined}
      style={{ backgroundColor: cardColor }}
      className={`group rounded-3xl border p-5 shadow-[var(--travel-shadow-card)] transition-[box-shadow,transform,border-color] duration-200 focus-within:ring-2 focus-within:ring-blue-500/40 ${canOpen ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-xl' : 'cursor-default'} ${theme.cardBorder}`}
    >
      <div className="mb-3 flex min-h-11 items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-xl border px-3 text-xs font-extrabold ${theme.isLight ? 'border-black/10 bg-black/5 text-slate-700' : 'border-white/20 bg-white/10 text-white'}`}>
            {String(trip?.transport || '交通未設定')}
          </span>
          {role ? (
            <span
              data-testid="trip-role-badge"
              className={`inline-flex min-h-9 items-center whitespace-nowrap rounded-xl border px-3 text-xs font-extrabold ${roleTone}`}
            >
              {isOwner ? '你是擁有者' : '共同編輯'}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onEdit && !isDeleting ? (
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
          {onDelete && isOwner && !isUnavailable ? (
            <button
              type="button"
              data-testid="delete-trip-action"
              aria-label={isDeleting ? `繼續刪除旅程：${title}` : `永久刪除旅程：${title}`}
              title={isDeleting ? '繼續刪除整趟旅程' : '永久刪除整趟旅程'}
              onClick={(event) => {
                event.stopPropagation();
                onDelete(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-red-500/15 hover:text-red-500 ${theme.subText}`}
            >
              <Icon name="trash" />
            </button>
          ) : null}
          {onRetry && isUnavailable ? (
            <button
              type="button"
              data-testid="retry-trip-load-action"
              aria-label={`重新載入旅程：${title}`}
              title="重新載入旅程"
              onClick={(event) => {
                event.stopPropagation();
                onRetry(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-blue-500/15 hover:text-blue-500 ${theme.subText}`}
            >
              <Icon name="reset" />
            </button>
          ) : null}
          {onHide && !isDeleting ? (
            <button
              type="button"
              data-testid="hide-trip-action"
              aria-label={`從這台裝置隱藏旅程：${title}`}
              title="從這台裝置隱藏"
              onClick={(event) => {
                event.stopPropagation();
                onHide(event);
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-slate-500/15 ${theme.subText}`}
            >
              <Icon name="eyeOff" />
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

      {canOpen ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(event);
          }}
          aria-label={`開啟旅程：${title}`}
          className="block w-full rounded-2xl text-left"
        >
          {cardContent}
        </button>
      ) : (
        <div className="w-full rounded-2xl text-left">
          {cardContent}
        </div>
      )}
      {isDeleting ? (
        <div className={`mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-bold ${theme.isLight ? 'text-red-700' : 'text-red-200'}`} role="status">
          正在清除雲端資料；若長時間沒有完成，可使用上方按鈕重新送出要求。
        </div>
      ) : null}
    </article>
  );
}
