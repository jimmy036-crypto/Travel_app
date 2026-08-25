import { useEffect, useRef } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';
const ANIMATION_SPEED = 0.35;

const SURFACE_CLASSES = {
  light: 'border-blue-200/70 bg-gradient-to-br from-blue-50/80 via-cyan-50/55 to-indigo-100/65',
  dark: 'border-blue-300/20 bg-gradient-to-br from-slate-950/70 via-blue-950/45 to-indigo-950/55',
};

const ROUTE_PALETTES = {
  light: {
    main: [37, 99, 235],
    secondary: [79, 70, 229],
    node: [8, 145, 178],
  },
  dark: {
    main: [96, 165, 250],
    secondary: [129, 140, 248],
    node: [34, 211, 238],
  },
};

function rgba([red, green, blue], alpha) {
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function pointOnQuadratic(start, control, end, progress) {
  const inverse = 1 - progress;
  return {
    x: (inverse * inverse * start.x)
      + (2 * inverse * progress * control.x)
      + (progress * progress * end.x),
    y: (inverse * inverse * start.y)
      + (2 * inverse * progress * control.y)
      + (progress * progress * end.y),
  };
}

function fillDot(context, point, radius, color) {
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function drawDottedCurve(context, {
  start,
  control,
  end,
  count,
  color,
  baseAlpha,
  radius,
  phase,
  animate,
}) {
  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const point = pointOnQuadratic(start, control, end, progress);
    const motion = animate ? Math.sin((progress * 8) + phase) : 0;
    const alpha = baseAlpha + (animate ? motion * 0.045 : 0);

    fillDot(
      context,
      { x: point.x, y: point.y + (motion * 0.45) },
      radius,
      rgba(color, Math.max(0.08, alpha)),
    );
  }
}

function drawRouteFrame(context, {
  width,
  height,
  mode,
  compact,
  phase,
  animate,
}) {
  const palette = ROUTE_PALETTES[mode];
  const horizontalInset = Math.max(18, width * 0.07);
  const mainRoute = {
    start: { x: horizontalInset, y: height * 0.73 },
    control: {
      x: width * 0.51,
      y: (height * 0.08) + (animate ? Math.sin(phase * 0.45) * 0.65 : 0),
    },
    end: { x: width - horizontalInset, y: height * 0.69 },
  };

  context.clearRect(0, 0, width, height);
  context.save();

  drawDottedCurve(context, {
    start: { x: width * 0.14, y: height * 0.88 },
    control: { x: width * 0.6, y: height * 0.52 },
    end: { x: width * 0.9, y: height * 0.27 },
    count: compact ? 26 : 38,
    color: palette.secondary,
    baseAlpha: mode === 'light' ? 0.1 : 0.14,
    radius: compact ? 0.75 : 0.9,
    phase: phase * 0.65,
    animate,
  });

  drawDottedCurve(context, {
    ...mainRoute,
    count: compact ? 58 : 84,
    color: palette.main,
    baseAlpha: mode === 'light' ? 0.42 : 0.54,
    radius: compact ? 1.05 : 1.2,
    phase,
    animate,
  });

  [0.035, 0.52, 0.965].forEach((progress, index) => {
    const point = pointOnQuadratic(
      mainRoute.start,
      mainRoute.control,
      mainRoute.end,
      progress,
    );
    const pulse = animate ? Math.sin((phase * 0.7) + (index * 1.7)) * 0.22 : 0;
    const radius = (compact ? 3.1 : 3.5) + pulse;

    context.shadowColor = rgba(palette.node, mode === 'light' ? 0.28 : 0.4);
    context.shadowBlur = compact ? 5 : 7;
    fillDot(context, point, radius + 1.7, rgba(palette.node, mode === 'light' ? 0.08 : 0.12));
    fillDot(context, point, radius, rgba(palette.node, mode === 'light' ? 0.78 : 0.9));
    fillDot(context, point, Math.max(1, radius * 0.36), rgba(palette.main, 0.96));
    context.shadowBlur = 0;
  });

  context.restore();
}

function addMediaChangeListener(mediaQuery, listener) {
  if (!mediaQuery) return () => {};
  if (typeof mediaQuery.addEventListener === 'function') {
    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }
  mediaQuery.addListener?.(listener);
  return () => mediaQuery.removeListener?.(listener);
}

function getMediaQuery(query) {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia(query) : null;
  } catch {
    return null;
  }
}

