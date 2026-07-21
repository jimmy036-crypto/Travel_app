// TripDetail.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMapsLibrary, useMap, AdvancedMarker, Pin, Map } from '@vis.gl/react-google-maps';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import html2canvas from 'html2canvas-pro';

import {
  MemoViewModal,
  PlaceDetailsModal,
  EditItemModal,
  CopyItemModal,
  ExpenseModal,
  SettlementModal,
  FullscreenTicketModal,
  ChecklistModal,
  ExportItineraryModal,
  SearchBox,
  Directions
} from './components/UIComponents.jsx';
import { SyncStatusIndicator } from './components/SyncStatusIndicator.jsx';
import { AppSettingsMenu } from './components/AppSettingsMenu.jsx';
import { CURRENT_RELEASE_NOTES } from './config/releaseNotes.js';
import { EmptyState } from './components/ui/EmptyState.jsx';
import { SkeletonButton, SkeletonText } from './components/ui/Skeleton.jsx';

import { db, storage } from "./firebase";
import { ref as dbRef, onValue, update } from "firebase/database";
import {
  formatStayTime,
  generateId,
  getDayDisplay,
  getExploreIcon,
  getInclusiveDayCount,
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
import {
  calculateExpenseStats,
} from "./features/expenses/expenseCalculations";
import {
  cloneRouteItems,
  moveItineraryItem,
  recalculateArrivalTimes,
} from "./features/itinerary/itineraryCalculations";
import { useConfirm } from './components/ui/useConfirm.js';
import { useToast } from './components/ui/useToast.js';
import { usePlaceActions } from './features/places/usePlaceActions.js';
import { useExpenseActions } from './features/expenses/useExpenseActions.js';
import { ExpenseSection } from './features/expenses/ExpenseSection.jsx';
import { TicketEditorModal } from './features/tickets/TicketEditorModal.jsx';
import { TicketWalletSection } from './features/tickets/TicketWalletSection.jsx';
import { copyTicketOrderNumber } from './features/tickets/ticketClipboard.js';
import {
  clearTicketActiveMember,
  readTicketActiveMember,
  writeTicketActiveMember,
} from './features/tickets/ticketIdentity.js';
import { useTicketActions } from './features/tickets/useTicketActions.js';
import { persistItinerary } from './services/placesService.js';
import { buildOfflineTripSnapshot, writeOfflineTripSnapshot } from './features/offline/offlineTripCache.js';

const IS_FIREBASE_EMULATOR =
  import.meta.env.MODE === "emulator"
  || import.meta.env.VITE_USE_FIREBASE_EMULATOR === "true";




const PLACE_RESOURCE_META = Object.freeze({
  menu: { icon: '🍽️', label: '菜單' },
  reservation: { icon: '📅', label: '訂位' },
  article: { icon: '📝', label: '推薦文章' },
  official: { icon: '🌐', label: '官網' },
  social: { icon: '📱', label: '社群' },
  other: { icon: '🔗', label: '連結' },
});

const isImagePlaceResource = (resource) => (
  String(resource?.contentType || '').toLowerCase().startsWith('image/')
  || String(resource?.kind || '') === 'image'
);

const isPdfPlaceResource = (resource) => (
  String(resource?.contentType || '').toLowerCase() === 'application/pdf'
  || String(resource?.fileName || '').toLowerCase().endsWith('.pdf')
  || String(resource?.kind || '') === 'pdf'
);

const getPlaceResourceMeta = (resourceOrType) => {
  const resource = typeof resourceOrType === 'object' && resourceOrType !== null
    ? resourceOrType
    : { type: resourceOrType };
  const base = PLACE_RESOURCE_META[resource.type] || PLACE_RESOURCE_META.other;
  if (isImagePlaceResource(resource)) return { ...base, icon: '🖼️', label: `${base.label}圖片` };
  if (isPdfPlaceResource(resource)) return { ...base, icon: '📄', label: `${base.label} PDF` };
  return base;
};

const getPlaceNavigationUrl = (item) => {
  const customUrl = String(item?.navigationUrl || '').trim();
  if (/^https?:\/\//i.test(customUrl)) return customUrl;

  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const query = String(item?.customName || item?.name || '').trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : 'https://www.google.com/maps';
};


const getPlaceMapUrl = (item) => {
  const customUrl = String(item?.navigationUrl || '').trim();
  if (/^https?:\/\//i.test(customUrl)) return customUrl;

  const lat = Number(item?.lat);
  const lng = Number(item?.lng);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
  }

  const query = String(item?.address || item?.customName || item?.name || '').trim();
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : 'https://www.google.com/maps';
};


const PlacePhotoLightbox = ({ photo, onClose }) => {
  const photoUrl = String(photo?.url || '');
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const imageError = Boolean(photoUrl) && failedImageUrl === photoUrl;
  useEffect(() => {
    if (!photo) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [photo, onClose]);

  if (!photoUrl) return null;

  return (
    <div
      className="fixed inset-0 z-10040 flex items-center justify-center bg-slate-950/95 p-0 sm:p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`${String(photo.title || '景點照片')}預覽`}
      onClick={onClose}
    >
      <div
        className="relative flex h-full w-full max-w-6xl flex-col overflow-hidden bg-black sm:h-auto sm:max-h-[92dvh] sm:rounded-3xl sm:border sm:border-white/15 sm:shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-16 items-center gap-3 border-b border-white/10 bg-slate-950/90 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 text-white sm:px-5 sm:pt-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{String(photo.title || '景點參考照片')}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">留在 App 內查看，不會跳轉到外部網址</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-bold text-white active:scale-95"
            aria-label="關閉照片"
          >
            ✕
          </button>
        </div>

        <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black p-3 sm:p-5">
          {imageError ? (
            <div className="max-w-sm rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center text-white">
              <div className="text-4xl">🖼️</div>
              <p className="mt-3 text-sm font-black">照片載入失敗</p>
              <p className="mt-1 text-xs text-slate-300">檔案可能已移除，或目前網路連線不穩定。</p>
            </div>
          ) : (
            <img
              src={photoUrl}
              alt={String(photo.title || '景點參考照片')}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
              onError={() => setFailedImageUrl(photoUrl)}
            />
          )}
        </div>

        <div className="border-t border-white/10 bg-slate-950/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[10px] text-slate-400 sm:pb-3">
          點擊黑色背景或右上角即可關閉
        </div>
      </div>
    </div>
  );
};


const PlaceResourcesModal = ({ item, mode = 'menu', onClose }) => {
  const allResources = Array.isArray(item?.resources)
    ? item.resources.filter((resource) => resource?.url)
    : [];
  const resources = allResources.filter((resource) => (
    mode === 'menu' ? resource.type === 'menu' : resource.type !== 'menu'
  ));
  const imageResources = resources.filter(isImagePlaceResource);
  const externalResources = resources.filter((resource) => !isImagePlaceResource(resource));
  const [activeIndex, setActiveIndex] = useState(0);
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const [zoomState, setZoomState] = useState({ url: '', value: 1 });
  const touchStartXRef = useRef(null);

  const safeActiveIndex = Math.min(activeIndex, Math.max(0, imageResources.length - 1));
  const currentImage = imageResources[safeActiveIndex] || null;
  const currentImageUrl = String(currentImage?.url || '');
  const imageError = Boolean(currentImageUrl) && failedImageUrl === currentImageUrl;
  const zoom = zoomState.url === currentImageUrl ? zoomState.value : 1;
  const title = mode === 'menu' ? '菜單' : '景點資料';

  const updateZoom = (updater) => {
    setZoomState((previous) => {
      const currentValue = previous.url === currentImageUrl ? previous.value : 1;
      const nextValue = typeof updater === 'function' ? updater(currentValue) : updater;
      return { url: currentImageUrl, value: Number(nextValue) || 1 };
    });
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowLeft' && imageResources.length > 1) {
        setActiveIndex((index) => (index - 1 + imageResources.length) % imageResources.length);
      }
      if (event.key === 'ArrowRight' && imageResources.length > 1) {
        setActiveIndex((index) => (index + 1) % imageResources.length);
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [imageResources.length, onClose]);

  if (!item || resources.length === 0) return null;

  const goPrevious = () => {
    if (imageResources.length <= 1) return;
    setActiveIndex((index) => (index - 1 + imageResources.length) % imageResources.length);
  };

  const goNext = () => {
    if (imageResources.length <= 1) return;
    setActiveIndex((index) => (index + 1) % imageResources.length);
  };

  const handleTouchStart = (event) => {
    touchStartXRef.current = event.touches?.[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event) => {
    const startX = touchStartXRef.current;
    const endX = event.changedTouches?.[0]?.clientX ?? null;
    touchStartXRef.current = null;
    if (startX === null || endX === null || zoom > 1) return;
    const delta = endX - startX;
    if (Math.abs(delta) < 50) return;
    if (delta > 0) goPrevious();
    else goNext();
  };

  return (
    <div
      className="fixed inset-0 z-10020 flex items-end justify-center bg-slate-950/90 backdrop-blur-sm md:items-center md:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${title}檢視器`}
      onClick={onClose}
    >
      <div
        className="flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-slate-950 text-white shadow-2xl md:max-h-[92dvh] md:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-16 items-center gap-3 border-b border-white/10 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 md:px-5 md:pt-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black">{title}・{String(item.customName || item.name || '景點')}</p>
            <p className="mt-0.5 text-[10px] text-slate-400">
              {imageResources.length > 0 ? `${imageResources.length} 張圖片` : ''}
              {imageResources.length > 0 && externalResources.length > 0 ? '・' : ''}
              {externalResources.length > 0 ? `${externalResources.length} 個連結／文件` : ''}
            </p>
          </div>
          <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xl font-bold" aria-label="關閉">
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {currentImage ? (
            <div className="border-b border-white/10 bg-black">
              <div
                className="relative flex min-h-[46dvh] items-center justify-center overflow-auto p-3 md:min-h-[54dvh] md:p-5"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {imageError ? (
                  <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-6 text-center">
                    <div className="text-4xl">🖼️</div>
                    <p className="mt-3 text-sm font-black">圖片載入失敗</p>
                    <p className="mt-1 text-xs text-slate-300">請檢查網路，或重新上傳這張圖片。</p>
                  </div>
                ) : (
                  <img
                    src={currentImage.url}
                    alt={String(currentImage.title || title)}
                    className="max-h-[62dvh] max-w-full select-none object-contain transition-transform duration-150"
                    style={{ transform: `scale(${zoom})`, transformOrigin: 'center center' }}
                    draggable={false}
                    onDoubleClick={() => updateZoom((value) => value > 1 ? 1 : 2)}
                    onError={() => setFailedImageUrl(currentImageUrl)}
                  />
                )}

                {imageResources.length > 1 ? (
                  <>
                    <button type="button" onClick={goPrevious} className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-xl md:left-4" aria-label="上一張">‹</button>
                    <button type="button" onClick={goNext} className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/55 text-xl md:right-4" aria-label="下一張">›</button>
                  </>
                ) : null}

                <div className="absolute bottom-3 right-3 flex items-center overflow-hidden rounded-xl border border-white/15 bg-black/65 shadow-lg">
                  <button type="button" onClick={() => updateZoom((value) => Math.max(1, Number((value - 0.5).toFixed(1))))} disabled={zoom <= 1} className="flex h-10 w-10 items-center justify-center text-lg font-bold disabled:opacity-35" aria-label="縮小">−</button>
                  <button type="button" onClick={() => updateZoom(1)} className="h-10 min-w-14 border-x border-white/10 px-2 text-[10px] font-bold">{Math.round(zoom * 100)}%</button>
                  <button type="button" onClick={() => updateZoom((value) => Math.min(3, Number((value + 0.5).toFixed(1))))} disabled={zoom >= 3} className="flex h-10 w-10 items-center justify-center text-lg font-bold disabled:opacity-35" aria-label="放大">＋</button>
                </div>
              </div>

              <div className="border-t border-white/10 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 flex-1 truncate text-xs font-bold">{String(currentImage.title || `${title}圖片`)}</p>
                  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold text-slate-300">{safeActiveIndex + 1}/{imageResources.length}</span>
                </div>
                {imageResources.length > 1 ? (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {imageResources.map((resource, index) => (
                      <button
                        key={String(resource.id || resource.url)}
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        className={`h-14 w-20 shrink-0 overflow-hidden rounded-xl border-2 ${index === safeActiveIndex ? 'border-blue-400' : 'border-transparent opacity-60'}`}
                        aria-label={`查看第 ${index + 1} 張`}
                      >
                        <img src={resource.url} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {externalResources.length > 0 ? (
            <div className="space-y-2 p-4 md:p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                {mode === 'menu' ? '其他菜單來源' : '可開啟資料'}
              </p>
              {externalResources.map((resource) => {
                const meta = getPlaceResourceMeta(resource);
                return (
                  <button
                    key={String(resource.id || resource.url)}
                    type="button"
                    onClick={() => openExternalUrl(resource.url)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 text-left active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xl">{meta.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{String(resource.title || meta.label)}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">點擊後開啟{isPdfPlaceResource(resource) ? ' PDF' : '網頁'}</span>
                    </span>
                    <span className="text-slate-400">↗</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="border-t border-white/10 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[10px] text-slate-400 md:pb-3">
          圖片可左右滑動並放大；PDF、訂位與文章會使用外部瀏覽器開啟
        </div>
      </div>
    </div>
  );
};

const PlaceItemDetailModal = ({
  item,
  googlePlace,
  googleError,
  isFetchingGoogle,
  onLoadGoogle,
  onClose,
  onEdit,
  onViewMenu,
  onViewPhoto,
  t,
}) => {
  const [showGoogleSection, setShowGoogleSection] = useState(false);
  const [copiedLocation, setCopiedLocation] = useState(false);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!item) return null;

  const displayName = String(item.customName || item.name || '景點');
  const originalName = item.customName && item.name && item.customName !== item.name
    ? String(item.name)
    : '';
  const allResources = Array.isArray(item.resources)
    ? item.resources.filter((resource) => resource?.url)
    : [];
  const menuResources = allResources.filter((resource) => resource.type === 'menu');
  const nonMenuResources = allResources.filter((resource) => resource.type !== 'menu');
  const practicalResources = nonMenuResources.filter((resource) => (
    ['reservation', 'official', 'social'].includes(String(resource.type || ''))
    && !isImagePlaceResource(resource)
  ));
  const referenceImages = nonMenuResources.filter(isImagePlaceResource);
  const referenceResources = nonMenuResources.filter((resource) => (
    !isImagePlaceResource(resource)
    && !practicalResources.some((entry) => String(entry.id) === String(resource.id))
  ));
  const googlePhotos = Array.isArray(googlePlace?.photos) ? googlePlace.photos.slice(0, 4) : [];
  const googleReviews = Array.isArray(googlePlace?.reviews) ? googlePlace.reviews.slice(0, 3) : [];
  const address = String(item.address || googlePlace?.formatted_address || '').trim();
  const coordinates = isValidCoordinates(item.lat, item.lng)
    ? `${Number(item.lat).toFixed(6)}, ${Number(item.lng).toFixed(6)}`
    : '';
  const locationText = address || coordinates;
  const hasCustomNavigation = /^https?:\/\//i.test(String(item.navigationUrl || '').trim());

  const handleCopyLocation = async () => {
    if (!locationText) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(locationText);
      } else {
        window.prompt('請複製定位資訊', locationText);
      }
      setCopiedLocation(true);
      window.setTimeout(() => setCopiedLocation(false), 1600);
    } catch {
      window.prompt('請複製定位資訊', locationText);
    }
  };

  const handleToggleGoogle = () => {
    const nextOpen = !showGoogleSection;
    setShowGoogleSection(nextOpen);
    if (nextOpen && !googlePlace && !isFetchingGoogle) onLoadGoogle?.(item);
  };

  return (
    <div
      data-testid="place-detail-sheet"
      className="fixed inset-0 z-10010 flex items-end justify-center bg-slate-950/80 backdrop-blur-sm md:items-center md:p-5"
      role="dialog"
      aria-modal="true"
      aria-label={`${displayName}詳細資訊`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border shadow-2xl md:max-h-[92dvh] md:rounded-3xl ${t.modalBg} ${t.cardBorder}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`flex min-h-16 items-center gap-3 border-b px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl md:px-5 md:pt-3 ${t.cardBg} ${t.cardBorder}`}>
          <div className="min-w-0 flex-1">
            <h2 data-testid="place-detail-title" className={`truncate text-base font-black ${t.mainText}`}>{displayName}</h2>
            <div className={`mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-bold ${t.subText}`}>
              {item.time ? <span>🕒 {String(item.time)}</span> : null}
              {item.stayTime !== undefined ? <span>・{formatStayTime(item.stayTime)}</span> : null}
              {originalName ? <span className="truncate opacity-70">・{originalName}</span> : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-xl font-bold active:scale-95 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
            aria-label="關閉景點詳細資訊"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-hide">
          <section className="p-4 md:p-5">
            {item.placePhoto?.url ? (
              <button
                type="button"
                onClick={() => onViewPhoto?.({
                  url: String(item.placePhoto.url),
                  title: `${displayName} 封面照片`,
                })}
                className="group relative block aspect-video w-full overflow-hidden rounded-2xl border border-black/10 bg-slate-900 text-left shadow-sm active:scale-[0.995]"
                title="點擊放大封面照片"
              >
                <img
                  loading="lazy"
                  src={String(item.placePhoto.url)}
                  alt={`${displayName} 封面照片`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                />
                <span className="absolute left-3 top-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-black text-white backdrop-blur-sm">封面照片</span>
                <span className="absolute bottom-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-sm">點擊放大</span>
              </button>
            ) : (
              <div className={`flex aspect-16/7 w-full flex-col items-center justify-center rounded-2xl border border-dashed ${t.cardBg} ${t.cardBorder}`}>
                <span className="text-3xl">🖼️</span>
                <p className={`mt-2 text-xs font-black ${t.mainText}`}>尚未設定封面照片</p>
                <p className={`mt-1 text-[10px] ${t.subText}`}>可放店面、入口、集合點或代表餐點</p>
              </div>
            )}

            {(Array.isArray(item.tags) && item.tags.length > 0) ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {item.tags.map((tag, index) => (
                  <span key={`detail-tag-${index}`} className="rounded-md border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[9px] font-bold text-blue-600">
                    {String(tag)}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 px-4 pb-4 md:grid-cols-2 md:px-5 md:pb-5">
            <button
              type="button"
              onClick={() => menuResources.length > 0 ? onViewMenu?.(item) : onEdit?.()}
              className={`flex min-h-24 items-center gap-3 rounded-2xl border p-4 text-left active:scale-[0.99] ${menuResources.length > 0 ? 'border-orange-500/25 bg-orange-500/10' : `${t.cardBg} ${t.cardBorder}`}`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-2xl">🍽️</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-black ${menuResources.length > 0 ? 'text-orange-600' : t.mainText}`}>菜單</span>
                <span className={`mt-1 block text-[10px] ${t.subText}`}>
                  {menuResources.length > 0 ? `${menuResources.length} 筆圖片、PDF 或網址` : '尚未加入，點擊前往編輯'}
                </span>
              </span>
              <span className={menuResources.length > 0 ? 'text-orange-500' : t.subText}>›</span>
            </button>

            <div className={`min-h-24 rounded-2xl border p-4 ${t.cardBg} ${t.cardBorder}`}>
              <div className="flex items-start gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-2xl">📍</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black ${t.mainText}`}>定位資訊</p>
                  <p className={`mt-1 line-clamp-2 text-[10px] leading-relaxed ${t.subText}`}>
                    {locationText || '尚未儲存地址或座標'}
                  </p>
                  {hasCustomNavigation ? <p className="mt-1 text-[9px] font-bold text-emerald-600">已設定自訂導航點</p> : null}
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openExternalUrl(getPlaceMapUrl(item))}
                  className="min-h-10 flex-1 rounded-xl border border-blue-500/25 bg-blue-500/10 px-3 text-[10px] font-black text-blue-600 active:scale-95"
                >
                  查看定位
                </button>
                <button
                  type="button"
                  onClick={handleCopyLocation}
                  disabled={!locationText}
                  className={`min-h-10 flex-1 rounded-xl border px-3 text-[10px] font-black active:scale-95 disabled:opacity-40 ${t.cardBg} ${t.cardBorder} ${t.mainText}`}
                >
                  {copiedLocation ? '已複製' : '複製地址'}
                </button>
              </div>
            </div>
          </section>

          {item.memo ? (
            <section className="px-4 pb-4 md:px-5 md:pb-5">
              <div className={`rounded-2xl border p-4 ${t.cardBg} ${t.cardBorder}`}>
                <div className="mb-2 flex items-center gap-2">
                  <span>📝</span>
                  <h3 className={`text-xs font-black ${t.mainText}`}>行程筆記</h3>
                </div>
                <p data-testid="place-detail-note" className={`whitespace-pre-wrap wrap-break-word text-xs leading-relaxed ${t.mainText}`}>{String(item.memo)}</p>
              </div>
            </section>
          ) : null}

          {practicalResources.length > 0 ? (
            <section className="px-4 pb-4 md:px-5 md:pb-5">
              <h3 className={`mb-2 text-[10px] font-black uppercase tracking-wider ${t.subText}`}>實用連結</h3>
              <div className="space-y-2">
                {practicalResources.map((resource) => {
                  const meta = getPlaceResourceMeta(resource);
                  return (
                    <button
                      key={String(resource.id || resource.url)}
                      type="button"
                      onClick={() => openExternalUrl(resource.url)}
                      className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left active:scale-[0.99] ${t.cardBg} ${t.cardBorder}`}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 text-xl">{meta.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-sm font-bold ${t.mainText}`}>{String(resource.title || meta.label)}</span>
                        <span className={`mt-0.5 block text-[10px] ${t.subText}`}>{meta.label}</span>
                      </span>
                      <span className={t.subText}>↗</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null}

          {(referenceImages.length > 0 || referenceResources.length > 0) ? (
            <section className="px-4 pb-4 md:px-5 md:pb-5">
              <h3 className={`mb-2 text-[10px] font-black uppercase tracking-wider ${t.subText}`}>參考資料</h3>
              {referenceImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {referenceImages.map((resource) => (
                    <button
                      key={String(resource.id || resource.url)}
                      type="button"
                      onClick={() => onViewPhoto?.({ url: String(resource.url), title: String(resource.title || '參考照片') })}
                      className="relative aspect-4/3 overflow-hidden rounded-2xl border border-black/10 bg-slate-900 active:scale-[0.99]"
                    >
                      <img loading="lazy" src={String(resource.url)} alt={String(resource.title || '參考照片')} className="h-full w-full object-cover" />
                      <span className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-1.5 text-left text-[9px] font-bold text-white">{String(resource.title || '參考照片')}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {referenceResources.length > 0 ? (
                <div className={`${referenceImages.length > 0 ? 'mt-3' : ''} space-y-2`}>
                  {referenceResources.map((resource) => {
                    const meta = getPlaceResourceMeta(resource);
                    return (
                      <button
                        key={String(resource.id || resource.url)}
                        type="button"
                        onClick={() => openExternalUrl(resource.url)}
                        className={`flex min-h-13 w-full items-center gap-3 rounded-2xl border px-4 text-left active:scale-[0.99] ${t.cardBg} ${t.cardBorder}`}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-lg">{meta.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-xs font-bold ${t.mainText}`}>{String(resource.title || meta.label)}</span>
                          <span className={`mt-0.5 block text-[9px] ${t.subText}`}>{isPdfPlaceResource(resource) ? 'PDF 文件' : meta.label}</span>
                        </span>
                        <span className={t.subText}>↗</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="px-4 pb-5 md:px-5">
            <button
              type="button"
              onClick={handleToggleGoogle}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 text-left active:scale-[0.99] ${t.cardBg} ${t.cardBorder}`}
              aria-expanded={showGoogleSection}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-xl">⭐</span>
              <span className="min-w-0 flex-1">
                <span className={`block text-sm font-black ${t.mainText}`}>Google 評價與參考照片</span>
                <span className={`mt-0.5 block text-[10px] ${t.subText}`}>較少使用，展開時才載入</span>
              </span>
              <span className={`transition-transform ${showGoogleSection ? 'rotate-180' : ''} ${t.subText}`}>⌄</span>
            </button>

            {showGoogleSection ? (
              <div className={`mt-2 rounded-2xl border p-4 ${t.cardBg} ${t.cardBorder}`}>
                {isFetchingGoogle ? (
                  <div className="py-8 text-center">
                    <div className="text-2xl animate-pulse">⭐</div>
                    <p className="mt-2 text-xs font-bold text-blue-500">讀取 Google 資訊中…</p>
                  </div>
                ) : googleError ? (
                  <div className="py-5 text-center">
                    <p className="text-xs font-black text-red-500">{String(googleError)}</p>
                    <button type="button" onClick={() => onLoadGoogle?.(item)} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-bold text-white">重新載入</button>
                  </div>
                ) : googlePlace ? (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      {googlePlace.rating ? <span className="rounded-lg border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-xs font-black text-orange-600">⭐ {String(googlePlace.rating)}</span> : null}
                      {googlePlace.user_ratings_total ? <span className={`text-[10px] font-bold ${t.subText}`}>{String(googlePlace.user_ratings_total)} 則評論</span> : null}
                      {googlePlace.opening_hours?.open_now !== undefined ? (
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-bold ${googlePlace.opening_hours.open_now ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-500'}`}>
                          {googlePlace.opening_hours.open_now ? '營業中' : '目前休息'}
                        </span>
                      ) : null}
                    </div>

                    {googlePhotos.length > 0 ? (
                      <div>
                        <p className={`mb-2 text-[10px] font-black ${t.subText}`}>參考照片</p>
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                          {googlePhotos.map((photo, index) => {
                            const photoUrl = photo.getUrl({ maxWidth: 900, maxHeight: 700 });
                            return (
                              <button
                                key={`google-photo-${index}`}
                                type="button"
                                onClick={() => onViewPhoto?.({ url: photoUrl, title: `${displayName} Google 參考照片 ${index + 1}` })}
                                className="h-24 w-36 shrink-0 overflow-hidden rounded-xl border border-black/10 bg-slate-900 active:scale-[0.99]"
                              >
                                <img src={photoUrl} alt="Google 參考照片" className="h-full w-full object-cover" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {googleReviews.length > 0 ? (
                      <div>
                        <p className={`mb-2 text-[10px] font-black ${t.subText}`}>近期評論摘要</p>
                        <div className="space-y-2">
                          {googleReviews.map((review, index) => (
                            <div key={`google-review-${index}`} className={`rounded-xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
                              <div className="flex items-center justify-between gap-3">
                                <p className={`truncate text-[10px] font-black ${t.mainText}`}>{String(review.author_name || 'Google 使用者')}</p>
                                <span className="shrink-0 text-[10px] text-orange-500">⭐ {String(review.rating || '')}</span>
                              </div>
                              {review.text ? <p className={`mt-1 line-clamp-3 text-[10px] leading-relaxed ${t.subText}`}>{String(review.text)}</p> : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {googlePlace.url ? (
                      <button type="button" onClick={() => openExternalUrl(googlePlace.url)} className="w-full rounded-xl border border-blue-500/25 bg-blue-500/10 py-2.5 text-[10px] font-black text-blue-600">
                        在 Google Maps 查看完整資訊 ↗
                      </button>
                    ) : null}

                    {googlePhotos.length === 0 && googleReviews.length === 0 && !googlePlace.rating ? (
                      <p className={`py-4 text-center text-xs ${t.subText}`}>Google 沒有回傳可顯示的評論或照片。</p>
                    ) : null}
                  </div>
                ) : (
                  <div className="py-5 text-center">
                    <p className={`text-xs ${t.subText}`}>尚未載入 Google 資訊。</p>
                    <button type="button" onClick={() => onLoadGoogle?.(item)} className="mt-3 rounded-xl bg-blue-600 px-4 py-2 text-[10px] font-bold text-white">載入</button>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>

        <div className={`flex gap-2 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5 md:pb-3 ${t.cardBg} ${t.cardBorder}`}>
          <button type="button" onClick={onClose} className={`min-h-11 flex-1 rounded-xl border text-xs font-bold ${t.cardBg} ${t.cardBorder} ${t.mainText}`}>關閉</button>
          <button type="button" data-testid="place-detail-edit-button" onClick={onEdit} className="min-h-11 flex-1 rounded-xl bg-blue-600 text-xs font-black text-white shadow-md active:scale-95">✏️ 編輯景點</button>
        </div>
      </div>
    </div>
  );
};

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

const REMOTE_UPDATE_VISIBLE_MS = 2500;
const LOCAL_WRITE_SUPPRESSION_MS = 1500;

const hasDirtyBranches = (dirtyBranchesRef) => (
  Object.values(dirtyBranchesRef.current || {}).some(Boolean)
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
  const safeItinerary = /** @type {Record<string, any[]>} */ ({});

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


const useRoomBranchSync = ({
  roomId,
  branch,
  value,
  dirtyBranchesRef,
  writeVersionRef,
  lastLocalWriteAtRef,
  setSyncStatus,
}) => {
  useEffect(() => {
    if (!db || !roomId || value === null || !dirtyBranchesRef.current[branch]) return undefined;

    const version = (writeVersionRef.current[branch] || 0) + 1;
    writeVersionRef.current[branch] = version;
    lastLocalWriteAtRef.current = Date.now();
    setSyncStatus("saving");

    const timer = window.setTimeout(() => {
      const writeBranch = async () => {
        try {
          if (branch === 'itinerary') {
            await persistItinerary({ db, roomId, itinerary: value });
          } else {
            await update(dbRef(db, `rooms/${roomId}`), { [branch]: value });
          }
          if (writeVersionRef.current[branch] === version) {
            dirtyBranchesRef.current[branch] = false;
            lastLocalWriteAtRef.current = Date.now();
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
  }, [branch, dirtyBranchesRef, lastLocalWriteAtRef, roomId, setSyncStatus, value, writeVersionRef]);
};

const PRE_TRIP_ID = "PRE_TRIP";
const PLACE_ACTION_MENU_WIDTH = 176;
const PLACE_ACTION_MENU_ESTIMATED_HEIGHT = 232;
const PLACE_ACTION_MENU_MARGIN = 12;
const PLACE_ACTION_MENU_GAP = 8;

const TripDetailSkeleton = ({
  t,
  tripThemeColor,
  onBack,
  onOpenReleaseNotes,
  onStartFeatureTour,
  onCheckUpdates,
  isCheckingUpdates,
  onOpenAppearance,
}) => (
  <div
    data-testid="trip-detail-skeleton"
    style={{ backgroundColor: tripThemeColor }}
    className={`fixed inset-0 flex flex-col font-sans overflow-hidden overscroll-none transition-colors duration-500 w-full max-w-[100vw] ${t.mainText}`}
  >
    <div className="flex-1 flex overflow-hidden">
      <div className={`flex w-full flex-col border-r md:w-2/3 lg:w-1/2 ${t.sidebarBg} ${t.cardBorder}`}>
        <div className={`relative z-40 shrink-0 border-b p-4 shadow-md backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onBack}
                  className={`mr-2 font-bold transition-opacity hover:opacity-70 ${t.subText}`}
                >
                  ◀ 返回
                </button>
                <SkeletonText lines={1} className="w-40 md:w-56" />
              </div>
              <SkeletonText lines={1} className="mt-2 w-56 md:w-72" />
            </div>
            <AppSettingsMenu
              key="trip-skeleton-settings"
              t={t}
              version={CURRENT_RELEASE_NOTES.version}
              onOpenAppearance={onOpenAppearance}
              onOpenReleaseNotes={onOpenReleaseNotes}
              onStartFeatureTour={onStartFeatureTour}
              onCheckUpdates={onCheckUpdates}
              isCheckingUpdates={isCheckingUpdates}
            />
          </div>
        </div>

        <div className={`md:hidden shrink-0 border-b px-4 py-3 ${t.headerBg} ${t.cardBorder}`}>
          <div className="flex gap-2 overflow-hidden">
            <SkeletonButton className="h-11 w-20 shrink-0" />
            <SkeletonButton className="h-11 w-20 shrink-0" />
            <SkeletonButton className="h-11 w-20 shrink-0" />
          </div>
        </div>

        <div className="scrollbar-hide flex-1 overflow-hidden p-4">
          <div
            data-testid="itinerary-skeleton-day"
            className={`min-w-85 max-w-85 rounded-3xl border-2 p-4 backdrop-blur-md ${t.cardBg} ${t.cardBorder}`}
            aria-hidden="true"
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <SkeletonText lines={2} className="w-52" />
              </div>
              <SkeletonButton className="h-8 w-24 shrink-0" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`itinerary-skeleton-place-${index}`}
                  data-testid="itinerary-skeleton-place"
                  className={`rounded-2xl border p-4 shadow-sm ${t.itemBg} ${t.cardBorder}`}
                >
                  <div className="flex gap-4">
                    <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-300/60 dark:bg-slate-700/60 motion-safe:animate-pulse" />
                    <div className="min-w-0 flex-1">
                      <SkeletonText lines={2} />
                      <div className="mt-3 flex gap-2">
                        <div className="h-5 w-16 rounded-full bg-slate-300/60 dark:bg-slate-700/60 motion-safe:animate-pulse" />
                        <div className="h-5 w-20 rounded-full bg-slate-300/60 dark:bg-slate-700/60 motion-safe:animate-pulse" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={`hidden flex-1 md:block ${t.mapBg}`} aria-hidden="true" />
    </div>
  </div>
);

const TripDetail = ({
  roomId,
  onBack,
  onUpdateTripMeta,
  onOpenReleaseNotes,
  onStartFeatureTour,
  onCheckUpdates,
  isCheckingUpdates,
  onTourAvailabilityChange,
  isOnline = true,
}) => {
  const confirm = useConfirm();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(true);

  const [meta, setMetaState] = useState(/** @type {any} */ (null));

  const [itinerary, setItineraryState] = useState(
    /** @type {Record<string, any[]>} */ ({ "Day 1": [] })
  );

  const [expenses, setExpensesState] = useState(/** @type {any[]} */ ([]));
  const [settlements, setSettlementsState] = useState(/** @type {any[]} */ ([]));
  const [tickets, setTicketsState] = useState(/** @type {any[]} */ ([]));
  const [checklistItems, setChecklistItemsState] = useState(/** @type {any[]} */ ([]));

  const [syncStatus, setSyncStatus] = useState("idle");
  const [loadError, setLoadError] = useState("");
  const dirtyBranchesRef = useRef({ meta: false, itinerary: false, expenses: false, settlements: false, tickets: false });
  const writeVersionRef = useRef({ meta: 0, itinerary: 0, expenses: 0, settlements: 0, tickets: 0 });
  const hasLoadedRoomRef = useRef(false);
  const lastLocalWriteAtRef = useRef(0);
  const remoteUpdateTimerRef = useRef(null);
  const checklistWriteVersionRef = useRef(0);
  const placeDeleteConfirmRef = useRef(false);
  const expenseDeleteConfirmRef = useRef(false);
  const ticketMutationRef = useRef(false);
  const ticketLoadedRoomRef = useRef('');

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

  const [currentDay, setCurrentDay] = useState("Day 1");
  const [activeTab, setActiveTab] = useState("plan");

  const [editingItemData, setEditingItemData] = useState(/** @type {any} */ (null));
  const [viewingMemoItem, setViewingMemoItem] = useState(/** @type {any} */ (null));
  const [copyingItem, setCopyingItem] = useState(/** @type {any} */ (null));
  const [activePlaceActionMenu, setActivePlaceActionMenu] = useState(
    /** @type {{id: string, dayId: string, item: any, top: number, left: number, width: number, placement: 'top' | 'bottom'} | null} */ (null)
  );
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(/** @type {any} */ (null));
  const [ticketEditorState, setTicketEditorState] = useState(
    /** @type {{mode: 'create' | 'edit', ticket: any | null} | null} */ (null)
  );
  const [ticketActiveMember, setTicketActiveMember] = useState('');
  const [showChecklistModal, setShowChecklistModal] = useState(false);
  const [checklistActor, setChecklistActorState] = useState(() => {
    try {
      return localStorage.getItem(`travel-checklist-actor-${roomId}`) || '';
    } catch {
      return '';
    }
  });
  const [fullscreenTicket, setFullscreenTicket] = useState(/** @type {any} */ (null));
  const [viewingPlacePhoto, setViewingPlacePhoto] = useState(
    /** @type {{url: string, title: string} | null} */ (null)
  );
  const [viewingPlaceResources, setViewingPlaceResources] = useState(
    /** @type {{item: any, mode: 'menu' | 'all'} | null} */ (null)
  );
  const [viewingPlaceDetail, setViewingPlaceDetail] = useState(
    /** @type {{dayId: string, item: any} | null} */ (null)
  );
  const [savedPlaceGoogleDetails, setSavedPlaceGoogleDetails] = useState(null);
  const [savedPlaceGoogleError, setSavedPlaceGoogleError] = useState('');
  const [isFetchingSavedPlaceGoogle, setIsFetchingSavedPlaceGoogle] = useState(false);
  const [routeDurations, setRouteDurations] = useState(
    /** @type {Record<string, any>} */ ({})
  );
  const pendingTimeRecalculationRef = useRef({});
  const [timeRecalculationDays, setTimeRecalculationDays] = useState({});
  const activePlaceActionMenuRef = useRef(null);
  const ignorePlaceActionScrollRef = useRef(false);
  const placeActionTriggerRefs = useRef({});
  const tripAppearanceInputRef = useRef(null);

  const placesLib = useMapsLibrary('places');
  const [exploreQuery, setExploreQuery] = useState("");

  const [exploreResults, setExploreResults] = useState(/** @type {any[]} */ ([]));
  const [selectedExploreItem, setSelectedExploreItem] = useState(/** @type {any} */ (null));
  const [exploreOriginItem, setExploreOriginItem] = useState(/** @type {any} */ (null));
  const [detailedPlace, setDetailedPlace] = useState(/** @type {any} */ (null));

  const [isFetchingDetails, setIsFetchingDetails] = useState(false);
  const [isSavedItemModal, setIsSavedItemModal] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationPreview, setOptimizationPreview] = useState(null);
  const [optimizationSummaries, setOptimizationSummaries] = useState({});
  const [backupItin, setBackupItin] = useState(/** @type {any} */ (null));

  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [weatherInfo, setWeatherInfo] = useState(
    /** @type {Record<string, {temp: string, rain: number}>} */ ({})
  );


  const routesLib = useMapsLibrary('routes');
  const map = useMap('main-map');

  useEffect(() => {
    let cancelled = false;

    ticketLoadedRoomRef.current = '';
    dirtyBranchesRef.current = { meta: false, itinerary: false, expenses: false, settlements: false, tickets: false };
    writeVersionRef.current = { meta: 0, itinerary: 0, expenses: 0, settlements: 0, tickets: 0 };
    hasLoadedRoomRef.current = false;
    lastLocalWriteAtRef.current = 0;
    checklistWriteVersionRef.current = 0;
    if (remoteUpdateTimerRef.current) {
      window.clearTimeout(remoteUpdateTimerRef.current);
      remoteUpdateTimerRef.current = null;
    }

    queueMicrotask(() => {
      if (cancelled) return;
      setLoadError("");
      setIsLoading(true);
      setSyncStatus("idle");
    });

    if (!db || !roomId) {
      queueMicrotask(() => {
        if (cancelled) return;
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
        ticketLoadedRoomRef.current = roomId;
        setIsLoading(false);
        setSyncStatus("saved");
      });
      return () => {
        cancelled = true;
      };
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
        const loadedMeta = normalizeMeta(data['meta']);
        const loadedItinerary = normalizeItinerary(data['itinerary'], loadedMeta);
        const loadedExpenses = toSafeList(data['expenses']);
        const loadedSettlements = toSafeList(data['settlements']);
        const loadedTickets = toSafeList(data['tickets']);
        const loadedChecklist = normalizeChecklist(data['checklist']);
        ticketLoadedRoomRef.current = roomId;

        if (!dirtyBranchesRef.current.meta) setMetaState(loadedMeta);
        if (!dirtyBranchesRef.current.itinerary) setItineraryState(loadedItinerary);
        if (!dirtyBranchesRef.current.expenses) setExpensesState(loadedExpenses);
        if (!dirtyBranchesRef.current.settlements) setSettlementsState(loadedSettlements);
        if (!dirtyBranchesRef.current.tickets) setTicketsState(loadedTickets);
        setChecklistItemsState(loadedChecklist);

        if (!hasLoadedRoomRef.current) {
          hasLoadedRoomRef.current = true;
          setSyncStatus("saved");
        } else if (!hasDirtyBranches(dirtyBranchesRef)) {
          const isRecentLocalWrite = Date.now() - lastLocalWriteAtRef.current < LOCAL_WRITE_SUPPRESSION_MS;

          if (isRecentLocalWrite) {
            setSyncStatus((currentStatus) => (
              currentStatus === "saving" ? currentStatus : "saved"
            ));
          } else {
            setSyncStatus("remote-updated");
            if (remoteUpdateTimerRef.current) {
              window.clearTimeout(remoteUpdateTimerRef.current);
            }
            remoteUpdateTimerRef.current = window.setTimeout(() => {
              setSyncStatus((currentStatus) => (
                currentStatus === "remote-updated" ? "saved" : currentStatus
              ));
              remoteUpdateTimerRef.current = null;
            }, REMOTE_UPDATE_VISIBLE_MS);
          }
        }

        setIsLoading(false);
      },
      (error) => {
        console.error("Load room failed:", error);
        setSyncStatus("error");
        setLoadError("旅程載入失敗，請檢查網路連線或 Firebase 權限。");
        setIsLoading(false);
      }
    );

    return () => {
      cancelled = true;
      if (remoteUpdateTimerRef.current) {
        window.clearTimeout(remoteUpdateTimerRef.current);
        remoteUpdateTimerRef.current = null;
      }
      unsubscribe();
    };
  }, [roomId]);

  useRoomBranchSync({
    roomId,
    branch: "meta",
    value: meta,
    dirtyBranchesRef,
    writeVersionRef,
    lastLocalWriteAtRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "itinerary",
    value: itinerary,
    dirtyBranchesRef,
    writeVersionRef,
    lastLocalWriteAtRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "expenses",
    value: expenses,
    dirtyBranchesRef,
    writeVersionRef,
    lastLocalWriteAtRef,
    setSyncStatus,
  });
  useRoomBranchSync({
    roomId,
    branch: "settlements",
    value: settlements,
    dirtyBranchesRef,
    writeVersionRef,
    lastLocalWriteAtRef,
    setSyncStatus,
  });
  useEffect(() => {
    if (meta && roomId) onUpdateTripMeta?.(roomId, meta);
  }, [meta, onUpdateTripMeta, roomId]);

  useEffect(() => {
    activePlaceActionMenuRef.current = activePlaceActionMenu;
  }, [activePlaceActionMenu]);

  const getPlaceActionMenuPosition = useCallback((trigger) => {
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 390;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 844;
    const width = Math.min(
      PLACE_ACTION_MENU_WIDTH,
      Math.max(0, viewportWidth - (PLACE_ACTION_MENU_MARGIN * 2)),
    );
    const maxLeft = viewportWidth - width - PLACE_ACTION_MENU_MARGIN;
    const left = Math.min(
      Math.max(PLACE_ACTION_MENU_MARGIN, rect.right - width),
      Math.max(PLACE_ACTION_MENU_MARGIN, maxLeft),
    );
    const bottomTop = rect.bottom + PLACE_ACTION_MENU_GAP;
    const hasRoomBelow = bottomTop + PLACE_ACTION_MENU_ESTIMATED_HEIGHT <= viewportHeight - PLACE_ACTION_MENU_MARGIN;
    const topPlacement = rect.top - PLACE_ACTION_MENU_ESTIMATED_HEIGHT - PLACE_ACTION_MENU_GAP;
    const top = hasRoomBelow
      ? bottomTop
      : Math.max(
        PLACE_ACTION_MENU_MARGIN,
        Math.min(topPlacement, viewportHeight - PLACE_ACTION_MENU_ESTIMATED_HEIGHT - PLACE_ACTION_MENU_MARGIN),
      );

    return {
      top,
      left,
      width,
      placement: hasRoomBelow ? 'bottom' : 'top',
    };
  }, []);

  const closePlaceActionMenu = useCallback(({ restoreFocus = false } = {}) => {
    const currentMenu = activePlaceActionMenuRef.current;
    ignorePlaceActionScrollRef.current = false;
    setActivePlaceActionMenu(null);

    if (restoreFocus && currentMenu?.id) {
      window.requestAnimationFrame(() => {
        placeActionTriggerRefs.current[currentMenu.id]?.focus?.();
      });
    }
  }, []);

  const openPlaceActionMenu = useCallback((event, dayId, item) => {
    event.preventDefault();
    event.stopPropagation();

    const menuId = `${String(dayId)}-${String(item?.id || item?.place_id || item?.name || '')}`;
    if (activePlaceActionMenuRef.current?.id === menuId) {
      closePlaceActionMenu();
      return;
    }

    const trigger = event.currentTarget;
    ignorePlaceActionScrollRef.current = true;
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        ignorePlaceActionScrollRef.current = false;
      });
    });
    setActivePlaceActionMenu({
      id: menuId,
      dayId: String(dayId),
      item,
      ...getPlaceActionMenuPosition(trigger),
    });
  }, [closePlaceActionMenu, getPlaceActionMenuPosition]);

  const handleItineraryWheel = useCallback((event) => {
    const deltaX = Number(event.deltaX || 0);
    const deltaY = Number(event.deltaY || 0);
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (event.shiftKey && absY > 0) {
      event.preventDefault();
      event.currentTarget.scrollBy({ left: deltaY, behavior: 'auto' });
      return;
    }

    if (absX > absY && absX > 0) {
      event.preventDefault();
      event.currentTarget.scrollBy({ left: deltaX, behavior: 'auto' });
    }
  }, []);

  const focusPlaceSearchInput = useCallback((dayId) => {
    if (typeof document === 'undefined') return;
    const targetDayId = String(dayId);
    const input = Array.from(document.querySelectorAll('[data-testid="place-search-input"]'))
      .find((node) => node instanceof HTMLElement && node.dataset.dayId === targetDayId);

    input?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    input?.focus?.();
  }, []);

  useEffect(() => {
    if (!activePlaceActionMenu) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('[data-testid="place-action-menu"]')
        || target.closest('[data-testid="place-action-menu-trigger"]')
      ) {
        return;
      }

      closePlaceActionMenu();
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closePlaceActionMenu({ restoreFocus: true });
      }
    };

    const handleLayoutChange = () => closePlaceActionMenu();
    const handleScroll = () => {
      if (ignorePlaceActionScrollRef.current) return;
      closePlaceActionMenu();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('orientationchange', handleLayoutChange);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('orientationchange', handleLayoutChange);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [activePlaceActionMenu, closePlaceActionMenu]);

  useEffect(() => {
    closePlaceActionMenu();
  }, [activeTab, closePlaceActionMenu, copyingItem, currentDay, editingItemData, viewingPlaceDetail]);

  const existingDays = useMemo(() => sortDayIds(Object.keys(itinerary)), [itinerary]);
  useEffect(() => {
    if (typeof onTourAvailabilityChange !== 'function') return undefined;

    const availability = {
      roomId,
      ready: !isLoading && Boolean(meta) && !loadError,
      blockingEditor: Boolean(
        editingItemData
        || copyingItem
        || showExpenseModal
        || ticketEditorState
        || showChecklistModal
      ),
      failed: Boolean(loadError),
    };

    const frameId = window.requestAnimationFrame(() => {
      onTourAvailabilityChange(availability);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [
    copyingItem,
    editingItemData,
    isLoading,
    loadError,
    meta,
    onTourAvailabilityChange,
    roomId,
    showChecklistModal,
    showExpenseModal,
    ticketEditorState,
  ]);

  const safeCurrentDay = existingDays.includes(currentDay) ? currentDay : (existingDays[0] || "Day 1");
  const handleDaySwitch = useCallback((dayId, event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    const nextDayId = String(dayId);

    closePlaceActionMenu();
    setCurrentDay(nextDayId);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`day-card-${nextDayId}`)
        ?.scrollIntoView?.({ block: 'nearest', inline: 'start', behavior: 'auto' });
    });
  }, [closePlaceActionMenu]);

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
          if (!geoRes.ok) {
            console.warn(`Geocoding failed: ${geoRes.status}`);
            return;
          }
          const geoData = await geoRes.json();
          const geoResults = Array.isArray(geoData?.results) ? geoData.results : [];
          if (geoResults.length === 0) return;
          latitude = Number(geoResults[0]?.latitude);
          longitude = Number(geoResults[0]?.longitude);
        }

        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`,
          { signal: controller.signal }
        );
        if (!weatherRes.ok) {
          console.warn(`Weather failed: ${weatherRes.status}`);
          return;
        }

        const weatherData = await weatherRes.json();
        const daily = weatherData && typeof weatherData === 'object'
          ? weatherData['daily']
          : null;
        if (!daily || typeof daily !== 'object') return;

        const dailyTimes = Array.isArray(daily['time']) ? daily['time'] : [];
        const dailyMinTemps = Array.isArray(daily['temperature_2m_min']) ? daily['temperature_2m_min'] : [];
        const dailyMaxTemps = Array.isArray(daily['temperature_2m_max']) ? daily['temperature_2m_max'] : [];
        const dailyRain = Array.isArray(daily['precipitation_probability_max']) ? daily['precipitation_probability_max'] : [];
        const newWeatherMap = /** @type {Record<string, {temp: string, rain: number}>} */ ({});
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

          const index = dailyTimes.indexOf(dateIso);
          if (index === -1) return;

          newWeatherMap[dayId] = {
            temp: `${Math.round(Number(dailyMinTemps[index]) || 0)}~${Math.round(Number(dailyMaxTemps[index]) || 0)}°C`,
            rain: Number(dailyRain[index]) || 0,
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

  const membersList = useMemo(() => normalizeMembers(meta?.members), [meta]);

  useEffect(() => {
    if (isLoading || !meta || ticketLoadedRoomRef.current !== roomId) return;
    const storedMember = readTicketActiveMember({ roomId, members: membersList });
    if (!storedMember) clearTicketActiveMember(roomId);
    setTicketActiveMember((current) => (current === storedMember ? current : storedMember));
  }, [isLoading, membersList, meta, roomId]);

  const closeTicketEditor = useCallback(() => setTicketEditorState(null), []);

  const {
    saveTicket,
    deleteTicket,
    isSavingTicket,
    deletingTicketId,
    uploadProgress,
  } = useTicketActions({
    room: { db, roomId, storage },
    data: { tickets, members: membersList },
    state: { setTicketsState, setSyncStatus },
    refs: { dirtyBranchesRef, lastLocalWriteAtRef, ticketMutationRef },
    feedback: { confirm, toast },
    callbacks: { closeTicketEditor },
  });

  const handleSelectTicketActiveMember = useCallback((member) => {
    const normalizedMember = String(member || '').trim();
    if (!normalizedMember) {
      clearTicketActiveMember(roomId);
      setTicketActiveMember('');
      return;
    }
    if (writeTicketActiveMember({ roomId, member: normalizedMember, members: membersList })) {
      setTicketActiveMember(normalizedMember);
    }
  }, [membersList, roomId]);

  const handleCopyTicketOrderNumber = useCallback(async (orderNumber) => {
    try {
      await copyTicketOrderNumber(orderNumber);
      toast.success({ title: '訂單編號已複製' });
    } catch {
      toast.error({ title: '無法複製訂單編號' });
    }
  }, [toast]);

  const openNewTicket = useCallback(() => {
    if (isSavingTicket) return;
    setTicketEditorState({ mode: 'create', ticket: null });
  }, [isSavingTicket]);

  const openTicketEditor = useCallback((ticket) => {
    if (isSavingTicket) return;
    setTicketEditorState({ mode: 'edit', ticket });
  }, [isSavingTicket]);

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

  const { saveExpense: handleSaveExpense, deleteExpense: handleDeleteExpense } = useExpenseActions({
    room: { db, roomId },
    data: { expenses },
    state: { setExpensesState, setSyncStatus },
    refs: { dirtyBranchesRef, lastLocalWriteAtRef, expenseDeleteConfirmRef },
    feedback: { confirm, toast },
    callbacks: { closeExpenseEditor },
  });

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

  const expenseStats = useMemo(() => calculateExpenseStats({
    expenses,
    settlements,
    members: membersList,
    existingDays,
    preTripId: PRE_TRIP_ID,
  }), [existingDays, expenses, membersList, settlements]);


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

    const moveResult = moveItineraryItem({
      itinerary,
      sourceDay: source.droppableId,
      destinationDay: destination.droppableId,
      sourceIndex: source.index,
      destinationIndex: destination.index,
    });

    if (!moveResult.ok || moveResult.noop) return;

    const {
      nextItinerary,
      affectedDays,
      pendingRecalculations,
    } = moveResult;

    affectedDays.forEach((dayId) => {
      const pending = pendingRecalculations[dayId];
      if (pending) pendingTimeRecalculationRef.current[dayId] = pending;
      else delete pendingTimeRecalculationRef.current[dayId];
    });

    setBackupItin(null);
    clearOptimizationSummary(...affectedDays);
    setRouteDurations((previous) => {
      const next = { ...previous };
      affectedDays.forEach((dayId) => { delete next[dayId]; });
      return next;
    });
    setTimeRecalculationDays((previous) => {
      const next = { ...previous };
      affectedDays.forEach((dayId) => {
        if ((nextItinerary[dayId] || []).length > 1) next[dayId] = true;
        else delete next[dayId];
      });
      return next;
    });
    setItinerary(nextItinerary);
  }, [clearOptimizationSummary, itinerary, setItinerary]);

  const handleRouteCalculated = useCallback((day, durations) => {
    setRouteDurations((previous) => (
      JSON.stringify(previous[day]) !== JSON.stringify(durations)
        ? { ...previous, [day]: durations }
        : previous
    ));

    const pending = pendingTimeRecalculationRef.current[day];
    if (!pending) return;

    setItinerary((previous) => {
      const currentItems = Array.isArray(previous[day]) ? previous[day] : [];
      const recalculatedItems = recalculateArrivalTimes(currentItems, durations, pending.anchorTime);
      return { ...previous, [day]: recalculatedItems };
    });

    delete pendingTimeRecalculationRef.current[day];
    setTimeRecalculationDays((previous) => {
      if (!previous[day]) return previous;
      const next = { ...previous };
      delete next[day];
      return next;
    });
  }, [setItinerary]);

  const resetExploreState = useCallback(() => {
    setSelectedExploreItem(null);
    setDetailedPlace(null);
    setExploreResults([]);
    setExploreQuery("");
    setExploreOriginItem(null);
  }, []);

  const {
    addPlaceFromSearch: handleAddPlaceFromSearch,
    addExplorePlace: handleAddExploreToItinerary,
    saveEditedItem,
    deleteItineraryItem: handleDeleteItineraryItem,
  } = usePlaceActions({
    room: {
      db,
      roomId,
      storage,
    },
    data: {
      itinerary,
      currentDay: safeCurrentDay,
      editingItemData,
      exploreOriginItem,
      routeDurations,
    },
    state: {
      setItinerary,
      setItineraryState,
      setEditingItemData,
      setBackupItin,
      setSyncStatus,
    },
    refs: {
      dirtyBranchesRef,
      lastLocalWriteAtRef,
      placeDeleteConfirmRef,
    },
    feedback: {
      confirm,
      toast,
    },
    callbacks: {
      clearOptimizationSummary,
      resetExploreState,
      setActiveTab,
    },
  });

  const handleCopyItem = (targetDay, item) => {
    clearOptimizationSummary(targetDay);
    setItinerary(prev => {
      const dayList = [...(prev[String(targetDay)] || [])];
      const newItem = {
        ...item,
        id: generateId(),
        time: "",
        resources: Array.isArray(item.resources)
          ? item.resources
              .filter((resource) => !isPdfPlaceResource(resource) && !resource?.storagePath)
              .map((resource) => ({ ...resource, id: generateId() }))
          : [],
        placePhoto: null,
      };
      dayList.push(newItem);
      return { ...prev, [String(targetDay)]: dayList };
    });
    setCopyingItem(null);
    alert(`✅ 已將「${item.customName || item.name}」複製到 ${targetDay}！`);
  };

  const commitChecklistPatch = useCallback((patch) => {
    if (!db || !roomId || !patch || Object.keys(patch).length === 0) return;

    const version = checklistWriteVersionRef.current + 1;
    checklistWriteVersionRef.current = version;
    lastLocalWriteAtRef.current = Date.now();
    setSyncStatus('saving');

    void update(dbRef(db, `rooms/${roomId}/checklist`), patch)
      .then(() => {
        if (checklistWriteVersionRef.current === version) {
          lastLocalWriteAtRef.current = Date.now();
          setSyncStatus('saved');
        }
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
  }, [meta, roomId]);

  const handleExploreSearch = (customQuery = null, customLocation = null) => {
    const q = typeof customQuery === 'string' ? customQuery : String(exploreQuery);
    if (!q.trim() || !placesLib || !map) return;

    // noinspection JSDeprecatedSymbols -- 相容目前已啟用的 Google Maps API；新版 Places 遷移需另行驗證金鑰。
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
    // noinspection JSDeprecatedSymbols -- 相容目前已啟用的 Google Maps API；新版 Places 遷移需另行驗證金鑰。
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

      const capture = html2canvas;
      const canvas = await capture(targetElement, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: tripThemeColor,
        onclone: (clonedDoc, clonedElement) => {
          clonedElement.querySelectorAll('.export-hide').forEach((element) => {
            if (element instanceof HTMLElement) element.style.display = 'none';
          });
          if (clonedElement instanceof HTMLElement) {
            clonedElement.style.maxHeight = 'none';
            clonedElement.style.height = 'auto';
            clonedElement.style.overflow = 'visible';
          }
          const scrollArea = clonedElement.querySelector('.overflow-y-auto');
          if (scrollArea instanceof HTMLElement) {
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

    const exportAccent = /^#[0-9a-f]{6}$/i.test(String(tripThemeColor))
      ? String(tripThemeColor)
      : '#3b82f6';

    return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeExportHtml(meta.title || "旅程")}－完整行程</title>
<style>
  * { box-sizing:border-box; }
  body { margin:0; color:#172033; background:#e8edf5; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans TC","Microsoft JhengHei",sans-serif; }
  .document { width:min(900px, calc(100% - 24px)); margin:24px auto; background:#ffffff; box-shadow:0 18px 60px rgba(15,23,42,.16); }
  .cover { min-height:440px; padding:54px; position:relative; overflow:hidden; color:white; background:linear-gradient(135deg, ${exportAccent}, #2563eb 62%, #14b8a6); }
  .cover:after { content:""; position:absolute; width:360px; height:360px; border-radius:50%; right:-110px; top:-120px; background:rgba(255,255,255,.13); }
  .cover-label { font-size:13px; font-weight:800; letter-spacing:.2em; opacity:.82; }
  .cover h1 { font-size:42px; line-height:1.15; margin:54px 0 12px; max-width:650px; }
  .destination { font-size:21px; font-weight:700; margin:0 0 34px; opacity:.94; }
  .cover-meta { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; max-width:630px; }
  .cover-card { border:1px solid rgba(255,255,255,.25); background:rgba(255,255,255,.13); border-radius:18px; padding:16px 18px; backdrop-filter:blur(8px); }
  .cover-card small { display:block; opacity:.75; margin-bottom:5px; }
  .cover-card strong { font-size:15px; }
  .summary { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; padding:28px 42px; border-bottom:1px solid #dbe3ef; background:#f6f8fc; }
  .summary div { background:white; border:1px solid #dbe3ef; border-radius:16px; padding:15px; text-align:center; }
  .summary strong { display:block; font-size:23px; color:${exportAccent}; }
  .summary span { font-size:12px; color:#64748b; }
  .day-section { padding:38px 42px 44px; }
  .day-header { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding-bottom:18px; margin-bottom:20px; border-bottom:3px solid ${exportAccent}; }
  .day-kicker { color:${exportAccent}; font-size:11px; letter-spacing:.18em; font-weight:900; }
  .day-header h2 { font-size:25px; margin:4px 0 5px; }
  .day-header p { margin:0; color:#64748b; font-size:13px; }
  .weather { text-align:right; padding:9px 12px; border-radius:14px; background:#f6f8fc; color:#334155; font-size:12px; line-height:1.7; white-space:nowrap; }
  .timeline { position:relative; }
  .timeline:before { content:""; position:absolute; left:17px; top:19px; bottom:19px; width:2px; background:#dbe3ef; }
  .stop { position:relative; display:grid; grid-template-columns:36px 60px 1fr; gap:12px; margin:0 0 13px; break-inside:avoid; page-break-inside:avoid; }
  .stop-index { z-index:1; width:34px; height:34px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:${exportAccent}; color:white; font-size:12px; font-weight:900; box-shadow:0 4px 12px rgba(15,23,42,.15); }
  .stop-time { padding-top:8px; color:${exportAccent}; font-weight:900; font-size:12px; }
  .stop-main { border:1px solid #dbe3ef; border-radius:16px; padding:14px 16px; background:white; }
  .stop.compact .stop-main { padding:10px 13px; }
  .stop-heading { font-size:15px; line-height:1.4; }
  .original-name { display:block; color:#64748b; font-size:10px; font-weight:500; margin-top:2px; }
  .stop-meta { display:flex; flex-wrap:wrap; gap:7px; margin-top:7px; color:#64748b; font-size:10px; }
  .tag, .leg { border-radius:999px; padding:3px 7px; background:#f6f8fc; border:1px solid #dbe3ef; }
  .detail-line { margin-top:9px; color:#475569; font-size:10px; }
  .memo { margin-top:10px; padding:9px 11px; border-left:3px solid ${exportAccent}; background:#f6f8fc; border-radius:0 9px 9px 0; color:#334155; font-size:11px; line-height:1.55; }
  .empty-day { padding:26px; text-align:center; border:1px dashed #dbe3ef; border-radius:16px; color:#64748b; }
  .footer-note { padding:20px 42px 34px; color:#64748b; font-size:10px; text-align:center; border-top:1px solid #dbe3ef; }
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
  <div class="no-print">預覽完整行程 <button onclick="window.print()">列印／另存 PDF</button></div>
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
    // noinspection JSDeprecatedSymbols -- 相容目前已啟用的 Google Maps API；新版 Places 遷移需另行驗證金鑰。
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

  const handleSavedItemDetails = (item, dayId = safeCurrentDay) => {
    setViewingPlaceDetail({ dayId: String(dayId || safeCurrentDay || ''), item });
    setSavedPlaceGoogleDetails(null);
    setSavedPlaceGoogleError('');
    setIsFetchingSavedPlaceGoogle(false);
  };

  const handleLoadSavedPlaceGoogleDetails = (item) => {
    if (!item || isFetchingSavedPlaceGoogle) return;
    if (!placesLib || !map || !window.google?.maps?.places) {
      setSavedPlaceGoogleError('Google 地點服務尚未準備完成，請稍後再試。');
      return;
    }

    setIsFetchingSavedPlaceGoogle(true);
    setSavedPlaceGoogleError('');
    // noinspection JSDeprecatedSymbols -- 相容目前已啟用的 Google Maps API；新版 Places 遷移需另行驗證金鑰。
    const service = new placesLib.PlacesService(map);
    const fields = [
      'name',
      'rating',
      'user_ratings_total',
      'formatted_address',
      'geometry',
      'photos',
      'reviews',
      'opening_hours',
      'website',
      'formatted_phone_number',
      'url',
      'place_id',
    ];

    const finishWithError = (message) => {
      setIsFetchingSavedPlaceGoogle(false);
      setSavedPlaceGoogleDetails(null);
      setSavedPlaceGoogleError(message);
    };

    const fetchDetails = (placeId) => {
      service.getDetails({ placeId: String(placeId), fields }, (place, status) => {
        setIsFetchingSavedPlaceGoogle(false);
        if (status === window.google.maps.places.PlacesServiceStatus.OK && place) {
          setSavedPlaceGoogleDetails(place);
          setSavedPlaceGoogleError('');
        } else {
          setSavedPlaceGoogleDetails(null);
          setSavedPlaceGoogleError('無法取得這個景點的 Google 評價與照片。');
        }
      });
    };

    if (item.place_id) {
      fetchDetails(item.place_id);
      return;
    }

    const request = { query: String(item.name || item.customName || '') };
    if (isValidCoordinates(item.lat, item.lng)) {
      request.location = new window.google.maps.LatLng(Number(item.lat), Number(item.lng));
      request.radius = 80;
    }

    service.textSearch(request, (results, status) => {
      if (
        status === window.google.maps.places.PlacesServiceStatus.OK
        && Array.isArray(results)
        && results[0]?.place_id
      ) {
        fetchDetails(results[0].place_id);
      } else {
        finishWithError('Google Maps 找不到可對應的地點，仍可使用你自行加入的封面、菜單與連結。');
      }
    });
  };


  useEffect(() => {
    if (!IS_FIREBASE_EMULATOR || typeof window === "undefined") {
      return undefined;
    }

    const e2eWindow = /** @type {any} */ (window);

    const addTestPlace = () => {
      void handleAddPlaceFromSearch(
        safeCurrentDay || "Day 1",
        {
          name: "E2E 測試餐廳",
          formatted_address: "台北市信義區信義路五段 7 號",
          geometry: {
            location: {
              lat: () => 25.033,
              lng: () => 121.5654,
            },
          },
        },
        "e2e-test-place-id",
      );
    };

    const moveTestItineraryItem = ({
      sourceDay = safeCurrentDay || "Day 1",
      destinationDay = sourceDay,
      sourceIndex,
      destinationIndex,
    } = {}) => {
      const normalizedSourceIndex = Number(sourceIndex);
      const normalizedDestinationIndex = Number(destinationIndex);

      if (
        !Number.isInteger(normalizedSourceIndex)
        || !Number.isInteger(normalizedDestinationIndex)
      ) {
        return false;
      }

      handleDragEnd({
        source: {
          droppableId: String(sourceDay),
          index: normalizedSourceIndex,
        },
        destination: {
          droppableId: String(destinationDay),
          index: normalizedDestinationIndex,
        },
      });

      return true;
    };

    e2eWindow.__TRAVEL_E2E__ = {
      ...(e2eWindow.__TRAVEL_E2E__ || {}),
      addTestPlace,
      moveTestItineraryItem,
    };

    return () => {
      if (e2eWindow.__TRAVEL_E2E__?.addTestPlace === addTestPlace) {
        delete e2eWindow.__TRAVEL_E2E__.addTestPlace;
      }

      if (
        e2eWindow.__TRAVEL_E2E__?.moveTestItineraryItem
        === moveTestItineraryItem
      ) {
        delete e2eWindow.__TRAVEL_E2E__.moveTestItineraryItem;
      }

      if (
        e2eWindow.__TRAVEL_E2E__
        && Object.keys(e2eWindow.__TRAVEL_E2E__).length === 0
      ) {
        delete e2eWindow.__TRAVEL_E2E__;
      }
    };
  }, [handleAddPlaceFromSearch, handleDragEnd, safeCurrentDay]);
  useEffect(() => {
    if (
      !db ||
      !roomId ||
      !isOnline ||
      isLoading ||
      loadError ||
      !meta ||
      !hasLoadedRoomRef.current ||
      syncStatus !== "saved" ||
      hasDirtyBranches(dirtyBranchesRef)
    ) {
      return;
    }

    const timer = setTimeout(() => {
      const snap = buildOfflineTripSnapshot({
        roomId,
        meta,
        itinerary,
        expenseStats,
        expenses,
        checklistItems,
        tickets
      });
      if (snap) {
        try {
          writeOfflineTripSnapshot(snap);
        } catch (error) {
          console.warn("Offline trip cache write failed:", error);
        }
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [isOnline, isLoading, loadError, meta, roomId, itinerary, expenseStats, expenses, checklistItems, tickets, syncStatus]);

  if (loadError) {
    return (
      <div style={{ backgroundColor: tripThemeColor }} className={`fixed inset-0 flex items-center justify-center p-6 ${t.mainText}`}>
        <div className={`w-full max-w-md rounded-3xl border p-8 text-center shadow-2xl ${t.modalBg} ${t.cardBorder}`}>
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-black mb-3">無法載入旅程資料</h2>
          <p className={`text-sm leading-6 mb-6 ${t.subText}`}>{loadError}</p>
          <button onClick={onBack} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl text-sm font-bold">
            返回旅程大廳
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !meta) {
    return (
      <TripDetailSkeleton
        t={t}
        tripThemeColor={tripThemeColor}
        onBack={onBack}
        onOpenReleaseNotes={onOpenReleaseNotes}
        onStartFeatureTour={onStartFeatureTour}
        onCheckUpdates={onCheckUpdates}
        isCheckingUpdates={isCheckingUpdates}
        onOpenAppearance={() => tripAppearanceInputRef.current?.click?.()}
      />
    );
  }

  return (
    <>
      <style>{`
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
      `}</style>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div data-testid="active-trip-view" style={{ backgroundColor: tripThemeColor }} className={`fixed inset-0 flex flex-col font-sans overflow-hidden overscroll-none transition-colors duration-500 w-full max-w-[100vw] ${t.mainText}`}>
          <div className="flex-1 flex overflow-hidden">

            <div className={`flex-col border-r transition-opacity duration-300 backdrop-blur-xl ${t.sidebarBg} ${t.cardBorder} ${activeTab === 'map' ? 'hidden md:flex md:w-2/3 lg:w-1/2' : 'flex w-full md:w-2/3 lg:w-1/2'}`}>
              <div className={`relative z-40 p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-md shrink-0 border-b backdrop-blur-2xl ${t.headerBg} ${t.cardBorder}`}>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button onClick={onBack} data-testid="back-to-lobby" className={`mr-2 font-bold transition-opacity hover:opacity-70 ${t.subText}`}>◀ 返回</button>
                    <input
                      ref={tripAppearanceInputRef}
                      type="color"
                      value={tripThemeColor}
                      onChange={e => handleColorChange(e.target.value)}
                      className="sr-only"
                      tabIndex={-1}
                      aria-label="自訂旅程外觀"
                    />
                    <h1 data-testid="trip-detail-title" className="text-xl font-black text-blue-500 italic truncate max-w-37.5 md:max-w-75 drop-shadow-sm">{String(meta.title)}</h1>
                    {db ? <SyncStatusIndicator status={!isOnline ? 'offline' : syncStatus} /> : null}
                  </div>
                  <p className={`text-[10px] font-bold ${t.subText}`}>📍 {String(meta.destination)} | 🚗 {String(meta.transport)}</p>
                </div>
                <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
                  <div className={`hidden md:flex p-1 rounded-lg border shadow-inner ${t.cardBg} ${t.cardBorder}`}>
                    <button onClick={() => setActiveTab('plan')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${(activeTab === 'plan' || activeTab === 'map') ? 'bg-blue-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>📋 行程</button>
                    <button
                      type="button"
                      data-testid="expense-tab-button"
                      data-layout="desktop"
                      onClick={() => setActiveTab('expense')}
                      className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'expense' ? 'bg-emerald-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}
                    >
                      💰 記帳
                    </button>
                    <button type="button" data-testid="ticket-tab-button" data-layout="desktop" onClick={() => setActiveTab('ticket')} className={`px-4 py-1.5 text-[11px] font-bold rounded-md transition-all ${activeTab === 'ticket' ? 'bg-amber-600 text-white shadow-sm' : `hover:opacity-70 ${t.subText}`}`}>🎟️ 票券</button>
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
                  <AppSettingsMenu
                    key={`trip-settings-${roomId}`}
                    t={t}
                    version={CURRENT_RELEASE_NOTES.version}
                    onOpenAppearance={() => tripAppearanceInputRef.current?.click?.()}
                    onOpenReleaseNotes={onOpenReleaseNotes}
                    onStartFeatureTour={onStartFeatureTour}
                    onCheckUpdates={onCheckUpdates}
                    isCheckingUpdates={isCheckingUpdates}
                  />
                </div>
              </div>

              <div className={`md:hidden shrink-0 border-b px-4 py-3 ${t.headerBg} ${t.cardBorder} ${(activeTab === 'plan' || activeTab === 'map') ? 'block' : 'hidden'}`}>
                <div
                  data-testid="mobile-day-switcher"
                  className="scrollbar-hide flex gap-2 overflow-x-auto overscroll-x-contain"
                >
                  {existingDays.map((dayId) => {
                    const { title } = getDayDisplay(dayId, meta.startDate);
                    const isCurrent = safeCurrentDay === dayId;

                    return (
                      <button
                        key={`mobile-day-${dayId}`}
                        type="button"
                        data-testid="itinerary-day-switch-button"
                        data-day-id={String(dayId)}
                        aria-pressed={isCurrent}
                        onClick={(event) => handleDaySwitch(dayId, event)}
                        className={`min-h-11 shrink-0 rounded-xl border px-4 text-xs font-black shadow-sm transition-all active:scale-95 ${isCurrent ? 'border-blue-500 bg-blue-600 text-white' : `${t.cardBg} ${t.cardBorder} ${t.mainText}`}`}
                      >
                        {String(title)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div data-testid="itinerary-horizontal-scroll" onWheel={handleItineraryWheel} className={`scrollbar-hide flex-1 overflow-x-auto overscroll-x-contain p-4 gap-4 items-start ${(activeTab === 'plan' || activeTab === 'map') ? 'flex' : 'hidden'}`}>
                {existingDays.map(dayId => {
                  const { title, dateStr } = getDayDisplay(dayId, meta.startDate);
                  const isCurrent = safeCurrentDay === dayId;
                  const dayTheme = meta.dayThemes?.[dayId] || "";

                  return (
                    <div
                      key={String(dayId)}
                      id={`day-card-${dayId}`}
                      data-testid="itinerary-day-card"
                      data-day-id={String(dayId)}
                      onClick={(event) => handleDaySwitch(dayId, event)}
                      className={`min-w-85 md:min-w-85 flex flex-col max-h-full rounded-3xl p-4 border-2 transition-all backdrop-blur-md ${isCurrent ? `border-blue-500 ${t.cardBg} shadow-lg` : `${t.cardBorder} hover:border-blue-300/50 ${t.expenseBlockBg}`}`}
                    >
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
                          {timeRecalculationDays[dayId] ? (
                            <span className="export-hide text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-500 animate-pulse">
                              {dayId === safeCurrentDay ? '⏱ 正在依新順序精算時間' : '⏱ 已重排，切換此日後精算'}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <div className="export-hide">
                         <SearchBox dayId={dayId} onAddPlace={handleAddPlaceFromSearch} t={t} />
                      </div>

                      <Droppable droppableId={String(dayId)}>
                        {(provided) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            data-testid="itinerary-day-dropzone"
                            data-day-id={String(dayId)}
                            className="flex-1 overflow-y-auto min-h-37.5 pb-6 scrollbar-hide"
                          >
                            {(!Array.isArray(itinerary[dayId]) || itinerary[dayId].length === 0) ? (
                              <EmptyState
                                testId="itinerary-empty-state"
                                className={`${t.cardBg} ${t.cardBorder} mt-2 max-w-none px-5 py-6`}
                                icon={(
                                  <svg viewBox="0 0 48 48" className="h-12 w-12" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path d="M12 36h24" />
                                    <path d="M16 32V14l8 4 8-4v18" />
                                    <path d="M24 18v14" />
                                    <circle cx="24" cy="10" r="3" />
                                  </svg>
                                )}
                                title="這一天還沒有行程"
                                description="新增第一個景點，開始安排交通、時間與每日路線。"
                                primaryAction={{
                                  label: '新增景點',
                                  testId: 'itinerary-empty-add-place',
                                  onClick: () => focusPlaceSearchInput(dayId),
                                }}
                              />
                            ) : null}
                            {(/** @type {any[]} */ (Array.isArray(itinerary[dayId]) ? itinerary[dayId] : [])).map((item, index) => {
                              const displayName = item.customName || item.name;
                              const isCustomName = !!item.customName;
                              const actionMenuId = `${String(dayId)}-${String(item?.id || item?.place_id || item?.name || '')}`;
                              return (
                              <Draggable key={String(item.id)} draggableId={String(item.id)} index={index}>
                                {(prov, snap) => (
                                  <div ref={prov.innerRef} {...prov.draggableProps} className={`transition-all relative group mb-1 ${snap.isDragging ? 'z-50 scale-105 touch-none' : ''}`}>

                                    <div
                                      data-testid="place-card"
                                      data-place-id={String(item.id)}
                                      className={`p-4 rounded-2xl border flex flex-col backdrop-blur-md transition-all relative overflow-hidden ${snap.isDragging ? 'bg-blue-600 border-white shadow-2xl text-white' : `${t.itemBg} ${t.cardBorder} shadow-sm ${t.itemHover} cursor-pointer`}`}
                                      onClick={() => {
                                        if (!snap.isDragging) handleSavedItemDetails(item, dayId);
                                      }}
                                    >
                                      <div className="flex gap-4 items-start">
                                        <div
                                          {...prov.dragHandleProps}
                                          data-testid="place-drag-handle"
                                          data-place-id={String(item.id)}
                                          onClick={(event) => event.stopPropagation()}
                                          className="flex flex-col items-center shrink-0 w-10 cursor-grab active:cursor-grabbing hover:opacity-80"
                                        >
                                           <div className={`text-xs font-black p-1.5 rounded-full w-7 h-7 flex items-center justify-center ${snap.isDragging ? 'bg-white/20 text-white' : 'bg-blue-500 text-white shadow-md'}`}>
                                              {index + 1}
                                           </div>
                                           {item.time ? (
                                             <span
                                               data-testid="place-card-time"
                                               className={`text-[10px] font-bold mt-1.5 ${snap.isDragging ? 'text-white' : t.mainText}`}
                                             >
                                               {String(item.time)}
                                             </span>
                                           ) : null}
                                           <span className="export-hide text-slate-400 mt-2 text-[10px]">≡</span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                              <h3
                                                data-testid="place-card-title"
                                                className={`truncate text-sm font-bold transition-colors group-hover:text-blue-500 ${snap.isDragging ? 'text-white' : t.mainText}`}
                                                title="點擊卡片查看詳細資訊"
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    handleSavedItemDetails(item, dayId);
                                                  }
                                                }}
                                              >
                                                {String(displayName)}
                                                {isCustomName ? <span className="ml-1.5 text-[10px] font-normal opacity-60">({String(item.name)})</span> : null}
                                              </h3>
                                              {item.stayTime !== undefined ? (
                                                <p className={`mt-0.5 text-[10px] font-bold ${item.stayTime === "0" || item.stayTime === 0 ? 'text-blue-500' : t.subText}`}>
                                                  {formatStayTime(item.stayTime)}
                                                </p>
                                              ) : null}
                                            </div>

                                            <button
                                              type="button"
                                              data-testid="place-action-menu-trigger"
                                              data-place-id={String(item.id)}
                                              aria-label="開啟景點操作"
                                              aria-haspopup="menu"
                                              aria-expanded={activePlaceActionMenu?.id === actionMenuId}
                                              aria-controls={activePlaceActionMenu?.id === actionMenuId ? `place-action-menu-${actionMenuId}` : undefined}
                                              ref={(node) => {
                                                if (node) placeActionTriggerRefs.current[actionMenuId] = node;
                                                else delete placeActionTriggerRefs.current[actionMenuId];
                                              }}
                                              onClick={(event) => openPlaceActionMenu(event, dayId, item)}
                                              className={`export-hide flex min-h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg font-black shadow-sm active:scale-95 md:hidden ${snap.isDragging ? 'border-white/25 bg-white/10 text-white' : `${t.cardBg} ${t.cardBorder} ${t.mainText}`}`}
                                            >
                                              ⋯
                                            </button>

                                            <button
                                              type="button"
                                              onClick={(event) => {
                                                event.stopPropagation();
                                                openExternalUrl(getPlaceNavigationUrl(item));
                                              }}
                                              className={`export-hide flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-black shadow-sm active:scale-95 ${snap.isDragging ? 'border-white/30 bg-white/15 text-white' : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600'}`}
                                              title="開啟導航"
                                              aria-label={`導航到${String(displayName)}`}
                                            >
                                              <span>🧭</span>
                                              <span>導航</span>
                                            </button>
                                          </div>

                                          <div className="mt-2 flex flex-wrap gap-1.5">
                                            {(Array.isArray(item.tags) ? item.tags : []).map((tag, idx) => (
                                              <span key={`tag-${idx}`} className={`rounded-md border px-2 py-0.5 text-[9px] ${snap.isDragging ? 'border-white/20 bg-white/10 text-white' : 'border-blue-500/20 bg-blue-500/10 text-blue-600'}`}>
                                                {String(tag)}
                                              </span>
                                            ))}
                                          </div>

                                          {(() => {
                                            const allResources = Array.isArray(item.resources) ? item.resources.filter((resource) => resource?.url) : [];
                                            const menuCount = allResources.filter((resource) => resource.type === 'menu').length;
                                            const otherCount = allResources.length - menuCount;
                                            const detailParts = [
                                              item.placePhoto?.url ? '封面' : '',
                                              menuCount > 0 ? `菜單 ${menuCount}` : '',
                                              item.memo ? '筆記' : '',
                                              otherCount > 0 ? `資料 ${otherCount}` : '',
                                            ].filter(Boolean);
                                            return (
                                              <div data-testid="place-info-trigger" className={`export-hide mt-3 flex min-h-10 items-center gap-2 rounded-xl border px-3 ${snap.isDragging ? 'border-white/20 bg-white/10 text-white' : `${t.cardBg} ${t.cardBorder}`}`}>
                                                <span className="text-sm">ⓘ</span>
                                                <span className={`shrink-0 text-[10px] font-black ${snap.isDragging ? 'text-white' : t.mainText}`}>景點資訊</span>
                                                <span className={`min-w-0 flex-1 truncate text-[9px] ${snap.isDragging ? 'text-white/75' : t.subText}`}>
                                                  {detailParts.length > 0 ? detailParts.join('・') : '地址、定位與景點資料'}
                                                </span>
                                                <span className={snap.isDragging ? 'text-white/70' : t.subText}>›</span>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      </div>

                                      <div data-testid="desktop-place-actions" className={`export-hide mt-3 pt-3 border-t hidden items-center gap-4 transition-all duration-300 ${snap.isDragging ? 'border-white/20' : t.cardBorder} md:flex md:max-h-0 md:opacity-0 md:group-hover:max-h-14 md:group-hover:opacity-100`}>
                                        <button data-testid="edit-place-button" onClick={(event) => { event.stopPropagation(); setEditingItemData({ dayId, item }); }} className={`flex items-center gap-1 text-[11px] font-bold hover:text-blue-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>✏️ 編輯</button>
                                        <button onClick={(event) => { event.stopPropagation(); handleSearchNearby(item); }} className={`flex items-center gap-1 text-[11px] font-bold hover:text-orange-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>🔍 周邊</button>
                                        <button onClick={(event) => { event.stopPropagation(); setCopyingItem(item); }} className={`flex items-center gap-1 text-[11px] font-bold hover:text-purple-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>📋 複製</button>
                                        <div className="flex-1"></div>
                                        <button data-testid="delete-place-button" onClick={(event) => { event.stopPropagation(); void handleDeleteItineraryItem(dayId, item); }} className={`text-[11px] hover:text-red-500 transition-colors ${snap.isDragging ? 'text-white' : t.subText}`}>刪除</button>
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

              <ExpenseSection
                t={t}
                isActive={activeTab === 'expense'}
                expenses={expenses}
                settlements={settlements}
                membersList={membersList}
                meta={meta}
                expenseStats={expenseStats}
                onCreateExpense={openNewExpense}
                onEditExpense={openExpenseEditor}
                onOpenSettlement={() => setShowSettlementModal(true)}
                onDeleteSettlement={handleDeleteSettlement}
                onUpdateBudget={handleBudgetChange}
              />

              <TicketWalletSection
                key={roomId}
                isActive={activeTab === 'ticket'}
                tickets={tickets}
                members={membersList}
                activeMember={ticketActiveMember}
                startDate={meta.startDate}
                t={t}
                isSavingTicket={isSavingTicket}
                deletingTicketId={deletingTicketId}
                onSelectActiveMember={handleSelectTicketActiveMember}
                onCreateTicket={openNewTicket}
                onEditTicket={openTicketEditor}
                onDeleteTicket={deleteTicket}
                onOpenImage={setFullscreenTicket}
                onCopyOrderNumber={handleCopyTicketOrderNumber}
              />

            </div>

            {/* 地圖區塊 */}
            <div data-testid="map-panel" className={`relative flex-1 transition-opacity duration-300 ease-in-out ${activeTab === 'map' ? 'flex' : 'hidden md:flex'}`}>
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
                    <AdvancedMarker key={String(item.id)} position={{lat: Number(item.lat), lng: Number(item.lng)}} onClick={() => handleSavedItemDetails(item, safeCurrentDay)}>
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
            <button type="button" data-testid="ticket-tab-button" data-layout="mobile" onClick={() => setActiveTab("ticket")} className={`flex flex-col items-center justify-center pt-2 transition-all ${activeTab === "ticket" ? "text-amber-500 font-bold -translate-y-1" : t.subText}`}>🎟️<span className="text-[10px] mt-1 font-bold">票券</span></button>
            <button
              type="button"
              data-testid="expense-tab-button"
              data-layout="mobile"
              onClick={() => setActiveTab("expense")}
              className={`flex flex-col items-center justify-center pt-2 transition-all ${activeTab === "expense" ? "text-emerald-500 font-bold -translate-y-1" : t.subText}`}
            >
              💰<span className="text-[10px] mt-1 font-bold">記帳</span>
            </button>
          </div>
        </div>
      </DragDropContext>

      {/* 🌟 彈窗掛載區 */}
      {activePlaceActionMenu ? createPortal(
        <div
          id={`place-action-menu-${activePlaceActionMenu.id}`}
          data-testid="place-action-menu"
          data-place-id={String(activePlaceActionMenu.item?.id || '')}
          role="menu"
          aria-label="景點操作"
          className={`fixed grid gap-1.5 rounded-2xl border p-2 shadow-2xl backdrop-blur-xl ${t.headerBg} ${t.cardBorder}`}
          style={{
            top: `${activePlaceActionMenu.top}px`,
            left: `${activePlaceActionMenu.left}px`,
            width: `${activePlaceActionMenu.width}px`,
            zIndex: 10050,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            data-testid="place-action-edit"
            onClick={(event) => {
              event.stopPropagation();
              const { dayId, item } = activePlaceActionMenu;
              closePlaceActionMenu();
              setEditingItemData({ dayId, item });
            }}
            className={`min-h-11 rounded-xl px-3 text-left text-xs font-black transition-colors active:scale-95 ${t.mainText} hover:bg-blue-500/10`}
          >
            ✏️ 編輯
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="place-action-nearby"
            onClick={(event) => {
              event.stopPropagation();
              const { item } = activePlaceActionMenu;
              closePlaceActionMenu();
              handleSearchNearby(item);
            }}
            className={`min-h-11 rounded-xl px-3 text-left text-xs font-black transition-colors active:scale-95 ${t.mainText} hover:bg-orange-500/10`}
          >
            🔍 查看周邊
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="place-action-copy"
            onClick={(event) => {
              event.stopPropagation();
              const { item } = activePlaceActionMenu;
              closePlaceActionMenu();
              setCopyingItem(item);
            }}
            className={`min-h-11 rounded-xl px-3 text-left text-xs font-black transition-colors active:scale-95 ${t.mainText} hover:bg-purple-500/10`}
          >
            📋 複製
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="place-action-delete"
            onClick={(event) => {
              event.stopPropagation();
              const { dayId, item } = activePlaceActionMenu;
              closePlaceActionMenu({ restoreFocus: true });
              window.requestAnimationFrame(() => {
                void handleDeleteItineraryItem(dayId, item);
              });
            }}
            className="min-h-11 rounded-xl border border-red-500/25 bg-red-500/10 px-3 text-left text-xs font-black text-red-500 transition-colors active:scale-95 hover:bg-red-500/15"
          >
            刪除
          </button>
        </div>,
        document.body,
      ) : null}

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
              <button onClick={() => void handleAddExploreToItinerary(selectedExploreItem, 'before')} className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-md active:scale-95">加在前面</button>
              <button onClick={() => void handleAddExploreToItinerary(selectedExploreItem, 'after')} className="flex-1 bg-emerald-600 text-white py-2.5 rounded-xl text-[11px] font-bold shadow-md active:scale-95">加在後面</button>
            </div>
          ) : (
            <button onClick={() => void handleAddExploreToItinerary(selectedExploreItem, 'end')} className="w-full mt-2 bg-blue-600 text-white py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95">加入行程最後</button>
          )}
        </div>
      ) : null}

      {detailedPlace ? <PlaceDetailsModal place={detailedPlace} onClose={() => setDetailedPlace(null)} onAdd={isSavedItemModal ? null : (place, pos) => { setDetailedPlace(null); void handleAddExploreToItinerary(place, pos); }} exploreOriginItem={exploreOriginItem} dayTitle={getDayDisplay(safeCurrentDay, meta.startDate).title} t={t} isFetching={isFetchingDetails} /> : null}

      {viewingMemoItem ? <MemoViewModal item={viewingMemoItem} onClose={() => setViewingMemoItem(null)} t={t} /> : null}
      {editingItemData ? <EditItemModal item={editingItemData.item} roomId={roomId} onSave={saveEditedItem} onSaveError={() => {
        setSyncStatus('error');
        toast.error({
          title: '無法更新景點',
          description: '請檢查網路連線後再試一次。',
        });
      }} onClose={() => setEditingItemData(null)} t={t} /> : null}
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
      {ticketEditorState ? (
        <TicketEditorModal
          mode={ticketEditorState.mode}
          ticket={ticketEditorState.ticket}
          members={membersList}
          existingDays={existingDays}
          startDate={meta.startDate}
          defaultDayId={safeCurrentDay}
          activeMember={ticketActiveMember}
          uploadProgress={uploadProgress}
          t={t}
          onClose={closeTicketEditor}
          onSubmit={saveTicket}
        />
      ) : null}
      {fullscreenTicket ? <FullscreenTicketModal ticket={fullscreenTicket} onClose={() => setFullscreenTicket(null)} /> : null}
      {viewingPlaceDetail ? (
        <PlaceItemDetailModal
          key={`place-detail-${String(viewingPlaceDetail.item?.id || viewingPlaceDetail.dayId)}`}
          item={viewingPlaceDetail.item}
          googlePlace={savedPlaceGoogleDetails}
          googleError={savedPlaceGoogleError}
          isFetchingGoogle={isFetchingSavedPlaceGoogle}
          onLoadGoogle={handleLoadSavedPlaceGoogleDetails}
          onClose={() => {
            setViewingPlaceDetail(null);
            setSavedPlaceGoogleDetails(null);
            setSavedPlaceGoogleError('');
            setIsFetchingSavedPlaceGoogle(false);
          }}
          onEdit={() => {
            setEditingItemData({ dayId: viewingPlaceDetail.dayId, item: viewingPlaceDetail.item });
            setViewingPlaceDetail(null);
            setSavedPlaceGoogleDetails(null);
            setSavedPlaceGoogleError('');
          }}
          onViewMenu={(item) => setViewingPlaceResources({ item, mode: 'menu' })}
          onViewPhoto={(photo) => setViewingPlacePhoto(photo)}
          t={t}
        />
      ) : null}
      {viewingPlacePhoto ? (
        <PlacePhotoLightbox
          key={`place-photo-${String(viewingPlacePhoto.url)}`}
          photo={viewingPlacePhoto}
          onClose={() => setViewingPlacePhoto(null)}
        />
      ) : null}
      {viewingPlaceResources ? (
        <PlaceResourcesModal
          key={`place-resources-${String(viewingPlaceResources.item?.id || 'item')}-${viewingPlaceResources.mode}`}
          item={viewingPlaceResources.item}
          mode={viewingPlaceResources.mode}
          onClose={() => setViewingPlaceResources(null)}
        />
      ) : null}
    </>
  );
};

export default TripDetail;
