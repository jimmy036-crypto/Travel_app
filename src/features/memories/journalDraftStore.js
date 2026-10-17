const DRAFT_PREFIX = 'travel-journal-draft:v1:';
const storageError = '本機草稿尚未備份。請保留此畫面，連線後儲存，避免遺失輸入。';
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const identityKey = ({ uid, kind, recordId }) => {
  if (![uid, kind, recordId].every((value) => typeof value === 'string' && value.length > 0)) throw new Error('missing draft identity');
  return `${DRAFT_PREFIX}${JSON.stringify([uid, kind, recordId])}`;
};

export function readJournalDraft(identity) {
  try {
    const stored = localStorage.getItem(identityKey(identity));
    if (!stored) return { ok: true, draft: null, error: '' };
    const draft = JSON.parse(stored);
    if (!Number.isSafeInteger(draft?.baseRevision) || draft.baseRevision < 0 || !isObject(draft.baseValue) || !isObject(draft.value)) throw new Error('invalid draft');
    return { ok: true, draft, error: '' };
  } catch { return { ok: false, draft: null, error: storageError }; }
}

export function writeJournalDraft({ uid, kind, recordId, baseRevision, baseValue, value }) {
  try {
    localStorage.setItem(identityKey({ uid, kind, recordId }), JSON.stringify({ baseRevision, baseValue, value }));
    return { ok: true, error: '' };
  } catch { return { ok: false, error: storageError }; }
}

export function removeJournalDraft(identity) {
  try {
    localStorage.removeItem(identityKey(identity));
    return { ok: true, error: '' };
  } catch { return { ok: false, error: storageError }; }
}

export function journalValuesEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => Object.hasOwn(b, key) && journalValuesEqual(a[key], b[key]));
}

const pathPart = (key) => key.replace(/~/g, '~0').replace(/\//g, '~1');

function mergeValues(base, local, remote, path, conflicts, choices) {
  if (journalValuesEqual(local, remote) || journalValuesEqual(base, remote)) return local;
  if (journalValuesEqual(base, local)) return remote;
  if (isObject(base) && isObject(local) && isObject(remote)) {
    const merged = {};
    for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
      const value = mergeValues(base[key], local[key], remote[key], `${path}/${pathPart(key)}`, conflicts, choices);
      if (value !== undefined) merged[key] = value;
    }
    return merged;
  }
  if (choices) {
    if (!['local', 'remote'].includes(choices[path])) throw new Error('請為每個衝突欄位選擇要保留的內容。');
    return choices[path] === 'local' ? local : remote;
  }
  conflicts.push({ path, base, local, remote });
  return local;
}

export function createJournalConflict({ baseValue, localValue, value, revision }) {
  const conflicts = [];
  const merged = mergeValues(baseValue, localValue, value, '', conflicts);
  return { baseValue, localValue, remoteValue: value, revision, conflicts, merged };
}

export function resolveJournalConflict(conflict, choices) {
  return mergeValues(conflict.baseValue, conflict.localValue, conflict.remoteValue, '', [], choices);
}
