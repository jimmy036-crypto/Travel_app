import React, { useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { groupMemories } from './journalModel.js';
import { SourcePhotos } from './SourcePhotos.jsx';

export function MemoriesPage({ memories = {}, trips = [], onOpenTrip, onEdit, onRestore, onClone, isOnline = true, t = {} }) {
  const [query, setQuery] = useState('');
  const groups = groupMemories(memories, query);
  return <section aria-labelledby="memories-title">
    <div className="journal-heading"><div><p className="journal-eyebrow">TRAVEL MEMORIES</p><h2 id="memories-title">旅行回憶</h2></div><label className="journal-field"><span className="sr-only">搜尋旅行回憶</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋旅程、城市或感想" /></label></div>
    <p className="journal-description">把走過的路收好。每一趟旅行，都有值得再看一次的片刻。</p>
    {!groups.length ? <div className="journal-notice">{query ? '找不到符合的回憶' : '回憶從一趟旅行開始。在首頁選擇「收進回憶」，之後隨時都能補上故事。'}</div> : null}
    {groups.map(({ year, memories: entries }) => <section key={year} className="journal-year" aria-label={`${year} 年回憶`}><h3>{year}</h3><div className="journal-grid">{entries.map((memory) => {
      const canOpen = trips.some((trip) => trip.roomId === memory.roomId && trip.accessStatus === 'active');
      const visited = Object.values(memory.visits || {}).filter((visit) => visit.status === 'visited').length;
      return <article key={memory.roomId} data-testid="memory-card" data-room-id={memory.roomId} className={`journal-card ${t.cardBg || ''}`}>
        <div className="journal-cover"><span>{memory.destination || '旅行記憶'}</span><SourcePhotos roomId={memory.roomId} canReadSource={canOpen} cover /></div>
        <div className="journal-card-body"><p className="text-xs font-semibold opacity-65">{memory.startDate} — {memory.endDate}</p><h3>{memory.title}</h3>
          <p className="text-sm leading-7 whitespace-pre-wrap break-words">{memory.note || '故事還沒寫，回憶已經在這裡。'}</p>
          <p className="text-xs opacity-65">{visited ? `${visited} 個確認去過的地方` : '到訪紀錄可以之後再補'}</p>
          <Button onClick={() => onEdit(memory.roomId)}>補充回憶與到訪</Button>
          <Button onClick={() => onOpenTrip(memory.roomId)} disabled={!canOpen}>開啟原行程與照片</Button>
          {!canOpen ? <p className="text-xs leading-5 opacity-65">原旅程目前無法存取；你的感想與已確認足跡仍保留。</p> : null}
          <div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" onClick={() => onRestore(memory)} disabled={!canOpen || !isOnline}>還原到首頁</Button><Button size="sm" variant="ghost" onClick={() => onClone(memory)} disabled={!canOpen || !isOnline}>複製成新旅程</Button></div>
        </div>
      </article>;
    })}</div></section>)}
  </section>;
}
