import React, { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { buildAnnualReview, buildPassportStamps, getMemoryYear } from './journalModel.js';

export function PassportReview({ memories = {}, collections = {}, onEdit, onShare, t = {} }) {
  const years = [...new Set(Object.values(memories).map(getMemoryYear).filter((year) => /^\d{4}$/.test(year)))].sort().reverse();
  const [selectedYear, setSelectedYear] = useState('');
  const year = years.includes(selectedYear) ? selectedYear : years[0] || String(new Date().getFullYear());
  const annual = buildAnnualReview(memories, year);
  const stamps = buildPassportStamps(memories, collections);
  return <section className={`journal-card mt-8 ${t.cardBg || ''}`} aria-label="旅行護照與年度回顧"><div className="journal-card-body">
    <div className="journal-heading"><div><p className="journal-eyebrow">YOUR TRAVEL PASSPORT</p><h3>旅行護照</h3></div><Button onClick={onShare} disabled={!Object.keys(memories).length}>選擇回憶來分享</Button></div>
    <p className="text-sm opacity-75">每枚章，都連著一段真實回憶。</p>
    {stamps.length ? <div className="journal-grid">{stamps.map((stamp) => <button key={stamp.id} type="button" className="journal-stamp" onClick={() => onEdit(stamp.roomId)}><small className="opacity-65">{stamp.kind === 'first' ? '首次體驗' : stamp.kind === 'return' ? '再次相遇' : '個人收藏'}</small><strong>{stamp.title}</strong><span>{stamp.description}</span></button>)}</div> : <p className="text-sm opacity-65">確認一次首次體驗、完成自己的收藏，或重回一座城市，便能留下屬於你的章。</p>}
    <div className="journal-heading mt-5"><h3>年度旅行回顧</h3><label className="journal-field"><span className="sr-only">回顧年份</span><select value={year} onChange={(event) => setSelectedYear(event.target.value)}>{(years.length ? years : [year]).map((entry) => <option key={entry} value={entry}>{entry} 年</option>)}</select></label></div>
    <div className="journal-stats"><span><strong>{annual.tripCount}</strong> 趟旅行</span><span><strong>{annual.cityCount}</strong> 座城市</span><span><strong>{annual.placeCount}</strong> 個到訪地點</span></div>
    <p className="text-xs opacity-65">依旅程出發年份整理；城市與地點只計入你確認去過的紀錄。</p>
    {annual.memories.length ? <div className="flex flex-wrap gap-2">{annual.memories.map((memory) => <Button key={memory.roomId} variant="ghost" onClick={() => onEdit(memory.roomId)}>{memory.title}</Button>)}</div> : <p className="text-sm">這一年還沒有旅行回憶。</p>}
  </div></section>;
}
