import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.jsx';
import { generateId, getInclusiveDayCount, parseDateOnlyLocal } from '../../helpers.js';
import { useJournalDraft } from './useJournalDraft.js';

function dateAfter(start, days) {
  const date = parseDateOnlyLocal(start);
  if (!date || !days) return '';
  date.setDate(date.getDate() + days - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function CloneForm({ accountUid, memory, source, onClone, onClose, onOpenTrip, isOnline, t = {} }) {
  const [initialValue] = useState(() => ({ roomId: generateId(), title: `${memory.title}・再出發`, startDate: '', endDate: '', endAdjusted: false }));
  const draftState = useJournalDraft({ uid: accountUid, kind: 'clone', recordId: memory.roomId, initialValue, revision: memory.revision || 0, onClose });
  const { draft, setDraft } = draftState;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState('');
  const originalDays = getInclusiveDayCount(source?.startDate, source?.endDate);
  const days = getInclusiveDayCount(draft.startDate, draft.endDate);
  const durationError = !originalDays || originalDays > 30 ? '這份保存行程的日期不完整，或超過 30 天，無法複製。'
    : draft.startDate && draft.endDate && (!days || days < originalDays || days > 30) ? `請選擇至少 ${originalDays} 天、最多 30 天的日期，以保留原行程。` : '';
  const valid = Boolean(draft.title.trim() && days && !durationError);
  const close = () => { if (!busy) { if (created) onClose(); else draftState.requestClose(); } };
  const submit = async (event) => {
    event.preventDefault(); if (busy || !isOnline || !valid) return;
    setBusy(true); setError('');
    try {
      await onClone({ sourceRoomId: memory.roomId, roomId: draft.roomId, meta: { title: draft.title.trim(), startDate: draft.startDate, endDate: draft.endDate } });
      draftState.markSaved(); setCreated(draft.roomId);
    } catch (nextError) {
      // Retain the same attempt through ambiguous network failures.
      if (String(nextError.code).endsWith('failed-precondition') && nextError.details?.reason === 'clone-attempt-not-published') setDraft({ ...draft, roomId: generateId() });
      setError(nextError.message || '尚未完成複製，請稍後重試。');
    } finally { setBusy(false); }
  };
  return <>
    <ResponsiveBottomSheet onClose={close} labelledBy="clone-memory-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}>
      {created ? <div className="journal-form"><h2 id="clone-memory-title">新的旅行已建立</h2><p>{draft.title}</p>{draftState.persistenceError ? <p role="alert">{draftState.persistenceError}</p> : null}<div className="flex flex-wrap gap-2"><Button onClick={onClose}>稍後再看</Button><Button variant="primary" disabled={!onOpenTrip} onClick={() => { onClose(); onOpenTrip?.(created); }}>開啟新的旅行</Button></div></div>
        : <form className="journal-form" onSubmit={submit}>
          <h2 id="clone-memory-title">帶著回憶，再出發</h2><p className="text-sm leading-6">用永久保存的景點與規劃，建立你擁有的新旅程。支出、票券、照片與完成紀錄不會帶入。</p>
          <p className="text-sm">原行程 {originalDays || '未註明'} 天。新旅程至少 {originalDays || 1} 天，最多 30 天；選出發日期後會自動推算回程，也可以自行調整。</p>
          <fieldset disabled={busy} className="space-y-4"><label className="journal-field">新旅程名稱<input maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
            <div className="grid gap-3 sm:grid-cols-2"><label className="journal-field">新出發日期<input type="date" value={draft.startDate} onChange={(event) => { const startDate = event.target.value; setDraft({ ...draft, startDate, endDate: draft.endAdjusted ? draft.endDate : dateAfter(startDate, originalDays) }); setError(''); }} /></label><label className="journal-field">新回程日期<input type="date" value={draft.endDate} min={dateAfter(draft.startDate, originalDays)} max={dateAfter(draft.startDate, 30)} aria-invalid={Boolean(durationError)} onChange={(event) => { setDraft({ ...draft, endDate: event.target.value, endAdjusted: Boolean(event.target.value) }); setError(''); }} /></label></div>
          </fieldset>
          {durationError || error ? <p role="alert" className="journal-error">{durationError || error}</p> : null}
          {draftState.persistenceError ? <p role="alert" className="journal-error">{draftState.persistenceError}</p> : null}
          {!isOnline ? <p role="status">目前離線，日期與名稱會保留為本機草稿，連線後可建立旅行。</p> : null}
          <div className="journal-form-footer flex flex-wrap justify-end gap-2"><Button disabled={busy} onClick={close}>取消</Button><Button type="submit" variant="primary" disabled={!isOnline || !valid} loading={busy}>建立新的旅行</Button></div>
        </form>}
    </ResponsiveBottomSheet>
    <ConfirmDialog open={draftState.closeConfirmation} title="保留再出發的草稿？" description={draftState.persistenceError || '輸入已備份在這個裝置，下次開啟會繼續編輯。'} confirmLabel={draftState.persistenceError ? '仍要關閉並放棄輸入' : '保留草稿並關閉'} cancelLabel="繼續編輯" onConfirm={draftState.confirmClose} onCancel={draftState.cancelClose} />
  </>;
}

export function CloneMemoryDialog(props) { return <CloneForm key={`${props.accountUid || ''}:${props.memory.roomId}`} {...props} />; }
