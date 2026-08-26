import { useEffect, useRef } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COMPACT_VIEWPORT_QUERY = '(max-width: 767px)';
const BEACON_START_PROGRESS = 0.52;
const BEACON_END_PROGRESS = 0.965;
const BEACON_TRAVEL_SECONDS = 8;
const BEACON_CYCLE_SECONDS = 9;
const BEACON_INITIAL_ELAPSED_SECONDS = (
  ((0.72 - BEACON_START_PROGRESS) / (BEACON_END_PROGRESS - BEACON_START_PROGRESS))
  * BEACON_TRAVEL_SECONDS
);

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

function tangentOnQuadratic(start, control, end, progress) {
  return {
    x: (2 * (1 - progress) * (control.x - start.x))
      + (2 * progress * (end.x - control.x)),
    y: (2 * (1 - progress) * (control.y - start.y))
      + (2 * progress * (end.y - control.y)),
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
  highlightProgress = null,
  highlightOpacity = 0,
}) {
  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    const point = pointOnQuadratic(start, control, end, progress);
    const highlight = Number.isFinite(highlightProgress)
      ? Math.max(0, 1 - (Math.abs(progress - highlightProgress) / 0.095))
      : 0;
    const alpha = baseAlpha + (highlight * highlightOpacity * 0.34);

    fillDot(
      context,
      point,
      radius + (highlight * highlightOpacity * 0.42),
      rgba(color, Math.max(0.08, alpha)),
    );
  }
}

function getBeaconFrame(elapsedSeconds, animate) {
  if (!animate) {
    return {
      opacity: 0.9,
      progress: 0.72,
    };
  }

  const cycleTime = elapsedSeconds % BEACON_CYCLE_SECONDS;
  const travelProgress = Math.min(cycleTime / BEACON_TRAVEL_SECONDS, 1);
  const fadeOut = Math.min((BEACON_CYCLE_SECONDS - cycleTime) / 0.65, 1);

  return {
    opacity: Math.max(0, fadeOut),
    progress: BEACON_START_PROGRESS
      + ((BEACON_END_PROGRESS - BEACON_START_PROGRESS) * travelProgress),
  };
}

function drawTravelBeacon(context, {
  route,
  progress,
  opacity,
  color,
  compact,
}) {
  if (opacity <= 0) return;

  const tailStep = compact ? 0.017 : 0.014;
  for (let index = 7; index >= 1; index -= 1) {
    const tailProgress = Math.max(BEACON_START_PROGRESS, progress - (index * tailStep));
    if (tailProgress >= progress) continue;
    const point = pointOnQuadratic(route.start, route.control, route.end, tailProgress);
    const strength = (1 - (index / 8)) * opacity;
    fillDot(
      context,
      point,
      (compact ? 0.9 : 1.05) + (strength * 0.45),
      rgba(color, strength * 0.42),
    );
  }

  const point = pointOnQuadratic(route.start, route.control, route.end, progress);
  const tangent = tangentOnQuadratic(route.start, route.control, route.end, progress);
  const angle = Math.atan2(tangent.y, tangent.x);
  const markerSize = compact ? 6.4 : 7.1;

  context.save();
  context.translate(point.x, point.y);
  context.rotate(angle);
  context.shadowColor = rgba(color, 0.7 * opacity);
  context.shadowBlur = compact ? 7 : 9;
  context.fillStyle = rgba(color, 0.96 * opacity);
  context.beginPath();
  context.moveTo(markerSize, 0);
  context.lineTo(-markerSize * 0.72, -markerSize * 0.48);
  context.lineTo(-markerSize * 0.34, 0);
  context.lineTo(-markerSize * 0.72, markerSize * 0.48);
  context.closePath();
  context.fill();
  context.restore();
}

