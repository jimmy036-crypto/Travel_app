const STATUS_CONFIG = {
  idle: {
    label: '正在連線...',
    dotClass: 'bg-slate-400 animate-pulse',
    textClass: 'text-slate-500',
  },
  saving: {
    label: '正在同步...',
    dotClass: 'bg-amber-400 animate-pulse',
    textClass: 'text-amber-600',
  },
  saved: {
    label: '已同步',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600',
  },
  'remote-updated': {
    label: '遠端已更新',
    dotClass: 'bg-blue-500',
    textClass: 'text-blue-600',
  },
  error: {
    label: '同步失敗',
    dotClass: 'bg-red-500',
    textClass: 'text-red-600',
  },
  offline: {
    label: '離線',
    dotClass: 'bg-slate-500',
    textClass: 'text-slate-600',
  },
};

// `compact` keeps the dot and the accessible label but drops the visible text,
// for headers that also have to fit the day switcher on a narrow screen.
export const SyncStatusIndicator = ({ status = 'idle', compact = false }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <span
      data-testid="sync-status-indicator"
      data-compact={compact ? 'true' : undefined}
      title={config.label}
      aria-live="polite"
      className={`inline-flex min-h-7 shrink-0 items-center justify-center rounded-full border border-slate-500/15 bg-white/70 shadow-sm backdrop-blur-md dark:bg-slate-950/45 ${
        compact
          ? 'w-7'
          : 'min-w-24 gap-1.5 px-2.5 text-[10px] font-bold'
      }`}
    >
      <span
        data-testid="sync-status-dot"
        className={`shrink-0 rounded-full ${compact ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${config.dotClass}`}
      />
      <span className={compact ? 'sr-only' : `whitespace-nowrap ${config.textClass}`}>
        {config.label}
      </span>
    </span>
  );
};
