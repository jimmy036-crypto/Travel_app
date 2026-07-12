import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaceActions } from './usePlaceActions.js';
import { persistItinerary } from '../../services/placesService.js';
import { recalculateArrivalTimesFromIndex } from '../itinerary/itineraryCalculations.js';
import { deleteObject } from 'firebase/storage';

vi.mock('../../services/placesService.js', () => ({
  persistItinerary: vi.fn(async () => undefined),
}));

vi.mock('../itinerary/itineraryCalculations.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    recalculateArrivalTimesFromIndex: vi.fn((items) => items.map((item, index) => ({
      ...item,
      time: index === 0 ? item.time : '10:45',
    }))),
  };
});

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_storage, path) => ({ path })),
  deleteObject: vi.fn(async () => undefined),
}));

const createLocation = (lat = 25.033, lng = 121.565) => ({
  lat: () => lat,
  lng: () => lng,
});

const createPlaceResult = (overrides = {}) => ({
  name: '新景點',
  place_id: 'google-place-1',
  formatted_address: '台北市信義區',
  geometry: { location: createLocation() },
  ...overrides,
});

const createDeps = (overrides = {}) => {
  const deps = {
    room: {
      db: { app: 'db' },
      roomId: 'room-1',
      storage: { app: 'storage' },
    },
    data: {
      itinerary: {
        'Day 1': [
          { id: 'place-1', name: '早餐', time: '09:00', stayTime: '30', nextLeg: { mode: 'AUTO', mins: 30 } },
        ],
      },
      currentDay: 'Day 1',
      editingItemData: {
        dayId: 'Day 1',
        item: { id: 'place-1', name: '早餐' },
      },
      exploreOriginItem: null,
      routeDurations: { 'Day 1': [{ mins: 20 }] },
    },
    state: {
      setItinerary: vi.fn(),
      setItineraryState: vi.fn(),
      setEditingItemData: vi.fn(),
      setBackupItin: vi.fn(),
      setSyncStatus: vi.fn(),
    },
    refs: {
      dirtyBranchesRef: { current: { itinerary: true } },
      lastLocalWriteAtRef: { current: 0 },
      placeDeleteConfirmRef: { current: false },
    },
    feedback: {
      confirm: vi.fn(async () => true),
      toast: {
        success: vi.fn(),
        error: vi.fn(),
      },
    },
    callbacks: {
      clearOptimizationSummary: vi.fn(),
      resetExploreState: vi.fn(),
      setActiveTab: vi.fn(),
    },
  };

  return {
    ...deps,
    ...overrides,
    room: { ...deps.room, ...overrides.room },
    data: { ...deps.data, ...overrides.data },
    state: { ...deps.state, ...overrides.state },
    refs: { ...deps.refs, ...overrides.refs },
    feedback: {
      ...deps.feedback,
      ...overrides.feedback,
      toast: {
        ...deps.feedback.toast,
        ...overrides.feedback?.toast,
      },
    },
    callbacks: { ...deps.callbacks, ...overrides.callbacks },
  };
};

const renderUsePlaceActions = (initialDeps = createDeps()) => {
  let deps = initialDeps;
  const view = renderHook(() => usePlaceActions(deps));

  return {
    ...view,
    deps,
    update(nextOverrides) {
      deps = createDeps({
        ...deps,
        ...nextOverrides,
        room: { ...deps.room, ...nextOverrides.room },
        data: { ...deps.data, ...nextOverrides.data },
        state: { ...deps.state, ...nextOverrides.state },
        refs: { ...deps.refs, ...nextOverrides.refs },
        feedback: {
          ...deps.feedback,
          ...nextOverrides.feedback,
          toast: {
            ...deps.feedback.toast,
            ...nextOverrides.feedback?.toast,
          },
        },
        callbacks: { ...deps.callbacks, ...nextOverrides.callbacks },
      });
      view.rerender();
      return deps;
    },
    getDeps() {
      return deps;
    },
  };
};

