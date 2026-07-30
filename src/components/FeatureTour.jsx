import React, { useEffect, useMemo, useRef, useState } from 'react';

const MOBILE_LAYOUT_BREAKPOINT = 768;

const PLAN_SURFACE_SELECTOR = '[data-testid="itinerary-horizontal-scroll"]';
const PLACE_CARD_SELECTOR = '[data-testid="place-card"]';

// Each step resolves its own target for the current layout, because the merged
// trip view renders different DOM for mobile and desktop. A step without a
// visible target degrades into an instructional no-target step instead of
// spotlighting hidden responsive DOM or silently activating another tab.
const BASE_TOUR_STEPS = [
  {
    id: 'sync-status',
    title: '掌握同步狀態',
    mobileSelectors: [
      '[data-testid="mobile-trip-sync-status"] [data-testid="sync-status-indicator"]',
      '[data-testid="sync-status-indicator"]',
    ],
    desktopSelectors: ['[data-testid="sync-status-indicator"]'],
    description: '這裡顯示連線、同步中、已同步與旅伴更新狀態。',
    noTargetTitle: '同步狀態只在雲端旅程顯示',
    noTargetDescription: '本機範例旅程不會同步，因此不顯示同步狀態；開啟可共編的旅程後，就會在旅程標題旁看到。',
  },
  {
    id: 'current-day-planning',
    title: '規劃當天行程',
    mobileSelectors: ['[data-testid="mobile-day-switcher"]'],
    desktopSelectors: ['[data-testid="itinerary-day-card"] [data-testid="day-theme-row"]'],
    mobileDescription: '手機一次專注一天：點天數切換，下方時間軸就會顯示當天的景點順序。',
    desktopDescription: '桌面把每天並排顯示：可以命名當天主題，並直接調整該天的景點順序。',
    noTargetTitle: '在行程分頁規劃當天',
    noTargetDescription: '切換到「行程」後，就能選擇天數、命名主題並調整當天的景點順序。',
  },
  {
    id: 'place-details',
    title: '景點資料集中管理',
    mobileSelectors: [
      `${PLACE_CARD_SELECTOR}[data-mobile-layout="timeline"] [data-testid="place-card-title"]`,
      `${PLACE_CARD_SELECTOR} [data-testid="place-card-title"]`,
    ],
    desktopSelectors: [
      '[data-testid="place-info-trigger"]',
      `${PLACE_CARD_SELECTOR} [data-testid="place-card-title"]`,
    ],
    mobileDescription: '點景點名稱或卡片開啟景點資訊，導航、編輯、周圍搜尋、附件、菜單與筆記都在裡面。',
    desktopDescription: '點卡片上的「景點資訊」，導航、編輯、周圍搜尋、附件、菜單與筆記集中在同一個面板。',
    noTargetTitle: '景點資訊在行程分頁開啟',
    noTargetDescription: '回到「行程」後點景點名稱或「景點資訊」，即可使用導航、編輯、周圍搜尋、附件、菜單與筆記。',
  },
  {
    id: 'map-itinerary',
    title: '從地圖掌握移動順序',
    mobileSelectors: ['[data-testid="mobile-nav-map"]'],
    desktopSelectors: ['[data-testid="map-panel"]'],
    mobileDescription: '點「地圖」後，標記與路線會依當日順序顯示，景點卡與選取狀態也同步。',
    desktopDescription: '地圖依當日順序顯示標記與路線，選取景點時會與左側行程同步。',
    noTargetTitle: '地圖依當日順序顯示',
    noTargetDescription: '開啟地圖後，標記與路線會依當日順序排列，並與行程的選取狀態同步。',
  },
  {
    id: 'expense-settlement',
    title: '記帳與結算轉帳',
    mobileSelectors: ['[data-testid="expense-tab-button"][data-layout="mobile"]'],
    desktopSelectors: ['[data-testid="expense-tab-button"][data-layout="desktop"]'],
    description: '在「記帳」記錄共同支出，結算建議可標記或取消「已轉帳」，重新整理後仍保留。',
    noTargetTitle: '記帳可記錄轉帳狀態',
    noTargetDescription: '開啟「記帳」後可記錄共同支出，並在結算建議標記或取消「已轉帳」。',
  },
  {
    id: 'trip-tools',
    title: '旅程工具與設定',
    mobileSelectors: ['[data-testid="app-settings-trigger"]'],
    desktopSelectors: ['[data-testid="app-settings-trigger"]'],
    description: '分享共編、共享清單、匯出、外觀設定、更新內容與這份導覽都集中在這裡。',
    noTargetTitle: '設定集中旅程工具',
    noTargetDescription: '分享共編、共享清單、匯出、外觀設定、更新內容與這份導覽都集中在設定中。',
  },
  {
    id: 'done',
    title: '開始規劃你的旅程',
    mobileSelectors: [],
    desktopSelectors: [],
    description: '隨時可以從設定重新開啟「功能介紹」或這份「功能導覽」。',
  },
];

const EMPTY_PLACE_FALLBACK_STEP = {
  id: 'empty-place-fallback',
  title: '新增景點後解鎖景點資訊',
  mobileSelectors: [],
  desktopSelectors: [],
  description: '這個旅程還沒有景點。新增景點後，點景點名稱或「景點資訊」就能使用導航、編輯、周圍搜尋、附件、菜單與筆記。',
};

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

