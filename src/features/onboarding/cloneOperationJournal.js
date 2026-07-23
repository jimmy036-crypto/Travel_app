export const CLONE_JOURNAL_STORAGE_KEY = 'travel-app-demo-clone-operation-v1';
export const CLONE_JOURNAL_SCHEMA_VERSION = '1.0.0';
export const CLONE_JOURNAL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

const STATES = new Set([
  'prepared',
  'writing-room',
  'room-verified',
  'linking-mytrips',
  'repair-required',
  'completed',
]);

const EXACT_FIELDS = [
  'schemaVersion',
  'operationId',
  'roomId',
  'templateVersion',
  'title',
  'startDate',
  'payloadFingerprint',
  'state',
  'createdAt',
  'updatedAt',
];

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isIsoDate(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isBoundedText(value, max = 200) {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

export function validateCloneJournal(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { valid: false, errors: ['Journal must be an object.'] };
  }
  const keys = Object.keys(value).sort();
  if (keys.join('|') !== [...EXACT_FIELDS].sort().join('|')) errors.push('Journal fields are not minimal or complete.');
  if (value.schemaVersion !== CLONE_JOURNAL_SCHEMA_VERSION) errors.push('Unsupported schemaVersion.');
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/i.test(value.operationId || '')) errors.push('Invalid operationId.');
  if (!/^[a-z0-9][a-z0-9-]{5,127}$/i.test(value.roomId || '')) errors.push('Invalid roomId.');
  if (!Number.isInteger(value.templateVersion) || value.templateVersion < 1) errors.push('Invalid templateVersion.');
  if (!isBoundedText(value.title)) errors.push('Invalid title.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.startDate || '')) errors.push('Invalid startDate.');
  if (!/^fnv1a-[a-z0-9]{7}$/i.test(value.payloadFingerprint || '')) errors.push('Invalid payloadFingerprint.');
  if (!STATES.has(value.state)) errors.push('Invalid state.');
  if (!isIsoDate(value.createdAt)) errors.push('Invalid createdAt.');
  if (!isIsoDate(value.updatedAt)) errors.push('Invalid updatedAt.');
  return { valid: errors.length === 0, errors };
}

export function checkCloneJournalStorage(storage) {
  const target = resolveStorage(storage);
  if (!target) return { available: false, reason: 'unavailable' };
  const key = `${CLONE_JOURNAL_STORAGE_KEY}:probe`;
  const value = `probe-${Date.now()}`;
  try {
    target.setItem(key, value);
    if (target.getItem(key) !== value) throw new Error('Storage read-back mismatch.');
    target.removeItem(key);
    return { available: true, reason: null };
  } catch (error) {
    try {
      target.removeItem(key);
    } catch {
      // The original preflight error remains authoritative.
    }
    return { available: false, reason: 'preflight-failed', error };
  }
}

export function createCloneJournal(input, options = {}) {
  const now = new Date(options.now ?? Date.now());
  const timestamp = now.toISOString();
  const value = {
    schemaVersion: CLONE_JOURNAL_SCHEMA_VERSION,
    operationId: input.operationId,
    roomId: input.roomId,
    templateVersion: input.templateVersion,
    title: input.title,
    startDate: input.startDate,
    payloadFingerprint: input.payloadFingerprint,
    state: input.state || 'prepared',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const validation = validateCloneJournal(value);
  if (!validation.valid) throw new Error(`Invalid Clone Journal: ${validation.errors.join(' ')}`);
  return value;
}

export function readCloneJournal(options = {}) {
  const target = resolveStorage(options.storage);
  const preflight = checkCloneJournalStorage(target);
  if (!preflight.available) return { journal: null, status: preflight.reason, error: preflight.error || null };
  let raw;
  try {
    raw = target.getItem(CLONE_JOURNAL_STORAGE_KEY);
  } catch (error) {
    return { journal: null, status: 'read-failed', error };
  }
  if (raw === null) return { journal: null, status: 'missing', error: null };
  try {
    const journal = JSON.parse(raw);
    const validation = validateCloneJournal(journal);
    if (!validation.valid) return { journal: null, status: 'invalid', errors: validation.errors, error: null };
    const now = Number(new Date(options.now ?? Date.now()));
    if (now - Date.parse(journal.updatedAt) > CLONE_JOURNAL_EXPIRY_MS) {
      return { journal: null, status: 'expired', error: null };
    }
    return { journal: structuredClone(journal), status: 'ready', error: null };
  } catch {
    return { journal: null, status: 'corrupted', error: null };
  }
}

export function writeCloneJournal(journal, options = {}) {
  const validation = validateCloneJournal(journal);
  if (!validation.valid) return { ok: false, status: 'invalid', errors: validation.errors };
  const target = resolveStorage(options.storage);
  const preflight = checkCloneJournalStorage(target);
  if (!preflight.available) return { ok: false, status: preflight.reason, error: preflight.error || null };
  const existing = readCloneJournal({ storage: target, now: options.now });
  if (
    existing.journal
    && existing.journal.roomId === journal.roomId
    && (
      existing.journal.operationId !== journal.operationId
      || existing.journal.payloadFingerprint !== journal.payloadFingerprint
    )
  ) {
    return { ok: false, status: 'collision', error: null };
  }
  const next = structuredClone(journal);
  next.updatedAt = new Date(options.now ?? Date.now()).toISOString();
  try {
    target.setItem(CLONE_JOURNAL_STORAGE_KEY, JSON.stringify(next));
    return { ok: true, status: 'written', journal: structuredClone(next), error: null };
  } catch (error) {
    return { ok: false, status: 'write-failed', error };
  }
}

export function removeCloneJournal(options = {}) {
  const target = resolveStorage(options.storage);
  const preflight = checkCloneJournalStorage(target);
  if (!preflight.available) return { ok: false, status: preflight.reason, error: preflight.error || null };
  try {
    target.removeItem(CLONE_JOURNAL_STORAGE_KEY);
    return { ok: true, status: 'removed', error: null };
  } catch (error) {
    return { ok: false, status: 'remove-failed', error };
  }
}
