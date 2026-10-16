import React, { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { MemoriesPage } from './MemoriesPage.jsx';
import { FootprintsPage } from './FootprintsPage.jsx';
import { CollectionsPage } from './CollectionsPage.jsx';
import { PassportReview } from './PassportReview.jsx';
import { ShareMemoryDialog } from './ShareMemoryDialog.jsx';
import { CloneMemoryDialog } from './CloneMemoryDialog.jsx';
import { MemoryEditorLoader } from './MemoryEditorLoader.jsx';
import './memories.css';

export default function TravelJournal({ accountUid, view, journal, trips, isOnline, onOpenTrip, onViewChange, archiveTrip, onCloseArchive, onRestore, t }) {
  const [editingId, setEditingId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [cloning, setCloning] = useState(null);
  const [cityCollection, setCityCollection] = useState(null);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(false);
  const editorTrip = archiveTrip || (editingId ? trips.find((trip) => trip.roomId === editingId) || journal.memories[editingId] : null);
  const restore = async (memory) => {
    if (restoring) return;
    setRestoring(true); setError('');
    try { await journal.saveMemory({ ...memory, note: memory.note || '', visits: memory.visits || {}, firsts: memory.firsts || {}, archived: false }); onRestore?.(memory.roomId); }
    catch (nextError) { setError(nextError.message); }
    finally { setRestoring(false); }
  };
  const common = { memories: journal.memories, trips, t, isOnline, onOpenTrip, onEdit: setEditingId };
  return <div className="journal">
    {view !== 'trips' ? <>
      {!accountUid ? <p className="journal-notice">使用 Google 登入，即可在自己的帳號保存旅行回憶與足跡。</p>
        : journal.loading ? <p role="status" className="journal-notice">正在載入你的旅行回憶…</p>
          : journal.error ? <div role="alert" className="journal-error">{journal.error}<Button onClick={journal.retry}>重新載入回憶</Button></div>
            : <>
              {error ? <p role="alert" className="journal-error mb-4">{error}</p> : null}
              {restoring ? <p role="status">正在還原到首頁…</p> : null}
              {view === 'memories' ? <><MemoriesPage {...common} onRestore={restore} onClone={setCloning} /><PassportReview {...common} collections={journal.collections} onShare={() => setSharing(true)} /></> : null}
              {view === 'footprints' ? <FootprintsPage {...common} onCollectCity={(city) => {
                const items = Object.fromEntries(city.visits.map((visit, index) => [`place-${index}`, { name: visit.name, city: city.city, roomId: visit.roomId, visitId: visit.visitId }]));
                setCityCollection({ id: crypto.randomUUID(), revision: 0, title: `${city.city}・再訪清單`, items }); onViewChange('collections');
              }} /> : null}
              {view === 'collections' ? <CollectionsPage key={cityCollection?.id || 'collections'} collections={journal.collections} memories={journal.memories} onSave={journal.saveCollection} initialCollection={cityCollection} onInitialHandled={() => setCityCollection(null)} isOnline={isOnline} t={t} /> : null}
            </>}
    </> : null}
    {editorTrip ? <MemoryEditorLoader key={editorTrip.roomId} trip={editorTrip} memory={journal.memories[editorTrip.roomId]} archive={Boolean(archiveTrip)} canReadSource={trips.some((trip) => trip.roomId === editorTrip.roomId && trip.accessStatus === 'active')} onSave={journal.saveMemory} onClose={() => { setEditingId(''); onCloseArchive(); }} isOnline={isOnline} t={t} /> : null}
    {sharing ? <ShareMemoryDialog memories={journal.memories} onClose={() => setSharing(false)} t={t} /> : null}
    {cloning ? <CloneMemoryDialog memory={cloning} source={trips.find((trip) => trip.roomId === cloning.roomId) || cloning} onClone={async (payload) => { await journal.cloneTrip(payload); onViewChange('trips'); }} onClose={() => setCloning(null)} isOnline={isOnline} t={t} /> : null}
  </div>;
}
