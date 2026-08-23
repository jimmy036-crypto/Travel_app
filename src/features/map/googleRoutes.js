const ROUTE_FIELDS = Object.freeze(['path', 'legs']);
const ROUTE_TOTAL_FIELDS = Object.freeze(['legs']);
const OPTIMIZED_ROUTE_FIELDS = Object.freeze(['legs', 'optimizedIntermediateWaypointIndices']);

const toLocation = (item) => ({
  lat: Number(item?.lat),
  lng: Number(item?.lng),
});

export const buildDrivingRouteRequest = (items, options = {}) => {
  const points = Array.isArray(items) ? items : [];
  const optimizeWaypointOrder = options.optimizeWaypointOrder === true;
  const includePath = options.includePath === true;

  return {
    origin: toLocation(points[0]),
    destination: toLocation(points[points.length - 1]),
    intermediates: points.slice(1, -1).map((item) => ({ location: toLocation(item) })),
    travelMode: 'DRIVING',
    optimizeWaypointOrder,
    fields: includePath
      ? ROUTE_FIELDS
      : (optimizeWaypointOrder ? OPTIMIZED_ROUTE_FIELDS : ROUTE_TOTAL_FIELDS),
  };
};

export const getRouteLegMinutes = (leg) => (
  Math.max(1, Math.round(Number(leg?.durationMillis || 0) / 60000))
);

export const getRouteTotals = (route) => {
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  return legs.reduce((totals, leg) => ({
    minutes: totals.minutes + Math.max(0, Math.round(Number(leg?.durationMillis || 0) / 60000)),
    meters: totals.meters + Math.max(0, Number(leg?.distanceMeters || 0)),
  }), { minutes: 0, meters: 0 });
};

export const getOptimizedIntermediateOrder = (route, intermediateCount) => {
  const count = Math.max(0, Number(intermediateCount) || 0);
  const fallback = Array.from({ length: count }, (_, index) => index);
  const order = Array.isArray(route?.optimizedIntermediateWaypointIndices)
    ? route.optimizedIntermediateWaypointIndices
    : [];
  const isCompletePermutation = order.length === count
    && new Set(order).size === count
    && order.every((index) => Number.isInteger(index) && index >= 0 && index < count);

  return isCompletePermutation ? [...order] : fallback;
};

export const computeDrivingRouteOptimization = async (Route, items) => {
  const intermediateCount = Math.max(0, (Array.isArray(items) ? items.length : 0) - 2);
  const [currentResponse, optimizedResponse] = await Promise.all([
    Route.computeRoutes(buildDrivingRouteRequest(items)),
    Route.computeRoutes(buildDrivingRouteRequest(items, { optimizeWaypointOrder: true })),
  ]);
  const currentRoute = currentResponse.routes?.[0];
  const optimizedRoute = optimizedResponse.routes?.[0];

  return {
    currentRoute,
    optimizedRoute,
    order: getOptimizedIntermediateOrder(optimizedRoute, intermediateCount),
  };
};
