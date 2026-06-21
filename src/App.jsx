// noinspection SpellCheckingInspection,JSUnresolvedReference,JSDeprecatedSymbols
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  Pin,
  useMapsLibrary,
  useMap
} from '@vis.gl/react-google-maps';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set } from "firebase/database";

// ============================================================================
// ⚙️ 系統設定與常數 (Config & Constants)
// ============================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCRSUxkb9SFmhyJzlsIMhJOcB8d-vOWp7E",
  authDomain: "travel-app-923ef.firebaseapp.com",
  databaseURL: "https://travel-app-923ef-default-rtdb.firebaseio.com/", // 👈 請確認你有去資料庫頁面複製這串！
  projectId: "travel-app-923ef",
  storageBucket: "travel-app-923ef.firebasestorage.app",
  messagingSenderId: "799003437379",
  appId: "1:799003437379:web:ebd86771e42353726aa7f6",
  measurementId: "G-87H0LM24ZD"
};

const initDB = () => {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.includes("請替換")) return null;
  try {
    return getDatabase(initializeApp(firebaseConfig));
  } catch {
    return null;
  }
};
const db = initDB();

const API_KEY = 'AIzaSyAieyVaZA3vohEdf07yrk_9OYgsqXLfUmg';

// 🌟 版本更新通知
const APP_VERSION = "v1.8.0";
const RELEASE_NOTES = {
  version: APP_VERSION,
  date: "2026/06/21",
  features: [
    "📖 地點詳情百科：新增「查看詳情」按鈕，完美整合 Google 照片與真實網友評論！",
    "📸 沉浸式圖文：直接在 App 內瀏覽周邊美食照片牆與店家資訊，再決定是否加入行程。",
    "🗺️ 無縫跳轉：支援一鍵打開原生 Google Maps 查看更深度的資訊。"
  ]
};

const CATEGORIES = [
  { id: 'food', icon: '🍔', label: '飲食', color: 'bg-orange-500', text: 'text-orange-500' },
  { id: 'transport', icon: '🚗', label: '交通', color: 'bg-blue-500', text: 'text-blue-500' },
  { id: 'stay', icon: '🏠', label: '住宿', color: 'bg-indigo-500', text: 'text-indigo-500' },
  { id: 'ticket', icon: '🎫', label: '門票', color: 'bg-pink-500', text: 'text-pink-500' },
  { id: 'shop', icon: '🛍️', label: '購物', color: 'bg-purple-500', text: 'text-purple-500' },
  { id: 'other', icon: '💡', label: '其他', color: 'bg-slate-500', text: 'text-slate-400' }
];

const TAG_OPTIONS = ["需預約", "必吃", "必買", "不可刷卡", "排隊名店", "拍照點"];

// ============================================================================
// 🛠️ 實用工具函式與全局主題引擎 (Theme Engine)
// ============================================================================
const getDayDisplay = (dayId, startDateStr) => {
  const safeDayId = String(dayId || "");
  const dayNum = parseInt(safeDayId.replace('Day ', ''), 10) || 1;
  const chineseNum = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
  const dayLabel = `第${chineseNum[dayNum] || dayNum}天`;
  if (!startDateStr) return { title: dayLabel, dateStr: "" };
  const dateObj = new Date(String(startDateStr));
  if (isNaN(dateObj.getTime())) return { title: dayLabel, dateStr: "" };
  dateObj.setDate(dateObj.getDate() + dayNum - 1);
  return { title: dayLabel, dateStr: `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()]})` };
};

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

const getBrightness = (hex) => {
  let c = String(hex || '#000000').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
};

const getThemeClasses = (hex) => {
  const isLight = getBrightness(hex) > 150;
  return {
    isLight,
    mainText: isLight ? 'text-slate-900' : 'text-slate-100',
    subText: isLight ? 'text-slate-600' : 'text-slate-300',
    cardBg: isLight ? 'bg-white/60' : 'bg-black/40',
    cardBorder: isLight ? 'border-black/10' : 'border-white/10',
    cardHover: isLight ? 'hover:bg-white/80 hover:border-blue-400' : 'hover:bg-black/60 hover:border-blue-500',
    cardMetaBg: isLight ? 'bg-black/5' : 'bg-white/5',
    inputBg: isLight ? 'bg-white/80' : 'bg-black/50',
    modalBg: isLight ? 'bg-white/95' : 'bg-black/90',
    sidebarBg: isLight ? 'bg-white/50' : 'bg-black/50',
    headerBg: isLight ? 'bg-white/70' : 'bg-black/70',
    itemBg: isLight ? 'bg-white/80' : 'bg-black/40',
    itemHover: isLight ? 'hover:border-black/30' : 'hover:border-white/30',
    expenseBlockBg: isLight ? 'bg-black/5' : 'bg-black/20',
  };
};

const getExploreIcon = (query) => {
  const q = String(query || "").toLowerCase();
  if (q.includes("停車") || q.includes("parking")) return { text: "🅿️", bg: "#64748b", border: "#475569" };
  if (q.includes("咖啡") || q.includes("cafe") || q.includes("coffee")) return { text: "☕", bg: "#78350f", border: "#451a03" };
  if (q.includes("超市") || q.includes("便利") || q.includes("mart") || q.includes("market")) return { text: "🛒", bg: "#16a34a", border: "#14532d" };
  if (q.includes("景點") || q.includes("公園") || q.includes("park")) return { text: "📸", bg: "#db2777", border: "#9d174d" };
  if (q.includes("住宿") || q.includes("飯店") || q.includes("hotel")) return { text: "🏨", bg: "#4f46e5", border: "#312e81" };
  return { text: "📍", bg: "#f97316", border: "#c2410c" };
};

// ============================================================================
// 🧩 共用組件 (Shared Components)
// ============================================================================
const LoadingSpinner = ({ t }) => (
  <div className="flex flex-col items-center justify-center h-full w-full bg-transparent">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
    <p className={`font-bold tracking-widest animate-pulse ${t.subText}`}>載入旅程資料中...</p>
  </div>
);

