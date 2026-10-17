import React, { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { collectionProgress } from './journalModel.js';
import { useJournalDraft } from './useJournalDraft.js';
import { MemoryConflictDialog } from './MemoryConflictDialog.jsx';

const emptyPending = () => ({ name: '', city: '', link: '' });
const formValue = (collection) => ({ id: collection.id, title: collection.title || '', items: collection.items || {}, pending: emptyPending() });
const sourceKey = (item) => {
  const roomId = item.sourceRoomId || item.roomId;
  const visitId = item.sourceVisitId || item.visitId;
  return roomId && visitId ? JSON.stringify([roomId, visitId]) : '';
};
function editableItems(items, memories) {
  return Object.fromEntries(Object.entries(items || {}).map(([id, item]) => [id,
    memories[item.roomId]?.visits?.[item.visitId]?.status === 'visited' ? item : { ...item, roomId: '', visitId: '' },
  ]));
}
function addWishlistItems(items, incoming) {
  const result = { ...items };
  const sources = new Set(Object.values(result).map(sourceKey).filter(Boolean));
  for (const item of incoming) {
    const source = sourceKey(item);
    if (source && sources.has(source)) continue;
    const sourceRoomId = item.sourceRoomId || item.roomId;
    const sourceVisitId = item.sourceVisitId || item.visitId;
    result[crypto.randomUUID()] = { name: item.name, city: item.city || '', roomId: '', visitId: '', ...(source ? { sourceRoomId, sourceVisitId } : {}) };
    if (source) sources.add(source);
  }
  return result;
}

function CollectionEditor({ accountUid, collection, latestCollection, additions, memories, onSave, onClose, isOnline, t }) {
  const draftState = useJournalDraft({ uid: accountUid, kind: 'collection', recordId: collection.revision ? collection.id : 'new', initialValue: formValue(collection), revision: collection.revision || 0, onClose });
  const { draft, setDraft } = draftState;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState('');
  const currentItems = editableItems(draft.items, memories);
  const { name, city, link } = draft.pending;
  const choices = Object.entries(memories).flatMap(([roomId, memory]) => Object.entries(memory.visits || {}).filter(([, visit]) => visit.status === 'visited').map(([visitId, visit]) => ({ roomId, visitId, visit, label: `${visit.name} · ${visit.city} · ${memory.title}` })));
  useEffect(() => {
    if (additions?.length) setDraft((value) => ({ ...value, items: addWishlistItems(value.items, additions) }));
  }, [additions, setDraft]);
  const patchPending = (patch) => { setDraft({ ...draft, pending: { ...draft.pending, ...patch } }); setInvalidField(''); setError(''); };
  const fail = (message, field) => {
    setError(message); setInvalidField(field);
    document.getElementById(`collection-${field}`)?.focus();
    return null;
  };
  const withPendingItem = (required = false) => {
    if (!name.trim() && !city.trim() && !link && !required) return currentItems;
    const choice = choices.find((entry) => JSON.stringify([entry.roomId, entry.visitId]) === link);
    if (!choice && !name.trim()) return fail('請填寫想去的地方，或選擇已確認的到訪。', 'pending-name');
    const item = choice ? { name: choice.visit.name, city: choice.visit.city, roomId: choice.roomId, visitId: choice.visitId } : { name: name.trim(), city: city.trim(), roomId: '', visitId: '' };
    if (choice && Object.values(currentItems).some((existing) => sourceKey(existing) === sourceKey(item))) return currentItems;
    if (Object.keys(currentItems).length >= 200) return fail('每份收藏最多 200 個地點，請先移除部分地點。', 'pending-name');
    return { ...currentItems, [crypto.randomUUID()]: item };
  };
  const add = () => {
    const items = withPendingItem(true);
    if (items) { setDraft({ ...draft, items, pending: emptyPending() }); setError(''); setInvalidField(''); }
  };
  const save = async (event) => {
    event.preventDefault(); if (busy || !isOnline) return;
    if (!draft.title.trim()) { fail('請填寫收藏主題。', 'title'); return; }
    const items = withPendingItem();
    if (!items) return;
    const invalidItem = Object.entries(items).find(([, item]) => !item.name.trim());
    if (invalidItem) { fail('請填寫地點名稱。', `item-${invalidItem[0]}`); return; }
    if (Object.keys(items).length > 200) { fail('每份收藏最多 200 個地點。', 'title'); return; }
    const value = { ...draft, title: draft.title.trim(), items, pending: emptyPending() };
    setDraft(value);
    const beginLatestConflict = (latest) => {
      if (!latest || latest.revision === draftState.baseRevision) return false;
      draftState.beginConflict({ value: formValue(latest), revision: latest.revision });
      return true;
    };
    if (beginLatestConflict(latestCollection)) return;
    setBusy(true); setError(''); setInvalidField('');
    try {
      const result = await onSave({ id: draft.id, revision: draftState.baseRevision, title: value.title, items, deleted: false });
      if (draftState.markSaved(value, result?.collection?.revision)) onClose();
    } catch (nextError) {
      if (!String(nextError.code).endsWith('aborted') || !beginLatestConflict(nextError.details?.current || latestCollection)) setError(nextError.message || '收藏尚未儲存，請再試一次。');
    } finally { setBusy(false); }
  };
  const close = () => { if (!busy) draftState.requestClose(); };
  return <>
    <ResponsiveBottomSheet onClose={close} labelledBy="collection-editor-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}>
      <form className="journal-form" onSubmit={save}><div className="journal-heading"><h2 id="collection-editor-title">收藏下一趟的靈感</h2><Button onClick={close} disabled={busy}>關閉</Button></div>
        <fieldset disabled={busy} className="space-y-4"><label className="journal-field">收藏主題<input id="collection-title" maxLength={80} value={draft.title} aria-invalid={invalidField === 'title'} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：美術館、溫泉、山岳、咖啡店" /></label>
          {invalidField === 'title' ? <p role="alert" className="journal-error">{error}</p> : null}
          <ul className="space-y-2">{Object.entries(currentItems).map(([id, item]) => <li key={id} className="journal-visit"><div className="flex items-center justify-between gap-2"><span>{item.name} <small>{item.city}</small></span><Button size="sm" onClick={() => { const items = { ...draft.items }; delete items[id]; setDraft({ ...draft, items }); }} aria-label={`移除 ${item.name}`}>移除</Button></div>
            {!item.roomId ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="journal-field">地點名稱<input id={`collection-item-${id}`} maxLength={160} value={item.name} aria-invalid={invalidField === `item-${id}`} onChange={(event) => setDraft({ ...draft, items: { ...draft.items, [id]: { ...item, name: event.target.value } } })} /></label><label className="journal-field">所在城市<input maxLength={120} value={item.city} onChange={(event) => setDraft({ ...draft, items: { ...draft.items, [id]: { ...item, city: event.target.value } } })} /></label></div> : null}
            {invalidField === `item-${id}` ? <p role="alert" className="journal-error">{error}</p> : null}
            <label className="journal-field mt-2">到訪紀錄<select aria-label={`${item.name}的收藏到訪`} value={item.roomId && item.visitId ? JSON.stringify([item.roomId, item.visitId]) : ''} onChange={(event) => {
              const choice = choices.find((entry) => JSON.stringify([entry.roomId, entry.visitId]) === event.target.value);
              setDraft({ ...draft, items: { ...draft.items, [id]: { ...item, roomId: choice?.roomId || '', visitId: choice?.visitId || '', ...(choice ? { name: choice.visit.name, city: choice.visit.city } : {}) } } });
            }}><option value="">下次想去</option>{choices.map((entry) => <option key={JSON.stringify([entry.roomId, entry.visitId])} value={JSON.stringify([entry.roomId, entry.visitId])}>{entry.label}</option>)}</select></label>
          </li>)}</ul>
          <div className="journal-visit space-y-3"><label className="journal-field">想去的地方<input id="collection-pending-name" maxLength={160} value={name} aria-invalid={invalidField === 'pending-name'} onChange={(event) => patchPending({ name: event.target.value })} /></label><label className="journal-field">城市／地區<input maxLength={120} value={city} onChange={(event) => patchPending({ city: event.target.value })} /></label>
            <label className="journal-field">或從去過的地方選擇<select value={link} onChange={(event) => patchPending({ link: event.target.value })}><option value="">選擇到訪紀錄</option>{choices.map((entry) => <option key={JSON.stringify([entry.roomId, entry.visitId])} value={JSON.stringify([entry.roomId, entry.visitId])}>{entry.label}</option>)}</select></label>
            {invalidField === 'pending-name' ? <p role="alert" className="journal-error">{error}</p> : null}
            <Button onClick={add}>加入清單</Button><p className="text-xs opacity-65">也可以直接儲存收藏，一併加入這個地方。</p></div>
        </fieldset>
        {error && !invalidField ? <p role="alert" className="journal-error">{error}</p> : null}
        {draftState.persistenceError ? <p role="alert" className="journal-error">{draftState.persistenceError}</p> : null}
        {!isOnline ? <p role="status">目前離線，輸入會保留為本機草稿，連線後可儲存。</p> : null}
        <div className="journal-form-footer"><Button variant="primary" type="submit" loading={busy} disabled={!isOnline}>儲存收藏</Button></div>
      </form>
    </ResponsiveBottomSheet>
    <ConfirmDialog open={draftState.closeConfirmation} title="保留尚未儲存的收藏？" description={draftState.persistenceError || '輸入已備份在這個裝置，下次開啟會繼續編輯。'} confirmLabel={draftState.persistenceError ? '仍要關閉並放棄輸入' : '保留草稿並關閉'} cancelLabel="繼續編輯" onConfirm={draftState.confirmClose} onCancel={draftState.cancelClose} />
    {draftState.conflict ? <MemoryConflictDialog conflict={draftState.conflict} onResolve={(choices) => { draftState.resolveConflict(choices); setError('已合併更新，請確認後儲存收藏。'); }} onClose={draftState.cancelConflict} /> : null}
  </>;
}

function IncomingCollectionPicker({ incoming, collections, onChoose, onClose, t }) {
  const items = Object.values(incoming.items || {});
  const [target, setTarget] = useState('new');
  const [selected, setSelected] = useState(() => items.map((_, index) => index));
  return <ResponsiveBottomSheet onClose={onClose} labelledBy="collection-picker-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}><div className="journal-form">
    <h2 id="collection-picker-title">收藏下一趟想去的地方</h2><p>再訪清單會從「下次想去」開始，之後可連結新的到訪紀錄。</p>
    <label className="journal-field">加入哪份收藏<select value={target} onChange={(event) => setTarget(event.target.value)}><option value="new">建立再訪清單</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select></label>
    <fieldset><legend>選取要加入的地點</legend>{items.map((item, index) => <label className="journal-check" key={index}><input type="checkbox" checked={selected.includes(index)} onChange={(event) => setSelected(event.target.checked ? [...selected, index] : selected.filter((value) => value !== index))} />{item.name}</label>)}</fieldset>
    <div className="flex flex-wrap gap-2"><Button onClick={onClose}>取消</Button><Button variant="primary" disabled={!selected.length} onClick={() => onChoose(target === 'new' ? { id: crypto.randomUUID(), revision: 0, title: incoming.title, items: {} } : collections.find((collection) => collection.id === target), selected.map((index) => items[index]))}>加入選取地點</Button></div>
  </div></ResponsiveBottomSheet>;
}

function CollectionsContent({ accountUid, collections = {}, memories = {}, onSave, isOnline = true, t = {}, initialCollection = null, incomingCollection = null, onInitialHandled, selectedCollectionId, onSelectCollection }) {
  const [editing, setEditing] = useState(initialCollection ? { collection: initialCollection } : null);
  const [incoming, setIncoming] = useState(null);
  const [handledIncoming, setHandledIncoming] = useState(null);
  const [localSelected, setLocalSelected] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = Object.entries(collections).filter(([, collection]) => !collection.deleted).map(([id, collection]) => ({ ...collection, id }));
  const reading = active.find((collection) => collection.id === (selectedCollectionId ?? localSelected));
  const picker = incoming || (incomingCollection !== handledIncoming ? incomingCollection : null);
  const closePicker = () => { setIncoming(null); setHandledIncoming(incomingCollection); onInitialHandled?.(); };
  const selectCollection = (id) => { setLocalSelected(id); onSelectCollection?.(id); };
  const wishlist = Object.entries(memories).flatMap(([roomId, memory]) => Object.entries(memory.visits || {}).filter(([, visit]) => visit.status === 'wishlist').map(([visitId, visit]) => ({ roomId, visitId, visit, title: memory.title })));
  const itemList = (collection) => <ul className="space-y-2 text-sm">{Object.entries(collection.items || {}).map(([id, item]) => <li key={id}>{memories[item.roomId]?.visits?.[item.visitId]?.status === 'visited' ? '✓ 已去過' : '○ 下次想去'} · {item.name} <span className="opacity-65">{item.city}</span></li>)}</ul>;
  return <section aria-labelledby="collections-title">
    <div className="journal-heading"><div><p className="journal-eyebrow">PLACES TO RETURN TO</p><h2 id="collections-title">我的收藏</h2></div><Button variant="primary" onClick={() => setEditing({ collection: { id: crypto.randomUUID(), revision: 0, title: '', items: {} } })}>建立主題收藏</Button></div>
    <p className="journal-description">美術館、溫泉，或一間想再去的咖啡店。用自己的主題，把去過和想去的地方放在一起。</p>
    {wishlist.length ? <section className="journal-visit mb-6" aria-label="旅行中留待下次的地方"><h3 className="font-bold mb-3">旅行中留待下次</h3><div className="flex flex-wrap gap-2">{wishlist.map(({ roomId, visitId, visit, title }) => <Button key={`${roomId}:${visitId}`} onClick={() => setIncoming({ title: visit.city ? `${visit.city}・下次想去` : '下次想去', items: [{ name: visit.name, city: visit.city || '', roomId, visitId }] })}>{visit.name} · {title}</Button>)}</div><p className="mt-2 text-xs opacity-65">選擇地點後，可加入既有收藏或建立新清單。</p></section> : null}
    {error ? <p role="alert" className="journal-error">{error}</p> : null}
    {!active.length ? <p className="journal-notice">還沒有收藏。從你喜歡的主題開始，下一趟旅行就有了靈感。</p> : null}
    <div className="journal-grid">{active.map((collection) => {
      const progress = collectionProgress(collection, memories);
      return <article key={collection.id} className={`journal-card ${t.cardBg || ''}`}><div className="journal-card-body"><h3>{collection.title}</h3><p className="text-sm tabular-nums">已去過 {progress.visited} / {progress.total} · 下次想去 {progress.wishlist}</p><progress className="w-full accent-blue-600" value={progress.visited} max={progress.total || 1} aria-label={`${collection.title}完成比例`} />
        {itemList(collection)}<div className="flex flex-wrap gap-2"><Button onClick={() => selectCollection(collection.id)}>查看收藏</Button><Button onClick={() => setEditing({ collection })}>編輯收藏</Button><Button variant="ghost" onClick={() => setDeleting(collection)} disabled={!isOnline}>刪除收藏</Button></div>
      </div></article>;
    })}</div>
    {reading && !editing ? <ResponsiveBottomSheet onClose={() => selectCollection('')} labelledBy="collection-reading-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}><div className="journal-form"><h2 id="collection-reading-title">{reading.title}</h2>{itemList(reading)}<div className="flex gap-2"><Button onClick={() => selectCollection('')}>關閉收藏</Button><Button onClick={() => setEditing({ collection: reading })}>整理這份收藏</Button></div></div></ResponsiveBottomSheet> : null}
    {picker ? <IncomingCollectionPicker key={JSON.stringify(picker)} incoming={picker} collections={active} t={t} onClose={closePicker} onChoose={(collection, additions) => { setEditing({ collection, additions }); closePicker(); }} /> : null}
    {editing ? <CollectionEditor key={editing.collection.id} accountUid={accountUid} collection={editing.collection} latestCollection={collections[editing.collection.id]} additions={editing.additions} memories={memories} onSave={onSave} onClose={() => { setEditing(null); onInitialHandled?.(); }} isOnline={isOnline} t={t} /> : null}
    {deleting ? <ResponsiveBottomSheet onClose={() => { if (!busy) setDeleting(null); }} labelledBy="delete-collection-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}><div className="journal-form"><h2 id="delete-collection-title">刪除「{deleting.title}」？</h2><p>只刪除這份收藏清單，旅行回憶與到訪紀錄會保留。</p><div className="flex gap-2"><Button disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" loading={busy} onClick={async () => {
      setBusy(true); setError(''); try { await onSave({ ...deleting, items: deleting.items || {}, deleted: true }); setDeleting(null); } catch (nextError) { setError(nextError.message); setDeleting(null); } finally { setBusy(false); }
    }}>確認刪除收藏</Button></div></div></ResponsiveBottomSheet> : null}
  </section>;
}

export function CollectionsPage(props) { return <CollectionsContent key={props.accountUid || ''} {...props} />; }
