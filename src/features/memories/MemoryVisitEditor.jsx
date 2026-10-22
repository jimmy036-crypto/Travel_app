import React, { useId, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { CityPicker } from './CityPicker.jsx';
import { applyVisitPatch, groupVisitCandidates, newManualVisit } from './visitDraftModel.js';

export function MemoryVisitEditor({ draft, setDraft, candidates, cities, placeCities, initiallyOpen = false }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [editing, setEditing] = useState({});
  const [manualOpen, setManualOpen] = useState(Boolean(draft.pendingManualName));
  const panelId = useId();
  const groups = groupVisitCandidates(candidates, draft.visits);
  const places = groups.flatMap((group) => group.places);
  const visited = Object.values(draft.visits).filter((visit) => visit.status === 'visited');
  const update = (ids, patch) => setDraft((previous) => ({ ...previous, visits: applyVisitPatch(previous.visits, places, ids, patch) }));
  const confirm = (ids, checked) => setDraft((previous) => {
    let visits = previous.visits;
    for (const id of ids) {
      const city = visits[id]?.cityId ? {} : placeCities[id] || {};
      visits = applyVisitPatch(visits, places, [id], { ...(checked ? city : {}), status: checked ? 'visited' : 'unconfirmed' });
    }
    return { ...previous, visits };
  });
  return <section className="journal-notebook" aria-label="走過的地方">
    <div className="journal-heading journal-notebook-heading"><div><h3>走過的地方</h3><p>{visited.length ? `留下了 ${visited.length} 個去過的地方` : '城市先留下，細節慢慢補。'}</p></div>
      <button type="button" className="journal-text-action" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>{open ? '完成' : visited.length ? '編輯景點' : '補上景點'}</button>
    </div>
    {!open && visited.length ? <p className="journal-place-preview">{visited.slice(0, 3).map((visit) => visit.name).join('、')}{visited.length > 3 ? `，還有 ${visited.length - 3} 個地方` : ''}</p> : null}
    {open ? <div id={panelId}>
      <p className="journal-help">勾選真的去過的地方即可。不確定的先留白，不影響儲存。</p>
      {groups.map((group) => <section key={group.id} className="journal-day-group" aria-label={`${group.date || group.id}的景點`}>
        <div className="journal-heading"><h4 className="journal-date">{group.id === 'manual' ? '行程外的發現' : group.date || group.id}</h4>
          <label className="journal-check journal-day-check"><input type="checkbox" aria-label={`確認${group.date || group.id}全部去過`} checked={group.places.every((place) => draft.visits[place.visitId]?.status === 'visited')} onChange={(event) => confirm(group.places.map((place) => place.visitId), event.target.checked)} />這天都去過</label>
        </div>
        {group.places.map((place) => {
          const visit = draft.visits[place.visitId];
          const city = visit?.cityId ? visit.city : placeCities[place.visitId]?.city;
          return <div key={place.visitId} className="journal-place-row">
            <div className="journal-heading"><label className="journal-check"><input type="checkbox" aria-label={`去過${place.name}`} checked={visit?.status === 'visited'} onChange={(event) => confirm([place.visitId], event.target.checked)} /><span><strong>{place.name}</strong>{city ? <small>{city}</small> : null}{visit?.status === 'wishlist' ? <small>留待下次</small> : visit?.status === 'missed' ? <small>這次沒去</small> : null}</span></label>
              <button type="button" className="journal-text-action" aria-label={`${editing[place.visitId] ? '收起' : '補記'}${place.name}`} aria-expanded={Boolean(editing[place.visitId])} onClick={() => setEditing((previous) => ({ ...previous, [place.visitId]: !previous[place.visitId] }))}>{editing[place.visitId] ? '收起' : visit?.note ? '編輯補記' : '補記'}</button>
            </div>
            {editing[place.visitId] ? <div className="journal-place-notes">
              <label className="journal-field">到訪狀態<select aria-label={`${place.name}的到訪狀態`} value={visit?.status || 'unconfirmed'} onChange={(event) => update([place.visitId], { status: event.target.value, ...(!visit?.cityId && event.target.value === 'visited' ? placeCities[place.visitId] || {} : {}) })}><option value="unconfirmed">之後確認</option><option value="visited">去過</option><option value="missed">沒去</option><option value="wishlist">留待下次</option></select></label>
              <CityPicker label={`${place.name}的城市／地區`} value={visit || {}} cities={cities} onChange={(city) => update([place.visitId], { status: visit?.status || 'unconfirmed', ...city })} />
              <label className="journal-field">這個地方的回憶<input aria-label={`${place.name}的回憶`} maxLength={1000} value={visit?.note || ''} onChange={(event) => update([place.visitId], { status: visit?.status || 'unconfirmed', note: event.target.value })} placeholder="留下一句感想" /></label>
              {place.source === 'manual' ? <Button variant="ghost" size="sm" onClick={() => update([place.visitId], { status: '' })}>移除補登地點</Button> : null}
            </div> : null}
          </div>;
        })}
      </section>)}
      <button type="button" className="journal-text-action" aria-expanded={manualOpen} onClick={() => setManualOpen(!manualOpen)}>補登行程外地點</button>
      {manualOpen ? <div className="journal-place-notes">
        <label className="journal-field">補登地點名稱<input maxLength={180} value={draft.pendingManualName || ''} onChange={(event) => setDraft((previous) => ({ ...previous, pendingManualName: event.target.value }))} placeholder="行程外實際去過的地方" /></label>
        <label className="journal-field">補登到訪日期<input type="date" value={draft.pendingManualDate || ''} onChange={(event) => setDraft((previous) => ({ ...previous, pendingManualDate: event.target.value }))} /></label>
        <Button disabled={!draft.pendingManualName?.trim() || !draft.pendingManualDate} onClick={() => {
          const { visitId, ...visit } = newManualVisit(draft.pendingManualName);
          setDraft((previous) => ({ ...previous, pendingManualName: '', visits: { ...previous.visits, [visitId]: { ...visit, date: previous.pendingManualDate, lat: null, lng: null } } }));
          setEditing((previous) => ({ ...previous, [visitId]: true }));
        }}>新增補登地點</Button>
      </div> : null}
    </div> : null}
  </section>;
}
