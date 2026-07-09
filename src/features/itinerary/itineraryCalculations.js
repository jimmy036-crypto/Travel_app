import { minsToTime, timeToMins } from '../../helpers.js';

export const DEFAULT_TRAVEL_MINUTES = 30;

const toFiniteNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const toNonNegativeNumber = (value, fallback = 0) => (
  Math.max(0, toFiniteNumber(value, fallback))
);

export const isValidClockTime = (value) => (
  /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim())
);

export const cloneRouteItems = (items) => (
  (Array.isArray(items) ? items : []).map((item) => ({
    ...item,
    tags: Array.isArray(item?.tags) ? [...item.tags] : [],
    resources: Array.isArray(item?.resources)
      ? item.resources.map((resource) => ({ ...resource }))
      : [],
    placePhoto: item?.placePhoto ? { ...item.placePhoto } : null,
    nextLeg: item?.nextLeg ? { ...item.nextLeg } : undefined,
  }))
);

export const getTravelMinutesForLeg = (
  item,
  duration,
  fallbackMinutes = DEFAULT_TRAVEL_MINUTES,
) => {
  if (item?.nextLeg?.mode && item.nextLeg.mode !== 'AUTO') {
    return toNonNegativeNumber(item.nextLeg.mins, 0);
  }

  const routeMinutes = Number(duration?.value);
  if (Number.isFinite(routeMinutes) && routeMinutes >= 0) {
    return routeMinutes;
  }

  return toNonNegativeNumber(fallbackMinutes, DEFAULT_TRAVEL_MINUTES);
};

export const calculateNextArrivalTime = ({
  arrivalTime,
  stayMinutes = 0,
  travelMinutes = DEFAULT_TRAVEL_MINUTES,
} = {}) => {
  const normalizedTime = String(arrivalTime || '').trim();
  if (!isValidClockTime(normalizedTime)) return '';

  return minsToTime(
    timeToMins(normalizedTime)
    + toNonNegativeNumber(stayMinutes, 0)
    + toNonNegativeNumber(travelMinutes, 0),
  );
};

export const recalculateArrivalTimes = (
  items,
  durations,
  anchorTime,
  fallbackMinutes = DEFAULT_TRAVEL_MINUTES,
) => {
  const list = cloneRouteItems(items);
  if (list.length === 0) return list;

  const anchor = String(anchorTime || list[0]?.time || '').trim();
  if (!isValidClockTime(anchor)) return list;

  list[0] = { ...list[0], time: anchor };

  for (let index = 1; index < list.length; index += 1) {
    const previousItem = list[index - 1];
    const nextTime = calculateNextArrivalTime({
      arrivalTime: previousItem.time,
      stayMinutes: previousItem.stayTime,
      travelMinutes: getTravelMinutesForLeg(
        previousItem,
        durations?.[index - 1],
        fallbackMinutes,
      ),
    });

    if (!nextTime) return list;
    list[index] = { ...list[index], time: nextTime };
  }

  return list;
};

export const recalculateArrivalTimesFromIndex = (
  items,
  startIndex,
  durations,
  fallbackMinutes = DEFAULT_TRAVEL_MINUTES,
) => {
  const list = cloneRouteItems(items);
  const normalizedStartIndex = Number(startIndex);

  if (
    !Number.isInteger(normalizedStartIndex)
    || normalizedStartIndex < 0
    || normalizedStartIndex >= list.length
    || !isValidClockTime(list[normalizedStartIndex]?.time)
  ) {
    return list;
  }

  for (let index = normalizedStartIndex + 1; index < list.length; index += 1) {
    const previousItem = list[index - 1];
    const nextTime = calculateNextArrivalTime({
      arrivalTime: previousItem.time,
      stayMinutes: previousItem.stayTime,
      travelMinutes: getTravelMinutesForLeg(
        previousItem,
        durations?.[index - 1],
        fallbackMinutes,
      ),
    });

    if (!nextTime) return list;
    list[index] = { ...list[index], time: nextTime };
  }

  return list;
};

