import React, { useEffect, useState } from 'react';
import { get, ref } from 'firebase/database';
import { db } from '../../firebase.js';
import { MemoryEditor } from './MemoryEditor.jsx';
import { extractVisitCandidates } from './journalModel.js';
import { useMemoryArchive } from './useMemoryArchive.js';

export function MemoryEditorLoader({ accountUid, trip, memory, canReadSource, ...props }) {
  const archive = useMemoryArchive(accountUid, trip.roomId);
  const hasSnapshot = Boolean(archive.summary?.operationId);
  const [load, setLoad] = useState({ key: '', candidates: [], error: '' });
  const [version, setVersion] = useState(0);
  const requestKey = JSON.stringify([accountUid, trip.roomId, trip.startDate, version]);
  useEffect(() => {
    let active = true;
    if (archive.loading || hasSnapshot || !canReadSource || !db) return undefined;
    get(ref(db, `rooms/${trip.roomId}/itinerary`)).then((snapshot) => {
      if (active) setLoad({ key: requestKey, candidates: extractVisitCandidates(snapshot.val(), trip.startDate), error: '' });
    }).catch(() => {
      if (active) setLoad({ key: requestKey, candidates: [], error: '暫時讀不到原行程。可以先保留回憶，或重新讀取景點。' });
    });
    return () => { active = false; };
  }, [archive.loading, hasSnapshot, canReadSource, trip.roomId, trip.startDate, requestKey]);
  const candidates = hasSnapshot ? extractVisitCandidates(archive.itinerary, memory?.startDate || trip.startDate) : canReadSource && load.key === requestKey ? load.candidates : [];
  return <MemoryEditor accountUid={accountUid} trip={trip} memory={memory} candidates={candidates} loading={archive.loading || (!hasSnapshot && canReadSource && load.key !== requestKey)} loadError={archive.error || (hasSnapshot ? '' : canReadSource ? load.error : '原行程目前無法存取；仍可整理已保存的個人紀錄。')} onRetry={() => { archive.retry(); setVersion((value) => value + 1); }} {...props} />;
}
