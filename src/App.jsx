// ============================================================================
// (1) 模組引入與全局設定 (Imports & Global Setup)
// ============================================================================
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { APIProvider, Map, AdvancedMarker, Pin, useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

import { db, storage } from "./firebase";
import { ref as dbRef, onValue, set } from "firebase/database";
import { ref as sRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { API_KEY, APP_VERSION, RELEASE_NOTES, CATEGORIES, TAG_OPTIONS } from "./constants";
import { getDayDisplay, generateId, getThemeClasses, getExploreIcon, timeToMins, minsToTime, formatStayTime, safeUrlFormatter } from "./helpers";

const useBodyScrollLock = () => {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = 'unset'; };
  }, []);
};

// ============================================================================
// (2) 輕量級 UI 元件 (Loading, UpdateNotice, MemoView, PlaceDetails)
// ============================================================================
const LoadingSpinner = ({ t }) => (
  <div className="flex flex-col items-center justify-center h-full w-full bg-transparent">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
    <p className={`font-bold tracking-widest animate-pulse ${t.subText}`}>載入旅程資料中...</p>
  </div>
);

const UpdateNoticeModal = ({ notes, onClose, t }) => {
  useBodyScrollLock();
  /** @type {any[]} */
  const features = Array.isArray(notes.features) ? notes.features : [];
  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <div className="text-center mb-6">
          <span className="text-6xl mb-4 block drop-shadow-md">🎉</span>
          <h2 className={`text-2xl font-black mb-1 ${t.mainText}`}>App 更新完成！</h2>
          <p className={`text-xs font-bold ${t.subText}`}>最新版本 {String(notes.version)} • {String(notes.date)}</p>
        </div>
        <div className={`p-5 rounded-2xl border mb-8 space-y-4 shadow-inner overflow-y-auto max-h-[50vh] ${t.cardBg} ${t.cardBorder}`}>
          {features.map((feat, idx) => (
            <div key={`feat-${idx}`} className="flex items-start gap-2">
              <p className={`text-sm font-medium leading-relaxed ${t.mainText}`}>{String(feat)}</p>
            </div>
          ))}
        </div>
        <button onClick={() => onClose()} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
          太棒了，開始使用！
        </button>
      </div>
    </div>
  );
};

