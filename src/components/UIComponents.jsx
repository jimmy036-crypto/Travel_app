// components/UIComponents.jsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useMapsLibrary, useMap } from '@vis.gl/react-google-maps';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { APP_VERSION, CATEGORIES, TAG_OPTIONS } from "../constants";
import { safeUrlFormatter, getDayDisplay, generateId, formatStayTime, parseDateOnlyLocal, extractRoomId, isValidCoordinates, openExternalUrl } from "../helpers";
import { storage } from "../firebase";
import { ref as sRef, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import {
  buildEqualSplit,
  calculateCustomTotal,
  calculateTwdCost,
  inferExpenseSplitState,
  rebalanceCustomAmounts,
  validateCustomSplit,
} from "../features/expenses/expenseCalculations";

const AUTOCOMPLETE_DELAY_MS = 300;
const REGION_AUTOCOMPLETE_TYPES = Object.freeze(['(regions)']);
const MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PLACE_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PLACE_PDF_BYTES = 15 * 1024 * 1024;
const MAX_PLACE_RESOURCES = 12;
const IS_FIREBASE_EMULATOR = import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true';

const getCurrentTimestamp = () => Date.now();

const PLACE_RESOURCE_TYPES = Object.freeze([
  { id: 'menu', icon: '🍽️', label: '菜單' },
  { id: 'reservation', icon: '📅', label: '訂位' },
  { id: 'article', icon: '📝', label: '推薦文章' },
  { id: 'official', icon: '🌐', label: '官網' },
  { id: 'social', icon: '📱', label: '社群' },
  { id: 'other', icon: '🔗', label: '其他' },
]);

const CHECKLIST_CATEGORIES = Object.freeze([
  { id: 'document', icon: '🛂', label: '證件' },
  { id: 'booking', icon: '🧾', label: '預訂' },
  { id: 'connectivity', icon: '📶', label: '網路' },
  { id: 'electronics', icon: '🔌', label: '3C' },
  { id: 'money', icon: '💳', label: '金錢' },
  { id: 'health', icon: '💊', label: '健康' },
  { id: 'clothing', icon: '👕', label: '衣物' },
  { id: 'todo', icon: '✅', label: '代辦' },
  { id: 'other', icon: '📦', label: '其他' },
]);

const SHARED_CHECKLIST_TEMPLATE = Object.freeze([
  { text: '確認所有人的護照效期', category: 'document', important: true, assignee: '所有人' },
  { text: '下載機票、住宿與活動確認單', category: 'booking', important: true, assignee: '所有人' },
  { text: '購買網卡 / eSIM', category: 'connectivity', important: false, assignee: '所有人' },
  { text: '準備萬用轉接頭', category: 'electronics', important: false, assignee: '所有人' },
  { text: '確認機場往返交通', category: 'booking', important: false, assignee: '所有人' },
  { text: '購買旅遊保險', category: 'document', important: false, assignee: '所有人' },
  { text: '準備共用常備藥品', category: 'health', important: false, assignee: '所有人' },
  { text: '確認海外刷卡與外幣需求', category: 'money', important: false, assignee: '所有人' },
]);

const PERSONAL_CHECKLIST_TEMPLATE = Object.freeze([
  { text: '護照 / 身分證', category: 'document', important: true },
  { text: '錢包、信用卡與現金', category: 'money', important: true },
  { text: '手機與充電器', category: 'electronics', important: true },
  { text: '行動電源', category: 'electronics', important: false },
  { text: '常備藥與個人藥品', category: 'health', important: false },
  { text: '盥洗用品', category: 'other', important: false },
  { text: '換洗衣物', category: 'clothing', important: false },
  { text: '耳機與個人 3C', category: 'electronics', important: false },
]);

/** @returns {[any[], () => void]} */
const usePlacePredictions = ({ input, placesLibrary, types = undefined }) => {
  const [resultState, setResultState] = useState({ query: '', items: [] });
  const requestIdRef = useRef(0);
  const query = String(input || '').trim();
  const normalizedTypes = useMemo(() => Array.isArray(types) ? types : undefined, [types]);
  const canSearch = Boolean(placesLibrary && query.length >= 2);

  const clearPredictions = useCallback(() => {
    requestIdRef.current += 1;
    setResultState({ query: '', items: [] });
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    if (!canSearch) return undefined;

    const timer = window.setTimeout(() => {
      // noinspection JSDeprecatedSymbols -- 保留現行 Google Maps 相容流程，避免未啟用新版 API 時功能中斷。
      const service = new placesLibrary.AutocompleteService();
      const request = { input: query, language: 'zh-TW' };
      if (normalizedTypes?.length) request.types = normalizedTypes;

      void service.getPlacePredictions(request, (results, status) => {
        if (requestId !== requestIdRef.current) return;
        const ok = status === window.google?.maps?.places?.PlacesServiceStatus?.OK;
        setResultState({
          query,
          items: ok && Array.isArray(results) ? results : [],
        });
      });
    }, AUTOCOMPLETE_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [canSearch, normalizedTypes, placesLibrary, query]);

  const visiblePredictions = canSearch && resultState.query === query
    ? resultState.items
    : [];

  return [visiblePredictions, clearPredictions];
};

const sanitizeFileName = (name) => String(name || 'ticket')
  .normalize('NFKC')
  .replace(/[^a-zA-Z0-9._-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 120) || 'ticket';

const isAllowedTicketFile = (file) => {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type.startsWith('image/') || type === 'application/pdf' || name.endsWith('.pdf');
};


const isAllowedPlacePhoto = (file) => {
  if (!file) return false;
  return String(file.type || '').toLowerCase().startsWith('image/');
};

const isAllowedPlacePdf = (file) => {
  if (!file) return false;
  const type = String(file.type || '').toLowerCase();
  const name = String(file.name || '').toLowerCase();
  return type === 'application/pdf' || name.endsWith('.pdf');
};

const isImageResource = (resource) => (
  String(resource?.contentType || '').toLowerCase().startsWith('image/')
  || String(resource?.kind || '') === 'image'
);

const isPdfResource = (resource) => (
  String(resource?.contentType || '').toLowerCase() === 'application/pdf'
  || String(resource?.fileName || '').toLowerCase().endsWith('.pdf')
  || String(resource?.kind || '') === 'pdf'
);

const isFileResource = (resource) => Boolean(
  resource?.pendingFile
  || resource?.storagePath
  || String(resource?.kind || '') === 'file'
  || isImageResource(resource)
  || isPdfResource(resource)
);

const formatFileSize = (bytes) => {
  const size = Number(bytes) || 0;
  if (size <= 0) return '';
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const normalizeHttpUrl = (value) => {
  const formatted = safeUrlFormatter(value);
  if (!formatted) return '';
  try {
    const parsed = new URL(formatted);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
  } catch {
    return '';
  }
};

const getPlaceResourceType = (type) => (
  PLACE_RESOURCE_TYPES.find((entry) => entry.id === type) || PLACE_RESOURCE_TYPES.at(-1)
);

/** @returns {any[]} */
const normalizePlaceResources = (resources) => (
  (Array.isArray(resources) ? resources : [])
    .map((resource) => {
      const type = getPlaceResourceType(String(resource?.type || 'other')).id;
      const fallbackLabel = getPlaceResourceType(type).label;
      const pendingFile = resource?.pendingFile || null;
      const fileResource = isFileResource(resource);
      const url = normalizeHttpUrl(resource?.url);

      if (fileResource) {
        if (!url && !pendingFile) return null;
        const contentType = String(
          resource?.contentType
          || pendingFile?.type
          || (String(resource?.fileName || pendingFile?.name || '').toLowerCase().endsWith('.pdf')
            ? 'application/pdf'
            : 'image/jpeg')
        ).toLowerCase();
        return {
          id: String(resource?.id || generateId()),
          kind: 'file',
          type,
          title: String(resource?.title || fallbackLabel).trim().slice(0, 60) || fallbackLabel,
          url,
          storagePath: String(resource?.storagePath || ''),
          fileName: String(resource?.fileName || pendingFile?.name || ''),
          contentType,
          size: Number(resource?.size || pendingFile?.size || 0),
          uploadedAt: Number(resource?.uploadedAt || 0) || null,
          ...(pendingFile ? { pendingFile } : {}),
        };
      }

      if (!url) return null;
      return {
        id: String(resource?.id || generateId()),
        kind: 'link',
        type,
        title: String(resource?.title || fallbackLabel).trim().slice(0, 60) || fallbackLabel,
        url,
      };
    })
    .filter(Boolean)
    .slice(0, MAX_PLACE_RESOURCES)
);

const serializePlaceResources = (resources) => normalizePlaceResources(resources).map((resource) => {
  const serializable = { ...resource };
  Reflect.deleteProperty(serializable, 'pendingFile');
  return serializable;
});

// ============================================================================
// 1. 輕量級 UI 與提示
// ============================================================================
export const LoadingSpinner = ({ t }) => (
  <div className="flex flex-col items-center justify-center h-full w-full bg-transparent">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
    <p className={`font-bold tracking-widest animate-pulse ${t.subText}`}>載入旅程資料中...</p>
  </div>
);

export const UpdateNoticeModal = ({ notes, onClose, t }) => {
  useBodyScrollLock();
  const features = Array.isArray(notes?.features) ? notes.features : [];
  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity" onClick={onClose}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-8 w-full max-w-sm shadow-2xl flex flex-col animate-in zoom-in-95 duration-200 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <div className="text-center mb-6">
          <span className="text-6xl mb-4 block drop-shadow-md">🎉</span>
          <h2 className={`text-2xl font-black mb-1 ${t.mainText}`}>App 更新完成！</h2>
          <p className={`text-xs font-bold ${t.subText}`}>最新版本 {String(notes?.version || APP_VERSION)} • {String(notes?.date || '')}</p>
        </div>
        <div className={`p-5 rounded-2xl border mb-8 space-y-4 shadow-inner overflow-y-auto max-h-[50vh] ${t.cardBg} ${t.cardBorder}`}>
          {features.map((feat, idx) => (
            <div key={`feat-${idx}`} className="flex items-start gap-2">
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
};

// ============================================================================
// 2. 表單與搜尋類元件
// ============================================================================
export const DateRangePickerModal = ({ initialStart, initialEnd, onConfirm, onClose, t }) => {
  useBodyScrollLock();
  const normalize = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const [tempStart, setTempStart] = useState(() => parseDateOnlyLocal(initialStart));
  const [tempEnd, setTempEnd] = useState(() => parseDateOnlyLocal(initialEnd));
  const [viewMonth, setViewMonth] = useState(() => parseDateOnlyLocal(initialStart) || normalize(new Date()));

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

    const emptyDays = Array.from({ length: firstDayIndex });
    const monthDays = Array.from({ length: lastDay }, (_, i) => new Date(year, month, i + 1));

    return (
      <div className="flex-1 w-full md:w-1/2 shrink-0 p-1 md:p-4">
        <h3 className={`text-center font-bold mb-4 ${t.mainText}`}>{year} 年 {month + 1} 月</h3>
        <div className="grid grid-cols-7 text-center text-[11px] mb-2 gap-y-1 md:gap-y-2">
          {['日','一','二','三','四','五','六'].map((d,i) => <div key={`wd-${i}`} className={`font-bold pb-2 ${i===0||i===6 ? 'text-red-500' : t.subText}`}>{String(d)}</div>)}
          {emptyDays.map((_, i) => <div key={`empty-${i}`} />)}
          {monthDays.map(d => {
            const ts = d.getTime();
            const sTime = tempStart?.getTime();
            const eTime = tempEnd?.getTime();
            const isStart = ts === sTime;
            const isEnd = ts === eTime;
            const inRange = Boolean(sTime && eTime && ts > sTime && ts < eTime);

            const dateStyle = isStart
              ? {
                  background: "bg-blue-600 shadow-md",
                  text: "text-white",
                  rounded: tempEnd ? "rounded-l-full" : "rounded-full",
                }
              : isEnd
                ? {
                    background: "bg-blue-600 shadow-md",
                    text: "text-white",
                    rounded: "rounded-r-full",
                  }
                : inRange
                  ? {
                      background: "bg-blue-500/20",
                      text: t.mainText,
                      rounded: "",
                    }
                  : {
                      background: "",
                      text: t.mainText,
                      rounded: "rounded-full hover:bg-black/10 transition-colors",
                    };

            return (
              <div key={`day-${ts}`} className={`relative flex items-center justify-center h-10 ${dateStyle.background} ${dateStyle.rounded}`} onClick={() => handleDayClick(d)}>
                <span className={`w-8 h-8 flex items-center justify-center cursor-pointer ${isStart||isEnd ? 'font-bold' : ''} ${dateStyle.text}`}>{d.getDate()}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden w-full max-w-[100vw]" onClick={onClose}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-5 md:p-8 w-full max-w-2xl shadow-2xl flex flex-col ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6"><h2 className={`text-xl font-black ${t.mainText}`}>選擇旅行日期</h2><button onClick={onClose} className={`w-10 h-10 flex items-center justify-center rounded-full bg-slate-500/10 text-xl hover:text-red-500 transition-colors ${t.subText}`}>✕</button></div>
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

export const DestinationSearch = ({ value, onChange, t }) => {
  const val = String(value || '');
  const lib = useMapsLibrary('places');
  const [sug, clearSug] = usePlacePredictions({
    input: val,
    placesLibrary: lib,
    types: REGION_AUTOCOMPLETE_TYPES,
  });

  const handleSearch = (event) => {
    const nextValue = String(event.target.value);
    // 使用者只要重新輸入，就先清掉舊座標；必須重新點選建議項目才能儲存。
    onChange(nextValue, null);
  };

  const select = (prediction) => {
    if (!lib || !prediction?.place_id) return;
    const selectedText = String(prediction.description || '');
    clearSug();

    // noinspection JSDeprecatedSymbols -- 保留現行 Google Maps 相容流程，避免未啟用新版 API 時功能中斷。
    const service = new lib.PlacesService(document.createElement('div'));
    service.getDetails({ placeId: prediction.place_id, fields: ['geometry'] }, (result, status) => {
      const ok = status === window.google?.maps?.places?.PlacesServiceStatus?.OK;
      const location = result?.geometry?.location;
      if (ok && location) {
        onChange(selectedText, { lat: location.lat(), lng: location.lng() });
      } else {
        onChange(selectedText, null);
        alert('無法取得此目的地的座標，請重新搜尋並選擇。');
      }
    });
  };

  return (
    <div className="relative">
      <input
         className={`w-full p-3.5 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 transition-colors text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
         placeholder="請搜尋並選擇城市 (例如：日本大阪)"
         value={String(val)}
         onChange={handleSearch}
         autoComplete="off"
      />
      {sug.length > 0 ? (
        <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl border overflow-hidden text-sm backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>
          {sug.map((suggestion) => (
            <button key={String(suggestion.place_id)} type="button" onClick={() => select(suggestion)} className={`block w-full text-left p-3 cursor-pointer border-b transition-colors hover:bg-blue-500 hover:text-white ${t.mainText} ${t.cardBorder}`}>
              {String(suggestion.description)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

export const SearchBox = ({ dayId, onAddPlace, t }) => {
  const [val, setVal] = useState("");
  const lib = useMapsLibrary('places');
  const [sug, clearSug] = usePlacePredictions({ input: val, placesLibrary: lib });
  const [isAdding, setIsAdding] = useState(false);

  const select = (prediction) => {
    if (!lib || !prediction?.place_id || isAdding) return;
    setIsAdding(true);
    // noinspection JSDeprecatedSymbols -- 保留現行 Google Maps 相容流程，避免未啟用新版 API 時功能中斷。
    const service = new lib.PlacesService(document.createElement('div'));
    service.getDetails({
      placeId: prediction.place_id,
      fields: ['name', 'geometry', 'formatted_address', 'place_id'],
    }, (result, status) => {
      const ok = status === window.google?.maps?.places?.PlacesServiceStatus?.OK;
      if (ok && result?.geometry?.location) {
        onAddPlace(dayId, result, String(prediction.place_id));
        setVal("");
        clearSug();
      } else {
        alert('無法取得此地點資訊，請重新搜尋。');
      }
      setIsAdding(false);
    });
  };

  const addEmulatorTestPlace = () => {
    if (!IS_FIREBASE_EMULATOR || isAdding) return;

    const testPlace = {
      name: 'E2E 測試餐廳',
      place_id: 'e2e-test-place-id',
      formatted_address: '台北市信義區信義路五段 7 號',
      geometry: {
        location: {
          lat: () => 25.033,
          lng: () => 121.5654,
        },
      },
    };

    setIsAdding(true);
    onAddPlace(dayId, testPlace, testPlace.place_id);
    setVal("");
    clearSug();
    setIsAdding(false);
  };

  return (
    <div className="relative mb-4" data-testid="place-search-box">
      <input
        data-testid="place-search-input"
        className={`w-full py-2.5 px-4 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500 transition-colors border ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
        placeholder={isAdding ? '加入中...' : '新增行程地點...'}
        value={String(val)}
        onChange={(event) => setVal(String(event.target.value))}
        disabled={isAdding}
        autoComplete="off"
      />

      {IS_FIREBASE_EMULATOR ? (
        <button
          type="button"
          data-testid="add-emulator-place-button"
          onClick={addEmulatorTestPlace}
          disabled={isAdding}
          className="mt-2 min-h-11 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 text-xs font-black text-amber-600 active:scale-[0.99] disabled:opacity-50"
        >
          🧪 加入 E2E 測試景點
        </button>
      ) : null}

      {Array.isArray(sug) && sug.length > 0 ? (
        <div className={`absolute z-50 w-full mt-1 rounded-xl shadow-2xl border overflow-hidden text-xs backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>
          {sug.map((suggestion) => (
            <button key={String(suggestion.place_id)} type="button" onClick={() => select(suggestion)} className={`block w-full text-left p-3 cursor-pointer border-b transition-colors hover:opacity-80 ${t.mainText} ${t.cardBorder}`}>
              {String(suggestion.description)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// ============================================================================
// 3. 記帳與票券元件
// ============================================================================
const CURRENCIES = [
  { code: "TWD", rate: 1, label: "台幣 (TWD)" },
  { code: "JPY", rate: 0.21, label: "日幣 (JPY)" },
  { code: "USD", rate: 32.5, label: "美金 (USD)" },
  { code: "KRW", rate: 0.024, label: "韓元 (KRW)" },
  { code: "EUR", rate: 35.0, label: "歐元 (EUR)" },
  { code: "THB", rate: 0.023, label: "泰銖 (THB)" }
];

export const ExpenseModal = ({
  members,
  existingDays,
  startDate,
  defaultDay,
  expense = null,
  onClose,
  onSave,
  onDelete,
  onDuplicate,
  t,
}) => {
  useBodyScrollLock();

  const validMembers = useMemo(
    () => [...new Set((Array.isArray(members) ? members : []).map(String).filter(Boolean))],
    [members]
  );
  const validDays = useMemo(
    () => (Array.isArray(existingDays) ? existingDays.map(String) : []),
    [existingDays]
  );
  const isEditing = Boolean(expense?.id);
  const initialCurrency = CURRENCIES.some(option => option.code === expense?.currency)
    ? String(expense.currency)
    : "TWD";
  const currencyDefaultRate = CURRENCIES.find(option => option.code === initialCurrency)?.rate || 1;
  const initialRate = Number(expense?.exchangeRate) > 0
    ? Number(expense.exchangeRate)
    : currencyDefaultRate;
  const initialLocalCost = Number(expense?.localCost) > 0
    ? Number(expense.localCost)
    : Number(expense?.cost) > 0
      ? Math.round((Number(expense.cost) / initialRate) * 100) / 100
      : "";
  const initialDay = validDays.includes(String(expense?.dayId || ""))
    ? String(expense.dayId)
    : validDays.includes(String(defaultDay || ""))
      ? String(defaultDay)
      : (validDays[0] || "");
  const initialPayer = validMembers.includes(String(expense?.payer || ""))
    ? String(expense.payer)
    : (validMembers[0] || "自己");
  const initialCategory = CATEGORIES.some(option => option.id === expense?.category)
    ? String(expense.category)
    : "food";

  const initialSplitState = useMemo(() => inferExpenseSplitState({
    expense,
    isEditing,
    members: validMembers,
  }), [expense, isEditing, validMembers]);

  const [item, setItem] = useState(() => String(expense?.item || ""));
  const [localCost, setLocalCost] = useState(() => String(initialLocalCost));
  const [currency, setCurrency] = useState(initialCurrency);
  const [rate, setRate] = useState(() => String(initialRate));
  const [dayId, setDayId] = useState(initialDay);
  const [category, setCategory] = useState(initialCategory);
  const [payer, setPayer] = useState(initialPayer);
  const [splitType, setSplitType] = useState(initialSplitState.type);
  const [involved, setInvolved] = useState(initialSplitState.involved);
  const [customAmounts, setCustomAmounts] = useState(initialSplitState.customAmounts);
  const [note, setNote] = useState(() => String(expense?.note || ""));

  const twdCost = calculateTwdCost(localCost, rate);
  const customTotal = calculateCustomTotal(validMembers, customAmounts);

  const [initialFingerprint] = useState(() => JSON.stringify({
    item: String(expense?.item || ""),
    localCost: String(initialLocalCost),
    currency: initialCurrency,
    rate: String(initialRate),
    dayId: initialDay,
    category: initialCategory,
    payer: initialPayer,
    splitType: initialSplitState.type,
    involved: initialSplitState.involved,
    customAmounts: initialSplitState.customAmounts,
    note: String(expense?.note || ""),
  }));

  const currentFingerprint = JSON.stringify({
    item,
    localCost,
    currency,
    rate,
    dayId,
    category,
    payer,
    splitType,
    involved,
    customAmounts,
    note,
  });
  const hasUnsavedChanges = currentFingerprint !== initialFingerprint;

  const requestClose = () => {
    if (hasUnsavedChanges && !window.confirm("尚有未儲存的記帳變更，確定要離開嗎？")) return;
    onClose();
  };

  const handleCurrencyChange = (event) => {
    const nextCurrency = String(event.target.value);
    setCurrency(nextCurrency);
    const found = CURRENCIES.find(option => option.code === nextCurrency);
    if (found) setRate(String(found.rate));
  };

  const rebalanceCustomSplit = () => {
    const next = rebalanceCustomAmounts({
      total: twdCost,
      members: validMembers,
      customAmounts,
    });
    if (next) setCustomAmounts(next);
  };

  const buildExpense = ({ duplicate = false, timestamp = 0 } = {}) => {
    const normalizedItem = String(item).trim();
    const numericLocalCost = Number(localCost);
    const numericRate = Number(rate);

    if (!normalizedItem || !Number.isFinite(numericLocalCost) || numericLocalCost <= 0) {
      alert("請輸入有效的項目名稱與金額！");
      return null;
    }
    if (!dayId || !validDays.includes(dayId)) {
      alert("找不到可用的旅程日期，請重新選擇。");
      return null;
    }
    if (!Number.isFinite(numericRate) || numericRate <= 0) {
      alert("請輸入大於 0 的有效匯率！");
      return null;
    }
    if (!validMembers.includes(payer)) {
      alert("代墊人已不在旅程成員中，請重新選擇。");
      return null;
    }

    let finalSplit = {};
    if (splitType === "EQUAL") {
      const result = buildEqualSplit({
        total: twdCost,
        members: validMembers,
        involved,
      });
      if (!result.ok) {
        alert("請至少選擇一位參與分帳的人員！");
        return null;
      }
      finalSplit = result.split;
    } else {
      const result = validateCustomSplit({
        total: twdCost,
        members: validMembers,
        customAmounts,
      });
      if (!result.ok) {
        if (result.error === "NEGATIVE_AMOUNT") {
          alert("自訂分帳金額不可為負數！");
        } else {
          alert(`分帳總和（NT$${result.customTotal.toLocaleString()}）與折合台幣總計（NT$${twdCost.toLocaleString()}）不符！`);
        }
        return null;
      }
      finalSplit = result.split;
    }

    const now = Number(timestamp) || 0;
    if (now <= 0) return null;

    return {
      ...(expense && typeof expense === "object" ? expense : {}),
      id: duplicate || !isEditing ? generateId() : String(expense.id),
      dayId: String(dayId),
      item: normalizedItem,
      cost: twdCost,
      localCost: numericLocalCost,
      currency: String(currency),
      exchangeRate: numericRate,
      category: String(category),
      payer: String(payer),
      split: finalSplit,
      note: String(note).trim(),
      createdAt: duplicate || !isEditing ? now : (Number(expense?.createdAt) || now),
      updatedAt: now,
    };
  };

  const handleSave = () => {
    const nextExpense = buildExpense({ timestamp: getCurrentTimestamp() });
    if (nextExpense) onSave(nextExpense);
  };

  const handleDuplicate = () => {
    const duplicatedExpense = buildExpense({ duplicate: true, timestamp: getCurrentTimestamp() });
    if (duplicatedExpense) onDuplicate?.(duplicatedExpense);
  };

  const handleDelete = () => {
    if (!isEditing || !onDelete) return;
    if (window.confirm(`確定刪除「${String(expense.item || "這筆帳目")}」嗎？此動作無法復原。`)) {
      onDelete(String(expense.id));
    }
  };

  return (
    <div
      data-testid="expense-modal"
      data-mode={isEditing ? "edit" : "create"}
      style={{ zIndex: 9999, touchAction: "pan-y" }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-hidden w-full max-w-[100vw]"
      onClick={requestClose}
    >
      <div
        style={{ touchAction: "pan-y", WebkitOverflowScrolling: "touch" }}
        className={`border rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[94dvh] sm:max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 ${t.modalBg} ${t.cardBorder}`}
        onClick={event => event.stopPropagation()}
      >
        <div className={`flex items-start justify-between gap-4 p-5 sm:p-6 border-b shrink-0 ${t.cardBorder}`}>
          <div>
            <h2
              data-testid="expense-modal-title"
              className={`text-xl font-black flex items-center gap-2 ${t.mainText}`}
            >
              {isEditing ? "✏️ 編輯帳目" : "💰 新增記帳"}
            </h2>
            <p className={`text-[11px] mt-1 ${t.subText}`}>
              {isEditing ? "修改後，結算、預算與圓餅圖會自動重新計算。" : "記錄付款人、分攤方式與外幣金額。"}
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            className={`w-11 h-11 rounded-full flex items-center justify-center bg-slate-500/10 text-lg shrink-0 hover:text-red-500 ${t.subText}`}
            aria-label="關閉記帳視窗"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-5 sm:px-6 py-5 space-y-5 scrollbar-hide flex-1">
          <div>
            <label className={`block text-[10px] font-bold mb-1.5 uppercase ${t.subText}`}>項目名稱 *</label>
            <input
              data-testid="expense-item-input"
              value={item}
              onChange={event => setItem(event.target.value)}
              placeholder="例如：晚餐燒肉、北部住宿"
              autoFocus={!isEditing}
              className={`w-full py-3 px-3.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-base sm:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
            />
          </div>

          <div className="grid grid-cols-[minmax(110px,0.85fr)_minmax(0,1.4fr)] gap-2 items-end">
            <div>
              <label className={`block text-[10px] font-bold mb-1.5 uppercase ${t.subText}`}>幣別</label>
              <select
                data-testid="expense-currency-select"
                value={currency}
                onChange={handleCurrencyChange}
                className={`w-full py-3 px-2 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border text-xs font-bold ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              >
                {CURRENCIES.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
              </select>
            </div>
            <div>
              <label className={`block text-[10px] font-bold mb-1.5 uppercase ${t.subText}`}>當地金額 *</label>
              <input
                data-testid="expense-local-cost-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={localCost}
                onChange={event => setLocalCost(event.target.value)}
                placeholder="0"
                className={`w-full py-3 px-3.5 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 border font-mono font-bold text-emerald-500 text-base ${t.inputBg} ${t.cardBorder}`}
              />
            </div>
          </div>

          <div className={`p-3.5 rounded-xl border flex items-center justify-between gap-4 ${t.cardMetaBg} ${t.cardBorder}`}>
            <div className="min-w-0">
              <span className={`text-[10px] font-bold uppercase ${t.subText}`}>換算匯率</span>
              <input
                data-testid="expense-rate-input"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                value={rate}
                onChange={event => setRate(event.target.value)}
                className={`block bg-transparent outline-none font-mono text-sm mt-1 w-24 ${t.mainText}`}
              />
            </div>
            <div className="text-right shrink-0">
              <span className={`text-[10px] font-bold uppercase block ${t.subText}`}>折合台幣</span>
              <span
                data-testid="expense-twd-total"
                className="text-lg font-black font-mono text-emerald-500"
              >
                NT$ {twdCost.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={`block text-[10px] font-bold mb-1.5 uppercase ${t.subText}`}>日期</label>
              <select
                data-testid="expense-day-select"
                value={dayId}
                onChange={event => setDayId(event.target.value)}
                className={`w-full py-3 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              >
                {validDays.map(day => (
                  <option key={`day-${day}`} value={day}>
                    {day === "PRE_TRIP" ? "行前支出（出發前）" : `${getDayDisplay(day, startDate).title} ${getDayDisplay(day, startDate).dateStr}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={`block text-[10px] font-bold mb-1.5 uppercase ${t.subText}`}>代墊人</label>
              <select
                data-testid="expense-payer-select"
                value={payer}
                onChange={event => setPayer(event.target.value)}
                className={`w-full py-3 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              >
                {validMembers.map(member => <option key={`payer-${member}`} value={member}>{member}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase ${t.subText}`}>分類</label>
            <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-hide">
              {CATEGORIES.map(option => (
                <button
                  type="button"
                  key={option.id}
                  data-testid="expense-category-button"
                  data-category={option.id}
                  onClick={() => setCategory(option.id)}
                  className={`min-h-11 px-4 py-2 rounded-xl border flex items-center gap-2 whitespace-nowrap transition-all ${category === option.id ? `${option.color} border-transparent text-white shadow-md` : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}
                >
                  <span>{option.icon}</span><span className="text-xs font-bold">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`p-4 rounded-2xl border ${t.cardMetaBg} ${t.cardBorder}`}>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-3">
              <label className={`text-xs font-bold ${t.subText}`}>分帳方式</label>
              <div className={`flex rounded-lg p-1 border ${t.cardBg} ${t.cardBorder}`}>
                <button
                  type="button"
                  data-testid="expense-split-equal-button"
                  onClick={() => setSplitType("EQUAL")}
                  className={`flex-1 px-3 py-2 text-[11px] font-bold rounded-md ${splitType === "EQUAL" ? "bg-blue-600 text-white" : t.subText}`}
                >
                  勾選平分
                </button>
                <button
                  type="button"
                  data-testid="expense-split-custom-button"
                  onClick={() => setSplitType("CUSTOM")}
                  className={`flex-1 px-3 py-2 text-[11px] font-bold rounded-md ${splitType === "CUSTOM" ? "bg-purple-600 text-white" : t.subText}`}
                >
                  自訂金額
                </button>
              </div>
            </div>

            {splitType === "EQUAL" ? (
              <div className="space-y-3">
                <p className={`text-[10px] ${t.subText}`}>勾選實際參與這筆消費的人員；個人消費只勾選自己。</p>
                <div className="flex flex-wrap gap-2">
                  {validMembers.map(member => {
                    const selected = involved.includes(member);
                    return (
                      <button
                        type="button"
                        key={`inv-${member}`}
                        data-testid="expense-involved-member"
                        data-member={member}
                        aria-pressed={selected}
                        onClick={() => setInvolved(selected ? involved.filter(value => value !== member) : [...involved, member])}
                        className={`min-h-11 px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${selected ? "bg-blue-500/20 border-blue-500 text-blue-600" : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}
                      >
                        {selected ? "✓" : "○"} {member}
                      </button>
                    );
                  })}
                </div>
                {twdCost > 0 && involved.length > 0 ? (
                  <p className="text-[11px] text-emerald-500 font-mono text-right font-bold">
                    每人分攤約 NT$ {Math.round(twdCost / involved.length).toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className={`text-[10px] ${t.subText}`}>直接輸入每位成員應負擔的台幣金額。</p>
                  <button
                    type="button"
                    onClick={rebalanceCustomSplit}
                    className="shrink-0 text-[10px] font-bold text-purple-600 hover:underline"
                  >
                    依比例重算
                  </button>
                </div>
                {validMembers.map(member => (
                  <div key={`cust-${member}`} className="flex justify-between items-center gap-3">
                    <span className={`text-sm font-bold ${t.mainText}`}>{member}</span>
                    <input
                      data-testid="expense-custom-amount-input"
                      data-member={member}
                      aria-label={`${member} 自訂分帳金額`}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={customAmounts[member] || ""}
                      onChange={event => setCustomAmounts({ ...customAmounts, [member]: event.target.value })}
                      placeholder="0"
                      className={`w-28 p-2.5 rounded-lg font-mono text-right outline-none focus:ring-2 focus:ring-purple-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
                    />
                  </div>
                ))}
                {twdCost > 0 ? (
                  <div className={`border-t pt-3 mt-2 flex justify-between items-center ${t.cardBorder}`}>
                    <span className={`text-xs ${t.subText}`}>目前總和</span>
                    <span
                      data-testid="expense-custom-total"
                      className={`text-sm font-bold font-mono ${Math.abs(customTotal - twdCost) <= 0.02 ? "text-emerald-500" : "text-red-500"}`}
                    >
                      NT$ {customTotal.toLocaleString()} / {twdCost.toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div>
            <label className={`block text-[10px] font-bold mb-1.5 uppercase ${t.subText}`}>備註（選填）</label>
            <textarea
              data-testid="expense-note-input"
              value={note}
              onChange={event => setNote(event.target.value)}
              placeholder="例如：已含服務費、刷卡、需向店家退稅"
              maxLength={300}
              className={`w-full min-h-20 p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border resize-none text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
            />
          </div>

          {isEditing ? (
            <details
              data-testid="expense-more-actions"
              className={`rounded-xl border p-3 ${t.cardBg} ${t.cardBorder}`}
            >
              <summary className={`cursor-pointer text-xs font-bold ${t.subText}`}>更多操作</summary>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  data-testid="expense-duplicate-button"
                  onClick={handleDuplicate}
                  className={`min-h-11 rounded-xl border text-xs font-bold hover:border-blue-500 hover:text-blue-500 ${t.cardBorder} ${t.mainText}`}
                >
                  📄 複製成新帳目
                </button>
                <button
                  type="button"
                  data-testid="expense-delete-button"
                  onClick={handleDelete}
                  className="min-h-11 rounded-xl border border-red-500/30 text-xs font-bold text-red-500 hover:bg-red-500 hover:text-white"
                >
                  🗑️ 刪除帳目
                </button>
              </div>
            </details>
          ) : null}
        </div>

        <div
          className={`flex gap-3 p-4 sm:px-6 sm:py-5 border-t shrink-0 ${t.cardBorder}`}
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <button
            type="button"
            data-testid="expense-cancel-button"
            onClick={requestClose}
            className={`min-h-12 px-5 text-sm font-bold rounded-xl border flex-1 ${t.cardBorder} ${t.mainText}`}
          >
            取消
          </button>
          <button
            type="button"
            data-testid="expense-save-button"
            onClick={handleSave}
            className="min-h-12 bg-emerald-600 hover:bg-emerald-500 text-white px-6 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all flex-[1.4]"
          >
            {isEditing ? "儲存變更" : "確認新增"}
          </button>
        </div>
      </div>
    </div>
  );
};
export const TicketModal = ({ roomId, members, onClose, onSave, t }) => {
  useBodyScrollLock();
  const validMembers = Array.isArray(members) ? members : [];
  const safeRoomId = extractRoomId(roomId);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("image");
  const [url, setUrl] = useState("");
  const [memo, setMemo] = useState("");
  const [owner, setOwner] = useState("所有人");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const ownerOptions = ["所有人", ...validMembers];

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) {
      setFile(null);
      return;
    }
    if (!isAllowedTicketFile(selectedFile)) {
      event.target.value = '';
      setFile(null);
      alert('只允許上傳圖片或 PDF 檔案！');
      return;
    }
    if (selectedFile.size > MAX_TICKET_FILE_BYTES) {
      event.target.value = '';
      setFile(null);
      alert('檔案不可超過 10 MB！');
      return;
    }
    setFile(selectedFile);
  };

  const handleSave = async () => {
    const normalizedTitle = String(title).trim();
    if (!normalizedTitle) return alert("請輸入票券名稱！");
    if (!ownerOptions.includes(owner)) return alert('票券持有人資料已變更，請重新選擇。');

    const ticketId = generateId();
    let finalUrl = "";
    let finalType = type;
    let storagePath = "";

    if (type === "image") {
      if (!file) return alert("請選擇圖片或 PDF 檔案！");
      if (!storage) return alert("尚未設定 Firebase Storage！");
      if (!safeRoomId) return alert('旅程房間 ID 無效，無法上傳票券。');

      setUploading(true);
      try {
        storagePath = `rooms/${safeRoomId}/tickets/${ticketId}/${sanitizeFileName(file.name)}`;
        const fileRef = sRef(storage, storagePath);
        const uploadTask = uploadBytesResumable(fileRef, file, {
          contentType: file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream'),
          customMetadata: { roomId: safeRoomId, ticketId },
        });

        const snapshot = await new Promise((resolve, reject) => {
          let timedOut = false;
          const timer = window.setTimeout(() => {
            timedOut = true;
            uploadTask.cancel();
            reject(new Error('Timeout'));
          }, 30000);

          uploadTask.on(
            'state_changed',
            undefined,
            (error) => {
              window.clearTimeout(timer);
              if (!timedOut) reject(error);
            },
            () => {
              window.clearTimeout(timer);
              resolve(uploadTask.snapshot);
            },
          );
        });

        finalUrl = await getDownloadURL(snapshot.ref);
        if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) finalType = "pdf";
      } catch (error) {
        console.error('Ticket upload failed:', error);
        alert(error?.message === "Timeout" ? "⚠️ 上傳超過 30 秒，已取消，請確認網路後重試！" : "上傳失敗，請稍後再試！");
        return;
      } finally {
        setUploading(false);
      }
    } else {
      finalUrl = safeUrlFormatter(url);
      if (!finalUrl) return alert("請輸入有效的 http 或 https 網址連結！");
    }

    onSave({
      id: ticketId,
      title: normalizedTitle,
      type: String(finalType),
      url: String(finalUrl).trim(),
      storagePath,
      memo: String(memo).trim(),
      owner: String(owner),
      createdAt: Date.now(),
    });
  };

  return (
    <div data-testid="ticket-modal" style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden w-full max-w-[100vw]" onClick={onClose}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
        <h2 className={`text-xl font-black mb-5 flex items-center gap-2 ${t.mainText}`}>🎟️ 新增票券 / 附件</h2>
        <div className="overflow-y-auto pr-2 space-y-5 scrollbar-hide">
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>票券名稱 *</label>
            <input data-testid="ticket-title-input" value={String(title)} maxLength={80} onChange={e => setTitle(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>使用分配人員</label>
            <select data-testid="ticket-owner-select" value={String(owner)} onChange={e => setOwner(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
               {ownerOptions.map(opt => <option key={`opt-${opt}`} value={String(opt)}>{String(opt)}</option>)}
            </select>
          </div>
          <div className={`p-1 flex rounded-lg border mt-2 ${t.cardBg} ${t.cardBorder}`}>
            <button type="button" onClick={() => setType('image')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === 'image' ? 'bg-blue-600 text-white shadow-sm' : t.subText}`}>📷 上傳檔案</button>
            <button type="button" onClick={() => setType('link')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${type === 'link' ? 'bg-blue-600 text-white shadow-sm' : t.subText}`}>🔗 網址連結</button>
          </div>
          {type === 'image' ? (
             <div className={`p-4 rounded-xl border flex flex-col items-center justify-center gap-2 border-dashed ${t.cardBg} ${t.cardBorder}`}>
                <input data-testid="ticket-file-input" type="file" accept="image/*,application/pdf" onChange={handleFileChange} className={`text-xs ${t.mainText} w-full`} />
                <p className={`text-[10px] ${t.subText}`}>僅限圖片或 PDF，單檔上限 10 MB</p>
                {file ? <p className="text-[10px] text-emerald-500 font-bold">已選擇：{String(file.name)}（{(file.size / 1024 / 1024).toFixed(2)} MB）</p> : null}
             </div>
          ) : (
            <div>
              <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>連結網址 *</label>
              <input value={String(url)} onChange={e => setUrl(e.target.value)} placeholder="https://..." className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
            </div>
          )}
          <div>
            <label className={`block text-[10px] font-bold mb-1 uppercase ${t.subText}`}>座位 / 備註</label>
            <input data-testid="ticket-memo-input" value={String(memo)} maxLength={200} onChange={e => setMemo(e.target.value)} className={`w-full py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-6 pt-5 border-t ${t.cardBorder}`}>
          <button type="button" data-testid="ticket-cancel-button" onClick={onClose} disabled={uploading} className={`px-5 py-2 text-sm font-bold opacity-70 hover:opacity-100 disabled:opacity-30 ${t.mainText}`}>取消</button>
          <button type="button" data-testid="ticket-save-button" onClick={() => void handleSave()} disabled={uploading} className={`bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 transition-all ${uploading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}>
            {uploading ? '上傳儲存中...' : '確認新增'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const FullscreenTicketModal = ({ ticket, onClose }) => {
  useEffect(() => {
    let wakeLock = null;
    const requestWakeLock = async () => {
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ }
    };
    void requestWakeLock();
    return () => { if (wakeLock) void wakeLock.release(); };
  }, []);

  return (
    <div style={{ zIndex: 99999, touchAction: 'none' }} className="fixed inset-0 bg-white flex flex-col p-6 animate-in fade-in zoom-in-95 duration-200" onClick={onClose}>
      <div className="flex justify-between items-center mb-8 mt-safe">
         <div className="flex flex-col">
            <h2 className="text-2xl font-black text-slate-900">{String(ticket.title)}</h2>
            <span className="text-blue-600 text-sm font-bold mt-1">👤 尊屬持有人: {String(ticket.owner || '所有人')}</span>
         </div>
         <button onClick={onClose} className="w-12 h-12 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center font-bold text-xl shadow-sm">✕</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center pb-20">
         <img src={ticket.url} alt="ticket" className="w-full h-full max-h-[70vh] object-contain drop-shadow-xl" />
         {ticket.memo ? <p className="mt-8 text-slate-700 text-base font-bold bg-slate-50 px-6 py-3 rounded-xl border border-slate-200 shadow-inner">{String(ticket.memo)}</p> : null}
      </div>
    </div>
  );
};

export const CopyItemModal = ({ item, existingDays, onClose, onCopy, t }) => {
  useBodyScrollLock();
  const validDays = Array.isArray(existingDays) ? existingDays : [];
  const [targetDay, setTargetDay] = useState(validDays.length > 0 ? validDays[0] : "");
  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden w-full max-w-[100vw]" onClick={onClose}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-xs shadow-2xl flex flex-col ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <h3 className={`text-lg font-black mb-2 ${t.mainText}`}>📋 複製景點</h3>
        <p className={`text-xs mb-4 ${t.subText}`}>將「{String(item.customName || item.name)}」複製到：</p>
        <select value={String(targetDay)} onChange={e => setTargetDay(e.target.value)} className={`w-full py-2.5 px-3 mb-6 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
           {validDays.map(d => <option key={`cd-${d}`} value={String(d)}>{String(d)}</option>)}
        </select>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className={`px-4 py-2 text-sm font-bold opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button onClick={() => onCopy(targetDay, item)} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-sm font-bold shadow-md">確認複製</button>
        </div>
      </div>
    </div>
  );
};

export const EditItemModal = ({ item, roomId, onSave, onClose, t }) => {
  useBodyScrollLock();
  const safeRoomId = extractRoomId(roomId);
  const [customName, setCustomName] = useState(item.customName || "");
  const [time, setTime] = useState(item.time || "");
  const [stayTime, setStayTime] = useState(item.stayTime !== undefined ? item.stayTime : "0");
  const [memo, setMemo] = useState(item.memo || "");
  const [tags, setTags] = useState(Array.isArray(item.tags) ? item.tags : []);
  const [autoCascade, setAutoCascade] = useState(true);

  const [legMode, setLegMode] = useState(item.nextLeg?.mode || "AUTO");
  const [legMins, setLegMins] = useState(item.nextLeg?.mins || 30);
  const [navigationUrl, setNavigationUrl] = useState(item.navigationUrl || '');

  const [showResources, setShowResources] = useState(
    Boolean(item.placePhoto?.url || (Array.isArray(item.resources) && item.resources.length > 0))
  );
  const [resources, setResources] = useState(() => normalizePlaceResources(item.resources));
  const [resourceAddMode, setResourceAddMode] = useState('image');
  const [resourceDraft, setResourceDraft] = useState({ type: 'menu', title: '', url: '' });
  const [imageDraft, setImageDraft] = useState({ type: 'menu', title: '', file: null });
  const [pdfDraft, setPdfDraft] = useState({ type: 'menu', title: '', file: null });
  const [editingResourceId, setEditingResourceId] = useState('');
  const [editingResourceKind, setEditingResourceKind] = useState('');
  const [photoFile, setPhotoFile] = useState(null);
  const [removeExistingPhoto, setRemoveExistingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const photoObjectUrl = useMemo(
    () => photoFile ? URL.createObjectURL(photoFile) : '',
    [photoFile]
  );

  useEffect(() => () => {
    if (photoObjectUrl) URL.revokeObjectURL(photoObjectUrl);
  }, [photoObjectUrl]);

  const visiblePhotoUrl = photoObjectUrl || (!removeExistingPhoto ? String(item.placePhoto?.url || '') : '');
  const imageCount = resources.filter(isImageResource).length;
  const pdfCount = resources.filter(isPdfResource).length;
  const linkCount = resources.filter((resource) => !isFileResource(resource)).length;
  const menuCount = resources.filter((resource) => resource.type === 'menu').length;
  const resourceSummary = [
    visiblePhotoUrl ? '1 張封面' : '',
    menuCount > 0 ? `${menuCount} 筆菜單` : '',
    imageCount > 0 ? `${imageCount} 張資料圖片` : '',
    pdfCount > 0 ? `${pdfCount} 份 PDF` : '',
    linkCount > 0 ? `${linkCount} 個網址` : '',
  ].filter(Boolean).join('・') || '尚未加入資料';
  const hasPendingUploads = Boolean(photoFile || resources.some((resource) => resource?.pendingFile));

  const handleQuickTime = (addMins) => setStayTime(prev => String((Number(prev) || 0) + Number(addMins)));

  const handlePhotoChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) return;
    if (!isAllowedPlacePhoto(selectedFile)) {
      event.target.value = '';
      alert('只能上傳圖片檔案。');
      return;
    }
    if (selectedFile.size > MAX_PLACE_PHOTO_BYTES) {
      event.target.value = '';
      alert('景點照片不可超過 5 MB。');
      return;
    }
    setPhotoFile(selectedFile);
    setRemoveExistingPhoto(false);
    setShowResources(true);
  };

  const resetResourceDrafts = () => {
    setResourceDraft({ type: 'menu', title: '', url: '' });
    setImageDraft({ type: 'menu', title: '', file: null });
    setPdfDraft({ type: 'menu', title: '', file: null });
    setEditingResourceId('');
    setEditingResourceKind('');
  };

  const handleSaveResource = () => {
    const url = normalizeHttpUrl(resourceDraft.url);
    if (!url) return alert('請輸入有效的 http 或 https 網址。');

    const typeMeta = getPlaceResourceType(resourceDraft.type);
    const title = String(resourceDraft.title || typeMeta.label).trim().slice(0, 60) || typeMeta.label;
    const editingLink = editingResourceId && editingResourceKind === 'link';

    if (!editingLink && resources.length >= MAX_PLACE_RESOURCES) {
      return alert(`每個景點最多可加入 ${MAX_PLACE_RESOURCES} 筆快速資料。`);
    }

    const duplicate = resources.some((resource) => (
      resource.url === url && resource.id !== editingResourceId
    ));
    if (duplicate) return alert('這個網址已經加入過了。');

    const nextResource = {
      id: editingLink ? editingResourceId : generateId(),
      kind: 'link',
      type: typeMeta.id,
      title,
      url,
    };

    setResources((previous) => editingLink
      ? previous.map((resource) => resource.id === editingResourceId ? nextResource : resource)
      : [...previous, nextResource]
    );
    resetResourceDrafts();
  };

  const handleImageResourceChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) return;
    if (!isAllowedPlacePhoto(selectedFile)) {
      event.target.value = '';
      alert('只能上傳圖片檔案。');
      return;
    }
    if (selectedFile.size > MAX_PLACE_PHOTO_BYTES) {
      event.target.value = '';
      alert('資料圖片不可超過 5 MB。');
      return;
    }

    const defaultTitle = String(selectedFile.name || '菜單照片')
      .replace(/\.[^.]+$/i, '')
      .trim();
    setImageDraft((previous) => ({
      ...previous,
      file: selectedFile,
      title: previous.title || defaultTitle,
    }));
    setShowResources(true);
  };

  const handleSaveImageResource = () => {
    const editingFile = editingResourceId && editingResourceKind === 'image';
    const existingResource = editingFile
      ? resources.find((resource) => resource.id === editingResourceId)
      : null;
    const selectedFile = imageDraft.file;

    if (!editingFile && !selectedFile) return alert('請先選擇圖片檔案。');
    if (!editingFile && resources.length >= MAX_PLACE_RESOURCES) {
      return alert(`每個景點最多可加入 ${MAX_PLACE_RESOURCES} 筆快速資料。`);
    }

    const typeMeta = getPlaceResourceType(imageDraft.type);
    const fallbackTitle = selectedFile?.name
      ? String(selectedFile.name).replace(/\.[^.]+$/i, '')
      : existingResource?.title || `${typeMeta.label}圖片`;
    const title = String(imageDraft.title || fallbackTitle).trim().slice(0, 60) || `${typeMeta.label}圖片`;

    if (selectedFile) {
      const duplicate = resources.some((resource) => (
        resource.id !== editingResourceId
        && isImageResource(resource)
        && String(resource.fileName || '').toLowerCase() === String(selectedFile.name || '').toLowerCase()
        && Number(resource.size || 0) === Number(selectedFile.size || 0)
      ));
      if (duplicate) return alert('這張圖片已經加入過了。');
    }

    const nextResource = {
      ...(existingResource || {}),
      id: editingFile ? editingResourceId : generateId(),
      kind: 'file',
      type: typeMeta.id,
      title,
      url: selectedFile ? '' : String(existingResource?.url || ''),
      storagePath: selectedFile ? '' : String(existingResource?.storagePath || ''),
      fileName: String(selectedFile?.name || existingResource?.fileName || 'image.jpg'),
      contentType: String(selectedFile?.type || existingResource?.contentType || 'image/jpeg'),
      size: Number(selectedFile?.size || existingResource?.size || 0),
      uploadedAt: selectedFile ? null : Number(existingResource?.uploadedAt || 0) || null,
      ...(selectedFile ? { pendingFile: selectedFile } : {}),
    };

    setResources((previous) => editingFile
      ? previous.map((resource) => resource.id === editingResourceId ? nextResource : resource)
      : [...previous, nextResource]
    );
    resetResourceDrafts();
  };

  const handlePdfChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) return;
    if (!isAllowedPlacePdf(selectedFile)) {
      event.target.value = '';
      alert('只能上傳 PDF 檔案。');
      return;
    }
    if (selectedFile.size > MAX_PLACE_PDF_BYTES) {
      event.target.value = '';
      alert('PDF 不可超過 15 MB。');
      return;
    }

    const defaultTitle = String(selectedFile.name || '菜單 PDF').replace(/\.pdf$/i, '').trim();
    setPdfDraft((previous) => ({
      ...previous,
      file: selectedFile,
      title: previous.title || defaultTitle,
    }));
    setShowResources(true);
  };

  const handleSavePdfResource = () => {
    const editingFile = editingResourceId && editingResourceKind === 'file';
    const existingResource = editingFile
      ? resources.find((resource) => resource.id === editingResourceId)
      : null;
    const selectedFile = pdfDraft.file;

    if (!editingFile && !selectedFile) return alert('請先選擇 PDF 檔案。');
    if (!editingFile && resources.length >= MAX_PLACE_RESOURCES) {
      return alert(`每個景點最多可加入 ${MAX_PLACE_RESOURCES} 筆快速資料。`);
    }

    const typeMeta = getPlaceResourceType(pdfDraft.type);
    const fallbackTitle = selectedFile?.name
      ? String(selectedFile.name).replace(/\.pdf$/i, '')
      : existingResource?.title || `${typeMeta.label} PDF`;
    const title = String(pdfDraft.title || fallbackTitle).trim().slice(0, 60) || `${typeMeta.label} PDF`;

    if (selectedFile) {
      const duplicate = resources.some((resource) => (
        resource.id !== editingResourceId
        && isPdfResource(resource)
        && String(resource.fileName || '').toLowerCase() === String(selectedFile.name || '').toLowerCase()
        && Number(resource.size || 0) === Number(selectedFile.size || 0)
      ));
      if (duplicate) return alert('這份 PDF 已經加入過了。');
    }

    const nextResource = {
      ...(existingResource || {}),
      id: editingFile ? editingResourceId : generateId(),
      kind: 'file',
      type: typeMeta.id,
      title,
      url: selectedFile ? '' : String(existingResource?.url || ''),
      storagePath: selectedFile ? '' : String(existingResource?.storagePath || ''),
      fileName: String(selectedFile?.name || existingResource?.fileName || 'document.pdf'),
      contentType: 'application/pdf',
      size: Number(selectedFile?.size || existingResource?.size || 0),
      uploadedAt: selectedFile ? null : Number(existingResource?.uploadedAt || 0) || null,
      ...(selectedFile ? { pendingFile: selectedFile } : {}),
    };

    setResources((previous) => editingFile
      ? previous.map((resource) => resource.id === editingResourceId ? nextResource : resource)
      : [...previous, nextResource]
    );
    resetResourceDrafts();
  };

  const handleEditResource = (resource) => {
    setEditingResourceId(resource.id);
    setShowResources(true);

    if (isImageResource(resource)) {
      setEditingResourceKind('image');
      setResourceAddMode('image');
      setImageDraft({
        type: resource.type,
        title: resource.title,
        file: null,
      });
      return;
    }

    if (isPdfResource(resource)) {
      setEditingResourceKind('file');
      setResourceAddMode('pdf');
      setPdfDraft({
        type: resource.type,
        title: resource.title,
        file: null,
      });
      return;
    }

    setEditingResourceKind('link');
    setResourceAddMode('link');
    setResourceDraft({
      type: resource.type,
      title: resource.title,
      url: resource.url,
    });
  };

  const handleRemoveResource = (resourceId) => {
    setResources((previous) => previous.filter((entry) => entry.id !== resourceId));
    if (editingResourceId === resourceId) resetResourceDrafts();
  };

  const uploadPlacePhoto = async () => {
    if (!photoFile) return null;
    if (!storage) throw new Error('尚未設定 Firebase Storage。');
    if (!safeRoomId) throw new Error('旅程房間 ID 無效，無法上傳照片。');

    const storagePath = `rooms/${safeRoomId}/places/${String(item.id)}/${Date.now()}_${sanitizeFileName(photoFile.name || 'place-photo')}`;
    const photoRef = sRef(storage, storagePath);
    const uploadTask = uploadBytesResumable(photoRef, photoFile, {
      contentType: photoFile.type || 'image/jpeg',
      customMetadata: {
        roomId: safeRoomId,
        itemId: String(item.id),
      },
    });

    const snapshot = await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        uploadTask.cancel();
        reject(new Error('照片上傳逾時，請檢查網路後重試。'));
      }, 45000);

      uploadTask.on(
        'state_changed',
        (progressSnapshot) => {
          const total = Number(progressSnapshot.totalBytes) || 1;
          setUploadProgress(Math.round((Number(progressSnapshot.bytesTransferred) / total) * 100));
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
        () => {
          window.clearTimeout(timer);
          resolve(uploadTask.snapshot);
        },
      );
    });

    return {
      url: await getDownloadURL(snapshot.ref),
      storagePath,
      fileName: String(photoFile.name || 'place-photo'),
      contentType: String(photoFile.type || 'image/jpeg'),
      uploadedAt: Date.now(),
    };
  };

  const uploadPendingFileResource = async (resource, position, totalPending) => {
    const file = resource?.pendingFile;
    if (!file) return resource;
    if (!storage) throw new Error('尚未設定 Firebase Storage。');
    if (!safeRoomId) throw new Error('旅程房間 ID 無效，無法上傳附件。');

    const imageFile = isAllowedPlacePhoto(file);
    const pdfFile = isAllowedPlacePdf(file);
    if (!imageFile && !pdfFile) throw new Error('景點附件只支援圖片或 PDF。');
    if (imageFile && file.size > MAX_PLACE_PHOTO_BYTES) throw new Error('資料圖片不可超過 5 MB。');
    if (pdfFile && file.size > MAX_PLACE_PDF_BYTES) throw new Error('PDF 不可超過 15 MB。');

    const contentType = pdfFile ? 'application/pdf' : String(file.type || 'image/jpeg');
    const fallbackName = pdfFile ? 'document.pdf' : 'image.jpg';
    const storagePath = `rooms/${safeRoomId}/places/${String(item.id)}/${Date.now()}_${String(resource.id)}_${sanitizeFileName(file.name || fallbackName)}`;
    const fileRef = sRef(storage, storagePath);
    const uploadTask = uploadBytesResumable(fileRef, file, {
      contentType,
      customMetadata: {
        roomId: safeRoomId,
        itemId: String(item.id),
        resourceId: String(resource.id),
        resourceType: String(resource.type || 'other'),
      },
    });

    const snapshot = await new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        uploadTask.cancel();
        reject(new Error('附件上傳逾時，請檢查網路後重試。'));
      }, 60000);

      uploadTask.on(
        'state_changed',
        (progressSnapshot) => {
          const totalBytes = Number(progressSnapshot.totalBytes) || 1;
          const currentPercent = Number(progressSnapshot.bytesTransferred) / totalBytes;
          const overall = ((position + currentPercent) / Math.max(1, totalPending)) * 100;
          setUploadProgress(Math.round(overall));
        },
        (error) => {
          window.clearTimeout(timer);
          reject(error);
        },
        () => {
          window.clearTimeout(timer);
          resolve(uploadTask.snapshot);
        },
      );
    });

    const resourceWithoutPending = { ...resource };
    Reflect.deleteProperty(resourceWithoutPending, 'pendingFile');
    return {
      ...resourceWithoutPending,
      kind: 'file',
      url: await getDownloadURL(snapshot.ref),
      storagePath,
      fileName: String(file.name || fallbackName),
      contentType,
      size: Number(file.size || 0),
      uploadedAt: Date.now(),
    };
  };

  const handleSave = async () => {
    if (saving) return;
    const normalizedNavigationUrl = normalizeHttpUrl(navigationUrl);
    if (String(navigationUrl || '').trim() && !normalizedNavigationUrl) {
      alert('定位網址格式不正確，請貼上完整的 http 或 https 網址。');
      return;
    }
    setSaving(true);
    setUploadProgress(0);

    let uploadedPhoto = null;
    const uploadedResourcePaths = [];
    const previousPhoto = item.placePhoto?.storagePath ? item.placePhoto : null;
    const previousResourcePaths = new Set(
      (Array.isArray(item.resources) ? item.resources : [])
        .map((resource) => String(resource?.storagePath || ''))
        .filter(Boolean)
    );

    try {
      uploadedPhoto = await uploadPlacePhoto();

      const pendingResources = resources.filter((resource) => resource?.pendingFile);
      const finalResources = [];
      let pendingIndex = 0;

      for (const resource of resources) {
        if (resource?.pendingFile) {
          const uploadedResource = await uploadPendingFileResource(
            resource,
            pendingIndex,
            pendingResources.length,
          );
          pendingIndex += 1;
          if (uploadedResource.storagePath) uploadedResourcePaths.push(uploadedResource.storagePath);
          finalResources.push(uploadedResource);
        } else {
          finalResources.push(resource);
        }
      }

      const finalPhoto = uploadedPhoto || (removeExistingPhoto ? null : item.placePhoto || null);
      const serializableResources = serializePlaceResources(finalResources);
      const updatedItem = {
        ...item,
        customName: String(customName).trim(),
        time: String(time),
        stayTime: String(stayTime),
        memo: String(memo),
        tags,
        nextLeg: { mode: String(legMode), mins: Number(legMins) },
        navigationUrl: normalizedNavigationUrl,
        placePhoto: finalPhoto,
        resources: serializableResources,
      };

      await Promise.resolve(onSave(updatedItem, autoCascade));

      const shouldDeletePrevious = previousPhoto?.storagePath && (
        removeExistingPhoto || (uploadedPhoto && uploadedPhoto.storagePath !== previousPhoto.storagePath)
      );
      if (shouldDeletePrevious && storage) {
        void deleteObject(sRef(storage, previousPhoto.storagePath)).catch((error) => {
          console.warn('舊景點照片刪除失敗：', error);
        });
      }

      const finalResourcePaths = new Set(
        serializableResources
          .map((resource) => String(resource?.storagePath || ''))
          .filter(Boolean)
      );
      if (storage) {
        previousResourcePaths.forEach((storagePath) => {
          if (!finalResourcePaths.has(storagePath)) {
            void deleteObject(sRef(storage, storagePath)).catch((error) => {
              console.warn('舊景點附件刪除失敗：', error);
            });
          }
        });
      }
    } catch (error) {
      const cleanupPaths = [
        uploadedPhoto?.storagePath,
        ...uploadedResourcePaths,
      ].filter(Boolean);
      if (storage) {
        cleanupPaths.forEach((storagePath) => {
          void deleteObject(sRef(storage, storagePath)).catch(() => {});
        });
      }
      console.error('儲存景點資料失敗：', error);
      alert(error?.message || '儲存景點資料失敗，請稍後再試。');
      setSaving(false);
    }
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  return (
    <div
      data-testid="edit-place-modal"
      style={{ zIndex: 9999, touchAction: 'none', overscrollBehaviorX: 'none' }}
      className="fixed inset-0 w-full max-w-[100vw] overflow-hidden bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center p-0 md:p-4 transition-opacity"
      onClick={handleClose}
    >
      <div
        style={{ touchAction: 'pan-y', maxHeight: '94dvh', overscrollBehaviorX: 'none' }}
        className={`min-w-0 w-full max-w-lg overflow-hidden border rounded-t-3xl md:rounded-3xl p-5 md:p-6 shadow-2xl flex flex-col animate-in fade-in slide-in-from-bottom-4 md:zoom-in duration-200 ${t.modalBg} ${t.cardBorder}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-5 shrink-0 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>自訂地標名稱（選填）</label>
            <input
              data-testid="place-name-input"
              value={String(customName)}
              onChange={e => setCustomName(e.target.value)}
              placeholder={String(item.name)}
              className={`w-full py-2 px-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-lg font-black ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
            />
            <p className={`text-[10px] truncate mt-2 ${t.subText}`}>🗺️ 原始地標：{String(item.name)}</p>
          </div>
          <button type="button" onClick={handleClose} disabled={saving} className={`w-10 h-10 rounded-full bg-slate-500/10 shrink-0 text-lg ${t.subText}`}>✕</button>
        </div>

        <div className="min-w-0 flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-contain pr-1 md:pr-2 scrollbar-hide">
          <div className="grid min-w-0 grid-cols-2 gap-2 items-end">
            <div className="min-w-0">
              <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>抵達時間</label>
              <input
                data-testid="place-arrival-time-input"
                type="time"
                value={String(time)}
                onClick={e => { if ('showPicker' in e.target && typeof e.target.showPicker === 'function') e.target.showPicker(); }}
                onChange={e => setTime(e.target.value)}
                className={`w-full h-11 px-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border cursor-pointer text-sm appearance-none bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              />
            </div>
            <div className="min-w-0">
              <label className={`flex justify-between text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>
                <span>停留（分鐘）</span>
                <span className="text-blue-500 font-black">{formatStayTime(stayTime)}</span>
              </label>
              <input
                data-testid="place-stay-duration-input"
                type="number"
                step="5"
                min="0"
                value={String(stayTime)}
                onChange={e => setStayTime(e.target.value)}
                placeholder="0"
                className={`w-full h-11 px-2 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-sm appearance-none bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              />
            </div>
          </div>

          <div className="flex gap-1.5 -mt-2">
            {[0, 30, 60].map(mins => <button type="button" key={`qt-${mins}`} onClick={() => {if(mins===0) setStayTime("0"); else handleQuickTime(mins);}} className={`flex-1 min-h-10 text-[10px] py-1.5 rounded-lg font-bold border transition-colors hover:opacity-80 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>{mins === 0 ? '僅經過' : mins === 60 ? '+1小時' : `+${mins}分`}</button>)}
          </div>

          <div className={`p-4 rounded-xl border flex flex-col gap-3 ${t.cardBg} ${t.cardBorder}`}>
            <label className={`block text-[10px] font-bold uppercase tracking-wider ${t.subText}`}>前往下一站的交通方式</label>
            <div className="flex min-w-0 gap-3">
              <select value={String(legMode)} onChange={e => setLegMode(e.target.value)} className={`min-w-0 flex-1 h-11 px-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-sm font-bold bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                <option value="AUTO">🚗 自動計算車程</option>
                <option value="FLIGHT">✈️ 搭乘飛機</option>
                <option value="TRAIN">🚅 火車／高鐵</option>
                <option value="TRANSIT">🚇 大眾運輸</option>
                <option value="WALK">🚶 步行前往</option>
              </select>
              {legMode !== 'AUTO' ? (
                <div className="w-1/3 relative shrink-0">
                  <input type="number" min="0" value={String(legMins)} onChange={e => setLegMins(e.target.value)} placeholder="分鐘" className={`w-full h-11 px-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-colors border text-sm text-right pr-6 appearance-none bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                  <span className={`absolute right-2 top-3.5 text-[10px] ${t.subText}`}>分</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className={`p-3 rounded-xl border flex items-center justify-between ${t.cardBg} ${t.cardBorder}`}>
            <div className="flex flex-col pr-3">
              <span className={`text-xs font-bold ${t.mainText}`}>🔄 自動順延後續行程</span>
              <span className={`text-[10px] mt-0.5 ${t.subText}`}>儲存後依車程重新計算後續抵達時間</span>
            </div>
            <input type="checkbox" checked={autoCascade} onChange={e => setAutoCascade(e.target.checked)} className="w-5 h-5 cursor-pointer accent-blue-500 rounded shrink-0" />
          </div>

          <div className={`rounded-2xl border overflow-hidden ${t.cardBg} ${t.cardBorder}`}>
            <button type="button" data-testid="place-resources-toggle" onClick={() => setShowResources((value) => !value)} className="flex min-h-14 w-full min-w-0 items-center justify-between gap-3 p-4 text-left">
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-black ${t.mainText}`}>🗂️ 照片與快速資料</p>
                <p className={`text-[10px] mt-1 ${t.subText}`}>{resourceSummary}</p>
              </div>
              <span className={`shrink-0 text-sm ${t.subText}`}>{showResources ? '收起 ▲' : '展開 ▼'}</span>
            </button>

            {showResources ? (
              <div className={`min-w-0 p-4 pt-0 border-t space-y-4 overflow-x-hidden ${t.cardBorder}`}>
                <div>
                  <div className="mb-2 flex min-w-0 items-center justify-between gap-2">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${t.subText}`}>景點封面照片</label>
                    <span className={`shrink-0 text-right text-[10px] ${t.subText}`}>JPG／PNG／WebP，最多 5 MB</span>
                  </div>
                  {visiblePhotoUrl ? (
                    <div className="relative rounded-xl overflow-hidden border aspect-video bg-black/5">
                      <button type="button" onClick={() => openExternalUrl(visiblePhotoUrl)} className="block w-full h-full">
                        <img data-testid="place-photo-preview" src={visiblePhotoUrl} alt={`${customName || item.name} 參考照片`} className="w-full h-full object-cover" />
                      </button>
                      <button
                        type="button"
                        data-testid="place-photo-remove-button"
                        onClick={() => { setPhotoFile(null); setRemoveExistingPhoto(true); }}
                        className="absolute top-2 right-2 min-h-10 px-3 rounded-xl bg-black/70 text-white text-xs font-bold"
                      >
                        移除照片
                      </button>
                    </div>
                  ) : (
                    <label className={`min-h-24 rounded-xl border border-dashed flex flex-col items-center justify-center cursor-pointer ${t.cardBorder} ${t.inputBg}`}>
                      <span className="text-2xl">📷</span>
                      <span className={`text-xs font-bold mt-1 ${t.mainText}`}>上傳店面、餐點或集合地點照片</span>
                      <input data-testid="place-photo-input" type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                    </label>
                  )}
                  {visiblePhotoUrl ? (
                    <label className={`mt-2 min-h-11 px-3 rounded-xl border flex items-center justify-center cursor-pointer text-xs font-bold ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                      更換照片
                      <input data-testid="place-photo-input" type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                    </label>
                  ) : null}
                </div>

                <div className={`rounded-xl border p-3 ${t.inputBg} ${t.cardBorder}`}>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div>
                      <label className={`block text-[10px] font-bold uppercase tracking-wider ${t.subText}`}>定位與導航</label>
                      <p className={`text-[10px] mt-1 ${t.subText}`}>留空時使用此景點座標；也可貼上店家提供的 Google Maps／Apple Maps 定位網址。</p>
                    </div>
                    {navigationUrl ? (
                      <button type="button" onClick={() => setNavigationUrl('')} className={`min-h-10 px-3 rounded-xl border text-[10px] font-bold shrink-0 ${t.cardBorder} ${t.mainText}`}>
                        使用座標
                      </button>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={String(navigationUrl)}
                      onChange={(event) => setNavigationUrl(event.target.value)}
                      placeholder="選填：https://maps.app.goo.gl/..."
                      inputMode="url"
                      className={`h-11 flex-1 min-w-0 px-3 rounded-xl border text-sm ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
                    />
                    {normalizeHttpUrl(navigationUrl) ? (
                      <button type="button" onClick={() => openExternalUrl(normalizeHttpUrl(navigationUrl))} className="min-h-11 px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold shrink-0">
                        預覽
                      </button>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <label className={`block text-[10px] font-bold uppercase tracking-wider ${t.subText}`}>菜單與快速資料</label>
                      <p className={`text-[10px] mt-1 ${t.subText}`}>封面只放一張代表照；菜單照片可多張並在 App 內滑動查看。</p>
                    </div>
                    <span className={`text-[10px] shrink-0 ${t.subText}`}>{resources.length}/{MAX_PLACE_RESOURCES}</span>
                  </div>

                  {resources.length > 0 ? (
                    <div className="space-y-2 mb-3">
                      {resources.map((resource) => {
                        const typeMeta = getPlaceResourceType(resource.type);
                        const imageResource = isImageResource(resource);
                        const pdfResource = isPdfResource(resource);
                        const pendingUpload = Boolean(resource.pendingFile);
                        let detailText = '';
                        if (imageResource) {
                          const fileDetail = pendingUpload ? '待儲存上傳' : String(resource.fileName || '圖片');
                          const sizeText = formatFileSize(resource.size);
                          detailText = `${typeMeta.label}圖片・${fileDetail}${sizeText ? `・${sizeText}` : ''}`;
                        } else if (pdfResource) {
                          const fileDetail = pendingUpload ? '待儲存上傳' : String(resource.fileName || 'PDF 文件');
                          const sizeText = formatFileSize(resource.size);
                          detailText = `${typeMeta.label} PDF・${fileDetail}${sizeText ? `・${sizeText}` : ''}`;
                        } else {
                          let hostname = '';
                          try { hostname = new URL(resource.url).hostname.replace(/^www\./, ''); } catch { hostname = resource.url; }
                          detailText = `${typeMeta.label}・${hostname}`;
                        }

                        return (
                          <div key={resource.id} className={`flex min-w-0 items-center gap-2 rounded-xl border p-3 sm:gap-3 ${t.itemBg} ${t.cardBorder}`}>
                            <button
                              type="button"
                              onClick={() => { if (resource.url) openExternalUrl(resource.url); }}
                              disabled={!resource.url}
                              className={`w-11 h-11 rounded-xl overflow-hidden flex items-center justify-center text-lg shrink-0 ${imageResource ? 'bg-slate-500/10' : pdfResource ? 'bg-red-500/10' : 'bg-blue-500/10'} disabled:opacity-60`}
                              title={resource.url ? '開啟資料' : '儲存後即可開啟'}
                            >
                              {imageResource && resource.url ? <img src={resource.url} alt="" className="w-full h-full object-cover" /> : imageResource ? '🖼️' : pdfResource ? '📄' : typeMeta.icon}
                            </button>
                            <button
                              type="button"
                              onClick={() => { if (resource.url) openExternalUrl(resource.url); else handleEditResource(resource); }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className={`text-xs font-bold truncate ${t.mainText}`}>{resource.title}</p>
                              <p className={`text-[10px] truncate mt-0.5 ${pendingUpload ? 'text-amber-500' : t.subText}`}>{detailText}</p>
                            </button>
                            <button type="button" onClick={() => handleEditResource(resource)} className={`w-10 h-10 rounded-xl ${t.subText}`} title="編輯資料">✏️</button>
                            <button type="button" onClick={() => handleRemoveResource(resource.id)} className="w-10 h-10 rounded-xl text-red-500" title="移除資料">✕</button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={`text-[11px] mb-3 ${t.subText}`}>可加入多張菜單照片、PDF 菜單、訂位頁、推薦文章或官網。</p>
                  )}

                  <div className={`rounded-xl border p-1 grid grid-cols-3 gap-1 mb-2 ${t.inputBg} ${t.cardBorder}`}>
                    <button
                      type="button"
                      onClick={() => { resetResourceDrafts(); setResourceAddMode('image'); }}
                      className={`min-h-10 rounded-lg text-xs font-bold ${resourceAddMode === 'image' ? 'bg-violet-600 text-white shadow-sm' : t.subText}`}
                    >
                      🖼️ 圖片
                    </button>
                    <button
                      type="button"
                      onClick={() => { resetResourceDrafts(); setResourceAddMode('pdf'); }}
                      className={`min-h-10 rounded-lg text-xs font-bold ${resourceAddMode === 'pdf' ? 'bg-red-500 text-white shadow-sm' : t.subText}`}
                    >
                      📄 PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => { resetResourceDrafts(); setResourceAddMode('link'); }}
                      className={`min-h-10 rounded-lg text-xs font-bold ${resourceAddMode === 'link' ? 'bg-blue-600 text-white shadow-sm' : t.subText}`}
                    >
                      🔗 網址
                    </button>
                  </div>

                  {resourceAddMode === 'image' ? (
                    <div className={`min-w-0 overflow-hidden rounded-xl border p-3 space-y-3 ${t.inputBg} ${t.cardBorder}`}>
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <select value={imageDraft.type} onChange={(event) => setImageDraft((previous) => ({ ...previous, type: event.target.value }))} className={`h-11 w-full min-w-0 px-2 rounded-lg border text-xs font-bold ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                          {PLACE_RESOURCE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.icon} {type.label}</option>)}
                        </select>
                        <input value={imageDraft.title} onChange={(event) => setImageDraft((previous) => ({ ...previous, title: event.target.value }))} placeholder="顯示名稱（例如：菜單第 1 頁）" maxLength={60} className={`h-11 w-full min-w-0 px-3 rounded-lg border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                      </div>

                      <label className={`min-h-16 min-w-0 px-3 rounded-xl border border-dashed flex items-center gap-3 cursor-pointer overflow-hidden ${t.cardBorder}`}>
                        <span className="text-2xl">🖼️</span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-xs font-bold truncate ${t.mainText}`}>
                            {imageDraft.file?.name || (editingResourceId && editingResourceKind === 'image' ? '保留目前圖片；點此可替換' : '選擇菜單或參考圖片')}
                          </span>
                          <span className={`block text-[10px] mt-1 ${t.subText}`}>
                            {imageDraft.file ? `${formatFileSize(imageDraft.file.size)}・儲存景點時上傳` : 'JPG／PNG／WebP，最多 5 MB'}
                          </span>
                        </span>
                        <input type="file" accept="image/*" onChange={handleImageResourceChange} className="hidden" />
                      </label>

                      <p className={`text-[10px] leading-relaxed ${t.subText}`}>菜單照片會合併成 App 內相簿，可左右滑動，不會當成景點封面。</p>

                      <div className="flex gap-2">
                        {editingResourceId && editingResourceKind === 'image' ? <button type="button" onClick={resetResourceDrafts} className={`min-h-11 px-4 rounded-xl border text-xs font-bold ${t.cardBorder} ${t.mainText}`}>取消編輯</button> : null}
                        <button type="button" onClick={handleSaveImageResource} className="flex-1 min-h-11 rounded-xl bg-violet-600 text-white text-xs font-bold">
                          {editingResourceId && editingResourceKind === 'image' ? '更新圖片資料' : '＋ 加入圖片'}
                        </button>
                      </div>
                    </div>
                  ) : resourceAddMode === 'link' ? (
                    <div className={`min-w-0 overflow-hidden rounded-xl border p-3 space-y-2 ${t.inputBg} ${t.cardBorder}`}>
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <select value={resourceDraft.type} onChange={(event) => setResourceDraft((previous) => ({ ...previous, type: event.target.value }))} className={`h-11 w-full min-w-0 px-2 rounded-lg border text-xs font-bold ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                          {PLACE_RESOURCE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.icon} {type.label}</option>)}
                        </select>
                        <input value={resourceDraft.title} onChange={(event) => setResourceDraft((previous) => ({ ...previous, title: event.target.value }))} placeholder="顯示名稱（例如：線上訂位）" maxLength={60} className={`h-11 w-full min-w-0 px-3 rounded-lg border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                      </div>
                      <input value={resourceDraft.url} onChange={(event) => setResourceDraft((previous) => ({ ...previous, url: event.target.value }))} placeholder="貼上網址 https://..." inputMode="url" className={`h-11 w-full min-w-0 px-3 rounded-lg border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                      <div className="flex gap-2">
                        {editingResourceId && editingResourceKind === 'link' ? <button type="button" onClick={resetResourceDrafts} className={`min-h-11 px-4 rounded-xl border text-xs font-bold ${t.cardBorder} ${t.mainText}`}>取消編輯</button> : null}
                        <button type="button" onClick={handleSaveResource} className="flex-1 min-h-11 rounded-xl bg-blue-600 text-white text-xs font-bold">
                          {editingResourceId && editingResourceKind === 'link' ? '更新連結' : '＋ 加入連結'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={`min-w-0 overflow-hidden rounded-xl border p-3 space-y-3 ${t.inputBg} ${t.cardBorder}`}>
                      <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[120px_minmax(0,1fr)]">
                        <select value={pdfDraft.type} onChange={(event) => setPdfDraft((previous) => ({ ...previous, type: event.target.value }))} className={`h-11 w-full min-w-0 px-2 rounded-lg border text-xs font-bold ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>
                          {PLACE_RESOURCE_TYPES.map((type) => <option key={type.id} value={type.id}>{type.icon} {type.label}</option>)}
                        </select>
                        <input value={pdfDraft.title} onChange={(event) => setPdfDraft((previous) => ({ ...previous, title: event.target.value }))} placeholder="顯示名稱（例如：午餐菜單）" maxLength={60} className={`h-11 w-full min-w-0 px-3 rounded-lg border text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
                      </div>

                      <label className={`min-h-16 min-w-0 px-3 rounded-xl border border-dashed flex items-center gap-3 cursor-pointer overflow-hidden ${t.cardBorder}`}>
                        <span className="text-2xl">📄</span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-xs font-bold truncate ${t.mainText}`}>
                            {pdfDraft.file?.name || (editingResourceId && editingResourceKind === 'file' ? '保留目前 PDF；點此可替換' : '選擇菜單或參考 PDF')}
                          </span>
                          <span className={`block text-[10px] mt-1 ${t.subText}`}>
                            {pdfDraft.file ? `${formatFileSize(pdfDraft.file.size)}・儲存景點時上傳` : '僅支援 PDF，最多 15 MB'}
                          </span>
                        </span>
                        <input type="file" accept="application/pdf,.pdf" onChange={handlePdfChange} className="hidden" />
                      </label>

                      <p className={`text-[10px] leading-relaxed ${t.subText}`}>PDF 會集中在「菜單」或「資料」面板中，不會塞滿行程卡片。</p>

                      <div className="flex gap-2">
                        {editingResourceId && editingResourceKind === 'file' ? <button type="button" onClick={resetResourceDrafts} className={`min-h-11 px-4 rounded-xl border text-xs font-bold ${t.cardBorder} ${t.mainText}`}>取消編輯</button> : null}
                        <button type="button" onClick={handleSavePdfResource} className="flex-1 min-h-11 rounded-xl bg-red-500 text-white text-xs font-bold">
                          {editingResourceId && editingResourceKind === 'file' ? '更新 PDF 資料' : '＋ 加入 PDF'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <label className={`block text-[10px] font-bold mb-2 uppercase tracking-wider ${t.subText}`}>快速狀態標籤</label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map(tag => {
                const isActive = tags.includes(tag);
                return <button type="button" key={`tag-${tag}`} onClick={() => setTags(isActive ? tags.filter(x => x !== tag) : [...tags, tag])} className={`min-h-10 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${isActive ? 'bg-blue-600 border-transparent text-white shadow-lg' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}>{String(tag)}</button>
              })}
            </div>
          </div>
          <div>
            <label className={`block text-[10px] font-bold mb-1.5 uppercase tracking-wider ${t.subText}`}>筆記／備註</label>
            <textarea data-testid="place-note-input" value={String(memo)} onChange={e => setMemo(e.target.value)} placeholder="輸入推薦餐點、集合方式或其他細節..." className={`w-full p-3 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 min-h-24 resize-none transition-colors border text-sm bg-transparent ${t.inputBg} ${t.cardBorder} ${t.mainText}`} />
          </div>
        </div>
        <div className={`flex justify-end gap-3 mt-4 pt-4 border-t shrink-0 pb-[max(0px,env(safe-area-inset-bottom))] ${t.cardBorder}`}>
          <button type="button" onClick={handleClose} disabled={saving} className={`min-h-11 px-5 text-sm font-bold transition-opacity opacity-70 hover:opacity-100 ${t.mainText}`}>取消</button>
          <button type="button" data-testid="save-place-button" onClick={() => void handleSave()} disabled={saving} className="min-h-11 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-8 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 active:scale-95 transition-all">
            {saving ? (hasPendingUploads ? `上傳中 ${uploadProgress}%` : '儲存中…') : '儲存變更'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 4. 地圖路線元件
// ============================================================================
export const Directions = ({ itinerary, dayId, onRouteCalculated }) => {
  const map = useMap('main-map');
  const routesLib = useMapsLibrary('routes');
  const renderersRef = useRef([]);

  const routeKey = useMemo(() => {
    const items = Array.isArray(itinerary?.[dayId]) ? itinerary[dayId] : [];
    return JSON.stringify(items.map((item) => ({
      lat: Number(item?.lat),
      lng: Number(item?.lng),
      mode: String(item?.nextLeg?.mode || 'AUTO'),
      mins: Number(item?.nextLeg?.mins) || 30,
    })));
  }, [dayId, itinerary]);

  useEffect(() => {
    const routeInputs = JSON.parse(routeKey);
    renderersRef.current.forEach((renderer) => renderer.setMap(null));
    renderersRef.current = [];

    if (!routesLib || !map || !dayId) return undefined;
    let isCancelled = false;
    const activeRenderers = [];

    const createRenderer = (result) => {
      // noinspection JSDeprecatedSymbols -- 保留現行 Google Maps 相容流程，避免未啟用新版 API 時功能中斷。
      const renderer = new routesLib.DirectionsRenderer({
        map,
        suppressMarkers: true,
        preserveViewport: true,
        polylineOptions: { strokeColor: '#3b82f6', strokeWeight: 5, strokeOpacity: 0.8 },
      });
      renderer.setDirections(result);
      activeRenderers.push(renderer);
    };

    const fetchRoute = async () => {
      if (routeInputs.length < 2) {
        onRouteCalculated?.(dayId, []);
        return;
      }

      // noinspection JSDeprecatedSymbols -- 保留現行 Google Maps 相容流程，避免未啟用新版 API 時功能中斷。
      const service = new routesLib.DirectionsService();
      const allCoordinatesValid = routeInputs.every((item) => isValidCoordinates(item.lat, item.lng));
      const allAutomaticDriving = routeInputs.slice(0, -1).every((item) => item.mode === 'AUTO');
      const canUseSingleRequest = allCoordinatesValid && allAutomaticDriving && routeInputs.length <= 25;

      if (canUseSingleRequest) {
        try {
          const result = await service.route({
            origin: { lat: routeInputs[0].lat, lng: routeInputs[0].lng },
            destination: {
              lat: routeInputs[routeInputs.length - 1].lat,
              lng: routeInputs[routeInputs.length - 1].lng,
            },
            waypoints: routeInputs.slice(1, -1).map((item) => ({
              location: { lat: item.lat, lng: item.lng },
              stopover: true,
            })),
            optimizeWaypoints: false,
            travelMode: window.google.maps.TravelMode.DRIVING,
          });
          if (isCancelled) return;

          const route = result.routes?.[0];
          if (route?.legs?.length) {
            createRenderer(result);
            const durations = route.legs.map((leg) => ({
              text: String(leg?.duration?.text || ''),
              value: Math.max(1, Math.round(Number(leg?.duration?.value || 0) / 60)),
              mode: 'AUTO',
            }));
            renderersRef.current = activeRenderers;
            onRouteCalculated?.(dayId, durations);
            return;
          }

          console.warn('Whole-day route response did not contain route legs; falling back to individual legs.');
        } catch (error) {
          if (isCancelled) return;
          console.warn('Whole-day route calculation failed; falling back to individual legs:', error);
        }
      }

      const durations = [];
      for (let index = 0; index < routeInputs.length - 1; index += 1) {
        const origin = routeInputs[index];
        const destination = routeInputs[index + 1];

        if (origin.mode !== 'AUTO') {
          const minutes = Math.max(0, Number(origin.mins) || 0);
          durations.push({ text: formatStayTime(minutes), value: minutes, mode: origin.mode });
          continue;
        }

        if (!isValidCoordinates(origin.lat, origin.lng) || !isValidCoordinates(destination.lat, destination.lng)) {
          durations.push({ text: '座標無效', value: 30, mode: 'ERROR' });
          continue;
        }

        try {
          const result = await service.route({
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
            travelMode: window.google.maps.TravelMode.DRIVING,
          });
          if (isCancelled) return;

          const leg = result.routes?.[0]?.legs?.[0];
          if (!leg?.duration) {
            console.warn('Route response did not contain a duration.');
            durations.push({ text: '無法計算', value: 30, mode: 'ERROR' });
            continue;
          }

          createRenderer(result);
          durations.push({
            text: String(leg.duration.text || ''),
            value: Math.max(1, Math.round(Number(leg.duration.value) / 60)),
            mode: 'AUTO',
          });
        } catch (error) {
          if (isCancelled) return;
          console.warn('Route calculation failed:', error);
          durations.push({ text: '無法計算', value: 30, mode: 'ERROR' });
        }
      }

      if (!isCancelled) {
        renderersRef.current = activeRenderers;
        onRouteCalculated?.(dayId, durations);
      }
    };

    void fetchRoute();
    return () => {
      isCancelled = true;
      activeRenderers.forEach((renderer) => renderer.setMap(null));
      renderersRef.current = [];
    };
  }, [dayId, map, onRouteCalculated, routeKey, routesLib]);

  return null;
};

export const MemoViewModal = ({ item, onClose, t }) => {
  useBodyScrollLock();
  if (!item) return null;
  const displayName = item.customName || item.name;
  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden" onClick={onClose}>
      <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh] ${t.modalBg} ${t.cardBorder} animate-in zoom-in-95 duration-200`} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4 border-b pb-4 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className={`text-lg font-black leading-tight truncate ${t.mainText}`}>📝 {String(displayName)}</h3>
            <p className={`text-[10px] mt-1 ${t.subText}`}>筆記與備註</p>
          </div>
          <button onClick={onClose} className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-500/10 hover:bg-red-500 hover:text-white transition-colors shrink-0 ${t.subText}`}>✕</button>
        </div>
        <div className={`p-5 rounded-xl border overflow-y-auto overscroll-contain flex-1 ${t.cardBg} ${t.cardBorder}`}>
          <p className={`text-sm whitespace-pre-wrap wrap-break-word leading-relaxed ${t.mainText}`}>{String(item.memo)}</p>
        </div>
        <div className="mt-6 flex justify-end shrink-0">
           <button onClick={onClose} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-md active:scale-95 transition-all">關閉</button>
        </div>
      </div>
    </div>
  );
};

export const PlaceDetailsModal = ({ place, onClose, onAdd, exploreOriginItem, dayTitle, t, isFetching }) => {
  useBodyScrollLock();
  if (!place) return null;

  const photos = Array.isArray(place.photos) ? place.photos : [];
  const reviews = Array.isArray(place.reviews) ? place.reviews : [];

  return (
    <div style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 transition-opacity animate-in fade-in overflow-hidden w-full max-w-[100vw]" onClick={onClose}>
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
          <button onClick={onClose} className={`w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center text-xl hover:bg-red-500 hover:text-white transition-colors shrink-0 ${t.subText}`}>✕</button>
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
          {place.geometry && place.geometry.location ? (
            <div className="flex gap-2">
              <button onClick={() => window.open(safeUrlFormatter(place.url || ''), '_blank')} className={`flex-1 py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:border-blue-500 hover:text-blue-500 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>
                🗺️ 地圖資訊
              </button>
              <button onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${place.geometry.location.lat()},${place.geometry.location.lng()}`, '_blank')} className={`flex-1 py-3 rounded-xl border text-sm font-bold flex items-center justify-center gap-2 transition-colors hover:border-emerald-500 hover:text-emerald-500 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>
                🧭 開始導航
              </button>
            </div>
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
// 5. 共用／個人行前清單
// ============================================================================
const ChecklistItemEditorModal = ({
  mode,
  item,
  scope,
  actor,
  members,
  existingItems,
  defaultCategory,
  onClose,
  onSave,
  onDelete,
  t,
}) => {
  useBodyScrollLock();

  const isEditing = mode === 'edit' && Boolean(item);
  const actualScope = String(item?.scope || scope || 'shared');
  const owner = actualScope === 'personal' ? String(item?.owner || actor || '') : '';
  const safeMembers = Array.isArray(members) && members.length > 0 ? members : ['自己'];
  const [text, setText] = useState(() => String(item?.text || ''));
  const [category, setCategory] = useState(() => String(item?.category || defaultCategory || 'todo'));
  const [assignee, setAssignee] = useState(() => actualScope === 'shared' ? String(item?.assignee || '所有人') : String(actor || ''));
  const [important, setImportant] = useState(() => Boolean(item?.important));
  const [showDetails, setShowDetails] = useState(() => isEditing || Boolean(item?.important) || (actualScope === 'shared' && String(item?.assignee || '所有人') !== '所有人'));
  const [errorMessage, setErrorMessage] = useState('');

  const trimmedText = String(text || '').trim();
  const categoryInfo = CHECKLIST_CATEGORIES.find(option => option.id === category) || CHECKLIST_CATEGORIES.at(-1);
  const canSave = trimmedText.length > 0;

  const validateAndSave = () => {
    if (!trimmedText) {
      setErrorMessage('請輸入清單項目。');
      return;
    }

    const normalizedText = trimmedText.toLocaleLowerCase('zh-TW');
    const duplicate = (Array.isArray(existingItems) ? existingItems : []).some(existingItem => {
      if (String(existingItem.id || '') === String(item?.id || '')) return false;
      if (String(existingItem.scope || '') !== actualScope) return false;
      if (actualScope === 'personal' && String(existingItem.owner || '') !== owner) return false;
      return String(existingItem.text || '').trim().toLocaleLowerCase('zh-TW') === normalizedText;
    });

    if (duplicate) {
      setErrorMessage('這個清單中已經有相同項目。');
      return;
    }

    onSave?.({
      text: trimmedText,
      scope: actualScope,
      owner,
      assignee: actualScope === 'shared' ? assignee : actor,
      category,
      important,
    });
  };

  return (
    <div
      style={{ zIndex: 10040, touchAction: 'manipulation' }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center md:p-6 overflow-hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checklist-item-editor-title"
        style={{
          touchAction: 'pan-y',
          WebkitOverflowScrolling: 'touch',
          maxHeight: 'min(92dvh, 760px)',
        }}
        className={`w-full md:max-w-lg rounded-t-3xl md:rounded-3xl border shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 md:zoom-in-95 ${t.modalBg} ${t.cardBorder}`}
        onClick={event => event.stopPropagation()}
      >
        <div className="md:hidden flex justify-center pt-2.5">
          <span className="w-10 h-1 rounded-full bg-slate-400/40" />
        </div>

        <header className={`px-5 md:px-6 pt-3 md:pt-6 pb-4 border-b shrink-0 ${t.headerBg} ${t.cardBorder}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className={`text-[10px] font-black tracking-widest uppercase ${actualScope === 'shared' ? 'text-blue-500' : 'text-purple-500'}`}>
                {actualScope === 'shared' ? '共享項目' : `${owner || actor} 的個人項目`}
              </p>
              <h3 id="checklist-item-editor-title" className={`text-xl font-black mt-1 ${t.mainText}`}>
                {isEditing ? '編輯清單項目' : '新增清單項目'}
              </h3>
              <p className={`text-xs mt-1 leading-5 ${t.subText}`}>
                先輸入要完成的事情，分類與負責人可再視需要設定。
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="關閉項目編輯視窗"
              className={`min-w-11 min-h-11 rounded-full shrink-0 flex items-center justify-center bg-slate-500/10 hover:bg-red-500 hover:text-white transition-colors ${t.subText}`}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 md:px-6 py-5 space-y-5 scrollbar-hide">
          <section>
            <div className="flex items-center justify-between gap-3 mb-2">
              <label htmlFor="checklist-item-text" className={`text-xs font-black ${t.mainText}`}>項目內容</label>
              <span className={`text-[10px] font-mono ${trimmedText.length > 180 ? 'text-amber-500' : t.subText}`}>{String(text || '').length}/200</span>
            </div>
            <textarea
              id="checklist-item-text"
              value={text}
              onChange={event => {
                setText(event.target.value);
                if (errorMessage) setErrorMessage('');
              }}
              onKeyDown={event => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') validateAndSave();
              }}
              maxLength={200}
              rows={3}
              placeholder={actualScope === 'shared' ? '例如：確認護照效期、購買網卡、誰負責帶轉接頭' : `例如：${actor} 要帶耳機、行動電源與個人藥品`}
              className={`w-full min-h-28 p-4 rounded-2xl border resize-none text-base leading-6 outline-none focus:ring-2 ${errorMessage ? 'border-red-500 focus:ring-red-500/30' : 'focus:ring-blue-500'} ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
            />
            {errorMessage ? <p className="mt-2 text-xs font-bold text-red-500">⚠️ {errorMessage}</p> : null}
          </section>

          <section>
            <p className={`text-xs font-black mb-2 ${t.mainText}`}>分類</p>
            <div className="grid grid-cols-3 gap-2">
              {CHECKLIST_CATEGORIES.map(option => (
                <button
                  key={`editor-category-${option.id}`}
                  type="button"
                  onClick={() => setCategory(option.id)}
                  aria-pressed={category === option.id}
                  className={`min-h-12 px-2 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${category === option.id ? 'bg-blue-600 border-blue-600 text-white shadow-md' : `${t.cardBg} ${t.cardBorder} ${t.subText}`}`}
                >
                  <span aria-hidden="true">{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className={`rounded-2xl border overflow-hidden ${t.cardBg} ${t.cardBorder}`}>
            <button
              type="button"
              onClick={() => setShowDetails(value => !value)}
              aria-expanded={showDetails}
              className={`w-full min-h-14 px-4 py-3 flex items-center justify-between gap-3 text-left ${t.mainText}`}
            >
              <span>
                <strong className="block text-sm">更多設定</strong>
                <span className={`block text-[10px] mt-0.5 ${t.subText}`}>
                  {categoryInfo?.icon} {categoryInfo?.label}
                  {actualScope === 'shared' ? `・${assignee === '所有人' ? '所有人負責' : `${assignee} 負責`}` : ''}
                  {important ? '・重要' : ''}
                </span>
              </span>
              <span className={`text-sm transition-transform ${showDetails ? 'rotate-180' : ''}`}>⌄</span>
            </button>

            {showDetails ? (
              <div className={`px-4 pb-4 pt-1 border-t space-y-4 ${t.cardBorder}`}>
                {actualScope === 'shared' ? (
                  <label className={`block text-xs font-black ${t.mainText}`}>
                    負責人
                    <select
                      value={assignee}
                      onChange={event => setAssignee(event.target.value)}
                      className={`w-full min-h-12 mt-2 px-3 rounded-xl border text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
                    >
                      <option value="所有人">👥 所有人</option>
                      {safeMembers.map(member => <option key={`editor-assignee-${member}`} value={member}>👤 {member}</option>)}
                    </select>
                  </label>
                ) : null}

                <button
                  type="button"
                  onClick={() => setImportant(value => !value)}
                  aria-pressed={important}
                  className={`w-full min-h-14 px-4 py-3 rounded-xl border flex items-center justify-between gap-3 text-left transition-all ${important ? 'bg-amber-500/15 border-amber-500/50' : `${t.cardMetaBg} ${t.cardBorder}`}`}
                >
                  <span>
                    <strong className={`block text-sm ${important ? 'text-amber-600' : t.mainText}`}>⭐ 標記為重要</strong>
                    <span className={`block text-[10px] mt-0.5 ${t.subText}`}>重要項目會優先排列並加上醒目提示。</span>
                  </span>
                  <span className={`w-11 h-6 p-0.5 rounded-full transition-colors ${important ? 'bg-amber-500' : 'bg-slate-400/40'}`}>
                    <span className={`block w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${important ? 'translate-x-5' : ''}`} />
                  </span>
                </button>
              </div>
            ) : null}
          </section>

          {isEditing && onDelete ? (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`確定刪除「${String(item?.text || '此項目')}」？`)) onDelete(item.id);
              }}
              className="w-full min-h-12 rounded-xl border border-red-500/30 bg-red-500/10 text-red-600 text-sm font-black hover:bg-red-500 hover:text-white transition-colors"
            >
              🗑️ 刪除這個項目
            </button>
          ) : null}
        </div>

        <footer
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          className={`px-5 md:px-6 pt-4 border-t shrink-0 flex items-center gap-3 ${t.headerBg} ${t.cardBorder}`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`flex-1 min-h-12 rounded-xl border text-sm font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
          >
            取消
          </button>
          <button
            type="button"
            onClick={validateAndSave}
            disabled={!canSave}
            className={`flex-[1.4] min-h-12 rounded-xl text-sm font-black text-white shadow-lg transition-all ${canSave ? `${actualScope === 'shared' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/25' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/25'} active:scale-95` : 'bg-slate-400 opacity-60 cursor-not-allowed'}`}
          >
            {isEditing ? '儲存變更' : '＋ 加入清單'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export const ChecklistModal = ({
  items,
  members,
  activeMember,
  onActiveMemberChange,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  onBulkCreate,
  onClearCompleted,
  t,
}) => {
  useBodyScrollLock();

  const safeItems = useMemo(() => Array.isArray(items) ? items : [], [items]);
  const safeMembers = useMemo(() => {
    const normalized = Array.isArray(members)
      ? members.map(member => String(member || '').trim()).filter(Boolean)
      : [];
    return normalized.length > 0 ? Array.from(new Set(normalized)) : ['自己'];
  }, [members]);

  const actor = safeMembers.includes(activeMember) ? activeMember : safeMembers[0];
  const [scope, setScope] = useState('shared');
  const [filter, setFilter] = useState('open');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showTemplates, setShowTemplates] = useState(false);
  const [editorState, setEditorState] = useState(null);

  const categoryMap = useMemo(
    () => Object.fromEntries(CHECKLIST_CATEGORIES.map(category => [category.id, category])),
    []
  );

  const scopedItems = useMemo(() => safeItems.filter(item => {
    if (scope === 'shared') return item.scope === 'shared';
    return item.scope === 'personal' && String(item.owner || '') === actor;
  }), [actor, safeItems, scope]);

  const completedCount = useMemo(
    () => scopedItems.filter(item => Boolean(item.completed)).length,
    [scopedItems]
  );
  const totalCount = scopedItems.length;
  const openCount = totalCount - completedCount;
  const progressPercent = totalCount > 0
    ? Math.round((completedCount / totalCount) * 100)
    : 0;

  const visibleItems = useMemo(() => scopedItems
    .filter(item => {
      if (filter === 'open' && item.completed) return false;
      if (filter === 'done' && !item.completed) return false;
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const completedDelta = Number(Boolean(a.completed)) - Number(Boolean(b.completed));
      if (completedDelta !== 0) return completedDelta;
      const importantDelta = Number(Boolean(b.important)) - Number(Boolean(a.important));
      if (importantDelta !== 0) return importantDelta;
      return Number(a.createdAt || 0) - Number(b.createdAt || 0);
    }), [categoryFilter, filter, scopedItems]);

  const openCreateEditor = () => {
    setEditorState({
      mode: 'create',
      item: null,
      defaultCategory: categoryFilter !== 'all' ? categoryFilter : 'todo',
    });
  };

  const openEditEditor = item => {
    setEditorState({ mode: 'edit', item, defaultCategory: item.category || 'todo' });
  };

  const handleEditorSave = draft => {
    if (editorState?.mode === 'edit' && editorState.item) {
      onUpdate?.({ ...editorState.item, ...draft });
    } else {
      onCreate?.(draft);
    }
    setEditorState(null);
  };

  const handleEditorDelete = itemId => {
    onDelete?.(itemId);
    setEditorState(null);
  };

  const handleTemplateInsert = () => {
    const template = scope === 'shared'
      ? SHARED_CHECKLIST_TEMPLATE
      : PERSONAL_CHECKLIST_TEMPLATE;
    const existingTexts = new Set(scopedItems.map(item => String(item.text || '').trim().toLocaleLowerCase('zh-TW')));
    const missingItems = template
      .filter(item => !existingTexts.has(String(item.text).toLocaleLowerCase('zh-TW')))
      .map(item => ({
        ...item,
        scope,
        owner: scope === 'personal' ? actor : '',
        assignee: scope === 'shared' ? item.assignee : actor,
      }));

    if (missingItems.length === 0) {
      alert('常用範本已經全部加入囉！');
      return;
    }
    onBulkCreate?.(missingItems);
    setShowTemplates(false);
  };

  return (
    <>
      <div
        style={{ zIndex: 10020, touchAction: 'manipulation' }}
        className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-stretch md:items-center justify-center p-2 md:p-6 overflow-hidden"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="checklist-modal-title"
          style={{
            touchAction: 'pan-y',
            height: 'calc(100dvh - 1rem)',
            maxHeight: '94dvh',
          }}
          className={`w-full max-w-3xl rounded-2xl md:rounded-3xl border shadow-2xl overflow-hidden flex flex-col ${t.modalBg} ${t.cardBorder}`}
          onClick={event => event.stopPropagation()}
        >
          <header className={`p-4 md:p-6 border-b shrink-0 ${t.headerBg} ${t.cardBorder}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">✅</span>
                  <h2 id="checklist-modal-title" className={`text-xl md:text-2xl font-black ${t.mainText}`}>行前清單</h2>
                </div>
                <p className={`text-xs mt-1 leading-5 ${t.subText}`}>集中查看待辦與行李；新增和編輯會在獨立視窗完成。</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={openCreateEditor}
                  className={`min-h-11 px-3.5 md:px-4 rounded-xl text-sm font-black text-white shadow-md active:scale-95 transition-all ${scope === 'shared' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/25' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/25'}`}
                >
                  ＋ 新增
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="關閉行前清單"
                  className={`min-w-11 min-h-11 rounded-full flex items-center justify-center bg-slate-500/10 hover:bg-red-500 hover:text-white transition-colors ${t.subText}`}
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:gap-4 items-end">
              <div>
                <div className="flex items-center justify-between gap-3 mb-2">
                  <span className={`text-xs font-bold ${t.mainText}`}>
                    {scope === 'shared' ? '共享進度' : `${actor} 的進度`}
                  </span>
                  <span className={`text-xs font-mono font-black ${progressPercent === 100 && totalCount > 0 ? 'text-emerald-500' : t.subText}`}>
                    {completedCount}/{totalCount}・{progressPercent}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full overflow-hidden bg-slate-500/15">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${progressPercent === 100 && totalCount > 0 ? 'bg-emerald-500' : scope === 'shared' ? 'bg-blue-600' : 'bg-purple-600'}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <label className={`text-[10px] font-bold ${t.subText}`}>
                我目前是
                <select
                  value={actor}
                  onChange={event => onActiveMemberChange?.(event.target.value)}
                  className={`block mt-1 min-w-36 min-h-11 px-3 rounded-xl border text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
                >
                  {safeMembers.map(member => <option key={`checklist-member-${member}`} value={member}>{member}</option>)}
                </select>
              </label>
            </div>
          </header>

          <div
            style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain md:overflow-hidden flex flex-col p-3.5 md:p-6 gap-3 md:gap-4"
          >
            <div className={`grid grid-cols-2 p-1 rounded-2xl border shrink-0 ${t.cardBg} ${t.cardBorder}`}>
              <button
                type="button"
                onClick={() => { setScope('shared'); setFilter('open'); setCategoryFilter('all'); setShowTemplates(false); }}
                className={`min-h-11 px-3 rounded-xl text-sm font-black transition-all ${scope === 'shared' ? 'bg-blue-600 text-white shadow-md' : t.subText}`}
              >
                👥 共用清單
              </button>
              <button
                type="button"
                onClick={() => { setScope('personal'); setFilter('open'); setCategoryFilter('all'); setShowTemplates(false); }}
                className={`min-h-11 px-3 rounded-xl text-sm font-black transition-all ${scope === 'personal' ? 'bg-purple-600 text-white shadow-md' : t.subText}`}
              >
                👤 個人清單
              </button>
            </div>

            {scope === 'personal' ? (
              <div className="rounded-xl border border-purple-500/20 bg-purple-500/10 px-3 py-2 text-[11px] leading-5 text-purple-600 shrink-0">
                這是依成員分開顯示的共編清單，不是私人加密空間；持有旅程連結的人仍可切換成員查看。
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
              <div className={`grid grid-cols-3 p-1 rounded-xl border ${t.cardBg} ${t.cardBorder}`}>
                {[
                  { id: 'open', label: `待完成 ${openCount}` },
                  { id: 'all', label: `全部 ${totalCount}` },
                  { id: 'done', label: `已完成 ${completedCount}` },
                ].map(option => (
                  <button
                    key={`checklist-filter-${option.id}`}
                    type="button"
                    onClick={() => setFilter(option.id)}
                    className={`min-h-10 px-2 rounded-lg text-[11px] md:text-xs font-bold whitespace-nowrap ${filter === option.id ? 'bg-slate-700 text-white shadow-sm' : t.subText}`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <select
                  value={categoryFilter}
                  onChange={event => setCategoryFilter(event.target.value)}
                  className={`min-w-0 flex-1 sm:flex-none min-h-11 px-3 rounded-xl border text-xs font-bold outline-none ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
                  aria-label="分類篩選"
                >
                  <option value="all">全部分類</option>
                  {CHECKLIST_CATEGORIES.map(category => <option key={`filter-category-${category.id}`} value={category.id}>{category.icon} {category.label}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setShowTemplates(value => !value)}
                  className={`min-h-11 px-3 rounded-xl border text-xs font-bold whitespace-nowrap transition-colors ${showTemplates ? 'bg-indigo-600 border-indigo-600 text-white' : `${t.cardBg} ${t.cardBorder} ${t.mainText}`}`}
                >
                  ✨ 範本
                </button>
              </div>
            </div>

            {showTemplates ? (
              <div className={`rounded-2xl border p-4 shrink-0 ${t.cardBg} ${t.cardBorder}`}>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <p className={`text-sm font-black ${t.mainText}`}>{scope === 'shared' ? '共享行前基本範本' : `${actor} 的個人行李範本`}</p>
                    <p className={`text-[10px] mt-1 leading-5 ${t.subText}`}>只補上尚未存在的項目，不會建立重複內容。</p>
                  </div>
                  <button type="button" onClick={handleTemplateInsert} className="min-h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black shadow-md active:scale-95">
                    一鍵加入 {scope === 'shared' ? SHARED_CHECKLIST_TEMPLATE.length : PERSONAL_CHECKLIST_TEMPLATE.length} 項
                  </button>
                </div>
              </div>
            ) : null}

            <div
              style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
              className="shrink-0 md:flex-1 md:min-h-0 md:overflow-y-auto pr-1 space-y-2 scrollbar-hide"
            >
              {visibleItems.length === 0 ? (
                <div className={`h-full min-h-52 rounded-2xl border border-dashed flex flex-col items-center justify-center text-center p-6 ${t.cardBorder}`}>
                  <span className="text-4xl mb-3">{filter === 'done' ? '🎉' : '🧳'}</span>
                  <p className={`text-sm font-black ${t.mainText}`}>{filter === 'done' ? '目前沒有已完成項目' : categoryFilter === 'all' ? '這個清單目前是空的' : '此分類目前沒有項目'}</p>
                  <p className={`text-xs mt-1 leading-5 max-w-xs ${t.subText}`}>{filter === 'done' ? '勾選完成後，項目會出現在這裡。' : '用新增按鈕建立一個項目，或套用常用範本快速開始。'}</p>
                  {filter !== 'done' ? (
                    <div className="flex flex-wrap justify-center gap-2 mt-4">
                      <button type="button" onClick={openCreateEditor} className={`min-h-11 px-4 rounded-xl text-white text-xs font-black shadow-md ${scope === 'shared' ? 'bg-blue-600' : 'bg-purple-600'}`}>＋ 新增項目</button>
                      <button type="button" onClick={() => setShowTemplates(true)} className="min-h-11 px-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 text-xs font-black">✨ 使用範本</button>
                    </div>
                  ) : null}
                </div>
              ) : visibleItems.map(item => {
                const category = categoryMap[item.category] || categoryMap.other;
                return (
                  <div
                    key={`checklist-item-${item.id}`}
                    className={`rounded-2xl border p-3 transition-all ${item.completed ? `${t.cardMetaBg} opacity-70` : `${t.itemBg} shadow-sm`} ${item.important && !item.completed ? 'ring-1 ring-amber-400/50' : ''} ${t.cardBorder}`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => onUpdate?.({
                          ...item,
                          completed: !item.completed,
                          completedAt: !item.completed ? Date.now() : null,
                          completedBy: !item.completed ? actor : '',
                        })}
                        aria-label={item.completed ? '標記為未完成' : '標記為已完成'}
                        className="min-w-11 min-h-11 shrink-0 flex items-center justify-center"
                      >
                        <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-black transition-all ${item.completed ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-400/60 hover:border-emerald-500'}`}>
                          {item.completed ? '✓' : ''}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditEditor(item)}
                        className="flex-1 min-w-0 py-1 text-left"
                        aria-label={`編輯 ${String(item.text || '清單項目')}`}
                      >
                        <p className={`text-sm font-bold leading-6 wrap-break-word ${item.completed ? `line-through ${t.subText}` : t.mainText}`}>
                          {item.important ? <span className="mr-1" title="重要項目">⭐</span> : null}
                          {String(item.text)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className={`text-[10px] px-2 py-1 rounded-lg border ${t.cardBg} ${t.cardBorder} ${t.subText}`}>
                            {category.icon} {category.label}
                          </span>
                          {item.scope === 'shared' ? (
                            <span className="text-[10px] px-2 py-1 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-600">
                              {item.assignee === '所有人' ? '👥 所有人' : `👤 ${String(item.assignee || '未分配')}`}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-1 rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-600">👤 {String(item.owner || actor)}</span>
                          )}
                          {item.completed && item.completedBy ? <span className={`text-[10px] ${t.subText}`}>由 {String(item.completedBy)} 完成</span> : null}
                        </div>
                      </button>

                      <div className="flex items-center shrink-0">
                        <button
                          type="button"
                          onClick={() => onUpdate?.({ ...item, important: !item.important })}
                          aria-label={item.important ? '取消重要標記' : '標記為重要'}
                          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center text-lg transition-colors ${item.important ? 'text-amber-500 bg-amber-500/10' : `${t.subText} hover:text-amber-500`}`}
                        >
                          {item.important ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditEditor(item)}
                          aria-label="編輯項目"
                          className={`min-w-11 min-h-11 rounded-xl flex items-center justify-center hover:text-blue-500 transition-colors ${t.subText}`}
                        >
                          ✏️
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <footer
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            className={`px-4 md:px-6 pt-3 md:py-4 border-t shrink-0 flex items-center justify-end gap-2 md:gap-3 ${t.headerBg} ${t.cardBorder}`}
          >
            <p className={`hidden md:block mr-auto text-[10px] leading-5 ${t.subText}`}>完成項目預設收起；切換「全部」或「已完成」即可查看與復原。</p>
            {completedCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`確定清除這個清單中已完成的 ${completedCount} 個項目？`)) {
                    onClearCompleted?.(scope, scope === 'personal' ? actor : '');
                  }
                }}
                className={`min-h-11 px-3 rounded-xl border text-xs font-bold hover:text-red-500 hover:border-red-500 transition-colors ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
              >
                清除已完成
              </button>
            ) : null}
            <button type="button" onClick={onClose} className="min-h-11 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black shadow-md active:scale-95">完成</button>
          </footer>
        </div>
      </div>

      {editorState ? (
        <ChecklistItemEditorModal
          mode={editorState.mode}
          item={editorState.item}
          scope={scope}
          actor={actor}
          members={safeMembers}
          existingItems={safeItems}
          defaultCategory={editorState.defaultCategory}
          onClose={() => setEditorState(null)}
          onSave={handleEditorSave}
          onDelete={editorState.mode === 'edit' ? handleEditorDelete : undefined}
          t={t}
        />
      ) : null}
    </>
  );
};

// ============================================================================
// 7. 行程匯出
// ============================================================================
export const ExportItineraryModal = ({
  days,
  currentDay,
  isExportingImage,
  onClose,
  onExportFull,
  onExportDay,
  t
}) => {
  useBodyScrollLock();
  const safeDays = Array.isArray(days) ? days : [];
  const [mode, setMode] = useState('full');
  const [selectedDay, setSelectedDay] = useState(currentDay || safeDays[0] || 'Day 1');
  const [layout, setLayout] = useState('detailed');
  const [includeWeather, setIncludeWeather] = useState(true);
  const [includeAddresses, setIncludeAddresses] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);

  const submit = () => {
    if (mode === 'day') {
      onExportDay?.(selectedDay);
      return;
    }
    onExportFull?.({ layout, includeWeather, includeAddresses, includeNotes });
  };

  return (
    <div
      style={{ zIndex: 9999, touchAction: 'none' }}
      className="fixed inset-0 bg-black/65 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
        className={`w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl border shadow-2xl animate-in zoom-in-95 ${t.modalBg} ${t.cardBorder}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={`sticky top-0 z-10 flex items-start justify-between gap-4 p-5 md:p-6 border-b backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>
          <div>
            <h2 className={`text-xl font-black ${t.mainText}`}>🖨️ 匯出行程</h2>
            <p className={`text-xs mt-1 leading-5 ${t.subText}`}>完整行程適合列印、另存 PDF 或傳給不常使用 App 的同行者。</p>
          </div>
          <button onClick={onClose} className={`w-10 h-10 rounded-full bg-slate-500/10 flex items-center justify-center text-lg hover:bg-red-500 hover:text-white transition-colors shrink-0 ${t.subText}`}>✕</button>
        </header>

        <div className="p-5 md:p-6 space-y-6">
          <section>
            <label className={`block text-[10px] font-black tracking-wider uppercase mb-2 ${t.subText}`}>匯出範圍</label>
            <div className={`grid grid-cols-2 gap-2 p-1 rounded-2xl border ${t.cardBg} ${t.cardBorder}`}>
              <button
                onClick={() => setMode('full')}
                className={`rounded-xl px-3 py-3 text-xs font-black transition-all ${mode === 'full' ? 'bg-purple-600 text-white shadow-md' : t.subText}`}
              >
                📚 完整行程
              </button>
              <button
                onClick={() => setMode('day')}
                className={`rounded-xl px-3 py-3 text-xs font-black transition-all ${mode === 'day' ? 'bg-blue-600 text-white shadow-md' : t.subText}`}
              >
                📸 單日圖片
              </button>
            </div>
          </section>

          {mode === 'full' ? (
            <>
              <section className={`rounded-2xl border p-4 ${t.cardMetaBg} ${t.cardBorder}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📄</span>
                  <div>
                    <h3 className={`text-sm font-black ${t.mainText}`}>A4 多頁列印版</h3>
                    <p className={`text-[11px] mt-1 leading-5 ${t.subText}`}>包含封面、旅程摘要和每一天的時間軸。開啟預覽後，可使用瀏覽器「列印」並選擇另存 PDF。</p>
                  </div>
                </div>
              </section>

              <section>
                <label className={`block text-[10px] font-black tracking-wider uppercase mb-2 ${t.subText}`}>版面密度</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLayout('detailed')}
                    className={`p-4 rounded-2xl border text-left transition-all ${layout === 'detailed' ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/10' : `${t.cardBg} ${t.cardBorder}`}`}
                  >
                    <strong className={`block text-sm ${t.mainText}`}>舒適版</strong>
                    <span className={`text-[10px] leading-4 ${t.subText}`}>留白較多，適合閱讀與分享</span>
                  </button>
                  <button
                    onClick={() => setLayout('compact')}
                    className={`p-4 rounded-2xl border text-left transition-all ${layout === 'compact' ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/10' : `${t.cardBg} ${t.cardBorder}`}`}
                  >
                    <strong className={`block text-sm ${t.mainText}`}>精簡版</strong>
                    <span className={`text-[10px] leading-4 ${t.subText}`}>壓縮間距，減少列印頁數</span>
                  </button>
                </div>
              </section>

              <section>
                <label className={`block text-[10px] font-black tracking-wider uppercase mb-2 ${t.subText}`}>包含內容</label>
                <div className={`rounded-2xl border divide-y ${t.cardBg} ${t.cardBorder}`}>
                  {[
                    { label: '每日天氣', description: '顯示溫度與降雨機率', checked: includeWeather, setter: setIncludeWeather },
                    { label: '景點地址', description: '方便離線查看與叫車', checked: includeAddresses, setter: setIncludeAddresses },
                    { label: '景點筆記', description: '可能包含私人內容，預設不勾選', checked: includeNotes, setter: setIncludeNotes },
                  ].map((option) => (
                    <label key={option.label} className={`flex items-center justify-between gap-4 p-4 cursor-pointer ${t.cardBorder}`}>
                      <span>
                        <strong className={`block text-xs ${t.mainText}`}>{option.label}</strong>
                        <span className={`text-[10px] ${t.subText}`}>{option.description}</span>
                      </span>
                      <input type="checkbox" checked={option.checked} onChange={(event) => option.setter(event.target.checked)} className="w-5 h-5 accent-purple-600" />
                    </label>
                  ))}
                </div>
              </section>

              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-[11px] leading-5 text-amber-700">
                🔐 為避免外洩，完整行程不會自動包含記帳明細、分帳餘額、票券圖片或附件。
              </div>
            </>
          ) : (
            <section>
              <label className={`block text-[10px] font-black tracking-wider uppercase mb-2 ${t.subText}`}>選擇日期</label>
              <select
                value={selectedDay}
                onChange={(event) => setSelectedDay(event.target.value)}
                className={`w-full p-3.5 rounded-xl border outline-none focus:ring-2 focus:ring-blue-500 ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
              >
                {safeDays.map((dayId) => <option key={dayId} value={dayId}>{dayId}</option>)}
              </select>
              <div className={`mt-4 rounded-2xl border p-4 ${t.cardMetaBg} ${t.cardBorder}`}>
                <p className={`text-xs font-bold ${t.mainText}`}>適合快速傳到聊天室</p>
                <p className={`text-[10px] mt-1 leading-5 ${t.subText}`}>會延續原本功能，把單日行程卡輸出成 JPG；長行程仍建議使用完整 PDF 版。</p>
              </div>
            </section>
          )}
        </div>

        <footer
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          className={`sticky bottom-0 flex justify-end gap-3 px-5 md:px-6 pt-4 border-t backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}
        >
          <button onClick={onClose} className={`px-5 py-2.5 text-sm font-bold ${t.mainText}`}>取消</button>
          <button
            onClick={submit}
            disabled={mode === 'day' && isExportingImage}
            className={`px-6 py-2.5 rounded-xl text-sm font-black text-white shadow-lg transition-all ${mode === 'full' ? 'bg-purple-600 hover:bg-purple-500 shadow-purple-500/25' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/25'} ${mode === 'day' && isExportingImage ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`}
          >
            {mode === 'full' ? '開啟列印預覽' : isExportingImage ? '圖片處理中…' : '下載單日圖片'}
          </button>
        </footer>
      </div>
    </div>
  );
};


export const SettlementModal = ({ members, suggestions, onClose, onSave, t }) => {
  useBodyScrollLock();
  const safeMembers = useMemo(() => [...new Set((Array.isArray(members) ? members : []).map(String).filter(Boolean))], [members]);
  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];
  const firstSuggestion = safeSuggestions[0] || {};
  const [from, setFrom] = useState(String(firstSuggestion.from || safeMembers[0] || ""));
  const [to, setTo] = useState(String(firstSuggestion.to || safeMembers.find(member => member !== from) || ""));
  const [amount, setAmount] = useState(firstSuggestion.amount ? String(Math.round(Number(firstSuggestion.amount))) : "");
  const [note, setNote] = useState("行前費用結算");

  const applySuggestion = (suggestion) => {
    setFrom(String(suggestion.from));
    setTo(String(suggestion.to));
    setAmount(String(Math.round(Number(suggestion.amount) || 0)));
  };

  const submit = () => {
    const numericAmount = Number(amount);
    if (!from || !to || from === to) return alert("請選擇不同的付款人與收款人。");
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return alert("請輸入有效的結算金額。");
    onSave({
      id: generateId(),
      scope: "pretrip",
      from,
      to,
      amount: Math.round(numericAmount * 100) / 100,
      note: String(note).trim(),
      createdAt: Date.now(),
    });
  };

  return (
    <div style={{ zIndex: 10000, touchAction: "pan-y" }} className="fixed inset-0 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div style={{ WebkitOverflowScrolling: "touch" }} className={`w-full max-w-md rounded-t-3xl sm:rounded-3xl border shadow-2xl max-h-[92dvh] overflow-y-auto ${t.modalBg} ${t.cardBorder}`} onClick={event => event.stopPropagation()}>
        <header className={`sticky top-0 z-10 p-5 border-b backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}>
          <div className="flex items-start justify-between gap-4">
            <div><h2 className={`text-xl font-black ${t.mainText}`}>💸 記錄行前結算</h2><p className={`text-[11px] mt-1 ${t.subText}`}>這是實際轉帳紀錄，不會改動原始支出或統計圖表。</p></div>
            <button type="button" onClick={onClose} className={`w-11 h-11 rounded-full bg-slate-500/10 font-bold ${t.subText}`}>✕</button>
          </div>
        </header>
        <div className="p-5 space-y-5">
          {safeSuggestions.length > 0 ? <section><p className={`text-[10px] font-bold uppercase mb-2 ${t.subText}`}>系統建議</p><div className="space-y-2">{safeSuggestions.map((suggestion, index) => <button type="button" key={`${suggestion.from}-${suggestion.to}-${index}`} onClick={() => applySuggestion(suggestion)} className={`w-full flex justify-between items-center p-3 rounded-xl border text-left hover:border-indigo-500 ${t.itemBg} ${t.cardBorder}`}><span className={`text-xs ${t.mainText}`}><b className="text-red-500">{suggestion.from}</b> → <b className="text-emerald-500">{suggestion.to}</b></span><b className={`font-mono ${t.mainText}`}>NT${Math.round(Number(suggestion.amount)).toLocaleString()}</b></button>)}</div></section> : null}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={`block text-[10px] font-bold mb-1.5 ${t.subText}`}>付款人</label><select value={from} onChange={event => setFrom(event.target.value)} className={`w-full p-3 rounded-xl border ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>{safeMembers.map(member => <option key={`from-${member}`} value={member}>{member}</option>)}</select></div>
            <div><label className={`block text-[10px] font-bold mb-1.5 ${t.subText}`}>收款人</label><select value={to} onChange={event => setTo(event.target.value)} className={`w-full p-3 rounded-xl border ${t.inputBg} ${t.cardBorder} ${t.mainText}`}>{safeMembers.map(member => <option key={`to-${member}`} value={member}>{member}</option>)}</select></div>
          </div>
          <div><label className={`block text-[10px] font-bold mb-1.5 ${t.subText}`}>實際轉帳金額（TWD）</label><input type="number" min="0" step="1" value={amount} onChange={event => setAmount(event.target.value)} className={`w-full p-3.5 rounded-xl border font-mono font-black text-lg ${t.inputBg} ${t.cardBorder} ${t.mainText}`} placeholder="0" /></div>
          <div><label className={`block text-[10px] font-bold mb-1.5 ${t.subText}`}>備註</label><input value={note} onChange={event => setNote(event.target.value)} className={`w-full p-3 rounded-xl border ${t.inputBg} ${t.cardBorder} ${t.mainText}`} placeholder="例如：已用 LINE Pay 轉帳" /></div>
          <div className={`p-3 rounded-xl border text-[10px] leading-5 ${t.cardMetaBg} ${t.cardBorder} ${t.subText}`}>結算紀錄只會抵銷「誰欠誰」的餘額。行前機票、住宿、網卡等原始支出仍會完整保留在總花費、預算進度與圓餅圖中。</div>
        </div>
        <footer style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }} className={`sticky bottom-0 flex justify-end gap-3 p-5 border-t backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}><button type="button" onClick={onClose} className={`px-5 py-2.5 font-bold ${t.mainText}`}>取消</button><button type="button" onClick={submit} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black shadow-lg active:scale-95">確認已轉帳</button></footer>
      </div>
    </div>
  );
};
