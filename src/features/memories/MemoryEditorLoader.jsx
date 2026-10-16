import React, { useEffect, useState } from 'react';
import { get, ref } from 'firebase/database';
import { db } from '../../firebase.js';
import { MemoryEditor } from './MemoryEditor.jsx';
import { extractVisitCandidates } from './journalModel.js';

export function MemoryEditorLoader({ trip, memory, canReadSource, ...props }) {
  const [load, setLoad] = useState({ key: '', candidates: [], error: '' });
  const [version, setVersion] = useState(0);
  const requestKey = JSON.stringify([trip.roomId, trip.startDate, version]);
  useEffect(() => {
    let active = true;
    if (!canReadSource || !db) return undefined;
    get(ref(db, `rooms/${trip.roomId}/itinerary`)).then((snapshot) => {
      if (active) setLoad({ key: requestKey, candidates: extractVisitCandidates(snapshot.val(), trip.startDate), error: '' });
    }).catch(() => {
      if (active) setLoad({ key: requestKey, candidates: [], error: '暫時讀不到原行程。可以先保留回憶，或重新讀取景點。' });
    });
    return () => { active = false; };
  }, [canReadSource, trip.roomId, trip.startDate, requestKey]);
  return <MemoryEditor trip={trip} memory={memory} candidates={canReadSource && load.key === requestKey ? load.candidates : []} loading={canReadSource && load.key !== requestKey} loadError={canReadSource ? load.error : '原行程目前無法存取；仍可整理已保存的個人紀錄。'} onRetry={canReadSource ? () => setVersion((value) => value + 1) : undefined} {...props} />;
}
