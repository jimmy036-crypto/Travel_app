import React, { useEffect, useRef, useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { CityPicker } from './CityPicker.jsx';
import { MemoryConflictDialog } from './MemoryConflictDialog.jsx';
import { MemoryVisitEditor } from './MemoryVisitEditor.jsx';
import { useJournalDraft } from './useJournalDraft.js';
import { cityKey, removeCity } from './visitDraftModel.js';

const FIRSTS = { solo: '第一趟獨旅', snow: '第一次看雪' };
const initialMemory = (trip, memory, archive) => ({
  roomId: trip.roomId, archived: archive || (memory ? Boolean(memory.archived) : true),
  note: memory?.note || '', cities: memory?.cities || {}, visits: memory?.visits || {}, firsts: memory?.firsts || {}, reassignFirsts: [],
  pendingManualName: '', pendingManualDate: trip.startDate || '',
});
const cityFields = ({ cityId, city, country, cityLat, cityLng, lat, lng }) => ({ cityId, city, country, cityLat: cityLat ?? lat, cityLng: cityLng ?? lng });

export function MemoryEditor(props) {
  return <MemoryEditorForm key={`${props.accountUid || ''}:${props.trip.roomId}`} {...props} />;
}

function MemoryEditorForm({ trip, memory, accountUid = '', memories = {}, cities = [], suggestedCities = [], placeCities = {}, citiesLoading = false, openVisits = false, archive = false, candidates = [], loading = false, loadError = '', onRetry, onSave, onClose, isOnline = true, t = {} }) {
  const journal = useJournalDraft({ uid: accountUid, kind: 'memory', recordId: trip.roomId, initialValue: initialMemory(trip, memory, archive), revision: memory?.revision || 0, onClose });
  const { draft, setDraft } = journal;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [citySearch, setCitySearch] = useState(false);
  const [cityInput, setCityInput] = useState({});
  const [addedCities, setAddedCities] = useState([]);
  const [notesOpen, setNotesOpen] = useState(Boolean(draft.note || Object.keys(draft.firsts).length));
  const latestMemory = useRef(memory);
  const active = useRef(true);
  useEffect(() => { latestMemory.current = memory; }, [memory]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const options = [...new Map([
    ...suggestedCities, ...Object.values(memory?.cities || {}), ...Object.values(memory?.visits || {}).filter((visit) => visit.status === 'visited'),
    ...addedCities, ...Object.values(draft.cities || {}), ...Object.values(draft.visits).filter((visit) => visit.status === 'visited'),
  ].filter((city) => city.cityId).map((city) => [city.cityId, cityFields(city)])).values()];
  const knownCities = [...options, ...cities];
  const selected = (id) => Boolean(draft.cities?.[cityKey(id)] || Object.values(draft.visits).some((visit) => visit.status === 'visited' && visit.cityId === id));
  const chooseCity = (city, checked) => {
    if (!checked) setNotice('已移除這座城市的足跡；景點與感想仍保留，之後可重新指定城市。');
    else setNotice('');
    setDraft((previous) => checked ? { ...previous, cities: { ...previous.cities, [cityKey(city.cityId)]: cityFields(city) } } : removeCity(previous, city.cityId));
  };
  const close = () => { if (!busy) journal.requestClose(); };
  const openConflict = (current) => journal.beginConflict({ value: initialMemory(trip, current, archive), revision: current.revision });
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !isOnline) return;
    if (draft.pendingManualName?.trim()) { setError('請先新增補登地點，或清除尚未加入的名稱，再儲存回憶。'); return; }
    if ((memory?.revision || 0) > journal.baseRevision) { openConflict(memory); return; }
    setError(''); setBusy(true);
    const visits = Object.fromEntries(Object.entries(draft.visits).filter(([, visit]) => visit.status).map(([id, visit]) => {
      if (visit.cityId) return [id, visit];
      const { cityId: _cityId, country: _country, cityLat: _cityLat, cityLng: _cityLng, ...unassigned } = visit;
      return [id, unassigned];
    }));
    const { pendingManualName: _pendingName, pendingManualDate: _pendingDate, ...payload } = draft;
    try {
      const saved = await onSave({ ...payload, cities: draft.cities || {}, visits, revision: journal.baseRevision });
      if (!active.current) return;
      if (journal.markSaved(draft, saved?.memory?.revision)) onClose();
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
        <div className="journal-heading"><h2 id="memory-editor-title">{memory ? '編輯旅行回憶' : '把這趟旅行收好'}</h2><Button variant="ghost" onClick={close} disabled={busy}>關閉</Button></div>
        <header className="journal-trip-heading"><p className="journal-date">{trip.startDate}{trip.endDate && trip.endDate !== trip.startDate ? ` — ${trip.endDate}` : ''}</p><h3>{trip.title}</h3></header>
        <fieldset disabled={busy} className="journal-city-confirmation">
          <legend>這趟旅行，去過哪些城市？</legend>
          <p className="journal-help">勾選城市就能留下足跡。景點、照片與感想，有空再慢慢補。</p>
          {options.length > 1 ? <button type="button" className="journal-text-action" disabled={options.every((city) => selected(city.cityId))} onClick={() => {
            setNotice(''); setDraft((previous) => ({ ...previous, cities: { ...previous.cities, ...Object.fromEntries(options.map((city) => [cityKey(city.cityId), cityFields(city)])) } }));
          }}>這些城市都去過</button> : null}
          {citiesLoading ? <p role="status">正在整理行程中的城市…你也可以直接搜尋城市。</p> : null}
          {options.length ? <div className="journal-city-list">{options.map((city) => <label key={city.cityId} className="journal-city-choice"><input type="checkbox" aria-label={`去過${city.city}`} checked={selected(city.cityId)} onChange={(event) => chooseCity(city, event.target.checked)} /><span><strong>{city.city}</strong><small>{city.country}</small></span><span className="journal-city-state">{selected(city.cityId) ? '去過' : '待確認'}</span></label>)}</div> : !citiesLoading ? <p className="journal-help">還沒有可辨識的城市。可以自行加入，也可以先儲存回憶。</p> : null}
          <button type="button" className="journal-text-action" aria-expanded={citySearch} onClick={() => setCitySearch(!citySearch)}>加入其他城市</button>
          {citySearch ? <CityPicker label="搜尋去過的城市" cities={knownCities} value={cityInput} onChange={(city) => {
            setCityInput(city);
            if (city.cityId) { chooseCity(city, true); setAddedCities((previous) => [...previous.filter((item) => item.cityId !== city.cityId), city]); setCityInput({}); setCitySearch(false); }
          }} /> : null}
          {notice ? <p role="status" className="journal-help">{notice}</p> : null}
        </fieldset>
        <fieldset disabled={busy}>
          {loading ? <p role="status">正在讀取行程景點…</p> : null}
          {loadError ? <div role="status" className="journal-notice">{loadError}{onRetry ? <Button onClick={onRetry} size="sm">重新讀取景點</Button> : null}</div> : null}
          <MemoryVisitEditor draft={draft} setDraft={setDraft} candidates={candidates} cities={knownCities} placeCities={placeCities} initiallyOpen={openVisits || Boolean(draft.pendingManualName)} />
        </fieldset>
        <fieldset disabled={busy} className="journal-notebook">
          <button type="button" className="journal-text-action" aria-expanded={notesOpen} aria-controls="memory-personal-notes" onClick={() => setNotesOpen(!notesOpen)}>{notesOpen ? '收起感想與首次體驗' : '寫下感想與首次體驗'}</button>
          {notesOpen ? <div id="memory-personal-notes" className="journal-place-notes">
            <label className="journal-field">這趟旅行的感想<textarea maxLength={3000} rows={3} value={draft.note} onChange={(event) => setDraft((previous) => ({ ...previous, note: event.target.value }))} placeholder="想留住哪個片刻？也可以先留白。" /></label>
            <fieldset><legend className="font-bold">值得紀念的第一次</legend><p className="journal-help">每種第一次只指定一趟旅行，護照章會連回這趟旅行。</p>
              <div className="grid gap-3">{Object.entries(FIRSTS).map(([id, label]) => {
                const owner = Object.entries(memories).find(([roomId, other]) => roomId !== trip.roomId && other?.firsts?.[id]);
                return <div key={id}>{owner ? <><p className="text-sm">已指定給「{owner[1].title}」</p><label className="journal-check"><input type="checkbox" checked={(draft.reassignFirsts || []).includes(id)} onChange={(event) => toggleFirst(id, event.target.checked, true)} />{`將${label}從「${owner[1].title}」改指定為這趟旅行`}</label></> : <label className="journal-check"><input type="checkbox" checked={Boolean(draft.firsts[id])} onChange={(event) => toggleFirst(id, event.target.checked)} />{label}</label>}</div>;
              })}</div>
            </fieldset>
          </div> : null}
        </fieldset>
        {journal.persistenceError ? <p role="status" className="journal-error">{journal.persistenceError}</p> : journal.dirty ? <p className="journal-help">草稿已備份在此裝置，尚未儲存到雲端。</p> : null}
        {error ? <p role="alert" className="journal-error">{error}</p> : null}
        {!isOnline ? <p role="status">連線後才能儲存；你的輸入會保留在這裡。</p> : null}
        <div className="journal-form-footer flex flex-wrap justify-end gap-2"><Button onClick={close} disabled={busy}>取消</Button><Button type="submit" variant="primary" loading={busy} disabled={!isOnline}>{memory && !archive ? '儲存回憶' : '完成並收進回憶'}</Button></div>
      </form>
    </ResponsiveBottomSheet>
    <ConfirmDialog open={journal.closeConfirmation} title="離開編輯？" description={journal.persistenceError ? '本機草稿尚未備份，離開可能遺失輸入。建議繼續編輯並儲存到雲端。' : '草稿已保留在此裝置，下次開啟可以繼續。尚未儲存到雲端。'} confirmLabel={journal.persistenceError ? '仍要離開' : '保留草稿並離開'} cancelLabel="繼續編輯" onConfirm={journal.confirmClose} onCancel={journal.cancelClose} />
    {journal.conflict ? <MemoryConflictDialog conflict={journal.conflict} onResolve={journal.resolveConflict} onClose={journal.cancelConflict} /> : null}
  </>;
}
