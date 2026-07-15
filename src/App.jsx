// ============================================================================
// (1) 模組引入與全局設定
// ============================================================================
import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';

// 引入 Firebase 與 Helper
import { db } from "./firebase";
import { get, ref as dbRef, set, update } from "firebase/database";
import { API_KEY } from "./constants";
import {
  CURRENT_RELEASE_NOTES,
  clearCurrentReleaseTourPending,
  hasPendingCurrentReleaseTour,
  hasSeenCurrentRelease,
  markCurrentReleaseTourPending,
  markCurrentReleaseSeen,
} from "./config/releaseNotes";
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
const UXFoundationDemo = import.meta.env.DEV
  ? lazy(() => import('./components/ui/UXFoundationDemo.jsx'))
  : null;
// 💡 加上 .jsx 副檔名，幫助編輯器精準定位
import {
  DateRangePickerModal,
  DestinationSearch,
} from './components/UIComponents.jsx';
import { FeatureTour } from './components/FeatureTour.jsx';
import { WhatsNewDialog } from './components/WhatsNewDialog.jsx';
import { AppSettingsMenu } from './components/AppSettingsMenu.jsx';
import { EmptyState } from './components/ui/EmptyState.jsx';
import { useToast } from './components/ui/useToast.js';
import { useConfirm } from './components/ui/useConfirm.js';
import { checkForPwaUpdate } from './pwaUpdateController.js';
import { useOnlineStatus } from './hooks/useOnlineStatus.js';
import { OfflineBanner } from './components/OfflineBanner.jsx';
import { listOfflineTripSummaries, removeOfflineTripSnapshot, readOfflineTripSnapshot } from './features/offline/offlineTripCache.js';
import { OfflineTripPreview } from './features/offline/OfflineTripPreview.jsx';

const IS_FIREBASE_EMULATOR =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";

const FIREBASE_DATABASE_NAMESPACE = (() => {
  try {
    const databaseUrl = new URL(
      String(import.meta.env.VITE_FIREBASE_DATABASE_URL || ""),
    );
    return databaseUrl.hostname.split(".")[0] || "";
  } catch {
    return "";
  }
})();

const formatDateForInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// ============================================================================
// (2) 核心視圖：首頁大廳 (TravelApp)
// ============================================================================
export default function TravelApp() {
  const { isOnline, hasBeenOffline } = useOnlineStatus();
  const toast = useToast();
  const confirm = useConfirm();
  
  const lastOnlineState = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !lastOnlineState.current && hasBeenOffline) {
      toast.info({
        title: '已恢復連線',
        description: '請稍候確認最新資料已同步。',
      });
    }
    lastOnlineState.current = isOnline;
  }, [isOnline, hasBeenOffline, toast]);

  const [myTrips, setMyTrips] = useState(() => {
    const stored = readJsonStorage('google-travel-my-trips', []);
    return Array.isArray(stored) ? stored : [];
  });
  const [customBgColor, setCustomBgColor] = useState(() => readStorage('google-travel-custom-bg', '#d8b4e2'));
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showFeatureTour, setShowFeatureTour] = useState(false);
  const [releasePromptDeferred, setReleasePromptDeferred] = useState(false);
  const [pendingFeatureTourRequested, setPendingFeatureTourRequested] = useState(() => hasPendingCurrentReleaseTour());
  const [showTripTourSelection, setShowTripTourSelection] = useState(false);
  const [tourStartBlocked, setTourStartBlocked] = useState(false);
  const [tourOpenError, setTourOpenError] = useState("");
  const [tripTourAvailability, setTripTourAvailability] = useState({
    roomId: null,
    ready: false,
    blockingEditor: false,
    failed: false,
  });
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const isCheckingAppUpdateRef = useRef(false);
  const [isSavingTrip, setIsSavingTrip] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const lobbyAppearanceInputRef = useRef(null);

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

  const [offlinePreviewData, setOfflinePreviewData] = useState(null);
  const [offlineCacheSummaries, setOfflineCacheSummaries] = useState([]);

  const refreshOfflineCacheSummaries = useCallback(() => {
    setOfflineCacheSummaries(listOfflineTripSummaries());
  }, []);

  useEffect(() => {
    refreshOfflineCacheSummaries();
  }, [activeRoomId, refreshOfflineCacheSummaries]);

  const setPendingFeatureTour = useCallback((isPending) => {
    setPendingFeatureTourRequested(Boolean(isPending));
    if (isPending) {
      markCurrentReleaseTourPending();
    } else {
      clearCurrentReleaseTourPending();
    }
  }, []);

  const openTripRoom = useCallback((roomId) => {
    const safeRoomId = extractRoomId(roomId);
    if (!safeRoomId) return false;

    if (!isOnline) {
      const hasCache = offlineCacheSummaries.some(s => s.roomId === safeRoomId);
      if (!hasCache) {
        toast.info({
          title: "\u5c1a\u7121\u96e2\u7dda\u8cc7\u6599",
          description: "\u6b64\u65c5\u7a0b\u5c1a\u672a\u5efa\u7acb\u53ef\u7528\u7684\u96e2\u7dda\u5feb\u53d6\uff0c\u8acb\u91cd\u65b0\u9023\u7dda\u5f8c\u958b\u555f\u3002",
        });
        return false;
      }

      const fullSnap = readOfflineTripSnapshot(safeRoomId);
      if (!fullSnap) {
        setOfflinePreviewData(null);
        refreshOfflineCacheSummaries();
        toast.info({
          title: "\u5c1a\u7121\u96e2\u7dda\u8cc7\u6599",
          description: "\u96e2\u7dda\u8cc7\u6599\u5df2\u640d\u58de\u3001\u5931\u6548\u6216\u9700\u8981\u91cd\u65b0\u9023\u7dda\u958b\u555f\u3002",
        });
        return false;
      }

      setActiveRoomId(null);
      setOfflinePreviewData(fullSnap);
      return true;
    }

    setOfflinePreviewData(null);
    window.history.pushState(null, '', `?room=${encodeURIComponent(safeRoomId)}`);
    setActiveRoomId(safeRoomId);
    return true;
  }, [isOnline, offlineCacheSummaries, refreshOfflineCacheSummaries, toast]);

  useEffect(() => {
    writeStorage('google-travel-my-trips', JSON.stringify(myTrips));
  }, [myTrips]);

  useEffect(() => {
    writeStorage('google-travel-custom-bg', customBgColor);
  }, [customBgColor]);

  useEffect(() => {
    if (releasePromptDeferred || hasSeenCurrentRelease()) return;
    setShowWhatsNew(true);
  }, [releasePromptDeferred]);

  useEffect(() => {
    const handlePopState = () => {
      const roomId = extractRoomId(new URLSearchParams(window.location.search).get('room'));
      if (!roomId) {
        setOfflinePreviewData(null);
        setShowFeatureTour(false);
        setShowTripTourSelection(false);
        setTripTourAvailability({
          roomId: null,
          ready: false,
          blockingEditor: false,
          failed: false,
        });
        setPendingFeatureTour(false);
      }
      setActiveRoomId(roomId || null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setPendingFeatureTour]);

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
    if (!isOnline) {
      toast.error({
        title: '目前離線',
        description: '請恢復網路連線後再試。',
      });
      return;
    }

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

  const openCreateModal = useCallback(() => {
    setNewTitle(""); setNewDest(""); setNewDestCoords(null); setNewStart(""); setNewEnd("");
    setNewMembers(["自己"]); setTempMemberBudgets({"自己": 10000});
    setNewTransport("汽車 🚗"); setNewThemeColor("#3b82f6");
    setTripModalMode('create');
  }, []);

  const fillEmulatorRequiredFields = () => {
    const start = new Date();
    start.setDate(start.getDate() + 1);

    const end = new Date(start);
    end.setDate(end.getDate() + 2);

    setNewDest("台北市（Emulator 測試）");
    setNewDestCoords({ lat: 25.033, lng: 121.5654 });
    setNewStart(formatDateForInput(start));
    setNewEnd(formatDateForInput(end));
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
    if (!isOnline) {
      toast.error({
        title: '目前離線',
        description: '請恢復網路連線後再試。',
      });
      return;
    }

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
    setShowFeatureTour(false);
    setShowTripTourSelection(false);
    setTripTourAvailability({
      roomId: null,
      ready: false,
      blockingEditor: false,
      failed: false,
    });
    setPendingFeatureTour(false);
    setActiveRoomId(null);
    setOfflinePreviewData(null);
  };

  const openReleaseNotes = useCallback(() => {
    setShowWhatsNew(true);
  }, []);

  const handleCheckAppUpdate = useCallback(async () => {
    if (!isOnline) {
      toast.error({
        title: '目前離線',
        description: '請恢復網路連線後再試。',
      });
      return;
    }

    if (isCheckingAppUpdateRef.current) return;

    isCheckingAppUpdateRef.current = true;
    setIsCheckingAppUpdate(true);

    try {
      const result = await checkForPwaUpdate({ forceReveal: true });

      if (result.status === 'update-available') {
        return;
      }

      if (result.status === 'up-to-date') {
        toast.info({
          title: '已是最新版本',
        });
        return;
      }

      if (result.status === 'checking') {
        return;
      }

      toast.error({
        title: '無法檢查更新',
      });
    } catch (error) {
      console.error('Manual app update check failed:', error);
      toast.error({
        title: '無法檢查更新',
      });
    } finally {
      isCheckingAppUpdateRef.current = false;
      setIsCheckingAppUpdate(false);
    }
  }, [toast, isOnline]);

  const closeReleaseNotes = useCallback(() => {
    setShowWhatsNew(false);
  }, []);

  const chooseTripForPendingTour = useCallback((trip) => {
    const roomId = extractRoomId(trip?.roomId);
    if (!roomId) {
      setTourOpenError("無法開啟此旅程，請選擇其他旅程。");
      setPendingFeatureTour(false);
      setShowTripTourSelection(false);
      return;
    }

    setTourOpenError("");
    setShowTripTourSelection(false);
    setPendingFeatureTour(true);
    openTripRoom(roomId);
  }, [openTripRoom, setPendingFeatureTour]);

  const startFeatureTour = useCallback(() => {
    markCurrentReleaseSeen();
    setShowWhatsNew(false);
    setTourOpenError("");

    if (!activeRoomId) {
      if (!Array.isArray(myTrips) || myTrips.length === 0) {
        setPendingFeatureTour(false);
        setShowTripTourSelection(false);
        openCreateModal();
        return;
      }

      setPendingFeatureTour(true);
      if (myTrips.length === 1) {
        setShowTripTourSelection(false);
        chooseTripForPendingTour(myTrips[0]);
      } else {
        setShowTripTourSelection(true);
      }
      return;
    }

    if (tripTourAvailability.blockingEditor) {
      setPendingFeatureTour(false);
      setTourStartBlocked(true);
      return;
    }

    if (
      tripTourAvailability.ready
      && tripTourAvailability.roomId === activeRoomId
    ) {
      setPendingFeatureTour(false);
      setShowFeatureTour(true);
      return;
    }

    setPendingFeatureTour(true);
  }, [
    activeRoomId,
    chooseTripForPendingTour,
    myTrips,
    openCreateModal,
    setPendingFeatureTour,
    tripTourAvailability,
  ]);

  const cancelPendingFeatureTour = useCallback(() => {
    setPendingFeatureTour(false);
    setShowTripTourSelection(false);
  }, [setPendingFeatureTour]);

  const remindLaterRelease = useCallback(() => {
    setReleasePromptDeferred(true);
    setShowWhatsNew(false);
  }, []);

  const dismissCurrentRelease = useCallback(() => {
    markCurrentReleaseSeen();
    setShowWhatsNew(false);
  }, []);

  const closeFeatureTour = useCallback(() => {
    markCurrentReleaseSeen();
    setPendingFeatureTour(false);
    setShowFeatureTour(false);
  }, [setPendingFeatureTour]);

  useEffect(() => {
    if (!pendingFeatureTourRequested || !activeRoomId || showFeatureTour) return;
    if (tripTourAvailability.roomId !== activeRoomId) return;

    if (tripTourAvailability.failed) {
      setTourOpenError("無法開啟此旅程，請選擇其他旅程。");
      setPendingFeatureTour(false);
      return;
    }

    if (!tripTourAvailability.ready) return;

    if (tripTourAvailability.blockingEditor) {
      setPendingFeatureTour(false);
      setTourStartBlocked(true);
      return;
    }

    setPendingFeatureTour(false);
    setShowFeatureTour(true);
  }, [
    activeRoomId,
    pendingFeatureTourRequested,
    setPendingFeatureTour,
    showFeatureTour,
    tripTourAvailability,
  ]);

  const t = useMemo(() => getThemeClasses(customBgColor), [customBgColor]);
  const showUxFoundationDemo = import.meta.env.DEV
    && typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('uxFoundation') === 'demo';
  const hasTrips = Array.isArray(myTrips) && myTrips.length > 0;
  const tourCtaMode = activeRoomId
    ? 'trip'
    : (hasTrips ? 'lobby-trips' : 'lobby-empty');
  const releaseExperience = (
    <>
      {showWhatsNew ? (
        <WhatsNewDialog
          notes={CURRENT_RELEASE_NOTES}
          t={t}
          tourCtaMode={tourCtaMode}
          onStartTour={startFeatureTour}
          onRemindLater={remindLaterRelease}
          onDismissVersion={dismissCurrentRelease}
          onClose={closeReleaseNotes}
        />
      ) : null}
      {tourStartBlocked ? (
        <div
          data-testid="feature-tour-editing-blocked"
          className="fixed inset-0 z-10045 flex items-center justify-center bg-slate-950/65 p-4"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="feature-tour-editing-blocked-title"
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl ${t.modalBg} ${t.cardBorder}`}
          >
            <h2 id="feature-tour-editing-blocked-title" className={`text-xl font-black ${t.mainText}`}>
              先完成目前編輯
            </h2>
            <p className={`mt-2 text-sm font-bold leading-6 ${t.subText}`}>
              請先儲存或關閉目前的編輯內容，再開始功能導覽。
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                data-testid="feature-tour-continue-editing"
                onClick={() => setTourStartBlocked(false)}
                className={`min-h-11 rounded-xl border px-4 text-sm font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
              >
                繼續編輯
              </button>
              <button
                type="button"
                data-testid="feature-tour-dismiss-blocked"
                onClick={() => setTourStartBlocked(false)}
                className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-lg shadow-blue-500/25"
              >
                關閉導覽提示
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {showFeatureTour ? <FeatureTour t={t} onClose={closeFeatureTour} /> : null}
    </>
  );

  if (showUxFoundationDemo && UXFoundationDemo) {
    return (
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-white font-bold">載入 UX Foundation Demo...</div>}>
        <UXFoundationDemo />
      </Suspense>
    );
  }

  if (offlinePreviewData) return (
    <>
      <OfflineTripPreview
        summary={offlinePreviewData}
        isOnline={isOnline}
        onBack={() => setOfflinePreviewData(null)}
        onClearCache={async () => {
          const ok = await confirm({
            title: "\u6e05\u9664\u672c\u88dd\u7f6e\u96e2\u7dda\u8cc7\u6599\uff1f",
            description: "\u53ea\u6703\u522a\u9664\u6b64\u88dd\u7f6e\u4e0a\u7684\u96e2\u7dda\u5feb\u53d6\uff0c\u4e0d\u6703\u522a\u9664\u96f2\u7aef\u65c5\u7a0b\u8cc7\u6599\u3002",
            confirmText: "\u6e05\u9664",
            cancelText: "\u53d6\u6d88",
          });
          if (!ok) return;

          const res = removeOfflineTripSnapshot(offlinePreviewData.roomId);
          if (res?.ok) {
            refreshOfflineCacheSummaries();
            setOfflinePreviewData(null);
            toast.info({ title: "\u5df2\u6e05\u9664\u96e2\u7dda\u8cc7\u6599" });
            return;
          }

          toast.error({
            title: "\u6e05\u9664\u96e2\u7dda\u8cc7\u6599\u5931\u6557",
            description: "\u8acb\u7a0d\u5f8c\u518d\u8a66\uff0c\u6216\u91cd\u65b0\u9023\u7dda\u5f8c\u958b\u555f\u65c5\u7a0b\u3002",
          });
        }}
        onOpenOnline={() => {
          if (!isOnline) return;
          const id = offlinePreviewData.roomId;
          setOfflinePreviewData(null);
          openTripRoom(id);
        }}
      />
      <OfflineBanner isOnline={isOnline} />
      {releaseExperience}
    </>
  );

  if (activeRoomId) return (
    <>
    <APIProvider apiKey={API_KEY}>
      <span
        data-testid="trip-route-context"
        data-room-id={String(activeRoomId)}
        data-database-namespace={FIREBASE_DATABASE_NAMESPACE}
        className="sr-only"
      >
        旅程已開啟
      </span>
      <Suspense fallback={<div className="fixed inset-0 flex items-center justify-center bg-slate-950 text-white font-bold">載入旅程模組中...</div>}>
        <TripDetail
          roomId={activeRoomId}
          onBack={closeTrip}
          onUpdateTripMeta={handleUpdateTripMeta}
          onOpenReleaseNotes={openReleaseNotes}
          onStartFeatureTour={startFeatureTour}
          onCheckUpdates={handleCheckAppUpdate}
          isCheckingUpdates={isCheckingAppUpdate}
          onTourAvailabilityChange={setTripTourAvailability}
          isOnline={isOnline}
        />
      </Suspense>
    </APIProvider>
    <OfflineBanner isOnline={isOnline} />
    {releaseExperience}
    </>
  );

  return (
    <>
    <div data-testid="travel-lobby" style={{ backgroundColor: customBgColor }} className={`fixed inset-0 flex flex-col font-sans overflow-x-hidden overscroll-none transition-colors duration-500 w-full max-w-[100vw] ${t.mainText}`}>
      <div className="max-w-5xl w-full mx-auto p-6 md:p-12 overflow-y-auto">
        <header className="mb-10 flex flex-col gap-5 md:mb-12">
          <input
            ref={lobbyAppearanceInputRef}
            type="color"
            value={String(customBgColor)}
            onChange={e => setCustomBgColor(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-label="自訂外觀顏色"
          />
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-2 flex min-w-0 items-center gap-3 md:gap-4">
                {/* 💡 已將 bg-gradient 修正為 Tailwind v4 的 bg-linear */}
                <div className="shrink-0 bg-linear-to-br from-blue-500 to-emerald-500 text-white p-2.5 rounded-2xl shadow-lg transform -rotate-12 hover:rotate-0 transition-transform cursor-pointer">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
                </div>
                <h1 className="min-w-0 truncate text-4xl font-black text-transparent bg-clip-text bg-linear-to-r from-blue-500 to-emerald-400 tracking-tight md:text-5xl">智の旅行</h1>
              </div>
              <p className={`font-bold tracking-wide ${t.subText}`}>你的專屬旅程管理中心</p>
            </div>
            <AppSettingsMenu
              key={activeRoomId || 'lobby-settings'}
              t={t}
              version={CURRENT_RELEASE_NOTES.version}
              onOpenAppearance={() => lobbyAppearanceInputRef.current?.click?.()}
              onOpenReleaseNotes={openReleaseNotes}
              onStartFeatureTour={startFeatureTour}
              onCheckUpdates={handleCheckAppUpdate}
              isCheckingUpdates={isCheckingAppUpdate}
            />
          </div>

          {hasTrips ? (
          <div className="grid w-full gap-3 md:flex md:items-center md:justify-end">
            <button
              type="button"
              data-testid="create-trip-button"
              onClick={openCreateModal}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-blue-500/30 transition-all active:scale-95 hover:bg-blue-500 md:w-auto md:min-w-40"
            >
              <span aria-hidden="true">＋</span>
              <span className="whitespace-nowrap">建立新旅程</span>
            </button>
            <div className="grid grid-cols-2 gap-3 md:flex md:w-auto">
              <button
                type="button"
                data-testid="import-trip-button"
                onClick={() => setShowImportModal(true)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black transition-transform active:scale-95 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
              >
                <span aria-hidden="true">⇩</span>
                <span className="whitespace-nowrap">匯入旅程</span>
              </button>
              <button
                type="button"
                data-testid="lobby-appearance-button"
                onClick={() => lobbyAppearanceInputRef.current?.click?.()}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black transition-transform active:scale-95 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
              >
                <span className="h-4 w-4 shrink-0 rounded-full border border-white/70 shadow-sm" style={{ backgroundColor: customBgColor }} aria-hidden="true" />
                <span className="whitespace-nowrap">自訂外觀</span>
              </button>
            </div>
          </div>
          ) : null}
        </header>

        {showTripTourSelection && Array.isArray(myTrips) && myTrips.length > 0 ? (
          <section
            data-testid="trip-tour-selection"
            className={`mb-6 rounded-3xl border p-4 shadow-xl ${t.cardBg} ${t.cardBorder}`}
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className={`text-lg font-black ${t.mainText}`}>選擇要用來導覽的旅程</h2>
                <p data-testid="pending-tour-message" className={`mt-1 text-sm font-bold ${t.subText}`}>
                  請選擇一個旅程開始導覽；進入旅程並載入完成後會自動開始。
                </p>
              </div>
              <button
                type="button"
                data-testid="pending-tour-cancel"
                onClick={cancelPendingFeatureTour}
                className={`min-h-11 rounded-xl border px-4 text-sm font-black ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
              >
                取消導覽
              </button>
            </div>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {myTrips.map((trip) => (
                <button
                  key={`tour-select-${String(trip.roomId)}`}
                  type="button"
                  data-testid="trip-tour-selection-option"
                  data-room-id={String(trip.roomId)}
                  onClick={() => chooseTripForPendingTour(trip)}
                  className={`min-h-14 rounded-2xl border px-4 py-3 text-left transition-transform active:scale-95 ${t.cardBg} ${t.cardBorder}`}
                >
                  <span className={`block text-sm font-black ${t.mainText}`}>{String(trip.title || '未命名旅程')}</span>
                  <span className={`mt-1 block text-xs font-bold ${t.subText}`}>
                    {String(trip.startDate || '').replace(/-/g, '/')} - {String(trip.endDate || '').replace(/-/g, '/')}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {tourOpenError ? (
          <p className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-500">
            {tourOpenError}
          </p>
        ) : null}

        {!hasTrips ? (
          <EmptyState
            testId="lobby-empty-state"
            className={`${t.cardBg} ${t.cardBorder} mt-16 md:mt-24`}
            icon={(
              <svg viewBox="0 0 48 48" className="h-14 w-14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M8 34c7-4 13-4 20 0s13 4 20 0" />
                <path d="M12 30V12l10 5 10-5 10 5v18" />
                <path d="M22 17v18" />
                <path d="M32 12v23" />
              </svg>
            )}
            title="建立你的第一個旅程"
            description="集中管理每日行程、景點、費用與旅伴協作，從第一個旅程開始規劃。"
            primaryAction={{
              label: '建立新旅程',
              testId: 'lobby-empty-create-trip',
              onClick: openCreateModal,
            }}
            secondaryAction={{
              label: '匯入旅程',
              testId: 'lobby-empty-import-trip',
              onClick: () => setShowImportModal(true),
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myTrips.map(trip => {
              const cardColor = String(trip.themeColor || '#1e293b'); const cTheme = getThemeClasses(cardColor);
              return (
                <div key={String(trip.roomId)} data-testid="trip-card" data-room-id={String(trip.roomId)} onClick={() => { openTripRoom(trip.roomId); }} style={{ backgroundColor: cardColor }} className={`border rounded-3xl p-6 cursor-pointer transition-all duration-300 group shadow-xl hover:-translate-y-1 hover:shadow-2xl ${cTheme.cardBorder}`}>
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${cTheme.isLight ? 'bg-black/5 border-black/10 text-slate-700' : 'bg-white/20 border-white/30 text-white'}`}>{String(trip.transport)}</span>
                    <div className="flex gap-2">
                      <button onClick={(e) => openEditModal(e, trip)} className={`text-xs p-1 transition-colors hover:text-blue-500 ${cTheme.subText}`}>⚙️ 編輯</button>
                      <button onClick={(e) => { e.stopPropagation(); if(window.confirm('確定從大廳移除此捷徑？(雲端資料不會刪除)')) setMyTrips(prev => prev.filter(item => item.roomId !== trip.roomId)); }} className={`text-xs p-1 transition-colors hover:text-red-500 ${cTheme.subText}`}>移除</button>
                    </div>
                  </div>
                  <h2 data-testid="trip-card-title" className={`text-2xl font-black mb-1.5 transition-colors line-clamp-2 ${cTheme.mainText}`}>{String(trip.title)}</h2>
                  <p className={`text-sm font-bold mb-5 truncate ${cTheme.subText}`}>📍 {String(trip.destination || '未定地點')}</p>
                  <div className={`p-3.5 rounded-xl border ${cTheme.cardMetaBg} ${cTheme.cardBorder}`}>
                    <p className={`text-xs mb-1.5 font-medium ${cTheme.subText}`}>📅 {String(trip.startDate || '').replace(/-/g, '/')} <span className="mx-1 opacity-50">→</span> {String(trip.endDate || '').replace(/-/g, '/')}</p>
                    <p className={`text-xs truncate font-medium ${cTheme.subText}`}>👥 {Array.isArray(trip.members) ? trip.members.join(', ') : '自己'}</p>
                  </div>
                  {offlineCacheSummaries.find(s => s.roomId === trip.roomId) && (
                    <div className={`mt-4 pt-3 border-t ${cTheme.cardBorder}`} data-testid="offline-cache-status">
                      <p className={`text-xs font-medium flex items-center gap-1 ${cTheme.subText}`}>
                        <span className="text-green-500">✓</span> 可離線查看 · 更新於 {new Date(offlineCacheSummaries.find(s => s.roomId === trip.roomId).cachedAt).toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  )}
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
          <div data-testid="trip-modal" style={{ zIndex: 9999, touchAction: 'none' }} className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-hidden w-full max-w-[100vw]" onClick={() => setTripModalMode(null)}>
            <div style={{ touchAction: 'auto' }} className={`border rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl overflow-y-auto overflow-x-hidden max-h-[90vh] ${t.modalBg} ${t.cardBorder}`} onClick={e => e.stopPropagation()}>
              <h2 data-testid="trip-modal-title" className={`text-2xl font-black mb-6 ${t.mainText}`}>{tripModalMode === 'create' ? '建立新旅程 🛫' : '編輯旅程設定 ⚙️'}</h2>
              <div className="space-y-5">
                <div>
                  <label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅程專屬顏色</label>
                  <div className={`flex items-center gap-3 p-2 rounded-xl border ${t.inputBg} ${t.cardBorder}`}>
                    <div className="relative w-8 h-8 rounded-full overflow-hidden border-2 border-white"><input type="color" value={String(newThemeColor)} onChange={e => setNewThemeColor(e.target.value)} className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0" /></div>
                    <span className={`text-sm font-bold ${t.mainText}`}>{String(newThemeColor).toUpperCase()}</span>
                  </div>
                </div>
                <div><label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅程名稱 *</label><input data-testid="trip-name-input" value={String(newTitle)} onChange={e => setNewTitle(e.target.value)} placeholder="ex: 瘋狂沖繩遊" className={`w-full p-3.5 rounded-xl border text-base md:text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`} /></div>

                <div data-testid="trip-destination-field" className="z-50 relative">
                  <label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>主要地點 (自動獲取天氣) *</label>
                  <DestinationSearch value={newDest} onChange={(val, coords) => { setNewDest(val); setNewDestCoords(isValidCoordinates(coords) ? coords : null); }} t={t} />
                </div>

                <div><label className={`block text-xs font-bold mb-1.5 uppercase ${t.subText}`}>旅行日期 *</label><button type="button" data-testid="trip-date-picker-button" onClick={() => setShowDatePicker(true)} className={`w-full p-3.5 rounded-xl border flex justify-between items-center cursor-pointer ${t.inputBg} ${t.cardBorder} ${t.mainText}`}><span data-testid="trip-date-range">{newStart && newEnd ? `${String(newStart)} 至 ${String(newEnd)}` : '點擊選擇出發與回程日期'}</span><span>📅</span></button></div>
                {IS_FIREBASE_EMULATOR && tripModalMode === "create" ? (
                  <button
                    type="button"
                    data-testid="fill-emulator-required-fields"
                    onClick={fillEmulatorRequiredFields}
                    className="w-full rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-left text-xs font-bold text-amber-500 transition-colors hover:bg-amber-400/20"
                  >
                    🧪 自動填入 Emulator 測試地點與日期
                  </button>
                ) : null}

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
              <div className={`flex justify-end gap-3 mt-8 pt-5 border-t ${t.cardBorder}`}><button onClick={() => setTripModalMode(null)} className={`px-5 py-2.5 text-sm font-bold ${t.mainText}`}>取消</button><button type="button" data-testid="create-trip-submit" onClick={() => void handleSaveTripModal()} disabled={isSavingTrip} className="bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-md">{isSavingTrip ? "儲存中..." : (tripModalMode === 'create' ? '確認建立' : '儲存變更')}</button></div>
            </div>
          </div>
        </APIProvider>
      )}

      {showDatePicker && ( <DateRangePickerModal initialStart={newStart} initialEnd={newEnd} onClose={() => setShowDatePicker(false)} onConfirm={(start, end) => { setNewStart(start); setNewEnd(end); setShowDatePicker(false); }} t={t} /> )}

      {offlinePreviewData && (
        <OfflineTripPreview
           summary={offlinePreviewData}
           isOnline={isOnline}
           onBack={() => setOfflinePreviewData(null)}
           onClearCache={async () => {
             const ok = await confirm({
               title: "清除此裝置的離線資料？",
               description: "只會刪除這台裝置的快取，不會刪除雲端旅程。",
               confirmText: "清除",
               cancelText: "取消"
             });
             if (ok) {
               const res = removeOfflineTripSnapshot(offlinePreviewData.roomId);
               if (res && res.ok) {
                 refreshOfflineCacheSummaries();
                 setOfflinePreviewData(null);
                 toast.info({ title: "已清除離線資料" });
               } else {
                 toast.info({
                   title: "清除離線快取失敗",
                   description: "儲存空間發生錯誤或已滿。"
                 });
               }
             }
           }}
           onOpenOnline={() => {
             if (isOnline) {
               const id = offlinePreviewData.roomId;
               setOfflinePreviewData(null);
               openTripRoom(id);
             }
           }}
        />
      )}
    </div>
    <OfflineBanner isOnline={isOnline} />
    {releaseExperience}
    </>
  );
}
