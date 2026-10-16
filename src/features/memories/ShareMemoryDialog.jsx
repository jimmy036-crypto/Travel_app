import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { buildShareText } from './journalModel.js';

export function ShareMemoryDialog({ memories, onClose, t = {} }) {
  const [selected, setSelected] = useState([]);
  const [message, setMessage] = useState('');
  const text = buildShareText(memories, selected);
  return <ResponsiveBottomSheet onClose={onClose} labelledBy="share-memory-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`}>
    <div className="journal-form"><div className="journal-heading"><h2 id="share-memory-title">分享你選的回憶</h2><Button onClick={onClose}>關閉</Button></div>
      <p className="text-sm leading-6">回憶預設只有你看得到。選取後先預覽，再複製文字貼給朋友。內容不包含照片、旅伴、精確座標或旅程存取連結。</p>
      <div className="grid">{Object.entries(memories).map(([id, memory]) => <label className="journal-check" key={id}><input type="checkbox" checked={selected.includes(id)} onChange={(event) => { setMessage(''); setSelected(event.target.checked ? [...selected, id] : selected.filter((value) => value !== id)); }} />{memory.title}</label>)}</div>
      <label className="journal-field">分享內容預覽<textarea rows={8} value={text} readOnly /></label>
      {message ? <p role="status">{message}</p> : null}
      <Button variant="primary" disabled={!text} onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage('已複製選取的回憶。'); } catch { setMessage('無法自動複製，請選取上方文字手動複製。'); } }}>複製選取的回憶</Button>
    </div>
  </ResponsiveBottomSheet>;
}
