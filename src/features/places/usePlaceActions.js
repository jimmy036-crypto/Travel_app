import { useCallback, useMemo } from 'react';
import { deleteObject, ref as storageRef } from 'firebase/storage';

import {
  generateId,
  getNextDefaultTimeFromList,
  minsToTime,
  timeToMins,
} from '../../helpers.js';
import { recalculateArrivalTimesFromIndex } from '../itinerary/itineraryCalculations.js';
import { persistItinerary } from '../../services/placesService.js';

export function usePlaceActions({
  room,
  data,
  state,
  refs,
  feedback,
  callbacks,
}) {
  const { db, roomId, storage } = room;
  const {
    itinerary,
    currentDay,
    editingItemData,
    exploreOriginItem,
    routeDurations,
  } = data;
  const {
    setItinerary,
    setItineraryState,
    setEditingItemData,
    setBackupItin,
    setSyncStatus,
  } = state;
  const {
    dirtyBranchesRef,
    lastLocalWriteAtRef,
    placeDeleteConfirmRef,
  } = refs;
  const { confirm, toast } = feedback;
  const {
    clearOptimizationSummary,
    resetExploreState,
    setActiveTab,
  } = callbacks;

  const persistPlaceItinerary = useCallback(async (nextItinerary) => {
    if (!db || !roomId) {
      setItinerary(nextItinerary);
      return;
    }

    setSyncStatus('saving');
    lastLocalWriteAtRef.current = Date.now();
    await persistItinerary({ db, roomId, itinerary: nextItinerary });

    dirtyBranchesRef.current.itinerary = false;
    lastLocalWriteAtRef.current = Date.now();
    setItineraryState(nextItinerary);
    setSyncStatus('saved');
  }, [
    db,
    dirtyBranchesRef,
    lastLocalWriteAtRef,
    roomId,
    setItinerary,
    setItineraryState,
    setSyncStatus,
  ]);

  const addPlaceFromSearch = useCallback(async (dayId, result, placeId) => {
    if (!result?.geometry?.location) return false;

    const targetDayId = String(dayId);
    const dayItems = [...(Array.isArray(itinerary[targetDayId]) ? itinerary[targetDayId] : [])];
    dayItems.push({
      id: generateId(),
      name: String(result.name || '未命名地點'),
      place_id: String(placeId || ''),
      customName: '',
      lat: Number(result.geometry.location.lat()),
      lng: Number(result.geometry.location.lng()),
      address: String(result.formatted_address || ''),
      time: getNextDefaultTimeFromList(dayItems),
      stayTime: '0',
      memo: '',
      tags: [],
      nextLeg: { mode: 'AUTO', mins: 30 },
    });

    const nextItinerary = {
      ...itinerary,
      [targetDayId]: dayItems,
    };

    try {
      await persistPlaceItinerary(nextItinerary);
      setBackupItin(null);
      clearOptimizationSummary(targetDayId);
      toast.success({
        title: '景點已加入行程',
        description: '行程與協作者畫面已更新。',
      });
      return true;
    } catch (error) {
      console.error('Create place failed:', error);
      setSyncStatus('error');
      toast.error({
        title: '無法新增景點',
        description: '請檢查網路連線後再試一次。',
      });
      return false;
    }
  }, [
    clearOptimizationSummary,
    itinerary,
    persistPlaceItinerary,
    setBackupItin,
    setSyncStatus,
    toast,
  ]);

  const addExplorePlace = useCallback(async (place, position = 'end') => {
    const safeCurrentDay = String(currentDay || 'Day 1');
    const dayList = [...(Array.isArray(itinerary[safeCurrentDay]) ? itinerary[safeCurrentDay] : [])];
    const newItem = {
      id: generateId(),
      name: String(place.name || '未命名地點'),
      place_id: String(place.place_id || ''),
      customName: '',
      lat: Number(place.geometry.location.lat()),
      lng: Number(place.geometry.location.lng()),
      address: String(place.formatted_address || place.vicinity || ''),
      time: getNextDefaultTimeFromList(dayList),
      stayTime: '0',
      memo: `⭐ Google 評價: ${place.rating || '無'}`,
      tags: ['地圖探索'],
      nextLeg: { mode: 'AUTO', mins: 30 },
    };

    if (exploreOriginItem && position !== 'end') {
      const idx = dayList.findIndex((item) => item.id === exploreOriginItem.id);
      if (idx !== -1) {
        if (position === 'before') {
          newItem.time = dayList[idx].time;
          dayList.splice(idx, 0, newItem);
        } else if (position === 'after') {
          if (dayList[idx].time) {
            let travelTime = 15;
            if (dayList[idx].nextLeg && dayList[idx].nextLeg.mode !== 'AUTO') {
              travelTime = Number(dayList[idx].nextLeg.mins);
            }
            newItem.time = minsToTime(
              timeToMins(String(dayList[idx].time))
                + Number(dayList[idx].stayTime || 0)
                + travelTime,
            );
          }
          dayList.splice(idx + 1, 0, newItem);
        }
      } else {
        dayList.push(newItem);
      }
    } else {
      dayList.push(newItem);
    }

    const nextItinerary = { ...itinerary, [safeCurrentDay]: dayList };

    try {
      await persistPlaceItinerary(nextItinerary);
      setBackupItin(null);
      clearOptimizationSummary(safeCurrentDay);
      resetExploreState();
      setActiveTab('plan');
      toast.success({
        title: '景點已加入行程',
        description: '行程與協作者畫面已更新。',
      });
    } catch (error) {
      console.error('Create explored place failed:', error);
      setSyncStatus('error');
      toast.error({
        title: '無法新增景點',
        description: '請檢查網路連線後再試一次。',
      });
    }
  }, [
    clearOptimizationSummary,
    currentDay,
    exploreOriginItem,
    itinerary,
    persistPlaceItinerary,
    resetExploreState,
    setActiveTab,
    setBackupItin,
    setSyncStatus,
    toast,
  ]);

  const saveEditedItem = useCallback(async (updatedItem, shouldCascade) => {
    const editedDayId = String(editingItemData.dayId);
    const dayList = [...(Array.isArray(itinerary[editedDayId]) ? itinerary[editedDayId] : [])];
    const idx = dayList.findIndex((item) => item.id === updatedItem.id);

    if (idx === -1) {
      toast.error({
        title: '無法更新景點',
        description: '請檢查網路連線後再試一次。',
      });
      throw new Error('Place to edit was not found.');
    }

    dayList[idx] = updatedItem;

    const nextItinerary = {
      ...itinerary,
      [editedDayId]: shouldCascade && updatedItem.time
        ? recalculateArrivalTimesFromIndex(
          dayList,
          idx,
          routeDurations[editedDayId],
        )
        : dayList,
    };

    try {
      await persistPlaceItinerary(nextItinerary);
      setBackupItin(null);
      clearOptimizationSummary(editedDayId);
      setEditingItemData(null);
      toast.success({
        title: '景點已更新',
        description: '最新內容已同步給協作者。',
      });
    } catch (error) {
      console.error('Save place edit failed:', error);
      setSyncStatus('error');
      toast.error({
        title: '無法更新景點',
        description: '請檢查網路連線後再試一次。',
      });
      throw error;
    }
  }, [
    clearOptimizationSummary,
    editingItemData,
    itinerary,
    persistPlaceItinerary,
    routeDurations,
    setBackupItin,
    setEditingItemData,
    setSyncStatus,
    toast,
  ]);

  const deleteItineraryItem = useCallback(async (dayId, item) => {
    if (placeDeleteConfirmRef.current) return;
    placeDeleteConfirmRef.current = true;

    try {
      const shouldDelete = await confirm({
        title: '刪除這個景點？',
        description: '刪除後，這個景點會從所有協作者的行程中移除。',
        cancelLabel: '保留景點',
        confirmLabel: '刪除景點',
        danger: true,
      });

      if (!shouldDelete) return;

      const safeDayId = String(dayId);
      const targetId = String(item?.id || '');
      const currentDayItems = Array.isArray(itinerary[safeDayId]) ? itinerary[safeDayId] : [];
      const nextDayItems = currentDayItems.filter((place) => String(place?.id || '') !== targetId);

      if (!targetId || nextDayItems.length === currentDayItems.length) return;

      if (!db || !roomId) {
        throw new Error('Realtime Database is not available for place deletion.');
      }

      const nextItinerary = {
        ...itinerary,
        [safeDayId]: nextDayItems,
      };

      setSyncStatus('saving');
      lastLocalWriteAtRef.current = Date.now();
      await persistItinerary({ db, roomId, itinerary: nextItinerary });

      dirtyBranchesRef.current.itinerary = false;
      lastLocalWriteAtRef.current = Date.now();
      setBackupItin(null);
      clearOptimizationSummary(safeDayId);
      setItineraryState(nextItinerary);
      setSyncStatus('saved');
      toast.success({
        title: '景點已刪除',
        description: '行程與協作者畫面已更新。',
      });

      const storagePaths = [
        String(item?.placePhoto?.storagePath || ''),
        ...(Array.isArray(item?.resources)
          ? item.resources.map((resource) => String(resource?.storagePath || ''))
          : []),
      ].filter(Boolean);

      if (storage) {
        storagePaths.forEach((storagePath) => {
          void deleteObject(storageRef(storage, storagePath)).catch((error) => {
            console.warn('景點附件刪除失敗：', error);
          });
        });
      }
    } catch (error) {
      console.error('Delete place failed:', error);
      setSyncStatus('error');
      toast.error({
        title: '無法刪除景點',
        description: '請檢查網路連線後再試一次。',
      });
    } finally {
      placeDeleteConfirmRef.current = false;
    }
  }, [
    clearOptimizationSummary,
    confirm,
    db,
    dirtyBranchesRef,
    itinerary,
    lastLocalWriteAtRef,
    placeDeleteConfirmRef,
    roomId,
    setBackupItin,
    setItineraryState,
    setSyncStatus,
    storage,
    toast,
  ]);

  return useMemo(() => ({
    addPlaceFromSearch,
    addExplorePlace,
    saveEditedItem,
    deleteItineraryItem,
  }), [
    addExplorePlace,
    addPlaceFromSearch,
    deleteItineraryItem,
    saveEditedItem,
  ]);
}