const UpdateNoticeModal = ({ notes, onClose, t }) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-300 flex items-center justify-center p-4 transition-opacity" onClick={onClose}>
    <div className={`border rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
      <div className="text-center mb-6">
        <span className="text-6xl mb-4 block drop-shadow-md">🎉</span>
        <h2 className={`text-2xl font-black mb-1 ${t.mainText}`}>App 更新完成！</h2>
        <p className={`text-xs font-bold ${t.subText}`}>最新版本 {String(notes.version)} • {String(notes.date)}</p>
      </div>
      <div className={`p-5 rounded-2xl border mb-8 space-y-4 shadow-inner ${t.cardBg} ${t.cardBorder}`}>
        {Array.isArray(notes.features) && notes.features.map((feat, idx) => (
          <div key={String(idx)} className="flex items-start gap-2">
            <p className={`text-sm font-medium leading-relaxed ${t.mainText}`}>{String(feat)}</p>
          </div>
        ))}
      </div>
      <button onClick={onClose} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
        太棒了，開始使用！
      </button>
    </div>
  </div>
);

// 🌟 新增：專屬的地點詳細資訊彈窗 (Place Details Modal)
const PlaceDetailsModal = ({ place, onClose, onAdd, exploreOriginItem, dayTitle, t }) => {
  if (!place) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-300 flex items-center justify-center p-4 transition-opacity animate-in fade-in" onClick={onClose}>
      <div className={`border rounded-3xl p-0 w-full max-w-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh] ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>

        {/* 頭部資訊與關閉按鈕 */}
        <div className={`p-5 border-b sticky top-0 z-10 backdrop-blur-xl ${t.cardBg} ${t.cardBorder} flex justify-between items-start gap-4`}>
          <div>
            <h2 className={`text-xl font-black leading-tight mb-1 ${t.mainText}`}>{String(place.name)}</h2>
            <p className={`text-[11px] truncate ${t.subText}`}>{String(place.formatted_address || place.vicinity)}</p>
            <div className="flex items-center gap-3 mt-3">
              {place.rating && <span className="bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md text-xs font-bold border border-orange-500/20">⭐ {String(place.rating)}</span>}
              {place.user_ratings_total && <span className={`text-[11px] font-bold ${t.subText}`}>({String(place.user_ratings_total)} 則評論)</span>}
              {place.website && <a href={place.website} target="_blank" rel="noreferrer" className={`text-[11px] text-blue-500 hover:underline font-bold ml-2`}>🌐 官方網站</a>}
            </div>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-full bg-slate-500/10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors shrink-0 ${t.subText}`}>✕</button>
        </div>

        <div className="overflow-y-auto p-5 space-y-6 scrollbar-hide flex-1">
          {/* 📸 照片牆 */}
          {Array.isArray(place.photos) && place.photos.length > 0 && (
            <div>
              <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${t.subText}`}>照片總覽</h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {place.photos.slice(0, 8).map((photo, idx) => (
                  <img key={String(idx)} src={photo.getUrl({ maxWidth: 400, maxHeight: 300 })} alt="現場照片" className={`h-32 w-auto object-cover rounded-xl border snap-center shrink-0 shadow-sm ${t.cardBorder}`} />
                ))}
              </div>
            </div>
          )}

          {/* 💬 真實評論 */}
          {Array.isArray(place.reviews) && place.reviews.length > 0 && (
            <div>
              <h3 className={`text-xs font-bold mb-3 uppercase tracking-wider ${t.subText}`}>精選評論</h3>
              <div className="space-y-3">
                {place.reviews.slice(0, 5).map((review, idx) => (
                  <div key={String(idx)} className={`p-4 rounded-2xl border ${t.itemBg} ${t.cardBorder}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <img src={review.profile_photo_url} alt="avatar" className="w-8 h-8 rounded-full shadow-sm" />
                      <div>
                        <p className={`text-xs font-bold ${t.mainText}`}>{String(review.author_name)}</p>
                        <p className={`text-[10px] ${t.subText}`}>{String(review.relative_time_description)} • ⭐ {String(review.rating)}</p>
                      </div>
                    </div>
                    <p className={`text-xs leading-relaxed opacity-90 line-clamp-3 ${t.mainText}`}>{String(review.text)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 🌐 原生地圖跳轉 */}
          {place.url && (
            <button onClick={() => window.open(place.url, '_blank')} className={`w-full py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:border-blue-500 hover:text-blue-500 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>
              🗺️ 在 Google Maps 中查看完整資訊
            </button>
          )}
        </div>

        {/* 底部智慧安插按鈕保留 */}
        <div className={`p-5 border-t bg-black/5 backdrop-blur-xl ${t.cardBorder}`}>
           {exploreOriginItem ? (
              <div className="flex gap-2">
                <button onClick={() => onAdd(place, 'before')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-[11px] font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
                  加在「{String(exploreOriginItem.name).substring(0,6)}...」前
                </button>
                <button onClick={() => onAdd(place, 'after')} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 rounded-xl text-[11px] font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95">
                  加在「{String(exploreOriginItem.name).substring(0,6)}...」後
                </button>
              </div>
            ) : (
              <button onClick={() => onAdd(place, 'end')} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                <span>➕</span> 加入 {dayTitle} 行程
              </button>
            )}
        </div>
      </div>
    </div>
  );
};


// ============================================================================
// 📅 雙擊範圍日期選擇器 (Date Range Picker)
// ============================================================================
const DateRangePickerModal = ({ initialStart, initialEnd, onConfirm, onClose, t }) => {
  const normalize = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const [tempStart, setTempStart] = useState(() => initialStart ? normalize(new Date(String(initialStart))) : null);
  const [tempEnd, setTempEnd] = useState(() => initialEnd ? normalize(new Date(String(initialEnd))) : null);
  const [viewMonth, setViewMonth] = useState(() => tempStart || normalize(new Date()));

  const handleDayClick = (date) => {
    const d = normalize(date);
    if (!tempStart || (tempStart && tempEnd)) {
      setTempStart(d);
      setTempEnd(null);
    } else {
      if (d < tempStart) {
        setTempStart(d);
        setTempEnd(null);
      } else {
        setTempEnd(d);
      }
    }
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

    const days = Array(firstDayIndex).fill(null);
    for(let i=1; i<=lastDay; i++) days.push(new Date(year, month, i));

    return (
      <div className="flex-1 w-full md:w-1/2 shrink-0 p-1 md:p-4">
        <h3 className={`text-center font-bold mb-4 ${t.mainText}`}>{year} 年 {month + 1} 月</h3>
        <div className="grid grid-cols-7 text-center text-[11px] mb-2 gap-y-1 md:gap-y-2">
          {['日','一','二','三','四','五','六'].map((d,i) => <div key={String(d)} className={`font-bold pb-2 ${i===0||i===6 ? 'text-red-500' : t.subText}`}>{String(d)}</div>)}
          {days.map((d, i) => {
            if (!d) return <div key={`empty-${i}`}/>;
            const ts = d.getTime();
            const sTime = tempStart?.getTime();
            const eTime = tempEnd?.getTime();
            const isStart = ts === sTime;
            const isEnd = ts === eTime;
            const inRange = Boolean(sTime && eTime && ts > sTime && ts < eTime);

            let bgWrapper = "", text = t.mainText, rounded = "";
            if (isStart) { bgWrapper = "bg-blue-600 shadow-md"; text = "text-white"; rounded = tempEnd ? "rounded-l-full" : "rounded-full"; }
            else if (isEnd) { bgWrapper = "bg-blue-600 shadow-md"; text = "text-white"; rounded = "rounded-r-full"; }
            else if (inRange) { bgWrapper = "bg-blue-500/20"; rounded = ""; }
            else { rounded = "rounded-full hover:bg-black/10 transition-colors"; }

            return (
              <div key={String(ts)} className={`relative flex items-center justify-center h-10 ${bgWrapper} ${rounded}`} onClick={() => handleDayClick(d)}>
                <span className={`w-8 h-8 flex items-center justify-center cursor-pointer ${isStart||isEnd ? 'font-bold' : ''} ${text}`}>
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 transition-opacity animate-in fade-in" onClick={onClose}>
      <div className={`border rounded-3xl p-5 md:p-8 w-full max-w-2xl shadow-2xl flex flex-col ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className={`text-xl font-black ${t.mainText}`}>選擇旅行日期</h2>
          <button onClick={onClose} className={`text-xl hover:text-red-500 transition-colors ${t.subText}`}>✕</button>
        </div>

        <div className={`flex justify-between items-center p-4 rounded-2xl border mb-6 text-sm font-bold text-center ${t.cardBg} ${t.cardBorder}`}>
           <div className="flex-1 flex flex-col"><span className={`text-[10px] uppercase mb-1 ${t.subText}`}>去程出發</span><span className={tempStart ? 'text-blue-500 text-base' : t.subText}>{formatStr(tempStart) || '-'}</span></div>
           <div className="w-px h-8 bg-slate-500/20 mx-2"></div>
           <div className="flex-1 flex flex-col"><span className={`text-[10px] uppercase mb-1 ${t.subText}`}>回程抵達</span><span className={tempEnd ? 'text-blue-500 text-base' : t.subText}>{formatStr(tempEnd) || '-'}</span></div>
        </div>

        <div className="flex justify-between items-center mb-2 px-2 md:px-6">
           <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))} className={`w-10 h-10 flex items-center justify-center rounded-full border shadow-sm transition-transform active:scale-90 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>◀</button>
           <button onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))} className={`w-10 h-10 flex items-center justify-center rounded-full border shadow-sm transition-transform active:scale-90 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>▶</button>
        </div>

        <div className="flex overflow-hidden">
           {renderMonth(0)}
           <div className="hidden md:block w-px bg-slate-500/10 mx-2"></div>
           <div className="hidden md:block">{renderMonth(1)}</div>
        </div>

        <div className="mt-8">
           <button onClick={() => { if(tempStart && tempEnd) onConfirm(formatStr(tempStart), formatStr(tempEnd)); else alert('請點擊日期，選擇完整的出發與回程時間！'); }} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">確認日期區間</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 💰 新增/編輯 記帳彈窗 (Expense Modal)
// ============================================================================
const ExpenseModal = ({ members, existingDays, startDate, defaultDay, onClose, onSave, t }) => {
  const [item, setItem] = useState("");
  const [cost, setCost] = useState("");
  const [dayId, setDayId] = useState(defaultDay);
  const [category, setCategory] = useState("food");
  const [payer, setPayer] = useState(members[0] || "自己");
  const [splitType, setSplitType] = useState("EQUAL");
  const [involved, setInvolved] = useState(members);
  const [customAmounts, setCustomAmounts] = useState(() => {
    const init = {};
    members.forEach(m => init[String(m)] = "");
    return init;
  });

  const handleSave = () => {
    if (!String(item).trim() || !cost || Number(cost) <= 0) return alert("請輸入有效的項目名稱與金額！");
    const totalCost = Number(cost);
    const finalSplit = {};

    if (splitType === "EQUAL") {
      if (!Array.isArray(involved) || involved.length === 0) return alert("請至少選擇一位參與分帳的人員！");
      const splitAmount = Math.floor((totalCost / involved.length) * 100) / 100;
      let sum = 0;
      involved.forEach((m, idx) => {
        if (idx === involved.length - 1) { finalSplit[String(m)] = Math.round((totalCost - sum) * 100) / 100; }
        else { finalSplit[String(m)] = splitAmount; sum += splitAmount; }
      });
      members.forEach(m => { if (!involved.includes(m)) finalSplit[String(m)] = 0; });
    } else {
      let customSum = 0;
      members.forEach(m => { const val = Number(customAmounts[String(m)]) || 0; finalSplit[String(m)] = val; customSum += val; });
      if (Math.abs(customSum - totalCost) > 1) return alert(`分帳總和 (${customSum}) 與總金額 (${totalCost}) 不符！`);
    }

    onSave({ id: generateId(), dayId: String(dayId), item: String(item).trim(), cost: totalCost, category: String(category), payer: String(payer), split: finalSplit });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 transition-opacity" onClick={onClose}>
      <div className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <h2 className={`text-xl font-black mb-5 flex items-center gap-2 ${t.mainText}`}>💰 新增記帳</h2>
        <div className="overflow-y-auto pr-2 space-y-5 scrollbar-hide">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>項目名稱 *</label>
              <input value={String(item)} onChange={e => setItem(e.target.value)} placeholder="ex: 晚餐燒肉" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            </div>
            <div className="w-1/3">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>總金額 *</label>
              <input type="number" value={String(cost)} onChange={e => setCost(e.target.value)} placeholder="0" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border transition-colors font-mono font-bold text-emerald-500 ${t.inputBg} ${t.cardBorder}`} />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>日期</label>
              <select value={String(dayId)} onChange={e => setDayId(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                {Array.isArray(existingDays) && existingDays.map(d => <option key={String(d)} value={String(d)}>{getDayDisplay(d, startDate).title} {getDayDisplay(d, startDate).dateStr}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>誰先付的？</label>
              <select value={String(payer)} onChange={e => setPayer(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                {Array.isArray(members) && members.map(m => <option key={String(m)} value={String(m)}>{String(m)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase ${t.subText}`}>分類</label>
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 py-2 rounded-xl border flex items-center gap-2 whitespace-nowrap transition-all ${category === c.id ? `${c.color} border-transparent text-white shadow-md` : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>
                  <span>{c.icon}</span><span className="text-xs font-bold">{c.label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className={`p-4 rounded-2xl border ${t.cardMetaBg} ${t.cardBorder}`}>
            <div className="flex justify-between items-center mb-3">
              <label className={`text-xs font-bold ${t.subText}`}>分帳方式</label>
              <div className={`flex rounded-lg p-1 border ${t.cardBg} ${t.cardBorder}`}>
                <button onClick={() => setSplitType('EQUAL')} className={`px-3 py-1 text-[10px] font-bold rounded-md ${splitType === 'EQUAL' ? 'bg-blue-600 text-white' : t.subText}`}>勾選平分</button>
                <button onClick={() => setSplitType('CUSTOM')} className={`px-3 py-1 text-[10px] font-bold rounded-md ${splitType === 'CUSTOM' ? 'bg-purple-600 text-white' : t.subText}`}>輸入自訂</button>
              </div>
            </div>
            {splitType === 'EQUAL' ? (
              <div className="space-y-2">
                <p className={`text-[10px] mb-2 ${t.subText}`}>請勾選參與此筆消費的成員：</p>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(members) && members.map(m => (
                    <button key={String(m)} onClick={() => setInvolved(involved.includes(m) ? involved.filter(x => x !== m) : [...involved, m])} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${involved.includes(m) ? 'bg-blue-500/20 border-blue-500 text-blue-600' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>
                      {involved.includes(m) ? '✓' : '○'} {String(m)}
                    </button>
                  ))}
                </div>
                {Number(cost) > 0 && Array.isArray(involved) && involved.length > 0 && <p className="text-[10px] text-emerald-500 font-mono mt-3 text-right font-bold">每人約負擔：${Math.round(Number(cost) / involved.length).toLocaleString()}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <p className={`text-[10px] ${t.subText}`}>請為每個人輸入精確金額：</p>
                {Array.isArray(members) && members.map(m => (
                  <div key={String(m)} className="flex justify-between items-center gap-3">
                    <span className={`text-sm font-bold ${t.mainText}`}>{String(m)}</span>
                    <input type="number" value={String(customAmounts[String(m)] || "")} onChange={e => setCustomAmounts({...customAmounts, [String(m)]: e.target.value})} placeholder="0" className={`w-24 p-2 rounded-lg font-mono text-right outline-none focus:ring-2 focus:ring-purple-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                  </div>
                ))}
                {Number(cost) > 0 && (
                  <div className={`border-t pt-2 mt-2 flex justify-between items-center ${t.cardBorder}`}>
                    <span className={`text-xs ${t.subText}`}>目前總和</span>
                    <span className={`text-sm font-bold font-mono ${Object.values(customAmounts).reduce((a,b)=>a+(Number(b)||0),0) === Number(cost) ? 'text-emerald-500' : 'text-red-500'}`}>${Object.values(customAmounts).reduce((a,b)=>a+(Number(b)||0),0).toLocaleString()} / ${Number(cost).toLocaleString()}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${t.cardBorder}`}>
          <button onClick={onClose} className={`px-5 py-2 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={handleSave} className="bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all">確認新增</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 🗺️ 地圖與路線組件
// ============================================================================
const Directions = ({ itinerary, dayId, onRouteCalculated }) => {
  const map = useMap('main-map');
  const routesLib = useMapsLibrary('routes');

  useEffect(() => {
    if (!routesLib || !map) return;
    const renderer = new routesLib.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 5, strokeOpacity: 0.8 } });
    if (!dayId || !itinerary || !itinerary[dayId] || itinerary[dayId].length < 2) {
      if(onRouteCalculated) onRouteCalculated(dayId, []);
    } else {
      const service = new routesLib.DirectionsService();
      service.route({
        origin: { lat: Number(itinerary[dayId][0].lat), lng: Number(itinerary[dayId][0].lng) },
        destination: { lat: Number(itinerary[dayId][itinerary[dayId].length - 1].lat), lng: Number(itinerary[dayId][itinerary[dayId].length - 1].lng) },
        waypoints: itinerary[dayId].slice(1, -1).map(item => ({ location: { lat: Number(item.lat), lng: Number(item.lng) }, stopover: true })),
        travelMode: window.google.maps.TravelMode.DRIVING,
      }).then((result) => {
        renderer.setDirections(result);
        if (result.routes[0]?.legs && onRouteCalculated) { onRouteCalculated(dayId, result.routes[0].legs.map(leg => String(leg.duration?.text || ""))); }
      }).catch(() => {});
    }
    return () => { renderer.setMap(null); };
  }, [routesLib, map, itinerary, dayId, onRouteCalculated]);
  return null;
};

// ============================================================================
// 📝 編輯行程詳情彈窗 (Modal)
// ============================================================================
const EditItemModal = ({ item, onSave, onClose, t }) => {
  const [time, setTime] = useState(item.time || "");
  const [stayTime, setStayTime] = useState(item.stayTime || "");
  const [memo, setMemo] = useState(item.memo || "");
  const [tags, setTags] = useState(Array.isArray(item.tags) ? item.tags : []);

  const handleQuickTime = (addMins) => setStayTime(prev => String((Number(prev) || 0) + Number(addMins)));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 transition-opacity" onClick={onClose}>
      <div className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <div className="mb-5">
          <h2 className={`text-xl font-black truncate ${t.mainText}`}>{String(item.name)}</h2>
          <p className={`text-[10px] truncate mt-0.5 ${t.subText}`}>{String(item.address)}</p>
        </div>
        <div className="overflow-y-auto pr-2 space-y-6 scrollbar-hide">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>抵達時間</label>
              <input
                type="time"
                value={String(time)}
                onClick={e => { if ('showPicker' in e.target && typeof e.target.showPicker === 'function') e.target.showPicker(); }}
                onChange={e => setTime(e.target.value)}
                className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border cursor-pointer ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              />
            </div>
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>停留 (分鐘)</label>
              <input type="number" step="5" value={String(stayTime)} onChange={e => setStayTime(e.target.value)} placeholder="ex: 60" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
              <div className="flex gap-1.5 mt-2">
                {[15, 30, 60].map(mins => <button key={String(mins)} onClick={() => handleQuickTime(mins)} className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold border transition-colors hover:opacity-80 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>+{mins}</button>)}
              </div>
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase tracking-wider ${t.subText}`}>快速狀態標籤</label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => {
                const isActive = tags.includes(tag);
                return <button key={String(tag)} onClick={() => setTags(isActive ? tags.filter(x => x !== tag) : [...tags, tag])} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive ? 'bg-blue-600 border-transparent text-white shadow-lg' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>{String(tag)}</button>
              })}
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>筆記 / 備註</label>
            <textarea value={String(memo)} onChange={e => setMemo(e.target.value)} placeholder="輸入你想記下的重點細節..." className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-25 resize-none transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${t.cardBorder}`}>
          <button onClick={onClose} className={`px-5 py-2 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={() => onSave({ ...item, time: String(time), stayTime: String(stayTime), memo: String(memo), tags })} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">儲存變更</button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 🏨 旅程詳細主頁 (TripDetail)
// ============================================================================
const TripDetail = ({ roomId, onBack, onUpdateTripMeta }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [meta, setMeta] = useState(null);
  const [itinerary, setItinerary] = useState({ "Day 1": [] });
  const [expenses, setExpenses] = useState([]);
  const [budget, setBudget] = useState(10000);

  const [currentDay, setCurrentDay] = useState("Day 1");
  const [activeTab, setActiveTab] = useState("plan");

  const [editingItemData, setEditingItemData] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseView, setExpenseView] = useState('list');

  const [routeDurations, setRouteDurations] = useState({});

  const placesLib = useMapsLibrary('places');
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreResults, setExploreResults] = useState([]);
  const [selectedExploreItem, setSelectedExploreItem] = useState(null);
  const [exploreOriginItem, setExploreOriginItem] = useState(null);

  // 🌟 新增：控制顯示詳細圖文彈窗的 State
  const [detailedPlace, setDetailedPlace] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  const map = useMap('main-map');
  const isRemoteUpdateRef = useRef(false);

  useEffect(() => {
    if (!db || !roomId) return;
    const roomRef = ref(db, `rooms/${roomId}`);
    return onValue(roomRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        isRemoteUpdateRef.current = true;
        let loadedMeta = data.meta || { title: "未命名", destination: "", startDate: "", endDate: "", members: ["自己"], transport: "", themeColor: "#1e293b" };
        if (!Array.isArray(loadedMeta.members)) loadedMeta.members = ["自己"];
        setMeta(loadedMeta);
        onUpdateTripMeta(roomId, loadedMeta);

        let rawItin = data.itinerary || {};
        const safeItin = {};
        if (loadedMeta.startDate && loadedMeta.endDate) {
          const d1 = new Date(String(loadedMeta.startDate));
          const d2 = new Date(String(loadedMeta.endDate));
          const diffDays = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          for (let i = 1; i <= diffDays; i++) safeItin[`Day ${i}`] = Array.isArray(rawItin[`Day ${i}`]) ? rawItin[`Day ${i}`] : Object.values(rawItin[`Day ${i}`] || {});
        }
        if (Object.keys(safeItin).length === 0) safeItin["Day 1"] = [];
        setItinerary(safeItin);
        setExpenses(Array.isArray(data.expenses) ? data.expenses : Object.values(data.expenses || {}));
        setBudget(Number(data.budget) || 10000);
        setIsLoading(false);
      }
    });
  }, [roomId, onUpdateTripMeta]);

  useEffect(() => {
    if (isRemoteUpdateRef.current) { isRemoteUpdateRef.current = false; return; }
    if (db && roomId && meta) {
      void set(ref(db, `rooms/${roomId}`), { meta, itinerary, expenses, budget }).catch(() => {});
    }
  }, [meta, itinerary, expenses, budget, roomId]);

  const tripThemeColor = String(meta?.themeColor || '#1e293b');
  const t = useMemo(() => getThemeClasses(tripThemeColor), [tripThemeColor]);

  const handleColorChange = (newColor) => {
    const newMeta = { ...meta, themeColor: String(newColor) };
    setMeta(newMeta);
    if (db) void set(ref(db, `rooms/${roomId}/meta`), newMeta).catch(() => {});
    onUpdateTripMeta(roomId, newMeta);
  };

  const existingDays = Object.keys(itinerary);
  const safeCurrentDay = existingDays.includes(currentDay) ? currentDay : (existingDays[0] || "Day 1");
  const membersList = useMemo(() => Array.isArray(meta?.members) ? meta.members : ["自己"], [meta?.members]);

  const { totalExpense, isOverBudget, budgetPercent, groupedExpenses, balances, transfers } = useMemo(() => {
    const total = Array.isArray(expenses) ? expenses.reduce((sum, e) => sum + (Number(e.cost) || 0), 0) : 0;
    const over = total > budget;
    const percent = budget > 0 ? Math.min((total / budget) * 100, 100) : 100;
    const grouped = existingDays.map(day => ({ day, items: Array.isArray(expenses) ? expenses.filter(e => e.dayId === day) : [] }));

    const userBalances = {};
    membersList.forEach(m => userBalances[String(m)] = 0);

    if(Array.isArray(expenses)) {
      expenses.forEach(exp => {
        if (userBalances[String(exp.payer)] !== undefined) userBalances[String(exp.payer)] += (Number(exp.cost) || 0);
        if (exp.split) {
          Object.entries(exp.split).forEach(([member, amount]) => { if (userBalances[String(member)] !== undefined) userBalances[String(member)] -= (Number(amount) || 0); });
        } else {
          const splitAmount = (Number(exp.cost) || 0) / membersList.length;
          membersList.forEach(m => userBalances[String(m)] -= splitAmount);
        }
      });
    }

    const debtors = []; const creditors = [];
    Object.entries(userBalances).forEach(([member, balance]) => {
      if (balance < -0.5) debtors.push({ member: String(member), amount: -balance });
      else if (balance > 0.5) creditors.push({ member: String(member), amount: balance });
    });
    debtors.sort((a, b) => b.amount - a.amount); creditors.sort((a, b) => b.amount - a.amount);

    const suggestTransfers = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const amount = Math.min(debtors[d].amount, creditors[c].amount);
      suggestTransfers.push({ from: debtors[d].member, to: creditors[c].member, amount });
      debtors[d].amount -= amount; creditors[c].amount -= amount;
      if (debtors[d].amount < 0.5) d++; if (creditors[c].amount < 0.5) c++;
    }
    return { totalExpense: total, isOverBudget: over, budgetPercent: percent, groupedExpenses: grouped, balances: userBalances, transfers: suggestTransfers };
  }, [expenses, budget, existingDays, membersList]);

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

  const saveEditedItem = useCallback((updatedItem) => {
    setItinerary(prev => {
      const n = { ...prev };
      const dayList = n[String(editingItemData.dayId)];
      const idx = dayList.findIndex(p => p.id === updatedItem.id);
      if (idx !== -1) dayList[idx] = updatedItem;
      return n;
    });
    setEditingItemData(null);
  }, [editingItemData]);

  const handleShareLink = useCallback(() => {
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).then(() => { alert(db ? `🔗 已複製 ${meta.title} 的共編連結！` : "⚠️ 尚未設定 Firebase！"); }).catch(() => {});
  }, [roomId, meta?.title]);

  const handleExploreSearch = (customQuery = null, customLocation = null) => {
    const q = typeof customQuery === 'string' ? customQuery : String(exploreQuery);
    if (!q.trim() || !placesLib || !map) return;

    const service = new placesLib.PlacesService(map);
    const request = { query: q };

    if (customLocation) {
      request.location = customLocation;
      request.radius = 1500;
    } else {
      const bounds = map.getBounds();
      if (bounds) {
        request.bounds = bounds;
      } else {
        request.location = map.getCenter();
        request.radius = 2000;
      }
    }

    if (typeof customQuery === 'string') setExploreQuery(customQuery);

    service.textSearch(request, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && Array.isArray(results) && results.length > 0) {
        setExploreResults(results);
        setSelectedExploreItem(null);
        if (!customLocation) {
          map.panTo(results[0].geometry.location);
          map.setZoom(15);
        }
      } else {
        setExploreResults([]);
        alert("找不到相關美食/地點，試試縮放地圖或更換關鍵字！");
      }
    });
  };

  const handleSearchNearby = (item) => {
    setExploreOriginItem(item);
    setActiveTab("map");
    setTimeout(() => {
      if (map) {
        const loc = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
        map.panTo(loc);
        map.setZoom(16);
        handleExploreSearch("餐廳", loc);
      } else {
        alert("地圖載入中，請稍後再試！");
      }
    }, 400);
  };

  // 🌟 獲取地點詳細資訊 (取得照片與評論)
  const handleShowDetails = (placeId) => {
    if (!placesLib || !map) return;
    setIsFetchingDetails(true);
    const service = new placesLib.PlacesService(map);
    service.getDetails({
      placeId: String(placeId),
      fields: ['name', 'rating', 'user_ratings_total', 'formatted_address', 'geometry', 'photos', 'reviews', 'opening_hours', 'website', 'formatted_phone_number', 'url', 'place_id']
    }, (place, status) => {
      setIsFetchingDetails(false);
      if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
        setDetailedPlace(place);
      } else {
        alert("無法取得詳細資訊！可能是 Google API 限制。");
      }
    });
  };

  const handleAddExploreToItinerary = (place, position = 'end') => {
    setItinerary(prev => {
      const dayList = [...(prev[safeCurrentDay] || [])];
      const newItem = {
        id: generateId(), name: String(place.name), lat: Number(place.geometry.location.lat()), lng: Number(place.geometry.location.lng()),
        address: String(place.formatted_address || place.vicinity || ""), time: "", stayTime: "60", memo: `⭐ Google 評價: ${place.rating || '無'}`, tags: ["地圖探索"]
      };

      if (exploreOriginItem && position !== 'end') {
        const idx = dayList.findIndex(p => p.id === exploreOriginItem.id);
        if (idx !== -1) {
          if (position === 'before') {
            dayList.splice(idx, 0, newItem);
          } else if (position === 'after') {
            dayList.splice(idx + 1, 0, newItem);
          }
        } else {
          dayList.push(newItem);
        }
      } else {
        dayList.push(newItem);
      }
      return { ...prev, [safeCurrentDay]: dayList };
    });

    setSelectedExploreItem(null);
    setDetailedPlace(null);
    setExploreResults([]);
    setExploreQuery("");
    setExploreOriginItem(null);
    setActiveTab("plan");
    alert(`✅ 已成功將「${place.name}」加入行程！`);
  };

  const SearchBox = ({ dayId }) => {
    const [val, setVal] = useState("");
    const [sug, setSug] = useState([]);
    const lib = useMapsLibrary('places');

    const handleSearch = (e) => {
      setVal(e.target.value);
      if (!lib || String(e.target.value).length < 2) return setSug([]);
      new lib.AutocompleteService().getPlacePredictions({ input: String(e.target.value), language: 'zh-TW' }).then((res) => setSug(Array.isArray(res.predictions) ? res.predictions : [])).catch(() => setSug([]));
    };

    const select = (p) => {
      new lib.PlacesService(document.createElement('div')).getDetails({ placeId: p.place_id }, (res) => {
        if(res && res.geometry) {
           setItinerary(prev => ({ ...prev, [dayId]: [...(prev[dayId] || []), { id: generateId(), name: String(res.name), lat: Number(res.geometry.location.lat()), lng: Number(res.geometry.location.lng()), address: String(res.formatted_address), time: "", stayTime: "", memo: "", tags: [] }] }));
        }
        setVal(""); setSug([]);
      });
    };

    return (
      <div className="relative mb-4">
        <input className={`w-full py-2.5 px-4 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} placeholder="新增行程地點..." value={String(val)} onChange={handleSearch} />
        {Array.isArray(sug) && sug.length > 0 && <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl border overflow-hidden text-xs backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>{sug.map((s, i) => <div key={String(s.place_id || i)} onClick={() => select(s)} className={`p-3 cursor-pointer border-b transition-colors hover:opacity-80 ${t.mainText} ${t.cardBorder}`}>{String(s.description)}</div>)}</div>}
      </div>
    );
  };

  if (isLoading || !meta) return <LoadingSpinner t={t} />;

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ backgroundColor: tripThemeColor }} className={`fixed inset-0 flex flex-col overflow-hidden font-sans overscroll-none transition-colors duration-500 ${t.mainText}`}>
          <div className="flex-1 flex overflow-hidden">

            <div className={`flex-col border-r transition-opacity duration-300 backdrop-blur-xl ${t.sidebarBg} ${t.cardBorder} ${activeTab === 'map' ? 'hidden md:flex md:w-[65%]' : 'flex w-full md:w-[65%]'}`}>
              <div className={`p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-md z-20 shrink-0 border-b backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button onClick={onBack} className={`mr-2 font-bold transition-opacity hover:opacity-70 ${t.subText}`}>◀ 返回</button>
                    <div className="relative w-5 h-5 rounded-full overflow-hidden border border-white/50 shadow-sm cursor-pointer shrink-0 hover:scale-110 transition-transform">
                       <input type="color" value={tripThemeColor} onChange={e => handleColorChange(e.target.value)} className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer border-0 p-0" title="更改顏色" />
                    </div>
                    <h1 className="text-xl font-black text-blue-500 italic truncate max-w-37.5 md:max-w-75 drop-shadow-sm">{String(meta.title)}</h1>
                    {db && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                  </div>
                  <p className={`text-[10px] font-bold ${t.subText}`}>📍 {String(meta.destination)} | 🚗 {String(meta.transport)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`hidden md:flex p-1 rounded-lg border shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setActiveTab('plan')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab !== 'expense' ? 'bg-blue-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>📋 行程</button>
                    <button onClick={() => setActiveTab('expense')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'expense' ? 'bg-emerald-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>💰 記帳</button>
                  </div>
                  <button onClick={handleShareLink} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold transition-transform active:scale-95 shadow-md">
                    🔗 共編連結
                  </button>
                </div>
              </div>

              <div onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollBy(Number(e.deltaY), 0); }} className={`flex-1 overflow-x-auto p-4 gap-4 items-start scroll-smooth ${activeTab !== 'expense' ? 'flex' : 'hidden'}`}>
                {Array.isArray(existingDays) && existingDays.map(dayId => {
                  const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
                  const isCurrent = safeCurrentDay === dayId;
                  return (
                    <div key={String(dayId)} onClick={() => setCurrentDay(dayId)} className={`min-w-85 md:min-w-85 flex flex-col max-h-full rounded-3xl p-4 border-2 transition-all backdrop-blur-md ${isCurrent ? `border-blue-500 ${t.cardBg} shadow-lg` : `${t.cardBorder} hover:border-blue-300/50 ${t.expenseBlockBg}`}`}>
                      <div className="flex items-end gap-2 mb-3">
                        <h2 className={`text-lg font-black ${t.mainText}`}>{String(title)}</h2>
                        {dateStr && <span className="text-xs text-blue-500 font-bold mb-0.5">{String(dateStr)}</span>}
                      </div>
                      <SearchBox dayId={dayId} />
                      <Droppable droppableId={String(dayId)}>
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto min-h-37.5 pb-6 scrollbar-hide">
                            {Array.isArray(itinerary[dayId]) && itinerary[dayId].map((item, index) => (
                              <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                                {(prov, snap) => (
                                  <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className={`transition-all relative group mb-1 ${snap.isDragging ? 'z-50 scale-105 touch-none' : ''}`}>

                                    <div className={`p-4 rounded-2xl border flex flex-col backdrop-blur-md transition-all relative overflow-hidden ${snap.isDragging ? 'bg-blue-600 border-white shadow-2xl text-white' : `${t.itemBg} ${t.cardBorder} shadow-sm ${t.itemHover}`}`}>
                                      <div className="flex gap-4 items-start">
                                        <div className="flex flex-col items-center shrink-0 w-10">
                                           <div className={`text-xs font-black p-1.5 rounded-full w-7 h-7 flex items-center justify-center ${snap.isDragging ? 'bg-white/20 text-white' : 'bg-blue-500 text-white shadow-md'}`}>
                                              {index + 1}
                                           </div>
                                           {item.time && <span className={`text-[10px] font-bold mt-1.5 ${snap.isDragging ? 'text-white' : t.mainText}`}>{String(item.time)}</span>}
                                        </div>

                                        <div className="flex-1 min-w-0 pr-2">
                                          <div className="flex justify-between items-start gap-2">
                                            <h3 className={`font-bold text-sm truncate ${snap.isDragging ? 'text-white' : t.mainText}`} onClick={() => { setActiveTab("map"); setTimeout(() => { if (map) { map.panTo({ lat: Number(item.lat), lng: Number(item.lng) }); map.setZoom(16); } }, 100); }}>{String(item.name)}</h3>
                                            {item.memo && <span title="附有筆記，可點擊編輯查看" className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-md border flex items-center gap-1 ${snap.isDragging ? 'bg-white/10 border-white/20 text-white' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'}`}>📝</span>}
                                          </div>
                                          {item.stayTime && <p className={`text-[10px] mt-0.5 ${snap.isDragging ? 'text-white/80' : t.subText}`}>停留 {String(item.stayTime)} 分鐘</p>}
                                          <div className="flex flex-wrap gap-1.5 mt-2">
                                            {Array.isArray(item.tags) && item.tags.map((tag, idx) => <span key={String(idx)} className={`text-[9px] px-2 py-0.5 rounded-md border ${snap.isDragging ? 'bg-white/10 border-white/20 text-white' : 'bg-blue-500/10 border-blue-500/20 text-blue-600'}`}>{String(tag)}</span>)}
                                          </div>
                                        </div>
                                      </div>

                                      <div className={`mt-3 pt-3 border-t flex items-center gap-4 transition-all duration-300 ${snap.isDragging ? 'border-white/20' : t.cardBorder} flex md:max-h-0 md:opacity-0 md:group-hover:max-h-14 md:group-hover:opacity-100 max-h-14 opacity-100`}>
                                        <button onClick={() => setEditingItemData({ dayId, item })} className={`flex items-center gap-1 text-[11px] font-bold hover:text-blue-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>✏️ 編輯</button>
                                        <button onClick={() => handleSearchNearby(item)} className={`flex items-center gap-1 text-[11px] font-bold hover:text-orange-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>🔍 周邊</button>
                                        <div className="flex-1"></div>
                                        <button onClick={() => { if (window.confirm('確定刪除此景點？')) { setItinerary(prev => ({...prev, [dayId]: prev[dayId].filter(p => p.id !== item.id)})); } }} className={`text-[11px] hover:text-red-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>刪除</button>
                                        <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${Number(item.lat)},${Number(item.lng)}`, '_blank')} className="bg-blue-500/10 text-blue-500 font-bold text-[10px] px-2 py-1.5 rounded-lg transition-colors hover:bg-blue-500/20">📍 導航</button>
                                      </div>
                                    </div>

                                    {!snap.isDragging && index < itinerary[dayId].length - 1 && (
                                      <div className="flex items-center -mt-1 mb-1 ml-6 relative z-10 h-7 border-l-2 border-dashed border-slate-500/30 pl-6">
                                         {routeDurations[dayId]?.[index] && (
                                           <span className={`text-[10px] font-bold text-slate-500 bg-transparent flex items-center gap-1`}>
                                             🚗 車程 {String(routeDurations[dayId][index])}
                                           </span>
                                         )}
                                      </div>
                                    )}

                                  </div>
                                )}
                              </Draggable>
                            ))}
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
                    <h2 className={`text-4xl font-black transition-colors ${isOverBudget ? 'text-red-500' : t.mainText}`}>$ {totalExpense.toLocaleString()}</h2>
                    <button onClick={() => setShowExpenseModal(true)} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all">
                      ➕ 新增記帳
                    </button>
                  </div>
                  <div className="mt-5">
                    <div className={`flex justify-between text-[10px] mb-1.5 font-bold ${t.subText}`}><span>目前花費 {budgetPercent.toFixed(1)}%</span><span className={isOverBudget ? 'text-red-500' : 'text-emerald-500'}>{isOverBudget ? `超支 $${(totalExpense - budget).toLocaleString()}!` : `剩餘 $${(budget - totalExpense).toLocaleString()}`}</span></div>
                    <div className={`flex w-full h-3 rounded-full overflow-hidden border ${t.cardBg} ${t.cardBorder}`}>
                      {totalExpense === 0 ? null : isOverBudget ? <div className="bg-red-500 h-full w-full animate-pulse"></div> : (
                        <div style={{ width: `${budgetPercent}%` }} className="bg-blue-500 h-full transition-all duration-500"></div>
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
                      {groupedExpenses.map(({ day, items }) => {
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
                      {(!Array.isArray(expenses) || expenses.length === 0) && <p className={`text-center mt-10 font-bold ${t.subText}`}>尚無記帳紀錄</p>}
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                        <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${t.mainText}`}>👤 各自收支總覽</h3>
                        <div className="space-y-3">
                          {Object.entries(balances).map(([member, balance]) => {
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
                        {Array.isArray(transfers) && transfers.length > 0 ? (
                          <div className="space-y-3">
                            {transfers.map((tItem, idx) => (
                              <div key={String(idx)} className={`flex justify-between items-center p-4 rounded-xl border ${t.isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-500/30'}`}>
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
            </div>

            <div className={`relative flex-1 transition-opacity duration-300 ease-in-out ${activeTab === 'map' ? 'flex' : 'hidden md:flex'}`}>

              <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-125 z-20 flex flex-col gap-2">
                <div className={`flex items-center gap-2 p-2 rounded-2xl shadow-lg backdrop-blur-xl border ${t.headerBg} ${t.cardBorder}`}>
                  <input
                    value={String(exploreQuery)}
                    onChange={e => setExploreQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleExploreSearch(exploreQuery, null); }}
                    placeholder="探索周邊... (ex: 停車場、超市)"
                    className={`flex-1 bg-transparent px-2 outline-none text-sm font-bold ${t.mainText} placeholder:opacity-50`}
                  />
                  <button onClick={() => handleExploreSearch(exploreQuery, null)} className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 whitespace-nowrap">
                    🍽️ 探索
                  </button>
                  {Array.isArray(exploreResults) && exploreResults.length > 0 && (
                    <button onClick={() => {setExploreResults([]); setSelectedExploreItem(null); setExploreQuery(""); setExploreOriginItem(null);}} className={`px-2 py-2 text-xs font-bold hover:text-red-500 transition-colors ${t.subText}`}>
                      清除
                    </button>
                  )}
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

                {Array.isArray(itinerary[safeCurrentDay]) && itinerary[safeCurrentDay].map((item, idx) => (
                  <AdvancedMarker key={String(item.id)} position={{lat: Number(item.lat), lng: Number(item.lng)}}>
                    <Pin background={'#3b82f6'} glyphText={String(idx + 1)} />
                  </AdvancedMarker>
                ))}

                {Array.isArray(exploreResults) && exploreResults.map((place) => {
                  const expStyle = getExploreIcon(exploreQuery);
                  return (
                    <AdvancedMarker key={String(place.place_id)} position={{lat: Number(place.geometry.location.lat()), lng: Number(place.geometry.location.lng())}} onClick={() => setSelectedExploreItem(place)}>
                      <Pin background={expStyle.bg} borderColor={expStyle.border} glyphColor={'#fff'} glyphText={expStyle.text} />
                    </AdvancedMarker>
                  );
                })}
              </Map>

              {/* 🌟 點擊地圖上的搜尋結果跳出的小卡片 */}
              {selectedExploreItem && !detailedPlace && (
                <div className="absolute bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-100 z-20">
                  <div className={`p-4 rounded-3xl shadow-2xl backdrop-blur-2xl border ${t.modalBg} ${t.cardBorder} animate-in slide-in-from-bottom-5`}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`text-base font-black pr-4 leading-tight ${t.mainText}`}>{String(selectedExploreItem.name)}</h3>
                      <button onClick={() => setSelectedExploreItem(null)} className={`text-lg hover:text-red-500 ${t.subText}`}>✕</button>
                    </div>
                    <p className={`text-[11px] mb-3 truncate ${t.subText}`}>{String(selectedExploreItem.formatted_address || selectedExploreItem.vicinity)}</p>
                    <div className="flex items-center gap-3 mb-4">
                      {selectedExploreItem.rating && <span className="bg-orange-500/10 text-orange-600 px-2 py-0.5 rounded-md text-[11px] font-bold border border-orange-500/20">⭐ {String(selectedExploreItem.rating)}</span>}
                      {selectedExploreItem.user_ratings_total && <span className={`text-[10px] font-bold ${t.subText}`}>({String(selectedExploreItem.user_ratings_total)} 則評論)</span>}
                    </div>

                    <div className="flex flex-col gap-2">
                      {/* 🌟 新增：查看詳情按鈕 */}
                      <button onClick={() => handleShowDetails(selectedExploreItem.place_id)} className={`w-full py-2.5 rounded-xl text-xs font-bold border transition-colors hover:border-blue-500 hover:text-blue-500 flex items-center justify-center gap-2 ${isFetchingDetails ? 'opacity-50 cursor-not-allowed' : ''} ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>
                        {isFetchingDetails ? '讀取資訊中...' : '📖 查看詳情與照片'}
                      </button>

                      {exploreOriginItem ? (
                        <div className="flex gap-2">
                          <button onClick={() => handleAddExploreToItinerary(selectedExploreItem, 'before')} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95">
                            加在「{String(exploreOriginItem.name).substring(0,6)}...」前
                          </button>
                          <button onClick={() => handleAddExploreToItinerary(selectedExploreItem, 'after')} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-lg shadow-emerald-500/30 transition-all active:scale-95">
                            加在「{String(exploreOriginItem.name).substring(0,6)}...」後
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => handleAddExploreToItinerary(selectedExploreItem, 'end')} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                          <span>➕</span> 加入行程最後
                        </button>
                      )}
                    </div>

                  </div>
                </div>
              )}

              {/* 🌟 掛載：地點詳細資訊百科彈窗 */}
              {detailedPlace && (
                <PlaceDetailsModal
                  place={detailedPlace}
                  onClose={() => setDetailedPlace(null)}
                  onAdd={(place, pos) => { setDetailedPlace(null); handleAddExploreToItinerary(place, pos); }}
                  exploreOriginItem={exploreOriginItem}
                  dayTitle={getDayDisplay(safeCurrentDay, meta.startDate).title}
                  t={t}
                />
              )}

            </div>
          </div>

          <div className={`flex p-1.5 border-t h-20 shrink-0 z-30 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] pb-safe backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
            <button onClick={() => setActiveTab("plan")} className={`flex-1 pt-3 flex flex-col items-center transition-all ${activeTab === "plan" ? "text-blue-500 font-bold -translate-y-1" : t.subText}`}>📋<span className="text-[10px] mt-1 font-bold">行程</span></button>
            <button onClick={() => setActiveTab("map")} className={`flex-1 pt-3 flex flex-col items-center transition-all ${activeTab === "map" ? "text-blue-500 font-bold -translate-y-1" : t.subText}`}>🗺️<span className="text-[10px] mt-1 font-bold">地圖</span></button>
            <button onClick={() => setActiveTab("expense")} className={`flex-1 pt-3 flex flex-col items-center transition-all ${activeTab === "expense" ? "text-emerald-500 font-bold -translate-y-1" : t.subText}`}>💰<span className="text-[10px] mt-1 font-bold">記帳</span></button>
          </div>
        </div>
      </DragDropContext>

      {editingItemData && (
        <EditItemModal item={editingItemData.item} onSave={saveEditedItem} onClose={() => setEditingItemData(null)} t={t} />
      )}

      {showExpenseModal && (
        <ExpenseModal
          members={membersList}
          existingDays={existingDays}
          startDate={meta.startDate}
          defaultDay={existingDays[0] || "Day 1"}
          onClose={() => setShowExpenseModal(false)}
          onSave={(newExpense) => {
            setExpenses(prev => [...prev, newExpense]);
            setShowExpenseModal(false);
          }}
          t={t}
        />
      )}
    </>
  );
};

// ============================================================================
// 🏠 首頁大廳 (Dashboard App)
// ============================================================================
export default function TravelApp() {
  const [myTrips, setMyTrips] = useState(() => {
    try { return JSON.parse(localStorage.getItem('google-travel-my-trips')) || []; } catch { return []; }
  });

  const [customBgColor, setCustomBgColor] = useState(() => {
    try { return localStorage.getItem('google-travel-custom-bg') || '#d8b4e2'; } catch { return '#d8b4e2'; }
  });

  const [showUpdateNote, setShowUpdateNote] = useState(() => {
    try { return localStorage.getItem('google-travel-version') !== APP_VERSION; } catch { return false; }
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newMembers, setNewMembers] = useState(["自己"]);
  const [newTransport, setNewTransport] = useState("汽車 🚗");
  const [newThemeColor, setNewThemeColor] = useState("#3b82f6");

  const [showAddMember, setShowAddMember] = useState(false);
  const [tempMember, setTempMember] = useState("");

  const [activeRoomId, setActiveRoomId] = useState(() => {
    if (typeof window !== 'undefined') return new URLSearchParams(window.location.search).get('room') || null;
    return null;
  });

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
      if (exists) {
        if (JSON.stringify(exists) !== JSON.stringify({ ...meta, roomId })) return prev.map(t => t.roomId === roomId ? { ...meta, roomId } : t);
        return prev;
      }
      return [...prev, { ...meta, roomId }];
    });
  }, []);

  const handleImportTrip = () => {
    if (!String(importInput).trim()) return;
    let targetRoomId = String(importInput).trim();

    if (targetRoomId.includes("?room=")) {
      try {
        const urlParams = new URLSearchParams(targetRoomId.split('?')[1]);
        targetRoomId = urlParams.get('room') || targetRoomId;
      } catch { /* ignore */ }
    }

    if (!db) return alert("⚠️ 尚未連結 Firebase 雲端！");

    const roomMetaRef = ref(db, `rooms/${targetRoomId}/meta`);
    onValue(roomMetaRef, (snapshot) => {
      const remoteMeta = snapshot.val();
      if (remoteMeta) {
        setMyTrips(prev => {
          if (prev.find(t => t.roomId === targetRoomId)) return prev;
          return [...prev, { ...remoteMeta, roomId: targetRoomId }];
        });
        setShowImportModal(false);
        setImportInput("");
        alert(`🎉 成功同步雲端旅程：${remoteMeta.title}！`);
      } else {
        alert("❌ 找不到該旅程，請確認共編網址或房間 ID 是否正確！");
      }
    }, { onlyOnce: true });
  };

  const handleCreateTrip = () => {
    if (!String(newTitle).trim() || !newStart || !newEnd) return alert("請填寫完整的名稱與日期區間！");
    const d1 = new Date(String(newStart));
    const d2 = new Date(String(newEnd));
    const diffDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 1 || diffDays > 30) return alert("日期錯誤或天數過長！");

    const newRoomId = generateId();
    const initialItinerary = {};
    for (let i = 1; i <= diffDays; i++) initialItinerary[`Day ${i}`] = [];

    const newMeta = { title: String(newTitle).trim(), destination: String(newDest), startDate: String(newStart), endDate: String(newEnd), members: newMembers, transport: String(newTransport), themeColor: String(newThemeColor) };

    if (db) void set(ref(db, `rooms/${newRoomId}`), { meta: newMeta, itinerary: initialItinerary, expenses: [], budget: 10000 }).catch(() => {});

    setMyTrips(prev => [...prev, { ...newMeta, roomId: newRoomId }]);
    setShowCreateModal(false);
    window.history.pushState(null, '', `?room=${newRoomId}`);
    setActiveRoomId(newRoomId);

    setNewTitle(""); setNewDest(""); setNewStart(""); setNewEnd(""); setNewMembers(["主辦人"]); setNewThemeColor("#3b82f6");
  };

  const openTrip = (roomId) => { window.history.pushState(null, '', `?room=${roomId}`); setActiveRoomId(roomId); };
  const closeTrip = () => { window.history.pushState(null, '', window.location.pathname); setActiveRoomId(null); };

  const t = getThemeClasses(customBgColor);

  if (activeRoomId) return <APIProvider apiKey={API_KEY}><TripDetail roomId={activeRoomId} onBack={closeTrip} onUpdateTripMeta={handleUpdateTripMeta} /></APIProvider>;

  return (
    <div style={{ backgroundColor: customBgColor }} className={`fixed inset-0 flex flex-col font-sans overflow-y-auto overscroll-none transition-colors duration-500 ${t.mainText}`}>
      <div className="max-w-5xl w-full mx-auto p-6 md:p-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <div className="bg-linear-to-br from-blue-500 to-emerald-500 text-white p-2.5 rounded-2xl shadow-lg shadow-blue-500/30 transform -rotate-12 transition-transform hover:rotate-0 cursor-pointer">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </div>
              <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-emerald-400 tracking-tight drop-shadow-sm">
                智の旅行
              </h1>
            </div>
            <p className={`font-bold tracking-wide ${t.subText}`}>你的專屬旅程管理中心</p>
          </div>

          <div className="w-full md:w-auto flex flex-row items-center justify-between md:justify-end gap-3">
            <div className={`flex items-center gap-3 p-1.5 pr-4 rounded-full border shadow-sm backdrop-blur-md ${t.isLight ? 'bg-white/50 border-slate-200' : 'bg-black/20 border-white/10'}`}>
              <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
                <input type="color" value={String(customBgColor)} onChange={e => setCustomBgColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" title="選擇主頁背景色" />
              </div>
              <span className={`text-xs font-bold ${t.subText}`}>自訂大廳色</span>
            </div>

            <button onClick={() => setShowImportModal(true)} className="bg-slate-500/20 border border-slate-500/30 text-sm font-bold px-4 py-3 rounded-2xl transition-transform active:scale-95">
              📥 匯入行程
            </button>

            <button onClick={() => setShowCreateModal(true)} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-2xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
              <span>➕</span> <span>新增旅程</span>
            </button>
          </div>
        </header>

        {!Array.isArray(myTrips) || myTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-24 opacity-80">
            <span className="text-7xl mb-6 drop-shadow-md">🌍</span>
            <p className={`text-xl font-bold mb-2 ${t.mainText}`}>目前還沒有任何旅程</p>
            <p className={`text-sm ${t.subText}`}>點擊右上角「新增」或「匯入」開啟你的雲端旅程！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myTrips.map(trip => {
              const cardColor = String(trip.themeColor || '#1e293b');
              const cTheme = getThemeClasses(cardColor);
              return (
                <div key={String(trip.roomId)} onClick={() => openTrip(trip.roomId)} style={{ backgroundColor: cardColor }} className={`border rounded-3xl p-6 cursor-pointer transition-all duration-300 group shadow-xl hover:-translate-y-1 hover:shadow-2xl ${cTheme.cardBorder}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${cTheme.isLight ? 'bg-black/5 text-slate-700 border-black/10' : 'bg-white/20 text-white border-white/30'}`}>{String(trip.transport)}</span>
                    <button onClick={(e) => { e.stopPropagation(); if(window.confirm('確定從大廳移除此捷徑？(雲端資料不會刪除)')) setMyTrips(prev => prev.filter(tripItem => tripItem.roomId !== trip.roomId)); }} className={`text-xs p-1 transition-colors hover:text-red-500 ${cTheme.subText}`}>移除</button>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-250 flex items-center justify-center p-4" onClick={() => setShowImportModal(false)}>
          <div className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
            <h2 className={`text-xl font-black mb-2 ${t.mainText}`}>📥 匯入雲端行程</h2>
            <p className={`text-xs mb-4 ${t.subText}`}>請貼上朋友分享給你的「共編連結」或「房間 ID」：</p>
            <input
              value={String(importInput)}
              onChange={e => setImportInput(e.target.value)}
              placeholder="貼上網址或代碼..."
              className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border mb-6 text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowImportModal(false)} className={`px-4 py-2 text-sm font-bold ${t.subText}`}>取消</button>
              <button onClick={handleImportTrip} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md">確認匯入</button>
            </div>
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 transition-opacity" onClick={() => setShowCreateModal(false)}>
          <div className={`border rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
            <h2 className={`text-2xl font-black mb-6 ${t.mainText}`}>建立新旅程 🛫</h2>
            <div className="space-y-5">
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>旅程專屬顏色</label>
                <div className={`flex items-center gap-3 p-2 rounded-xl border ${t.inputBg} ${t.cardBorder}`}>
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
                    <input type="color" value={String(newThemeColor)} onChange={e => setNewThemeColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" />
                  </div>
                  <span className={`text-sm font-bold ${t.mainText}`}>{String(newThemeColor).toUpperCase()}</span>
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>旅程名稱 *</label>
                <input value={String(newTitle)} onChange={e => setNewTitle(e.target.value)} placeholder="ex: 瘋狂京阪神五日遊" className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>主要地點</label>
                <input value={String(newDest)} onChange={e => setNewDest(e.target.value)} placeholder="ex: 日本大阪" className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>旅行日期 *</label>
                <div onClick={() => setShowDatePicker(true)} className={`w-full p-3.5 rounded-xl outline-none transition-colors border flex justify-between items-center cursor-pointer hover:border-blue-500 ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                  <span className={newStart && newEnd ? 'font-bold text-blue-500' : `opacity-60 ${t.subText}`}>
                    {newStart && newEnd ? `${String(newStart).replace(/-/g,'/')} 至 ${String(newEnd).replace(/-/g,'/')}` : '點擊選擇出發與回程日期'}
                  </span>
                  <span className="text-lg">📅</span>
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${t.subText}`}>同行成員 (記帳用)</label>
                <div className={`flex flex-wrap gap-2 items-center p-3 rounded-xl border min-h-14 ${t.inputBg} ${t.cardBorder}`}>
                  {Array.isArray(newMembers) && newMembers.map((m, idx) => (
                    <span key={String(m) + idx} className="bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-blue-500/20 shadow-sm">
                      {String(m)}
                      <button onClick={() => setNewMembers(newMembers.filter(name => name !== m))} className="hover:text-red-400 transition-colors">✕</button>
                    </span>
                  ))}
                  {showAddMember ? (
                    <div className={`flex items-center gap-1.5 p-1.5 rounded-lg border border-blue-500 shadow-inner ${t.cardMetaBg}`}>
                      <input autoFocus value={String(tempMember)} onChange={e => setTempMember(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && String(tempMember).trim()) { if (!newMembers.includes(String(tempMember).trim())) setNewMembers([...newMembers, String(tempMember).trim()]); setTempMember(""); setShowAddMember(false); } }} placeholder="名稱..." className={`bg-transparent text-sm outline-none w-20 px-2 ${t.mainText}`} />
                      <button onClick={() => { if (String(tempMember).trim() && !newMembers.includes(String(tempMember).trim())) setNewMembers([...newMembers, String(tempMember).trim()]); setTempMember(""); setShowAddMember(false); }} className="bg-blue-600 text-white rounded p-1 text-xs">✓</button>
                      <button onClick={() => setShowAddMember(false)} className={`hover:opacity-70 p-1 text-xs transition-opacity ${t.subText}`}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddMember(true)} className={`px-3 py-1.5 rounded-lg text-sm font-bold border border-dashed transition-opacity opacity-70 hover:opacity-100 ${t.subText} ${t.cardBorder}`}>➕ 新增</button>
                  )}
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>主要交通</label>
                <select value={String(newTransport)} onChange={e => setNewTransport(e.target.value)} className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                  <option value="汽車 🚗">汽車 🚗</option><option value="火車/高鐵 🚅">火車/高鐵 🚅</option><option value="飛機 ✈️">飛機 ✈️</option><option value="機車 🛵">機車 🛵</option><option value="大眾運輸 🚌">大眾運輸 🚌</option>
                </select>
              </div>
            </div>
            <div className={`flex justify-end gap-3 mt-8 pt-5 border-t ${t.cardBorder}`}>
              <button onClick={() => setShowCreateModal(false)} className={`px-5 py-2.5 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
              <button onClick={handleCreateTrip} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">確認建立</button>
            </div>
          </div>
        </div>
      )}

      {showDatePicker && (
        <DateRangePickerModal
          initialStart={newStart}
          initialEnd={newEnd}
          onClose={() => setShowDatePicker(false)}
          onConfirm={(start, end) => { setNewStart(start); setNewEnd(end); setShowDatePicker(false); }}
          t={t}
        />
      )}

      {showUpdateNote && <UpdateNoticeModal notes={RELEASE_NOTES} onClose={() => setShowUpdateNote(false)} t={t} />}
    </div>
  );
}