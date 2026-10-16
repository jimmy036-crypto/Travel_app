import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';

const FIRSTS = { solo: '第一趟獨旅', snow: '第一次看雪' };

export function MemoryEditor({ trip, memory, archive = false, candidates = [], loading = false, loadError = '', onRetry, onSave, onClose, isOnline = true, t = {} }) {
  const [draft, setDraft] = useState(() => ({
    roomId: trip.roomId, revision: memory?.revision || 0,
    archived: archive || (memory ? Boolean(memory.archived) : true),
    note: memory?.note || '', visits: memory?.visits || {}, firsts: memory?.firsts || {},
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const combined = new Map(candidates.map((place) => [place.visitId, place]));
  Object.entries(draft.visits).forEach(([visitId, place]) => {
    if (!combined.has(visitId)) combined.set(visitId, { ...place, visitId });
  });
  const updateVisit = (place, patch) => setDraft((previous) => {
    const visits = { ...previous.visits };
    const { visitId, ...fields } = place;
    if (patch.status === '') delete visits[visitId];
    else visits[visitId] = { ...fields, city: '', note: '', ...visits[visitId], ...patch };
    return { ...previous, visits };
  });
  const submit = async (event) => {
    event.preventDefault();
    if (busy || !isOnline) return;
    if (Object.values(draft.visits).some((visit) => visit.status === 'visited' && !visit.city?.trim())) {
      setError('請為去過的地點填寫城市／地區，才能加入足跡。');
      return;
    }
    setError(''); setBusy(true);
    try { await onSave(draft); onClose(); }
    catch (nextError) { setError(nextError.message || '回憶尚未儲存，請再試一次。'); }
    finally { setBusy(false); }
  };
  return (
    <ResponsiveBottomSheet onClose={() => { if (!busy) onClose(); }} labelledBy="memory-editor-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`} testId="memory-editor">
      <form onSubmit={submit} className="journal-form">
        <div className="journal-heading">
          <div><p className="journal-eyebrow">留給自己的旅行紀錄</p><h2 id="memory-editor-title">{memory ? '編輯旅行回憶' : '把這趟旅行收好'}</h2></div>
          <Button variant="ghost" onClick={onClose} disabled={busy}>關閉</Button>
        </div>
        <p className="font-bold">{trip.title}</p>
        <p className="text-sm leading-6 opacity-75">收進回憶只會整理你的首頁，旅伴的行程與權限不變。到訪可以略過，之後再補。</p>
        <label className="journal-field">這趟旅行的感想<textarea disabled={busy} maxLength={3000} rows={3} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="想留住哪個片刻？也可以先留白。" /></label>
        <fieldset disabled={busy}>
          <legend className="mb-2 font-bold">哪些地方真的去過？</legend>
          <p className="mb-3 text-sm opacity-75">只有「去過」會加入足跡。城市請包含國家或地區，例如「日本・京都」。</p>
          {loading ? <p role="status">正在讀取行程景點…</p> : null}
          {loadError ? <div role="status" className="journal-notice">{loadError}{onRetry ? <Button onClick={onRetry} size="sm">重新讀取景點</Button> : null}</div> : null}
          {!loading && !combined.size ? <p className="journal-notice">沒有可確認的景點，仍可保存回憶。</p> : null}
          <div className="space-y-3">
            {[...combined.values()].map((place) => {
              const visit = draft.visits[place.visitId];
              return <div key={place.visitId} className="journal-visit">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><strong>{place.name}</strong><p className="text-xs opacity-65">{place.date || place.dayId}</p></div>
                  <select aria-label={`${place.name}的到訪狀態`} value={visit?.status || ''} onChange={(event) => updateVisit(place, { status: event.target.value })}>
                    <option value="">之後確認</option><option value="visited">去過</option><option value="missed">沒去</option><option value="wishlist">留待下次</option>
                  </select>
                </div>
                {visit ? <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="journal-field">城市／地區<input aria-label={`${place.name}的城市／地區`} maxLength={120} value={visit.city || ''} onChange={(event) => updateVisit(place, { city: event.target.value })} placeholder="例如：日本・京都" /></label>
                  <label className="journal-field">這個地方的回憶<input aria-label={`${place.name}的回憶`} maxLength={1000} value={visit.note || ''} onChange={(event) => updateVisit(place, { note: event.target.value })} placeholder="留下一句感想" /></label>
                </div> : null}
              </div>;
            })}
          </div>
        </fieldset>
        <fieldset disabled={busy} className="journal-visit">
          <legend className="font-bold">值得紀念的第一次</legend>
          <p className="mb-2 text-sm opacity-75">由你確認，護照章會連回這趟旅行。</p>
          <div className="flex flex-wrap gap-x-5">{Object.entries(FIRSTS).map(([id, label]) => <label key={id} className="journal-check"><input type="checkbox" checked={Boolean(draft.firsts[id])} onChange={(event) => {
            const firsts = { ...draft.firsts }; if (event.target.checked) firsts[id] = label; else delete firsts[id]; setDraft({ ...draft, firsts });
          }} />{label}</label>)}</div>
        </fieldset>
        {error ? <p role="alert" className="journal-error">{error}</p> : null}
        {!isOnline ? <p role="status">連線後才能儲存；你的輸入會保留在這裡。</p> : null}
        <div className="flex flex-wrap justify-end gap-2"><Button onClick={onClose} disabled={busy}>取消</Button><Button type="submit" variant="primary" loading={busy} disabled={!isOnline}>{memory && !archive ? '儲存回憶' : '完成並收進回憶'}</Button></div>
      </form>
    </ResponsiveBottomSheet>
  );
}
