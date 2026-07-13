import React from 'react';

export function OfflineBanner({ isOnline, className = '' }) {
  if (isOnline) {
    return null;
  }

  return (
    <div
      data-testid="offline-banner"
      role="status"
      aria-live="polite"
      className={`fixed bottom-0 left-0 right-0 z-[100] bg-slate-900 text-white px-4 py-3 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] ${className}`}
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
        <span>
          目前離線（無網路連線），變更可能尚未同步。恢復網路後請確認同步狀態。
        </span>
      </div>
    </div>
  );
}
