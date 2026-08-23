import React from 'react';

export const EmptyState = ({
  icon = null,
  title,
  description,
  primaryAction = null,
  secondaryAction = null,
  testId = 'empty-state',
  className = '',
}) => (
  <section
    data-testid={testId}
    className={`mx-auto flex max-w-md flex-col items-center justify-center rounded-3xl border border-dashed border-slate-400/40 p-8 text-center ${className}`}
  >
    {icon ? (
      <div data-testid="empty-state-icon" className="mb-4 text-5xl" aria-hidden="true">
        {icon}
      </div>
    ) : null}
    <h2 className="text-xl font-black text-current">{String(title || '')}</h2>
    {description ? (
      <p className="mt-2 text-sm font-semibold leading-6 text-current opacity-70">
        {String(description)}
      </p>
    ) : null}
    {primaryAction || secondaryAction ? (
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        {primaryAction ? (
          <button
            type="button"
            data-testid={primaryAction.testId || 'empty-state-primary'}
            onClick={primaryAction.onClick}
            className="min-h-11 rounded-xl bg-blue-600 px-5 text-sm font-black text-white shadow-lg shadow-blue-500/25"
          >
            {String(primaryAction.label || '')}
          </button>
        ) : null}
        {secondaryAction ? (
          <button
            type="button"
            data-testid={secondaryAction.testId || 'empty-state-secondary'}
            onClick={secondaryAction.onClick}
            className="min-h-11 rounded-xl border border-current/25 px-5 text-sm font-black text-current transition-colors hover:border-blue-400 hover:text-blue-500"
          >
            {String(secondaryAction.label || '')}
          </button>
        ) : null}
      </div>
    ) : null}
  </section>
);
