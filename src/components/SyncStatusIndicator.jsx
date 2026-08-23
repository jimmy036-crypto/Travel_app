const STATUS_CONFIG = {
  idle: {
    label: '正在連線...',
    lightClass: 'border-slate-300 bg-slate-100/95 text-slate-700',
    darkClass: 'border-slate-600 bg-slate-800/95 text-slate-100',
    lightDotClass: 'bg-slate-500 animate-pulse',
    darkDotClass: 'bg-slate-300 animate-pulse',
  },
  saving: {
    label: '正在同步...',
    lightClass: 'border-amber-300 bg-amber-50/95 text-amber-900',
    darkClass: 'border-amber-700 bg-amber-950/95 text-amber-200',
    lightDotClass: 'bg-amber-600 animate-pulse',
    darkDotClass: 'bg-amber-300 animate-pulse',
  },
  saved: {
    label: '已同步',
    lightClass: 'border-emerald-300 bg-emerald-50/95 text-emerald-800',
    darkClass: 'border-emerald-700 bg-emerald-950/95 text-emerald-200',
    lightDotClass: 'bg-emerald-600',
    darkDotClass: 'bg-emerald-300',
  },
  'remote-updated': {
    label: '遠端已更新',
    lightClass: 'border-blue-300 bg-blue-50/95 text-blue-800',
    darkClass: 'border-blue-700 bg-blue-950/95 text-blue-200',
    lightDotClass: 'bg-blue-600',
    darkDotClass: 'bg-blue-300',
  },
  error: {
    label: '同步失敗',
    lightClass: 'border-red-300 bg-red-50/95 text-red-800',
    darkClass: 'border-red-700 bg-red-950/95 text-red-200',
    lightDotClass: 'bg-red-600',
    darkDotClass: 'bg-red-300',
  },
  offline: {
    label: '離線',
    lightClass: 'border-slate-300 bg-slate-100/95 text-slate-700',
    darkClass: 'border-slate-600 bg-slate-800/95 text-slate-100',
    lightDotClass: 'bg-slate-600',
    darkDotClass: 'bg-slate-300',
  },
};

// `compact` keeps the dot and the accessible label but drops the visible text,
// for headers that also have to fit the day switcher on a narrow screen.
export const SyncStatusIndicator = ({ status = 'idle', compact = false, isLight = true }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;
  const themeClass = isLight ? config.lightClass : config.darkClass;
  const dotClass = isLight ? config.lightDotClass : config.darkDotClass;

  return (
    <span
      data-testid="sync-status-indicator"
      data-compact={compact ? 'true' : undefined}
      data-theme={isLight ? 'light' : 'dark'}
      title={config.label}
      role="status"
      aria-live="polite"
      className={`inline-flex min-h-8 shrink-0 items-center justify-center rounded-full border shadow-sm backdrop-blur-md ${themeClass} ${
        compact
          ? 'h-8 w-8'
          : 'min-w-24 gap-2 px-3 text-xs font-bold'
      }`}
    >
      <span
        data-testid="sync-status-dot"
        className={`shrink-0 rounded-full ${compact ? 'h-2.5 w-2.5' : 'h-2 w-2'} ${dotClass}`}
      />
      <span className={compact ? 'sr-only' : 'whitespace-nowrap'}>
        {config.label}
      </span>
    </span>
  );
};
