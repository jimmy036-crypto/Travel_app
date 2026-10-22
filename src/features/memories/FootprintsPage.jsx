import React, { lazy, Suspense, useMemo, useRef } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { buildFootprints } from './journalModel.js';

const FootprintsMap = lazy(() => import('./FootprintsMap.jsx'));

export function FootprintsPage({ memories = {}, onEdit, onOpenMemory, onCollectCity, selectedId = '', onSelectCity, renderPhotos, t = {} }) {
  const cities = useMemo(() => buildFootprints(memories), [memories]);
  const mappedCities = useMemo(() => cities.filter((city) => city.lat !== null && city.lng !== null), [cities]);
  const detailRef = useRef(null);
  const selected = cities.find((city) => city.id === selectedId) || cities[0];
  return <section aria-labelledby="footprints-title">
    <div className="journal-heading"><h2 id="footprints-title">我的足跡</h2><span className="text-sm">只有本人確認的到訪</span></div>
    <p className="journal-description">同一座城市，每次都有不同的故事。選一個地方，看看自己在哪些年份回到這裡。</p>
    {mappedCities.length ? <Suspense fallback={<p role="status" className="journal-map">正在展開足跡地圖…</p>}><FootprintsMap cities={mappedCities} selectedId={selected?.id} onSelect={(id) => { onSelectCity(id); detailRef.current?.scrollIntoView({ block: 'nearest' }); }} /></Suspense> : <p className="journal-notice mb-4">{cities.length ? '這些到訪沒有可用座標，城市紀錄仍保留在下方。' : '還沒有確認的足跡。從旅行回憶補上去過的地點，就能慢慢展開這張地圖。'}</p>}
    <div className="flex flex-wrap gap-2 mb-6">{cities.map((city) => <Button key={city.id} variant={selected?.id === city.id ? 'primary' : 'secondary'} onClick={() => onSelectCity(city.id)} aria-pressed={selected?.id === city.id}>{city.city} · {city.tripCount} 趟旅行{city.unassigned ? ' · 待整理' : ''}</Button>)}</div>
    {selected ? <section ref={detailRef} className={`journal-card ${t.cardBg || ''}`} aria-label={`${selected.city}的旅行紀錄`}><div className="journal-card-body">
      <div className="journal-heading"><div><h3>{selected.city}</h3><p className="mt-2 text-sm">{[selected.country, selected.years.join('、'), `${selected.tripCount} 趟旅行`].filter(Boolean).join(' · ')}</p></div><Button onClick={() => onCollectCity(selected)}>收藏這座城市</Button></div>
      {selected.tripIds.map((roomId) => {
        const visits = selected.visits.filter((visit) => visit.roomId === roomId);
        const memory = memories[roomId];
        return <article key={roomId} className="journal-city-trip"><div className="journal-heading"><div><p className="journal-date">{memory.startDate}{memory.endDate && memory.endDate !== memory.startDate ? ` — ${memory.endDate}` : ''}</p><h4>{memory.title}</h4></div><Button onClick={() => onOpenMemory(roomId)}>重溫這趟旅行</Button></div>
          <p className="my-3 whitespace-pre-wrap text-sm leading-7">{memory.note}</p>
          <div className="journal-heading journal-notebook-heading"><h3>走過的地方</h3><button type="button" className="journal-text-action" onClick={() => onEdit(roomId, true)}>{visits.length ? '編輯景點' : '補上景點'}</button></div>
          {visits.length ? <ul className="space-y-2 mb-3">{visits.map((visit) => <li key={visit.visitId} className="text-sm"><strong>{visit.name}</strong>{visit.note ? <p className="mt-1">{visit.note}</p> : null}</li>)}</ul> : <p className="journal-help">城市已留下，景點可以慢慢補。</p>}
          {renderPhotos?.(roomId, visits)}
          {selected.unassigned ? <Button size="sm" onClick={() => onEdit(roomId)}>整理這些地點的城市</Button> : null}
        </article>;
      })}
    </div></section> : null}
  </section>;
}