describe('usePlaceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistItinerary.mockResolvedValue(undefined);
    deleteObject.mockResolvedValue(undefined);
    recalculateArrivalTimesFromIndex.mockClear();
  });

  it('adds a place from search after persistence succeeds', async () => {
    const view = renderUsePlaceActions();

    let result;
    await act(async () => {
      result = await view.result.current.addPlaceFromSearch(
        'Day 1',
        createPlaceResult({ name: '午餐' }),
        'google-place-lunch',
      );
    });

    expect(result).toBe(true);
    expect(persistItinerary).toHaveBeenCalledTimes(1);
    const persisted = persistItinerary.mock.calls[0][0].itinerary;
    expect(persisted['Day 1']).toHaveLength(2);
    expect(persisted['Day 1'][1]).toMatchObject({
      name: '午餐',
      place_id: 'google-place-lunch',
      address: '台北市信義區',
      stayTime: '0',
      nextLeg: { mode: 'AUTO', mins: 30 },
    });
    expect(view.deps.state.setItineraryState).toHaveBeenCalledWith(persisted);
    expect(view.deps.callbacks.clearOptimizationSummary).toHaveBeenCalledWith('Day 1');
    expect(view.deps.feedback.toast.success).toHaveBeenCalledWith({
      title: '景點已加入行程',
      description: '行程與協作者畫面已更新。',
    });
  });

  it('returns false and keeps local state unchanged when adding from search fails', async () => {
    persistItinerary.mockRejectedValueOnce(new Error('write failed'));
    const view = renderUsePlaceActions();

    let result;
    await act(async () => {
      result = await view.result.current.addPlaceFromSearch('Day 1', createPlaceResult(), 'google-place-1');
    });

    expect(result).toBe(false);
    expect(view.deps.state.setItineraryState).not.toHaveBeenCalled();
    expect(view.deps.state.setSyncStatus).toHaveBeenLastCalledWith('error');
    expect(view.deps.feedback.toast.error).toHaveBeenCalledWith({
      title: '無法新增景點',
      description: '請檢查網路連線後再試一次。',
    });
  });

  it('uses local itinerary state when adding from search without a database room', async () => {
    const view = renderUsePlaceActions(createDeps({
      room: { db: null, roomId: '' },
    }));

    await act(async () => {
      await view.result.current.addPlaceFromSearch('Day 1', createPlaceResult(), 'google-place-1');
    });

    expect(persistItinerary).not.toHaveBeenCalled();
    expect(view.deps.state.setItinerary).toHaveBeenCalledTimes(1);
    expect(view.deps.feedback.toast.success).toHaveBeenCalledWith({
      title: '景點已加入行程',
      description: '行程與協作者畫面已更新。',
    });
  });

  it.each([
    ['before', ['新景點', '早餐']],
    ['after', ['早餐', '新景點']],
    ['end', ['早餐', '新景點']],
  ])('adds an explored place at the %s insertion point', async (position, expectedOrder) => {
    const view = renderUsePlaceActions(createDeps({
      data: {
        exploreOriginItem: { id: 'place-1' },
      },
    }));

    await act(async () => {
      await view.result.current.addExplorePlace(createPlaceResult({ rating: 4.8 }), position);
    });

    const persisted = persistItinerary.mock.calls[0][0].itinerary;
    expect(persisted['Day 1'].map((item) => item.name)).toEqual(expectedOrder);
    expect(view.deps.callbacks.resetExploreState).toHaveBeenCalledTimes(1);
    expect(view.deps.callbacks.setActiveTab).toHaveBeenCalledWith('plan');
    expect(view.deps.feedback.toast.success).toHaveBeenCalledWith({
      title: '景點已加入行程',
      description: '行程與協作者畫面已更新。',
    });
  });

  it('keeps explore UI state when adding an explored place fails', async () => {
    persistItinerary.mockRejectedValueOnce(new Error('write failed'));
    const view = renderUsePlaceActions();

    await act(async () => {
      await view.result.current.addExplorePlace(createPlaceResult(), 'end');
    });

    expect(view.deps.callbacks.resetExploreState).not.toHaveBeenCalled();
    expect(view.deps.callbacks.setActiveTab).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.error).toHaveBeenCalledWith({
      title: '無法新增景點',
      description: '請檢查網路連線後再試一次。',
    });
  });

  it('saves an edited place and closes the editor on success', async () => {
    const view = renderUsePlaceActions();
    const updated = { id: 'place-1', name: '早午餐', time: '09:30', stayTime: '45' };

    await act(async () => {
      await view.result.current.saveEditedItem(updated, false);
    });

    const persisted = persistItinerary.mock.calls[0][0].itinerary;
    expect(persisted['Day 1'][0]).toBe(updated);
    expect(recalculateArrivalTimesFromIndex).not.toHaveBeenCalled();
    expect(view.deps.state.setEditingItemData).toHaveBeenCalledWith(null);
    expect(view.deps.feedback.toast.success).toHaveBeenCalledWith({
      title: '景點已更新',
      description: '最新內容已同步給協作者。',
    });
  });

  it('recalculates later arrival times when saving a cascaded edit', async () => {
    const view = renderUsePlaceActions();
    const updated = { id: 'place-1', name: '早午餐', time: '10:00', stayTime: '45' };

    await act(async () => {
      await view.result.current.saveEditedItem(updated, true);
    });

    expect(recalculateArrivalTimesFromIndex).toHaveBeenCalledTimes(1);
    expect(recalculateArrivalTimesFromIndex).toHaveBeenCalledWith(
      [updated],
      0,
      [{ mins: 20 }],
    );
  });

  it('throws and shows an error toast when the edited place is missing', async () => {
    const view = renderUsePlaceActions(createDeps({
      data: {
        editingItemData: {
          dayId: 'Day 1',
          item: { id: 'missing' },
        },
      },
    }));

    await expect(act(async () => {
      await view.result.current.saveEditedItem({ id: 'missing', name: 'Missing' }, false);
    })).rejects.toThrow('Place to edit was not found.');

    expect(persistItinerary).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.error).toHaveBeenCalledWith({
      title: '無法更新景點',
      description: '請檢查網路連線後再試一次。',
    });
  });

  it('does not delete a place when confirmation is cancelled', async () => {
    const view = renderUsePlaceActions(createDeps({
      feedback: { confirm: vi.fn(async () => false) },
    }));

    await act(async () => {
      await view.result.current.deleteItineraryItem('Day 1', { id: 'place-1', name: '早餐' });
    });

    expect(persistItinerary).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(view.deps.state.setItineraryState).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.success).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.error).not.toHaveBeenCalled();
  });

  it('deletes a place in the expected persistence, state, toast, and storage order', async () => {
    const events = [];
    persistItinerary.mockImplementationOnce(async () => {
      events.push('persist');
    });
    deleteObject.mockImplementationOnce(async () => {
      events.push('storage');
    });
    const view = renderUsePlaceActions(createDeps({
      state: {
        setItineraryState: vi.fn(() => events.push('state')),
      },
      feedback: {
        confirm: vi.fn(async () => {
          events.push('confirm');
          return true;
        }),
        toast: {
          success: vi.fn(() => events.push('toast')),
          error: vi.fn(),
        },
      },
    }));

    await act(async () => {
      await view.result.current.deleteItineraryItem('Day 1', {
        id: 'place-1',
        name: '早餐',
        placePhoto: { storagePath: 'places/cover.jpg' },
        resources: [{ storagePath: 'places/menu.pdf' }],
      });
    });

    expect(persistItinerary).toHaveBeenCalledTimes(1);
    expect(persistItinerary.mock.calls[0][0].itinerary['Day 1']).toEqual([]);
    expect(deleteObject).toHaveBeenCalledTimes(2);
    expect(events).toEqual(['confirm', 'persist', 'state', 'toast', 'storage']);
  });

  it('keeps local state and storage unchanged when delete persistence fails', async () => {
    persistItinerary.mockRejectedValueOnce(new Error('write failed'));
    const view = renderUsePlaceActions();

    await act(async () => {
      await view.result.current.deleteItineraryItem('Day 1', {
        id: 'place-1',
        name: '早餐',
        placePhoto: { storagePath: 'places/cover.jpg' },
      });
    });

    expect(view.deps.state.setItineraryState).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(view.deps.feedback.toast.error).toHaveBeenCalledWith({
      title: '無法刪除景點',
      description: '請檢查網路連線後再試一次。',
    });
    expect(view.deps.refs.placeDeleteConfirmRef.current).toBe(false);
  });

  it('prevents duplicate delete submissions while confirmation is pending', async () => {
    let resolveConfirm;
    const confirmPromise = new Promise((resolve) => {
      resolveConfirm = resolve;
    });
    const view = renderUsePlaceActions(createDeps({
      feedback: {
        confirm: vi.fn(() => confirmPromise),
      },
    }));

    let firstDelete;
    await act(async () => {
      firstDelete = view.result.current.deleteItineraryItem('Day 1', { id: 'place-1', name: '早餐' });
      await view.result.current.deleteItineraryItem('Day 1', { id: 'place-1', name: '早餐' });
    });

    expect(view.deps.feedback.confirm).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConfirm(false);
      await firstDelete;
    });

    expect(persistItinerary).not.toHaveBeenCalled();
    expect(view.deps.refs.placeDeleteConfirmRef.current).toBe(false);
  });

  it('uses the latest itinerary after rerendering', async () => {
    const view = renderUsePlaceActions();
    view.update({
      data: {
        itinerary: {
          'Day 1': [
            { id: 'place-1', name: '早餐' },
            { id: 'place-2', name: '午餐' },
          ],
        },
      },
    });

    await act(async () => {
      await view.result.current.addPlaceFromSearch(
        'Day 1',
        createPlaceResult({ name: '晚餐' }),
        'google-place-dinner',
      );
    });

    const persisted = persistItinerary.mock.calls[0][0].itinerary;
    expect(persisted['Day 1'].map((item) => item.name)).toEqual(['早餐', '午餐', '晚餐']);
  });
});
