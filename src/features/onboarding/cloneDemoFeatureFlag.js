export const EDITABLE_DEMO_CLONE_FLAG = 'VITE_ENABLE_EDITABLE_DEMO_CLONE';

function resolveLocation(location) {
  if (location !== undefined) return location;
  try {
    return typeof window === 'undefined' ? null : window.location;
  } catch {
    return null;
  }
}

export function isEditableDemoCloneEnabled(options = {}) {
  const override = options.override
    ?? globalThis.__TRAVEL_APP_ENABLE_EDITABLE_DEMO_CLONE__;
  if (typeof override === 'boolean') return override;
  const env = options.env || import.meta.env;
  return env?.[EDITABLE_DEMO_CLONE_FLAG] === 'true';
}

export function isCloneDemoEmulatorRuntime(options = {}) {
  const env = options.env || import.meta.env;
  const location = resolveLocation(options.location);
  const hostname = String(location?.hostname || '').toLowerCase();
  const localHost = hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
  return env?.MODE === 'emulator'
    && localHost;
}
