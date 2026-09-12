const VERSION = 1;
const trim = value => String(value ?? '').trim();

export function companionStorageKey({ source, uid, tripId } = {}) {
  if (!trim(tripId) || !['firebase', 'example'].includes(source)) return '';
  if (source === 'firebase' && !trim(uid)) return '';
  return `travel-companion-v${VERSION}:${JSON.stringify([source, source === 'firebase' ? trim(uid) : '', trim(tripId)])}`;
}

export function readCompanionPreference(key) {
  if (!key) return { member: '', known: false, storageError: false };
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return { member: '', known: false, storageError: false };
    const value = JSON.parse(raw);
    if (value?.version !== VERSION || typeof value.confirmed !== 'boolean'
      || typeof value.member !== 'string'
      || (value.confirmed ? !value.member.trim() : value.member !== '')) {
      return { member: '', known: true, storageError: true };
    }
    return { member: value.confirmed ? value.member : '', known: true, storageError: false };
  } catch {
    // Unknown/corrupt storage must never fall through to an unscoped identity.
    return { member: '', known: true, storageError: true };
  }
}

export function writeCompanionPreference(key, member, members) {
  if (!key || (member !== '' && !members.includes(member))) return false;
  try {
    // Clearing writes a tombstone; removing the key would resurrect legacy hints.
    localStorage.setItem(key, JSON.stringify({ version: VERSION, confirmed: member !== '', member }));
    return true;
  } catch {
    return false;
  }
}

export function exactCompanionCandidate(displayName, members) {
  const matches = members.filter(member => member === trim(displayName));
  return matches.length === 1 ? matches[0] : '';
}

// One in-memory store per scoped browser preference also keeps an explicit
// session choice usable when storage is blocked and the trip is reopened.
const stores = new Map();
export function companionStore(key) {
  if (stores.has(key)) return stores.get(key);
  let snapshot = { ...readCompanionPreference(key), skipped: false, invalidated: false };
  const listeners = new Set();
  const publish = next => { snapshot = next; listeners.forEach(listener => listener()); };
  const store = {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    select(member, members, invalidated = false) {
      const remembered = writeCompanionPreference(key, member, members);
      publish({ member, known: true, storageError: !remembered, skipped: member === '' && !invalidated, invalidated });
    },
    skip: () => publish({ ...snapshot, skipped: true }),
  };
  stores.set(key, store);
  return store;
}