export const moveArrayItem = (items, sourceIndex, destinationIndex) => {
  const list = cloneRouteItems(items);
  const from = Number(sourceIndex);
  const to = Number(destinationIndex);

  if (
    !Number.isInteger(from)
    || !Number.isInteger(to)
    || from < 0
    || from >= list.length
    || to < 0
    || to >= list.length
  ) {
    return {
      ok: false,
      noop: false,
      movedItem: null,
      items: list,
      error: 'INVALID_INDEX',
    };
  }

  if (from === to) {
    return {
      ok: true,
      noop: true,
      movedItem: list[from] || null,
      items: list,
      error: null,
    };
  }

  const [movedItem] = list.splice(from, 1);
  list.splice(to, 0, movedItem);

  return {
    ok: true,
    noop: false,
    movedItem,
    items: list,
    error: null,
  };
};

export const moveItineraryItem = ({
  itinerary,
  sourceDay,
  destinationDay,
  sourceIndex,
  destinationIndex,
  fallbackMinutes = DEFAULT_TRAVEL_MINUTES,
} = {}) => {
  const safeItinerary = itinerary && typeof itinerary === 'object'
    ? itinerary
    : {};
  const fromDay = String(sourceDay || '');
  const toDay = String(destinationDay || '');
  const fromIndex = Number(sourceIndex);
  const toIndex = Number(destinationIndex);

  if (!fromDay || !toDay) {
    return {
      ok: false,
      noop: false,
      error: 'INVALID_DAY',
      nextItinerary: safeItinerary,
      affectedDays: [],
      pendingRecalculations: {},
      movedItem: null,
    };
  }

  const sourceBefore = cloneRouteItems(safeItinerary[fromDay] || []);
  const sameDay = fromDay === toDay;
  const destinationBefore = sameDay
    ? sourceBefore
    : cloneRouteItems(safeItinerary[toDay] || []);

  const destinationUpperBound = sameDay
    ? sourceBefore.length - 1
    : destinationBefore.length;

  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || fromIndex >= sourceBefore.length
    || toIndex < 0
    || toIndex > destinationUpperBound
  ) {
    return {
      ok: false,
      noop: false,
      error: 'INVALID_INDEX',
      nextItinerary: safeItinerary,
      affectedDays: [],
      pendingRecalculations: {},
      movedItem: null,
    };
  }

  if (sameDay && fromIndex === toIndex) {
    return {
      ok: true,
      noop: true,
      error: null,
      nextItinerary: safeItinerary,
      affectedDays: [],
      pendingRecalculations: {},
      movedItem: sourceBefore[fromIndex] || null,
    };
  }

  const sourceAnchor = String(sourceBefore[0]?.time || '');
  const destinationAnchor = String(destinationBefore[0]?.time || '');
  const sourceItems = cloneRouteItems(sourceBefore);
  const destinationItems = sameDay
    ? sourceItems
    : cloneRouteItems(destinationBefore);

  const [movedItem] = sourceItems.splice(fromIndex, 1);
  destinationItems.splice(toIndex, 0, movedItem);

  const affectedDays = sameDay ? [fromDay] : [fromDay, toDay];
  const nextItinerary = { ...safeItinerary };
  const pendingRecalculations = {};

  if (sameDay) {
    const anchorTime = sourceAnchor || String(movedItem?.time || '');
    nextItinerary[fromDay] = recalculateArrivalTimes(
      sourceItems,
      null,
      anchorTime,
      fallbackMinutes,
    );
    pendingRecalculations[fromDay] = { anchorTime };
  } else {
    const sourceNextAnchor = sourceAnchor || String(sourceItems[0]?.time || '');
    const destinationNextAnchor = destinationAnchor
      || String(movedItem?.time || sourceAnchor || '');

    nextItinerary[fromDay] = recalculateArrivalTimes(
      sourceItems,
      null,
      sourceNextAnchor,
      fallbackMinutes,
    );
    nextItinerary[toDay] = recalculateArrivalTimes(
      destinationItems,
      null,
      destinationNextAnchor,
      fallbackMinutes,
    );

    if (sourceItems.length > 0) {
      pendingRecalculations[fromDay] = { anchorTime: sourceNextAnchor };
    }
    pendingRecalculations[toDay] = { anchorTime: destinationNextAnchor };
  }

  return {
    ok: true,
    noop: false,
    error: null,
    nextItinerary,
    affectedDays,
    pendingRecalculations,
    movedItem,
  };
};
