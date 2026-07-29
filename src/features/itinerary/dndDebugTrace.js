/**
 * Opt-in, non-PII drag lifecycle trace for diagnosing iPhone Safari drag
 * activation/move/release behavior. Enabled only via `?dndDebug=1` in the
 * URL. Never logs place names, coordinates, room ids, or any repository
 * data - only event names, timestamps, structural indices/ids (day keys,
 * which are trip-internal labels such as "Day 1", not personal data),
 * `data-testid` values, and raw touch/pointer metadata (identifiers,
 * counts, flags). Re-read on every call (not cached) so it reflects the
 * current URL rather than whatever it was on first check.
 */
export function isDndDebugEnabled() {
  try {
    return typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('dndDebug') === '1';
  } catch {
    return false;
  }
}

const MAX_EVENTS = 60;

/** @type {Array<Record<string, unknown>>} */
let events = [];
let nextEventId = 1;
/** @type {Set<(events: Array<Record<string, unknown>>) => void>} */
const listeners = new Set();

let lastScrollAt = 0;
const dragState = {
  activeDraggableId: '',
  phase: 'idle',
  sourceIndex: null,
  destinationIndex: null,
  reason: null,
};

function notify() {
  listeners.forEach((listener) => listener(events));
}

function closestTestId(target) {
  if (!(target instanceof Element)) return '';
  const el = target.closest('[data-testid]');
  return el ? String(el.getAttribute('data-testid') || '') : '';
}

function pushEvent(name, detail = {}) {
  if (!isDndDebugEnabled()) return;
  const sinceScroll = lastScrollAt ? Math.round(performance.now() - lastScrollAt) : '';
  const entry = {
    id: nextEventId++,
    t: Math.round(performance.now()),
    event: name,
    targetTestId: detail.targetTestId || '',
    pointerType: detail.pointerType || '',
    touchIdentifier: detail.touchIdentifier ?? '',
    touchesCount: detail.touchesCount ?? '',
    changedTouchesCount: detail.changedTouchesCount ?? '',
    cancelable: detail.cancelable ?? '',
    defaultPrevented: detail.defaultPrevented ?? '',
    sinceLastScrollMs: sinceScroll,
    activeDraggable: dragState.activeDraggableId,
    phase: dragState.phase,
    sourceIndex: detail.sourceIndex ?? dragState.sourceIndex,
    destinationIndex: detail.destinationIndex ?? dragState.destinationIndex,
    reason: detail.reason ?? dragState.reason,
  };
  events = events.length >= MAX_EVENTS ? [...events.slice(1), entry] : [...events, entry];
  notify();
}

/** Structured lifecycle trace - drives both the console log and the panel. */
export function traceDnd(event, detail = {}) {
  if (!isDndDebugEnabled()) return;

  if (event === 'onBeforeCapture' || event === 'onDragStart') {
    dragState.activeDraggableId = String(detail.draggableId || '');
    dragState.phase = 'dragging';
  }
  if (event === 'onDragStart') {
    dragState.sourceIndex = detail.sourceIndex ?? null;
  }
  if (event === 'onDragEnd') {
    dragState.phase = 'ended';
    dragState.sourceIndex = detail.sourceIndex ?? dragState.sourceIndex;
    dragState.destinationIndex = detail.destinationIndex ?? null;
    dragState.reason = detail.reason ?? null;
  }

  const safeDetail = {};
  ['sourceDroppableId', 'destinationDroppableId', 'sourceIndex', 'destinationIndex', 'reason', 'draggableId']
    .forEach((key) => {
      if (detail[key] !== undefined) safeDetail[key] = detail[key];
    });
  console.info(`[dndDebug] ${event}`, {
    t: Math.round(performance.now()),
    ...safeDetail,
  });
  pushEvent(event, {
    sourceIndex: detail.sourceIndex,
    destinationIndex: detail.destinationIndex,
    reason: detail.reason,
  });

  if (event === 'onDragEnd') {
    dragState.activeDraggableId = '';
    dragState.phase = 'idle';
  }
}

export function traceDndNextFrame(label) {
  if (!isDndDebugEnabled()) return;
  requestAnimationFrame(() => {
    traceDnd(`${label}:nextFrame`);
  });
}

let rawListenersInstalled = false;

/**
 * Installs document-level, non-PII raw touch/pointer/scroll/click listeners
 * purely for on-screen diagnosis of drag activation/move/release timing.
 * No-op unless `?dndDebug=1` is present. Idempotent. Never calls
 * preventDefault, never touches drag/itinerary state, never writes to the
 * repository - purely observational.
 */
export function installRawEventTrace() {
  if (!isDndDebugEnabled() || rawListenersInstalled || typeof document === 'undefined') return;
  rawListenersInstalled = true;

  const touchDetail = (event) => ({
    targetTestId: closestTestId(event.target),
    touchIdentifier: event.changedTouches?.[0]?.identifier ?? '',
    touchesCount: event.touches ? event.touches.length : '',
    changedTouchesCount: event.changedTouches ? event.changedTouches.length : '',
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
  });
  const pointerDetail = (event) => ({
    targetTestId: closestTestId(event.target),
    pointerType: event.pointerType || '',
    cancelable: event.cancelable,
    defaultPrevented: event.defaultPrevented,
  });

  const onTouchStart = (event) => pushEvent('touchstart', touchDetail(event));
  const onTouchMove = (event) => pushEvent('touchmove', touchDetail(event));
  const onTouchEnd = (event) => pushEvent('touchend', touchDetail(event));
  const onTouchCancel = (event) => pushEvent('touchcancel', touchDetail(event));
  const onPointerDown = (event) => pushEvent('pointerdown', pointerDetail(event));
  const onPointerMove = (event) => pushEvent('pointermove', pointerDetail(event));
  const onPointerUp = (event) => pushEvent('pointerup', pointerDetail(event));
  const onPointerCancel = (event) => pushEvent('pointercancel', pointerDetail(event));
  const onClick = (event) => pushEvent('click', { targetTestId: closestTestId(event.target) });
  const onScroll = () => {
    lastScrollAt = performance.now();
    pushEvent('scroll', {});
  };

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });
  document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  document.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });
  document.addEventListener('pointercancel', onPointerCancel, { capture: true, passive: true });
  document.addEventListener('click', onClick, { capture: true, passive: true });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
}

export function subscribeDndDebugEvents(listener) {
  listeners.add(listener);
  listener(events);
  return () => listeners.delete(listener);
}

export function getDndDebugEvents() {
  return events;
}

export function clearDndDebugEvents() {
  events = [];
  notify();
}
