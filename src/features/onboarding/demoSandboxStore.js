import { createTokyoDemoTrip } from './demoTripData.js';
import {
  DEMO_SANDBOX_ID,
  DEMO_SANDBOX_SCHEMA_VERSION,
  DEMO_SANDBOX_SOURCE,
  DEMO_SANDBOX_STORAGE_KEY,
  DEMO_SANDBOX_TEMPLATE_VERSION,
} from './demoSandboxConstants.js';

let memorySandbox = null;

function deepCopy(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function resolveNow(now) {
  const value = now instanceof Date ? new Date(now.getTime()) : new Date(now ?? Date.now());
  return Number.isNaN(value.getTime()) ? new Date() : value;
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isJsonValue(value, seen = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen))
    : Object.entries(value).every(([key, item]) => key.length > 0 && isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isValidTrip(value) {
  return isPlainObject(value)
    && value.roomId === DEMO_SANDBOX_ID
    && value.isDemo === true
    && value.readOnly === false
    && value.source === DEMO_SANDBOX_SOURCE
    && value.version === DEMO_SANDBOX_TEMPLATE_VERSION
    && isPlainObject(value.meta)
    && typeof value.meta.title === 'string'
    && isPlainObject(value.itinerary)
    && Object.values(value.itinerary).every(Array.isArray)
    && Array.isArray(value.checklist)
    && isJsonValue(value);
}

export function validateDemoSandbox(value) {
  const errors = [];
  if (!isPlainObject(value)) return { valid: false, errors: ['Sandbox must be an object.'] };
  if (value.schemaVersion !== DEMO_SANDBOX_SCHEMA_VERSION) errors.push('Unsupported schemaVersion.');
  if (value.templateVersion !== DEMO_SANDBOX_TEMPLATE_VERSION) errors.push('Unsupported templateVersion.');
  if (value.sandboxId !== DEMO_SANDBOX_ID) errors.push('Invalid sandboxId.');
  if (!isIsoDate(value.createdAt)) errors.push('Invalid createdAt.');
  if (!isIsoDate(value.updatedAt)) errors.push('Invalid updatedAt.');
  if (!isValidTrip(value.trip)) errors.push('Invalid trip.');
  return { valid: errors.length === 0, errors };
}

export function createDemoSandbox(options = {}) {
  const now = resolveNow(options.now);
  const sourceTrip = (options.createTemplate || createTokyoDemoTrip)(options.templateOptions);
  const trip = deepCopy(sourceTrip);
  trip.roomId = DEMO_SANDBOX_ID;
  trip.readOnly = false;
  trip.source = DEMO_SANDBOX_SOURCE;
  trip.version = DEMO_SANDBOX_TEMPLATE_VERSION;
  const timestamp = now.toISOString();
  return {
    schemaVersion: DEMO_SANDBOX_SCHEMA_VERSION,
    templateVersion: DEMO_SANDBOX_TEMPLATE_VERSION,
    sandboxId: DEMO_SANDBOX_ID,
    trip,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function checkDemoSandboxStorage(storage) {
  const target = resolveStorage(storage);
  if (!target) return { available: false, reason: 'unavailable' };
  const probeKey = `${DEMO_SANDBOX_STORAGE_KEY}:probe`;
  const probeValue = `probe-${Date.now()}`;
  try {
    target.setItem(probeKey, probeValue);
    if (target.getItem(probeKey) !== probeValue) throw new Error('Storage read-back mismatch.');
    target.removeItem(probeKey);
    return { available: true, reason: null };
  } catch (error) {
    try {
      target.removeItem(probeKey);
    } catch {
      // The caller receives the original availability failure.
    }
    return { available: false, reason: 'preflight-failed', error };
  }
}

function memorySandboxResult(factory, reason, error) {
  if (!memorySandbox || !validateDemoSandbox(memorySandbox).valid) memorySandbox = factory();
  return {
    sandbox: deepCopy(memorySandbox),
    persistence: 'memory',
    recovered: false,
    reason,
    error: error || null,
  };
}

function persistFreshSandbox(target, factory, reason) {
  const sandbox = factory();
  memorySandbox = deepCopy(sandbox);
  try {
    target.setItem(DEMO_SANDBOX_STORAGE_KEY, JSON.stringify(sandbox));
    return {
      sandbox: deepCopy(sandbox),
      persistence: 'localStorage',
      recovered: reason !== 'missing',
      reason,
      error: null,
    };
  } catch (error) {
    return memorySandboxResult(factory, 'write-failed', error);
  }
}

export function readDemoSandbox(options = {}) {
  const factory = () => createDemoSandbox(options);
  const target = resolveStorage(options.storage);
  const preflight = checkDemoSandboxStorage(target);
  if (!preflight.available) return memorySandboxResult(factory, preflight.reason, preflight.error);
  let raw;
  try {
    raw = target.getItem(DEMO_SANDBOX_STORAGE_KEY);
  } catch (error) {
    return memorySandboxResult(factory, 'read-failed', error);
  }
  if (raw === null) return persistFreshSandbox(target, factory, 'missing');
  try {
    const parsed = JSON.parse(raw);
    const validation = validateDemoSandbox(parsed);
    if (!validation.valid) return persistFreshSandbox(target, factory, 'invalid');
    memorySandbox = deepCopy(parsed);
    return {
      sandbox: deepCopy(parsed),
      persistence: 'localStorage',
      recovered: false,
      reason: null,
      error: null,
    };
  } catch {
    return persistFreshSandbox(target, factory, 'corrupted');
  }
}

export function writeDemoSandbox(value, options = {}) {
  const validation = validateDemoSandbox(value);
  if (!validation.valid) {
    return {
      ok: false,
      sandbox: null,
      persistence: 'none',
      reason: 'invalid',
      errors: validation.errors,
      error: null,
    };
  }
  const now = resolveNow(options.now);
  const sandbox = deepCopy(value);
  sandbox.updatedAt = now.toISOString();
  const target = resolveStorage(options.storage);
  const preflight = checkDemoSandboxStorage(target);
  if (!preflight.available) {
    memorySandbox = deepCopy(sandbox);
    return {
      ok: true,
      sandbox: deepCopy(sandbox),
      persistence: 'memory',
      reason: preflight.reason,
      errors: [],
      error: preflight.error || null,
    };
  }
  try {
    target.setItem(DEMO_SANDBOX_STORAGE_KEY, JSON.stringify(sandbox));
    memorySandbox = deepCopy(sandbox);
    return {
      ok: true,
      sandbox: deepCopy(sandbox),
      persistence: 'localStorage',
      reason: null,
      errors: [],
      error: null,
    };
  } catch (error) {
    memorySandbox = deepCopy(sandbox);
    return {
      ok: false,
      sandbox: deepCopy(sandbox),
      persistence: 'memory',
      reason: 'write-failed',
      errors: [],
      error,
    };
  }
}

export function resetDemoSandbox(options = {}) {
  const factory = () => createDemoSandbox(options);
  const target = resolveStorage(options.storage);
  const preflight = checkDemoSandboxStorage(target);
  if (!preflight.available) {
    memorySandbox = factory();
    return {
      sandbox: deepCopy(memorySandbox),
      persistence: 'memory',
      recovered: true,
      reason: preflight.reason,
      error: preflight.error || null,
    };
  }
  try {
    target.removeItem(DEMO_SANDBOX_STORAGE_KEY);
    return persistFreshSandbox(target, factory, 'reset');
  } catch (error) {
    memorySandbox = factory();
    return {
      sandbox: deepCopy(memorySandbox),
      persistence: 'memory',
      recovered: true,
      reason: 'reset-failed',
      error,
    };
  }
}

export function clearDemoSandboxMemory() {
  memorySandbox = null;
}
