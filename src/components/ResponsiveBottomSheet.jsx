import { useEffect, useRef } from 'react';

import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export const ResponsiveBottomSheet = ({
  children,
  onClose,
  labelledBy,
  testId,
  dataMode,
  initialFocusSelector,
  panelClassName = '',
}) => {
  const dialogRef = useRef(null);

  useBodyScrollLock();

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;
    const initialFocusElement = initialFocusSelector
      ? dialog?.querySelector(initialFocusSelector)
      : null;
    (initialFocusElement || dialog?.querySelector(FOCUSABLE_SELECTOR))?.focus();

    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [initialFocusSelector]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      const focusableElements = dialog
        ? [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
        : [];
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      data-testid={testId}
      data-mode={dataMode}
      style={{ zIndex: 9999, touchAction: 'pan-y' }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden w-full max-w-[100vw]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        className={`border rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[94dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
};
