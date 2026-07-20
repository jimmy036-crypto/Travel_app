const ACTIVE_MEMBER_KEY_PREFIX = 'travel-active-member-';
const CHECKLIST_ACTOR_KEY_PREFIX = 'travel-checklist-actor-';

const trimText = (value) => String(value ?? '').trim();

const normalizeMembers = (members) => {
  const normalized = [];
  const source = Array.isArray(members) ? members : [];

  source.forEach((member) => {
    const name = trimText(member);
    if (name && !normalized.includes(name)) normalized.push(name);
  });

  return normalized;
};

const getStorage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

export const getTicketActiveMemberStorageKey = (roomId) => {
  const normalizedRoomId = trimText(roomId);
  return normalizedRoomId ? `${ACTIVE_MEMBER_KEY_PREFIX}${normalizedRoomId}` : '';
};

export const readTicketActiveMember = ({ roomId, members } = {}) => {
  const key = getTicketActiveMemberStorageKey(roomId);
  const storage = getStorage();
  if (!key || !storage) return '';

  const validMembers = new Set(normalizeMembers(members));

  try {
    const storedMember = storage.getItem(key);
    if (storedMember !== null) {
      const normalizedMember = trimText(storedMember);
      return validMembers.has(normalizedMember) ? normalizedMember : '';
    }

    const legacyKey = `${CHECKLIST_ACTOR_KEY_PREFIX}${trimText(roomId)}`;
    const fallbackMember = trimText(storage.getItem(legacyKey));
    if (!validMembers.has(fallbackMember)) return '';

    try {
      storage.setItem(key, fallbackMember);
    } catch {
      // A valid legacy identity is still usable when storage cannot be upgraded.
    }
    return fallbackMember;
  } catch {
    return '';
  }
};

export const writeTicketActiveMember = ({ roomId, member, members } = {}) => {
  const key = getTicketActiveMemberStorageKey(roomId);
  const storage = getStorage();
  const normalizedMember = trimText(member);
  if (!key || !storage || !normalizeMembers(members).includes(normalizedMember)) return false;

  try {
    storage.setItem(key, normalizedMember);
    return true;
  } catch {
    return false;
  }
};

export const clearTicketActiveMember = (roomId) => {
  const key = getTicketActiveMemberStorageKey(roomId);
  const storage = getStorage();
  if (!key || !storage) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};
