import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { CityPicker } from './CityPicker.jsx';
import { MemoryConflictDialog } from './MemoryConflictDialog.jsx';
import { useJournalDraft } from './useJournalDraft.js';
import { applyVisitPatch, firstMissingCity, groupVisitCandidates, newManualVisit } from './visitDraftModel.js';

const FIRSTS = { solo: '第一趟獨旅', snow: '第一次看雪' };
const initialMemory = (trip, memory, archive) => ({
  roomId: trip.roomId, archived: archive || (memory ? Boolean(memory.archived) : true),
  note: memory?.note || '', visits: memory?.visits || {}, firsts: memory?.firsts || {}, reassignFirsts: [],
  pendingManualName: '', pendingManualDate: trip.startDate || '',
});
const StatusOptions = () => <><option value="">之後確認</option><option value="visited">去過</option><option value="missed">沒去</option><option value="wishlist">留待下次</option></>;

export function MemoryEditor(props) {
  return <MemoryEditorForm key={`${props.accountUid || ''}:${props.trip.roomId}`} {...props} />;
}

function MemoryEditorForm({ trip, memory, accountUid = '', memories = {}, cities = [], archive = false, candidates = [], loading = false, loadError = '', onRetry, onSave, onClose, isOnline = true, t = {} }) {
  const journal = useJournalDraft({ uid: accountUid, kind: 'memory', recordId: trip.roomId, initialValue: initialMemory(trip, memory, archive), revision: memory?.revision || 0, onClose });
  const { draft, setDraft } = journal;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [missingCity, setMissingCity] = useState(null);
  const [selected, setSelected] = useState([]);
  const [batchStatus, setBatchStatus] = useState('unchanged');
  const [batchCity, setBatchCity] = useState({});
  const manualName = draft.pendingManualName || '';
  const cityInputs = useRef(new Map());
  const latestMemory = useRef(memory);
  const active = useRef(true);
  useEffect(() => { latestMemory.current = memory; }, [memory]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const groups = groupVisitCandidates(candidates, draft.visits);
  const places = groups.flatMap((group) => group.places);
  const confirmed = Object.values(draft.visits).filter((visit) => visit.status).length;
  const updateVisits = (ids, patch) => setDraft((previous) => ({ ...previous, visits: applyVisitPatch(previous.visits, places, ids, patch) }));
  const close = () => { if (!busy) journal.requestClose(); };
  const openConflict = (current) => journal.beginConflict({ value: initialMemory(trip, current, archive), revision: current.revision });
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !isOnline) return;
    if (manualName.trim()) { setError('請先新增補登地點，或清除尚未加入的名稱，再儲存回憶。'); return; }
    const missing = firstMissingCity(draft.visits, places.map((place) => place.visitId));
    if (missing) {
      setMissingCity(missing); setError('請為去過的地點選擇城市／地區，才能加入足跡。');
      const input = cityInputs.current.get(missing);
      const group = input?.closest('details');
      if (group) group.open = true;
      input?.focus(); input?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      return;
    }
    if ((memory?.revision || 0) > journal.baseRevision) { openConflict(memory); return; }
    setMissingCity(null); setError(''); setBusy(true);
    const visits = Object.fromEntries(Object.entries(draft.visits).filter(([, visit]) => visit.status).map(([id, visit]) => {
      if (visit.cityId) return [id, visit];
      const { cityId: _cityId, country: _country, cityLat: _cityLat, cityLng: _cityLng, ...unassigned } = visit;
      return [id, unassigned];
    }));
    const { pendingManualName: _pendingName, pendingManualDate: _pendingDate, ...payload } = draft;
    try {
      const saved = await onSave({ ...payload, visits, revision: journal.baseRevision });
      if (!active.current) return;
      if (journal.markSaved(draft, saved?.revision)) onClose();
      else setError('回憶已儲存，但此裝置的草稿尚未清除。請保持畫面並重試。');
    } catch (nextError) {
      if (!active.current) return;
      const current = nextError.details?.current || latestMemory.current;
      if (String(nextError.code).endsWith('aborted') && (current?.revision || 0) > journal.baseRevision) openConflict(current);
      else setError(nextError.message || '回憶尚未儲存，請再試一次。');
    } finally { if (active.current) setBusy(false); }
  };
  const toggleFirst = (id, checked, reassign = false) => setDraft((previous) => {
    const firsts = { ...previous.firsts };
    if (checked) firsts[id] = FIRSTS[id]; else delete firsts[id];
    const reassignFirsts = (previous.reassignFirsts || []).filter((key) => key !== id);
    if (checked && reassign) reassignFirsts.push(id);
    return { ...previous, firsts, reassignFirsts };
  });
  return <>
    <ResponsiveBottomSheet onClose={close} labelledBy="memory-editor-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`} testId="memory-editor">
      <form onSubmit={submit} className="journal-form">
        <div className="journal-heading"><div><p className="journal-eyebrow">留給自己的旅行紀錄</p><h2 id="memory-editor-title">{memory ? '編輯旅行回憶' : '把這趟旅行收好'}</h2></div><Button variant="ghost" onClick={close} disabled={busy}>關閉</Button></div>
        <p className="font-bold">{trip.title}</p>
        <p className="text-sm leading-6 opacity-75">到訪可以略過，之後再補。補登與個人感想只保存在你的回憶中。</p>
        <label className="journal-field">這趟旅行的感想<textarea disabled={busy} maxLength={3000} rows={3} value={draft.note} onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))} placeholder="想留住哪個片刻？也可以先留白。" /></label>
        <fieldset disabled={busy}>
          <legend className="mb-2 font-bold">哪些地方真的去過？</legend>
          <p className="mb-3 text-sm opacity-75">已確認 {confirmed} 個・尚未確認 {places.length - confirmed} 個。只有「去過」會加入足跡。</p>
          {loading ? <p role="status">正在讀取行程景點…</p> : null}
          {loadError ? <div role="status" className="journal-notice">{loadError}{onRetry ? <Button onClick={onRetry} size="sm">重新讀取景點</Button> : null}</div> : null}
          {!loading && !places.length ? <p className="journal-notice">沒有可確認的景點，仍可保存回憶或補登地點。</p> : null}
          {selected.length ? <div className="journal-bulk-actions journal-visit">
            <p className="font-bold">已選取 {selected.length} 個地點</p>
            <label className="journal-field">批次到訪狀態<select aria-label="批次到訪狀態" value={batchStatus} onChange={(event) => setBatchStatus(event.target.value)}><option value="unchanged">保留原狀態</option><StatusOptions /></select></label>
            <CityPicker label="批次城市／地區" value={batchCity} onChange={setBatchCity} cities={cities} />
            <div className="flex flex-wrap gap-2"><Button onClick={() => {
              const patch = { ...(batchStatus !== 'unchanged' ? { status: batchStatus } : {}), ...(batchCity.cityId ? batchCity : {}) };
              updateVisits(selected, patch);
            }} disabled={batchStatus === 'unchanged' && !batchCity.cityId}>套用到選取地點</Button><Button variant="ghost" onClick={() => setSelected([])}>清除選取</Button></div>
          </div> : null}
          <div className="space-y-3">{groups.map((group) => <details key={group.id} open className="journal-day-group">
            <summary className="font-bold">{group.id === 'manual' ? '本人補登' : group.date || group.id}・{group.places.length} 個地點</summary>
            <label className="journal-check"><input type="checkbox" aria-label={`選取${group.date || group.id}全部地點`} checked={group.places.every((place) => selected.includes(place.visitId))} onChange={(event) => setSelected((previous) => event.target.checked ? [...new Set([...previous, ...group.places.map((place) => place.visitId)])] : previous.filter((id) => !group.places.some((place) => place.visitId === id)))} />選取這一天</label>
            {group.places.map((place) => {
              const visit = draft.visits[place.visitId];
              return <div key={place.visitId} className="journal-visit">
                <div className="flex flex-wrap items-center justify-between gap-2"><label className="journal-check"><input type="checkbox" aria-label={`選取${place.name}`} checked={selected.includes(place.visitId)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, place.visitId] : previous.filter((id) => id !== place.visitId))} /><strong>{place.name}</strong></label><select aria-label={`${place.name}的到訪狀態`} value={visit?.status || ''} onChange={(event) => updateVisits([place.visitId], { status: event.target.value })}><StatusOptions /></select></div>
                {visit ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <CityPicker label={`${place.name}的城市／地區`} value={visit} cities={cities} onChange={(city) => updateVisits([place.visitId], city)} invalid={missingCity === place.visitId} inputRef={(input) => { if (input) cityInputs.current.set(place.visitId, input); else cityInputs.current.delete(place.visitId); }} />
                  <label className="journal-field">這個地方的回憶<input aria-label={`${place.name}的回憶`} maxLength={1000} value={visit.note || ''} onChange={(event) => updateVisits([place.visitId], { note: event.target.value })} placeholder="留下一句感想" /></label>
                </div> : null}
                {place.source === 'manual' ? <Button variant="ghost" size="sm" onClick={() => { updateVisits([place.visitId], { status: '' }); setSelected((previous) => previous.filter((id) => id !== place.visitId)); }}>移除補登地點</Button> : null}
              </div>;
            })}
          </details>)}</div>
          <div className="journal-visit"><label className="journal-field">補登地點名稱<input maxLength={180} value={manualName} onChange={(event) => setDraft((previous) => ({ ...previous, pendingManualName: event.target.value }))} placeholder="行程外實際去過的地方" /></label>
            <label className="journal-field">補登到訪日期<input type="date" value={draft.pendingManualDate || ''} onChange={(event) => setDraft((previous) => ({ ...previous, pendingManualDate: event.target.value }))} /></label>
            <Button disabled={!manualName.trim() || !draft.pendingManualDate} onClick={() => {
            const place = newManualVisit(manualName);
            const { visitId, ...visit } = place;
            setDraft((previous) => ({ ...previous, pendingManualName: '', visits: { ...previous.visits, [visitId]: { ...visit, date: previous.pendingManualDate, lat: null, lng: null } } }));
          }}>新增補登地點</Button></div>
        </fieldset>
        <fieldset disabled={busy} className="journal-visit"><legend className="font-bold">值得紀念的第一次</legend><p className="mb-2 text-sm opacity-75">每種第一次只指定一趟旅行，護照章會連回這趟旅行。</p>
          <div className="grid gap-3">{Object.entries(FIRSTS).map(([id, label]) => {
            const owner = Object.entries(memories).find(([roomId, other]) => roomId !== trip.roomId && other?.firsts?.[id]);
            return <div key={id}>{owner ? <><p className="text-sm">已指定給「{owner[1].title}」</p><label className="journal-check"><input type="checkbox" checked={(draft.reassignFirsts || []).includes(id)} onChange={(event) => toggleFirst(id, event.target.checked, true)} />{`將${label}從「${owner[1].title}」改指定為這趟旅行`}</label></> : <label className="journal-check"><input type="checkbox" checked={Boolean(draft.firsts[id])} onChange={(event) => toggleFirst(id, event.target.checked)} />{label}</label>}</div>;
          })}</div>
        </fieldset>
        {journal.persistenceError ? <p role="status" className="journal-error">{journal.persistenceError}</p> : journal.dirty ? <p className="text-sm opacity-75">草稿已備份在此裝置，尚未儲存到雲端。</p> : null}
        {error ? <p role="alert" className="journal-error">{error}</p> : null}
        {!isOnline ? <p role="status">連線後才能儲存；你的輸入會保留在這裡。</p> : null}
        <div className="journal-form-footer flex flex-wrap justify-end gap-2"><Button onClick={close} disabled={busy}>取消</Button><Button type="submit" variant="primary" loading={busy} disabled={!isOnline}>{memory && !archive ? '儲存回憶' : '完成並收進回憶'}</Button></div>
      </form>
    </ResponsiveBottomSheet>
    <ConfirmDialog open={journal.closeConfirmation} title="離開編輯？" description={journal.persistenceError ? '本機草稿尚未備份，離開可能遺失輸入。建議繼續編輯並儲存到雲端。' : '草稿已保留在此裝置，下次開啟可以繼續。尚未儲存到雲端。'} confirmLabel={journal.persistenceError ? '仍要離開' : '保留草稿並離開'} cancelLabel="繼續編輯" onConfirm={journal.confirmClose} onCancel={journal.cancelClose} />
    {journal.conflict ? <MemoryConflictDialog conflict={journal.conflict} onResolve={journal.resolveConflict} onClose={journal.cancelConflict} /> : null}
  </>;
}
