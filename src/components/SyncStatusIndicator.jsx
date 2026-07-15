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

export const SyncStatusIndicator = ({ status = 'idle' }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.idle;

  return (
    <span
      data-testid="sync-status-indicator"
      title={config.label}
      aria-live="polite"
      className="inline-flex min-h-7 min-w-24 shrink-0 items-center justify-center gap-1.5 rounded-full border border-slate-500/15 bg-white/70 px-2.5 text-[10px] font-bold shadow-sm backdrop-blur-md dark:bg-slate-950/45"
    >
      <span
        data-testid="sync-status-dot"
        className={`h-2 w-2 shrink-0 rounded-full ${config.dotClass}`}
      />
      <span className={`whitespace-nowrap ${config.textClass}`}>
        {config.label}
      </span>
    </span>
  );
};
