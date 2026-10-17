import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';

export function ArchiveTripDialog({ trip, onArchive, onClose, onView, onEdit, isOnline, t = {} }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const archive = async () => {
    setBusy(true); setError('');
    try { const result = await onArchive(); setDone(true); setError(result?.preservationError || ''); }
    catch (next) { setError(next.message || '尚未收進回憶，請重試。'); }
    finally { setBusy(false); }
  };
  return <ResponsiveBottomSheet onClose={() => { if (!busy) onClose(); }} labelledBy="archive-trip-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`} testId="archive-trip-dialog">
    <div className="journal-form"><p className="journal-eyebrow">留給以後的自己</p><h2 id="archive-trip-title">{done ? '回憶已收好' : '把這趟旅行收好'}</h2><strong>{trip.title}</strong>
      <p className="leading-7">{done ? '隨時可以重溫這趟旅行，也可以之後再補感想和足跡。' : '行程和當下可存取的景點照片將另存為個人回憶。副本保存完成後，原旅程刪除或退出共用都不會影響它。'}</p>
      {!done ? <p className="text-sm opacity-75">只整理你的首頁，旅伴不受影響。不必先寫遊記，也不會把規劃景點直接算成去過。</p> : !error ? <p role="status" className="journal-notice">照片已排入保存工作，可在回憶中查看進度。</p> : null}
      {error ? <p className="journal-error" role="alert">{error}</p> : null}
      {!isOnline ? <p role="status">恢復連線後即可收進回憶。</p> : null}
      <div className="journal-actions">{done ? <><Button onClick={onClose}>完成</Button>{onEdit ? <Button onClick={() => onEdit(trip.roomId)}>補上足跡</Button> : null}<Button variant="primary" onClick={() => onView(trip.roomId)}>查看回憶</Button></> : <><Button onClick={onClose} disabled={busy}>取消</Button><Button variant="primary" loading={busy} disabled={!isOnline} onClick={archive}>收好這趟旅行</Button></>}</div>
    </div>
  </ResponsiveBottomSheet>;
}