/**
 * Visual concept reference: ThreeUI Community Predictive Arc (MIT, Meng To).
 * This dependency-free Travel renderer is independently authored around a
 * dotted quadratic route and destination nodes. No ThreeUI source code was copied.
 */
export function LobbyRouteArc({ mode = 'light' }) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);
  const resolvedMode = mode === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!host || !canvas) return undefined;

    host.dataset.canvasState = 'fallback';
    canvas.style.opacity = '0';
    if (fallback) fallback.style.opacity = '1';
    if (typeof window.CanvasRenderingContext2D !== 'function') return undefined;

    let context;
    try {
      context = canvas.getContext('2d');
    } catch {
      return undefined;
    }
    if (!context) return undefined;

    const reducedMotionMedia = getMediaQuery(REDUCED_MOTION_QUERY);
    const compactViewportMedia = getMediaQuery(COMPACT_VIEWPORT_QUERY);
    const requestFrame = window.requestAnimationFrame?.bind(window);
    const cancelFrame = window.cancelAnimationFrame?.bind(window);

    let reduceMotion = Boolean(reducedMotionMedia?.matches);
    let compact = Boolean(compactViewportMedia?.matches);
    const supportsIntersectionObserver = typeof IntersectionObserver === 'function';
    let isIntersecting = !supportsIntersectionObserver;
    let rafId = null;
    let lastDrawTime = Number.NEGATIVE_INFINITY;
    let animationStartTime = null;
    let logicalWidth = Math.max(1, host.clientWidth || 360);
    let logicalHeight = Math.max(1, host.clientHeight || (compact ? 96 : 144));
    let renderingFailed = false;
    let isDisposed = false;

    const showCanvas = () => {
      host.dataset.canvasState = 'ready';
      canvas.style.opacity = '1';
      if (fallback) fallback.style.opacity = '0';
    };

    const showFallback = () => {
      renderingFailed = true;
      host.dataset.canvasState = 'fallback';
      canvas.style.opacity = '0';
      if (fallback) fallback.style.opacity = '1';
    };

    const stopAnimation = () => {
      if (rafId !== null && cancelFrame) cancelFrame(rafId);
      rafId = null;
    };

    const canAnimate = () => (
      !renderingFailed
      && !isDisposed
      && !reduceMotion
      && isIntersecting
      && !document.hidden
      && typeof requestFrame === 'function'
    );

    const renderFrame = (phase = 0, animate = false) => {
      if (renderingFailed || isDisposed) return;
      try {
        drawRouteFrame(context, {
          width: logicalWidth,
          height: logicalHeight,
          mode: resolvedMode,
          compact,
          phase,
          animate,
        });
        showCanvas();
      } catch {
        stopAnimation();
        showFallback();
      }
    };

    const resizeCanvas = (nextWidth, nextHeight) => {
      if (isDisposed) return;
      try {
        logicalWidth = Math.max(1, Math.round(nextWidth || logicalWidth));
        logicalHeight = Math.max(1, Math.round(nextHeight || logicalHeight));
        const dprCap = compact ? 1.25 : 1.5;
        const pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), dprCap);
        const pixelWidth = Math.max(1, Math.round(logicalWidth * pixelRatio));
        const pixelHeight = Math.max(1, Math.round(logicalHeight * pixelRatio));

        if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
        if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        renderFrame(0, false);
      } catch {
        stopAnimation();
        showFallback();
      }
    };

    const scheduleAnimation = () => {
      if (rafId === null && canAnimate()) rafId = requestFrame(animationTick);
    };

    function animationTick(timestamp) {
      rafId = null;
      if (!canAnimate()) return;

      const frameInterval = 1000 / (compact ? 24 : 30);
      if ((timestamp - lastDrawTime) >= frameInterval) {
        if (animationStartTime === null) animationStartTime = timestamp;
        renderFrame(((timestamp - animationStartTime) / 1000) * ANIMATION_SPEED, true);
        lastDrawTime = timestamp;
      }
      scheduleAnimation();
    }

    const handleVisibilityChange = () => {
      if (isDisposed) return;
      if (document.hidden || !isIntersecting) {
        stopAnimation();
        return;
      }
      renderFrame(0, false);
      scheduleAnimation();
    };

    const handleReducedMotionChange = (event) => {
      if (isDisposed) return;
      reduceMotion = Boolean(event.matches);
      stopAnimation();
      renderFrame(0, false);
      scheduleAnimation();
    };

    const handleCompactViewportChange = (event) => {
      if (isDisposed) return;
      compact = Boolean(event.matches);
      resizeCanvas(logicalWidth, logicalHeight);
      scheduleAnimation();
    };

    let resizeObserver = null;
    let intersectionObserver = null;

    if (typeof ResizeObserver === 'function') {
      try {
        resizeObserver = new ResizeObserver((entries) => {
          if (isDisposed) return;
          const entry = entries[entries.length - 1];
          if (!entry?.contentRect) return;
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0) resizeCanvas(width, height);
        });
        resizeObserver.observe(host);
      } catch {
        resizeObserver = null;
      }
    }

    if (supportsIntersectionObserver) {
      try {
        intersectionObserver = new IntersectionObserver((entries) => {
          if (isDisposed) return;
          const entry = entries[entries.length - 1];
          isIntersecting = entry?.isIntersecting ?? true;
          if (!isIntersecting) {
            stopAnimation();
            return;
          }
          renderFrame(0, false);
          scheduleAnimation();
        });
        intersectionObserver.observe(host);
      } catch {
        intersectionObserver = null;
        isIntersecting = true;
      }
    }

    const removeReducedMotionListener = addMediaChangeListener(
      reducedMotionMedia,
      handleReducedMotionChange,
    );
    const removeCompactViewportListener = addMediaChangeListener(
      compactViewportMedia,
      handleCompactViewportChange,
    );

    document.addEventListener('visibilitychange', handleVisibilityChange);
    resizeCanvas(logicalWidth, logicalHeight);
    scheduleAnimation();

    return () => {
      isDisposed = true;
      stopAnimation();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      removeReducedMotionListener();
      removeCompactViewportListener();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [resolvedMode]);

  const fallbackColor = resolvedMode === 'light' ? 'text-blue-600' : 'text-blue-400';
  const secondaryFallbackColor = resolvedMode === 'light' ? 'text-indigo-500' : 'text-indigo-400';

  return (
    <div
      ref={hostRef}
      data-testid="lobby-route-arc"
      data-mode={resolvedMode}
      data-canvas-state="fallback"
      aria-hidden="true"
      className={`pointer-events-none relative isolate h-[96px] min-w-0 w-full select-none overflow-hidden rounded-2xl border md:h-[144px] ${SURFACE_CLASSES[resolvedMode]}`}
    >
      <svg
        ref={fallbackRef}
        data-testid="lobby-route-arc-fallback"
        viewBox="0 0 360 140"
        preserveAspectRatio="none"
        focusable="false"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-200"
      >
        <path
          d="M24 104 Q182 18 336 99"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1 7"
          className={`${fallbackColor} opacity-55`}
        />
        <path
          d="M48 120 Q210 72 326 38"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="1 9"
          className={`${secondaryFallbackColor} opacity-20`}
        />
        <g fill="currentColor" className={resolvedMode === 'light' ? 'text-cyan-600' : 'text-cyan-400'}>
          <circle cx="29" cy="101" r="4" opacity="0.82" />
          <circle cx="184" cy="61" r="4.5" opacity="0.88" />
          <circle cx="331" cy="96" r="4" opacity="0.82" />
        </g>
      </svg>
      <canvas
        ref={canvasRef}
        data-testid="lobby-route-arc-canvas"
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0 transition-opacity duration-200"
      />
    </div>
  );
}

export default LobbyRouteArc;
