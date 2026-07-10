import React, { useEffect, useMemo, useRef, useState } from 'react';

const TOUR_STEPS = [
  {
    id: 'sync-status',
    selector: '[data-testid="sync-status-indicator"]',
    title: '掌握同步狀態',
    description: '你可以看到資料是否正在同步，以及是否收到旅伴的最新更新。',
  },
  {
    id: 'mobile-days',
    selector: '[data-testid="mobile-day-switcher"]',
    title: '快速切換每天行程',
    description: '點選天數即可快速移動到對應行程，不容易誤觸景點操作。',
  },
  {
    id: 'place-actions',
    selector: '[data-testid="place-action-menu-trigger"]',
    title: '更多景點操作',
    description: '點「⋯」即可編輯、查看周邊、複製或刪除景點。',
  },
  {
    id: 'place-info',
    selector: '[data-testid="place-info-trigger"]',
    title: '查看完整景點資料',
    description: '地址、定位、附件與備註都集中在景點資訊中。',
  },
  {
    id: 'done',
    selector: null,
    title: '開始規劃旅程',
    description: '新的多人協作與手機操作體驗已準備完成。',
  },
];

const VIEWPORT_MARGIN = 12;
const CARD_WIDTH = 320;
const CARD_GAP = 12;
const CARD_ESTIMATED_HEIGHT = 260;
const SPOTLIGHT_PADDING = 8;

