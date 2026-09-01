import './LobbyTripStatusVisual.css';

const VISUAL_THEME = {
  light: {
    primary: 'text-blue-700',
    text: 'text-slate-900',
    muted: 'text-slate-600',
    border: 'border-blue-200/80',
    ticket: 'bg-white/48',
    track: 'bg-blue-200/90',
    progress: 'bg-gradient-to-r from-blue-600 via-cyan-500 to-indigo-500',
    completeNode: 'border-blue-600 bg-blue-600 text-white',
    currentNode: 'border-cyan-500 bg-white text-blue-700 shadow-[0_0_0_4px_rgba(6,182,212,0.16)]',
    futureNode: 'border-blue-300 bg-blue-50 text-blue-400',
  },
  dark: {
    primary: 'text-cyan-300',
    text: 'text-white',
    muted: 'text-slate-300',
    border: 'border-white/15',
    ticket: 'bg-slate-950/25',
    track: 'bg-white/15',
    progress: 'bg-gradient-to-r from-blue-400 via-cyan-400 to-indigo-400',
    completeNode: 'border-cyan-400 bg-cyan-400 text-slate-950',
    currentNode: 'border-cyan-300 bg-slate-900 text-cyan-200 shadow-[0_0_0_4px_rgba(34,211,238,0.16)]',
    futureNode: 'border-slate-500 bg-slate-900 text-slate-400',
  },
};

