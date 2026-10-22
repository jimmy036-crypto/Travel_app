import React, { useState } from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';

const labels = { cities: '城市足跡', note: '旅行感想', visits: '到訪紀錄', city: '城市', cityId: '城市識別', status: '到訪狀態', firsts: '首次體驗', title: '標題', items: '收藏地點', startDate: '出發日期', endDate: '回程日期', archived: '封存狀態' };
const labelFor = (field, conflict) => field.path.split('/').slice(1).map((part, index, parts) => {
  const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
  if (index === 1 && parts[0] === 'visits') return conflict.localValue.visits?.[key]?.name || conflict.remoteValue.visits?.[key]?.name || key;
  if (index === 1 && parts[0] === 'cities') return conflict.localValue.cities?.[key]?.city || conflict.remoteValue.cities?.[key]?.city || key;
  return labels[key] || key;
}).join(' / ');
const formatValue = (value) => value === undefined ? '已移除' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value || '空白');

export function MemoryConflictDialog({ conflict, onResolve, onClose }) {
  const [choices, setChoices] = useState({});
  if (!conflict) return null;
  return <ResponsiveBottomSheet onClose={onClose} labelledBy="memory-conflict-title" panelClassName="journal-dialog bg-white text-slate-900" testId="memory-conflict-dialog">
    <div className="journal-form">
      <h2 id="memory-conflict-title">合併另一個畫面的更新</h2>
      <p>你的草稿仍然保留。不同欄位的變更會合併；同一欄位的變更，請選擇要保留的內容。</p>
      {conflict.conflicts.length === 0 ? <p role="status">沒有互相衝突的欄位，可以合併後繼續編輯。</p> : conflict.conflicts.map((field) => {
        const label = labelFor(field, conflict);
        return <fieldset key={field.path} className="journal-visit">
          <legend className="font-bold">{label}</legend>
          {['local', 'remote'].map((side) => <label key={side} className="journal-conflict-choice">
            <span className="journal-check"><input type="radio" name={field.path} aria-label={`${side === 'local' ? '保留我的內容' : '保留最新內容'}：${label}`} checked={choices[field.path] === side} onChange={() => setChoices((previous) => ({ ...previous, [field.path]: side }))} />{side === 'local' ? '我的草稿' : '最新內容'}</span>
            <pre className="whitespace-pre-wrap break-words text-sm">{formatValue(field[side])}</pre>
          </label>)}
        </fieldset>;
      })}
      <div className="journal-form-footer flex flex-wrap justify-end gap-2"><Button onClick={onClose}>返回草稿</Button><Button variant="primary" disabled={conflict.conflicts.some((field) => !choices[field.path])} onClick={() => onResolve(choices)}>套用選擇並繼續編輯</Button></div>
    </div>
  </ResponsiveBottomSheet>;
}
