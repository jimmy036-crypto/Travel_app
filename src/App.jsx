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

let db = null;
try {
  if (firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("請替換")) {
    db = getDatabase(initializeApp(firebaseConfig));
  }
} catch (e) {
  console.warn("Firebase Init Error:", e);
}

const API_KEY = 'AIzaSyAieyVaZA3vohEdf07yrk_9OYgsqXLfUmg';

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
  const dayNum = parseInt(dayId.replace('Day ', ''), 10);
  const chineseNum = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
  const dayLabel = `第${chineseNum[dayNum] || dayNum}天`;
  if (!startDateStr) return { title: dayLabel, dateStr: "" };
  const dateObj = new Date(startDateStr);
  if (isNaN(dateObj.getTime())) return { title: dayLabel, dateStr: "" };
  dateObj.setDate(dateObj.getDate() + dayNum - 1);
  return { title: dayLabel, dateStr: `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()]})` };
};

const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

const getBrightness = (hex) => {
  let c = (hex || '#000000').replace('#', '');
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

// ============================================================================
// 🧩 共用組件 (Shared Components)
// ============================================================================
const LoadingSpinner = ({ t }) => (
  <div className="flex flex-col items-center justify-center h-full w-full bg-transparent">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
    <p className={`font-bold tracking-widest animate-pulse ${t.subText}`}>載入旅程資料中...</p>
  </div>
);

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
    members.forEach(m => init[m] = "");
    return init;
  });

  const handleSave = () => {
    if (!item.trim() || !cost || Number(cost) <= 0) return alert("請輸入有效的項目名稱與金額！");
    const totalCost = Number(cost);
    const finalSplit = {};

    if (splitType === "EQUAL") {
      if (involved.length === 0) return alert("請至少選擇一位參與分帳的人員！");
      const splitAmount = Math.floor((totalCost / involved.length) * 100) / 100;
      let sum = 0;
      involved.forEach((m, idx) => {
        if (idx === involved.length - 1) {
          finalSplit[m] = Math.round((totalCost - sum) * 100) / 100;
        } else {
          finalSplit[m] = splitAmount;
          sum += splitAmount;
        }
      });
      members.forEach(m => { if (!involved.includes(m)) finalSplit[m] = 0; });
    } else {
      let customSum = 0;
      members.forEach(m => {
        const val = Number(customAmounts[m]) || 0;
        finalSplit[m] = val;
        customSum += val;
      });
      if (Math.abs(customSum - totalCost) > 1) return alert(`分帳總和 (${customSum}) 與總金額 (${totalCost}) 不符！`);
    }

    onSave({ id: generateId(), dayId, item: item.trim(), cost: totalCost, category, payer, split: finalSplit });
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4" onClick={onClose}>
      <div className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <h2 className={`text-xl font-black mb-5 flex items-center gap-2 ${t.mainText}`}>💰 新增記帳</h2>

        <div className="overflow-y-auto pr-2 space-y-5 scrollbar-hide">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>項目名稱 *</label>
              <input value={item} onChange={e => setItem(e.target.value)} placeholder="ex: 晚餐燒肉" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            </div>
            <div className="w-1/3">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>總金額 *</label>
              <input type="number" value={cost} onChange={e => setCost(e.target.value)} placeholder="0" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border transition-colors font-mono font-bold text-emerald-500 ${t.inputBg} ${t.cardBorder}`} />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>日期</label>
              <select value={dayId} onChange={e => setDayId(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                {existingDays.map(d => {
                  const { title, dateStr } = getDayDisplay(d, startDate);
                  return <option key={d} value={d}>{title} {dateStr}</option>
                })}
              </select>
            </div>
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>誰先付的？</label>
              <select value={payer} onChange={e => setPayer(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                {members.map(m => <option key={m} value={m}>{m}</option>)}
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
                  {members.map(m => {
                    const isChecked = involved.includes(m);
                    return (
                      <button key={m} onClick={() => setInvolved(isChecked ? involved.filter(x => x !== m) : [...involved, m])} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${isChecked ? 'bg-blue-500/20 border-blue-500 text-blue-600' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>
                        {isChecked ? '✓' : '○'} {m}
                      </button>
                    )
                  })}
                </div>
                {Number(cost) > 0 && involved.length > 0 && (
                  <p className="text-[10px] text-emerald-500 font-mono mt-3 text-right font-bold">每人約負擔：${Math.round(Number(cost) / involved.length).toLocaleString()}</p>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className={`text-[10px] ${t.subText}`}>請為每個人輸入精確金額：</p>
                {members.map(m => (
                  <div key={m} className="flex justify-between items-center gap-3">
                    <span className={`text-sm font-bold ${t.mainText}`}>{m}</span>
                    <input type="number" value={customAmounts[m]} onChange={e => setCustomAmounts({...customAmounts, [m]: e.target.value})} placeholder="0" className={`w-24 p-2 rounded-lg font-mono text-right outline-none focus:ring-2 focus:ring-purple-500 border transition-colors ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                  </div>
                ))}
                {Number(cost) > 0 && (
                  <div className={`border-t pt-2 mt-2 flex justify-between items-center ${t.cardBorder}`}>
                    <span className={`text-xs ${t.subText}`}>目前總和</span>
                    <span className={`text-sm font-bold font-mono ${Object.values(customAmounts).reduce((a,b)=>a+(Number(b)||0),0) === Number(cost) ? 'text-emerald-500' : 'text-red-500'}`}>
                      ${Object.values(customAmounts).reduce((a,b)=>a+(Number(b)||0),0).toLocaleString()} / ${Number(cost).toLocaleString()}
                    </span>
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
  const map = useMap();
  const routesLib = useMapsLibrary('routes');

  useEffect(() => {
    if (!routesLib || !map) return;
    const renderer = new routesLib.DirectionsRenderer({ map, suppressMarkers: true, polylineOptions: { strokeColor: "#3b82f6", strokeWeight: 5, strokeOpacity: 0.8 } });
    if (!dayId || !itinerary || !itinerary[dayId] || itinerary[dayId].length < 2) {
      onRouteCalculated?.(dayId, []);
    } else {
      const service = new routesLib.DirectionsService();
      service.route({
        origin: { lat: itinerary[dayId][0].lat, lng: itinerary[dayId][0].lng },
        destination: { lat: itinerary[dayId][itinerary[dayId].length - 1].lat, lng: itinerary[dayId][itinerary[dayId].length - 1].lng },
        waypoints: itinerary[dayId].slice(1, -1).map(item => ({ location: { lat: item.lat, lng: item.lng }, stopover: true })),
        travelMode: window.google.maps.TravelMode.DRIVING,
      }).then((result) => {
        renderer.setDirections(result);
        if (result.routes[0]?.legs && onRouteCalculated) {
          onRouteCalculated(dayId, result.routes[0].legs.map(leg => String(leg.duration?.text || "")));
        }
      }).catch(() => {});
    }
    return () => renderer.setMap(null);
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
  const [tags, setTags] = useState(item.tags || []);

  const handleQuickTime = (addMins) => setStayTime(prev => String((Number(prev) || 0) + addMins));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 transition-opacity" onClick={onClose}>
      <div className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <div className="mb-5">
          <h2 className={`text-xl font-black truncate ${t.mainText}`}>{item.name}</h2>
          <p className={`text-[10px] truncate mt-0.5 ${t.subText}`}>{item.address}</p>
        </div>
        <div className="overflow-y-auto pr-2 space-y-6 scrollbar-hide">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>抵達時間</label>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            </div>
            <div className="flex-1">
              <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>停留 (分鐘)</label>
              <input type="number" step="5" value={stayTime} onChange={e => setStayTime(e.target.value)} placeholder="ex: 60" className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
              <div className="flex gap-1.5 mt-2">
                {[15, 30, 60].map(mins => <button key={mins} onClick={() => handleQuickTime(mins)} className={`flex-1 text-[10px] py-1.5 rounded-lg font-bold border transition-colors hover:opacity-80 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>+{mins}</button>)}
              </div>
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase tracking-wider ${t.subText}`}>快速狀態標籤</label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => {
                const isActive = tags.includes(tag);
                return <button key={tag} onClick={() => setTags(isActive ? tags.filter(x => x !== tag) : [...tags, tag])} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive ? 'bg-blue-600 border-transparent text-white shadow-lg' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>{tag}</button>
              })}
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>筆記 / 備註</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} placeholder="輸入你想記下的重點細節..." className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-25 resize-none transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${t.cardBorder}`}>
          <button onClick={onClose} className={`px-5 py-2 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={() => onSave({ ...item, time, stayTime, memo, tags })} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">儲存變更</button>
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

  // 🌟 美食地圖探索雷達 States
  const placesLib = useMapsLibrary('places');
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreResults, setExploreResults] = useState([]);
  const [selectedExploreItem, setSelectedExploreItem] = useState(null);

  const mapRef = useRef(null);
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
          const d1 = new Date(loadedMeta.startDate);
          const d2 = new Date(loadedMeta.endDate);
          const diffDays = Math.max(1, Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          for (let i = 1; i <= diffDays; i++) safeItin[`Day ${i}`] = Array.isArray(rawItin[`Day ${i}`]) ? rawItin[`Day ${i}`] : Object.values(rawItin[`Day ${i}`] || {});
        }
        if (Object.keys(safeItin).length === 0) safeItin["Day 1"] = [];
        setItinerary(safeItin);
        setExpenses(Array.isArray(data.expenses) ? data.expenses : Object.values(data.expenses || {}));
        setBudget(data.budget || 10000);
        setIsLoading(false);
      }
    });
  }, [roomId, onUpdateTripMeta]);

  useEffect(() => {
    if (isRemoteUpdateRef.current) { isRemoteUpdateRef.current = false; return; }
    if (db && roomId && meta) set(ref(db, `rooms/${roomId}`), { meta, itinerary, expenses, budget }).catch(() => {});
  }, [meta, itinerary, expenses, budget, roomId]);

  const tripThemeColor = meta?.themeColor || '#1e293b';
  const t = useMemo(() => getThemeClasses(tripThemeColor), [tripThemeColor]);

  const handleColorChange = (newColor) => {
    const newMeta = { ...meta, themeColor: newColor };
    setMeta(newMeta);
    if (db) set(ref(db, `rooms/${roomId}/meta`), newMeta);
    onUpdateTripMeta(roomId, newMeta);
  };

  const existingDays = Object.keys(itinerary);
  const safeCurrentDay = existingDays.includes(currentDay) ? currentDay : (existingDays[0] || "Day 1");
  const membersList = useMemo(() => meta?.members || ["自己"], [meta?.members]);

  // AI 結算
  const { totalExpense, isOverBudget, budgetPercent, groupedExpenses, balances, transfers } = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + (Number(e.cost) || 0), 0);
    const over = total > budget;
    const percent = budget > 0 ? Math.min((total / budget) * 100, 100) : 100;
    const grouped = existingDays.map(day => ({ day, items: expenses.filter(e => e.dayId === day) }));

    const userBalances = {};
    membersList.forEach(m => userBalances[m] = 0);

    expenses.forEach(exp => {
      if (userBalances[exp.payer] !== undefined) userBalances[exp.payer] += Number(exp.cost);
      if (exp.split) {
        Object.entries(exp.split).forEach(([member, amount]) => {
          if (userBalances[member] !== undefined) userBalances[member] -= Number(amount);
        });
      } else {
        const splitAmount = Number(exp.cost) / membersList.length;
        membersList.forEach(m => userBalances[m] -= splitAmount);
      }
    });

    const debtors = [];
    const creditors = [];
    Object.entries(userBalances).forEach(([member, balance]) => {
      if (balance < -0.5) debtors.push({ member, amount: -balance });
      else if (balance > 0.5) creditors.push({ member, amount: balance });
    });
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const suggestTransfers = [];
    let d = 0, c = 0;
    while (d < debtors.length && c < creditors.length) {
      const amount = Math.min(debtors[d].amount, creditors[c].amount);
      suggestTransfers.push({ from: debtors[d].member, to: creditors[c].member, amount });
      debtors[d].amount -= amount;
      creditors[c].amount -= amount;
      if (debtors[d].amount < 0.5) d++;
      if (creditors[c].amount < 0.5) c++;
    }

    return { totalExpense: total, isOverBudget: over, budgetPercent: percent, groupedExpenses: grouped, balances: userBalances, transfers: suggestTransfers };
  }, [expenses, budget, existingDays, membersList]);

  const handleDragEnd = useCallback((result) => {
    const { source, destination } = result;
    if (!destination) return;
    setItinerary(prev => {
      const newItin = { ...prev };
      const [moved] = newItin[source.droppableId].splice(source.index, 1);
      newItin[destination.droppableId].splice(destination.index, 0, moved);
      return newItin;
    });
  }, []);

  const handleRouteCalculated = useCallback((day, durations) => {
    setRouteDurations(prev => JSON.stringify(prev[day]) !== JSON.stringify(durations) ? { ...prev, [day]: durations } : prev);
  }, []);

  const saveEditedItem = useCallback((updatedItem) => {
    setItinerary(prev => {
      const n = { ...prev };
      const dayList = n[editingItemData.dayId];
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

  // 🌟 執行美食地圖探索
  const handleExploreSearch = () => {
    if (!exploreQuery.trim() || !placesLib || !mapRef.current) return;
    const service = new placesLib.PlacesService(mapRef.current);

    // 如果使用者只輸入了食物名稱(如"冰淇淋")，加上 bounds 可以優先搜尋地圖目前的範圍
    const request = {
      query: exploreQuery,
      bounds: mapRef.current.getBounds()
    };

    service.textSearch(request, (results, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && results) {
        setExploreResults(results);
        setSelectedExploreItem(null);
      } else {
        setExploreResults([]);
        alert("找不到相關結果，請嘗試更換關鍵字 (例如：那霸 冰淇淋) 或移動地圖再試一次！");
      }
    });
  };

  // 🌟 把探索到的美食加入目前行程
  const handleAddExploreToItinerary = (place) => {
    setItinerary(prev => ({
      ...prev,
      [safeCurrentDay]: [...(prev[safeCurrentDay] || []), {
        id: generateId(),
        name: place.name,
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
        address: place.formatted_address || place.vicinity || "",
        time: "",
        stayTime: "60", // 預設吃60分鐘
        memo: `⭐ Google 評價: ${place.rating || '無'}`,
        tags: ["必吃", "美食地圖"]
      }]
    }));
    setSelectedExploreItem(null);
    alert(`✅ 已成功將「${place.name}」加入 ${getDayDisplay(safeCurrentDay, meta.startDate).title} 的行程中！`);
  };

  const SearchBox = ({ dayId }) => {
    const [val, setVal] = useState("");
    const [sug, setSug] = useState([]);
    const lib = useMapsLibrary('places');

    const handleSearch = (e) => {
      setVal(e.target.value);
      if (!lib || e.target.value.length < 2) return setSug([]);
      new lib.AutocompleteService().getPlacePredictions({ input: e.target.value, language: 'zh-TW' }).then((res) => setSug(res.predictions || [])).catch(() => setSug([]));
    };

    const select = (p) => {
      new lib.PlacesService(document.createElement('div')).getDetails({ placeId: p.place_id }, (res) => {
        setItinerary(prev => ({ ...prev, [dayId]: [...(prev[dayId] || []), { id: generateId(), name: res.name, lat: res.geometry.location.lat(), lng: res.geometry.location.lng(), address: res.formatted_address, time: "", stayTime: "", memo: "", tags: [] }] }));
        setVal(""); setSug([]);
      });
    };

    return (
      <div className="relative mb-4">
        <input className={`w-full py-2.5 px-4 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} placeholder="快速加入行程點..." value={val} onChange={handleSearch} />
        {sug.length > 0 && <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl border overflow-hidden text-xs backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>{sug.map(s => <div key={String(s.place_id)} onClick={() => select(s)} className={`p-3 cursor-pointer border-b transition-colors hover:opacity-80 ${t.mainText} ${t.cardBorder}`}>{s.description}</div>)}</div>}
      </div>
    );
  };

  if (isLoading || !meta) return <LoadingSpinner t={t} />;

  return (
    <>
      <DragDropContext onDragEnd={handleDragEnd}>
        <div style={{ backgroundColor: tripThemeColor }} className={`flex flex-col h-screen w-screen overflow-hidden font-sans transition-colors duration-500 ${t.mainText}`}>
          <div className="flex-1 flex overflow-hidden">

            <div className={`flex-col border-r transition-opacity duration-300 backdrop-blur-xl ${t.sidebarBg} ${t.cardBorder} ${activeTab === 'map' ? 'hidden md:flex md:w-[65%]' : 'flex w-full md:w-[65%]'}`}>
              <div className={`p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-md z-20 shrink-0 border-b backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button onClick={onBack} className={`mr-2 font-bold transition-opacity hover:opacity-70 ${t.subText}`}>◀ 返回</button>
                    <div className="relative w-5 h-5 rounded-full overflow-hidden border border-white/50 shadow-sm cursor-pointer shrink-0 hover:scale-110 transition-transform">
                       <input type="color" value={tripThemeColor} onChange={e => handleColorChange(e.target.value)} className="absolute -top-2 -left-2 w-10 h-10 cursor-pointer border-0 p-0" title="更改此趟旅程的顏色" />
                    </div>
                    <h1 className="text-xl font-black text-blue-500 italic truncate max-w-37.5 md:max-w-75 drop-shadow-sm">{meta.title}</h1>
                    {db && <span className="flex h-2 w-2 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span>}
                  </div>
                  <p className={`text-[10px] font-bold ${t.subText}`}>📍 {meta.destination} | 🚗 {meta.transport}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`hidden md:flex p-1 rounded-lg border shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setActiveTab('plan')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab !== 'expense' ? 'bg-blue-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>📋 行程</button>
                    <button onClick={() => setActiveTab('expense')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'expense' ? 'bg-emerald-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>💰 記帳</button>
                  </div>
                  <button onClick={handleShareLink} className={`bg-blue-600 text-white px-4 py-2 rounded-lg text-[10px] font-bold transition-transform active:scale-95 shadow-md`}>🔗 共編</button>
                </div>
              </div>

              <div onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollBy(Number(e.deltaY), 0); }} className={`flex-1 overflow-x-auto p-4 gap-4 items-start scroll-smooth ${activeTab !== 'expense' ? 'flex' : 'hidden'}`}>
                {existingDays.map(dayId => {
                  const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
                  const isCurrent = safeCurrentDay === dayId;
                  return (
                    <div key={String(dayId)} onClick={() => setCurrentDay(dayId)} className={`min-w-85 md:min-w-85 flex flex-col max-h-full rounded-3xl p-4 border-2 transition-all backdrop-blur-md ${isCurrent ? `border-blue-500 ${t.cardBg} shadow-lg` : `${t.cardBorder} hover:border-blue-300/50 ${t.expenseBlockBg}`}`}>
                      <div className="flex items-end gap-2 mb-3">
                        <h2 className={`text-lg font-black ${t.mainText}`}>{title}</h2>
                        {dateStr && <span className="text-xs text-blue-500 font-bold mb-0.5">{dateStr}</span>}
                      </div>
                      <SearchBox dayId={dayId} />
                      <Droppable droppableId={dayId}>
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto space-y-3 min-h-37.5 pb-6 scrollbar-hide">
                            {itinerary[dayId]?.map((item, index) => (
                              <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                                {(prov, snap) => (
                                  <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps} className={`transition-all ${snap.isDragging ? 'z-50 scale-105' : ''}`}>
                                    <div className={`p-4 rounded-xl border flex flex-col backdrop-blur-md transition-all ${snap.isDragging ? 'bg-blue-600 border-white shadow-2xl text-white' : `${t.itemBg} ${t.cardBorder} shadow-sm ${t.itemHover}`}`}>
                                      <div className="flex justify-between items-start mb-2">
                                        <div className="truncate flex-1 pr-2 cursor-pointer" onClick={() => { setActiveTab("map"); setTimeout(() => { if (mapRef.current) { mapRef.current.panTo({ lat: item.lat, lng: item.lng }); mapRef.current.setZoom(16); } }, 100); }}>
                                          <p className={`font-bold text-sm ${snap.isDragging ? 'text-white' : t.mainText}`}>{index + 1}. {item.name}</p>
                                          <p className={`opacity-70 text-[10px] truncate mt-0.5 ${snap.isDragging ? 'text-white' : t.subText}`}>{item.address}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${item.lat},${item.lng}`, '_blank')} className="bg-blue-500/10 text-blue-500 font-bold text-[10px] px-2 py-1 rounded transition-colors hover:bg-blue-500/20">導航</button>
                                          <button onClick={() => { if (window.confirm('確定刪除此景點？')) { setItinerary(prev => ({...prev, [dayId]: prev[dayId].filter(p => p.id !== item.id)})); } }} className={`p-1 text-xs transition-colors hover:text-red-500 ${snap.isDragging ? 'text-white' : t.subText}`}>🗑️</button>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap gap-2 mt-1">
                                        {item.time && <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${snap.isDragging ? 'bg-white/20 border-white/30 text-white' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'}`}>⏰ {item.time}</span>}
                                        {item.stayTime && <span className={`text-[10px] px-2 py-0.5 rounded-md font-bold border ${snap.isDragging ? 'bg-white/20 border-white/30 text-white' : 'bg-purple-500/10 border-purple-500/20 text-purple-600'}`}>⏳ {item.stayTime}分</span>}
                                        {(item.tags || []).map(tag => <span key={String(tag)} className={`text-[10px] px-2 py-0.5 rounded-md border ${snap.isDragging ? 'bg-white/10 border-white/20 text-white' : 'bg-blue-500/10 border-blue-500/20 text-blue-600'}`}>{tag}</span>)}
                                      </div>

                                      {item.memo && <p className={`text-[11px] italic mt-2.5 truncate border-l-2 pl-2 ${snap.isDragging ? 'border-white/50 text-white/90' : `${t.cardBorder} ${t.subText}`}`}>📝 {item.memo}</p>}

                                      <button onClick={() => setEditingItemData({ dayId, item })} className={`mt-3 py-1.5 rounded-lg text-[10px] font-bold transition-colors flex items-center justify-center gap-1 border ${snap.isDragging ? 'bg-white/20 border-white/30 text-white' : `${t.cardMetaBg} ${t.cardBorder} ${t.subText} hover:opacity-70`}`}>
                                        ✏️ 編輯詳細資訊
                                      </button>
                                    </div>

                                    {!snap.isDragging && index < itinerary[dayId].length - 1 && routeDurations[dayId]?.[index] && (
                                      <div className="flex justify-center -mt-2 mb-1 relative z-10">
                                        <div className={`text-[10px] font-bold px-3 py-1 rounded-full border flex items-center gap-1 shadow-md text-blue-500 ${t.cardBg} ${t.cardBorder}`}>
                                          ⬇️ 🚗 車程約 {routeDurations[dayId][index]}
                                        </div>
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
                      <input type="number" value={budget} onChange={e => setBudget(Number(e.target.value))} className={`bg-transparent text-base w-20 outline-none font-bold text-right ${t.mainText}`} />
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
                        if (items.length === 0) return null;
                        const { title, dateStr } = getDayDisplay(day, meta.startDate);
                        return (
                          <div key={String(day)} className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                            <div className="flex justify-between items-center mb-4">
                              <h3 className={`font-bold ${t.mainText}`}>{title} <span className={`text-xs font-normal ml-1 ${t.subText}`}>{dateStr}</span></h3>
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
                                        <p className={`text-sm font-bold ${t.mainText}`}>{e.item}</p>
                                        <p className={`text-[10px] font-bold ${t.subText}`}>{cat.label} • <span className="text-blue-500">{e.payer}</span> 先付</p>
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
                      {expenses.length === 0 && <p className={`text-center mt-10 font-bold ${t.subText}`}>尚無記帳紀錄</p>}
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
                              <div key={member} className={`flex justify-between items-center p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                                <span className={`font-bold ${t.mainText}`}>{member}</span>
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
                        {transfers.length > 0 ? (
                          <div className="space-y-3">
                            {transfers.map((tItem, idx) => (
                              <div key={idx} className={`flex justify-between items-center p-4 rounded-xl border ${t.isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-500/30'}`}>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-red-500">{tItem.from}</span>
                                  <span className={`text-xs ${t.subText}`}>➡️ 轉給 ➡️</span>
                                  <span className="font-bold text-emerald-500">{tItem.to}</span>
                                </div>
                                <span className={`font-mono font-black text-lg ${t.mainText}`}>${Math.round(tItem.amount).toLocaleString()}</span>
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

              {/* 🌟 探索周邊 / 美食地圖 UI */}
              <div className="absolute top-4 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] z-20 flex flex-col gap-2">
                <div className={`flex items-center gap-2 p-2 rounded-2xl shadow-lg backdrop-blur-xl border ${t.headerBg} ${t.cardBorder}`}>
                  <input
                    value={exploreQuery}
                    onChange={e => setExploreQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleExploreSearch(); }}
                    placeholder="探索美食... (ex: 那霸 冰淇淋)"
                    className={`flex-1 bg-transparent px-2 outline-none text-sm font-bold ${t.mainText} placeholder:opacity-50`}
                  />
                  <button onClick={handleExploreSearch} className="bg-orange-500 hover:bg-orange-400 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all active:scale-95 whitespace-nowrap">
                    🍽️ 探索
                  </button>
                  {exploreResults.length > 0 && (
                    <button onClick={() => {setExploreResults([]); setSelectedExploreItem(null); setExploreQuery("");}} className={`px-2 py-2 text-xs font-bold hover:text-red-500 transition-colors ${t.subText}`}>
                      清除
                    </button>
                  )}
                </div>
              </div>

              <Map defaultCenter={{lat: 22.99, lng: 120.20}} defaultZoom={13} mapId={'739af384c474cc02'} onLoad={m => { mapRef.current = m; }}>
                <Directions itinerary={itinerary} dayId={safeCurrentDay} onRouteCalculated={handleRouteCalculated} />

                {/* 顯示目前行程的地標 */}
                {itinerary[safeCurrentDay]?.map((item, idx) => (
                  <AdvancedMarker key={String(item.id)} position={{lat: item.lat, lng: item.lng}}>
                    <Pin background={'#3b82f6'} glyphText={String(idx + 1)} />
                  </AdvancedMarker>
                ))}

                {/* 🌟 顯示探索美食的地標 */}
                {exploreResults.map((place) => (
                  <AdvancedMarker key={place.place_id} position={{lat: place.geometry.location.lat(), lng: place.geometry.location.lng()}} onClick={() => setSelectedExploreItem(place)}>
                    <Pin background={'#f97316'} borderColor={'#c2410c'} glyphColor={'#fff'} glyphText={'🍽️'} />
                  </AdvancedMarker>
                ))}
              </Map>

              {/* 🌟 選擇的探索地點資訊卡 */}
              {selectedExploreItem && (
                <div className="absolute bottom-8 left-4 right-4 md:left-1/2 md:-translate-x-1/2 md:w-[400px] z-20">
                  <div className={`p-5 rounded-3xl shadow-2xl backdrop-blur-2xl border ${t.modalBg} ${t.cardBorder} animate-in slide-in-from-bottom-5`}>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className={`text-lg font-black pr-4 leading-tight ${t.mainText}`}>{selectedExploreItem.name}</h3>
                      <button onClick={() => setSelectedExploreItem(null)} className={`text-lg hover:text-red-500 ${t.subText}`}>✕</button>
                    </div>
                    <p className={`text-xs mb-3 truncate ${t.subText}`}>{selectedExploreItem.formatted_address || selectedExploreItem.vicinity}</p>
                    <div className="flex items-center gap-3 mb-5">
                      {selectedExploreItem.rating && <span className="bg-orange-500/10 text-orange-600 px-2 py-1 rounded-md text-xs font-bold border border-orange-500/20">⭐ {selectedExploreItem.rating}</span>}
                      {selectedExploreItem.user_ratings_total && <span className={`text-[10px] font-bold ${t.subText}`}>({selectedExploreItem.user_ratings_total} 則評論)</span>}
                    </div>
                    <button onClick={() => handleAddExploreToItinerary(selectedExploreItem)} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
                      <span>➕</span> 加入 {getDayDisplay(safeCurrentDay, meta.startDate).title} 行程
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className={`flex md:hidden border-t h-20 shrink-0 z-30 shadow-[0_-10px_20px_rgba(0,0,0,0.1)] pb-safe backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
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
    try { return JSON.parse(localStorage.getItem('google-travel-my-trips')) || []; } catch (e) { console.warn(e); return []; }
  });

  const [customBgColor, setCustomBgColor] = useState(() => {
    try { return localStorage.getItem('google-travel-custom-bg') || '#d8b4e2'; } catch (e) { return '#d8b4e2'; }
  });

  const [activeRoomId, setActiveRoomId] = useState(() => {
    if (typeof window !== 'undefined') return new URLSearchParams(window.location.search).get('room') || null;
    return null;
  });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newMembers, setNewMembers] = useState(["自己"]);
  const [newTransport, setNewTransport] = useState("汽車 🚗");

  const [newThemeColor, setNewThemeColor] = useState("#3b82f6");

  const [showAddMember, setShowAddMember] = useState(false);
  const [tempMember, setTempMember] = useState("");

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

  const handleCreateTrip = () => {
    if (!newTitle.trim() || !newStart || !newEnd) return alert("請填寫完整的名稱與日期區間！");
    const d1 = new Date(newStart);
    const d2 = new Date(newEnd);
    const diffDays = Math.round(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays < 1 || diffDays > 30) return alert("日期錯誤或天數過長！");

    const newRoomId = generateId();
    const initialItinerary = {};
    for (let i = 1; i <= diffDays; i++) initialItinerary[`Day ${i}`] = [];

    const newMeta = { title: newTitle.trim(), destination: newDest, startDate: newStart, endDate: newEnd, members: newMembers, transport: newTransport, themeColor: newThemeColor };

    if (db) set(ref(db, `rooms/${newRoomId}`), { meta: newMeta, itinerary: initialItinerary, expenses: [], budget: 10000 }).catch(e => console.error(e));

    setMyTrips(prev => [...prev, { ...newMeta, roomId: newRoomId }]);
    setShowCreateModal(false);
    window.history.pushState(null, '', `?room=${newRoomId}`);
    setActiveRoomId(newRoomId);

    setNewTitle(""); setNewDest(""); setNewStart(""); setNewEnd(""); setNewMembers(["自己"]); setNewThemeColor("#3b82f6");
  };

  const openTrip = (roomId) => { window.history.pushState(null, '', `?room=${roomId}`); setActiveRoomId(roomId); };
  const closeTrip = () => { window.history.pushState(null, '', window.location.pathname); setActiveRoomId(null); };

  const t = getThemeClasses(customBgColor);

  if (activeRoomId) return <APIProvider apiKey={API_KEY}><TripDetail roomId={activeRoomId} onBack={closeTrip} onUpdateTripMeta={handleUpdateTripMeta} /></APIProvider>;

  return (
    <div style={{ backgroundColor: customBgColor }} className={`flex flex-col h-screen w-screen font-sans overflow-y-auto transition-colors duration-500 ${t.mainText}`}>
      <div className="max-w-5xl w-full mx-auto p-6 md:p-12">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-emerald-400 italic mb-2 tracking-tight drop-shadow-sm">小小痔 ✈️</h1>
            <p className={`font-bold tracking-wide ${t.subText}`}>你的專屬旅程管理中心</p>
          </div>

          <div className="w-full md:w-auto flex flex-row items-center justify-between md:justify-end gap-4">
            <div className={`flex items-center gap-3 p-1.5 pr-4 rounded-full border shadow-sm backdrop-blur-md ${t.isLight ? 'bg-white/50 border-slate-200' : 'bg-black/20 border-white/10'}`}>
              <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
                <input
                  type="color"
                  value={customBgColor}
                  onChange={e => setCustomBgColor(e.target.value)}
                  className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0"
                  title="選擇主頁背景色"
                />
              </div>
              <span className={`text-xs font-bold ${t.subText}`}>自訂大廳色</span>
            </div>

            <button onClick={() => setShowCreateModal(true)} className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-2xl font-bold shadow-lg shadow-blue-500/30 transition-all active:scale-95 flex items-center justify-center gap-2">
              <span>➕</span> <span className="hidden sm:inline">新增一趟旅程</span><span className="sm:hidden">新增</span>
            </button>
          </div>
        </header>

        {myTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-24 opacity-80">
            <span className="text-7xl mb-6 drop-shadow-md">🌍</span>
            <p className={`text-xl font-bold mb-2 ${t.mainText}`}>目前還沒有任何旅程</p>
            <p className={`text-sm ${t.subText}`}>點擊右上角開始規劃你的第一趟冒險！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myTrips.map(trip => {
              const cardColor = trip.themeColor || '#1e293b';
              const cTheme = getThemeClasses(cardColor);

              return (
                <div key={String(trip.roomId)} onClick={() => openTrip(trip.roomId)} style={{ backgroundColor: cardColor }} className={`border rounded-3xl p-6 cursor-pointer transition-all duration-300 group shadow-xl hover:-translate-y-1 hover:shadow-2xl ${cTheme.cardBorder}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${cTheme.isLight ? 'bg-black/5 text-slate-700 border-black/10' : 'bg-white/20 text-white border-white/30'}`}>{trip.transport}</span>
                    <button onClick={(e) => { e.stopPropagation(); if(window.confirm('確定從大廳移除此捷徑？(雲端資料不會刪除)')) setMyTrips(prev => prev.filter(tripItem => tripItem.roomId !== trip.roomId)); }} className={`text-xs p-1 transition-colors hover:text-red-500 ${cTheme.subText}`}>移除</button>
                  </div>
                  <h2 className={`text-2xl font-black mb-1.5 transition-colors line-clamp-2 ${cTheme.mainText}`}>{trip.title}</h2>
                  <p className={`text-sm font-bold mb-5 truncate ${cTheme.subText}`}>📍 {trip.destination || '未定地點'}</p>
                  <div className={`p-3.5 rounded-xl border ${cTheme.cardMetaBg} ${cTheme.cardBorder}`}>
                    <p className={`text-xs mb-1.5 font-medium ${cTheme.subText}`}>📅 {trip.startDate.replace(/-/g, '/')} <span className="mx-1 opacity-50">→</span> {trip.endDate.replace(/-/g, '/')}</p>
                    <p className={`text-xs truncate font-medium ${cTheme.subText}`}>👥 {(trip.members || []).join(', ')}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-100 flex items-center justify-center p-4 transition-opacity">
          <div className={`border rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl overflow-y-auto max-h-[90vh] animate-in zoom-in-95 duration-200 ${t.modalBg} ${t.cardBorder}`}>
            <h2 className={`text-2xl font-black mb-6 ${t.mainText}`}>建立新旅程 🛫</h2>
            <div className="space-y-5">

              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>旅程專屬顏色</label>
                <div className={`flex items-center gap-3 p-2 rounded-xl border ${t.inputBg} ${t.cardBorder}`}>
                  <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white shadow-sm cursor-pointer hover:scale-105 transition-transform">
                    <input type="color" value={newThemeColor} onChange={e => setNewThemeColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" title="選擇此旅程的主題色" />
                  </div>
                  <span className={`text-sm font-bold ${t.mainText}`}>{newThemeColor.toUpperCase()}</span>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>旅程名稱 *</label>
                <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="ex: 瘋狂京阪神五日遊" className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>主要地點</label>
                <input value={newDest} onChange={e => setNewDest(e.target.value)} placeholder="ex: 日本大阪" className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <label className={`block text-[10px] font-bold mb-1 uppercase tracking-wider ${t.subText}`}>出發日期 *</label>
                  <input type="date" onClick={e => { const el = e.target; if ('showPicker' in el && typeof el.showPicker === 'function') el.showPicker(); }} value={newStart} onChange={e => { const val = e.target.value; setNewStart(val); if (!newEnd || newEnd < val) setNewEnd(val); }} className={`w-full py-2 px-3 text-sm rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                </div>
                <div className="flex-1 relative">
                  <label className={`block text-[10px] font-bold mb-1 uppercase tracking-wider ${t.subText}`}>回程日期 *</label>
                  <input type="date" min={newStart} onClick={e => { const el = e.target; if ('showPicker' in el && typeof el.showPicker === 'function') el.showPicker(); }} value={newEnd} onChange={e => setNewEnd(e.target.value)} className={`w-full py-2 px-3 text-sm rounded-xl outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                </div>
              </div>

              <div>
                <label className={`block text-xs font-bold mb-2 uppercase tracking-wider ${t.subText}`}>同行成員 (記帳用)</label>
                <div className={`flex flex-wrap gap-2 items-center p-3 rounded-xl border min-h-14 ${t.inputBg} ${t.cardBorder}`}>
                  {newMembers.map((m, idx) => (
                    <span key={String(m) + idx} className="bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-blue-500/20 shadow-sm">
                      {String(m)}
                      <button onClick={() => setNewMembers(newMembers.filter(name => name !== m))} className="hover:text-red-500 transition-colors">✕</button>
                    </span>
                  ))}
                  {showAddMember ? (
                    <div className={`flex items-center gap-1.5 p-1.5 rounded-lg border border-blue-500 shadow-inner ${t.cardMetaBg}`}>
                      <input autoFocus value={tempMember} onChange={e => setTempMember(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && tempMember.trim()) { if (!newMembers.includes(tempMember.trim())) setNewMembers([...newMembers, tempMember.trim()]); setTempMember(""); setShowAddMember(false); } }} placeholder="名稱..." className={`bg-transparent text-sm outline-none w-20 px-2 ${t.mainText}`} />
                      <button onClick={() => { if (tempMember.trim() && !newMembers.includes(tempMember.trim())) setNewMembers([...newMembers, tempMember.trim()]); setTempMember(""); setShowAddMember(false); }} className="bg-blue-600 text-white rounded p-1 text-xs">✓</button>
                      <button onClick={() => setShowAddMember(false)} className={`hover:opacity-70 p-1 text-xs transition-opacity ${t.subText}`}>✕</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddMember(true)} className={`px-3 py-1.5 rounded-lg text-sm font-bold border border-dashed transition-opacity opacity-70 hover:opacity-100 ${t.subText} ${t.cardBorder}`}>➕ 新增</button>
                  )}
                </div>
              </div>
              <div>
                <label className={`block text-xs font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>主要交通</label>
                <select value={newTransport} onChange={e => setNewTransport(e.target.value)} className={`w-full p-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
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
    </div>
  );
}