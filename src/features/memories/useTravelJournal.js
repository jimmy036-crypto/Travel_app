import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onValue, ref } from 'firebase/database';
import { db } from '../../firebase.js';
import { createJournalClient } from './journalClient.js';

const EMPTY = Object.freeze({});

export function useTravelJournal(accountUid, isOnline) {
  const client = useMemo(() => createJournalClient(), []);
  const [state, setState] = useState({ uid: '', version: -1, data: EMPTY, error: '' });
  const [version, setVersion] = useState(0);
  const accountRef = useRef(accountUid);
  useLayoutEffect(() => { accountRef.current = accountUid; }, [accountUid]);
  useEffect(() => {
    if (!accountUid || !db) return undefined;
    let active = true;
    const unsubscribe = onValue(ref(db, `personalTravel/${accountUid}`), (snapshot) => {
      if (active && accountRef.current === accountUid) setState({ uid: accountUid, version, data: snapshot.val() || EMPTY, error: '' });
    }, () => {
      if (active && accountRef.current === accountUid) setState({ uid: accountUid, version, data: EMPTY, error: '旅行回憶暫時無法載入。請確認連線後重試。' });
    });
    return () => { active = false; unsubscribe(); };
  }, [accountUid, version]);
  const run = useCallback(async (operation, payload) => {
    if (!accountUid || accountRef.current !== accountUid) throw new Error('請先登入你的 Google 帳號。');
    if (!isOnline) throw new Error('請恢復網路連線後再儲存。');
    const result = await client[operation](payload);
    if (accountRef.current !== accountUid) throw new Error('帳號已切換，請在目前帳號重新操作。');
    return result;
  }, [accountUid, client, isOnline]);
  const data = accountUid && state.uid === accountUid ? state.data : EMPTY;
  return {
    memories: data.memories || EMPTY, collections: data.collections || EMPTY,
    loading: Boolean(accountUid && db && (state.uid !== accountUid || state.version !== version)),
    error: accountUid && state.uid === accountUid ? state.error : '',
    retry: () => setVersion((value) => value + 1),
    saveMemory: (payload) => run('saveMemory', payload),
    saveCollection: (payload) => run('saveCollection', payload),
    cloneTrip: (payload) => run('cloneTrip', payload),
  };
}
