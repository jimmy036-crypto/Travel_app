let cachedEnabled;

/**
 * Opt-in, non-PII drag lifecycle trace for diagnosing iPhone Safari
 * release-to-drop behavior. Enabled only via `?dndDebug=1` in the URL.
 * Never logs place names, coordinates, or any repository data - only
 * event names, timestamps, and structural indices/ids (day keys, which
 * are trip-internal labels such as "Day 1", not personal data).
 */
export function isDndDebugEnabled() {
  if (cachedEnabled !== undefined) return cachedEnabled;
  try {
    cachedEnabled = typeof window !== 'undefined'
      && new URLSearchParams(window.location.search).get('dndDebug') === '1';
  } catch {
    cachedEnabled = false;
  }
  return cachedEnabled;
}

export function traceDnd(event, detail = {}) {
  if (!isDndDebugEnabled()) return;
  const safeDetail = {};
  ['sourceDroppableId', 'destinationDroppableId', 'sourceIndex', 'destinationIndex', 'reason', 'draggableId']
    .forEach((key) => {
      if (detail[key] !== undefined) safeDetail[key] = detail[key];
    });
  console.info(`[dndDebug] ${event}`, {
    t: Math.round(performance.now()),
    ...safeDetail,
  });
}

export function traceDndNextFrame(label) {
  if (!isDndDebugEnabled()) return;
  requestAnimationFrame(() => {
    traceDnd(`${label}:nextFrame`);
  });
}
