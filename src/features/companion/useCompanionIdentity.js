import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  companionStorageKey, companionStore, exactCompanionCandidate,
} from './companionIdentity.js';
import { readLegacyCompanionCandidate } from '../tickets/ticketIdentity.js';

export function useCompanionIdentity({ source, uid, tripId, members, ready, displayName = '' }) {
  const key = companionStorageKey({ source, uid, tripId });
  const store = useMemo(() => companionStore(key), [key]);
  const generation = useMemo(() => ({ key }), [key]);
  const selection = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const current = useRef(null);
  useLayoutEffect(() => {
    const context = { key, ready, members, generation };
    current.current = context;
    return () => { if (current.current === context) current.current = null; };
  }, [key, ready, members, generation]);

  const invalid = ready && Boolean(selection.member) && !members.includes(selection.member);
  useEffect(() => {
    if (!invalid) return;
    store.select('', members, true);
  }, [invalid, store, members]);

  const confirm = useCallback(member => {
    const context = current.current;
    if (!key || context?.generation !== generation || !context.ready
      || (member !== '' && !context.members.includes(member))) return false;
    store.select(member, context.members);
    return true;
  }, [key, generation, store]);

  const skip = useCallback(() => {
    if (current.current?.generation !== generation) return;
    store.skip();
  }, [generation, store]);

  const member = Boolean(key) && ready && members.includes(selection.member) ? selection.member : '';
  const legacy = key && ready && !selection.known && source === 'firebase'
    ? readLegacyCompanionCandidate(tripId, members) : { candidate: '', conflict: false };
  return {
    key, member, ready: Boolean(key && ready), confirm, skip,
    skipped: selection.skipped,
    storageError: selection.storageError,
    invalidated: invalid || selection.invalidated,
    conflict: legacy.conflict,
    candidate: legacy.conflict ? '' : legacy.candidate || (!selection.known && ready ? exactCompanionCandidate(displayName, members) : ''),
    isCurrent: () => Boolean(key && current.current?.generation === generation && current.current.ready),
    isValidMember: name => Boolean(key && current.current?.generation === generation && current.current.ready && current.current.members.includes(name)),
  };
}
