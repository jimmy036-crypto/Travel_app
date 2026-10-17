import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useMemoryArchive } from './useMemoryArchive.js';

export function DeleteMemoryDialog({ memory, accountUid, onDelete, onClose, t = {} }) {
  const archive = useMemoryArchive(accountUid, memory.roomId);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const done = archive.summary?.state === 'deleted';
  return <ResponsiveBottomSheet onClose={() => { if (!busy) onClose(); }} labelledBy="delete-memory-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}><div className="journal-form"><h2 id="delete-memory-title">{done ? '個人回憶已刪除' : requested ? '正在刪除個人回憶' : `刪除「${memory.title}」的個人回憶？`}</h2><p>會移除你的感想、到訪紀錄與保存照片。相關收藏保留為「下次想去」。原旅程與旅伴的回憶不受影響。</p>
    {error || archive.error ? <p className="journal-error" role="alert">{error || archive.error}</p> : null}
    {requested && !done ? <p role="status">雲端正在清理照片，完成前不會顯示已刪除。你可以先關閉這個視窗。</p> : null}
    <div className="journal-actions"><Button disabled={busy} onClick={onClose}>{requested || done ? '關閉' : '取消'}</Button>{!done && (!requested || archive.summary?.error) ? <Button variant="danger" loading={busy} onClick={async () => {
      setBusy(true); setError('');
      try { await onDelete({ roomId: memory.roomId, revision: memory.revision }); setRequested(true); }
      catch (next) { setError(next.message || '刪除尚未完成，請重試。'); }
      finally { setBusy(false); }
    }}>{requested ? '重試刪除' : '確認刪除個人回憶'}</Button> : null}</div></div></ResponsiveBottomSheet>;
}
