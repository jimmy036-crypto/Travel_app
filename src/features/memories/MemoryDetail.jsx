import React from 'react';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { buildFootprints, extractVisitCandidates } from './journalModel.js';
import { MemoryPhotos } from './MemoryPhotos.jsx';
import { PreservationStatus } from './PreservationStatus.jsx';
import { sortDayIds } from '../../helpers.js';

export function MemoryDetail({ accountUid, memory, archive, canReadSource = false, isOnline, busy, error, onPreserve, onClose, onEdit, onRestore, onClone, onDelete, onOpenTrip, t = {} }) {
  const candidates = extractVisitCandidates(archive.itinerary, memory.startDate);
  const days = sortDayIds(Object.keys(archive.itinerary || {})).map((dayId) => [dayId, Object.values(archive.itinerary[dayId] || {})]);
  const manual = Object.entries(memory.visits || {}).filter(([, visit]) => visit.source === 'manual');
  const summary = archive.summary;
  const cities = buildFootprints({ [memory.roomId]: memory }).filter((city) => !city.unassigned);
  return <ResponsiveBottomSheet onClose={onClose} labelledBy="memory-detail-title" panelClassName={`journal-dialog ${t.modalBg || 'bg-white text-slate-900'}`} testId="memory-detail">
    <div className="journal-form"><div className="journal-heading"><div><p className="journal-eyebrow">留在這裡的旅行</p><h2 id="memory-detail-title">{memory.title}</h2></div><Button onClick={onClose}>關閉回憶</Button></div>
      <p className="text-sm opacity-75">{memory.startDate} — {memory.endDate} · {memory.destination}</p>
      <PreservationStatus summary={summary} />
      {cities.length ? <p aria-label="去過的城市" className="journal-help">去過的城市：{cities.map((city) => [city.city, city.country].filter(Boolean).join('・')).join('、')}</p> : null}
      {archive.loading ? <p role="status">正在展開保存的回憶…</p> : null}
      {archive.error ? <div className="journal-error" role="alert">{archive.error}<Button onClick={archive.retry}>重新讀取回憶</Button></div> : null}
      {summary?.error ? <p className="journal-notice">{summary.error}</p> : null}
      {!archive.loading && !['complete', 'copying', 'queued', 'deleting', 'deleted'].includes(summary?.state) ? <div className="journal-notice"><p>行程與照片另存副本後，原旅程刪除也能重溫。</p><Button disabled={!isOnline || !canReadSource} loading={busy} onClick={onPreserve}>{summary?.state === 'partial' ? '重試未完成照片' : '永久保存行程與照片'}</Button>{!canReadSource ? <p>原旅程已無法存取，未保存的照片目前無法補存；已保存的內容仍保留。</p> : null}</div> : null}
      {error ? <p className="journal-error" role="alert">{error}</p> : null}
      <p className="journal-story whitespace-pre-wrap">{memory.note || '故事可以慢慢補，先把這趟旅行留住。'}</p>
      <MemoryPhotos accountUid={accountUid} roomId={memory.roomId} photos={archive.photos || {}} />
      <Button onClick={() => onEdit(memory.roomId)}>補充回憶與到訪</Button>
      {days.length ? <section aria-label="保存的每日行程"><h3 className="font-bold mb-3">那幾天走過的路</h3><p className="text-sm opacity-65 mb-4">封存時的行程快照；城市與景點都以本人確認的到訪為準。</p>{days.map(([day, places]) => <section className="journal-detail-day" key={day}><h4>{candidates.find((place) => place.dayId === day)?.date || day} · {day}</h4><ol>{places.map((place) => {
        const candidate = candidates.find((entry) => entry.dayId === day && entry.itemId === String(place.id));
        const visit = candidate && memory.visits?.[candidate.visitId];
        return <li key={place.id}><strong>{place.customName || place.name || '行程記事'}</strong>{place.time ? <span>{place.time}{place.stayTime ? ` · 停留 ${place.stayTime}` : ''}</span> : null}{candidate ? <span className="journal-visit-status">{visit?.status === 'visited' ? `已去過${visit.city ? ` · ${visit.city}` : ' · 城市待整理'}` : visit?.status === 'wishlist' ? '留待下次' : visit?.status === 'missed' ? '這次沒去' : '尚未確認到訪'}</span> : null}{place.address ? <p>{place.address}</p> : null}{[...new Set([place.memo, place.notes].filter(Boolean))].map((note, index) => <p className="whitespace-pre-wrap" key={index}>{note}</p>)}{visit?.note ? <p className="whitespace-pre-wrap">{visit.note}</p> : null}</li>;
      })}</ol></section>)}</section> : null}
      {manual.length ? <section><h3 className="font-bold">旅途中的意外發現</h3><ul>{manual.map(([id, visit]) => <li className="journal-visit" key={id}><strong>{visit.name}</strong><p>{visit.city} · {visit.date}</p><p>{visit.note}</p></li>)}</ul></section> : null}
      <details className="journal-more"><summary>整理這份回憶</summary><div className="journal-actions mt-3"><Button onClick={() => onOpenTrip?.(memory.roomId)} disabled={!canReadSource}>開啟原行程</Button><Button onClick={() => onRestore?.(memory)} disabled={!canReadSource || !isOnline || busy}>還原到首頁</Button><Button onClick={() => onClone?.(memory)} disabled={!summary || ['deleting', 'deleted'].includes(summary.state) || !isOnline}>複製成新旅程</Button><Button variant="danger" onClick={() => onDelete?.(memory)} disabled={!isOnline}>刪除這份個人回憶</Button></div><p className="text-xs opacity-65 mt-3">個人回憶與原行程分開保存，整理回憶不會更動旅伴的資料。</p></details>
    </div>
  </ResponsiveBottomSheet>;
}
