import React, { useEffect, useRef, useState } from 'react';
import { getBlob, ref } from 'firebase/storage';
import { storage } from '../../firebase.js';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BYTES = 5 * 1024 * 1024;

function SavedPhoto({ photo, cover, onOpen }) {
  const container = useRef(null);
  const [visible, setVisible] = useState(() => !cover || typeof IntersectionObserver === 'undefined');
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState({ url: '', error: false });
  useEffect(() => {
    if (visible || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    if (container.current) observer.observe(container.current);
    return () => observer.disconnect();
  }, [visible]);
  useEffect(() => {
    if (!visible || !storage) return undefined;
    let active = true;
    let url = '';
    getBlob(ref(storage, photo.storagePath), MAX_BYTES).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob.slice(0, blob.size, photo.contentType));
      setLoaded({ url, error: false });
    }).catch(() => { if (active) setLoaded({ url: '', error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [visible, photo.storagePath, photo.contentType, version]);
  return <figure ref={container} className="journal-photo-frame">
    {loaded.url ? cover ? <img className="journal-photo" src={loaded.url} alt={photo.name} width="640" height="400" />
      : <><button type="button" className="journal-photo-button" onClick={() => onOpen({ ...photo, url: loaded.url })} aria-label={`放大照片：${photo.name}`}><img className="journal-photo" src={loaded.url} alt={photo.name} width="640" height="400" /></button><figcaption>{photo.name}</figcaption></>
      : loaded.error ? <div role="status" className="journal-notice">照片暫時無法載入。<Button size="sm" onClick={() => setVersion((value) => value + 1)}>重新載入照片</Button></div> : <span className="journal-photo-placeholder" aria-hidden="true" />}
  </figure>;
}

export function MemoryPhotos({ photos = {}, accountUid, roomId, cover = false }) {
  const [limit, setLimit] = useState(12);
  const [opened, setOpened] = useState(null);
  const entries = Object.values(photos || {}).filter((photo) => accountUid && ALLOWED.has(photo.contentType)
    && photo.storagePath?.startsWith(`travelMemories/${accountUid}/${roomId}/`));
  const enlarged = opened && entries.some((photo) => photo.storagePath === opened.storagePath && photo.contentType === opened.contentType) ? opened : null;
  return <>
    {entries.length ? <div className={cover ? 'journal-cover-photo' : 'journal-photo-grid'}>{entries.slice(0, cover ? 1 : limit).map((photo) => <SavedPhoto key={`${photo.storagePath}:${photo.contentType}`} photo={photo} cover={cover} onOpen={setOpened} />)}</div> : null}
    {!cover && entries.length > limit ? <Button onClick={() => setLimit((value) => value + 12)}>載入更多照片</Button> : null}
    {enlarged ? <ResponsiveBottomSheet onClose={() => setOpened(null)} labelledBy="memory-photo-title" panelClassName="journal-dialog bg-white text-slate-900"><div className="journal-form"><div className="journal-heading"><h2 id="memory-photo-title">{enlarged.name}</h2><Button onClick={() => setOpened(null)}>關閉照片</Button></div><img className="journal-full-photo" src={enlarged.url} alt={enlarged.name} /></div></ResponsiveBottomSheet> : null}
  </>;
}
