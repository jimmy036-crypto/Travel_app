import { useEffect, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../../firebase.js';

const EMPTY = Object.freeze({});

export function useMemoryArchiveSummaries(uid, roomIds) {
  const key = JSON.stringify([uid, [...roomIds].sort()]);
  const [state, setState] = useState({ key: '', summaries: EMPTY, errors: EMPTY });
  useEffect(() => {
    const [owner, ids] = JSON.parse(key);
    if (!owner || !db) return undefined;
    let active = true;
    const update = (roomId, summary, error) => {
      if (!active) return;
      setState((previous) => {
        const current = previous.key === key ? previous : { summaries: {}, errors: {} };
        return { key, summaries: { ...current.summaries, [roomId]: summary }, errors: { ...current.errors, [roomId]: error } };
      });
    };
    const stops = ids.map((id) => onValue(ref(db, `travelMemoryArchives/${owner}/${id}/summary`),
      (snapshot) => update(id, snapshot.val(), ''), () => update(id, null, '保存狀態暫時無法載入。')));
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [key]);
  return state.key === key ? state : { summaries: EMPTY, errors: EMPTY };
}

export function useMemoryArchive(uid, roomId) {
  const key = JSON.stringify([uid, roomId]);
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key: '', version: -1, data: EMPTY, errors: EMPTY });
  useEffect(() => {
    if (!uid || !roomId || !db) return undefined;
    let active = true;
    const update = (branch, value, error) => {
      if (!active) return;
      setState((previous) => {
        const current = previous.key === key && previous.version === version ? previous : { data: {}, errors: {} };
        return { key, version, data: { ...current.data, [branch]: value }, errors: { ...current.errors, [branch]: error } };
      });
    };
    const stops = ['summary', 'itinerary', 'photos'].map((branch) => onValue(ref(db, `travelMemoryArchives/${uid}/${roomId}/${branch}`),
      (snapshot) => update(branch, snapshot.val(), ''), () => update(branch, null, '這份回憶暫時無法讀取，請重試。')));
    return () => { active = false; stops.forEach((stop) => stop()); };
  }, [uid, roomId, key, version]);
  const current = state.key === key && state.version === version ? state : { data: EMPTY, errors: EMPTY };
  return { ...current.data, loading: Boolean(uid && roomId && Object.keys(current.data).length < 3), error: Object.values(current.errors).find(Boolean) || '', retry: () => setVersion((value) => value + 1) };
}
