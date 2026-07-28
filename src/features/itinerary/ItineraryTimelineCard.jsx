import React from 'react';

import { formatStayTime } from '../../helpers.js';

export function ItineraryTimelineCard({
  item,
  index,
  isLast,
  isDragging,
  t,
  dragHandleProps,
  actionMenuId,
  actionMenuExpanded,
  registerActionTrigger,
  onOpenDetails,
  onNavigate,
  onOpenActionMenu,
}) {
  const displayName = String(item?.customName || item?.name || '未命名景點');
  const stayLabel = item?.stayTime === undefined
    ? ''
    : `預計停留 ${formatStayTime(item.stayTime)}`;

  return (
    <div
      data-testid="place-card"
      data-place-id={String(item?.id || '')}
      data-mobile-layout="timeline"
      data-component="timeline-place-item"
      onClick={() => {
        if (!isDragging) onOpenDetails?.(item);
      }}
      className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2"
    >
      <div className="relative flex justify-center">
        {!isLast ? (
          <span
            className="pointer-events-none absolute top-10 -bottom-3 w-px bg-slate-400/55"
            aria-hidden="true"
          />
        ) : null}
        <div
          {...dragHandleProps}
          data-testid="place-drag-handle"
          data-place-id={String(item?.id || '')}
          aria-label={`拖曳排序 ${displayName}`}
          onClick={(event) => event.stopPropagation()}
          className={`relative z-1 flex h-11 w-11 touch-pan-y select-none items-center justify-center rounded-full active:cursor-grabbing ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[10px] font-black ${
            isDragging
              ? 'border-white bg-blue-600 text-white'
              : `border-blue-500 bg-blue-600 text-white ring-4 ${t.isLight ? 'ring-white/70' : 'ring-slate-950/55'}`
          }`}>
            {index + 1}
          </span>
        </div>
      </div>

      <article
        data-testid="timeline-place-card-surface"
        className={`min-w-0 rounded-2xl border p-3 transition-[border-color,background-color,transform] ${
          isDragging
            ? 'border-blue-400 bg-blue-600 text-white'
            : `${t.itemBg} ${t.cardBorder}`
        }`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              {item?.time ? (
                <time
                  data-testid="place-card-time"
                  className={`shrink-0 text-base font-black tabular-nums ${
                    isDragging ? 'text-white' : t.mainText
                  }`}
                >
                  {String(item.time)}
                </time>
              ) : null}
              <h3
                data-testid="place-card-title"
                className={`line-clamp-2 min-w-0 text-sm font-black leading-5 [overflow-wrap:anywhere] ${
                  isDragging ? 'text-white' : t.mainText
                }`}
                title="點擊卡片查看詳細資訊"
              >
                {displayName}
              </h3>
            </div>
            {stayLabel ? (
              <p className={`mt-1 text-[10px] font-bold ${isDragging ? 'text-white/80' : t.subText}`}>
                {stayLabel}
              </p>
            ) : null}
          </div>

          <div
            data-testid="place-card-actions"
            data-layout="mobile-timeline"
            className="export-hide flex shrink-0 items-center gap-1"
          >
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onNavigate?.(item);
              }}
              className={`flex min-h-11 w-11 items-center justify-center rounded-xl border text-base active:scale-95 ${
                isDragging
                  ? 'border-white/30 bg-white/15 text-white'
                  : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
              }`}
              aria-label={`導航到${displayName}`}
              title="開啟導航"
            >
              🧭
            </button>
            <button
              type="button"
              data-testid="place-action-menu-trigger"
              data-place-id={String(item?.id || '')}
              aria-label={`開啟${displayName}的景點操作`}
              aria-haspopup="menu"
              aria-expanded={actionMenuExpanded}
              aria-controls={actionMenuExpanded ? `place-action-menu-${actionMenuId}` : undefined}
              ref={(node) => registerActionTrigger?.(actionMenuId, node)}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onOpenActionMenu?.(event, item);
              }}
              className={`flex min-h-11 w-11 items-center justify-center rounded-xl border text-lg font-black active:scale-95 ${
                isDragging
                  ? 'border-white/30 bg-white/10 text-white'
                  : `${t.cardBg} ${t.cardBorder} ${t.mainText}`
              }`}
            >
              ⋯
            </button>
          </div>
        </div>
      </article>
    </div>
  );
}
