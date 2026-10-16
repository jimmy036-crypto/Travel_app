import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { generateId, getInclusiveDayCount } from '../../helpers.js';

export function CloneMemoryDialog({ memory, source, onClone, onClose, isOnline, t = {} }) {
  const [roomId, setRoomId] = useState(generateId);
  const [title, setTitle] = useState(`${memory.title}・再出發`);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); if (busy || !isOnline) return;
    const days = getInclusiveDayCount(start, end);
    const originalDays = getInclusiveDayCount(source.startDate, source.endDate);
    if (!title.trim() || !days || days > 30 || days < originalDays) {
      setError(`請填寫旅程名稱，並選擇至少 ${originalDays} 天、最多 30 天的日期，以保留原行程。`); return;
    }
    setBusy(true); setError('');
    try { await onClone({ sourceRoomId: memory.roomId, roomId, meta: { title: title.trim(), destination: source.destination, destLat: source.destLat, destLng: source.destLng, startDate: start, endDate: end, members: ['自己'], memberBudgets: { 自己: 10000 }, transport: source.transport || '汽車 🚗', themeColor: source.themeColor || '#3b82f6' } }); onClose(); }
    catch (nextError) {
      // Retain the attempt ID after ambiguous failures to avoid duplicate trips.
      if (String(nextError.code).endsWith('failed-precondition') && nextError.details?.reason === 'clone-attempt-not-published') setRoomId(generateId());
      setError(nextError.message || '尚未完成複製，請稍後重試。');
    }
    finally { setBusy(false); }
  };
  return <ResponsiveBottomSheet onClose={() => { if (!busy) onClose(); }} labelledBy="clone-memory-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}><form className="journal-form" onSubmit={submit}>
    <h2 id="clone-memory-title">帶著回憶，再出發</h2><p className="text-sm leading-6">複製原本的景點與規劃，建立你擁有的新旅程。支出、票券、完成紀錄和原旅程的私人附件不會帶入。</p>
    <fieldset disabled={busy} className="space-y-4"><label className="journal-field">新旅程名稱<input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
    <div className="grid gap-3 sm:grid-cols-2"><label className="journal-field">新出發日期<input type="date" value={start} onChange={(event) => setStart(event.target.value)} /></label><label className="journal-field">新回程日期<input type="date" value={end} onChange={(event) => setEnd(event.target.value)} /></label></div>
    </fieldset>{error ? <p role="alert" className="journal-error">{error}</p> : null}
    <div className="flex justify-end gap-2"><Button disabled={busy} onClick={onClose}>取消</Button><Button type="submit" variant="primary" disabled={!isOnline} loading={busy}>建立新的旅行</Button></div>
  </form></ResponsiveBottomSheet>;
}
