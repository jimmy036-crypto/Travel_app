import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MENU_WIDTH = 256;
const MENU_MARGIN = 12;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getMenuPosition(trigger) {
  if (!(trigger instanceof HTMLElement)) {
    return { top: MENU_MARGIN, left: MENU_MARGIN };
  }

  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth || 390;
  const viewportHeight = window.innerHeight || 844;
  const estimatedHeight = 316;
  const hasRoomBelow = rect.bottom + MENU_MARGIN + estimatedHeight <= viewportHeight;
  const top = hasRoomBelow
    ? rect.bottom + 8
    : Math.max(MENU_MARGIN, rect.top - estimatedHeight - 8);
  const left = clamp(
    rect.right - MENU_WIDTH,
    MENU_MARGIN,
    Math.max(MENU_MARGIN, viewportWidth - MENU_WIDTH - MENU_MARGIN),
  );

  return { top, left };
}

export const AppSettingsMenu = ({
  t,
  version,
  onOpenAppearance,
  onOpenReleaseNotes,
  onStartFeatureTour,
  onCheckUpdates,
  isCheckingUpdates = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: MENU_MARGIN, left: MENU_MARGIN });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const closeMenu = useCallback(({ restoreFocus = false } = {}) => {
    setIsOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus?.();
      });
    }
  }, []);

  const openMenu = useCallback(() => {
    setPosition(getMenuPosition(triggerRef.current));
    setIsOpen(true);
  }, []);

  const toggleMenu = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    if (isOpen) {
      closeMenu();
      return;
    }
    openMenu();
  }, [closeMenu, isOpen, openMenu]);

  const runAction = useCallback((action) => {
    closeMenu();
    action?.();
  }, [closeMenu]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      closeMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu({ restoreFocus: true });
      }
    };

    const handleLayoutChange = () => closeMenu();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('orientationchange', handleLayoutChange);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('orientationchange', handleLayoutChange);
    };
  }, [closeMenu, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector('button')?.focus?.();
    });
  }, [isOpen]);

  const menuStyle = useMemo(() => ({
    top: `${position.top}px`,
    left: `${position.left}px`,
    width: `${MENU_WIDTH}px`,
    zIndex: 10060,
  }), [position.left, position.top]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="開啟設定"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid="app-settings-trigger"
        onClick={toggleMenu}
        className={`relative flex min-h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-black shadow-sm transition-transform active:scale-95 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 1 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 1 1-4.2 0v-.06a1.8 1.8 0 0 0-1.09-1.65 1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 1 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.09H3a2.1 2.1 0 1 1 0-4.2h.06A1.8 1.8 0 0 0 4.7 8.62a1.8 1.8 0 0 0-.36-1.98l-.04-.04A2.1 2.1 0 1 1 7.27 3.63l.04.04a1.8 1.8 0 0 0 1.98.36A1.8 1.8 0 0 0 10.38 2.4V2a2.1 2.1 0 1 1 4.2 0v.06a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.98 1.8 1.8 0 0 0 1.65 1.09H21a2.1 2.1 0 1 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
        </svg>
      </button>

      {isOpen ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="設定"
          data-testid="app-settings-menu"
          className={`fixed grid gap-1.5 rounded-2xl border p-2 shadow-2xl backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}
          style={menuStyle}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="app-settings-appearance"
            onClick={() => runAction(onOpenAppearance)}
            className={`min-h-11 rounded-xl px-3 text-left text-sm font-black transition-colors hover:bg-blue-500/10 ${t.mainText}`}
          >
            外觀設定
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="app-settings-release-notes"
            onClick={() => runAction(onOpenReleaseNotes)}
            className={`min-h-11 rounded-xl px-3 text-left text-sm font-black transition-colors hover:bg-blue-500/10 ${t.mainText}`}
          >
            更新內容
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="app-settings-feature-tour"
            onClick={() => runAction(onStartFeatureTour)}
            className={`min-h-11 rounded-xl px-3 text-left text-sm font-black transition-colors hover:bg-blue-500/10 ${t.mainText}`}
          >
            功能導覽
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="app-settings-check-updates"
            onClick={() => runAction(onCheckUpdates)}
            disabled={isCheckingUpdates}
            className={`min-h-11 rounded-xl px-3 text-left text-sm font-black transition-colors hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-60 ${t.mainText}`}
          >
            {isCheckingUpdates ? '檢查中...' : '檢查更新'}
          </button>
          <div
            role="none"
            data-testid="app-settings-version"
            className={`mt-1 rounded-xl border px-3 py-2 text-[10px] font-bold leading-5 ${t.cardBg} ${t.cardBorder} ${t.subText}`}
          >
            <span className="block uppercase tracking-[0.16em]">版本資訊</span>
            <span className="block truncate">{String(version || '')}</span>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
};
