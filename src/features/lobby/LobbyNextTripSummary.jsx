import { useId } from 'react';

import { parseDateOnlyLocal } from '../../helpers.js';
import { LobbyRouteArc } from './LobbyRouteArc.jsx';

const THEME_CLASSES = {
  light: {
    label: 'text-blue-700',
    text: 'text-slate-950',
    subText: 'text-slate-600',
    fade: 'from-blue-50 via-blue-50/95 to-transparent',
    affordance: 'border-blue-200/80 bg-white/80 text-blue-700 shadow-sm',
    focusOffset: 'focus-visible:ring-offset-white',
  },
  dark: {
    label: 'text-cyan-300',
    text: 'text-white',
    subText: 'text-slate-300',
    fade: 'from-slate-950 via-slate-950/95 to-transparent',
    affordance: 'border-white/15 bg-slate-950/75 text-cyan-300 shadow-sm',
    focusOffset: 'focus-visible:ring-offset-slate-950',
  },
};

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function formatShortDate(value) {
  const date = parseDateOnlyLocal(value);
  if (!date) return '';
  return `${date.getMonth() + 1}/${date.getDate()}（${WEEKDAYS[date.getDay()]}）`;
}

function formatDateRange(startDate, endDate) {
  const start = String(startDate || '').replace(/-/g, '/');
  const end = String(endDate || '').replace(/-/g, '/');
  return `${start} 至 ${end}`;
}

function getTimingCopy(summary) {
  if (summary.timing === 'ongoing') {
    const currentDay = Math.min(
      Math.max(Number(summary.currentDay) || 1, 1),
      Math.max(Number(summary.durationDays) || 1, 1),
    );
    return {
      label: '旅途中',
      meta: `第 ${currentDay}/${summary.durationDays} 天 · ${formatShortDate(summary.endDate)}返程`,
      accessibleStatus: `目前是第 ${currentDay} 天`,
    };
  }

  const daysUntil = Math.max(Number(summary.daysUntil) || 0, 0);
  const countdown = daysUntil === 0
    ? '今天出發'
    : daysUntil === 1
      ? '明天出發'
      : `${daysUntil} 天後`;

  return {
    label: '下一趟旅程',
    meta: `${formatShortDate(summary.startDate)} · ${countdown}`,
    accessibleStatus: countdown,
  };
}

function RoutePlaneIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="h-3.5 w-3.5 shrink-0"
      fill="none"
    >
      <path
        d="m3 10 13-5-4.5 10-2.3-3.8L3 10Z"
        fill="currentColor"
        opacity="0.92"
      />
      <path
        d="m9.2 11.2 2.3 3.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SummaryContent({ mode, summary, hasTrips }) {
  const theme = THEME_CLASSES[mode];

  if (!summary) {
    return (
      <div className="flex min-w-[168px] flex-1 flex-col justify-center gap-1 text-left">
        <span className={`flex items-center gap-1 text-xs font-extrabold tracking-wide ${theme.label}`}>
          <RoutePlaneIcon />
          下一趟旅程
        </span>
        <span className={`text-sm font-bold leading-snug ${theme.text}`}>
          {hasTrips
            ? '目前沒有即將出發的旅程'
            : '建立旅程後，這裡會顯示出發倒數與快速入口'}
        </span>
      </div>
    );
  }

  const timing = getTimingCopy(summary);
  return (
    <div className="flex min-w-[168px] flex-1 flex-col justify-center gap-0.5 text-left">
      <span className={`flex min-w-0 items-center gap-1 text-xs font-extrabold leading-tight tracking-wide ${theme.label}`}>
        <RoutePlaneIcon />
        {timing.label}
      </span>
      <span className={`line-clamp-2 [overflow-wrap:anywhere] text-base font-black leading-tight ${theme.text}`}>
        {summary.title}
      </span>
      <span className={`line-clamp-2 [overflow-wrap:anywhere] text-xs font-bold leading-snug ${theme.subText}`}>
        {summary.destination}
        {' · '}
        {timing.meta}
      </span>
    </div>
  );
}

function OpenTripAffordance({ mode }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2.5 text-xs font-extrabold transition-transform duration-200 group-hover:translate-x-0.5 ${THEME_CLASSES[mode].affordance}`}
    >
      開啟行程
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function LobbyNextTripSummary({
  mode = 'light',
  summary = null,
  hasTrips = false,
  onOpen,
}) {
  const descriptionId = useId();
  const resolvedMode = mode === 'dark' ? 'dark' : 'light';
  const theme = THEME_CLASSES[resolvedMode];
  const hasAction = Boolean(summary && typeof onOpen === 'function');

  const sharedContent = (
    <>
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <LobbyRouteArc
          mode={resolvedMode}
          journeyState={summary?.timing || 'empty'}
        />
      </div>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-px left-px z-[1] w-[58%] rounded-l-[15px] bg-gradient-to-r ${theme.fade}`}
      />
      <div className="relative z-10 flex min-h-[96px] w-full flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 md:min-h-[144px] md:px-5">
        <SummaryContent mode={resolvedMode} summary={summary} hasTrips={hasTrips} />
        {hasAction ? <OpenTripAffordance mode={resolvedMode} /> : null}
      </div>
    </>
  );

  if (!hasAction) {
    return (
      <div
        data-testid="lobby-next-trip-summary"
        data-mode={resolvedMode}
        data-state={summary?.timing || 'empty'}
        className="relative isolate min-h-[96px] min-w-0 w-full select-none overflow-hidden rounded-2xl md:min-h-[144px]"
      >
        {sharedContent}
      </div>
    );
  }

  const timing = getTimingCopy(summary);
  const actionLabel = summary.timing === 'ongoing'
    ? `開啟目前旅程：${summary.title}`
    : `開啟下一趟旅程：${summary.title}`;
  const accessibleDescription = `${summary.destination}，${formatDateRange(summary.startDate, summary.endDate)}，共 ${summary.durationDays} 天，${timing.accessibleStatus}。`;

  return (
    <button
      type="button"
      data-testid="lobby-next-trip-summary"
      data-mode={resolvedMode}
      data-state={summary.timing}
      data-room-id={summary.roomId}
      aria-label={actionLabel}
      aria-describedby={descriptionId}
      onClick={onOpen}
      className={`group relative isolate min-h-[96px] min-w-0 w-full touch-manipulation select-none overflow-hidden rounded-2xl text-left transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 md:min-h-[144px] ${theme.focusOffset}`}
    >
      {sharedContent}
      <span id={descriptionId} className="sr-only">
        {accessibleDescription}
      </span>
    </button>
  );
}

export default LobbyNextTripSummary;
