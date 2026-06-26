// ============================================================================
// (1) 模組引入與全局設定
// ============================================================================
import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

// 引入 Firebase 與 Helper
import { db } from "./firebase";
import { get, ref as dbRef, set, update } from "firebase/database";
import { API_KEY, APP_VERSION, RELEASE_NOTES } from "./constants";
import {
  extractRoomId,
  generateId,
  getInclusiveDayCount,
  getThemeClasses,
  isValidCoordinates,
  normalizeMembers,
  readJsonStorage,
  readStorage,
  writeStorage
} from "./helpers";

// 引入拆分出去的核心元件與 UI
const TripDetail = lazy(() => import('./TripDetail.jsx'));
// 💡 加上 .jsx 副檔名，幫助編輯器精準定位
import {
  DateRangePickerModal,
  DestinationSearch,
  UpdateNoticeModal
} from './components/UIComponents.jsx';

// ============================================================================
// (2) 核心視圖：首頁大廳 (TravelApp)
// ============================================================================
export default function TravelApp() {
  const [myTrips, setMyTrips] = useState(() => {
    const stored = readJsonStorage('google-travel-my-trips', []);
    return Array.isArray(stored) ? stored : [];
  });
  const [customBgColor, setCustomBgColor] = useState(() => readStorage('google-travel-custom-bg', '#d8b4e2'));
  const [showUpdateNote, setShowUpdateNote] = useState(() => readStorage('google-travel-version', '') !== APP_VERSION);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [tripModalMode, setTripModalMode] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importInput, setImportInput] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newDest, setNewDest] = useState("");
  const [newDestCoords, setNewDestCoords] = useState(null);
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newMembers, setNewMembers] = useState(["自己"]);
  const [newTransport, setNewTransport] = useState("汽車 🚗");
  const [newThemeColor, setNewThemeColor] = useState("#3b82f6");

  // 用於保留原本已經設定的預算，避免編輯時被洗掉
  const [tempMemberBudgets, setTempMemberBudgets] = useState({});

  const [showAddMember, setShowAddMember] = useState(false);
  const [tempMember, setTempMember] = useState("");
  const [activeRoomId, setActiveRoomId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return extractRoomId(new URLSearchParams(window.location.search).get('room')) || null;
  });

  useEffect(() => {
    writeStorage('google-travel-my-trips', JSON.stringify(myTrips));
  }, [myTrips]);

  useEffect(() => {
    writeStorage('google-travel-custom-bg', customBgColor);
  }, [customBgColor]);

  useEffect(() => {
    const handlePopState = () => {
      const roomId = extractRoomId(new URLSearchParams(window.location.search).get('room'));
      setActiveRoomId(roomId || null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleUpdateTripMeta = useCallback((roomId, meta) => {
    if (!roomId || !meta) return;
    setMyTrips((previousTrips) => {
      const nextTrip = { ...meta, roomId };
      const index = previousTrips.findIndex((trip) => trip.roomId === roomId);
      if (index === -1) return [...previousTrips, nextTrip];

      const current = previousTrips[index];
      if (JSON.stringify(current) === JSON.stringify(nextTrip)) return previousTrips;

      const nextTrips = [...previousTrips];
      nextTrips[index] = nextTrip;
      return nextTrips;
    });
  }, []);

  const handleImportTrip = async () => {
    const targetRoomId = extractRoomId(importInput);
    if (!targetRoomId) {
      alert("❌ 房間網址或 ID 格式不正確！");
      return;
    }
    if (!db) {
      alert("⚠️ 尚未連結 Firebase 雲端！");
      return;
    }

    setIsImporting(true);
    try {
      const snapshot = await get(dbRef(db, `rooms/${targetRoomId}/meta`));
      const remoteMeta = snapshot.val();
      if (!remoteMeta) {
        alert("❌ 找不到該旅程，或你沒有讀取權限！");
        return;
      }

      setMyTrips((previousTrips) => {
        const exists = previousTrips.some((trip) => trip.roomId === targetRoomId);
        return exists ? previousTrips : [...previousTrips, { ...remoteMeta, roomId: targetRoomId }];
      });
      setShowImportModal(false);
      setImportInput("");
      alert(`🎉 成功同步雲端旅程：${remoteMeta.title || "未命名旅程"}！`);
    } catch (error) {
      console.error("Import trip failed:", error);
      alert("❌ 匯入失敗，請檢查網路連線或 Firebase 權限！");
    } finally {
      setIsImporting(false);
    }
  };

  const openCreateModal = () => {
    setNewTitle(""); setNewDest(""); setNewDestCoords(null); setNewStart(""); setNewEnd("");
    setNewMembers(["自己"]); setTempMemberBudgets({"自己": 10000});
    setNewTransport("汽車 🚗"); setNewThemeColor("#3b82f6");
    setTripModalMode('create');
  };

  const openEditModal = (e, trip) => {
    e.stopPropagation();
    setNewTitle(trip.title || ""); setNewDest(trip.destination || "");
    setNewDestCoords(isValidCoordinates(trip.destLat, trip.destLng)
      ? { lat: Number(trip.destLat), lng: Number(trip.destLng) }
      : null);
    setNewStart(trip.startDate); setNewEnd(trip.endDate);
    setNewMembers(Array.isArray(trip.members) ? trip.members : ["自己"]);
    setTempMemberBudgets(trip.memberBudgets || {});
    setNewTransport(trip.transport || "汽車 🚗"); setNewThemeColor(trip.themeColor || "#3b82f6");
    setTripModalMode(trip.roomId);
  };

  const handleSaveTripModal = async () => {
    const title = String(newTitle).trim();
    const destination = String(newDest).trim();
    const members = normalizeMembers(newMembers);
    const diffDays = getInclusiveDayCount(newStart, newEnd);

    if (!title || !newStart || !newEnd) {
      alert("請填寫完整的名稱與日期區間！");
      return;
    }
    if (!destination || !isValidCoordinates(newDestCoords)) {
      alert("🌍 請務必從下拉選單選擇精確目的地！");
      return;
    }
    if (diffDays < 1 || diffDays > 30) {
      alert("日期區間錯誤：回程不得早於出發日，且最長為 30 天！");
      return;
    }
    if (!db) {
      alert("⚠️ Firebase 尚未設定，無法建立或更新雲端旅程！");
      return;
    }

    const finalBudgets = Object.fromEntries(
      members.map((member) => {
        const value = Number(tempMemberBudgets[member]);
        return [member, Number.isFinite(value) && value >= 0 ? value : 10000];
      })
    );

    const newMeta = {
      title,
      destination,
      destLat: Number(newDestCoords.lat),
      destLng: Number(newDestCoords.lng),
      startDate: String(newStart),
      endDate: String(newEnd),
      members,
      memberBudgets: finalBudgets,
      transport: String(newTransport),
      themeColor: String(newThemeColor),
      updatedAt: Date.now(),
    };

    setIsSavingTrip(true);
    try {
      if (tripModalMode === 'create') {
        const newRoomId = generateId();
        await set(dbRef(db, `rooms/${newRoomId}`), {
          meta: { ...newMeta, dayThemes: {}, createdAt: Date.now() },
          itinerary: { "Day 1": [] },
          expenses: [],
          tickets: [],
        });
        setMyTrips((previousTrips) => [...previousTrips, { ...newMeta, roomId: newRoomId }]);
        setTripModalMode(null);
        window.history.pushState(null, '', `?room=${encodeURIComponent(newRoomId)}`);
        setActiveRoomId(newRoomId);
      } else {
        const roomId = extractRoomId(tripModalMode);
        if (!roomId) throw new Error("Invalid room ID");
        // update() 只更新指定欄位，不會刪除既有 dayThemes。
        await update(dbRef(db, `rooms/${roomId}/meta`), newMeta);
        setMyTrips((previousTrips) =>
          previousTrips.map((trip) => trip.roomId === roomId ? { ...trip, ...newMeta, roomId } : trip)
        );
        setTripModalMode(null);
      }
    } catch (error) {
      console.error("Save trip failed:", error);
      alert("❌ 儲存失敗，請檢查網路連線或 Firebase 權限！");
    } finally {
      setIsSavingTrip(false);
    }
  };

  const closeTrip = () => {
    window.history.pushState(null, '', window.location.pathname);
    setActiveRoomId(null);
  };

  const closeUpdateNotice = () => {
    writeStorage('google-travel-version', APP_VERSION);
    setShowUpdateNote(false);
  };

  const t = useMemo(() => getThemeClasses(customBgColor), [customBgColor]);
  if (activeRoomId) return (
    <APIProvider apiKey={API_KEY}>
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-white font-bold">載入旅程模組中...</div>}>
        <TripDetail roomId={activeRoomId} onBack={closeTrip} onUpdateTripMeta={handleUpdateTripMeta} />
      </Suspense>
    </APIProvider>
  );

  return (
    <div style={{ backgroundColor: customBgColor }} className={`fixed inset-0 flex flex-col font-sans overflow-x-hidden overscroll-none transition-colors duration-500 w-full max-w-[100vw] ${t.mainText}`}>
      <div className="max-w-5xl w-full mx-auto p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6">
          <div>
            <div className="flex items-center gap-4 mb-2">
              {/* 💡 已將 bg-gradient 修正為 Tailwind v4 的 bg-linear */}
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
                <div key={String(trip.roomId)} onClick={() => { window.history.pushState(null, '', `?room=${encodeURIComponent(trip.roomId)}`); setActiveRoomId(trip.roomId); }} style={{ backgroundColor: cardColor }} className={`border rounded-3xl p-6 cursor-pointer transition-all duration-300 group shadow-xl hover:-translate-y-1 hover:shadow-2xl ${cTheme.cardBorder}`}>
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
            <input value={String(importInput)} onChange={e => setImportInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !isImporting) void handleImportTrip(); }} placeholder="貼上網址或房間 ID..." className={`w-full p-3 rounded-xl outline-none border mb-6 text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            <div className="flex justify-end gap-3"><button onClick={() => setShowImportModal(false)} className={`px-4 py-2 text-sm font-bold ${t.subText}`}>取消</button><button onClick={() => void handleImportTrip()} disabled={isImporting} className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md">{isImporting ? "匯入中..." : "確認匯入"}</button></div>
          </div>
        </div>
      )}

      {tripModalMode && (
        <APIProvider apiKey={API_KEY}>
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

                <div className="z-50 relative">
                  <label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>主要地點 (自動獲取天氣) *</label>
                  <DestinationSearch value={newDest} onChange={(val, coords) => { setNewDest(val); setNewDestCoords(isValidCoordinates(coords) ? coords : null); }} t={t} />
                </div>

                <div><label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅行日期 *</label><div onClick={() => setShowDatePicker(true)} className={`w-full p-3.5 rounded-xl border flex justify-between items-center cursor-pointer ${t.inputBg} ${t.cardBorder} ${t.mainText}`}><span>{newStart && newEnd ? `${String(newStart)} 至 ${String(newEnd)}` : '點擊選擇出發與回程日期'}</span><span>📅</span></div></div>
                <div>
                  <label className={`block text-xs font-bold mb-2 uppercase ${t.subText}`}>同行成員 (記帳用)</label>
                  <div className={`flex flex-wrap gap-2 items-center p-3 rounded-xl border min-h-14 ${t.inputBg} ${t.cardBorder}`}>
                    {(newMembers || []).map((m, idx) => (
                      <span key={`mem-${idx}`} className="bg-blue-500/10 text-blue-500 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 border border-blue-500/20 shadow-sm">
                        {String(m)}
                        <button onClick={() => setNewMembers((members) => normalizeMembers(members.filter((name) => name !== m)))} className="hover:text-red-400 transition-colors" aria-label={`移除 ${String(m)}`}>✕</button>
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
              <div className={`flex justify-end gap-3 mt-8 pt-5 border-t ${t.cardBorder}`}><button onClick={() => setTripModalMode(null)} className={`px-5 py-2.5 text-sm font-bold ${t.mainText}`}>取消</button><button onClick={() => void handleSaveTripModal()} disabled={isSavingTrip} className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-md">{isSavingTrip ? "儲存中..." : (tripModalMode === 'create' ? '確認建立' : '儲存變更')}</button></div>
            </div>
          </div>
        </APIProvider>
      )}

      {showDatePicker && ( <DateRangePickerModal initialStart={newStart} initialEnd={newEnd} onClose={() => setShowDatePicker(false)} onConfirm={(start, end) => { setNewStart(start); setNewEnd(end); setShowDatePicker(false); }} t={t} /> )}
      {showUpdateNote && <UpdateNoticeModal notes={RELEASE_NOTES} onClose={closeUpdateNotice} t={t} />}
    </div>
  );
}