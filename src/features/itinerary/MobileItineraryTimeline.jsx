import React from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';

import { EmptyState } from '../../components/ui/EmptyState.jsx';
import { ItineraryTimelineCard } from './ItineraryTimelineCard.jsx';
import { TransitTimelineRow } from './TransitTimelineRow.jsx';

export function MobileItineraryDragClone({ item, index, provided }) {
  return (
    <div
      ref={provided?.innerRef}
      {...(provided?.draggableProps || {})}
      {...(provided?.dragHandleProps || {})}
      data-testid="itinerary-drag-clone"
      data-mobile-layout="compact"
      data-composition="timeline"
      style={{
        ...(provided?.draggableProps?.style || {}),
        height: 'auto',
      }}
      className="grid max-h-18 max-w-60 transform-gpu will-change-transform grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-blue-600 p-2 text-white shadow-lg"
    >
      <div className="flex w-10 shrink-0 flex-col items-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[10px] font-black">
          {index + 1}
        </span>
        {item?.time ? <span className="mt-0.5 text-[9px] font-bold">{String(item.time)}</span> : null}
      </div>
      <p className="line-clamp-1 min-w-0 text-xs font-black [overflow-wrap:anywhere]">
        {String(item?.customName || item?.name || '未命名景點')}
      </p>
    </div>
  );
}

export function MobileItineraryTimeline({
  dayId,
  items,
  durations,
  t,
  controls,
  search,
  onAddPlace,
  onOpenDetails,
  onNavigate,
  onOpenActionMenu,
  activeActionMenuId,
  registerActionTrigger,
  onEditTransit,
}) {
  const dayItems = Array.isArray(items) ? items : [];

  return (
    <section
      id={`day-card-${dayId}`}
      data-testid="itinerary-day-card"
      data-day-id={String(dayId)}
      data-mobile-composition="timeline"
      className="mx-auto flex w-full max-w-xl flex-col px-3 pb-28 pt-3"
      aria-label={`${String(dayId)} 行程時間軸`}
    >
      {controls}
      {search ? <div className="export-hide mb-3">{search}</div> : null}

      <Droppable
        droppableId={String(dayId)}
        renderClone={(provided, _snapshot, rubric) => (
          <MobileItineraryDragClone
            item={dayItems[rubric.source.index]}
            index={rubric.source.index}
            provided={provided}
          />
        )}
      >
        {(provided) => (
          <div
            {...provided.droppableProps}
            ref={provided.innerRef}
            data-testid="itinerary-day-dropzone"
            data-day-id={String(dayId)}
            className="min-h-40"
          >
            {dayItems.length === 0 ? (
              <EmptyState
                testId="itinerary-empty-state"
                className={`${t.cardBg} ${t.cardBorder} mt-2 max-w-none px-5 py-6`}
                icon={(
                  <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 36h24" />
                    <path d="M16 32V14l8 4 8-4v18" />
                    <path d="M24 18v14" />
                    <circle cx="24" cy="10" r="3" />
                  </svg>
                )}
                title="這一天還沒有行程"
                description="新增第一個景點，開始安排交通、時間與每日路線。"
                primaryAction={{
                  label: '新增景點',
                  testId: 'itinerary-empty-add-place',
                  onClick: onAddPlace,
                }}
              />
            ) : null}

            {dayItems.map((item, index) => {
              const actionMenuId = `${String(dayId)}-${String(item?.id || item?.place_id || item?.name || '')}`;
              const isLast = index === dayItems.length - 1;

              return (
                <React.Fragment key={String(item?.id || `${dayId}-${index}`)}>
                  <Draggable draggableId={String(item.id)} index={index}>
                    {(dragProvided, snapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`relative ${snapshot.isDragging ? 'z-50' : ''}`}
                      >
                        <ItineraryTimelineCard
                          item={item}
                          index={index}
                          isLast={isLast}
                          isDragging={snapshot.isDragging}
                          t={t}
                          dragHandleProps={dragProvided.dragHandleProps}
                          actionMenuId={actionMenuId}
                          actionMenuExpanded={activeActionMenuId === actionMenuId}
                          registerActionTrigger={registerActionTrigger}
                          onOpenDetails={() => onOpenDetails?.(item, dayId)}
                          onNavigate={onNavigate}
                          onOpenActionMenu={(event) => onOpenActionMenu?.(event, dayId, item)}
                        />
                      </div>
                    )}
                  </Draggable>

                  {!isLast ? (
                    <TransitTimelineRow
                      item={item}
                      duration={durations?.[index]}
                      index={index}
                      t={t}
                      onEdit={() => onEditTransit?.(item, dayId)}
                    />
                  ) : null}
                </React.Fragment>
              );
            })}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </section>
  );
}

export function MobileTimelineSkeleton({ t }) {
  return (
    <div
      data-testid="mobile-timeline-skeleton"
      className="mx-auto w-full max-w-xl px-3 pb-24 pt-4"
      aria-label="正在載入行程時間軸"
    >
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={`timeline-skeleton-${index}`} className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2">
          <div className="relative flex justify-center">
            <span className="mt-2 h-7 w-7 rounded-full bg-slate-300/60 motion-safe:animate-pulse dark:bg-slate-700/60" />
            {index < 2 ? <span className="absolute top-9 -bottom-12 w-px bg-slate-300/60 dark:bg-slate-700/60" /> : null}
          </div>
          <div className={`mb-10 h-20 rounded-2xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
            <div className="h-4 w-3/4 rounded bg-slate-300/60 motion-safe:animate-pulse dark:bg-slate-700/60" />
            <div className="mt-3 h-3 w-1/2 rounded bg-slate-300/60 motion-safe:animate-pulse dark:bg-slate-700/60" />
          </div>
        </div>
      ))}
    </div>
  );
}
