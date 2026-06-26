// TripDetail.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useMapsLibrary, useMap, AdvancedMarker, Pin, Map } from '@vis.gl/react-google-maps';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import html2canvas from 'html2canvas-pro';

import {
  LoadingSpinner,
  MemoViewModal,
  PlaceDetailsModal,
  EditItemModal,
  CopyItemModal,
  ExpenseModal,
  SettlementModal,
  TicketModal,
  FullscreenTicketModal,
  ChecklistModal,
  ExportItineraryModal,
  SearchBox,
  Directions
} from './components/UIComponents.jsx';

import { db, storage } from "./firebase";
import { ref as dbRef, onValue, update } from "firebase/database";
import { deleteObject, ref as storageRef } from "firebase/storage";
import {
  formatStayTime,
  generateId,
  getDayDisplay,
  getExploreIcon,
  getInclusiveDayCount,
  getNextDefaultTimeFromList,
  getThemeClasses,
  isValidCoordinates,
  minsToTime,
  normalizeMembers,
  openExternalUrl,
  parseDateOnlyLocal,
  sortDayIds,
  timeToMins
} from "./helpers";
import { CATEGORIES, MAP_ID } from "./constants";


const ExpensePieCard = ({ title, subtitle, total, stats, t }) => {
  const safeTotal = Number(total) || 0;
  const safeStats = Array.isArray(stats) ? stats : [];

  return (
    <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h3 className={`text-sm font-bold flex items-center gap-2 ${t.mainText}`}>{title}</h3>
          {subtitle ? <p className={`text-[10px] mt-1 ${t.subText}`}>{subtitle}</p> : null}
        </div>
        <span className={`text-[10px] font-mono font-bold whitespace-nowrap ${t.subText}`}>
          NT$ {Math.round(safeTotal).toLocaleString()}
        </span>
      </div>

      {safeTotal > 0 && safeStats.length > 0 ? (
        <div className="flex flex-col items-center">
          <div className="relative w-44 h-44 mb-7">
            <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90 drop-shadow-xl" role="img" aria-label={`${title}分類圓餅圖`}>
              <circle
                cx="20"
                cy="20"
                r="15.5"
                fill="transparent"
                strokeWidth="7"
                className="text-slate-500/15 stroke-current"
              />
              {(() => {
                let offset = 0;
                return safeStats.map(category => {
                  const percent = (Number(category.amount) / safeTotal) * 100;
                  if (!Number.isFinite(percent) || percent <= 0) return null;
                  const dashOffset = -offset;
                  offset += percent;

                  return (
                    <circle
                      key={`pie-${title}-${category.id}`}
                      cx="20"
                      cy="20"
                      r="15.5"
                      pathLength="100"
                      fill="transparent"
                      strokeWidth="7"
                      strokeDasharray={`${percent} ${100 - percent}`}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="butt"
                      className={`${category.text || category.color.replace('bg-', 'text-')} stroke-current transition-all duration-700 ease-out`}
                    />
                  );
                });
              })()}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`text-[10px] font-bold ${t.subText}`}>總計</span>
              <span className={`text-base font-black font-mono ${t.mainText}`}>
                NT${Math.round(safeTotal).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            {safeStats.map(category => {
              const percent = ((Number(category.amount) / safeTotal) * 100).toFixed(1);
              return (
                <div key={`legend-${title}-${category.id}`} className={`p-2.5 rounded-xl border ${t.itemBg} ${t.cardBorder} flex items-center gap-3`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-inner ${category.color} text-white`}>
                    {category.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-bold truncate ${t.subText}`}>{category.label} {percent}%</p>
                    <p className={`text-xs font-mono font-black truncate ${category.text || category.color.replace('bg-', 'text-')}`}>
                      NT${Math.round(Number(category.amount) || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-10 text-center opacity-50">
          <span className="text-4xl">📊</span>
          <p className={`text-xs font-bold mt-3 ${t.mainText}`}>尚無花費資料</p>
        </div>
      )}
    </div>
  );
};


const cloneRouteItems = (items) => (
  (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    tags: Array.isArray(item?.tags) ? [...item.tags] : [],
    nextLeg: item?.nextLeg ? { ...item.nextLeg } : undefined,
  }))
);

const getRouteTotals = (route) => {
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  return legs.reduce((totals, leg) => ({
    minutes: totals.minutes + Math.max(0, Math.round(Number(leg?.duration?.value || 0) / 60)),
    meters: totals.meters + Math.max(0, Number(leg?.distance?.value || 0)),
  }), { minutes: 0, meters: 0 });
};

const formatRouteMinutes = (minutes) => {
  const safeMinutes = Math.max(0, Math.round(Number(minutes) || 0));
  if (safeMinutes < 60) return `${safeMinutes} 分鐘`;
  const hours = Math.floor(safeMinutes / 60);
  const remaining = safeMinutes % 60;
  return remaining > 0 ? `${hours} 小時 ${remaining} 分` : `${hours} 小時`;
};

const formatRouteDistance = (meters) => {
  const safeMeters = Math.max(0, Number(meters) || 0);
  if (safeMeters < 1000) return `${Math.round(safeMeters)} 公尺`;
  return `${(safeMeters / 1000).toFixed(safeMeters >= 10000 ? 1 : 2)} 公里`;
};

const getOptimizationAssessment = ({ savedMinutes, savedMeters, savedPercent, movedCount }) => {
  if (movedCount === 0 || (savedMinutes <= 1 && savedMeters <= 300)) {
    return {
      level: 'already-good',
      title: '目前順序已接近最佳',
      description: '固定第一站與最後一站後，中間景點沒有更好的排列，建議維持原順序。',
      className: 'border-slate-400/30 bg-slate-500/10 text-slate-500',
    };
  }
  if (savedMinutes >= 15 || savedPercent >= 10 || savedMeters >= 5000) {
    return {
      level: 'recommended',
      title: '值得套用',
      description: '預估可明顯減少移動時間，且不會改變第一站與最後一站。',
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
    };
  }
  if (savedMinutes >= 5 || savedPercent >= 5 || savedMeters >= 1000) {
    return {
      level: 'moderate',
      title: '可小幅改善',
      description: '路線有改善，但節省幅度有限；可依景點偏好決定是否套用。',
      className: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
    };
  }
  return {
    level: 'minor',
    title: '改善不明顯',
    description: '雖然順序有變動，但節省時間很少，通常不值得打亂原本安排。',
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
  };
};

const RouteOptimizationPreviewModal = ({ preview, onClose, onApply, t }) => {
  if (!preview) return null;

  const {
    dayTitle,
    originalItems,
    optimizedItems,
    before,
    after,
    savedMinutes,
    savedMeters,
    savedPercent,
    movedCount,
    assessment,
    warnings,
  } = preview;

  const canApply = movedCount > 0 && (savedMinutes > 0 || savedMeters > 300);

  return (
    <div
      style={{ zIndex: 10050, touchAction: 'none' }}
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-hidden"
      onClick={onClose}
    >
      <div
        style={{ touchAction: 'auto' }}
        className={`w-full max-w-2xl max-h-[92vh] overflow-hidden rounded-3xl border shadow-2xl flex flex-col ${t.modalBg} ${t.cardBorder}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`p-5 md:p-6 border-b flex items-start justify-between gap-4 ${t.headerBg} ${t.cardBorder}`}>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🧭</span>
              <h2 className={`text-xl font-black ${t.mainText}`}>智慧排路線預覽</h2>
            </div>
            <p className={`text-xs leading-5 ${t.subText}`}>
              {dayTitle}｜固定第一站與最後一站，只重新排列中間景點
            </p>
          </div>
          <button
            onClick={onClose}
            className={`w-10 h-10 rounded-full flex items-center justify-center bg-slate-500/10 hover:bg-red-500 hover:text-white transition-colors ${t.subText}`}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5 scrollbar-hide">
          <div className={`rounded-2xl border p-4 ${assessment.className}`}>
            <p className="font-black text-sm">{assessment.title}</p>
            <p className="text-xs mt-1 leading-5 opacity-90">{assessment.description}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-2xl border p-4 ${t.cardBg} ${t.cardBorder}`}>
              <p className={`text-[10px] uppercase tracking-wider font-bold ${t.subText}`}>原路線</p>
              <p className={`text-lg font-black mt-1 ${t.mainText}`}>{formatRouteMinutes(before.minutes)}</p>
              <p className={`text-xs mt-1 ${t.subText}`}>{formatRouteDistance(before.meters)}</p>
            </div>
            <div className={`rounded-2xl border p-4 ${t.cardBg} ${t.cardBorder}`}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500">建議路線</p>
              <p className="text-lg font-black mt-1 text-emerald-500">{formatRouteMinutes(after.minutes)}</p>
              <p className={`text-xs mt-1 ${t.subText}`}>{formatRouteDistance(after.meters)}</p>
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${t.cardMetaBg} ${t.cardBorder}`}>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <p className={`text-[10px] font-bold ${t.subText}`}>預估省下</p>
                <p className={`text-sm font-black mt-1 ${savedMinutes > 0 ? 'text-emerald-500' : t.mainText}`}>
                  {savedMinutes > 0 ? formatRouteMinutes(savedMinutes) : '0 分鐘'}
                </p>
              </div>
              <div>
                <p className={`text-[10px] font-bold ${t.subText}`}>距離變化</p>
                <p className={`text-sm font-black mt-1 ${savedMeters > 0 ? 'text-emerald-500' : savedMeters < 0 ? 'text-amber-500' : t.mainText}`}>
                  {savedMeters > 0
                    ? `減少 ${formatRouteDistance(savedMeters)}`
                    : savedMeters < 0
                      ? `增加 ${formatRouteDistance(Math.abs(savedMeters))}`
                      : '持平'}
                </p>
              </div>
              <div>
                <p className={`text-[10px] font-bold ${t.subText}`}>調整站點</p>
                <p className={`text-sm font-black mt-1 ${t.mainText}`}>{movedCount} 站</p>
              </div>
            </div>
            <p className={`text-[10px] mt-3 text-center ${t.subText}`}>
              移動時間改善約 {Math.max(0, savedPercent).toFixed(1)}%。停留時間不影響排序，只用來重算抵達時間。
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-black ${t.mainText}`}>建議順序</h3>
              <span className={`text-[10px] font-bold ${t.subText}`}>紫色標籤代表位置有變動</span>
            </div>
            <div className="space-y-2">
              {optimizedItems.map((item, index) => {
                const originalIndex = originalItems.findIndex((candidate) => candidate.id === item.id);
                const moved = originalIndex !== index;
                const isEndpoint = index === 0 || index === optimizedItems.length - 1;
                return (
                  <div key={`route-preview-${item.id}`} className={`rounded-xl border p-3 flex items-center gap-3 ${t.itemBg} ${t.cardBorder}`}>
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${isEndpoint ? 'bg-slate-500 text-white' : 'bg-blue-600 text-white'}`}>
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${t.mainText}`}>{String(item.customName || item.name)}</p>
                      <p className={`text-[10px] mt-0.5 ${t.subText}`}>
                        {isEndpoint ? (index === 0 ? '固定起點' : '固定終點') : `預估抵達 ${item.time || '未設定'}`}
                      </p>
                    </div>
                    {moved ? (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-500 whitespace-nowrap">
                        原第 {originalIndex + 1} 站
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {warnings.length > 0 ? (
            <div className="space-y-2">
              {warnings.map((warning, index) => (
                <div key={`route-warning-${index}`} className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-5 text-amber-600">
                  ⚠️ {warning}
                </div>
              ))}
            </div>
          ) : null}

          <div className={`rounded-xl border p-3 text-[10px] leading-5 ${t.cardBg} ${t.cardBorder} ${t.subText}`}>
            最佳化標準：在第一站與最後一站固定的前提下，優先降低 Google Maps 預估的總駕車時間，距離作為輔助比較。此功能不會判斷營業時間、訂位時段、個人偏好或景點重要性。
          </div>
        </div>

        <div className={`p-5 border-t flex flex-col-reverse sm:flex-row justify-end gap-3 ${t.headerBg} ${t.cardBorder}`}>
          <button onClick={onClose} className={`px-5 py-3 rounded-xl text-sm font-bold ${t.mainText} hover:opacity-70`}>
            保留原路線
          </button>
          <button
            onClick={onApply}
            disabled={!canApply}
            className={`px-6 py-3 rounded-xl text-sm font-bold text-white shadow-lg transition-all ${canApply ? 'bg-blue-600 hover:bg-blue-500 active:scale-95 shadow-blue-500/30' : 'bg-slate-400 cursor-not-allowed opacity-60'}`}
          >
            {canApply ? '套用建議順序' : '目前不需調整'}
          </button>
        </div>
      </div>
    </div>
  );
};

const DEFAULT_META = {
  title: "未命名",
  destination: "",
  startDate: "",
  endDate: "",
  members: ["自己"],
  memberBudgets: { "自己": 10000 },
  transport: "汽車 🚗",
  themeColor: "#1e293b",
  dayThemes: {},
};

const toSafeList = (value) => (
  Array.isArray(value) ? value : Object.values(value || {})
);

const normalizeChecklist = (value) => {
  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(item?.id || `legacy_${index}`), item])
    : Object.entries(value || {});

  return entries
    .map(([key, rawItem]) => {
      const item = rawItem && typeof rawItem === 'object' ? rawItem : {};
      const text = String(item.text || '').trim();
      if (!text) return null;

      return {
        id: String(item.id || key),
        text,
        scope: item.scope === 'personal' ? 'personal' : 'shared',
        owner: String(item.owner || ''),
        assignee: String(item.assignee || '所有人'),
        category: String(item.category || 'todo'),
        important: Boolean(item.important),
        completed: Boolean(item.completed),
        completedAt: Number(item.completedAt) || null,
        completedBy: String(item.completedBy || ''),
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Number(item.createdAt) || Date.now(),
      };
    })
    .filter(Boolean);
};

const normalizeMeta = (value) => {
  const raw = value && typeof value === "object" ? value : {};
  const members = normalizeMembers(raw.members);
  const memberBudgets = { ...(raw.memberBudgets || {}) };
  members.forEach((member) => {
    if (!Number.isFinite(Number(memberBudgets[member]))) memberBudgets[member] = 10000;
  });

  return {
    ...DEFAULT_META,
    ...raw,
    members,
    memberBudgets,
    dayThemes: raw.dayThemes && typeof raw.dayThemes === "object" ? raw.dayThemes : {},
  };
};

const normalizeItinerary = (rawValue, meta) => {
  const rawItinerary = rawValue && typeof rawValue === "object" ? rawValue : {};
  const dayCount = Math.max(1, getInclusiveDayCount(meta?.startDate, meta?.endDate));
  const safeItinerary = {};

  for (let dayNumber = 1; dayNumber <= dayCount; dayNumber += 1) {
    const dayId = `Day ${dayNumber}`;
    safeItinerary[dayId] = toSafeList(rawItinerary[dayId]);
  }

  const lastDayId = `Day ${dayCount}`;
  Object.entries(rawItinerary).forEach(([dayId, rawItems]) => {
    const match = /^Day\s+(\d+)$/.exec(dayId);
    if (!match || Number(match[1]) <= dayCount) return;

    const orphanItems = toSafeList(rawItems);
    if (orphanItems.length === 0) return;
    safeItinerary[lastDayId].push(...orphanItems.map((item) => ({
      ...item,
      tags: [...(Array.isArray(item?.tags) ? item.tags : []), "⚠️ 日期變更移入"],
    })));
  });

  return safeItinerary;
};

const getRouteDurationMinutes = (duration) => {
  const value = Number(duration?.mins ?? duration?.minutes ?? duration?.value);
  return Number.isFinite(value) && value >= 0 ? value : 30;
};

const useRoomBranchSync = ({
  roomId,
  branch,
  value,
  dirtyBranchesRef,
  writeVersionRef,
  setSyncStatus,
}) => {
  useEffect(() => {
    if (!db || !roomId || value === null || !dirtyBranchesRef.current[branch]) return undefined;

    const version = (writeVersionRef.current[branch] || 0) + 1;
    writeVersionRef.current[branch] = version;
    setSyncStatus("saving");

    const timer = window.setTimeout(() => {
      const writeBranch = async () => {
        try {
          await update(dbRef(db, `rooms/${roomId}`), { [branch]: value });
          if (writeVersionRef.current[branch] === version) {
            dirtyBranchesRef.current[branch] = false;
            setSyncStatus("saved");
          }
        } catch (error) {
          console.error(`Sync ${branch} failed:`, error);
          if (writeVersionRef.current[branch] === version) {
            dirtyBranchesRef.current[branch] = false;
            setSyncStatus("error");
          }
        }
      };
      void writeBranch();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [branch, dirtyBranchesRef, roomId, setSyncStatus, value, writeVersionRef]);
};

const PRE_TRIP_ID = "PRE_TRIP";

const TripDetail = ({ roomId, onBack, onUpdateTripMeta }) => {
  const [isLoading, setIsLoading] = useState(true);

  /** @type {[any, React.Dispatch<any>]} */
  const [meta, setMetaState] = useState(null);

  /** @type {[Record<string, any[]>, React.Dispatch<React.SetStateAction<Record<string, any[]>>>]} */
  const [itinerary, setItineraryState] = useState({ "Day 1": [] });

  /** @type {[any[], React.Dispatch<React.SetStateAction<any[]>>]} */
  const [expenses, setExpensesState] = useState([]);
  /** @type {[any[], React.Dispatch<React.SetStateAction<any[]>>]} */
  const [settlements, setSettlementsState] = useState([]);
  /** @type {[any[], React.Dispatch<React.SetStateAction<any[]>>]} */
  const [tickets, setTicketsState] = useState([]);
  /** @type {[any[], React.Dispatch<React.SetStateAction<any[]>>]} */
  const [checklistItems, setChecklistItemsState] = useState([]);

  const [syncStatus, setSyncStatus] = useState("idle");
  const [loadError, setLoadError] = useState("");
  const dirtyBranchesRef = useRef({ meta: false, itinerary: false, expenses: false, settlements: false, tickets: false });
  const writeVersionRef = useRef({ meta: 0, itinerary: 0, expenses: 0, settlements: 0, tickets: 0 });
  const checklistWriteVersionRef = useRef(0);

  const setMeta = useCallback((updater) => {
    dirtyBranchesRef.current.meta = true;
    setMetaState(updater);
  }, []);

  const setItinerary = useCallback((updater) => {
    dirtyBranchesRef.current.itinerary = true;
    setItineraryState(updater);
  }, []);

  const setExpenses = useCallback((updater) => {
    dirtyBranchesRef.current.expenses = true;
    setExpensesState(updater);
  }, []);

  const setSettlements = useCallback((updater) => {
    dirtyBranchesRef.current.settlements = true;
    setSettlementsState(updater);
  }, []);

  const setTickets = useCallback((updater) => {
    dirtyBranchesRef.current.tickets = true;
    setTicketsState(updater);
  }, []);

  const [currentDay, setCurrentDay] = useState("Day 1");
  const [activeTab, setActiveTab] = useState("plan");

  /** @type {[any, React.Dispatch<any>]} */
  const [editingItemData, setEditingItemData] = useState(null);
  /** @type {[any, React.Dispatch<any>]} */
  const [viewingMemoItem, setViewingMemoItem] = useState(null);
  /** @type {[any, React.Dispatch<any>]} */
  const [copyingItem, setCopyingItem] = useState(null);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  /** @type {[any, React.Dispatch<any>]} */
  const [editingExpense, setEditingExpense] = useState(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistActor, setChecklistActorState] = useState(() => {
    try {
      return localStorage.getItem(`travel-checklist-actor-${roomId}`) || '';
    } catch {
      return '';
    }
  });
  /** @type {[any, React.Dispatch<any>]} */
  const [fullscreenTicket, setFullscreenTicket] = useState(null);
  const [expenseView, setExpenseView] = useState('list');
  const [expenseChartOwner, setExpenseChartOwner] = useState('ALL');
  /** @type {[Record<string, any>, React.Dispatch<React.SetStateAction<Record<string, any>>>]} */
  const [routeDurations, setRouteDurations] = useState({});

  const placesLib = useMapsLibrary('places');
  const [exploreQuery, setExploreQuery] = useState("");

  /** @type {[any[], React.Dispatch<React.SetStateAction<any[]>>]} */
  const [exploreResults, setExploreResults] = useState([]);
  /** @type {[any, React.Dispatch<any>]} */
  const [selectedExploreItem, setSelectedExploreItem] = useState(null);
  /** @type {[any, React.Dispatch<any>]} */
  const [exploreOriginItem, setExploreOriginItem] = useState(null);

  /** @type {[any, React.Dispatch<any>]} */
  const [detailedPlace, setDetailedPlace] = useState(null);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSavedItemModal, setIsSavedItemModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationPreview, setOptimizationPreview] = useState(null);
  const [optimizationSummaries, setOptimizationSummaries] = useState({});

  /** @type {[any, React.Dispatch<any>]} */
  const [backupItin, setBackupItin] = useState(null);

  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  /** @type {[Record<string, {temp: string, rain: number}>, React.Dispatch<React.SetStateAction<Record<string, {temp: string, rain: number}>>]} */
  const [weatherInfo, setWeatherInfo] = useState({});


  const routesLib = useMapsLibrary('routes');
  const map = useMap('main-map');

  useEffect(() => {
    setLoadError("");
    setIsLoading(true);
    dirtyBranchesRef.current = { meta: false, itinerary: false, expenses: false, settlements: false, tickets: false };
    writeVersionRef.current = { meta: 0, itinerary: 0, expenses: 0, settlements: 0, tickets: 0 };
    checklistWriteVersionRef.current = 0;

    if (!db || !roomId) {
      setMetaState({
        ...DEFAULT_META,
        title: "單機預覽模式 (無資料庫)",
        destination: "沖繩",
        startDate: "2026-09-20",
        endDate: "2026-09-24",
      });
      setItineraryState({ "Day 1": [] });
      setExpensesState([]);
      setSettlementsState([]);
      setTicketsState([]);
      setChecklistItemsState([]);
      setIsLoading(false);
      return undefined;
    }

    const roomRef = dbRef(db, `rooms/${roomId}`);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        const data = snapshot.val();
        if (!data) {
          setLoadError("找不到這個旅程，可能已被刪除或你沒有讀取權限。");
          setIsLoading(false);
          return;
        }

        setLoadError("");
        const loadedMeta = normalizeMeta(data.meta);
        const loadedItinerary = normalizeItinerary(data.itinerary, loadedMeta);
        const loadedExpenses = toSafeList(data.expenses);
        const loadedSettlements = toSafeList(data.settlements);
        const loadedTickets = toSafeList(data.tickets);
        const loadedChecklist = normalizeChecklist(data.checklist);

        if (!dirtyBranchesRef.current.meta) setMetaState(loadedMeta);
        if (!dirtyBranchesRef.current.itinerary) setItineraryState(loadedItinerary);
        if (!dirtyBranchesRef.current.expenses) setExpensesState(loadedExpenses);
        if (!dirtyBranchesRef.current.settlements) setSettlementsState(loadedSettlements);
        if (!dirtyBranchesRef.current.tickets) setTicketsState(loadedTickets);
        setChecklistItemsState(loadedChecklist);

        setIsLoading(false);
      },
      (error) => {
        console.error("Load room failed:", error);
        setLoadError("旅程載入失敗，請檢查網路連線或 Firebase 權限。");
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  useRoomBranchSync({
    roomId,
    branch: "meta",
    value: meta,
    dirtyBranchesRef,
    writeVersionRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "itinerary",
    value: itinerary,
    dirtyBranchesRef,
    writeVersionRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "expenses",
    value: expenses,
    dirtyBranchesRef,
    writeVersionRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "settlements",
    value: settlements,
    dirtyBranchesRef,
    writeVersionRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "tickets",
    value: tickets,
    dirtyBranchesRef,
    writeVersionRef,
    setSyncStatus,
  });

  useEffect(() => {
    if (meta && roomId) onUpdateTripMeta?.(roomId, meta);
  }, [meta, onUpdateTripMeta, roomId]);

  const existingDays = useMemo(() => sortDayIds(Object.keys(itinerary)), [itinerary]);
  const safeCurrentDay = existingDays.includes(currentDay) ? currentDay : (existingDays[0] || "Day 1");

  useEffect(() => {
    if (!map || !itinerary[safeCurrentDay]) return;
    const dayItems = Array.isArray(itinerary[safeCurrentDay]) ? itinerary[safeCurrentDay] : [];
    if (dayItems.length === 0) return;

    const validItems = dayItems.filter((item) => isValidCoordinates(item?.lat, item?.lng));

    if (validItems.length === 0) return;

    const timer = setTimeout(() => {
      if (validItems.length === 1) {
        map.panTo({ lat: Number(validItems[0].lat), lng: Number(validItems[0].lng) });
        map.setZoom(15);
      } else {
        const bounds = new window.google.maps.LatLngBounds();
        validItems.forEach(item => {
          bounds.extend({ lat: Number(item.lat), lng: Number(item.lng) });
        });
        map.fitBounds(bounds, { top: 60, bottom: 60, left: 40, right: 40 });
        window.google.maps.event.addListenerOnce(map, "idle", () => {
          if (map.getZoom() > 16) map.setZoom(16);
        });
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [map, safeCurrentDay, itinerary, activeTab]);

  useEffect(() => {
    if (!meta?.destination || !meta?.startDate || existingDays.length === 0) return undefined;

    const controller = new AbortController();

    const fetchWeatherForecast = async () => {
      try {
        let latitude = Number(meta.destLat);
        let longitude = Number(meta.destLng);

        if (!isValidCoordinates(latitude, longitude)) {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(meta.destination)}&count=1&language=zh`,
            { signal: controller.signal }
          );
          if (!geoRes.ok) throw new Error(`Geocoding failed: ${geoRes.status}`);
          const geoData = await geoRes.json();
          if (!geoData.results?.length) return;
          latitude = Number(geoData.results[0].latitude);
          longitude = Number(geoData.results[0].longitude);
        }

        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`,
          { signal: controller.signal }
        );
        if (!weatherRes.ok) throw new Error(`Weather failed: ${weatherRes.status}`);

        const weatherData = await weatherRes.json();
        if (!weatherData?.daily) return;

        const daily = weatherData.daily;
        const newWeatherMap = {};
        const tripStart = parseDateOnlyLocal(meta.startDate);
        if (!tripStart) return;

        existingDays.forEach((dayId) => {
          const dayNumber = Number(dayId.replace('Day ', '')) || 1;
          const targetDate = new Date(tripStart);
          targetDate.setDate(targetDate.getDate() + dayNumber - 1);

          const dateIso = [
            targetDate.getFullYear(),
            String(targetDate.getMonth() + 1).padStart(2, '0'),
            String(targetDate.getDate()).padStart(2, '0'),
          ].join('-');

          const index = (daily.time || []).indexOf(dateIso);
          if (index === -1) return;

          newWeatherMap[dayId] = {
            temp: `${Math.round(daily.temperature_2m_min[index])}~${Math.round(daily.temperature_2m_max[index])}°C`,
            rain: Number(daily.precipitation_probability_max[index]) || 0,
          };
        });

        setWeatherInfo(newWeatherMap);
      } catch (error) {
        if (error?.name !== 'AbortError') console.warn("Weather sync failed:", error);
      }
    };

    void fetchWeatherForecast();
    return () => controller.abort();
  }, [existingDays, meta?.destLat, meta?.destLng, meta?.destination, meta?.startDate]);

  const tripThemeColor = String(meta?.themeColor || '#1e293b');
  const t = useMemo(() => getThemeClasses(tripThemeColor), [tripThemeColor]);

  const handleDayThemeUpdate = (dayId) => {
    const currentTheme = meta?.dayThemes?.[dayId] || "";
    const newTheme = window.prompt(`請輸入 ${dayId} 的專屬主題名稱：\n(例如：大自然探索、極致購物日)`, currentTheme);
    if (newTheme !== null) {
      setMeta((previousMeta) => ({
        ...previousMeta,
        dayThemes: {
          ...(previousMeta?.dayThemes || {}),
          [dayId]: String(newTheme).trim(),
        },
      }));
    }
  };

  const handleColorChange = (newColor) => {
    setMeta((previousMeta) => ({ ...previousMeta, themeColor: String(newColor) }));
  };

  const handleBudgetChange = (member, value) => {
    const parsedValue = Number(value);
    setMeta((previousMeta) => ({
      ...previousMeta,
      memberBudgets: {
        ...(previousMeta?.memberBudgets || {}),
        [String(member)]: Number.isFinite(parsedValue) && parsedValue >= 0 ? parsedValue : 0,
      },
    }));
  };

  const membersList = useMemo(() => normalizeMembers(meta?.members), [meta?.members]);

  const openNewExpense = useCallback(() => {
    setEditingExpense(null);
    setShowExpenseModal(true);
  }, []);

  const openExpenseEditor = useCallback((expense) => {
    setEditingExpense(expense);
    setShowExpenseModal(true);
  }, []);

  const closeExpenseEditor = useCallback(() => {
    setShowExpenseModal(false);
    setEditingExpense(null);
  }, []);

  const handleSaveExpense = useCallback((nextExpense) => {
    setExpenses((previousExpenses) => {
      const safeExpenses = Array.isArray(previousExpenses) ? previousExpenses : [];
      const exists = safeExpenses.some(expense => String(expense.id) === String(nextExpense.id));
      return exists
        ? safeExpenses.map(expense => String(expense.id) === String(nextExpense.id) ? nextExpense : expense)
        : [...safeExpenses, nextExpense];
    });
    closeExpenseEditor();
  }, [closeExpenseEditor, setExpenses]);

  const handleDeleteExpense = useCallback((expenseId) => {
    setExpenses((previousExpenses) => (
      (Array.isArray(previousExpenses) ? previousExpenses : [])
        .filter(expense => String(expense.id) !== String(expenseId))
    ));
    closeExpenseEditor();
  }, [closeExpenseEditor, setExpenses]);

  const handleDuplicateExpense = useCallback((duplicatedExpense) => {
    setExpenses((previousExpenses) => [
      ...(Array.isArray(previousExpenses) ? previousExpenses : []),
      duplicatedExpense,
    ]);
    closeExpenseEditor();
  }, [closeExpenseEditor, setExpenses]);

  const handleSaveSettlement = useCallback((settlement) => {
    setSettlements((previous) => [
      ...(Array.isArray(previous) ? previous : []),
      settlement,
    ]);
    setShowSettlementModal(false);
  }, [setSettlements]);

  const handleDeleteSettlement = useCallback((settlementId) => {
    if (!window.confirm("確定刪除這筆結算紀錄嗎？刪除後待結算餘額會重新計算。")) return;
    setSettlements((previous) => (Array.isArray(previous) ? previous : []).filter(
      item => String(item.id) !== String(settlementId)
    ));
  }, [setSettlements]);
  const activeChecklistMember = membersList.includes(checklistActor)
    ? checklistActor
    : (membersList[0] || '自己');

  const sharedChecklistStats = useMemo(() => {
    const sharedItems = checklistItems.filter(item => item.scope === 'shared');
    return {
      total: sharedItems.length,
      completed: sharedItems.filter(item => item.completed).length,
      open: sharedItems.filter(item => !item.completed).length,
    };
  }, [checklistItems]);

  const expenseStats = useMemo(() => {
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const safeSettlements = Array.isArray(settlements) ? settlements : [];
    const total = safeExpenses.reduce((sum, expense) => sum + (Number(expense.cost) || 0), 0);
    const groupOrder = [PRE_TRIP_ID, ...existingDays];
    const groupedMap = Object.fromEntries(groupOrder.map((day) => [day, []]));

    const buildBalanceSnapshot = (expenseFilter) => {
      const balances = {};
      const personal = {};
      membersList.forEach((member) => {
        balances[String(member)] = 0;
        personal[String(member)] = 0;
      });

      safeExpenses.filter(expenseFilter).forEach((expense) => {
        const payer = String(expense.payer);
        const cost = Number(expense.cost) || 0;
        if (balances[payer] !== undefined) balances[payer] += cost;
        if (expense.split && typeof expense.split === "object") {
          Object.entries(expense.split).forEach(([member, rawAmount]) => {
            if (balances[member] === undefined) return;
            const amount = Number(rawAmount) || 0;
            balances[member] -= amount;
            personal[member] += amount;
          });
        } else {
          const splitAmount = cost / Math.max(1, membersList.length);
          membersList.forEach((member) => {
            const key = String(member);
            balances[key] -= splitAmount;
            personal[key] += splitAmount;
          });
        }
      });
      return { balances, personal };
    };

    safeExpenses.forEach((expense) => {
      const key = expense.dayId === PRE_TRIP_ID ? PRE_TRIP_ID : String(expense.dayId || "");
      if (groupedMap[key]) groupedMap[key].push(expense);
    });

    const allSnapshot = buildBalanceSnapshot(() => true);
    const preTripSnapshot = buildBalanceSnapshot(expense => expense.dayId === PRE_TRIP_ID);

    safeSettlements
      .filter(item => item.scope === "pretrip")
      .forEach(item => {
        const from = String(item.from || "");
        const to = String(item.to || "");
        const amount = Number(item.amount) || 0;
        if (preTripSnapshot.balances[from] !== undefined) preTripSnapshot.balances[from] += amount;
        if (preTripSnapshot.balances[to] !== undefined) preTripSnapshot.balances[to] -= amount;
        if (allSnapshot.balances[from] !== undefined) allSnapshot.balances[from] += amount;
        if (allSnapshot.balances[to] !== undefined) allSnapshot.balances[to] -= amount;
      });

    const buildTransfers = (balances) => {
      const debtors = [];
      const creditors = [];
      Object.entries(balances).forEach(([member, balance]) => {
        if (balance < -0.5) debtors.push({ member, amount: -balance });
        else if (balance > 0.5) creditors.push({ member, amount: balance });
      });
      debtors.sort((a, b) => b.amount - a.amount);
      creditors.sort((a, b) => b.amount - a.amount);
      const transfers = [];
      let debtorIndex = 0;
      let creditorIndex = 0;
      while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
        const amount = Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount);
        transfers.push({ from: debtors[debtorIndex].member, to: creditors[creditorIndex].member, amount });
        debtors[debtorIndex].amount -= amount;
        creditors[creditorIndex].amount -= amount;
        if (debtors[debtorIndex].amount < 0.5) debtorIndex += 1;
        if (creditors[creditorIndex].amount < 0.5) creditorIndex += 1;
      }
      return transfers;
    };

    return {
      totalExpense: total,
      groupedExpenses: groupOrder.map((day) => ({ day, items: groupedMap[day] || [] })),
      balances: allSnapshot.balances,
      personalSpent: allSnapshot.personal,
      transfers: buildTransfers(allSnapshot.balances),
      preTripBalances: preTripSnapshot.balances,
      preTripTransfers: buildTransfers(preTripSnapshot.balances),
      preTripTotal: safeExpenses.filter(expense => expense.dayId === PRE_TRIP_ID).reduce((sum, expense) => sum + (Number(expense.cost) || 0), 0),
      preTripSettlementTotal: safeSettlements.filter(item => item.scope === "pretrip").reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
    };
  }, [existingDays, expenses, membersList, settlements]);

  const categoryStats = useMemo(() => {
    const stats = {};
    CATEGORIES.forEach(c => { stats[c.id] = { ...c, amount: 0 }; });
    (Array.isArray(expenses) ? expenses : []).forEach(e => {
      if (stats[e.category]) {
        stats[e.category].amount += (Number(e.cost) || 0);
      }
    });
    return Object.values(stats).filter(s => s.amount > 0).sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const memberCategoryStats = useMemo(() => {
    const result = {};
    const safeMembers = Array.isArray(membersList) ? membersList.map(String) : [];
    const knownCategoryIds = new Set(CATEGORIES.map(category => category.id));

    safeMembers.forEach(member => {
      const categories = {};
      CATEGORIES.forEach(category => {
        categories[category.id] = { ...category, amount: 0 };
      });
      result[member] = { total: 0, categories };
    });

    (Array.isArray(expenses) ? expenses : []).forEach(expense => {
      const categoryId = knownCategoryIds.has(expense.category) ? expense.category : 'other';
      const addShare = (member, rawAmount) => {
        const memberKey = String(member);
        const amount = Number(rawAmount) || 0;
        if (amount <= 0 || !result[memberKey]) return;
        result[memberKey].total += amount;
        result[memberKey].categories[categoryId].amount += amount;
      };

      if (expense.split && typeof expense.split === 'object') {
        Object.entries(expense.split).forEach(([member, amount]) => addShare(member, amount));
      } else if (safeMembers.length > 0) {
        const equalShare = (Number(expense.cost) || 0) / safeMembers.length;
        safeMembers.forEach(member => addShare(member, equalShare));
      }
    });

    Object.values(result).forEach(memberStats => {
      memberStats.categories = Object.values(memberStats.categories)
        .filter(category => category.amount > 0)
        .sort((a, b) => b.amount - a.amount);
    });

    return result;
  }, [expenses, membersList]);

  const safeExpenseChartOwner =
    expenseChartOwner === 'ALL' || membersList.includes(expenseChartOwner)
      ? expenseChartOwner
      : 'ALL';

  const activeExpenseChart = safeExpenseChartOwner === 'ALL'
    ? {
        title: '📊 全團花費圓餅圖分析',
        subtitle: '依所有記帳項目的完整金額統計',
        total: expenseStats.totalExpense,
        categories: categoryStats,
      }
    : {
        title: `👤 ${safeExpenseChartOwner} 的個人花費`,
        subtitle: '依每筆帳款實際分攤到此成員的金額統計',
        total: memberCategoryStats[safeExpenseChartOwner]?.total || 0,
        categories: memberCategoryStats[safeExpenseChartOwner]?.categories || [],
      };

  const clearOptimizationSummary = useCallback((...dayIds) => {
    const uniqueDayIds = [...new Set(dayIds.filter(Boolean).map(String))];
    if (uniqueDayIds.length === 0) return;
    setOptimizationSummaries((previous) => {
      const next = { ...previous };
      let changed = false;
      uniqueDayIds.forEach((dayId) => {
        if (next[dayId]) {
          delete next[dayId];
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, []);

  const handleDragEnd = useCallback((result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceDay = String(source.droppableId);
    const destinationDay = String(destination.droppableId);
    setBackupItin(null);
    clearOptimizationSummary(sourceDay, destinationDay);
    setItinerary((previousItinerary) => {
      const sourceItems = [...(previousItinerary[sourceDay] || [])];
      const destinationItems = sourceDay === destinationDay
        ? sourceItems
        : [...(previousItinerary[destinationDay] || [])];

      const [movedItem] = sourceItems.splice(source.index, 1);
      if (!movedItem) return previousItinerary;
      destinationItems.splice(destination.index, 0, movedItem);

      return {
        ...previousItinerary,
        [sourceDay]: sourceItems,
        [destinationDay]: destinationItems,
      };
    });
  }, [clearOptimizationSummary, setItinerary]);

  const handleRouteCalculated = useCallback((day, durations) => {
    setRouteDurations(prev => JSON.stringify(prev[day]) !== JSON.stringify(durations) ? { ...prev, [day]: durations } : prev);
  }, []);

  const saveEditedItem = useCallback((updatedItem, shouldCascade) => {
    const editedDayId = String(editingItemData.dayId);
    setBackupItin(null);
    clearOptimizationSummary(editedDayId);
    setItinerary(prev => {
      const n = { ...prev };
      const dayId = editedDayId;
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
             } else if (routeDurations[dayId]?.[i - 1]) {
                travelTime = getRouteDurationMinutes(routeDurations[dayId][i - 1]);
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
  }, [clearOptimizationSummary, editingItemData, routeDurations]);

  const handleCopyItem = (targetDay, item) => {
    clearOptimizationSummary(targetDay);
    setItinerary(prev => {
      const dayList = [...(prev[String(targetDay)] || [])];
      const newItem = { ...item, id: generateId(), time: "" };
      dayList.push(newItem);
      return { ...prev, [String(targetDay)]: dayList };
    });
    setCopyingItem(null);
    alert(`✅ 已將「${item.customName || item.name}」複製到 ${targetDay}！`);
  };

  const handleDeleteTicket = useCallback(async (ticket) => {
    if (!window.confirm(`確定刪除「${String(ticket?.title || '此票券')}」？`)) return;

    if (ticket?.storagePath && storage) {
      try {
        await deleteObject(storageRef(storage, String(ticket.storagePath)));
      } catch (error) {
        const isMissing = error?.code === 'storage/object-not-found';
        if (!isMissing) {
          console.warn('Delete ticket file failed:', error);
          const removeRecordOnly = window.confirm('附件檔案刪除失敗。仍要只刪除票券紀錄嗎？');
          if (!removeRecordOnly) return;
        }
      }
    }

    setTickets((previousTickets) => previousTickets.filter((item) => item.id !== ticket?.id));
  }, [setTickets]);

  const commitChecklistPatch = useCallback((patch) => {
    if (!db || !roomId || !patch || Object.keys(patch).length === 0) return;

    const version = checklistWriteVersionRef.current + 1;
    checklistWriteVersionRef.current = version;
    setSyncStatus('saving');

    void update(dbRef(db, `rooms/${roomId}/checklist`), patch)
      .then(() => {
        if (checklistWriteVersionRef.current === version) setSyncStatus('saved');
      })
      .catch((error) => {
        console.error('Sync checklist failed:', error);
        if (checklistWriteVersionRef.current === version) setSyncStatus('error');
        alert('行前清單同步失敗，請檢查網路或 Firebase 權限。');
      });
  }, [roomId]);

  const handleChecklistActorChange = useCallback((member) => {
    const safeMember = String(member || '').trim();
    if (!safeMember) return;
    setChecklistActorState(safeMember);
    try {
      localStorage.setItem(`travel-checklist-actor-${roomId}`, safeMember);
    } catch {
      // localStorage 不可用時仍可正常使用清單
    }
  }, [roomId]);

  const handleCreateChecklistItem = useCallback((draft) => {
    const now = Date.now();
    const item = {
      id: generateId(),
      text: String(draft?.text || '').trim().slice(0, 200),
      scope: draft?.scope === 'personal' ? 'personal' : 'shared',
      owner: String(draft?.owner || ''),
      assignee: String(draft?.assignee || '所有人'),
      category: String(draft?.category || 'todo'),
      important: Boolean(draft?.important),
      completed: false,
      completedAt: null,
      completedBy: '',
      createdAt: now,
      updatedAt: now,
    };
    if (!item.text) return;

    setChecklistItemsState(previousItems => [...previousItems, item]);
    commitChecklistPatch({ [item.id]: item });
  }, [commitChecklistPatch]);

  const handleUpdateChecklistItem = useCallback((nextItem) => {
    if (!nextItem?.id) return;
    const item = {
      ...nextItem,
      id: String(nextItem.id),
      text: String(nextItem.text || '').trim().slice(0, 200),
      updatedAt: Date.now(),
    };
    if (!item.text) return;

    setChecklistItemsState(previousItems => {
      const exists = previousItems.some(candidate => candidate.id === item.id);
      return exists
        ? previousItems.map(candidate => candidate.id === item.id ? item : candidate)
        : [...previousItems, item];
    });
    commitChecklistPatch({ [item.id]: item });
  }, [commitChecklistPatch]);

  const handleDeleteChecklistItem = useCallback((itemId) => {
    const safeId = String(itemId || '');
    if (!safeId) return;
    setChecklistItemsState(previousItems => previousItems.filter(item => item.id !== safeId));
    commitChecklistPatch({ [safeId]: null });
  }, [commitChecklistPatch]);

  const handleBulkCreateChecklistItems = useCallback((drafts) => {
    const safeDrafts = Array.isArray(drafts) ? drafts : [];
    const now = Date.now();
    const newItems = safeDrafts
      .map((draft, index) => ({
        id: generateId(),
        text: String(draft?.text || '').trim().slice(0, 200),
        scope: draft?.scope === 'personal' ? 'personal' : 'shared',
        owner: String(draft?.owner || ''),
        assignee: String(draft?.assignee || '所有人'),
        category: String(draft?.category || 'todo'),
        important: Boolean(draft?.important),
        completed: false,
        completedAt: null,
        completedBy: '',
        createdAt: now + index,
        updatedAt: now + index,
      }))
      .filter(item => item.text);

    if (newItems.length === 0) return;
    setChecklistItemsState(previousItems => [...previousItems, ...newItems]);
    commitChecklistPatch(Object.fromEntries(newItems.map(item => [item.id, item])));
  }, [commitChecklistPatch]);

  const handleClearCompletedChecklistItems = useCallback((scope, owner) => {
    const idsToDelete = checklistItems
      .filter(item => item.completed)
      .filter(item => scope === 'shared'
        ? item.scope === 'shared'
        : item.scope === 'personal' && String(item.owner || '') === String(owner || ''))
      .map(item => item.id);

    if (idsToDelete.length === 0) return;
    const idSet = new Set(idsToDelete);
    setChecklistItemsState(previousItems => previousItems.filter(item => !idSet.has(item.id)));
    commitChecklistPatch(Object.fromEntries(idsToDelete.map(itemId => [itemId, null])));
  }, [checklistItems, commitChecklistPatch]);

  const handleShareLink = useCallback(async () => {
    if (!db) {
      alert("⚠️ 尚未設定 Firebase！");
      return;
    }

    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    try {
      await navigator.clipboard.writeText(url);
      alert(`🔗 已複製 ${meta?.title || "旅程"} 的共編連結！`);
    } catch {
      window.prompt("請手動複製共編連結：", url);
    }
  }, [meta?.title, roomId]);

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

  const handleOptimizeRoute = async (dayId) => {
    const items = Array.isArray(itinerary[dayId]) ? itinerary[dayId] : [];

    if (items.length < 4) {
      alert("目前最佳化會固定第一站與最後一站，因此至少需要 4 個景點，才有 2 個以上的中間景點可以重新排序。");
      return;
    }
    if (items.length > 25) {
      alert("單日景點超過 25 個，已超出目前路線引擎適合一次分析的範圍。建議先拆成上午與下午兩段。");
      return;
    }
    if (!items.every((item) => isValidCoordinates(item?.lat, item?.lng))) {
      alert("部分景點缺少有效座標，請先重新選擇地點後再進行智慧排路線。");
      return;
    }
    if (!items[0]?.time) {
      alert("請先設定第一站的抵達時間，系統才能在重新排序後正確重算整天的時間表。");
      return;
    }

    const manualTransportIndex = items.slice(0, -1).findIndex((item) => (
      item?.nextLeg?.mode && item.nextLeg.mode !== 'AUTO'
    ));
    if (manualTransportIndex !== -1) {
      const itemName = items[manualTransportIndex]?.customName || items[manualTransportIndex]?.name || `第 ${manualTransportIndex + 1} 站`;
      alert(`「${itemName}」之後使用了自訂交通方式。為避免把飛機、鐵路或步行路段打亂，目前智慧排路線只支援整天皆為自動車程的行程。`);
      return;
    }
    if (!routesLib) {
      alert("地圖引擎載入中，請稍候...");
      return;
    }

    setIsOptimizing(true);
    setOptimizationPreview(null);
    const service = new routesLib.DirectionsService();
    const origin = { lat: Number(items[0].lat), lng: Number(items[0].lng) };
    const destination = {
      lat: Number(items[items.length - 1].lat),
      lng: Number(items[items.length - 1].lng),
    };
    const waypoints = items.slice(1, -1).map((item) => ({
      location: { lat: Number(item.lat), lng: Number(item.lng) },
      stopover: true,
    }));

    const requestBase = {
      origin,
      destination,
      waypoints,
      travelMode: window.google.maps.TravelMode.DRIVING,
    };

    try {
      const [currentResponse, optimizedResponse] = await Promise.all([
        service.route({ ...requestBase, optimizeWaypoints: false }),
        service.route({ ...requestBase, optimizeWaypoints: true }),
      ]);

      const currentRoute = currentResponse.routes?.[0];
      const optimizedRoute = optimizedResponse.routes?.[0];
      if (!currentRoute?.legs?.length || !optimizedRoute?.legs?.length) {
        console.warn("Google Maps did not return a usable route for optimization.");
        alert("找不到可用的路線，請確認所有景點都能以汽車抵達。");
        return;
      }

      const returnedOrder = Array.isArray(optimizedRoute.waypoint_order)
        ? optimizedRoute.waypoint_order
        : [];
      const order = returnedOrder.length === waypoints.length
        ? returnedOrder
        : waypoints.map((_, index) => index);
      const originalItems = cloneRouteItems(items);
      const middleItems = order.map((index) => originalItems[index + 1]);
      const optimizedItems = [
        originalItems[0],
        ...middleItems,
        originalItems[originalItems.length - 1],
      ].map((item) => ({ ...item, nextLeg: item.nextLeg ? { ...item.nextLeg } : undefined }));

      let currentMinutes = timeToMins(optimizedItems[0].time)
        + Math.max(0, Number(optimizedItems[0].stayTime || 0));

      for (let index = 1; index < optimizedItems.length; index += 1) {
        const leg = optimizedRoute.legs[index - 1];
        const travelTime = Math.max(1, Math.round(Number(leg?.duration?.value || 0) / 60));
        currentMinutes += travelTime;
        optimizedItems[index] = {
          ...optimizedItems[index],
          time: minsToTime(currentMinutes),
        };
        currentMinutes += Math.max(0, Number(optimizedItems[index].stayTime || 0));
        optimizedItems[index - 1] = {
          ...optimizedItems[index - 1],
          nextLeg: { mode: "AUTO", mins: travelTime },
        };
      }

      const before = getRouteTotals(currentRoute);
      const after = getRouteTotals(optimizedRoute);
      const savedMinutes = Math.max(0, before.minutes - after.minutes);
      const savedMeters = before.meters - after.meters;
      const savedPercent = before.minutes > 0 ? (savedMinutes / before.minutes) * 100 : 0;
      const movedCount = optimizedItems.reduce((count, item, index) => (
        originalItems[index]?.id === item.id ? count : count + 1
      ), 0);
      const warnings = [];

      const reservationCount = originalItems.filter((item) => (
        Array.isArray(item.tags) && item.tags.includes('需預約')
      )).length;
      if (reservationCount > 0) {
        warnings.push(`行程中有 ${reservationCount} 個「需預約」景點。系統目前不會判斷訂位或入場時段，套用前請確認新抵達時間仍可行。`);
      }
      if (currentMinutes >= 24 * 60) {
        warnings.push('依目前停留時間與車程估算，行程可能跨日，建議刪減景點或縮短停留時間。');
      }
      if (savedMinutes < 5) {
        warnings.push('預估節省不到 5 分鐘，實際路況變動可能大於這個差距。');
      }

      const assessment = getOptimizationAssessment({ savedMinutes, savedMeters, savedPercent, movedCount });
      setOptimizationPreview({
        dayId,
        dayTitle: getDayDisplay(dayId, meta.startDate).title,
        originalItems,
        optimizedItems,
        before,
        after,
        savedMinutes,
        savedMeters,
        savedPercent,
        movedCount,
        assessment,
        warnings,
      });
    } catch (error) {
      console.error("Optimize route failed:", error);
      alert("智慧排路線失敗。請確認所有景點皆可透過車輛到達，或稍後再試。");
    } finally {
      setIsOptimizing(false);
    }
  };

  const applyOptimizationPreview = () => {
    if (!optimizationPreview) return;
    const {
      dayId,
      originalItems,
      optimizedItems,
      savedMinutes,
      savedMeters,
      savedPercent,
      movedCount,
    } = optimizationPreview;

    if (movedCount <= 0 || (savedMinutes <= 0 && savedMeters <= 300)) {
      setOptimizationPreview(null);
      return;
    }

    setBackupItin({ dayId, items: cloneRouteItems(originalItems) });
    setItinerary((previousItinerary) => ({
      ...previousItinerary,
      [dayId]: cloneRouteItems(optimizedItems),
    }));
    setOptimizationSummaries((previous) => ({
      ...previous,
      [dayId]: {
        savedMinutes,
        savedMeters,
        savedPercent,
        movedCount,
      },
    }));
    setCurrentDay(dayId);
    setOptimizationPreview(null);
  };

  const handleUndoOptimize = (dayId) => {
    if (!backupItin || backupItin.dayId !== dayId) return;
    setItinerary((previous) => ({ ...previous, [dayId]: cloneRouteItems(backupItin.items) }));
    clearOptimizationSummary(dayId);
    setBackupItin(null);
  };

  const handleExportDayImage = async (dayId) => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const targetElement = document.getElementById(`day-card-${dayId}`);
      if (!targetElement) {
        alert("找不到行程區塊，請確認畫面是否已完全載入！");
        return;
      }

      const capture = html2canvas.default || html2canvas;
      const canvas = await capture(targetElement, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: tripThemeColor,
        onclone: (clonedDoc, clonedElement) => {
          clonedElement.querySelectorAll('.export-hide').forEach(el => {
            el.style.display = 'none';
          });
          clonedElement.style.maxHeight = 'none';
          clonedElement.style.height = 'auto';
          clonedElement.style.overflow = 'visible';
          const scrollArea = clonedElement.querySelector('.overflow-y-auto');
          if (scrollArea) {
             scrollArea.style.maxHeight = 'none';
             scrollArea.style.height = 'auto';
             scrollArea.style.overflow = 'visible';
          }
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.download = `${meta?.title || '旅程'}_${dayId}_行程表.jpg`;
      link.href = imgData;
      link.click();

    } catch (err) {
      console.error("📸 截圖引擎詳細錯誤:", err);
      alert(`匯出圖片失敗！\n錯誤原因: ${err.message || '未知錯誤'}`);
    } finally {
      setIsExporting(false);
    }
  };


  const escapeExportHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const formatExportDate = (dateValue) => {
    const date = parseDateOnlyLocal(dateValue);
    if (!date) return String(dateValue || "");
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  };

  const buildFullItineraryHtml = (options) => {
    const includeNotes = Boolean(options?.includeNotes);
    const includeAddresses = Boolean(options?.includeAddresses);
    const includeWeather = Boolean(options?.includeWeather);
    const compact = options?.layout === "compact";
    const orderedDays = sortDayIds(existingDays);
    const totalStops = orderedDays.reduce((sum, dayId) => sum + (Array.isArray(itinerary[dayId]) ? itinerary[dayId].length : 0), 0);
    const createdAt = new Intl.DateTimeFormat("zh-TW", {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).format(new Date());

    const daySections = orderedDays.map((dayId, dayIndex) => {
      const dayItems = Array.isArray(itinerary[dayId]) ? itinerary[dayId] : [];
      const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
      const dayTheme = meta.dayThemes?.[dayId] || "";
      const weather = weatherInfo[dayId];
      const itemRows = dayItems.length > 0
        ? dayItems.map((item, itemIndex) => {
          const name = escapeExportHtml(item.customName || item.name || "未命名景點");
          const originalName = item.customName ? `<span class="original-name">${escapeExportHtml(item.name)}</span>` : "";
          const tags = (Array.isArray(item.tags) ? item.tags : [])
            .map((tag) => `<span class="tag">${escapeExportHtml(tag)}</span>`).join("");
          const stay = item.stayTime !== undefined ? formatStayTime(item.stayTime) : "";
          const nextLeg = item.nextLeg?.mins
            ? `<span class="leg">下一站約 ${Math.max(0, Number(item.nextLeg.mins) || 0)} 分鐘</span>`
            : "";
          const address = includeAddresses && item.address
            ? `<div class="detail-line">📍 ${escapeExportHtml(item.address)}</div>` : "";
          const memo = includeNotes && item.memo
            ? `<div class="memo">${escapeExportHtml(item.memo).replaceAll("\n", "<br>")}</div>` : "";
          return `
            <article class="stop ${compact ? "compact" : ""}">
              <div class="stop-index">${itemIndex + 1}</div>
              <div class="stop-time">${escapeExportHtml(item.time || "--:--")}</div>
              <div class="stop-main">
                <div class="stop-heading"><strong>${name}</strong>${originalName}</div>
                <div class="stop-meta">${stay ? `<span>⏱ ${escapeExportHtml(stay)}</span>` : ""}${nextLeg}${tags}</div>
                ${address}${memo}
              </div>
            </article>`;
        }).join("")
        : `<div class="empty-day">這一天尚未安排景點</div>`;

      return `
        <section class="day-section ${dayIndex > 0 ? "page-break" : ""}">
          <header class="day-header">
            <div>
              <div class="day-kicker">DAY ${dayIndex + 1}</div>
              <h2>${escapeExportHtml(title)}${dayTheme ? ` · ${escapeExportHtml(dayTheme)}` : ""}</h2>
              <p>${escapeExportHtml(dateStr)}</p>
            </div>
            ${includeWeather && weather ? `<div class="weather">🌡 ${escapeExportHtml(weather.temp)}<br>🌧 ${escapeExportHtml(weather.rain)}%</div>` : ""}
          </header>
          <div class="timeline">${itemRows}</div>
        </section>`;
    }).join("");

    return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeExportHtml(meta.title || "旅程")}－完整行程</title>
<style>
  :root { --accent: ${escapeExportHtml(tripThemeColor)}; --ink:#172033; --muted:#64748b; --line:#dbe3ef; --paper:#ffffff; --soft:#f6f8fc; }
  * { box-sizing:border-box; }
  body { margin:0; color:var(--ink); background:#e8edf5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif; }
  .document { width:min(900px, calc(100% - 24px)); margin:24px auto; background:var(--paper); box-shadow:0 18px 60px rgba(15,23,42,.16); }
  .cover { min-height:440px; padding:54px; position:relative; overflow:hidden; color:white; background:linear-gradient(135deg, var(--accent), #2563eb 62%, #14b8a6); }
  .cover:after { content:""; position:absolute; width:360px; height:360px; border-radius:50%; right:-110px; top:-120px; background:rgba(255,255,255,.13); }
  .cover-label { font-size:13px; font-weight:800; letter-spacing:.2em; opacity:.82; }
  .cover h1 { font-size:42px; line-height:1.15; margin:54px 0 12px; max-width:650px; }
  .destination { font-size:21px; font-weight:700; margin:0 0 34px; opacity:.94; }
  .cover-meta { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; max-width:630px; }
  .cover-card { border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.13); border-radius:18px; padding:16px 18px; backdrop-filter:blur(8px); }
  .cover-card small { display:block; opacity:.75; margin-bottom:5px; }
  .cover-card strong { font-size:15px; }
  .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:28px 42px; border-bottom:1px solid var(--line); background:var(--soft); }
  .summary div { background:white; border:1px solid var(--line); border-radius:16px; padding:15px; text-align:center; }
  .summary strong { display:block; font-size:23px; color:var(--accent); }
  .summary span { font-size:12px; color:var(--muted); }
  .day-section { padding:38px 42px 44px; }
  .day-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding-bottom:18px; margin-bottom:20px; border-bottom:3px solid var(--accent); }
  .day-kicker { color:var(--accent); font-size:11px; letter-spacing:.18em; font-weight:900; }
  .day-header h2 { font-size:25px; margin:4px 0 5px; }
  .day-header p { margin:0; color:var(--muted); font-size:13px; }
  .weather { text-align:right; padding:9px 12px; border-radius:14px; background:var(--soft); color:#334155; font-size:12px; line-height:1.7; white-space:nowrap; }
  .timeline { position:relative; }
  .timeline:before { content:""; position:absolute; left:17px; top:19px; bottom:19px; width:2px; background:var(--line); }
  .stop { position:relative; display:grid; grid-template-columns:36px 60px 1fr; gap:12px; margin:0 0 13px; break-inside:avoid; page-break-inside:avoid; }
  .stop-index { z-index:1; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:var(--accent); color:white; font-size:12px; font-weight:900; box-shadow:0 4px 12px rgba(15,23,42,.15); }
  .stop-time { padding-top:8px; color:var(--accent); font-weight:900; font-size:12px; }
  .stop-main { border:1px solid var(--line); border-radius:16px; padding:14px 16px; background:white; }
  .stop.compact .stop-main { padding:10px 13px; }
  .stop-heading { font-size:15px; line-height:1.4; }
  .original-name { display:block; color:var(--muted); font-size:10px; font-weight:500; margin-top:2px; }
  .stop-meta { display:flex; flex-wrap:wrap; gap:7px; margin-top:7px; color:var(--muted); font-size:10px; }
  .tag, .leg { border-radius:999px; padding:3px 7px; background:var(--soft); border:1px solid var(--line); }
  .detail-line { margin-top:9px; color:#475569; font-size:10px; }
  .memo { margin-top:10px; padding:9px 11px; border-left:3px solid var(--accent); background:var(--soft); border-radius:0 9px 9px 0; color:#334155; font-size:11px; line-height:1.55; }
  .empty-day { padding:26px; text-align:center; border:1px dashed var(--line); border-radius:16px; color:var(--muted); }
  .footer-note { padding:20px 42px 34px; color:var(--muted); font-size:10px; text-align:center; border-top:1px solid var(--line); }
  .no-print { padding:12px; text-align:center; background:#0f172a; color:white; position:sticky; top:0; z-index:2; }
  .no-print button { border:0; background:#2563eb; color:white; padding:9px 18px; border-radius:10px; font-weight:800; cursor:pointer; }
  @media print {
    @page { size:A4; margin:12mm; }
    body { background:white; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .document { width:100%; margin:0; box-shadow:none; }
    .no-print { display:none !important; }
    .cover { min-height:250mm; page-break-after:always; }
    .page-break { page-break-before:always; break-before:page; }
    .day-section { padding:4mm 2mm; }
    .summary { padding:8mm 2mm; }
  }
  @media (max-width:600px) {
    .cover { padding:34px 26px; min-height:410px; }
    .cover h1 { font-size:32px; margin-top:40px; }
    .cover-meta { grid-template-columns:1fr; }
    .summary { padding:20px; gap:8px; }
    .day-section { padding:28px 20px; }
    .stop { grid-template-columns:34px 49px 1fr; gap:8px; }
  }
</style>
</head>
<body>
  <div class="no-print">預覽完整行程　<button onclick="window.print()">列印／另存 PDF</button></div>
  <main class="document">
    <section class="cover">
      <div class="cover-label">SMART TRAVEL ITINERARY</div>
      <h1>${escapeExportHtml(meta.title || "未命名旅程")}</h1>
      <p class="destination">📍 ${escapeExportHtml(meta.destination || "未設定目的地")}</p>
      <div class="cover-meta">
        <div class="cover-card"><small>旅行日期</small><strong>${escapeExportHtml(formatExportDate(meta.startDate))}－${escapeExportHtml(formatExportDate(meta.endDate))}</strong></div>
        <div class="cover-card"><small>同行成員</small><strong>${escapeExportHtml(membersList.join("、") || "自己")}</strong></div>
        <div class="cover-card"><small>主要交通</small><strong>${escapeExportHtml(meta.transport || "未設定")}</strong></div>
        <div class="cover-card"><small>文件產生時間</small><strong>${escapeExportHtml(createdAt)}</strong></div>
      </div>
    </section>
    <section class="summary">
      <div><strong>${orderedDays.length}</strong><span>行程天數</span></div>
      <div><strong>${totalStops}</strong><span>安排景點</span></div>
      <div><strong>${sharedChecklistStats.completed}/${sharedChecklistStats.total}</strong><span>行前清單</span></div>
    </section>
    ${daySections}
    <footer class="footer-note">由 ${escapeExportHtml(meta.title || "智能旅行 App")} 匯出 · 為避免隱私外洩，本文件不包含記帳明細與票券附件。</footer>
  </main>
</body>
</html>`;
  };

  const handleExportFullItinerary = (options) => {
    const previewWindow = window.open("", "_blank");
    if (!previewWindow) {
      alert("瀏覽器阻擋了匯出視窗，請允許此網站開啟彈出式視窗後再試一次。");
      return;
    }
    try {
      previewWindow.opener = null;
      previewWindow.document.open();
      previewWindow.document.write(buildFullItineraryHtml(options));
      previewWindow.document.close();
      setShowExportModal(false);
      previewWindow.focus();
    } catch (error) {
      previewWindow.close();
      console.error("完整行程匯出失敗：", error);
      alert("完整行程預覽建立失敗，請稍後再試。");
    }
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

  const handleAddExploreToItinerary = (place, position = 'end') => {
    setBackupItin(null);
    clearOptimizationSummary(safeCurrentDay);
    setItinerary(prev => {
      const dayList = [...(Array.isArray(prev[safeCurrentDay]) ? prev[safeCurrentDay] : [])];
      const newItem = {
        id: generateId(), name: String(place.name || "未命名地點"), place_id: String(place.place_id || ""), customName: "", lat: Number(place.geometry.location.lat()), lng: Number(place.geometry.location.lng()),
        address: String(place.formatted_address || place.vicinity || ""), time: getNextDefaultTimeFromList(dayList), stayTime: "0", memo: `⭐ Google 評價: ${place.rating || '無'}`, tags: ["地圖探索"], nextLeg: { mode: 'AUTO', mins: 30 }
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

  const handleAddPlaceFromSearch = useCallback((dayId, result, placeId) => {
    if (!result?.geometry?.location) return;
    setBackupItin(null);
    clearOptimizationSummary(dayId);
    setItinerary((previousItinerary) => {
      const dayItems = [...(Array.isArray(previousItinerary[dayId]) ? previousItinerary[dayId] : [])];
      dayItems.push({
        id: generateId(),
        name: String(result.name || "未命名地點"),
        place_id: String(placeId || ""),
        customName: "",
        lat: Number(result.geometry.location.lat()),
        lng: Number(result.geometry.location.lng()),
        address: String(result.formatted_address || ""),
        time: getNextDefaultTimeFromList(dayItems),
        stayTime: "0",
        memo: "",
        tags: [],
        nextLeg: { mode: "AUTO", mins: 30 },
      });
      return { ...previousItinerary, [dayId]: dayItems };
    });
  }, [clearOptimizationSummary, setItinerary]);

  if (loadError) {
    return (
      <div style={{ backgroundColor: tripThemeColor }} className={`fixed inset-0 flex items-center justify-center p-6 ${t.mainText}`}>
        <div className={`w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl ${t.modalBg} ${t.cardBorder}`}>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-black mb-3">無法開啟旅程</h2>
          <p className={`text-sm leading-6 mb-6 ${t.subText}`}>{loadError}</p>
          <button onClick={onBack} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-bold">
            返回旅程大廳
          </button>
        </div>
      </div>
    );
  }

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
                    {db ? (
                      <span
                        title={syncStatus === "saving" ? "同步中" : syncStatus === "error" ? "同步失敗" : "已同步"}
                        className={`inline-flex h-2.5 w-2.5 rounded-full ${
                          syncStatus === "saving"
                            ? "bg-amber-400 animate-pulse"
                            : syncStatus === "error"
                              ? "bg-red-500"
                              : "bg-emerald-500"
                        }`}
                      />
                    ) : null}
                  </div>
                  <p className={`text-[10px] font-bold ${t.subText}`}>📍 {String(meta.destination)} | 🚗 {String(meta.transport)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`hidden md:flex p-1 rounded-lg border shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setActiveTab('plan')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${(activeTab === 'plan' || activeTab === 'map') ? 'bg-blue-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>📋 行程</button>
                    <button onClick={() => setActiveTab('expense')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'expense' ? 'bg-emerald-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>💰 記帳</button>
                    <button onClick={() => setActiveTab('ticket')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'ticket' ? 'bg-amber-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>🎟️ 票券</button>
                  </div>
                  <button
                    onClick={() => setShowExportModal(true)}
                    className={`px-3 py-2 rounded-lg text-[10px] font-bold border shadow-sm transition-all active:scale-95 hover:border-purple-500 whitespace-nowrap ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
                    title="匯出完整行程或單日圖片"
                  >
                    🖨️ <span className="ml-1">匯出</span>
                  </button>
                  <button
                    onClick={() => setShowChecklistModal(true)}
                    className={`relative px-3 py-2 rounded-lg text-[10px] font-bold border shadow-sm transition-all active:scale-95 hover:border-blue-500 whitespace-nowrap ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
                    title={`共享清單：${sharedChecklistStats.completed}/${sharedChecklistStats.total} 已完成`}
                  >
                    <span>✅</span>
                    <span className="ml-1">清單</span>
                    {sharedChecklistStats.total > 0 ? (
                      <span className={`ml-1 px-1.5 py-0.5 rounded-md font-mono ${sharedChecklistStats.open === 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-blue-500/15 text-blue-500'}`}>
                        {sharedChecklistStats.completed}/{sharedChecklistStats.total}
                      </span>
                    ) : null}
                  </button>
                  <button onClick={handleShareLink} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-[10px] font-bold transition-transform active:scale-95 shadow-md">
                    🔗 共編
                  </button>
                </div>
              </div>

              <div onWheel={(e) => { if (e.deltaY !== 0) e.currentTarget.scrollBy(Number(e.deltaY), 0); }} className={`flex-1 overflow-x-auto p-4 gap-4 items-start ${(activeTab === 'plan' || activeTab === 'map') ? 'flex' : 'hidden'}`}>
                {existingDays.map(dayId => {
                  const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
                  const isCurrent = safeCurrentDay === dayId;
                  const dayTheme = meta.dayThemes?.[dayId] || "";

                  return (
                    <div key={String(dayId)} id={`day-card-${dayId}`} onClick={() => setCurrentDay(dayId)} className={`min-w-85 md:min-w-85 flex flex-col max-h-full rounded-3xl p-4 border-2 transition-all backdrop-blur-md ${isCurrent ? `border-blue-500 ${t.cardBg} shadow-lg` : `${t.cardBorder} hover:border-blue-300/50 ${t.expenseBlockBg}`}`}>
                      <div className="flex flex-col gap-1 mb-3 group">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2 cursor-pointer" onClick={() => handleDayThemeUpdate(dayId)}>
                             <h2 className={`text-lg font-black truncate ${t.mainText}`}>
                               {String(title)}
                               {dayTheme ? <span className="text-blue-500 ml-2">- {dayTheme}</span> : <span className={`export-hide text-[10px] font-normal opacity-40 ml-2 border border-dashed rounded px-1.5 py-0.5 border-current transition-opacity group-hover:opacity-100 ${t.mainText}`}>＋ 新增主題</span>}
                             </h2>
                             <span className="export-hide text-xs opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                          </div>

                          <div className="flex gap-2 items-center">
                             {backupItin && backupItin.dayId === dayId && (
                               <button
                                  onClick={() => handleUndoOptimize(dayId)}
                                  className={`export-hide text-[10px] font-bold px-2 py-1.5 rounded-lg border shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0 hover:bg-red-500 hover:text-white hover:border-red-500 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
                               >
                                  ↩️ 復原
                               </button>
                             )}
                             <button
                                onClick={() => handleOptimizeRoute(dayId)}
                                disabled={isOptimizing}
                                className={`export-hide text-[10px] font-bold px-2 py-1.5 rounded-lg border shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0 ${isOptimizing ? 'opacity-50 cursor-not-allowed' : `hover:bg-blue-500 hover:text-white hover:border-blue-500`} ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
                             >
                                {isOptimizing ? '🔄 分析中...' : '🧭 智慧排路線'}
                             </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {dateStr ? <span className={`text-[10px] font-bold ${t.subText}`}>{String(dateStr)}</span> : null}
                          {weatherInfo[dayId] && (
                            <span className="text-[10px] font-semibold opacity-90 bg-black/5 dark:bg-white/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                              🌡️ {weatherInfo[dayId].temp} | 🌧️ {weatherInfo[dayId].rain}%
                            </span>
                          )}
                          {optimizationSummaries[dayId] ? (
                            <span
                              title={`重新排列 ${optimizationSummaries[dayId].movedCount} 站，距離${optimizationSummaries[dayId].savedMeters >= 0 ? '減少' : '增加'} ${formatRouteDistance(Math.abs(optimizationSummaries[dayId].savedMeters))}`}
                              className="export-hide text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                            >
                              ✅ {optimizationSummaries[dayId].savedMinutes > 0 ? `預估省 ${formatRouteMinutes(optimizationSummaries[dayId].savedMinutes)}` : `距離少 ${formatRouteDistance(optimizationSummaries[dayId].savedMeters)}`}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="export-hide">
                         <SearchBox dayId={dayId} onAddPlace={handleAddPlaceFromSearch} t={t} />
                      </div>

                      <Droppable droppableId={String(dayId)}>
                        {(provided) => (
                          <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto min-h-37.5 pb-6 scrollbar-hide">
                            {(/** @type {any[]} */ (Array.isArray(itinerary[dayId]) ? itinerary[dayId] : [])).map((item, index) => {
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
                                           <span className="export-hide text-slate-400 mt-2 text-[10px]">≡</span>
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
                                                className={`export-hide shrink-0 px-2 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition-transform hover:scale-105 shadow-sm font-bold text-[10px] ${snap.isDragging ? 'bg-white/20 border-white/40 text-white' : 'bg-amber-100 border-amber-300 text-amber-700'}`}
                                                title="點擊查看筆記內容"
                                              >
                                                <span>📝</span> 附筆記
                                              </button>
                                            ) : null}
                                          </div>
                                          {item.stayTime !== undefined ? <p className={`text-[10px] mt-0.5 font-bold ${item.stayTime === "0" || item.stayTime === 0 ? 'text-blue-500' : t.subText}`}>{formatStayTime(item.stayTime)}</p> : null}
                                          <div className="flex flex-wrap gap-1.5 mt-2">
                                            {(Array.isArray(item.tags) ? item.tags : []).map((tag, idx) => <span key={`tag-${idx}`} className={`text-[9px] px-2 py-0.5 rounded-md border ${snap.isDragging ? 'bg-white/10 border-white/20 text-white' : 'bg-blue-500/10 border-blue-500/20 text-blue-600'}`}>{String(tag)}</span>)}
                                          </div>
                                        </div>
                                      </div>

                                      <div className={`export-hide mt-3 pt-3 border-t flex items-center gap-4 transition-all duration-300 ${snap.isDragging ? 'border-white/20' : t.cardBorder} flex md:max-h-0 md:opacity-0 md:group-hover:max-h-14 md:group-hover:opacity-100 max-h-14 opacity-100`}>
                                        <button onClick={() => setEditingItemData({ dayId, item })} className={`flex items-center gap-1 text-[11px] font-bold hover:text-blue-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>✏️ 編輯</button>
                                        <button onClick={() => openExternalUrl(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.lat},${item.lng}`)}`)} className={`flex items-center gap-1 text-[11px] font-bold hover:text-emerald-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>🧭 導航</button>
                                        <button onClick={() => handleSearchNearby(item)} className={`flex items-center gap-1 text-[11px] font-bold hover:text-orange-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>🔍 周邊</button>
                                        <button onClick={() => setCopyingItem(item)} className={`flex items-center gap-1 text-[11px] font-bold hover:text-purple-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>📋 複製</button>
                                        <div className="flex-1"></div>
                                        <button onClick={() => { if (window.confirm('確定刪除此景點？')) { setBackupItin(null); clearOptimizationSummary(dayId); setItinerary(prev => ({...prev, [dayId]: prev[dayId].filter(p => p.id !== item.id)})); } }} className={`text-[11px] hover:text-red-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>刪除</button>
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
                <div className={`p-6 border-b shrink-0 shadow-sm ${t.headerBg} ${t.cardBorder}`}>

                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className={`text-xs font-bold uppercase tracking-widest ${t.subText}`}>全團花費總計</p>
                      <h2 className={`text-3xl font-black mt-1 ${t.mainText}`}>NT$ {expenseStats.totalExpense.toLocaleString()}</h2>
                    </div>
                    <button onClick={openNewExpense} className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all">
                      ➕ 新增記帳
                    </button>
                  </div>

                  <div className="mt-6 space-y-3">
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${t.subText}`}>個人預算與消費額度</p>
                    {membersList.map(m => {
                      const pBudget = meta.memberBudgets?.[m] ?? 10000;
                      const pSpent = expenseStats.personalSpent[m] || 0;
                      const pOver = pSpent > pBudget;
                      const pPercent = pBudget > 0 ? Math.min((pSpent / pBudget) * 100, 100) : 100;
                      return (
                        <div key={`budget-${m}`} className={`p-3 rounded-xl border bg-black/5 dark:bg-white/5 ${t.cardBorder}`}>
                           <div className="flex justify-between items-center mb-2">
                              <span className={`text-xs font-bold ${t.mainText}`}>{String(m)}</span>
                              <div className="flex items-center gap-2">
                                 <span className={`text-[10px] font-bold ${pOver ? 'text-red-500' : 'text-emerald-500'}`}>已花 NT${Math.round(pSpent).toLocaleString()}</span>
                                 <span className={`text-[10px] opacity-40 ${t.mainText}`}>/</span>
                                 <input type="number" value={String(pBudget)} onChange={e => handleBudgetChange(m, e.target.value)} className={`bg-transparent outline-none w-14 text-right text-[10px] font-bold border-b border-dashed focus:border-blue-500 ${t.mainText}`} title="點擊修改預算" />
                              </div>
                           </div>
                           <div className={`flex w-full h-1.5 rounded-full overflow-hidden border ${t.cardBg} ${t.cardBorder}`}>
                              <div style={{ width: `${pPercent}%` }} className={`h-full transition-all duration-500 ${pOver ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                           </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className={`flex p-1.5 rounded-xl border mt-6 shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setExpenseView('list')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${expenseView === 'list' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}>📜 歷史明細</button>
                    <button onClick={() => setExpenseView('settle')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${expenseView === 'settle' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}>⚖️ 結算表</button>
                    <button onClick={() => setExpenseView('chart')} className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${expenseView === 'chart' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}>📊 圓餅圖</button>
                  </div>
                </div>

                <div className="p-4 pb-24">
                  {expenseView === 'chart' ? (
                    <div className="space-y-6 animate-in fade-in">
                      <div className={`rounded-2xl border p-2 ${t.cardBg} ${t.cardBorder}`}>
                        <p className={`px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest ${t.subText}`}>
                          選擇統計對象
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          <button
                            onClick={() => setExpenseChartOwner('ALL')}
                            className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                              safeExpenseChartOwner === 'ALL'
                                ? 'bg-slate-600 border-slate-600 text-white shadow-md'
                                : `${t.itemBg} ${t.cardBorder} ${t.mainText} hover:border-slate-400`
                            }`}
                          >
                            👥 全團
                          </button>
                          {membersList.map(member => (
                            <button
                              key={`chart-owner-${member}`}
                              onClick={() => setExpenseChartOwner(String(member))}
                              className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                                safeExpenseChartOwner === String(member)
                                  ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                                  : `${t.itemBg} ${t.cardBorder} ${t.mainText} hover:border-blue-400`
                              }`}
                            >
                              👤 {String(member)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <ExpensePieCard
                        title={activeExpenseChart.title}
                        subtitle={activeExpenseChart.subtitle}
                        total={activeExpenseChart.total}
                        stats={activeExpenseChart.categories}
                        t={t}
                      />

                      <p className={`text-[10px] leading-relaxed px-2 ${t.subText}`}>
                        個人圓餅圖依「分帳金額」計算，而不是依「代墊人」計算；因此共同花費會按照每位成員實際分攤的金額歸類。
                      </p>
                    </div>
                  ) : expenseView === 'list' ? (
                    <div className="space-y-6">
                      {(/** @type {any[]} */ (expenseStats.groupedExpenses)).map(({ day, items }) => {
                        if (!Array.isArray(items) || items.length === 0) return null;
                        const { title, dateStr } = day === PRE_TRIP_ID ? { title: "行前支出", dateStr: "出發前共同採購與預付款" } : getDayDisplay(day, meta.startDate);
                        return (
                          <div key={String(day)} className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                            <div className="flex justify-between items-center mb-4">
                              <h3 className={`font-bold ${t.mainText}`}>{String(title)} <span className={`text-xs font-normal ml-1 ${t.subText}`}>{String(dateStr)}</span></h3>
                              <span className="text-xs text-emerald-500 font-mono font-bold">NT${items.reduce((a,b)=>a+(Number(b.cost)||0),0).toLocaleString()}</span>
                            </div>
                            <div className="space-y-2.5">
                              {(/** @type {any[]} */ (items)).map(e => {
                                const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[5];
                                return (
                                  <button
                                    type="button"
                                    key={String(e.id)}
                                    onClick={() => openExpenseEditor(e)}
                                    className={`w-full flex justify-between items-center gap-3 p-3 rounded-2xl border transition-all text-left ${t.itemBg} ${t.cardBorder} hover:border-emerald-500/50 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]`}
                                    aria-label={`編輯帳目 ${String(e.item)}`}
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className={`w-10 h-10 ${cat.color} text-white rounded-full flex items-center justify-center text-sm shadow-inner shrink-0`}>{cat.icon}</span>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <p className={`text-sm font-bold truncate ${t.mainText}`}>{String(e.item)}</p>
                                          {Number(e.updatedAt) > Number(e.createdAt || e.updatedAt) ? (
                                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-bold">已編輯</span>
                                          ) : null}
                                        </div>
                                        <p className={`text-[10px] font-bold mt-0.5 ${t.subText}`}>
                                          {cat.label} • <span className="text-blue-500">{String(e.payer)}</span> 先付 • {Object.values(e.split || {}).filter(amount => Number(amount) > 0).length || membersList.length} 人分攤
                                        </p>
                                        {e.note ? <p className={`text-[10px] mt-1 truncate ${t.subText}`}>📝 {String(e.note)}</p> : null}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                      <div className="flex flex-col items-end">
                                        <span className={`font-mono font-bold ${t.mainText}`}>NT${(Number(e.cost)||0).toLocaleString()}</span>
                                        {e.currency && e.currency !== 'TWD' ? <span className={`text-[9px] font-mono opacity-60 ${t.subText}`}>{e.currency} {(Number(e.localCost) || 0).toLocaleString()}</span> : null}
                                      </div>
                                      <span className={`text-[11px] font-bold ${t.subText}`}>✏️ <span className="hidden sm:inline">編輯</span></span>
                                    </div>
                                  </button>
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                          <div>
                            <h3 className={`text-sm font-bold flex items-center gap-2 ${t.mainText}`}>🧳 行前結算</h3>
                            <p className={`text-[10px] mt-1 ${t.subText}`}>結算只記錄成員間的實際轉帳，不會刪除支出，因此總額、預算和圖表仍保留完整資料。</p>
                          </div>
                          <button type="button" onClick={() => setShowSettlementModal(true)} disabled={expenseStats.preTripTransfers.length === 0} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95">
                            💸 記錄行前結算
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><p className={`text-[9px] font-bold ${t.subText}`}>行前支出</p><p className={`font-mono font-black mt-1 ${t.mainText}`}>NT${Math.round(expenseStats.preTripTotal).toLocaleString()}</p></div>
                          <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><p className={`text-[9px] font-bold ${t.subText}`}>已記錄轉帳</p><p className="font-mono font-black mt-1 text-indigo-500">NT${Math.round(expenseStats.preTripSettlementTotal).toLocaleString()}</p></div>
                        </div>
                        {expenseStats.preTripTransfers.length > 0 ? (
                          <div className="space-y-2">
                            {expenseStats.preTripTransfers.map((item, index) => <div key={`pretrip-${index}`} className={`flex justify-between items-center p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><span className={`text-xs ${t.mainText}`}><b className="text-red-500">{item.from}</b> → <b className="text-emerald-500">{item.to}</b></span><b className={`font-mono ${t.mainText}`}>NT${Math.round(item.amount).toLocaleString()}</b></div>)}
                          </div>
                        ) : <p className={`text-center py-3 text-xs font-bold ${t.subText}`}>{expenseStats.preTripTotal > 0 ? "行前款項已結清 🎉" : "尚未新增行前支出"}</p>}
                        {settlements.filter(item => item.scope === "pretrip").length > 0 ? <details className="mt-4"><summary className={`cursor-pointer text-xs font-bold ${t.subText}`}>查看結算紀錄（{settlements.filter(item => item.scope === "pretrip").length}）</summary><div className="space-y-2 mt-3">{settlements.filter(item => item.scope === "pretrip").slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(item => <div key={item.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><div><p className={`text-xs font-bold ${t.mainText}`}>{item.from} → {item.to}　NT${Number(item.amount||0).toLocaleString()}</p><p className={`text-[9px] mt-1 ${t.subText}`}>{item.note || "行前結算"} · {new Date(item.createdAt).toLocaleDateString("zh-TW")}</p></div><button type="button" onClick={() => handleDeleteSettlement(item.id)} className="text-red-500 text-xs font-bold">刪除</button></div>)}</div></details> : null}
                      </div>

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
                                  <span className="text-emerald-500 font-mono font-bold">應收回 +NT${balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
                                ) : isNegative ? (
                                  <span className="text-red-500 font-mono font-bold">須支付 -NT${Math.abs(balance).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
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
                            {(/** @type {any[]} */ (expenseStats.transfers)).map((tItem, idx) => (
                              <div key={`transfer-${idx}`} className={`flex justify-between items-center p-4 rounded-xl border ${t.isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-500/30'}`}>
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-red-500">{String(tItem.from)}</span>
                                  <span className={`text-xs ${t.subText}`}>➡️ 轉給 ➡️</span>
                                  <span className="font-bold text-emerald-500">{String(tItem.to)}</span>
                                </div>
                                <span className={`font-mono font-black text-lg ${t.mainText}`}>NT${Math.round(Number(tItem.amount)).toLocaleString()}</span>
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
                      {(/** @type {any[]} */ (tickets)).map(ticket => (
                        <div key={String(ticket.id)} className={`relative flex flex-col p-4 rounded-3xl border shadow-sm transition-transform hover:-translate-y-1 ${t.itemBg} ${t.cardBorder}`}>
                          <button onClick={() => { void handleDeleteTicket(ticket); }} className="absolute top-3 right-3 w-7 h-7 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center text-xs font-bold hover:bg-red-500 hover:text-white transition-colors">✕</button>
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
                            <button onClick={() => { if (!openExternalUrl(ticket.url)) alert("票券網址格式不正確！"); }} className="w-full bg-emerald-600 text-white font-bold text-xs py-3 rounded-xl shadow-md border border-emerald-500 hover:bg-emerald-500 transition-colors">📄 開啟 PDF 文件檔案</button>
                          ) : (
                            <button onClick={() => { if (!openExternalUrl(ticket.url)) alert("票券網址格式不正確！"); }} className="w-full bg-blue-600 text-white font-bold text-xs py-3 rounded-xl shadow-md border border-blue-500 hover:bg-blue-500 transition-colors">🌐 開啟數位網址連結</button>
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
                  {exploreResults.length > 0 ? (
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
              <Map id="main-map" style={{ width: '100%', height: '100%' }} defaultCenter={{lat: 22.99, lng: 120.20}} defaultZoom={13} mapId={MAP_ID}>
                <Directions itinerary={itinerary} dayId={safeCurrentDay} onRouteCalculated={handleRouteCalculated} />
                {(/** @type {any[]} */ (Array.isArray(itinerary[safeCurrentDay]) ? itinerary[safeCurrentDay] : []))
                  .filter((item) => isValidCoordinates(item?.lat, item?.lng))
                  .map((item, idx) => (
                    <AdvancedMarker key={String(item.id)} position={{lat: Number(item.lat), lng: Number(item.lng)}} onClick={() => handleSavedItemDetails(item)}>
                      <Pin background={'#3b82f6'} glyphText={String(idx + 1)} />
                    </AdvancedMarker>
                  ))}
                {(/** @type {any[]} */ (Array.isArray(exploreResults) ? exploreResults : []))
                  .filter((place) => place?.geometry?.location)
                  .map((place) => {
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

      {/* 🌟 彈窗掛載區 */}
      {optimizationPreview ? (
        <RouteOptimizationPreviewModal
          preview={optimizationPreview}
          onClose={() => setOptimizationPreview(null)}
          onApply={applyOptimizationPreview}
          t={t}
        />
      ) : null}

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
      {showExportModal ? (
        <ExportItineraryModal
          days={sortDayIds(existingDays)}
          currentDay={safeCurrentDay}
          isExportingImage={isExporting}
          onClose={() => setShowExportModal(false)}
          onExportFull={handleExportFullItinerary}
          onExportDay={(dayId) => void handleExportDayImage(dayId)}
          t={t}
        />
      ) : null}
      {showChecklistModal ? (
        <ChecklistModal
          items={checklistItems}
          members={membersList}
          activeMember={activeChecklistMember}
          onActiveMemberChange={handleChecklistActorChange}
          onClose={() => setShowChecklistModal(false)}
          onCreate={handleCreateChecklistItem}
          onUpdate={handleUpdateChecklistItem}
          onDelete={handleDeleteChecklistItem}
          onBulkCreate={handleBulkCreateChecklistItems}
          onClearCompleted={handleClearCompletedChecklistItems}
          t={t}
        />
      ) : null}
      {showExpenseModal ? (
        <ExpenseModal
          members={membersList}
          existingDays={[PRE_TRIP_ID, ...existingDays]}
          startDate={meta.startDate}
          defaultDay={editingExpense?.dayId || safeCurrentDay || existingDays[0] || PRE_TRIP_ID}
          expense={editingExpense}
          onClose={closeExpenseEditor}
          onSave={handleSaveExpense}
          onDelete={handleDeleteExpense}
          onDuplicate={handleDuplicateExpense}
          t={t}
        />
      ) : null}
      {showSettlementModal ? <SettlementModal members={membersList} suggestions={expenseStats.preTripTransfers} onClose={() => setShowSettlementModal(false)} onSave={handleSaveSettlement} t={t} /> : null}
      {showTicketModal ? <TicketModal roomId={roomId} members={membersList} onClose={() => setShowTicketModal(false)} onSave={(newTicket) => { setTickets(prev => [...prev, newTicket]); setShowTicketModal(false); }} t={t} /> : null}
      {fullscreenTicket ? <FullscreenTicketModal ticket={fullscreenTicket} onClose={() => setFullscreenTicket(null)} /> : null}
    </>
  );
};

export default TripDetail;