const EXAMPLE_TRIP_VISIBILITY_KEY = 'travel-app-example-trip-visibility-v1';
const HIDDEN_VALUE = 'hidden';

export function isExampleTripHidden(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(EXAMPLE_TRIP_VISIBILITY_KEY) === HIDDEN_VALUE;
  } catch {
    return false;
  }
}

export function setExampleTripHidden(hidden, storage = globalThis.localStorage) {
  try {
    if (hidden) storage?.setItem(EXAMPLE_TRIP_VISIBILITY_KEY, HIDDEN_VALUE);
    else storage?.removeItem(EXAMPLE_TRIP_VISIBILITY_KEY);
    return true;
  } catch {
    return false;
  }
}

export { EXAMPLE_TRIP_VISIBILITY_KEY };
