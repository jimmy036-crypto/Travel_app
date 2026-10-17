import { useCallback, useEffect, useRef, useState } from 'react';
import { createJournalConflict, journalValuesEqual, readJournalDraft, removeJournalDraft, resolveJournalConflict, writeJournalDraft } from './journalDraftStore.js';

function initialState(identity, initialValue, revision) {
  const stored = readJournalDraft(identity);
  return {
    key: JSON.stringify(identity),
    draft: stored.draft?.value || initialValue,
    baseValue: stored.draft?.baseValue || initialValue,
    baseRevision: stored.draft?.baseRevision ?? revision,
    persistenceError: identity.uid ? stored.error : '',
    closeConfirmation: false,
    conflict: null,
  };
}

export function useJournalDraft({ uid, kind, recordId, initialValue, revision = 0, onClose }) {
  const identity = { uid, kind, recordId };
  const key = JSON.stringify(identity);
  const [state, setState] = useState(() => initialState(identity, initialValue, revision));
  const navigation = useRef(null);
  if (state.key !== key) setState(initialState(identity, initialValue, revision));
  const dirty = !journalValuesEqual(state.draft, state.baseValue);

  const setDraft = useCallback((next) => {
    setState((previous) => {
      if (previous.key !== key) return previous;
      const draft = typeof next === 'function' ? next(previous.draft) : next;
      const result = writeJournalDraft({ uid, kind, recordId, baseRevision: previous.baseRevision, baseValue: previous.baseValue, value: draft });
      return { ...previous, draft, persistenceError: result.error };
    });
  }, [uid, kind, recordId, key]);

  useEffect(() => {
    if (!dirty) return undefined;
    const editorUrl = window.location.href;
    const protect = (event) => { event.preventDefault(); event.returnValue = ''; };
    const protectBack = (event) => {
      if (navigation.current?.resume) { navigation.current = null; return; }
      event.stopImmediatePropagation();
      navigation.current = { url: window.location.href };
      if (window.location.href !== editorUrl) window.history.pushState(null, '', editorUrl);
      setState((previous) => ({ ...previous, closeConfirmation: true }));
    };
    window.addEventListener('beforeunload', protect);
    window.addEventListener('popstate', protectBack, true);
    return () => { window.removeEventListener('beforeunload', protect); window.removeEventListener('popstate', protectBack, true); };
  }, [dirty]);

  const requestClose = () => {
    if (dirty) setState((previous) => ({ ...previous, closeConfirmation: true }));
    else onClose?.();
  };
  const markSaved = (savedValue, savedRevision) => {
    navigation.current = null;
    const result = removeJournalDraft(identity);
    setState((previous) => previous.key !== key ? previous : ({ ...previous, draft: savedValue ?? previous.draft, baseValue: savedValue ?? previous.draft, baseRevision: savedRevision ?? previous.baseRevision, persistenceError: result.error, closeConfirmation: false, conflict: null }));
    return result.ok;
  };
  const beginConflict = ({ value, revision: latestRevision }) => {
    setState((previous) => previous.key !== key ? previous : ({ ...previous, conflict: createJournalConflict({ baseValue: previous.baseValue, localValue: previous.draft, value, revision: latestRevision }) }));
  };
  const resolveConflict = (choices) => {
    if (!state.conflict) return state.draft;
    const draft = resolveJournalConflict(state.conflict, choices);
    const result = writeJournalDraft({ ...identity, value: draft, baseValue: state.conflict.remoteValue, baseRevision: state.conflict.revision });
    setState((previous) => previous.key !== key ? previous : ({ ...previous, draft, baseValue: state.conflict.remoteValue, baseRevision: state.conflict.revision, persistenceError: result.error, conflict: null }));
    return draft;
  };
  return {
    draft: state.draft, setDraft, dirty, persistenceError: state.persistenceError,
    baseRevision: state.baseRevision, requestClose, markSaved,
    closeConfirmation: state.closeConfirmation,
    confirmClose: () => {
      const destination = navigation.current?.url;
      navigation.current = destination ? { resume: true } : null;
      setState((previous) => ({ ...previous, closeConfirmation: false })); onClose?.();
      if (destination) { window.history.replaceState(null, '', destination); window.dispatchEvent(new PopStateEvent('popstate')); }
    },
    cancelClose: () => { navigation.current = null; setState((previous) => ({ ...previous, closeConfirmation: false })); },
    conflict: state.conflict, beginConflict, resolveConflict,
    cancelConflict: () => setState((previous) => ({ ...previous, conflict: null })),
  };
}
