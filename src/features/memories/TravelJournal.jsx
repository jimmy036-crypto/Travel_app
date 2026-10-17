import React, { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { MemoriesPage } from './MemoriesPage.jsx';
import { FootprintsPage } from './FootprintsPage.jsx';
import { CollectionsPage } from './CollectionsPage.jsx';
import { PassportReview } from './PassportReview.jsx';
import { ShareMemoryDialog } from './ShareMemoryDialog.jsx';
import { CloneMemoryDialog } from './CloneMemoryDialog.jsx';
import { MemoryEditorLoader } from './MemoryEditorLoader.jsx';
import { ArchiveTripDialog } from './ArchiveTripDialog.jsx';
import { DeleteMemoryDialog } from './DeleteMemoryDialog.jsx';
import { MemoryDetail } from './MemoryDetail.jsx';
import { MemoryPhotos } from './MemoryPhotos.jsx';
import { useMemoryArchive, useMemoryArchiveSummaries } from './useMemoryArchive.js';
import { buildFootprints } from './journalModel.js';
import './memories.css';

function SavedMemoryDetail(props) {
  const archive = useMemoryArchive(props.accountUid, props.memory.roomId);
  return <MemoryDetail {...props} archive={archive} />;
}

function HighlightPhoto({ accountUid, memory, selectedPhoto, onSelectPhoto }) {
  const archive = useMemoryArchive(accountUid, memory.roomId);
  const entries = Object.entries(archive.photos || {});
  const chosen = entries.find(([id]) => id === selectedPhoto) || entries[0];
  return <div className="journal-highlight-photo">
    {archive.error ? <p role="status">年度照片暫時無法讀取。<Button onClick={archive.retry}>重新讀取照片</Button></p> : null}
    {chosen ? <><MemoryPhotos accountUid={accountUid} roomId={memory.roomId} photos={{ [chosen[0]]: chosen[1] }} /><label className="journal-field">年度代表照片<select value={chosen[0]} onChange={(event) => onSelectPhoto(event.target.value)}>{entries.map(([id, photo], index) => <option key={id} value={id}>{index + 1}. {photo.name}</option>)}</select></label></> : null}
  </div>;
}

function SavedCityPhotos({ accountUid, roomId, visits }) {
  const archive = useMemoryArchive(accountUid, roomId);
  const photos = Object.fromEntries(Object.entries(archive.photos || {}).filter(([, photo]) => visits.some((visit) => visit.dayId === photo.dayId && visit.itemId === photo.itemId)));
  return <MemoryPhotos accountUid={accountUid} roomId={roomId} photos={photos} />;
}

export default function TravelJournal({ accountUid, view, route = {}, navigate, journal, trips, isOnline, onOpenTrip, archiveTrip, onCloseArchive, onRestore, onSignIn, t }) {
  const [editingId, setEditingId] = useState('');
  const [sharing, setSharing] = useState(false);
  const [cloning, setCloning] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [cityCollection, setCityCollection] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const { summaries, errors } = useMemoryArchiveSummaries(accountUid, Object.keys(journal.memories));
  const cities = useMemo(() => buildFootprints(journal.memories).filter((city) => !city.unassigned), [journal.memories]);
  const changeRoute = navigate;
  const viewMemory = (roomId) => { setError(''); changeRoute({ view: 'memories', memory: roomId }); };
  const hasSource = (roomId) => trips.some((trip) => trip.roomId === roomId && trip.accessStatus === 'active');
  const currentMemory = journal.memories[route.memory];
  const editorTrip = editingId ? trips.find((trip) => trip.roomId === editingId) || journal.memories[editingId] : null;
  const preserve = async (roomId) => {
    setBusy(true); setError('');
    try { await journal.preserveMemory({ roomId, operationId: summaries[roomId]?.operationId || crypto.randomUUID() }); }
    catch (nextError) { setError(nextError.message || '保存工作尚未送出，請重試。'); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    const memory = journal.memories[archiveTrip.roomId];
    await journal.saveMemory({ roomId: archiveTrip.roomId, revision: memory?.revision || 0, note: memory?.note || '', visits: memory?.visits || {}, firsts: memory?.firsts || {}, archived: true });
    try { await journal.preserveMemory({ roomId: archiveTrip.roomId, operationId: summaries[archiveTrip.roomId]?.operationId || crypto.randomUUID() }); }
    catch { return { preservationError: '回憶已收好，但行程與照片尚未送出永久保存。請在「查看回憶」中重試保存。' }; }
    return {};
  };
  const restore = async (memory) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await journal.saveMemory({ ...memory, note: memory.note || '', visits: memory.visits || {}, firsts: memory.firsts || {}, archived: false });
      onRestore?.(memory.roomId); setNotice('已還原到首頁，保存的回憶仍保留。'); changeRoute({ memory: '' });
    } catch (nextError) { setError(nextError.message); }
    finally { setBusy(false); }
  };
  const renderCover = (memory, options) => options?.selectable
    ? <HighlightPhoto key={memory.roomId} accountUid={accountUid} memory={memory} selectedPhoto={route.photo} onSelectPhoto={(photo) => changeRoute({ photo })} />
    : summaries[memory.roomId]?.coverPhoto ? <MemoryPhotos accountUid={accountUid} roomId={memory.roomId} photos={{ cover: summaries[memory.roomId].coverPhoto }} cover /> : null;
  const common = { memories: journal.memories, trips, t, isOnline, onOpenTrip, onEdit: setEditingId, onOpenMemory: viewMemory };
  return <div className="journal">
    {view !== 'trips' ? <>
      {!accountUid ? <div className="journal-notice">使用 Google 登入，即可在自己的帳號保存旅行回憶與足跡。{onSignIn ? <Button onClick={onSignIn}>登入並保存回憶</Button> : null}</div>
        : journal.loading ? <p role="status" className="journal-notice">正在載入你的旅行回憶…</p>
          : journal.error ? <div role="alert" className="journal-error">{journal.error}<Button onClick={journal.retry}>重新載入回憶</Button></div>
            : <>
              {error && !currentMemory ? <p role="alert" className="journal-error mb-4">{error}</p> : null}
              {notice ? <p role="status" className="journal-notice mb-4">{notice}<Button onClick={() => changeRoute({ view: 'trips', memory: '' })}>回到首頁</Button><Button onClick={() => setNotice('')}>關閉提示</Button></p> : null}
              {view === 'memories' ? <><MemoriesPage {...common} onView={viewMemory} archiveSummaries={summaries} archiveErrors={errors} query={route.query || ''} onQueryChange={(query) => changeRoute({ query }, { replace: true })} renderCover={renderCover} /><PassportReview {...common} collections={journal.collections} onShare={() => setSharing(true)} onOpenCity={(city) => changeRoute({ view: 'footprints', city, memory: '' })} onOpenCollection={(collection) => changeRoute({ view: 'collections', collection, memory: '' })} selectedYear={route.year} onYearChange={(year) => changeRoute({ year: String(year), highlight: '', photo: '' })} selectedHighlight={route.highlight} onHighlightChange={(highlight) => changeRoute({ highlight, photo: '' })} renderCover={renderCover} /></> : null}
              {view === 'footprints' ? <FootprintsPage {...common} selectedId={route.city} onSelectCity={(city) => changeRoute({ city })} renderPhotos={(roomId, visits) => <SavedCityPhotos accountUid={accountUid} roomId={roomId} visits={visits} />} onCollectCity={(city) => {
                setCityCollection({ title: `${city.city}・再訪清單`, items: city.visits.map((visit) => ({ name: visit.name, city: city.city, roomId: visit.roomId, visitId: visit.visitId })) }); changeRoute({ view: 'collections', memory: '' });
              }} /> : null}

              {route.memory && !currentMemory && !deleting ? <p role="status" className="journal-notice">這份個人回憶目前不存在。<Button onClick={() => changeRoute({ memory: '' })}>返回回憶列表</Button></p> : null}
            </>}
    </> : null}
    {accountUid && !journal.loading && !journal.error && view === 'collections' ? <CollectionsPage accountUid={accountUid} collections={journal.collections} memories={journal.memories} onSave={journal.saveCollection} incomingCollection={cityCollection} onInitialHandled={() => setCityCollection(null)} selectedCollectionId={route.collection} onSelectCollection={(collection) => changeRoute({ collection: collection || '' })} isOnline={isOnline} t={t} /> : null}
    {currentMemory && !editingId && !deleting && !cloning && view !== 'trips' ? <SavedMemoryDetail accountUid={accountUid} memory={currentMemory} canReadSource={hasSource(currentMemory.roomId)} isOnline={isOnline} busy={busy} error={error} onPreserve={() => preserve(currentMemory.roomId)} onClose={() => changeRoute({ memory: '' })} onEdit={setEditingId} onRestore={restore} onClone={setCloning} onDelete={setDeleting} onOpenTrip={onOpenTrip} t={t} /> : null}
    {archiveTrip ? <ArchiveTripDialog trip={archiveTrip} onArchive={archive} onClose={onCloseArchive} onView={(roomId) => { onCloseArchive(); viewMemory(roomId); }} onEdit={(roomId) => { onCloseArchive(); viewMemory(roomId); setEditingId(roomId); }} isOnline={isOnline} t={t} /> : null}
    {editorTrip ? <MemoryEditorLoader key={editorTrip.roomId} accountUid={accountUid} memories={journal.memories} cities={cities} trip={editorTrip} memory={journal.memories[editorTrip.roomId]} canReadSource={hasSource(editorTrip.roomId)} onSave={journal.saveMemory} onClose={() => setEditingId('')} isOnline={isOnline} t={t} /> : null}
    {sharing ? <ShareMemoryDialog memories={journal.memories} onClose={() => setSharing(false)} t={t} /> : null}
    {cloning ? <CloneMemoryDialog accountUid={accountUid} memory={cloning} source={cloning} onClone={journal.cloneTrip} onClose={() => setCloning(null)} onOpenTrip={onOpenTrip} isOnline={isOnline} t={t} /> : null}
    {deleting ? <DeleteMemoryDialog accountUid={accountUid} memory={deleting} onDelete={journal.deleteMemory} onClose={() => { setDeleting(null); changeRoute({ memory: '' }); }} t={t} /> : null}
  </div>;
}
