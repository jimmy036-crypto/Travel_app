import { normalizeTripCapabilities } from './tripCapabilities.js';

export const TRIP_SNAPSHOT_KEYS = Object.freeze([
  'meta',
  'itinerary',
  'expenses',
  'settlements',
  'tickets',
  'checklist',
]);

export const TRIP_REPOSITORY_METHODS = Object.freeze([
  'subscribeTrip',
  'loadTrip',
  'updateMeta',
  'updateItinerary',
  'updateExpenses',
  'updateSettlements',
  'updateTickets',
  'updateChecklist',
  'uploadAttachment',
  'deleteAttachment',
  'readAttachment',
  'dispose',
  'getCapabilities',
]);

const isRecord = (value) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value),
);

export function defensiveTripCopy(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

export function createEmptyTripSnapshot() {
  return {
    meta: {},
    itinerary: {},
    expenses: [],
    settlements: [],
    tickets: [],
    checklist: [],
  };
}

export function normalizeTripSnapshot(value) {
  const source = isRecord(value) ? value : {};
  const snapshot = {
    meta: isRecord(source.meta) ? source.meta : {},
    itinerary: isRecord(source.itinerary) ? source.itinerary : {},
    expenses: Array.isArray(source.expenses) ? source.expenses : [],
    settlements: Array.isArray(source.settlements) ? source.settlements : [],
    tickets: Array.isArray(source.tickets) ? source.tickets : [],
    checklist: Array.isArray(source.checklist)
      ? source.checklist
      : (isRecord(source.checklist) ? Object.values(source.checklist).filter(Boolean) : []),
  };
  return defensiveTripCopy(snapshot);
}

export function assertTripRepository(repository) {
  if (!repository || typeof repository !== 'object') {
    throw new TypeError('Trip repository must be an object.');
  }

  const missing = TRIP_REPOSITORY_METHODS.filter(
    (method) => typeof repository[method] !== 'function',
  );
  if (missing.length > 0) {
    throw new TypeError(`Trip repository is missing methods: ${missing.join(', ')}`);
  }

  normalizeTripCapabilities(repository.getCapabilities());
  return repository;
}
