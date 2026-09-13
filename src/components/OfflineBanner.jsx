import React from 'react';

const OFFLINE_COPY = {
  cloud: '目前離線，無法確認雲端同步狀態。恢復網路後請先確認資料，再繼續操作。',
  lobby: '目前離線，雲端旅程操作暫時不可用。恢復網路後再試。',
  'local-example': '目前離線。示範旅程仍可使用；地圖、搜尋等需要網路的功能暫時不可用。',
  'offline-preview': '目前離線。',
};

export function OfflineBanner({
  isOnline,
  mode = 'cloud',
  aboveNavigation = false,
  className = '',
}) {
  if (isOnline) {
    return null;
  }

  const copy = OFFLINE_COPY[mode] || OFFLINE_COPY.cloud;
  const positionClass = aboveNavigation
    ? 'bottom-[calc(4.5rem+max(env(safe-area-inset-bottom),0.5rem))] md:bottom-0'
    : 'bottom-0';

  return (
    <div
      data-testid="offline-banner"
      data-mode={mode}
      role="status"
      aria-live="polite"
      className={`fixed left-0 right-0 z-[100] bg-slate-900 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] ${positionClass} ${className}`}
    >
      <div className="flex items-center justify-center gap-2 max-w-5xl mx-auto text-sm font-bold">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24" 
          strokeWidth={2} 
          stroke="currentColor" 
          className="w-5 h-5 shrink-0"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3l18 18M9.9 5.53A8.985 8.985 0 0112 5c4.97 0 9 4.03 9 9 0 .94-.145 1.848-.415 2.7M6.027 6.027A8.966 8.966 0 003 14c0 4.97 4.03 9 9 9 3.013 0 5.681-1.48 7.33-3.766" />
        </svg>
        <span>{copy}</span>
      </div>
    </div>
  );
}