function formatCompactDate(value) {
  const parts = String(value || '').split('-');
  if (parts.length !== 3) return '';
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function getVisibleDays(durationDays, currentDay) {
  const duration = Math.max(Number(durationDays) || 1, 1);
  if (duration <= 7) return Array.from({ length: duration }, (_, index) => index + 1);

  return [...new Set([
    1,
    2,
    currentDay - 1,
    currentDay,
    currentDay + 1,
    duration - 1,
    duration,
  ])]
    .filter((day) => day >= 1 && day <= duration)
    .sort((left, right) => left - right)
    .slice(0, 7);
}

function PlaneIcon({ className = '' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M3.5 12.5 21 5.5l-6.2 13-3.1-5-8.2-1Z"
        fill="currentColor"
      />
      <path d="m11.7 13.5 3.1 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function BoardingPassVisual({ mode, summary }) {
  const theme = VISUAL_THEME[mode];
  const daysUntil = Math.max(Number(summary.daysUntil) || 0, 0);
  const isDepartureDay = summary.timing === 'ongoing' || daysUntil === 0;
  const countdownValue = isDepartureDay ? '今天' : daysUntil === 1 ? '明天' : String(daysUntil);
  const countdownUnit = isDepartureDay ? '出發' : daysUntil === 1 ? '出發' : '天後';

  return (
    <div
      data-testid="lobby-trip-status-boarding"
      className={`lobby-ticket relative grid h-full grid-cols-[minmax(0,1fr)_auto_76px] items-center overflow-hidden ${theme.ticket}`}
    >
      <span className="lobby-ticket-sheen absolute inset-y-0 left-0 w-1/3" />
      <div className="relative min-w-0 px-4 py-2 md:px-5">
        <span className={`block truncate text-xs font-extrabold ${theme.primary}`}>
          {summary.destination}
        </span>
        <span className={`mt-1 flex flex-wrap items-center gap-x-2 text-[11px] font-bold leading-tight ${theme.muted}`}>
          <span>{formatCompactDate(summary.startDate)} → {formatCompactDate(summary.endDate)}</span>
          <span>{summary.durationDays} 天</span>
        </span>
        <span className={`mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] ${theme.primary}`}>
          <PlaneIcon className="lobby-plane-arrive h-3.5 w-3.5" />
          Travel ready
        </span>
      </div>
      <span className={`h-[58%] border-l border-dashed ${theme.border}`} />
      <div className="relative flex flex-col items-center justify-center px-2 text-center">
        <span className={`text-xl font-black leading-none ${theme.text}`}>{countdownValue}</span>
        <span className={`mt-1 text-[11px] font-extrabold ${theme.primary}`}>{countdownUnit}</span>
      </div>
    </div>
  );
}

function JourneyTrackVisual({ mode, summary }) {
  const theme = VISUAL_THEME[mode];
  const duration = Math.max(Number(summary.durationDays) || 1, 1);
  const current = Math.min(Math.max(Number(summary.currentDay) || 1, 1), duration);
  const visibleDays = getVisibleDays(duration, current);
  const currentNodeIndex = visibleDays.indexOf(current);
  const progress = visibleDays.length === 1
    ? 100
    : (currentNodeIndex / (visibleDays.length - 1)) * 100;

  return (
    <div data-testid="lobby-trip-status-journey" className="h-full px-4 py-2 md:px-5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <span className={`truncate text-xs font-extrabold ${theme.primary}`}>{summary.destination}</span>
        <span className={`shrink-0 text-xs font-black ${theme.text}`}>第 {current}/{duration} 天</span>
      </div>
      <div className="relative mt-3 px-1">
        <span className={`absolute left-2 right-2 top-3 h-0.5 rounded-full ${theme.track}`} />
        <span
          className={`lobby-track-reveal absolute left-2 top-3 h-0.5 rounded-full ${theme.progress}`}
          style={{ width: `calc(${progress}% - ${progress === 100 ? 16 : 8}px)` }}
        />
        <div className="relative flex items-start justify-between">
          {visibleDays.map((day) => {
            const isCurrent = day === current;
            const isComplete = day < current;
            const nodeClass = isCurrent
              ? theme.currentNode
              : isComplete
                ? theme.completeNode
                : theme.futureNode;
            return (
              <span key={day} className="flex min-w-0 flex-col items-center gap-0.5">
                <span
                  className={`relative flex h-6 w-6 items-center justify-center rounded-full border-2 text-[9px] font-black ${nodeClass} ${isCurrent ? 'lobby-current-day' : ''}`}
                >
                  {isComplete ? '✓' : isCurrent ? <PlaneIcon className="h-3.5 w-3.5" /> : day}
                </span>
                <span className={`text-[9px] font-bold leading-none ${isCurrent ? theme.primary : theme.muted}`}>
                  {isCurrent ? '今天' : `D${day}`}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EmptyVisual({ mode }) {
  const theme = VISUAL_THEME[mode];
  return (
    <div data-testid="lobby-trip-status-empty" className="flex h-full items-center px-4 md:px-5">
      <div className={`flex w-full items-center gap-3 rounded-xl border border-dashed px-3 py-2 ${theme.border} ${theme.ticket}`}>
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg border ${theme.border} ${theme.primary}`}>＋</span>
        <div className="min-w-0">
          <span className={`block text-xs font-extrabold ${theme.text}`}>尚未安排下一站</span>
          <span className={`block text-[11px] font-bold ${theme.muted}`}>建立旅程後顯示出發資訊</span>
        </div>
      </div>
    </div>
  );
}

export function LobbyTripStatusVisual({ mode = 'light', summary = null }) {
  const resolvedMode = mode === 'dark' ? 'dark' : 'light';
  const currentDay = Number(summary?.currentDay) || 0;
  const variant = !summary
    ? 'empty'
    : summary.timing === 'ongoing' && currentDay >= 2
      ? 'journey'
      : 'boarding';

  return (
    <div
      data-testid="lobby-next-trip-summary-visual"
      data-mode={resolvedMode}
      data-variant={variant}
      aria-hidden="true"
      className="pointer-events-none h-full min-h-[84px] select-none md:min-h-[72px]"
    >
      {variant === 'boarding' ? <BoardingPassVisual mode={resolvedMode} summary={summary} /> : null}
      {variant === 'journey' ? <JourneyTrackVisual mode={resolvedMode} summary={summary} /> : null}
      {variant === 'empty' ? <EmptyVisual mode={resolvedMode} /> : null}
    </div>
  );
}

export default LobbyTripStatusVisual;
