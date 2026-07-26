export const TRIP_CAPABILITY_KEYS = Object.freeze([
  'cloudSync',
  'collaboration',
  'sharing',
  'firebaseStorage',
  'localAttachmentStorage',
  'offlineCache',
  'featureTour',
  'export',
  'routeOptimization',
  'googleMaps',
  'resettable',
]);

const DEFAULT_TRIP_CAPABILITIES = Object.freeze(
  Object.fromEntries(TRIP_CAPABILITY_KEYS.map((key) => [key, false])),
);

export const FIREBASE_TRIP_CAPABILITIES = Object.freeze({
  ...DEFAULT_TRIP_CAPABILITIES,
  cloudSync: true,
  collaboration: true,
  sharing: true,
  firebaseStorage: true,
  offlineCache: true,
  featureTour: true,
  export: true,
  routeOptimization: true,
  googleMaps: true,
});

export const LOCAL_EXAMPLE_TRIP_CAPABILITIES = Object.freeze({
  ...DEFAULT_TRIP_CAPABILITIES,
  localAttachmentStorage: true,
  featureTour: true,
  export: true,
  routeOptimization: true,
  googleMaps: true,
  resettable: true,
});

export function normalizeTripCapabilities(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.freeze(Object.fromEntries(
    TRIP_CAPABILITY_KEYS.map((key) => [key, source[key] === true]),
  ));
}

export function hasTripCapability(capabilities, capability) {
  return TRIP_CAPABILITY_KEYS.includes(capability)
    && capabilities?.[capability] === true;
}
