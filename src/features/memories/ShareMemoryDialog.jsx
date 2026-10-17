import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { buildShareText } from './journalModel.js';

export function ShareMemoryDialog({ memories, onClose, t = {} }) {
  const [selected, setSelected] = useState([]);
  const [fields, setFields] = useState({ dates: true, cities: true, note: false });
  const [editedText, setEditedText] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const text = editedText ?? buildShareText(memories, selected, fields);
  const resetPreview = () => { setEditedText(null); setMessage(''); };
  return <ResponsiveBottomSheet onClose={onClose} labelledBy="share-memory-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}>
    <div className="journal-form"><div className="journal-heading"><h2 id="share-memory-title">分享你選的回憶</h2><Button onClick={onClose}>關閉</Button></div>
      <p className="text-sm leading-6">選取回憶與欄位，確認預覽後分享文字。內容不包含照片、旅伴、精確座標或旅程存取連結。</p>
      <fieldset className="grid"><legend className="font-bold">要分享的旅行</legend>{Object.entries(memories).map(([id, memory]) => <label className="journal-check" key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) => { resetPreview(); setSelected(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id)); }} />{memory.title}</label>)}</fieldset>
      <fieldset className="flex flex-wrap gap-3"><legend className="font-bold">要分享的內容</legend>{[['dates', '旅行日期'], ['cities', '目的地與城市'], ['note', '個人感想']].map(([field, label]) => <label className="journal-check" key={field}><input type="checkbox" checked={fields[field]} onChange={(event) => { resetPreview(); setFields({ ...fields, [field]: event.target.checked }); }} />{label}</label>)}</fieldset>
      <label className="journal-field">分享內容預覽<textarea rows={8} value={text} disabled={!selected.length} onChange={(event) => { setEditedText(event.target.value); setMessage(''); }} /></label>
      {message ? <p role="status">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        {typeof navigator.share === 'function' ? <Button variant="primary" disabled={!selected.length || !text.trim()} loading={busy} onClick={async () => {
          setBusy(true); setMessage('');
          try { await navigator.share({ text }); setMessage('已分享選取的回憶。'); }
          catch (error) { if (error.name !== 'AbortError') setMessage('無法開啟分享，仍可複製下方文字。'); }
          finally { setBusy(false); }
        }}>分享文字</Button> : null}
        <Button variant="primary" disabled={!selected.length || !text.trim()} onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage('已複製選取的回憶。'); } catch { setMessage('無法自動複製，請選取上方文字手動複製。'); } }}>複製選取的回憶</Button>
      </div>
    </div>
  </ResponsiveBottomSheet>;
}
