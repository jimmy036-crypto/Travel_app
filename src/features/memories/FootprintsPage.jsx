import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button.jsx';
import { buildFootprints } from './journalModel.js';
import { SourcePhotos } from './SourcePhotos.jsx';

const FootprintsMap = lazy(() => import('./FootprintsMap.jsx'));

export function FootprintsPage({ memories = {}, onEdit, onOpenTrip, trips = [], onCollectCity, t = {} }) {
  const cities = useMemo(() => buildFootprints(memories), [memories]);
  const mappedCities = useMemo(() => cities.filter((city) => city.lat !== null && city.lng !== null), [cities]);
  const [selectedId, setSelectedId] = useState('');
  const selected = cities.find((city) => city.id === selectedId) || cities[0];
  return <section aria-labelledby="footprints-title">
    <div className="journal-heading"><div><p className="journal-eyebrow">MY FOOTPRINTS</p><h2 id="footprints-title">我的足跡</h2></div><span className="text-sm opacity-65">只有本人確認的到訪</span></div>
    <p className="journal-description">同一座城市，每次都有不同的故事。選一個地方，看看自己在哪些年份回到這裡。</p>
    {mappedCities.length ? <Suspense fallback={<p role="status" className="journal-map">正在展開足跡地圖…</p>}><FootprintsMap cities={mappedCities} onSelect={setSelectedId} /></Suspense> : <p className="journal-notice mb-4">{cities.length ? '這些到訪沒有可用座標，城市紀錄仍保留在下方。' : '還沒有確認的足跡。從旅行回憶補上去過的地點，就能慢慢展開這張地圖。'}</p>}
    <div className="flex flex-wrap gap-2 mb-6">{cities.map((city) => <Button key={city.id} variant={selected?.id === city.id ? 'primary' : 'secondary'} onClick={() => setSelectedId(city.id)} aria-pressed={selected?.id === city.id}>{city.city} · {city.tripCount} 次</Button>)}</div>
    {selected ? <section className={`journal-card ${t.cardBg || ''}`} aria-label={`${selected.city}的旅行紀錄`}><div className="journal-card-body">
      <div className="journal-heading"><div><h3>{selected.city}</h3><p className="mt-2 text-sm">{selected.years.join('、')} · {selected.tripCount} 趟旅行</p></div><Button onClick={() => onCollectCity(selected)}>收藏這座城市</Button></div>
      {[...new Set(selected.visits.map((visit) => visit.roomId))].map((roomId) => {
        const visits = selected.visits.filter((visit) => visit.roomId === roomId);
        const memory = memories[roomId];
        const canOpen = trips.some((trip) => trip.roomId === roomId && trip.accessStatus === 'active');
        return <article key={roomId} className="journal-visit"><div className="journal-heading"><div><p className="journal-eyebrow">{memory.startDate}</p><h4>{memory.title}</h4></div><Button onClick={() => onEdit(roomId)}>查看／補充回憶</Button></div>
          <p className="my-3 whitespace-pre-wrap text-sm leading-7">{memory.note}</p>
          <ul className="space-y-2 mb-3">{visits.map((visit) => <li key={visit.visitId} className="text-sm"><strong>{visit.name}</strong>{visit.note ? <p className="mt-1 opacity-75">{visit.note}</p> : null}</li>)}</ul>
          <SourcePhotos roomId={roomId} canReadSource={canOpen} visitKeys={visits.map((visit) => JSON.stringify([visit.dayId, visit.itemId]))} />
          <Button size="sm" onClick={() => onOpenTrip(roomId)} disabled={!canOpen}>查看這趟行程與照片</Button>
        </article>;
      })}
    </div></section> : null}
  </section>;
}