function getViewportSize() {
  return {
    width: window.innerWidth || 390,
    height: window.innerHeight || 844,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getTargetRect(selector) {
  if (!selector) return null;
  const target = document.querySelector(selector);
  if (!(target instanceof HTMLElement)) return null;

  target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function getSpotlightRect(targetRect) {
  if (!targetRect) return null;

  const { width: viewportWidth, height: viewportHeight } = getViewportSize();
  const left = Math.max(VIEWPORT_MARGIN, targetRect.left - SPOTLIGHT_PADDING);
  const top = Math.max(VIEWPORT_MARGIN, targetRect.top - SPOTLIGHT_PADDING);
  const right = Math.min(
    viewportWidth - VIEWPORT_MARGIN,
    targetRect.left + targetRect.width + SPOTLIGHT_PADDING,
  );
  const bottom = Math.min(
    viewportHeight - VIEWPORT_MARGIN,
    targetRect.top + targetRect.height + SPOTLIGHT_PADDING,
  );

  return {
    top: Math.min(top, bottom - 1),
    left: Math.min(left, right - 1),
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

function getOverlayRects(spotlightRect) {
  const { width: viewportWidth, height: viewportHeight } = getViewportSize();
  if (!spotlightRect) {
    return [
      {
        key: 'full',
        top: 0,
        left: 0,
        width: viewportWidth,
        height: viewportHeight,
      },
    ];
  }

  const spotlightBottom = spotlightRect.top + spotlightRect.height;
  const spotlightRight = spotlightRect.left + spotlightRect.width;

  return [
    {
      key: 'top',
      top: 0,
      left: 0,
      width: viewportWidth,
      height: spotlightRect.top,
    },
    {
      key: 'bottom',
      top: spotlightBottom,
      left: 0,
      width: viewportWidth,
      height: Math.max(0, viewportHeight - spotlightBottom),
    },
    {
      key: 'left',
      top: spotlightRect.top,
      left: 0,
      width: spotlightRect.left,
      height: spotlightRect.height,
    },
    {
      key: 'right',
      top: spotlightRect.top,
      left: spotlightRight,
      width: Math.max(0, viewportWidth - spotlightRight),
      height: spotlightRect.height,
    },
  ];
}

function getCardPosition(targetRect) {
  const { width: viewportWidth, height: viewportHeight } = getViewportSize();
  const width = Math.min(CARD_WIDTH, viewportWidth - (VIEWPORT_MARGIN * 2));

  if (!targetRect) {
    return {
      top: Math.max(VIEWPORT_MARGIN, (viewportHeight - CARD_ESTIMATED_HEIGHT) / 2),
      left: Math.max(VIEWPORT_MARGIN, (viewportWidth - width) / 2),
      width,
    };
  }

  const belowTop = targetRect.top + targetRect.height + CARD_GAP;
  const aboveTop = targetRect.top - CARD_ESTIMATED_HEIGHT - CARD_GAP;
  const canFitBelow = belowTop + CARD_ESTIMATED_HEIGHT <= viewportHeight - VIEWPORT_MARGIN;
  const canFitAbove = aboveTop >= VIEWPORT_MARGIN;
  const top = canFitBelow
    ? belowTop
    : canFitAbove
      ? aboveTop
      : clamp(
          (viewportHeight - CARD_ESTIMATED_HEIGHT) / 2,
          VIEWPORT_MARGIN,
          viewportHeight - CARD_ESTIMATED_HEIGHT - VIEWPORT_MARGIN,
        );
  const left = clamp(
    targetRect.left + (targetRect.width / 2) - (width / 2),
    VIEWPORT_MARGIN,
    viewportWidth - width - VIEWPORT_MARGIN,
  );

  return { top, left, width };
}

export const FeatureTour = ({ t, onClose }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const previousActiveElementRef = useRef(null);
  const dialogRef = useRef(null);
  const step = TOUR_STEPS[stepIndex] || TOUR_STEPS.at(-1);
  const spotlightRect = useMemo(() => getSpotlightRect(targetRect), [targetRect]);
  const overlayRects = useMemo(() => getOverlayRects(spotlightRect), [spotlightRect]);
  const cardPosition = useMemo(
    () => getCardPosition(spotlightRect || targetRect),
    [spotlightRect, targetRect],
  );

  useEffect(() => {
    previousActiveElementRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      const previousActiveElement = previousActiveElementRef.current;
      if (previousActiveElement instanceof HTMLElement) {
        previousActiveElement.focus?.();
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const updatePosition = () => {
      const nextRect = getTargetRect(step?.selector);
      if (!cancelled) setTargetRect(nextRect);
    };

    window.requestAnimationFrame(updatePosition);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('orientationchange', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('orientationchange', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [step?.selector]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector('button')?.focus?.();
    });
  }, [stepIndex]);

  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;
  const highlightStyle = spotlightRect
    ? {
        top: `${spotlightRect.top}px`,
        left: `${spotlightRect.left}px`,
        width: `${spotlightRect.width}px`,
        height: `${spotlightRect.height}px`,
      }
    : null;

  return (
    <div
      data-testid="feature-tour"
      className="pointer-events-none fixed inset-0 z-10050"
      aria-label="功能導覽"
    >
      <div
        data-testid="feature-tour-overlay"
        className="fixed inset-0 pointer-events-none"
        aria-hidden="true"
      >
        {overlayRects.map((rect) => (
          <div
            key={rect.key}
            className="pointer-events-auto fixed bg-slate-950/70"
            style={{
              top: `${rect.top}px`,
              left: `${rect.left}px`,
              width: `${rect.width}px`,
              height: `${rect.height}px`,
            }}
          />
        ))}
      </div>

      {highlightStyle ? (
        <div
          data-testid="feature-tour-spotlight"
          className="pointer-events-auto fixed rounded-2xl border-[3px] border-blue-400 shadow-[0_0_28px_rgba(59,130,246,0.6),0_0_0_1px_rgba(255,255,255,0.32)]"
          style={highlightStyle}
          onClick={(event) => event.stopPropagation()}
          aria-hidden="true"
        >
          <div
            data-testid="feature-tour-target-highlight"
            className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-white/35"
          />
        </div>
      ) : null}

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-tour-title"
        data-testid="feature-tour-card"
        className={`pointer-events-auto fixed overflow-y-auto rounded-3xl border p-5 shadow-2xl ${t.modalBg} ${t.cardBorder}`}
        style={{
          top: `${cardPosition.top}px`,
          left: `${cardPosition.left}px`,
          width: `${cardPosition.width}px`,
          maxHeight: 'calc(100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
        }}
      >
        <div data-testid="feature-tour-step" className="contents">
        <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${t.subText}`}>
          {stepIndex + 1} / {TOUR_STEPS.length}
        </p>
        <h2 id="feature-tour-title" className={`mt-2 text-xl font-black ${t.mainText}`}>
          {String(step?.title || '')}
        </h2>
        <p className={`mt-2 text-sm leading-6 ${t.subText}`}>
          {String(step?.description || '')}
        </p>
        {!targetRect && step?.selector ? (
          <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-bold text-amber-600">
            這個項目目前不在畫面上，你仍可繼續下一步。
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            data-testid="feature-tour-skip"
            onClick={onClose}
            className={`min-h-11 rounded-xl px-3 text-sm font-black ${t.subText}`}
          >
            略過導覽
          </button>
          {isLastStep ? (
            <button
              type="button"
              data-testid="feature-tour-finish"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-black text-white shadow-lg shadow-blue-500/25"
            >
              完成
            </button>
          ) : (
            <button
              type="button"
              data-testid="feature-tour-next"
              onClick={() => setStepIndex((current) => Math.min(TOUR_STEPS.length - 1, current + 1))}
              className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-black text-white shadow-lg shadow-blue-500/25"
            >
              下一步
            </button>
          )}
          <button
            type="button"
            data-testid="feature-tour-back"
            disabled={isFirstStep}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            className={`col-span-2 min-h-10 rounded-xl border px-3 text-sm font-black disabled:cursor-not-allowed disabled:opacity-40 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
          >
            上一步
          </button>
        </div>
        </div>
      </section>
    </div>
  );
};