function drawRouteFrame(context, {
  width,
  height,
  mode,
  compact,
  phase,
  animate,
  journeyState,
}) {
  const palette = ROUTE_PALETTES[mode];
  const horizontalInset = Math.max(18, width * 0.07);
  const mainRoute = {
    start: { x: horizontalInset, y: height * 0.8 },
    control: {
      x: width * 0.51,
      y: height * 0.2,
    },
    end: { x: width - horizontalInset, y: height * 0.74 },
  };
  const beacon = journeyState === 'empty'
    ? null
    : getBeaconFrame(phase, animate);

  context.clearRect(0, 0, width, height);
  context.save();

  drawDottedCurve(context, {
    start: { x: width * 0.14, y: height * 0.94 },
    control: { x: width * 0.6, y: height * 0.6 },
    end: { x: width * 0.9, y: height * 0.28 },
    count: compact ? 26 : 38,
    color: palette.secondary,
    baseAlpha: mode === 'light' ? 0.1 : 0.14,
    radius: compact ? 0.75 : 0.9,
  });

  drawDottedCurve(context, {
    ...mainRoute,
    count: compact ? 58 : 84,
    color: palette.main,
    baseAlpha: mode === 'light' ? 0.42 : 0.54,
    radius: compact ? 1.05 : 1.2,
    highlightProgress: beacon?.progress,
    highlightOpacity: beacon?.opacity,
  });

  [0.035, 0.52, 0.965].forEach((progress, index) => {
    const point = pointOnQuadratic(
      mainRoute.start,
      mainRoute.control,
      mainRoute.end,
      progress,
    );
    const destinationArrival = index === 2 && beacon
      ? Math.max(0, (beacon.progress - 0.9) / 0.065) * beacon.opacity
      : 0;
    const radius = (compact ? 3.1 : 3.5) + (destinationArrival * 0.6);

    context.shadowColor = rgba(palette.node, mode === 'light' ? 0.28 : 0.4);
    context.shadowBlur = compact ? 5 : 7;
    fillDot(context, point, radius + 1.7, rgba(palette.node, mode === 'light' ? 0.08 : 0.12));
    fillDot(context, point, radius, rgba(palette.node, mode === 'light' ? 0.78 : 0.9));
    fillDot(context, point, Math.max(1, radius * 0.36), rgba(palette.main, 0.96));
    context.shadowBlur = 0;
  });

  if (beacon) {
    drawTravelBeacon(context, {
      route: mainRoute,
      progress: beacon.progress,
      opacity: beacon.opacity,
      color: palette.node,
      compact,
    });
  }

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
export function LobbyRouteArc({
  mode = 'light',
  journeyState = 'upcoming',
  embedded = false,
}) {
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);
  const resolvedMode = mode === 'dark' ? 'dark' : 'light';
  const resolvedJourneyState = journeyState === 'ongoing' || journeyState === 'upcoming'
    ? journeyState
    : 'empty';

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!host || !canvas) return undefined;

    host.dataset.canvasState = 'fallback';
    canvas.style.opacity = '0';
    if (fallback) fallback.style.opacity = '1';

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
    let lastAnimationTimestamp = null;
    let drawAccumulatorMs = null;
    let animationElapsedSeconds = BEACON_INITIAL_ELAPSED_SECONDS;
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
      lastAnimationTimestamp = null;
      drawAccumulatorMs = null;
    };

    const canAnimate = () => (
      !renderingFailed
      && !isDisposed
      && !reduceMotion
      && resolvedJourneyState !== 'empty'
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
          journeyState: resolvedJourneyState,
        });
        showCanvas();
      } catch {
        stopAnimation();
        showFallback();
      }
    };

    const renderCurrentFrame = () => {
      renderFrame(animationElapsedSeconds, canAnimate());
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
        renderCurrentFrame();
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
      const elapsedSinceLastFrame = lastAnimationTimestamp === null
        ? 0
        : Math.min(Math.max(timestamp - lastAnimationTimestamp, 0), 100);
      animationElapsedSeconds += elapsedSinceLastFrame / 1000;
      lastAnimationTimestamp = timestamp;
      drawAccumulatorMs = drawAccumulatorMs === null
        ? frameInterval
        : drawAccumulatorMs + elapsedSinceLastFrame;

      if (drawAccumulatorMs >= frameInterval) {
        renderFrame(animationElapsedSeconds, true);
        drawAccumulatorMs %= frameInterval;
      }
      scheduleAnimation();
    }

    const handleVisibilityChange = () => {
      if (isDisposed) return;
      if (document.hidden || !isIntersecting) {
        stopAnimation();
        return;
      }
      renderCurrentFrame();
      scheduleAnimation();
    };

    const handleReducedMotionChange = (event) => {
      if (isDisposed) return;
      reduceMotion = Boolean(event.matches);
      stopAnimation();
      if (!reduceMotion) animationElapsedSeconds = BEACON_INITIAL_ELAPSED_SECONDS;
      renderCurrentFrame();
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
          renderCurrentFrame();
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
  }, [resolvedJourneyState, resolvedMode]);

  const fallbackColor = resolvedMode === 'light' ? 'text-blue-600' : 'text-blue-400';
  const secondaryFallbackColor = resolvedMode === 'light' ? 'text-indigo-500' : 'text-indigo-400';
  const fallbackMarkerRoute = {
    start: { x: 24, y: 112 },
    control: { x: 182, y: 28 },
    end: { x: 336, y: 104 },
  };
  const fallbackMarker = pointOnQuadratic(
    fallbackMarkerRoute.start,
    fallbackMarkerRoute.control,
    fallbackMarkerRoute.end,
    0.72,
  );
  const fallbackTangent = tangentOnQuadratic(
    fallbackMarkerRoute.start,
    fallbackMarkerRoute.control,
    fallbackMarkerRoute.end,
    0.72,
  );
  const fallbackAngle = Math.atan2(fallbackTangent.y, fallbackTangent.x) * (180 / Math.PI);

  return (
    <div
      ref={hostRef}
      data-testid="lobby-route-arc"
      data-mode={resolvedMode}
      data-journey-state={resolvedJourneyState}
      data-canvas-state="fallback"
      aria-hidden="true"
      className={`pointer-events-none relative isolate h-full min-w-0 w-full select-none overflow-hidden ${embedded ? 'min-h-0' : `min-h-[96px] rounded-2xl border md:min-h-[144px] ${SURFACE_CLASSES[resolvedMode]}`}`}
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
          d="M24 112 Q182 28 336 104"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="1 7"
          className={`${fallbackColor} opacity-55`}
        />
        <path
          d="M50 132 Q216 84 326 39"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeDasharray="1 9"
          className={`${secondaryFallbackColor} opacity-20`}
        />
        <g fill="currentColor" className={resolvedMode === 'light' ? 'text-cyan-600' : 'text-cyan-400'}>
          <circle cx="35" cy="107" r="4" opacity="0.82" />
          <circle cx="187" cy="69" r="4.5" opacity="0.88" />
          <circle cx="325" cy="99" r="4" opacity="0.82" />
        </g>
        {resolvedJourneyState !== 'empty' ? (
          <path
            data-testid="lobby-route-arc-fallback-beacon"
            d="M 7.2 0 L -5.2 -3.6 L -2.4 0 L -5.2 3.6 Z"
            transform={`translate(${fallbackMarker.x} ${fallbackMarker.y}) rotate(${fallbackAngle})`}
            fill="currentColor"
            className={resolvedMode === 'light' ? 'text-cyan-700' : 'text-cyan-300'}
            opacity="0.9"
          />
        ) : null}
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
