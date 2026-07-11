import React from 'react';

const baseClassName = 'motion-safe:animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70';

export const SkeletonText = ({ lines = 3, className = '' }) => (
  <div data-testid="skeleton-text" aria-hidden="true" className={`space-y-2 ${className}`}>
    {Array.from({ length: Math.max(1, Number(lines) || 1) }).map((_, index) => (
      <div
        key={`skeleton-text-${index}`}
        className={`${baseClassName} h-3 ${index === lines - 1 ? 'w-2/3' : 'w-full'}`}
      />
    ))}
  </div>
);

export const SkeletonCard = ({ className = '' }) => (
  <div
    data-testid="skeleton-card"
    aria-hidden="true"
    className={`rounded-3xl border border-slate-500/15 p-4 shadow-sm ${className}`}
  >
    <div className={`${baseClassName} h-36 w-full rounded-2xl`} />
    <SkeletonText lines={3} className="mt-4" />
  </div>
);

export const SkeletonAvatar = ({ className = '' }) => (
  <div
    data-testid="skeleton-avatar"
    aria-hidden="true"
    className={`${baseClassName} h-12 w-12 rounded-full ${className}`}
  />
);

export const SkeletonButton = ({ className = '' }) => (
  <div
    data-testid="skeleton-button"
    aria-hidden="true"
    className={`${baseClassName} h-11 w-32 rounded-xl ${className}`}
  />
);
