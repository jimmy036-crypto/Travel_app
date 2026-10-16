import React, { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { collectionProgress } from './journalModel.js';

function editableItems(items, memories) {
  return Object.fromEntries(Object.entries(items || {}).map(([id, item]) => [id,
    memories[item.roomId]?.visits?.[item.visitId]?.status === 'visited'
      ? item : { ...item, roomId: '', visitId: '' },
  ]));
}

function CollectionEditor({ collection, memories, onSave, onClose, isOnline, t }) {
  const [draft, setDraft] = useState(() => collection ? { ...collection, items: collection.items || {} } : { id: crypto.randomUUID(), revision: 0, title: '', items: {} });
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const currentItems = editableItems(draft.items, memories);
  const choices = Object.entries(memories).flatMap(([roomId, memory]) => Object.entries(memory.visits || {}).filter(([, visit]) => visit.status === 'visited').map(([visitId, visit]) => ({ roomId, visitId, visit, label: `${visit.name} · ${visit.city} · ${memory.title}` })));
  const add = () => {
    const choice = choices.find((entry) => JSON.stringify([entry.roomId, entry.visitId]) === link);
    if (!choice && !name.trim()) { setError('請填寫想去的地方，或選擇已確認的到訪。'); return; }
    const item = choice ? { name: choice.visit.name, city: choice.visit.city, roomId: choice.roomId, visitId: choice.visitId } : { name: name.trim(), city: city.trim(), roomId: '', visitId: '' };
    setDraft({ ...draft, items: { ...draft.items, [crypto.randomUUID()]: item } }); setName(''); setCity(''); setLink(''); setError('');
  };
  const save = async (event) => {
    event.preventDefault(); if (busy || !isOnline) return;
    if (!draft.title.trim()) { setError('請填寫收藏主題。'); return; }
    if (name.trim() || city.trim() || link) { setError('請先按「加入清單」保存正在填寫的地方，或清空後再儲存。'); return; }
    setBusy(true); setError('');
    try { await onSave({ ...draft, items: currentItems, title: draft.title.trim(), deleted: false }); onClose(); }
    catch (nextError) { setError(nextError.message || '收藏尚未儲存，請再試一次。'); }
    finally { setBusy(false); }
  };
  return <ResponsiveBottomSheet onClose={() => { if (!busy) onClose(); }} labelledBy="collection-editor-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}>
    <form className="journal-form" onSubmit={save}><div className="journal-heading"><h2 id="collection-editor-title">收藏下一趟的靈感</h2><Button onClick={onClose} disabled={busy}>關閉</Button></div>
      <fieldset disabled={busy} className="space-y-4"><label className="journal-field">收藏主題<input maxLength={80} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：美術館、溫泉、山岳、咖啡店" /></label>
        <ul className="space-y-2">{Object.entries(currentItems).map(([id, item]) => <li key={id} className="journal-visit"><div className="flex items-center justify-between gap-2"><span>{item.name} <small>{item.city}</small></span><Button size="sm" onClick={() => { const items = { ...draft.items }; delete items[id]; setDraft({ ...draft, items }); }} aria-label={`移除 ${item.name}`}>移除</Button></div>
          {!item.roomId ? <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="journal-field">地點名稱<input maxLength={160} value={item.name} onChange={(event) => setDraft({ ...draft, items: { ...draft.items, [id]: { ...item, name: event.target.value } } })} /></label><label className="journal-field">所在城市<input maxLength={120} value={item.city} onChange={(event) => setDraft({ ...draft, items: { ...draft.items, [id]: { ...item, city: event.target.value } } })} /></label></div> : null}
          <label className="journal-field mt-2">到訪紀錄<select aria-label={`${item.name}的收藏到訪`} value={item.roomId && item.visitId ? JSON.stringify([item.roomId, item.visitId]) : ''} onChange={(event) => {
            const choice = choices.find((entry) => JSON.stringify([entry.roomId, entry.visitId]) === event.target.value);
            setDraft({ ...draft, items: { ...draft.items, [id]: { ...item, roomId: choice?.roomId || '', visitId: choice?.visitId || '', ...(choice ? { name: choice.visit.name, city: choice.visit.city } : {}) } } });
          }}><option value="">下次想去</option>{choices.map((entry) => <option key={JSON.stringify([entry.roomId, entry.visitId])} value={JSON.stringify([entry.roomId, entry.visitId])}>{entry.label}</option>)}</select></label>
        </li>)}</ul>
        <div className="journal-visit space-y-3"><label className="journal-field">想去的地方<input maxLength={160} value={name} onChange={(event) => setName(event.target.value)} /></label><label className="journal-field">城市／地區<input maxLength={120} value={city} onChange={(event) => setCity(event.target.value)} /></label>
          <label className="journal-field">或從去過的地方選擇<select value={link} onChange={(event) => setLink(event.target.value)}><option value="">選擇到訪紀錄</option>{choices.map((entry) => <option key={JSON.stringify([entry.roomId, entry.visitId])} value={JSON.stringify([entry.roomId, entry.visitId])}>{entry.label}</option>)}</select></label>
          <Button onClick={add}>加入清單</Button></div>
      </fieldset>
      {error ? <p role="alert" className="journal-error">{error}</p> : null}
      <Button variant="primary" type="submit" loading={busy} disabled={!isOnline}>儲存收藏</Button>
    </form>
  </ResponsiveBottomSheet>;
}

export function CollectionsPage({ collections = {}, memories = {}, onSave, isOnline = true, t = {}, initialCollection = null, onInitialHandled }) {
  const [editing, setEditing] = useState(initialCollection);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = Object.values(collections).filter((collection) => !collection.deleted);
  const wishlist = Object.entries(memories).flatMap(([roomId, memory]) => Object.entries(memory.visits || {}).filter(([, visit]) => visit.status === 'wishlist').map(([visitId, visit]) => ({ roomId, visitId, visit, title: memory.title })));
  return <section aria-labelledby="collections-title">
    <div className="journal-heading"><div><p className="journal-eyebrow">PLACES TO RETURN TO</p><h2 id="collections-title">我的收藏</h2></div><Button variant="primary" disabled={!isOnline} onClick={() => setEditing({ id: crypto.randomUUID(), revision: 0, title: '', items: {} })}>建立主題收藏</Button></div>
    <p className="journal-description">美術館、溫泉，或一間想再去的咖啡店。用自己的主題，把去過和想去的地方放在一起。</p>
    {wishlist.length ? <section className="journal-visit mb-6" aria-label="旅行中留待下次的地方"><h3 className="font-bold mb-3">旅行中留待下次</h3><div className="flex flex-wrap gap-2">{wishlist.map(({ roomId, visitId, visit, title }) => <Button key={`${roomId}:${visitId}`} disabled={!isOnline} onClick={() => setEditing({ id: crypto.randomUUID(), revision: 0, title: visit.city ? `${visit.city}・下次想去` : '下次想去', items: { [crypto.randomUUID()]: { name: visit.name, city: visit.city || '', roomId: '', visitId: '' } } })}>{visit.name} · {title}</Button>)}</div><p className="mt-2 text-xs opacity-65">選一個地方，放進下一趟的收藏清單。</p></section> : null}
    {error ? <p role="alert" className="journal-error">{error}</p> : null}
    {!active.length ? <p className="journal-notice">還沒有收藏。從你喜歡的主題開始，下一趟旅行就有了靈感。</p> : null}
    <div className="journal-grid">{active.map((collection) => {
      const progress = collectionProgress(collection, memories);
      return <article key={collection.id} className={`journal-card ${t.cardBg || ''}`}><div className="journal-card-body"><h3>{collection.title}</h3><p className="text-sm tabular-nums">已去過 {progress.visited} / {progress.total} · 下次想去 {progress.wishlist}</p><progress className="w-full accent-blue-600" value={progress.visited} max={progress.total || 1} aria-label={`${collection.title}完成比例`} />
        <ul className="space-y-2 text-sm">{Object.entries(collection.items || {}).map(([id, item]) => <li key={id}>{memories[item.roomId]?.visits?.[item.visitId]?.status === 'visited' ? '✓ 已去過' : '○ 下次想去'} · {item.name} <span className="opacity-65">{item.city}</span></li>)}</ul>
        <div className="flex gap-2"><Button onClick={() => setEditing(collection)} disabled={!isOnline}>編輯收藏</Button><Button variant="ghost" onClick={() => setDeleting(collection)} disabled={!isOnline}>刪除收藏</Button></div>
      </div></article>;
    })}</div>
    {editing ? <CollectionEditor key={editing.id} collection={editing} memories={memories} onSave={onSave} onClose={() => { setEditing(null); onInitialHandled?.(); }} isOnline={isOnline} t={t} /> : null}
    {deleting ? <ResponsiveBottomSheet onClose={() => { if (!busy) setDeleting(null); }} labelledBy="delete-collection-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}><div className="journal-form"><h2 id="delete-collection-title">刪除「{deleting.title}」？</h2><p>只刪除這份收藏清單，旅行回憶與到訪紀錄會保留。</p><div className="flex gap-2"><Button disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" loading={busy} onClick={async () => {
      setBusy(true); setError(''); try { await onSave({ ...deleting, items: deleting.items || {}, deleted: true }); setDeleting(null); } catch (nextError) { setError(nextError.message); setDeleting(null); } finally { setBusy(false); }
    }}>確認刪除收藏</Button></div></div></ResponsiveBottomSheet> : null}
  </section>;
}
