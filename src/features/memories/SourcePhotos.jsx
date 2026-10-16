import React, { useEffect, useState } from 'react';
import { db, storage } from '../../firebase.js';
import { createFirebaseTripRepository } from '../trip-data/firebaseTripRepository.js';

// Previews stay under the original trip ACL and are never saved to personalTravel.
export function SourcePhotos({ roomId, canReadSource, visitKeys = null, cover = false }) {
  const [state, setState] = useState({ key: '', photos: [], error: false });
  const key = JSON.stringify([roomId, canReadSource, visitKeys, cover]);
  useEffect(() => {
    if (!canReadSource || !db) return undefined;
    const [, , selected, isCover] = JSON.parse(key);
    const repository = createFirebaseTripRepository({ db, storage, tripId: roomId });
    let active = true;
    let generation = 0;
    const unsubscribe = repository.subscribeTrip(async (snapshot) => {
      const current = ++generation;
      setState({ key, photos: [], error: false });
      const photos = [];
      for (const [dayId, items] of Object.entries(snapshot?.itinerary || {})) {
        for (const item of Object.values(items || {})) {
          if (selected && !selected.includes(JSON.stringify([dayId, String(item?.id)]))) continue;
          const attachment = item?.placePhoto;
          if (!attachment?.storagePath || !/^image\/(jpeg|png|webp|gif)$/u.test(attachment.contentType || '')) continue;
          photos.push({ attachment, name: item.name || '旅行照片' });
        }
      }
      const results = await Promise.allSettled(photos.slice(0, isCover ? 1 : 12).map(async ({ attachment, name }) => ({ name, url: await repository.readAttachment(attachment) })));
      if (active && current === generation) setState({ key, photos: results.filter((result) => result.status === 'fulfilled' && result.value.url).map((result) => result.value), error: results.some((result) => result.status === 'rejected') });
    }, () => {
      generation += 1;
      if (active) setState({ key, photos: [], error: true });
      repository.dispose();
    });
    return () => { active = false; generation += 1; unsubscribe(); repository.dispose(); };
  }, [roomId, canReadSource, key]);
  if (!canReadSource || state.key !== key) return null;
  return <>
    {state.photos.length ? <div className={cover ? 'journal-cover-photo' : 'journal-photo-grid'}>{state.photos.map((photo) => <figure key={photo.url}><img className="journal-photo" src={photo.url} alt={photo.name} loading="lazy" />{!cover ? <figcaption className="mt-1 text-xs opacity-65">{photo.name}</figcaption> : null}</figure>)}</div> : null}
    {state.error && !cover ? <p className="text-xs opacity-65">照片目前無法載入，可開啟原行程重試。</p> : null}
  </>;
}