function isMobileLayout() {
  return getViewportSize().width < MOBILE_LAYOUT_BREAKPOINT;
}

function isRenderedElement(element) {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function intersectsViewport(element) {
  const { width, height } = getViewportSize();
  const rect = element.getBoundingClientRect();
  return rect.right > 0 && rect.bottom > 0 && rect.left < width && rect.top < height;
}

// Prefers the first target already inside the viewport, so multi-day desktop
// planners spotlight the day the user is actually looking at.
function findVisibleTarget(selectors) {
  for (const selector of Array.isArray(selectors) ? selectors : []) {
    const candidates = [...document.querySelectorAll(selector)].filter(isRenderedElement);
    const inViewport = candidates.find(intersectsViewport);
    if (inViewport) return inViewport;
    if (candidates.length > 0) return candidates[0];
  }
  return null;
}

function getStepSelectors(step) {
  return isMobileLayout() ? step?.mobileSelectors : step?.desktopSelectors;
}

function resolveStepTarget(step) {
  return findVisibleTarget(getStepSelectors(step));
}

function getStepDescription(step, hasTarget) {
  if (!hasTarget && step?.noTargetDescription) return step.noTargetDescription;
  if (isMobileLayout() && step?.mobileDescription) return step.mobileDescription;
  if (!isMobileLayout() && step?.desktopDescription) return step.desktopDescription;
  return step?.description || '';
}

function getStepTitle(step, hasTarget) {
  if (!hasTarget && step?.noTargetTitle) return step.noTargetTitle;
  return step?.title || '';
}

function getTargetRect(step) {
  const target = resolveStepTarget(step);
  if (!target) return null;

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

// The place-details step only collapses into the empty-trip fallback when the
// planner surface is actually on screen and has no place cards. A hidden
// planner instead keeps the step and lets it fall back to instructional copy.
function buildTourSteps() {
  const planSurfaceVisible = Boolean(findVisibleTarget([PLAN_SURFACE_SELECTOR]));
  const hasPlaceCards = Boolean(findVisibleTarget([PLACE_CARD_SELECTOR]));
  const useEmptyPlaceFallback = planSurfaceVisible && !hasPlaceCards;

  return BASE_TOUR_STEPS.map((step) => (
    step.id === 'place-details' && useEmptyPlaceFallback
      ? EMPTY_PLACE_FALLBACK_STEP
      : step
  ));
}

function getSpotlightRect(targetRect) {
  if (!targetRect) return null;

  const { width: viewportWidth, height: viewportHeight } = getViewportSize();
  const left = Math.max(0, targetRect.left - SPOTLIGHT_PADDING);
  const top = Math.max(0, targetRect.top - SPOTLIGHT_PADDING);
  const right = Math.min(
    viewportWidth,
    targetRect.left + targetRect.width + SPOTLIGHT_PADDING,
  );
  const bottom = Math.min(
    viewportHeight,
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
  const [tourSteps, setTourSteps] = useState(BASE_TOUR_STEPS);
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const previousActiveElementRef = useRef(null);
  const dialogRef = useRef(null);
  const step = tourSteps[stepIndex] || tourSteps.at(-1);
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
    // Build once, on the frame after mount, so the trip view has laid out. The
    // step index is not reset here: it already starts at 0, and resetting it a
    // frame later would swallow a fast first `下一步`.
    const frameId = window.requestAnimationFrame(() => {
      if (!cancelled) setTourSteps(buildTourSteps());
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const updatePosition = () => {
      const nextRect = getTargetRect(step);
      if (!cancelled) setTargetRect(nextRect);
    };

    // Resolve synchronously so a step change never keeps the previous target's
    // spotlight, then refresh on the next frame once layout has settled.
    updatePosition();
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
    // `step` is one of the module-level step objects, so its identity is stable
    // across re-renders and this effect only re-runs when the step changes.
  }, [step]);

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
  const isLastStep = stepIndex === tourSteps.length - 1;
  const hasTarget = Boolean(targetRect);
  const stepHasTargetSelectors = (getStepSelectors(step) || []).length > 0;
  const isInstructionalStep = stepHasTargetSelectors && !hasTarget;
  const stepTitle = getStepTitle(step, hasTarget);
  const stepDescription = getStepDescription(step, hasTarget);
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
        <div
          data-testid="feature-tour-step"
          data-step-id={String(step?.id || '')}
          data-instructional={isInstructionalStep ? 'true' : undefined}
          className="contents"
        >
        <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${t.subText}`}>
          {stepIndex + 1} / {tourSteps.length}
        </p>
        <h2 id="feature-tour-title" className={`mt-2 text-xl font-black ${t.mainText}`}>
          {String(stepTitle)}
        </h2>
        <p className={`mt-2 text-sm leading-6 ${t.subText}`}>
          {String(stepDescription)}
        </p>
        {step?.id === 'empty-place-fallback' ? (
          <span data-testid="feature-tour-empty-place-fallback" className="sr-only">
            empty place fallback
          </span>
        ) : null}
        {isInstructionalStep ? (
          <span data-testid="feature-tour-instructional-step" className="sr-only">
            instructional step
          </span>
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
              onClick={() => setStepIndex((current) => Math.min(tourSteps.length - 1, current + 1))}
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