const MemoViewModal = ({ item, onClose, t }) => {
  useBodyScrollLock();
  if (!item) return null;
  const displayName = item.customName || item.name;
  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh] ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4 border-b pb-4 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className={`text-lg font-black leading-tight truncate ${t.mainText}`}>📝 {String(displayName)}</h3>
            <p className={`text-[10px] mt-1 ${t.subText}`}>筆記與備註</p>
          </div>
          <button onClick={() => onClose()} className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-500/10 hover:bg-red-500 hover:text-white transition-colors shrink-0 ${t.subText}`}>✕</button>
        </div>
        <div className={`p-5 rounded-xl border overflow-y-auto overscroll-contain flex-1 ${t.cardBg} ${t.cardBorder}`}>
          <p className={`text-sm whitespace-pre-wrap wrap-break-word leading-relaxed ${t.mainText}`}>{String(item.memo)}</p>
        </div>
        <div className="mt-6 flex justify-end shrink-0">
           <button onClick={() => onClose()} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all">關閉</button>
        </div>
      </div>
    </div>
  );
};

const PlaceDetailsModal = ({ place, onClose, onAdd, exploreOriginItem, dayTitle, t, isFetching }) => {
  useBodyScrollLock();
  if (!place) return null;

  /** @type {any[]} */
  const photos = Array.isArray(place.photos) ? place.photos : [];
  /** @type {any[]} */
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden w-full max-w-[100vw]" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-0 w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh] ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <div className={`p-5 border-b sticky top-0 z-10 backdrop-blur-xl ${t.cardBg} ${t.cardBorder} flex justify-between items-start gap-4 shrink-0`}>
          <div className="flex-1 min-w-0">
            <h2 className={`text-xl font-black leading-tight mb-1 wrap-break-word ${t.mainText}`}>{String(place.name)}</h2>
            <p className={`text-[11px] truncate ${t.subText}`}>{String(place.formatted_address || place.vicinity)}</p>
            <div className="flex items-center flex-wrap gap-2 mt-3">
              {place.rating ? <span className="bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md text-xs font-bold border border-orange-500/20">⭐ {String(place.rating)}</span> : null}
              {place.user_ratings_total ? <span className={`text-[11px] font-bold ${t.subText}`}>({String(place.user_ratings_total)} 則評論)</span> : null}
              {place.website ? <a href={safeUrlFormatter(place.website)} target="_blank" rel="noreferrer" className={`text-[11px] text-blue-500 hover:underline font-bold ml-2`}>🌐 官方網站</a> : null}
            </div>
            {isFetching ? <p className="text-xs text-blue-500 mt-2 font-bold animate-pulse">讀取照片與評論中...</p> : null}
          </div>
          <button onClick={() => onClose()} className={`w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center text-xl hover:bg-red-500 hover:text-white transition-colors shrink-0 ${t.subText}`}>✕</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-6 scrollbar-hide flex-1">
          {photos.length > 0 ? (
            <div>
              <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${t.subText}`}>照片總覽</h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {photos.slice(0, 8).map((photo, idx) => (
                  <img key={`photo-${idx}`} src={photo.getUrl({ maxWidth: 400, maxHeight: 300 })} alt="現場照片" className={`h-32 w-auto object-cover rounded-xl border snap-center shrink-0 shadow-sm ${t.cardBorder}`} />
                ))}
              </div>
            </div>
          ) : null}
          {reviews.length > 0 ? (
            <div>
              <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${t.subText}`}>精選評論</h3>
              <div className="space-y-3">
                {reviews.slice(0, 5).map((review, idx) => (
                  <div key={`rev-${idx}`} className={`p-4 rounded-2xl border ${t.itemBg} ${t.cardBorder}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <img src={review.profile_photo_url} alt="avatar" className="w-8 h-8 rounded-full shadow-sm" />
                      <div>
                        <p className={`text-xs font-bold ${t.mainText}`}>{String(review.author_name)}</p>
                        <p className={`text-[10px] ${t.subText}`}>{String(review.relative_time_description)} • ⭐ {String(review.rating)}</p>
                      </div>
                    </div>
                    <p className={`text-xs leading-relaxed opacity-90 line-clamp-3 wrap-break-word ${t.mainText}`}>{String(review.text)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {place.url ? (
            <button onClick={() => window.open(safeUrlFormatter(place.url), '_blank')} className={`w-full py-3 rounded-xl border text-base md:text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:border-blue-500 hover:text-blue-500 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>
              🗺️ 在 Google Maps 中查看完整資訊
            </button>
          ) : null}
        </div>

        {onAdd ? (
          <div className={`p-5 border-t bg-black/5 backdrop-blur-xl shrink-0 ${t.cardBorder}`}>
             {exploreOriginItem ? (
                <div className="flex gap-2">
                  <button onClick={() => onAdd(place, 'before')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm md:text-[11px] font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
                    加在「{String(exploreOriginItem.customName || exploreOriginItem.name).substring(0,6)}...」前
                  </button>
                  <button onClick={() => onAdd(place, 'after')} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-sm md:text-[11px] font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95">
                    加在「{String(exploreOriginItem.customName || exploreOriginItem.name).substring(0,6)}...」後
                  </button>
                </div>
              ) : (
                <button onClick={() => onAdd(place, 'end')} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-base font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                  <span>➕</span> 加入 {dayTitle} 行程
                </button>
              )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

// ============================================================================
// (3) 表單類 UI 元件 (DateRangePicker, ExpenseModal)
// ============================================================================
const DateRangePickerModal = ({ initialStart, initialEnd, onConfirm, onClose, t }) => {
  useBodyScrollLock();
  const normalize = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const [tempStart, setTempStart] = useState(() => initialStart ? normalize(new Date(String(initialStart))) : null);
  const [tempEnd, setTempEnd] = useState(() => initialEnd ? normalize(new Date(String(initialEnd))) : null);
  const [viewMonth, setViewMonth] = useState(() => tempStart || normalize(new Date()));

  const handleDayClick = (date) => {
    const d = normalize(date);
    if (!tempStart || (tempStart && tempEnd)) { setTempStart(d); setTempEnd(null); }
    else { if (d < tempStart) { setTempStart(d); setTempEnd(null); } else { setTempEnd(d); } }
  };

  const formatStr = d => {
    if (!d) return "";
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };

  const renderMonth = (monthOffset = 0) => {
    const targetDate = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + monthOffset, 1);
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = targetDate.getDay();
    /** @type {any[]} */
    const days = Array(firstDayIndex).fill(null);
    for(let i=1; i<=lastDay; i++) days.push(new Date(year, month, i));

    return (
      <div className="flex-1 w-full md:w-1/2 shrink-0 p-1 md:p-4">
        <h3 className={`text-center font-bold mb-4 ${t.mainText}`}>{year} 年 {month + 1} 月</h3>
        <div className="grid grid-cols-7 text-center text-[11px] mb-2 gap-y-1 md:gap-y-2">
          {['日','一','二','三','四','五','六'].map((d,i) => <div key={`wd-${i}`} className={`font-bold pb-2 ${i===0||i===6 ? 'text-red-500' : t.subText}`}>{String(d)}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`empty-${i}`}/>;
            const ts = d.getTime(); const sTime = tempStart?.getTime(); const eTime = tempEnd?.getTime();
            const isStart = ts === sTime; const isEnd = ts === eTime; const inRange = Boolean(sTime && eTime && ts > sTime && ts < eTime);
            let bgWrapper = "", text = t.mainText, rounded = "";
            if (isStart) { bgWrapper = "bg-blue-600 shadow-md"; text = "text-white"; rounded = tempEnd ? "rounded-l-full" : "rounded-full"; }
            else if (isEnd) { bgWrapper = "bg-blue-600 shadow-md"; text = "text-white"; rounded = "rounded-r-full"; }
            else if (inRange) { bgWrapper = "bg-blue-500/20"; rounded = ""; }
            else { rounded = "rounded-full hover:bg-black/10 transition-colors"; }
            return (
              <div key={`day-${ts}`} className={`relative flex items-center justify-center h-10 ${bgWrapper} ${rounded}`} onClick={() => handleDayClick(d)}>
                <span className={`w-8 h-8 flex items-center justify-center cursor-pointer ${isStart||isEnd ? 'font-bold' : ''} ${text}`}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden w-full max-w-[100vw]" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-5 md:p-8 w-full max-w-2xl shadow-2xl flex flex-col ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6"><h2 className={`text-xl font-black ${t.mainText}`}>選擇旅行日期</h2><button onClick={() => onClose()} className={`w-10 h-10 flex items-center justify-center rounded-full bg-slate-500/10 text-xl hover:text-red-500 transition-colors ${t.subText}`}>✕</button></div>
        <div className={`flex justify-between items-center p-4 rounded-2xl border mb-6 text-sm font-bold text-center ${t.cardBg} ${t.cardBorder}`}>
           <div className="flex-1 flex flex-col"><span className={`text-[10px] uppercase mb-1 ${t.subText}`}>去程出發</span><span className={tempStart ? 'text-blue-500 text-base' : t.subText}>{formatStr(tempStart) || '-'}</span></div>
           <div className="w-px h-8 bg-slate-500/20 mx-2"></div>
           <div className="flex-1 flex flex-col"><span className={`text-[10px] uppercase mb-1 ${t.subText}`}>回程抵達</span><span className={tempEnd ? 'text-blue-500 text-base' : t.subText}>{formatStr(tempEnd) || '-'}</span></div>
        </div>
        <div className="flex justify-between items-center mb-2 px-2 md:px-6">
           <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className={`w-10 h-10 flex items-center justify-center rounded-full border shadow-sm active:scale-90 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>◀</button>
           <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className={`w-10 h-10 flex items-center justify-center rounded-full border shadow-sm active:scale-90 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>▶</button>
        </div>
        <div className="flex overflow-hidden">{renderMonth(0)}<div className="hidden md:block w-px bg-slate-500/10 mx-2"></div><div className="hidden md:block">{renderMonth(1)}</div></div>
        <div className="mt-8"><button onClick={() => { if(tempStart && tempEnd) onConfirm(formatStr(tempStart), formatStr(tempEnd)); else alert('請點擊日期，選擇完整的出發與回程時間！'); }} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-base font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">確認日期區間</button></div>
      </div>
    </div>
  );
};

const ExpenseModal = ({ members, existingDays, startDate, defaultDay, onClose, onSave, t }) => {
  useBodyScrollLock();

  /** @type {any[]} */
  const validMembers = Array.isArray(members) ? members : [];
  /** @type {any[]} */
  const validDays = Array.isArray(existingDays) ? existingDays : [];

  const [item, setItem] = useState("");
  const [cost, setCost] = useState("");
  const [dayId, setDayId] = useState(defaultDay);
  const [category, setCategory] = useState("food");
  const [payer, setPayer] = useState(validMembers.length > 0 ? validMembers[0] : "自己");
  const [splitType, setSplitType] = useState("EQUAL");
  const [involved, setInvolved] = useState(validMembers);
  const [customAmounts, setCustomAmounts] = useState(() => {
    /** @type {Record<string, string>} */
    const init = {};
    validMembers.forEach(m => { init[String(m)] = ""; });
    return init;
  });

  const handleSave = () => {
    if (!String(item).trim() || !cost || Number(cost) <= 0) return alert("請輸入有效的項目名稱與金額！");
    const totalCost = Number(cost);
    /** @type {Record<string, number>} */
    const finalSplit = {};

    if (splitType === "EQUAL") {
      if (involved.length === 0) return alert("請至少選擇一位參與分帳的人員！");
      const splitAmount = Math.floor((totalCost / involved.length) * 100) / 100;
      let sum = 0;
      involved.forEach((m, idx) => {
        if (idx === involved.length - 1) { finalSplit[String(m)] = Math.round((totalCost - sum) * 100) / 100; }
        else { finalSplit[String(m)] = splitAmount; sum += splitAmount; }
      });
      validMembers.forEach(m => { if (!involved.includes(m)) finalSplit[String(m)] = 0; });
    } else {
      let customSum = 0;
      validMembers.forEach(m => { const val = Number(customAmounts[String(m)]) || 0; finalSplit[String(m)] = val; customSum += val; });
      if (Math.abs(customSum - totalCost) > 1) return alert(`分帳總和 (${customSum}) 與總金額 (${totalCost}) 不符！`);
    }
    onSave({ id: generateId(), dayId: String(dayId), item: String(item).trim(), cost: totalCost, category: String(category), payer: String(payer), split: finalSplit });
  };

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity overflow-hidden w-full max-w-[100vw]" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <h2 className={`text-xl font-black mb-5 flex items-center gap-2 ${t.mainText}`}>💰 新增記帳</h2>
        <div className="overflow-y-auto pr-2 space-y-5 scrollbar-hide">
          <div className="flex gap-3">
            <div className="flex-1"><label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>項目名稱 *</label><input value={String(item)} onChange={e => setItem(e.target.value)} placeholder="ex: 晚餐燒肉" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} /></div>
            <div className="w-1/3"><label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>總金額 *</label><input type="number" value={String(cost)} onChange={e => setCost(e.target.value)} placeholder="0" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border font-mono font-bold text-emerald-500 text-sm ${t.inputBg} ${t.cardBorder}`} /></div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1"><label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>日期</label><select value={String(dayId)} onChange={e => setDayId(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>{validDays.map(d => <option key={`day-${d}`} value={String(d)}>{getDayDisplay(d, startDate).title} {getDayDisplay(d, startDate).dateStr}</option>)}</select></div>
            <div className="flex-1"><label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>誰先付的？</label><select value={String(payer)} onChange={e => setPayer(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>{validMembers.map(m => <option key={`payer-${m}`} value={String(m)}>{String(m)}</option>)}</select></div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase ${t.subText}`}>分類</label>
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
              {CATEGORIES.map(c => <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 py-2 rounded-xl border flex items-center gap-2 whitespace-nowrap transition-all ${category === c.id ? `${c.color} border-transparent text-white shadow-md` : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}><span>{c.icon}</span><span className="text-xs font-bold">{c.label}</span></button>)}
            </div>
          </div>
          <div className={`p-4 rounded-2xl border ${t.cardMetaBg} ${t.cardBorder}`}>
            <div className="flex justify-between items-center mb-3"><label className={`text-xs font-bold ${t.subText}`}>分帳方式</label><div className={`flex rounded-lg p-1 border ${t.cardBg} ${t.cardBorder}`}><button onClick={() => setSplitType('EQUAL')} className={`px-3 py-1 text-[10px] font-bold rounded-md ${splitType === 'EQUAL' ? 'bg-blue-600 text-white' : t.subText}`}>勾選平分</button><button onClick={() => setSplitType('CUSTOM')} className={`px-3 py-1 text-[10px] font-bold rounded-md ${splitType === 'CUSTOM' ? 'bg-purple-600 text-white' : t.subText}`}>輸入自訂</button></div></div>
            {splitType === 'EQUAL' ? (
              <div className="space-y-2"><p className={`text-[10px] mb-2 ${t.subText}`}>請勾選參與此筆消費的成員：</p><div className="flex flex-wrap gap-2">{validMembers.map(m => <button key={`inv-${m}`} onClick={() => setInvolved(involved.includes(m) ? involved.filter(x => x !== m) : [...involved, m])} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${involved.includes(m) ? 'bg-blue-500/20 border-blue-500 text-blue-600' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>{involved.includes(m) ? '✓' : '○'} {String(m)}</button>)}</div>{Number(cost) > 0 && involved.length > 0 ? <p className="text-[10px] text-emerald-500 font-mono mt-3 text-right font-bold">每人約負擔：${Math.round(Number(cost) / involved.length).toLocaleString()}</p> : null}</div>
            ) : (
              <div className="space-y-3"><p className={`text-[10px] ${t.subText}`}>請為每個人輸入精確金額：</p>{validMembers.map(m => <div key={`cust-${m}`} className="flex justify-between items-center gap-3"><span className={`text-sm font-bold ${t.mainText}`}>{String(m)}</span><input type="number" value={String(customAmounts[String(m)] || "")} onChange={e => setCustomAmounts({...customAmounts, [String(m)]: e.target.value})} placeholder="0" className={`w-24 p-2 rounded-lg font-mono text-right outline-none focus:ring-2 focus:ring-purple-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} /></div>)}{Number(cost) > 0 ? <div className={`border-t pt-2 mt-2 flex justify-between items-center ${t.cardBorder}`}><span className={`text-xs ${t.subText}`}>目前總和</span><span className={`text-sm font-bold font-mono ${Object.values(customAmounts).reduce((a,b) => Number(a) + (Number(b)||0), 0) === Number(cost) ? 'text-emerald-500' : 'text-red-500'}`}>${Object.values(customAmounts).reduce((a,b) => Number(a) + (Number(b)||0), 0).toLocaleString()} / ${Number(cost).toLocaleString()}</span></div> : null}</div>
            )}
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${t.cardBorder}`}><button onClick={() => onClose()} className={`px-5 py-2 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button><button onClick={() => handleSave()} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all">確認新增</button></div>
      </div>
    </div>
  );
};

// ============================================================================
// (4) 票券專屬彈窗 (TicketModal, FullscreenTicketModal)
// ============================================================================
const TicketModal = ({ members, onClose, onSave, t }) => {
  useBodyScrollLock();

  /** @type {any[]} */
  const validMembers = Array.isArray(members) ? members : [];

  const [title, setTitle] = useState("");
  const [type, setType] = useState("image");
  const [url, setUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [owner, setOwner] = useState("所有人");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const ownerOptions = ["所有人", ...validMembers];

  const handleSave = async () => {
    if (!String(title).trim()) return alert("請輸入票券名稱！");
    let finalUrl = "";
    let finalType = type;

    if (type === "image") {
      if (!file) {
        alert("請選擇圖片或 PDF 檔案！");
        return;
      }
      if (!storage) {
        alert("尚未設定 Firebase Storage，請改用網址連結！");
        return;
      }
      setUploading(true);
      try {
        const fileRef = sRef(storage, `tickets/${Date.now()}_${file.name}`);
        const uploadTask = await uploadBytes(fileRef, /** @type {any} */ (file));
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 15000));

        const snapshot = await Promise.race([uploadTask, timeoutPromise]);
        finalUrl = await getDownloadURL(snapshot.ref);
        if (file.type === "application/pdf" || file.name.endsWith(".pdf")) finalType = "pdf";
      } catch (err) {
        console.warn(err);
        setUploading(false);
        if (err && err.message === "Timeout") {
           alert("⚠️ 上傳逾時！請檢查 Firebase 規則或網路連線。");
        } else {
           alert("上傳失敗，請稍後再試！");
        }
        return;
      }
    } else if (type === "link") {
      if (!String(url).trim()) return alert("請輸入有效的網址連結！");
      finalUrl = safeUrlFormatter(url);
    } else {
      return alert("請選擇檔案或輸入網址！");
    }

    onSave({
      id: generateId(),
      title: String(title).trim(),
      type: String(finalType),
      url: String(finalUrl).trim(),
      memo: String(memo).trim(),
      owner: String(owner)
    });
  };

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden w-full max-w-[100vw]" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <h2 className={`text-xl font-black mb-5 flex items-center gap-2 ${t.mainText}`}>🎟️ 新增票券 / 附件</h2>
        <div className="overflow-y-auto pr-2 space-y-5 scrollbar-hide">
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>票券名稱 *</label>
            <input value={String(title)} onChange={e => setTitle(e.target.value)} placeholder="ex: 關西周遊券" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>使用分配人員</label>
            <select value={String(owner)} onChange={e => setOwner(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
               {ownerOptions.map(opt => <option key={`opt-${opt}`} value={String(opt)}>{String(opt)}</option>)}
            </select>
          </div>
          <div className={`p-1 flex rounded-lg border mt-2 ${t.cardBg} ${t.cardBorder}`}>
            <button onClick={() => setType('image')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === 'image' ? 'bg-blue-600 text-white shadow-sm' : t.subText}`}>📷 上傳檔案 (圖片/PDF)</button>
            <button onClick={() => setType('link')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === 'link' ? 'bg-blue-600 text-white shadow-sm' : t.subText}`}>🔗 網址連結</button>
          </div>
          {type === 'image' ? (
             <div className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 border-dashed ${t.cardBg} ${t.cardBorder}`}>
                <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files ? e.target.files[0] : null)} className={`text-base md:text-xs ${t.mainText} w-full`} />
                {file ? <span className="text-[10px] text-emerald-400 font-bold mt-2">✅ 已選檔案: {file.name}</span> : null}
             </div>
          ) : (
            <div>
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>連結網址 *</label>
              <input value={String(url)} onChange={e => setUrl(e.target.value)} placeholder="example.com" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            </div>
          )}
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>座位 / 備註</label>
            <input value={String(memo)} onChange={e => setMemo(e.target.value)} placeholder="ex: 第2車 5B" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${t.cardBorder}`}>
          <button onClick={() => onClose()} className={`px-5 py-2 text-sm font-bold opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={() => handleSave()} disabled={uploading} className={`bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}>
            {uploading ? '上傳儲存中...' : '確認新增'}
          </button>
        </div>
      </div>
    </div>
  );
};

const FullscreenTicketModal = ({ ticket, onClose }) => {
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLock = await navigator.wakeLock.request('screen');
        }
      } catch { /* ignore */ }
    };
    void requestWakeLock();
    return () => { if (wakeLock) void wakeLock.release(); };
  }, []);

  return (
    <div style={{ zIndex: 99999 }} className="fixed inset-0 bg-white flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200" onClick={() => onClose()}>
      <div className="flex justify-between items-center mb-8 mt-safe">
         <div className="flex flex-col">
            <h2 className="text-2xl font-black text-slate-900">{String(ticket.title)}</h2>
            <span className="text-blue-600 text-sm font-bold mt-1">👤 尊屬持有人: {String(ticket.owner || '所有人')}</span>
         </div>
         <button onClick={() => onClose()} className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-xl shadow-sm">✕</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center pb-20">
         <img src={ticket.url} alt="ticket" className="w-full h-full max-h-[70vh] object-contain drop-shadow-xl" />
         {ticket.memo ? <p className="mt-8 text-slate-700 text-base font-bold bg-slate-50 px-6 py-3 rounded-xl border border-slate-200 shadow-inner">{String(ticket.memo)}</p> : null}
      </div>
    </div>
  );
};

