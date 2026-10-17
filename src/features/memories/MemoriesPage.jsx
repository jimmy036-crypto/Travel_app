import React from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { groupMemories } from './journalModel.js';
import { PreservationStatus } from './PreservationStatus.jsx';

export function MemoriesPage({ memories = {}, onView, archiveSummaries = {}, archiveErrors = {}, query = '', onQueryChange = () => {}, renderCover, t = {} }) {
  const groups = groupMemories(memories, query);
  return <section aria-labelledby="memories-title">
    <div className="journal-heading"><div><p className="journal-eyebrow">TRAVEL MEMORIES</p><h2 id="memories-title">旅行回憶</h2></div><label className="journal-field"><span className="sr-only">搜尋旅行回憶</span><input name="memory-search" autoComplete="off" type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜尋旅程、城市或感想" /></label></div>
    <p className="journal-description">把走過的路收好。每一趟旅行，都有值得再看一次的片刻。</p>
    {!groups.length ? <div className="journal-notice">{query ? '找不到符合的回憶' : '回憶從一趟旅行開始。在首頁選擇「收進回憶」，之後隨時都能補上故事。'}</div> : null}
    {groups.map(({ year, memories: entries }) => <section key={year} className="journal-year" aria-label={`${year} 年回憶`}><h3>{year}</h3><div className="journal-grid">{entries.map((memory) => {
      const visited = Object.values(memory.visits || {}).filter((visit) => visit.status === 'visited').length;
      return <article key={memory.roomId} data-testid="memory-card" data-room-id={memory.roomId} className={`journal-card ${t.cardBg || ''}`}>
        <div className="journal-cover"><span>{memory.destination || '旅行記憶'}</span>{renderCover?.(memory)}</div>
        <div className="journal-card-body"><p className="text-xs font-semibold opacity-65">{memory.startDate} — {memory.endDate}</p><h3>{memory.title}</h3>
          <p className="journal-excerpt text-sm leading-7 whitespace-pre-wrap break-words">{memory.note || '故事還沒寫，回憶已經在這裡。'}</p>
          <p className="text-xs opacity-65">{visited ? `${visited} 個確認去過的地方` : '到訪紀錄可以之後再補'}</p>
          <PreservationStatus summary={archiveSummaries[memory.roomId]} error={archiveErrors[memory.roomId]} />
          <Button variant="primary" onClick={() => onView(memory.roomId)}>重溫這趟旅行</Button>
        </div>
      </article>;
    })}</div></section>)}
  </section>;
}