// ============================================================================
// (5) 編輯與操作元件 (CopyItemModal, EditItemModal)
// ============================================================================
const CopyItemModal = ({ item, existingDays, onClose, onCopy, t }) => {
  useBodyScrollLock();
  /** @type {any[]} */
  const validDays = Array.isArray(existingDays) ? existingDays : [];
  const [targetDay, setTargetDay] = useState(validDays.length > 0 ? validDays[0] : "");

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden w-full max-w-[100vw]" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-xs shadow-2xl flex flex-col ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <h3 className={`text-lg font-black mb-2 ${t.mainText}`}>📋 複製景點</h3>
        <p className={`text-xs mb-4 ${t.subText}`}>將「{String(item.customName || item.name)}」複製到：</p>
        <select value={String(targetDay)} onChange={e => setTargetDay(e.target.value)} className={`w-full py-2.5 px-3 mb-6 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
           {validDays.map(d => <option key={`cd-${d}`} value={String(d)}>{String(d)}</option>)}
        </select>
        <div className="flex justify-end gap-3">
          <button onClick={() => onClose()} className={`px-4 py-2 text-sm font-bold opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={() => onCopy(targetDay, item)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md">確認複製</button>
        </div>
      </div>
    </div>
  );
};

const EditItemModal = ({ item, onSave, onClose, t }) => {
  useBodyScrollLock();
  const [customName, setCustomName] = useState(item.customName || "");
  const [time, setTime] = useState(item.time || "");
  const [stayTime, setStayTime] = useState(item.stayTime !== undefined ? item.stayTime : "0");
  const [memo, setMemo] = useState(item.memo || "");
  const [tags, setTags] = useState(Array.isArray(item.tags) ? item.tags : []);
  const [autoCascade, setAutoCascade] = useState(true);

  const [legMode, setLegMode] = useState(item.nextLeg?.mode || "AUTO");
  const [legMins, setLegMins] = useState(item.nextLeg?.mins || 30);

  const handleQuickTime = (addMins) => setStayTime(prev => String((Number(prev) || 0) + Number(addMins)));

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity" onClick={() => onClose()}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-x-hidden animate-in fade-in zoom-in duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <div className="mb-5 shrink-0">
          <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>自訂地標名稱 (選填)</label>
          <input
             value={String(customName)}
             onChange={e => setCustomName(e.target.value)}
             placeholder={String(item.name)}
             className={`w-full py-2 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-base md:text-lg font-black ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
          />
          <p className={`text-[10px] truncate mt-2 ${t.subText}`}>🗺️ 原始地標：{String(item.name)}</p>
        </div>

        <div className="overflow-y-auto pr-2 space-y-5 scrollbar-hide flex-1">

          {/* 🌟 核心排版修復：縮小間距(gap-2)，自訂寬度比例，強制設定高度(h-10)對抗 Safari */}
          <div className="flex flex-row gap-2 items-end">
            <div className="w-[55%] shrink-0">
              <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>抵達時間</label>
              <input
                type="time"
                value={String(time)}
                onClick={e => { if ('showPicker' in e.target && typeof e.target.showPicker === 'function') e.target.showPicker(); }}
                onChange={e => setTime(e.target.value)}
                /* 加入 appearance-none 與 h-10 強制瘦身 */
                className={`w-full h-10 px-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border cursor-pointer text-sm appearance-none bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              />
            </div>
            <div className="w-[45%] shrink-0">
              <label className={`flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>
                <span>停留(分鐘)</span>
                <span className="text-blue-500 font-black">{formatStayTime(stayTime)}</span>
              </label>
              <input
                type="number"
                step="5"
                value={String(stayTime)}
                onChange={e => setStayTime(e.target.value)}
                placeholder="0"
                /* 加入 appearance-none 與 h-10 強制瘦身 */
                className={`w-full h-10 px-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-sm appearance-none bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              />
            </div>
          </div>

          <div className="flex gap-1.5 -mt-2">
            {[0, 30, 60].map(mins => <button key={`qt-${mins}`} onClick={() => {if(mins===0) setStayTime("0"); else handleQuickTime(mins);}} className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold border transition-colors hover:opacity-80 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>{mins === 0 ? '僅經過' : mins === 60 ? '+1小時' : '+'+mins+'分'}</button>)}
          </div>

          <div className={`p-4 rounded-xl border flex flex-col gap-3 ${t.cardBg} ${t.cardBorder}`}>
            <label className={`block text-[10px] font-bold uppercase tracking-wider ${t.subText}`}>前往下一站的交通方式</label>
            <div className="flex gap-3">
              <select value={String(legMode)} onChange={e => setLegMode(e.target.value)} className={`flex-1 h-10 px-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-sm font-bold bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                <option value="AUTO">🚗 自動計算車程</option>
                <option value="FLIGHT">✈️ 搭乘飛機</option>
                <option value="TRAIN">🚅 火車/高鐵</option>
                <option value="TRANSIT">🚇 大眾運輸</option>
                <option value="WALK">🚶 步行前往</option>
              </select>
              {legMode !== 'AUTO' ? (
                <div className="w-1/3 relative shrink-0">
                  <input type="number" value={String(legMins)} onChange={e => setLegMins(e.target.value)} placeholder="分鐘" className={`w-full h-10 px-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-sm text-right pr-6 appearance-none bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                  <span className={`absolute right-2 top-3 text-[10px] ${t.subText}`}>分</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center justify-between ${t.cardBg} ${t.cardBorder}`}>
            <div className="flex flex-col">
               <span className={`text-xs font-bold ${t.mainText}`}>🔄 自動順延後續行程</span>
               <span className={`text-[10px] mt-0.5 ${t.subText}`}>系統會根據車程重新計算後面的抵達時間</span>
            </div>
            <input type="checkbox" checked={autoCascade} onChange={e => setAutoCascade(e.target.checked)} className="w-5 h-5 cursor-pointer accent-blue-500 rounded" />
          </div>

          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase tracking-wider ${t.subText}`}>快速狀態標籤</label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => {
                const isActive = tags.includes(tag);
                return <button key={`tag-${tag}`} onClick={() => setTags(isActive ? tags.filter(x => x !== tag) : [...tags, tag])} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive ? 'bg-blue-600 border-transparent text-white shadow-lg' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>{String(tag)}</button>
              })}
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>筆記 / 備註</label>
            <textarea value={String(memo)} onChange={e => setMemo(e.target.value)} placeholder="輸入你想記下的重點細節..." className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-20 resize-none transition-colors border text-sm bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t shrink-0 ${t.cardBorder}`}>
          <button onClick={() => onClose()} className={`px-5 py-2 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={() => onSave({ ...item, customName: String(customName).trim(), time: String(time), stayTime: String(stayTime), memo: String(memo), tags, nextLeg: { mode: String(legMode), mins: Number(legMins) } }, autoCascade)} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">儲存變更</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// (6) 地圖輔助元件 (SearchBox, Directions)
// ============================================================================
const SearchBox = ({ dayId, onAddPlace, t }) => {
  const [val, setVal] = useState("");
  const [sug, setSug] = useState(/** @type {any[]} */ ([]));
  const lib = useMapsLibrary('places');

  const handleSearch = (e) => {
    const v = String(e.target.value);
    setVal(v);
    if (!lib || v.length < 2) {
      setSug([]);
      return;
    }
    const service = new lib.AutocompleteService();
    service.getPlacePredictions({ input: v, language: 'zh-TW' })
      .then((res) => setSug(Array.isArray(res.predictions) ? res.predictions : []))
      .catch(() => setSug([]));
  };

  const select = (p) => {
    const el = document.createElement('div');
    const service = new lib.PlacesService(el);
    service.getDetails({ placeId: p.place_id }, (res, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && res && res.geometry) {
         onAddPlace(dayId, res, String(p.place_id));
      }
      setVal("");
      setSug([]);
    });
  };

  return (
    <div className="relative mb-4">
      <input className={`w-full py-2.5 px-4 rounded-xl text-base md:text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} placeholder="新增行程地點..." value={String(val)} onChange={handleSearch} />
      {Array.isArray(sug) && sug.length > 0 ? (
        <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl border overflow-hidden text-xs backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>
          {sug.map((s, i) => (
            <div key={String(s.place_id || i)} onClick={() => select(s)} className={`p-3 cursor-pointer border-b transition-colors hover:opacity-80 ${t.mainText} ${t.cardBorder}`}>{String(s.description)}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const Directions = ({ itinerary, dayId, onRouteCalculated }) => {
  const map = useMap('main-map');
  const routesLib = useMapsLibrary('routes');
  const renderersRef = useRef(/** @type {any[]} */ ([]));

  useEffect(() => {
    if (!routesLib || !map || !dayId || !itinerary || !itinerary[dayId]) return;
    let isCancelled = false;
    const items = itinerary[dayId];

    const fetchAllLegs = async () => {
      renderersRef.current.forEach(r => r.setMap(null));
      renderersRef.current = [];
      if (items.length < 2) {
        if(onRouteCalculated) onRouteCalculated(dayId, []);
        return;
      }
      const service = new routesLib.DirectionsService();
      const durations = []; const newRenderers = [];

      for (let i = 0; i < items.length - 1; i++) {
        const origin = items[i]; const dest = items[i+1];
        const nextLeg = origin.nextLeg || { mode: 'AUTO', mins: 30 };
        if (nextLeg.mode !== 'AUTO') {
           durations.push({ text: formatStayTime(nextLeg.mins), value: Number(nextLeg.mins), mode: String(nextLeg.mode) });
           continue;
        }
        try {
          const res = await service.route({
            origin: { lat: Number(origin.lat || 0), lng: Number(origin.lng || 0) },
            destination: { lat: Number(dest.lat || 0), lng: Number(dest.lng || 0) },
            travelMode: window.google.maps.TravelMode.DRIVING
          });
          if (isCancelled) return;
          const renderer = new routesLib.DirectionsRenderer({
            map, suppressMarkers: true, preserveViewport: true,
            polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 5, strokeOpacity: 0.8 }
          });
          renderer.setDirections(res); newRenderers.push(renderer);
          const leg = res.routes[0].legs[0];
          durations.push({ text: String(leg.duration.text), value: Math.round(leg.duration.value / 60), mode: 'AUTO' });
        } catch {
          if (isCancelled) return;
          durations.push({ text: "無法計算", value: 30, mode: 'ERROR' });
        }
      }
      if (!isCancelled) {
        renderersRef.current = newRenderers;
        if(onRouteCalculated) onRouteCalculated(dayId, durations);
      }
    };
    void fetchAllLegs();
    return () => { isCancelled = true; renderersRef.current.forEach(r => r.setMap(null)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routesLib, map, itinerary, dayId]);
  return null;
};

// ============================================================================
// (7) 核心功能：旅程明細頁面 (TripDetail)
// ============================================================================
const TripDetail = ({ roomId, onBack, onUpdateTripMeta }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [itinerary, setItinerary] = useState({ "Day 1": [] });
  const [expenses, setExpenses] = useState(/** @type {any[]} */ ([]));
  const [tickets, setTickets] = useState(/** @type {any[]} */ ([]));
  const [budget, setBudget] = useState(10000);

  const [currentDay, setCurrentDay] = useState("Day 1");
  const [activeTab, setActiveTab] = useState("plan");

  const [editingItemData, setEditingItemData] = useState(null);
  const [viewingMemoItem, setViewingMemoItem] = useState(null);
  const [copyingItem, setCopyingItem] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [fullscreenTicket, setFullscreenTicket] = useState(null);
  const [expenseView, setExpenseView] = useState('list');
  const [routeDurations, setRouteDurations] = useState({});

  const placesLib = useMapsLibrary('places');
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreResults, setExploreResults] = useState(/** @type {any[]} */ ([]));
  const [selectedExploreItem, setSelectedExploreItem] = useState(null);
  const [exploreOriginItem, setExploreOriginItem] = useState(null);

  const [detailedPlace, setDetailedPlace] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSavedItemModal, setIsSavedItemModal] = useState(false);

  const map = useMap('main-map');
  const isRemoteUpdateRef = useRef(false);

  useEffect(() => {
    if (!db || !roomId) {
      setMeta({ title: "單機預覽模式 (無資料庫)", destination: "沖繩", startDate: "2026-09-20", endDate: "2026-09-24", members: ["自己"], transport: "汽車 🚗", themeColor: "#1e293b", dayThemes: {} });
      setIsLoading(false);
      return;
    }
    const roomRef = dbRef(db, `rooms/${roomId}`);
    const unsub = onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        isRemoteUpdateRef.current = true;
        let loadedMeta = data.meta || { title: "未命名", destination: "", startDate: "", endDate: "", members: ["自己"], transport: "", themeColor: "#1e293b", dayThemes: {} };
        if (!Array.isArray(loadedMeta.members)) loadedMeta.members = ["自己"];
        if (!loadedMeta.dayThemes) loadedMeta.dayThemes = {};
        setMeta(loadedMeta);
        onUpdateTripMeta(roomId, loadedMeta);

        let rawItin = data.itinerary || {};
        const safeItin = {};
        if (loadedMeta.startDate && loadedMeta.endDate) {
          const d1 = new Date(String(loadedMeta.startDate));
          const d2 = new Date(String(loadedMeta.endDate));
          const diffDays = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          for (let i = 1; i <= diffDays; i++) safeItin[`Day ${i}`] = Array.isArray(rawItin[`Day ${i}`]) ? rawItin[`Day ${i}`] : Object.values(rawItin[`Day ${i}`] || {});

          const lastDayKey = `Day ${diffDays}`;
          Object.keys(rawItin).forEach(key => {
             const dayNum = parseInt(key.replace('Day ', ''), 10);
             if (dayNum > diffDays && Array.isArray(rawItin[key]) && rawItin[key].length > 0) {
                 const orphans = rawItin[key].map(item => ({ ...item, tags: [...(Array.isArray(item.tags) ? item.tags : []), "⚠️ 日期變更移入"] }));
                 safeItin[lastDayKey] = [...(safeItin[lastDayKey] || []), ...orphans];
             }
          });
        }
        if (Object.keys(safeItin).length === 0) safeItin["Day 1"] = [];
        setItinerary(safeItin);
        setExpenses(Array.isArray(data.expenses) ? data.expenses : Object.values(data.expenses || {}));
        setTickets(Array.isArray(data.tickets) ? data.tickets : Object.values(data.tickets || {}));
        setBudget(Number(data.budget) || 10000);
        setIsLoading(false);
      }
    });
    return () => unsub();
  }, [roomId, onUpdateTripMeta]);

  useEffect(() => {
    if (isRemoteUpdateRef.current) { isRemoteUpdateRef.current = false; return; }
    if (db && roomId && meta) {
      void set(dbRef(db, `rooms/${roomId}`), { meta, itinerary, expenses, tickets, budget }).catch(() => {});
    }
  }, [meta, itinerary, expenses, tickets, budget, roomId]);

  const tripThemeColor = String(meta?.themeColor || '#1e293b');
  const t = useMemo(() => getThemeClasses(tripThemeColor), [tripThemeColor]);

  const handleDayThemeUpdate = (dayId) => {
    const currentTheme = meta.dayThemes[dayId] || "";
    const newTheme = window.prompt(`請輸入 ${dayId} 的專屬主題名稱：\n(例如：大自然探索、極致購物日)`, currentTheme);
    if (newTheme !== null) {
      const newMeta = { ...meta, dayThemes: { ...meta.dayThemes, [dayId]: String(newTheme).trim() } };
      setMeta(newMeta);
    }
  };

  const handleColorChange = (newColor) => {
    const newMeta = { ...meta, themeColor: String(newColor) };
    setMeta(newMeta);
    if (db) void set(dbRef(db, `rooms/${roomId}/meta`), newMeta).catch(() => {});
    onUpdateTripMeta(roomId, newMeta);
  };

  const existingDays = Object.keys(itinerary);
  const safeCurrentDay = existingDays.includes(currentDay) ? currentDay : (existingDays[0] || "Day 1");
  const membersListStr = JSON.stringify(meta?.members || ["自己"]);
  const membersList = useMemo(() => JSON.parse(membersListStr), [membersListStr]);

  const expenseStats = (() => {
    const total = Array.isArray(expenses) ? expenses.reduce((sum, e) => sum + (Number(e.cost) || 0), 0) : 0;
    const over = total > budget;
    const percent = budget > 0 ? Math.min((total / budget) * 100, 100) : 100;
    const grouped = existingDays.map(day => ({ day, items: Array.isArray(expenses) ? expenses.filter(e => e.dayId === day) : [] }));

    /** @type {Record<string, number>} */
    const userBalances = {};
    membersList.forEach(m => { userBalances[String(m)] = 0; });

    if(Array.isArray(expenses)) {
      expenses.forEach(exp => {
        if (userBalances[String(exp.payer)] !== undefined) userBalances[String(exp.payer)] += (Number(exp.cost) || 0);
        if (exp.split) {
          Object.entries(exp.split).forEach(([member, amount]) => { if (userBalances[String(member)] !== undefined) userBalances[String(member)] -= (Number(amount) || 0); });
        } else {
          const splitAmount = (Number(exp.cost) || 0) / membersList.length;
          membersList.forEach(m => { userBalances[String(m)] -= splitAmount; });
        }
      });
    }

    /** @type {{member: string, amount: number}[]} */
    const debtors = [];
    /** @type {{member: string, amount: number}[]} */
    const creditors = [];
    Object.entries(userBalances).forEach(([member, balance]) => {
      if (balance < -0.5) debtors.push({ member: String(member), amount: -balance });
      else if (balance > 0.5) creditors.push({ member: String(member), amount: balance });
    });
    debtors.sort((a, b) => b.amount - a.amount); creditors.sort((a, b) => b.amount - a.amount);

    /** @type {{from: string, to: string, amount: number}[]} */
    const suggestTransfers = [];
    let dIdx = 0, cIdx = 0;
    while (dIdx < debtors.length && cIdx < creditors.length) {
      const amount = Math.min(debtors[dIdx].amount, creditors[cIdx].amount);
      suggestTransfers.push({ from: debtors[dIdx].member, to: creditors[cIdx].member, amount });
      debtors[dIdx].amount -= amount; creditors[cIdx].amount -= amount;
      if (debtors[dIdx].amount < 0.5) dIdx++; if (creditors[cIdx].amount < 0.5) cIdx++;
    }
    return { totalExpense: total, isOverBudget: over, budgetPercent: percent, groupedExpenses: grouped, balances: userBalances, transfers: suggestTransfers };
  })();

  const handleDragEnd = useCallback((result) => {
    const { source, destination } = result;
    if (!destination) return;
    setItinerary(prev => {
      const newItin = { ...prev };
      const [moved] = newItin[String(source.droppableId)].splice(source.index, 1);
      newItin[String(destination.droppableId)].splice(destination.index, 0, moved);
      return newItin;
    });
  }, []);

  const handleRouteCalculated = useCallback((day, durations) => {
    setRouteDurations(prev => JSON.stringify(prev[day]) !== JSON.stringify(durations) ? { ...prev, [day]: durations } : prev);
  }, []);

  const saveEditedItem = useCallback((updatedItem, shouldCascade) => {
    setItinerary(prev => {
      const n = { ...prev };
      const dayId = String(editingItemData.dayId);
      const dayList = [...(n[dayId] || [])];
      const idx = dayList.findIndex(p => p.id === updatedItem.id);

      if (idx !== -1) {
        dayList[idx] = updatedItem;
        if (shouldCascade && updatedItem.time) {
          let currentMins = timeToMins(updatedItem.time) + Number(updatedItem.stayTime || 0);
          for (let i = idx + 1; i < dayList.length; i++) {
             const prevItem = dayList[i-1];
             let travelTime = 30;
             if (prevItem.nextLeg && prevItem.nextLeg.mode !== 'AUTO') {
                travelTime = Number(prevItem.nextLeg.mins) || 30;
             } else if (routeDurations[dayId] && routeDurations[dayId][i-1]) {
                travelTime = Number(routeDurations[dayId][i-1].value) || 30;
             }
             currentMins += travelTime;
             dayList[i] = { ...dayList[i], time: minsToTime(currentMins) };
             currentMins += Number(dayList[i].stayTime || 0);
          }
        }
      }
      n[dayId] = dayList;
      return n;
    });
    setEditingItemData(null);
  }, [editingItemData, routeDurations]);

  const handleCopyItem = (targetDay, item) => {
    setItinerary(prev => {
      const dayList = [...(prev[String(targetDay)] || [])];
      const newItem = { ...item, id: generateId(), time: "" };
      dayList.push(newItem);
      return { ...prev, [String(targetDay)]: dayList };
    });
    setCopyingItem(null);
    alert(`✅ 已將「${item.customName || item.name}」複製到 ${targetDay}！`);
  };

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => { alert(db ? `🔗 已複製 ${meta.title} 的共編連結！` : "⚠️ 尚未設定 Firebase！"); }).catch(() => {});
  }, [roomId, meta?.title]);

  const handleExploreSearch = (customQuery = null, customLocation = null) => {
    const q = typeof customQuery === 'string' ? customQuery : String(exploreQuery);
    if (!q.trim() || !placesLib || !map) return;

    const service = new placesLib.PlacesService(map);
    const request = { query: q };
    if (customLocation) { request.location = customLocation; request.radius = 1500; }
    else {
      const bounds = map.getBounds();
      if (bounds) { request.bounds = bounds; }
      else { request.location = map.getCenter(); request.radius = 2000; }
    }

    if (typeof customQuery === 'string') setExploreQuery(customQuery);

    service.textSearch(request, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && Array.isArray(results) && results.length > 0) {
        setExploreResults(results); setSelectedExploreItem(null);
        if (!customLocation) { map.panTo(results[0].geometry.location); map.setZoom(15); }
      } else { setExploreResults([]); alert("找不到結果，試試調整地圖範圍或關鍵字！"); }
    });
  };

  const handleSearchNearby = (item) => {
    setExploreOriginItem(item); setActiveTab("map");
    setTimeout(() => {
      if (map) {
        const loc = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
        map.panTo(loc); map.setZoom(16); handleExploreSearch("餐廳", loc);
      }
    }, 400);
  };

  const handleShowDetails = (placeId) => {
    if (!placesLib || !map) return;
    setIsFetchingDetails(true);
    setIsSavedItemModal(false);
    const service = new placesLib.PlacesService(map);
    service.getDetails({
      placeId: String(placeId),
      fields: ['name', 'rating', 'user_ratings_total', 'formatted_address', 'geometry', 'photos', 'reviews', 'opening_hours', 'website', 'formatted_phone_number', 'url', 'place_id']
    }, (place, status) => {
      setIsFetchingDetails(false);
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) { setDetailedPlace(place); }
      else { alert("無法取得詳細資訊！"); }
    });
  };

  const handleSavedItemDetails = (item) => {
    if (!placesLib || !map) return;
    setIsFetchingDetails(true);
    setIsSavedItemModal(true);

    const service = new placesLib.PlacesService(map);
    const request = item.place_id ? { placeId: item.place_id } : { query: item.name, location: new window.google.maps.LatLng(Number(item.lat), Number(item.lng)), radius: 50 };

    const fetchDetails = (placeId) => {
      service.getDetails({ placeId, fields: ['name', 'rating', 'user_ratings_total', 'formatted_address', 'geometry', 'photos', 'reviews', 'opening_hours', 'website', 'formatted_phone_number', 'url', 'place_id'] }, (place, status) => {
        setIsFetchingDetails(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) { setDetailedPlace(place); }
        else { alert("無法取得該地點的 Google 評論資訊！"); }
      });
    };

    if (item.place_id) {
       fetchDetails(item.place_id);
    } else {
       service.textSearch(request, (results, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && Array.isArray(results) && results.length > 0) {
             fetchDetails(results[0].place_id);
          } else {
             setIsFetchingDetails(false);
             alert("無法在 Google Maps 上反查到此地標的詳細資訊。");
          }
       });
    }
  };

  const getNextDefaultTime = (dayId) => {
    const list = itinerary[dayId] || [];
    if (list.length === 0) return "10:00";
    const last = list[list.length - 1];
    if (!last.time) return "";
    let travelTime = 30;
    if (last.nextLeg && last.nextLeg.mode !== 'AUTO') travelTime = Number(last.nextLeg.mins) || 30;
    return minsToTime(timeToMins(String(last.time)) + Number(last.stayTime || 0) + travelTime);
  };

  const handleAddExploreToItinerary = (place, position = 'end') => {
    setItinerary(prev => {
      const dayList = [...(prev[safeCurrentDay] || [])];
      const newItem = {
        id: generateId(), name: String(place.name), place_id: String(place.place_id), customName: "", lat: Number(place.geometry.location.lat()), lng: Number(place.geometry.location.lng()),
        address: String(place.formatted_address || place.vicinity || ""), time: getNextDefaultTime(safeCurrentDay), stayTime: "0", memo: `⭐ Google 評價: ${place.rating || '無'}`, tags: ["地圖探索"], nextLeg: { mode: 'AUTO', mins: 30 }
      };

      if (exploreOriginItem && position !== 'end') {
        const idx = dayList.findIndex(p => p.id === exploreOriginItem.id);
        if (idx !== -1) {
          if (position === 'before') {
            newItem.time = dayList[idx].time;
            dayList.splice(idx, 0, newItem);
          } else if (position === 'after') {
            if(dayList[idx].time) {
               let tTime = 15;
               if (dayList[idx].nextLeg && dayList[idx].nextLeg.mode !== 'AUTO') tTime = Number(dayList[idx].nextLeg.mins);
               newItem.time = minsToTime(timeToMins(String(dayList[idx].time)) + Number(dayList[idx].stayTime || 0) + tTime);
            }
            dayList.splice(idx + 1, 0, newItem);
          }
        } else { dayList.push(newItem); }
      } else { dayList.push(newItem); }
      return { ...prev, [safeCurrentDay]: dayList };
    });

    setSelectedExploreItem(null); setDetailedPlace(null); setExploreResults([]); setExploreQuery(""); setExploreOriginItem(null);
    setActiveTab("plan");
    alert(`✅ 已成功將「${place.name}」加入行程！`);
  };

  const handleAddPlaceFromSearch = useCallback((dayId, res, place_id) => {
    setItinerary(prev => ({
      ...prev,
      [dayId]: [...(prev[dayId] || []), {
        id: generateId(), name: String(res.name), place_id: String(place_id), customName: "", lat: Number(res.geometry.location.lat()), lng: Number(res.geometry.location.lng()), address: String(res.formatted_address), time: getNextDefaultTime(dayId), stayTime: "0", memo: "", tags: [], nextLeg: { mode: 'AUTO', mins: 30 }
      }]
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itinerary]);

  if (isLoading || !meta) return <LoadingSpinner t={t} />;

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ backgroundColor: tripThemeColor }} className={`fixed inset-0 flex flex-col font-sans overflow-hidden overscroll-none transition-colors duration-500 w-full max-w-[100vw] ${t.mainText}`}>
          <div className="flex-1 flex overflow-hidden">

            <div className={`flex-col border-r transition-opacity duration-300 backdrop-blur-xl ${t.sidebarBg} ${t.cardBorder} ${activeTab === 'map' ? 'hidden md:flex md:w-2/3 lg:w-1/2' : 'flex w-full md:w-2/3 lg:w-1/2'}`}>
              <div className={`p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-md z-20 shrink-0 border-b backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button onClick={onBack} className={`mr-2 font-bold transition-opacity hover:opacity-70 ${t.subText}`}>◀ 返回</button>
                    <div className="relative w-5 h-5 rounded-full overflow-hidden border border-white/50 shadow-sm cursor-pointer shrink-0 hover:scale-110 transition-transform">
                       <input type="color" value={tripThemeColor} onChange={e => handleColorChange(e.target.value)} className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer border-0 p-0" title="更改顏色" />
                    </div>
                    <h1 className="text-xl font-black text-blue-500 italic truncate max-w-37.5 md:max-w-75 drop-shadow-sm">{String(meta.title)}</h1>
                    {db ? <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span> : null}
                  </div>
                  <p className={`text-[10px] font-bold ${t.subText}`}>📍 {String(meta.destination)} | 🚗 {String(meta.transport)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`hidden md:flex p-1 rounded-lg border shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setActiveTab('plan')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'plan' ? 'bg-blue-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>📋 行程</button>
                    <button onClick={() => setActiveTab('expense')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'expense' ? 'bg-emerald-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>💰 記帳</button>
                    <button onClick={() => setActiveTab('ticket')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'ticket' ? 'bg-amber-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>🎟️ 票券</button>
                  </div>
                  <button onClick={handleShareLink} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold transition-transform active:scale-95 shadow-md">
                    🔗 共編
                  </button>
                </div>
              </div>

              <div onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollBy(Number(e.deltaY), 0); }} className={`flex-1 overflow-x-auto p-4 gap-4 items-start scroll-smooth ${activeTab === 'plan' ? 'flex' : 'hidden'}`}>
                {[].concat(existingDays || []).map(dayId => {
                  const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
                  const isCurrent = safeCurrentDay === dayId;
                  const dayTheme = meta.dayThemes?.[dayId] || "";

                  return (
                    <div key={String(dayId)} onClick={() => setCurrentDay(dayId)} className={`min-w-85 md:min-w-85 flex flex-col max-h-full rounded-3xl p-4 border-2 transition-all backdrop-blur-md ${isCurrent ? `border-blue-500 ${t.cardBg} shadow-lg` : `${t.cardBorder} hover:border-blue-300/50 ${t.expenseBlockBg}`}`}>
                      <div className="flex flex-col gap-1 mb-3 group cursor-pointer" onClick={() => handleDayThemeUpdate(dayId)}>
                        <div className="flex items-center gap-2">
                           <h2 className={`text-lg font-black truncate ${t.mainText}`}>
                             {String(title)}
                             {dayTheme ? <span className="text-blue-500 ml-2">- {dayTheme}</span> : <span className={`text-[10px] font-normal opacity-40 ml-2 border border-dashed rounded px-1.5 py-0.5 border-current transition-opacity group-hover:opacity-100 ${t.mainText}`}>＋ 新增主題</span>}
                           </h2>
                           <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                        </div>
                        {dateStr ? <span className={`text-[10px] font-bold ${t.subText}`}>{String(dateStr)}</span> : null}
                      </div>

                      <SearchBox dayId={dayId} onAddPlace={handleAddPlaceFromSearch} t={t} />

                      <Droppable droppableId={String(dayId)}>
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto min-h-37.5 pb-6 scrollbar-hide">
                            {[].concat(itinerary[dayId] || []).map((item, index) => {
                              const displayName = item.customName || item.name;
                              const isCustomName = !!item.customName;
                              return (
                              <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                                {(prov, snap) => (
                                  <div ref={prov.innerRef} {...prov.draggableProps} className={`transition-all relative group mb-1 ${snap.isDragging ? 'z-50 scale-105 touch-none' : ''}`}>

                                    <div className={`p-4 rounded-2xl border flex flex-col backdrop-blur-md transition-all relative overflow-hidden ${snap.isDragging ? 'bg-blue-600 border-white shadow-2xl text-white' : `${t.itemBg} ${t.cardBorder} shadow-sm ${t.itemHover}`}`}>
                                      <div className="flex gap-4 items-start">
                                        <div {...prov.dragHandleProps} className="flex flex-col items-center shrink-0 w-10 cursor-grab active:cursor-grabbing hover:opacity-80">
                                           <div className={`text-xs font-black p-1.5 rounded-full w-7 h-7 flex items-center justify-center ${snap.isDragging ? 'bg-white/20 text-white' : 'bg-blue-500 text-white shadow-md'}`}>
                                              {index + 1}
                                           </div>
                                           {item.time ? <span className={`text-[10px] font-bold mt-1.5 ${snap.isDragging ? 'text-white' : t.mainText}`}>{String(item.time)}</span> : null}
                                           <span className="text-slate-400 mt-2 text-[10px]">≡</span>
                                        </div>

                                        <div className="flex-1 min-w-0 pr-2">
                                          <div className="flex justify-between items-start gap-2">
                                            <h3
                                              className={`font-bold text-sm truncate cursor-pointer hover:text-blue-500 transition-colors ${snap.isDragging ? 'text-white' : t.mainText}`}
                                              onClick={(e) => { e.stopPropagation(); handleSavedItemDetails(item); }}
                                              title="點擊查看詳細資訊與照片"
                                            >
                                              {String(displayName)}
                                              {isCustomName ? <span className="text-[10px] ml-1.5 font-normal opacity-60">({String(item.name)})</span> : null}
                                            </h3>
                                            {item.memo ? (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setViewingMemoItem(item); }}
                                                className={`shrink-0 px-2 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 shadow-sm font-bold text-[10px] ${snap.isDragging ? 'bg-white/20 border-white/40 text-white' : 'bg-amber-100 border-amber-300 text-amber-700'}`}
                                                title="點擊查看筆記內容"
                                              >
                                                <span>📝</span> 附筆記
                                              </button>
                                            ) : null}
                                          </div>
                                          {item.stayTime !== undefined ? <p className={`text-[10px] mt-0.5 font-bold ${item.stayTime === "0" || item.stayTime === 0 ? 'text-blue-500' : t.subText}`}>{formatStayTime(item.stayTime)}</p> : null}
                                          <div className="flex flex-wrap gap-1.5 mt-2">
                                            {[].concat(item.tags || []).map((tag, idx) => <span key={`tag-${idx}`} className={`text-[9px] px-2 py-0.5 rounded-md border ${snap.isDragging ? 'bg-white/10 border-white/20 text-white' : 'bg-blue-500/10 border-blue-500/20 text-blue-600'}`}>{String(tag)}</span>)}
                                          </div>
                                        </div>
                                      </div>

                                      <div className={`mt-3 pt-3 border-t flex items-center gap-4 transition-all duration-300 ${snap.isDragging ? 'border-white/20' : t.cardBorder} flex md:max-h-0 md:opacity-0 md:group-hover:max-h-14 md:group-hover:opacity-100 max-h-14 opacity-100`}>
                                        <button onClick={() => setEditingItemData({ dayId, item })} className={`flex items-center gap-1 text-[11px] font-bold hover:text-blue-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>✏️ 編輯</button>
                                        <button onClick={() => handleSearchNearby(item)} className={`flex items-center gap-1 text-[11px] font-bold hover:text-orange-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>🔍 周邊</button>
                                        <button onClick={() => setCopyingItem(item)} className={`flex items-center gap-1 text-[11px] font-bold hover:text-purple-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>📋 複製到...</button>
                                        <div className="flex-1"></div>
                                        <button onClick={() => { if (window.confirm('確定刪除此景點？')) { setItinerary(prev => ({...prev, [dayId]: prev[dayId].filter(p => p.id !== item.id)})); } }} className={`text-[11px] hover:text-red-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>刪除</button>
                                      </div>
                                    </div>

                                    {!snap.isDragging && index < itinerary[dayId].length - 1 && routeDurations[dayId]?.[index] ? (
                                      <div className="flex items-center -mt-1 mb-1 ml-6 relative z-10 h-7 border-l-2 border-dashed border-slate-500/30 pl-6 cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => setEditingItemData({ dayId, item })} title="點擊編輯交通方式">
                                         <span className={`text-[10px] font-bold ${routeDurations[dayId][index].mode === 'ERROR' ? 'text-red-500' : 'text-slate-500'} bg-transparent flex items-center gap-1`}>
                                           {routeDurations[dayId][index].mode === 'FLIGHT' ? '✈️ 飛行' :
                                            routeDurations[dayId][index].mode === 'TRAIN' ? '🚅 鐵路' :
                                            routeDurations[dayId][index].mode === 'TRANSIT' ? '🚇 捷運' :
                                            routeDurations[dayId][index].mode === 'WALK' ? '🚶 步行' :
                                            routeDurations[dayId][index].mode === 'ERROR' ? '⚠️ 無法計算' : '🚗 車程'}
                                           {String(routeDurations[dayId][index].text)}
                                         </span>
                                      </div>
                                    ) : null}

                                  </div>
                                )}
                              </Draggable>
                            );})}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>

              <div className={`flex-1 flex-col overflow-y-auto backdrop-blur-xl ${t.sidebarBg} ${activeTab === 'expense' ? 'flex' : 'hidden'}`}>
                <div className={`p-6 border-b sticky top-0 z-10 shadow-lg backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
                  <div className="flex justify-between items-center mb-2">
                    <p className={`text-xs font-bold uppercase tracking-widest ${t.subText}`}>旅程總花費</p>
                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${t.inputBg} ${t.cardBorder}`}>
                      <span className={`text-[10px] ${t.subText}`}>總預算 $</span>
                      <input type="number" value={String(budget)} onChange={e => setBudget(Number(e.target.value) || 0)} className={`bg-transparent text-base w-20 outline-none font-bold text-right ${t.mainText}`} />
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <h2 className={`text-4xl font-black transition-colors ${expenseStats.isOverBudget ? 'text-red-500' : t.mainText}`}>$ {expenseStats.totalExpense.toLocaleString()}</h2>
                    <button onClick={() => setShowExpenseModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all">
                      ➕ 新增記帳
                    </button>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-[10px] mb-1.5 font-bold ${t.subText}`}><span>目前花費 {expenseStats.budgetPercent.toFixed(1)}%</span><span className={expenseStats.isOverBudget ? 'text-red-500' : 'text-emerald-500'}>{expenseStats.isOverBudget ? `超支 $${(expenseStats.totalExpense - budget).toLocaleString()}!` : `剩餘 $${(budget - expenseStats.totalExpense).toLocaleString()}`}</span></div>
                    <div className={`flex w-full h-3 rounded-full overflow-hidden border ${t.cardBg} ${t.cardBorder}`}>
                      {expenseStats.totalExpense === 0 ? null : expenseStats.isOverBudget ? <div className="bg-red-500 h-full w-full animate-pulse"></div> : (
                        <div style={{ width: `${expenseStats.budgetPercent}%` }} className="bg-blue-500 h-full transition-all duration-500"></div>
                      )}
                    </div>
                  </div>
                  <div className={`flex p-1.5 rounded-xl border mt-6 shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setExpenseView('list')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${expenseView === 'list' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}>📜 歷史明細</button>
                    <button onClick={() => setExpenseView('settle')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${expenseView === 'settle' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}>⚖️ 分帳結算表</button>
                  </div>
                </div>

                <div className="p-4 pb-24">
                  {expenseView === 'list' ? (
                    <div className="space-y-6">
                      {expenseStats.groupedExpenses.map(({ day, items }) => {
                        if (!Array.isArray(items) || items.length === 0) return null;
                        const { title, dateStr } = getDayDisplay(day, meta.startDate);
                        return (
                          <div key={String(day)} className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                            <div className="flex justify-between items-center mb-4">
                              <h3 className={`font-bold ${t.mainText}`}>{String(title)} <span className={`text-xs font-normal ml-1 ${t.subText}`}>{String(dateStr)}</span></h3>
                              <span className="text-xs text-emerald-500 font-mono font-bold">${items.reduce((a,b)=>a+(Number(b.cost)||0),0).toLocaleString()}</span>
                            </div>
                            <div className="space-y-2.5">
                              {items.map(e => {
                                const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[5];
                                return (
                                  <div key={String(e.id)} className={`flex justify-between items-center p-3 rounded-2xl border transition-colors ${t.itemBg} ${t.cardBorder} hover:opacity-80`}>
                                    <div className="flex items-center gap-3">
                                      <span className={`w-9 h-9 ${cat.color} text-white rounded-full flex items-center justify-center text-sm shadow-inner`}>{cat.icon}</span>
                                      <div>
                                        <p className={`text-sm font-bold ${t.mainText}`}>{String(e.item)}</p>
                                        <p className={`text-[10px] font-bold ${t.subText}`}>{cat.label} • <span className="text-blue-500">{String(e.payer)}</span> 先付</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className={`font-mono font-bold ${t.mainText}`}>${(Number(e.cost)||0).toLocaleString()}</span>
                                      <button onClick={() => { if(window.confirm('刪除這筆帳款？')) setExpenses(expenses.filter(x => x.id !== e.id)); }} className={`p-1 transition-colors hover:text-red-500 ${t.subText}`}>🗑️</button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      {(!Array.isArray(expenses) || expenses.length === 0) ? <p className={`text-center mt-10 font-bold ${t.subText}`}>尚無記帳紀錄</p> : null}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                        <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${t.mainText}`}>👤 各自收支總覽</h3>
                        <div className="space-y-3">
                          {Object.entries(expenseStats.balances).map(([member, balance]) => {
                            const isPositive = balance > 0.01;
                            const isNegative = balance < -0.01;
                            return (
                              <div key={String(member)} className={`flex justify-between items-center p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                                <span className={`font-bold ${t.mainText}`}>{String(member)}</span>
                                {isPositive ? (
                                  <span className="text-emerald-500 font-mono font-bold">應收回 +${balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
                                ) : isNegative ? (
                                  <span className="text-red-500 font-mono font-bold">須支付 -${Math.abs(balance).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
                                ) : (
                                  <span className={`font-mono font-bold ${t.subText}`}>已結清 $0</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                        <h3 className="text-sm font-bold text-blue-500 mb-4 flex items-center gap-2">🤖 AI 建議轉帳方案</h3>
                        {Array.isArray(expenseStats.transfers) && expenseStats.transfers.length > 0 ? (
                          <div className="space-y-3">
                            {expenseStats.transfers.map((tItem, idx) => (
                              <div key={`transfer-${idx}`} className={`flex justify-between items-center p-4 rounded-xl border ${t.isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-500/30'}`}>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-red-500">{String(tItem.from)}</span>
                                  <span className={`text-xs ${t.subText}`}>➡️ 轉給 ➡️</span>
                                  <span className="font-bold text-emerald-500">{String(tItem.to)}</span>
                                </div>
                                <span className={`font-mono font-black text-lg ${t.mainText}`}>${Math.round(Number(tItem.amount)).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className={`text-center py-4 font-bold ${t.subText}`}>目前沒有需要結算的款項 🎉</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className={`flex-1 flex-col overflow-y-auto backdrop-blur-xl ${t.sidebarBg} ${activeTab === 'ticket' ? 'flex' : 'hidden'}`}>
                <div className={`p-6 border-b sticky top-0 z-10 shadow-lg backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-widest ${t.subText}`}>隨身協作大廳</p>
                      <h2 className={`text-2xl font-black mt-1 ${t.mainText}`}>共同票券夾 🎟️</h2>
                    </div>
                    <button onClick={() => setShowTicketModal(true)} className="bg-amber-600 hover:bg-amber-500 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-amber-500/30 active:scale-95 transition-all">
                      ➕ 新增票券
                    </button>
                  </div>
                </div>
                <div className="p-4 pb-24 space-y-4">
                  {!Array.isArray(tickets) || tickets.length === 0 ? (
                    <div className="flex flex-col items-center justify-center mt-20 opacity-60">
                      <span className="text-6xl mb-4">🎟️</span>
                      <p className={`font-bold ${t.mainText}`}>共用票券夾尚未加入資料</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {tickets.map(ticket => (
                        <div key={String(ticket.id)} className={`relative flex flex-col p-4 rounded-3xl border shadow-sm transition-transform hover:-translate-y-1 ${t.itemBg} ${t.cardBorder}`}>
                          <button onClick={() => { if(window.confirm('確定刪除？')) setTickets(prev => prev.filter(x => x.id !== ticket.id)); }} className="absolute top-3 right-3 w-7 h-7 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">✕</button>
                          <div className="mb-2"><span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${ticket.owner === '所有人' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-purple-500/10 text-purple-600 border-purple-500/20'}`}>👤 {String(ticket.owner || '所有人')}</span></div>
                          <div className="flex items-center gap-3 mb-4 mt-2">
                             <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 border border-amber-500/30 flex items-center justify-center text-lg shrink-0">
                               {ticket.type === 'image' ? '📸' : ticket.type === 'pdf' ? '📄' : '🔗'}
                             </div>
                             <div className="flex-1 pr-6">
                               <h3 className={`font-bold text-sm line-clamp-2 ${t.mainText}`}>{String(ticket.title)}</h3>
                               {ticket.memo ? <p className={`text-[10px] mt-1 ${t.subText}`}>{String(ticket.memo)}</p> : null}
                             </div>
                          </div>
                          {ticket.type === 'image' ? (
                            <button onClick={() => setFullscreenTicket(ticket)} className="w-full bg-slate-900 text-white font-bold text-xs py-3 rounded-xl shadow-md border border-slate-700 hover:bg-slate-800 transition-colors">🔍 全螢幕驗票模式</button>
                          ) : ticket.type === 'pdf' ? (
                            <button onClick={() => window.open(safeUrlFormatter(ticket.url), '_blank')} className="w-full bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow-md border border-emerald-500 hover:bg-emerald-500 transition-colors">📄 開啟 PDF 文件檔案</button>
                          ) : (
                            <button onClick={() => window.open(safeUrlFormatter(ticket.url), '_blank')} className="w-full bg-blue-600 text-white font-bold text-xs py-3 rounded-xl shadow-md border border-blue-500 hover:bg-blue-500 transition-colors">🌐 開啟數位網址連結</button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* 地圖區塊 */}
            <div className={`relative flex-1 transition-opacity duration-300 ease-in-out ${activeTab === 'map' ? 'flex' : 'hidden md:flex'}`}>
              <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-125 z-20 flex flex-col gap-2">
                <div className={`flex items-center gap-2 p-2 rounded-2xl shadow-lg backdrop-blur-xl border ${t.headerBg} ${t.cardBorder}`}>
                  <input value={String(exploreQuery)} onChange={e => setExploreQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleExploreSearch(exploreQuery, null); }} placeholder="探索周邊美食地標..." className={`flex-1 bg-transparent px-2 outline-none text-sm font-bold ${t.mainText} placeholder:opacity-50`} />
                  <button onClick={() => handleExploreSearch(exploreQuery, null)} className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 whitespace-nowrap">🍽️ 探索</button>
                  {[].concat(exploreResults || []).length > 0 ? (
                    <button onClick={() => {setExploreResults([]); setSelectedExploreItem(null); setExploreQuery(""); setExploreOriginItem(null);}} className={`px-2 py-2 text-xs font-bold hover:text-red-500 transition-colors ${t.subText}`}>清除</button>
                  ) : null}
                </div>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1">
                   <button onClick={() => handleExploreSearch("餐廳", null)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border shadow-sm transition-transform active:scale-95 whitespace-nowrap ${t.cardBg} ${t.cardBorder} ${t.mainText} hover:border-orange-400`}>🍔 餐廳美食</button>
                   <button onClick={() => handleExploreSearch("咖啡廳", null)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border shadow-sm transition-transform active:scale-95 whitespace-nowrap ${t.cardBg} ${t.cardBorder} ${t.mainText} hover:border-orange-400`}>☕ 咖啡廳</button>
                   <button onClick={() => handleExploreSearch("超市", null)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border shadow-sm transition-transform active:scale-95 whitespace-nowrap ${t.cardBg} ${t.cardBorder} ${t.mainText} hover:border-orange-400`}>🛒 超市</button>
                   <button onClick={() => handleExploreSearch("停車場", null)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold border shadow-sm transition-transform active:scale-95 whitespace-nowrap ${t.cardBg} ${t.cardBorder} ${t.mainText} hover:border-orange-400`}>🅿️ 停車場</button>
                </div>
              </div>
              <Map id="main-map" defaultCenter={{lat: 22.99, lng: 120.20}} defaultZoom={13} mapId={'739af384c474cc02'}>
                <Directions itinerary={itinerary} dayId={safeCurrentDay} onRouteCalculated={handleRouteCalculated} />
                {[].concat(itinerary[safeCurrentDay] || []).map((item, idx) => (
                  <AdvancedMarker key={String(item.id)} position={{lat: Number(item.lat), lng: Number(item.lng)}} onClick={() => handleSavedItemDetails(item)}>
                    <Pin background={'#3b82f6'} glyphText={String(idx + 1)} />
                  </AdvancedMarker>
                ))}
                {[].concat(exploreResults || []).map((place) => {
                  const expStyle = getExploreIcon(exploreQuery);
                  return (
                    <AdvancedMarker key={String(place.place_id)} position={{lat: Number(place.geometry.location.lat()), lng: Number(place.geometry.location.lng())}} onClick={() => setSelectedExploreItem(place)}>
                      <Pin background={expStyle.bg} borderColor={expStyle.border} glyphColor={'#fff'} glyphText={expStyle.text} />
                    </AdvancedMarker>
                  );
                })}
              </Map>
            </div>
          </div>

          <div style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }} className={`grid grid-cols-4 border-t h-20 shrink-0 z-30 shadow-lg md:hidden ${t.headerBg} ${t.cardBorder}`}>
            <button onClick={() => setActiveTab("plan")} className={`flex flex-col items-center justify-center pt-2 transition-all ${activeTab === "plan" ? "text-blue-500 font-bold -translate-y-1" : t.subText}`}>📋<span className="text-[10px] mt-1 font-bold">行程</span></button>
            <button onClick={() => setActiveTab("map")} className={`flex flex-col items-center justify-center pt-2 transition-all ${activeTab === "map" ? "text-blue-500 font-bold -translate-y-1" : t.subText}`}>🗺️<span className="text-[10px] mt-1 font-bold">地圖</span></button>
            <button onClick={() => setActiveTab("ticket")} className={`flex flex-col items-center justify-center pt-2 transition-all ${activeTab === "ticket" ? "text-amber-500 font-bold -translate-y-1" : t.subText}`}>🎟️<span className="text-[10px] mt-1 font-bold">票券</span></button>
            <button onClick={() => setActiveTab("expense")} className={`flex flex-col items-center justify-center pt-2 transition-all ${activeTab === "expense" ? "text-emerald-500 font-bold -translate-y-1" : t.subText}`}>💰<span className="text-[10px] mt-1 font-bold">記帳</span></button>
          </div>
        </div>
      </DragDropContext>

      {/* 🌟 彈窗掛載區 (全數提升至 Root，避免手機版隱藏分頁時被 display none) */}
      {selectedExploreItem && !detailedPlace ? (
        <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-100 p-5 rounded-3xl shadow-2xl border backdrop-blur-2xl bg-white/95 animate-in slide-in-from-bottom-10" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-base font-black text-slate-900 leading-tight pr-4">{String(selectedExploreItem.name)}</h3>
            <button onClick={() => setSelectedExploreItem(null)} className="text-xl text-slate-400 hover:text-red-500 font-bold -mt-1 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100">✕</button>
          </div>
          <p className="text-[11px] mb-3 truncate text-slate-600">{String(selectedExploreItem.formatted_address || selectedExploreItem.vicinity)}</p>
          <div className="flex items-center gap-3 mb-4">
            {selectedExploreItem.rating ? <span className="bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md text-[11px] font-bold border border-orange-500/20">⭐ {String(selectedExploreItem.rating)}</span> : null}
            {selectedExploreItem.user_ratings_total ? <span className="text-[10px] font-bold text-slate-500">({String(selectedExploreItem.user_ratings_total)} 則評論)</span> : null}
          </div>
          <button onClick={() => handleShowDetails(selectedExploreItem.place_id)} className="w-full py-2.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 shadow-sm transition-colors">📖 查看詳情與實景照</button>
          {exploreOriginItem ? (
            <div className="flex gap-2 mt-2">
              <button onClick={() => handleAddExploreToItinerary(selectedExploreItem, 'before')} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-md active:scale-95">加在前面</button>
              <button onClick={() => handleAddExploreToItinerary(selectedExploreItem, 'after')} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-md active:scale-95">加在後面</button>
            </div>
          ) : (
            <button onClick={() => handleAddExploreToItinerary(selectedExploreItem, 'end')} className="w-full mt-2 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95">加入行程最後</button>
          )}
        </div>
      ) : null}

      {detailedPlace ? <PlaceDetailsModal place={detailedPlace} onClose={() => setDetailedPlace(null)} onAdd={isSavedItemModal ? null : (place, pos) => { setDetailedPlace(null); handleAddExploreToItinerary(place, pos); }} exploreOriginItem={exploreOriginItem} dayTitle={getDayDisplay(safeCurrentDay, meta.startDate).title} t={t} isFetching={isFetchingDetails} /> : null}

      {viewingMemoItem ? <MemoViewModal item={viewingMemoItem} onClose={() => setViewingMemoItem(null)} t={t} /> : null}
      {editingItemData ? <EditItemModal item={editingItemData.item} onSave={saveEditedItem} onClose={() => setEditingItemData(null)} t={t} /> : null}
      {copyingItem ? <CopyItemModal item={copyingItem} existingDays={existingDays} onClose={() => setCopyingItem(null)} onCopy={handleCopyItem} t={t} /> : null}
      {showExpenseModal ? <ExpenseModal members={membersList} existingDays={existingDays} startDate={meta.startDate} defaultDay={existingDays[0] || "Day 1"} onClose={() => setShowExpenseModal(false)} onSave={(newExpense) => { setExpenses(prev => [...prev, newExpense]); setShowExpenseModal(false); }} t={t} /> : null}
      {showTicketModal ? <TicketModal members={membersList} onClose={() => setShowTicketModal(false)} onSave={(newTicket) => { setTickets(prev => [...prev, newTicket]); setShowTicketModal(false); }} t={t} /> : null}
      {fullscreenTicket ? <FullscreenTicketModal ticket={fullscreenTicket} onClose={() => setFullscreenTicket(null)} /> : null}
    </>
  );
};

// ============================================================================
// (8) 核心視圖：首頁大廳 (TravelApp)
// ============================================================================
export default function TravelApp() {
  const [myTrips, setMyTrips] = useState(() => { try { const stored = JSON.parse(localStorage.getItem('google-travel-my-trips')); return Array.isArray(stored) ? stored : []; } catch { return []; } });
  const [customBgColor, setCustomBgColor] = useState(() => { try { return localStorage.getItem('google-travel-custom-bg') || '#d8b4e2'; } catch { return '#d8b4e2'; } });
  const [showUpdateNote, setShowUpdateNote] = useState(() => { try { return localStorage.getItem('google-travel-version') !== APP_VERSION; } catch { return false; } });

  const [tripModalMode, setTripModalMode] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState("");

  const [newTitle, setNewTitle] = useState(""); const [newDest, setNewDest] = useState("");
  const [newStart, setNewStart] = useState(""); const [newEnd, setNewEnd] = useState("");
  const [newMembers, setNewMembers] = useState(["自己"]); const [newTransport, setNewTransport] = useState("汽車 🚗");
  const [newThemeColor, setNewThemeColor] = useState("#3b82f6");

  const [showAddMember, setShowAddMember] = useState(false); const [tempMember, setTempMember] = useState("");
  const [activeRoomId, setActiveRoomId] = useState(() => { if (typeof window !== 'undefined') return new URLSearchParams(window.location.search).get('room') || null; return null; });

  useEffect(() => {
    if (showUpdateNote) {
      try { localStorage.setItem('google-travel-version', APP_VERSION); } catch { /* ignore */ }
    }
  }, [showUpdateNote]);

  useEffect(() => { localStorage.setItem('google-travel-my-trips', JSON.stringify(myTrips)); }, [myTrips]);
  useEffect(() => { localStorage.setItem('google-travel-custom-bg', customBgColor); }, [customBgColor]);

  const handleUpdateTripMeta = useCallback((roomId, meta) => {
    setMyTrips(prev => {
      const exists = prev.find(t => t.roomId === roomId);
      if (exists) { if (JSON.stringify(exists) !== JSON.stringify({ ...meta, roomId })) return prev.map(t => t.roomId === roomId ? { ...meta, roomId } : t); return prev; }
      return [...prev, { ...meta, roomId }];
    });
  }, []);

  const handleImportTrip = () => {
    const rawInput = String(importInput).trim(); if (!rawInput) return;
    let targetRoomId = rawInput.includes("?room=") ? (new URLSearchParams(rawInput.split('?')[1]).get('room') || rawInput) : rawInput;
    if (!db) return alert("⚠️ 尚未連結 Firebase 雲端！");

    onValue(dbRef(db, `rooms/${targetRoomId}/meta`), (snapshot) => {
      const remoteMeta = snapshot.val();
      if (remoteMeta) {
        setMyTrips(prev => { if (prev.find(t => t.roomId === targetRoomId)) return prev; return [...prev, { ...remoteMeta, roomId: targetRoomId }]; });
        setShowImportModal(false); setImportInput(""); alert(`🎉 成功同步雲端旅程：${remoteMeta.title}！`);
      } else { alert("❌ 找不到該旅程！"); }
    }, { onlyOnce: true });
  };

  const openCreateModal = () => {
    setNewTitle(""); setNewDest(""); setNewStart(""); setNewEnd(""); setNewMembers(["自己"]); setNewTransport("汽車 🚗"); setNewThemeColor("#3b82f6");
    setTripModalMode('create');
  };

  const openEditModal = (e, trip) => {
    e.stopPropagation();
    setNewTitle(trip.title); setNewDest(trip.destination); setNewStart(trip.startDate); setNewEnd(trip.endDate);
    setNewMembers(Array.isArray(trip.members) ? trip.members : ["自己"]); setNewTransport(trip.transport || "汽車 🚗"); setNewThemeColor(trip.themeColor || "#3b82f6");
    setTripModalMode(trip.roomId);
  };

  const handleSaveTripModal = () => {
    if (!String(newTitle).trim() || !newStart || !newEnd) return alert("請填寫完整的名稱與日期區間！");
    const d1 = new Date(String(newStart)); const d2 = new Date(String(newEnd));
    const diffDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 1 || diffDays > 30) return alert("日期錯誤或天數過長！");

    const newMeta = { title: String(newTitle).trim(), destination: String(newDest), startDate: String(newStart), endDate: String(newEnd), members: newMembers, transport: String(newTransport), themeColor: String(newThemeColor) };

    if (tripModalMode === 'create') {
      const newRoomId = generateId();
      if (db) void set(dbRef(db, `rooms/${newRoomId}`), { meta: newMeta, itinerary: { "Day 1": [] }, expenses: [], tickets: [], budget: 10000 }).catch(() => {});
      setMyTrips(prev => [...prev, { ...newMeta, roomId: newRoomId }]); setTripModalMode(null); setActiveRoomId(newRoomId);
    } else {
      const roomId = tripModalMode;
      if (db) { onValue(dbRef(db, `rooms/${roomId}/meta/dayThemes`), (snapshot) => { const currentThemes = snapshot.val() || {}; void set(dbRef(db, `rooms/${roomId}/meta`), { ...newMeta, dayThemes: currentThemes }).catch(() => {}); }, { onlyOnce: true }); }
      setMyTrips(prev => prev.map(t => t.roomId === roomId ? { ...newMeta, roomId } : t)); setTripModalMode(null);
    }
  };

  const closeTrip = () => { window.history.pushState(null, '', window.location.pathname); setActiveRoomId(null); };

  const t = getThemeClasses(customBgColor);
  if (activeRoomId) return <APIProvider apiKey={API_KEY}><TripDetail roomId={activeRoomId} onBack={closeTrip} onUpdateTripMeta={handleUpdateTripMeta} /></APIProvider>;

  return (
    <div style={{ backgroundColor: customBgColor }} className={`fixed inset-0 flex flex-col font-sans overflow-x-hidden overscroll-none transition-colors duration-500 w-full max-w-[100vw] ${t.mainText}`}>
      <div className="max-w-5xl w-full mx-auto p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-linear-to-br from-blue-500 to-emerald-500 text-white p-2.5 rounded-2xl shadow-lg transform -rotate-12 hover:rotate-0 transition-transform cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-emerald-400 tracking-tight">智の旅行</h1>
            </div>
            <p className={`font-bold tracking-wide ${t.subText}`}>你的專屬旅程管理中心</p>
          </div>
          <div className="w-full md:w-auto flex flex-row items-center justify-between md:justify-end gap-3">
            <div className={`flex items-center gap-3 p-1.5 pr-4 rounded-full border shadow-sm backdrop-blur-md ${t.isLight ? 'bg-white/50 border-slate-200' : 'bg-black/20 border-white/10'}`}>
              <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform"><input type="color" value={String(customBgColor)} onChange={e => setCustomBgColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" title="選擇主頁背景色" /></div>
              <span className={`text-xs font-bold ${t.subText}`}>自訂大廳色</span>
            </div>
            <button onClick={() => setShowImportModal(true)} className="bg-slate-500/20 border border-slate-500/30 text-sm font-bold px-4 py-3 rounded-2xl transition-transform active:scale-95">📥 匯入</button>
            <button onClick={() => openCreateModal()} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-2xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"><span>➕</span> <span>新增</span></button>
          </div>
        </header>

        {(!Array.isArray(myTrips) || myTrips.length === 0) ? (
          <div className="flex flex-col items-center justify-center mt-24 opacity-80"><span className="text-7xl mb-6">🌍</span><p className={`text-xl font-bold mb-2 ${t.mainText}`}>目前還沒有任何旅程</p></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myTrips.map(trip => {
              const cardColor = String(trip.themeColor || '#1e293b'); const cTheme = getThemeClasses(cardColor);
              return (
                <div key={String(trip.roomId)} onClick={() => { window.history.pushState(null, '', `?room=${trip.roomId}`); setActiveRoomId(trip.roomId); }} style={{ backgroundColor: cardColor }} className={`border rounded-3xl p-6 cursor-pointer transition-all duration-300 group shadow-xl hover:-translate-y-1 hover:shadow-2xl ${cTheme.cardBorder}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${cTheme.isLight ? 'bg-black/5 border-black/10 text-slate-700' : 'bg-white/20 border-white/30 text-white'}`}>{String(trip.transport)}</span>
                    <div className="flex gap-2">
                      <button onClick={(e) => openEditModal(e, trip)} className={`text-xs p-1 transition-colors hover:text-blue-500 ${cTheme.subText}`}>⚙️ 編輯</button>
                      <button onClick={(e) => { e.stopPropagation(); if(window.confirm('確定從大廳移除此捷徑？(雲端資料不會刪除)')) setMyTrips(prev => prev.filter(item => item.roomId !== trip.roomId)); }} className={`text-xs p-1 transition-colors hover:text-red-500 ${cTheme.subText}`}>移除</button>
                    </div>
                  </div>
                  <h2 className={`text-2xl font-black mb-1.5 transition-colors line-clamp-2 ${cTheme.mainText}`}>{String(trip.title)}</h2>
                  <p className={`text-sm font-bold mb-5 truncate ${cTheme.subText}`}>📍 {String(trip.destination || '未定地點')}</p>
                  <div className={`p-3.5 rounded-xl border ${cTheme.cardMetaBg} ${cTheme.cardBorder}`}>
                    <p className={`text-xs mb-1.5 font-medium ${cTheme.subText}`}>📅 {String(trip.startDate || '').replace(/-/g, '/')} <span className="mx-1 opacity-50">→</span> {String(trip.endDate || '').replace(/-/g, '/')}</p>
                    <p className={`text-xs truncate font-medium ${cTheme.subText}`}>👥 {Array.isArray(trip.members) ? trip.members.join(', ') : '自己'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showImportModal && (
        <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden w-full max-w-[100vw]" onClick={() => setShowImportModal(false)}>
          <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
            <h2 className={`text-xl font-black mb-2 ${t.mainText}`}>📥 匯入雲端行程</h2>
            <input value={String(importInput)} onChange={e => setImportInput(e.target.value)} placeholder="貼上網址或房間 ID..." className={`w-full p-3 rounded-xl outline-none border mb-6 text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            <div className="flex justify-end gap-3"><button onClick={() => setShowImportModal(false)} className={`px-4 py-2 text-sm font-bold ${t.subText}`}>取消</button><button onClick={handleImportTrip} className="bg-blue-600 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md">確認匯入</button></div>
          </div>
        </div>
      )}

      {tripModalMode && (
        <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden w-full max-w-[100vw]" onClick={() => setTripModalMode(null)}>
          <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl overflow-y-auto overflow-x-hidden max-h-[90vh] ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
            <h2 className={`text-2xl font-black mb-6 ${t.mainText}`}>{tripModalMode === 'create' ? '建立新旅程 🛫' : '編輯旅程設定 ⚙️'}</h2>
            <div className="space-y-5">
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅程專屬顏色</label>
                <div className={`flex items-center gap-3 p-2 rounded-xl border ${t.inputBg} ${t.cardBorder}`}>
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white"><input type="color" value={String(newThemeColor)} onChange={e => setNewThemeColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" /></div>
                  <span className={`text-sm font-bold ${t.mainText}`}>{String(newThemeColor).toUpperCase()}</span>
                </div>
              </div>
              <div><label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅程名稱 *</label><input value={String(newTitle)} onChange={e => setNewTitle(e.target.value)} placeholder="ex: 瘋狂沖繩遊" className={`w-full p-3.5 rounded-xl border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} /></div>
              <div><label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>主要地點</label><input value={String(newDest)} onChange={e => setNewDest(e.target.value)} placeholder="ex: 日本大阪" className={`w-full p-3.5 rounded-xl border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} /></div>
              <div><label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅行日期 *</label><div onClick={() => setShowDatePicker(true)} className={`w-full p-3.5 rounded-xl border flex justify-between items-center cursor-pointer ${t.inputBg} ${t.cardBorder} ${t.mainText}`}><span>{newStart && newEnd ? `${String(newStart)} 至 ${String(newEnd)}` : '點擊選擇出發與回程日期'}</span><span>📅</span></div></div>
              <div>
                <label className={`block text-xs font-bold mb-2 uppercase ${t.subText}`}>同行成員 (記帳用)</label>
                <div className={`flex flex-wrap gap-2 items-center p-3 rounded-xl border min-h-14 ${t.inputBg} ${t.cardBorder}`}>
                  {([].concat(newMembers || [])).map((m, idx) => (
                    <span key={`mem-${idx}`} className="bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-blue-500/20 shadow-sm">
                      {String(m)}
                      <button onClick={() => setNewMembers(newMembers.filter(name => name !== m))} className="hover:text-red-400 transition-colors">✕</button>
                    </span>
                  ))}
                  {showAddMember ? (
                    <div className={`flex items-center gap-1.5 p-1.5 rounded-lg border border-blue-500 shadow-inner ${t.cardMetaBg}`}>
                      <input autoFocus value={String(tempMember)} onChange={e => setTempMember(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && String(tempMember).trim()) { if (!newMembers.includes(String(tempMember).trim())) setNewMembers([...newMembers, String(tempMember).trim()]); setTempMember(""); setShowAddMember(false); } }} placeholder="名稱..." className={`bg-transparent text-base md:text-sm outline-none w-20 px-2 ${t.mainText}`} />
                      <button onClick={() => { if (String(tempMember).trim() && !newMembers.includes(String(tempMember).trim())) setNewMembers([...newMembers, String(tempMember).trim()]); setTempMember(""); setShowAddMember(false); }} className="bg-blue-600 text-white rounded p-1 text-xs">✓</button>
                      <button onClick={() => setShowAddMember(false)} className={`hover:opacity-70 p-1 text-xs transition-opacity ${t.subText}`}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddMember(true)} className={`px-3 py-1.5 rounded-lg text-sm font-bold border border-dashed transition-opacity opacity-70 hover:opacity-100 ${t.subText} ${t.cardBorder}`}>➕ 新增</button>
                  )}
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>主要交通</label>
                <select value={String(newTransport)} onChange={e => setNewTransport(e.target.value)} className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                  <option value="汽車 🚗">汽車 🚗</option><option value="火車/高鐵 🚅">火車/高鐵 🚅</option><option value="飛機 ✈️">飛機 ✈️</option><option value="機車 🛵">機車 🛵</option><option value="大眾運輸 🚌">大眾運輸 🚌</option>
                </select>
              </div>
            </div>
            <div className={`flex justify-end gap-3 mt-8 pt-5 border-t ${t.cardBorder}`}><button onClick={() => setTripModalMode(null)} className={`px-5 py-2.5 text-sm font-bold ${t.mainText}`}>取消</button><button onClick={handleSaveTripModal} className="bg-blue-600 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-md">{tripModalMode === 'create' ? '確認建立' : '儲存變更'}</button></div>
          </div>
        </div>
      )}

      {showDatePicker && ( <DateRangePickerModal initialStart={newStart} initialEnd={newEnd} onClose={() => setShowDatePicker(false)} onConfirm={(start, end) => { setNewStart(start); setNewEnd(end); setShowDatePicker(false); }} t={t} /> )}
      {showUpdateNote && <UpdateNoticeModal notes={RELEASE_NOTES} onClose={() => setShowUpdateNote(false)} t={t} />}
    </div>
  );
}