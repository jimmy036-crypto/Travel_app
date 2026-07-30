import { createTokyoDemoTrip } from '../onboarding/demoTripData.js';
import {
  LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE,
  LOCAL_EXAMPLE_SCHEMA_VERSION,
  LOCAL_EXAMPLE_TEMPLATE_VERSION,
  LOCAL_EXAMPLE_TRIP_ID,
  sanitizeExampleVisibleText,
  withExampleTitleSuffix,
} from './exampleTripConstants.js';
import {
  createLocalExampleAttachmentStore,
  createLocalExampleTripRecordStore,
} from './localExampleAttachmentStore.js';
import { LOCAL_EXAMPLE_TRIP_CAPABILITIES } from './tripCapabilities.js';
import {
  assertTripRepository,
  defensiveTripCopy,
  normalizeTripSnapshot,
} from './tripRepositoryContract.js';

const isRecord = (value) => Boolean(
  value
  && typeof value === 'object'
  && !Array.isArray(value),
);

const sanitizeTemplateValue = (value) => {
  if (typeof value === 'string') return sanitizeExampleVisibleText(value);
  if (Array.isArray(value)) return value.map(sanitizeTemplateValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeTemplateValue(item)]),
  );
};

const isStructurallyValidEnvelope = (value) => (
  isRecord(value)
  && value.schemaVersion === LOCAL_EXAMPLE_SCHEMA_VERSION
  && typeof value.templateVersion === 'string'
  && value.templateVersion.length > 0
  && value.tripId === LOCAL_EXAMPLE_TRIP_ID
  && Number.isInteger(value.revision)
  && value.revision >= 0
  && isRecord(value.snapshot)
  && isRecord(value.snapshot.meta)
  && isRecord(value.snapshot.itinerary)
  && Array.isArray(value.snapshot.expenses)
  && Array.isArray(value.snapshot.settlements)
  && Array.isArray(value.snapshot.tickets)
  && Array.isArray(value.snapshot.checklist)
);

const V2_PRE_TRIP_EXPENSE_IDS = new Set([
  'demo-expense-pretrip-deposit',
  'demo-expense-pretrip-pass',
  'demo-expense-pretrip-insurance',
]);

const migrateV1SnapshotToV2 = (storedSnapshot, templateSnapshot) => {
  const next = normalizeTripSnapshot(storedSnapshot);
  const template = normalizeTripSnapshot(templateSnapshot);
  const canonicalPlaces = new Map(
    Object.values(template.itinerary)
      .flatMap((items) => (Array.isArray(items) ? items : []))
      .map((item) => [String(item?.id || ''), item]),
  );

  next.itinerary = Object.fromEntries(
    Object.entries(next.itinerary).map(([dayId, items]) => [
      dayId,
      (Array.isArray(items) ? items : []).map((item) => {
        const canonical = canonicalPlaces.get(String(item?.id || ''));
        if (!canonical) return item;
        const migrated = { ...item };
        if (
          (!Number.isFinite(Number(item?.lat)) || !Number.isFinite(Number(item?.lng)))
          && Number.isFinite(Number(canonical?.lat))
          && Number.isFinite(Number(canonical?.lng))
        ) {
          migrated.lat = Number(canonical.lat);
          migrated.lng = Number(canonical.lng);
        }
        if (!migrated.coordinateSource && canonical.coordinateSource) {
          migrated.coordinateSource = canonical.coordinateSource;
        }
        if (migrated.nextLeg?.mode === 'DEMO' && canonical.nextLeg?.mode === 'AUTO') {
          migrated.nextLeg = { ...migrated.nextLeg, mode: 'AUTO' };
        }
        return migrated;
      }),
    ]),
  );

  const existingExpenseIds = new Set(next.expenses.map((expense) => String(expense?.id || '')));
  const addedExpenses = template.expenses.filter((expense) => (
    V2_PRE_TRIP_EXPENSE_IDS.has(String(expense?.id || ''))
    && !existingExpenseIds.has(String(expense?.id || ''))
  ));
  next.expenses = [...next.expenses, ...addedExpenses];
  return next;
};

const createWriteError = (error) => Object.assign(
  new Error(LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE, { cause: error }),
  { code: 'LOCAL_EXAMPLE_WRITE_FAILED' },
);

const isDatabaseUnavailable = (error) => (
  String(error?.code || '').startsWith('LOCAL_EXAMPLE_INDEXEDDB_')
);

export function createLocalExampleTemplateSnapshot(options = {}) {
  const template = (options.createTemplate || createTokyoDemoTrip)(options.templateOptions);
  const sanitized = sanitizeTemplateValue(defensiveTripCopy(template));
  const snapshot = normalizeTripSnapshot({
    ...sanitized,
    meta: {
      ...(sanitized.meta || {}),
      title: withExampleTitleSuffix(template?.meta?.title),
    },
    settlements: Array.isArray(sanitized.settlements) ? sanitized.settlements : [],
  });
  return snapshot;
}

const createEnvelope = (
  snapshot,
  revision = 0,
  templateVersion = LOCAL_EXAMPLE_TEMPLATE_VERSION,
) => ({
  schemaVersion: LOCAL_EXAMPLE_SCHEMA_VERSION,
  templateVersion,
  tripId: LOCAL_EXAMPLE_TRIP_ID,
  revision,
  snapshot: normalizeTripSnapshot(snapshot),
  updatedAt: new Date().toISOString(),
});

const attachmentPath = (value) => {
  const path = String(value || '');
  return path.startsWith(`${LOCAL_EXAMPLE_TRIP_ID}/attachments/`) ? path : '';
};

const hydrateAttachment = async (value, attachmentStore) => {
  if (!isRecord(value)) return value;
  const storagePath = attachmentPath(value.storagePath);
  if (!storagePath) return value;
  const url = await attachmentStore.createObjectUrl(storagePath);
  return url ? { ...value, url } : value;
};

const hydrateSnapshotAttachments = async (snapshot, attachmentStore) => {
  const hydrated = defensiveTripCopy(snapshot);
  hydrated.tickets = await Promise.all(hydrated.tickets.map(
    (ticket) => hydrateAttachment(ticket, attachmentStore),
  ));
  const dayEntries = await Promise.all(Object.entries(hydrated.itinerary).map(
    async ([dayId, places]) => [
      dayId,
      await Promise.all((Array.isArray(places) ? places : []).map(async (place) => ({
        ...place,
        placePhoto: await hydrateAttachment(place?.placePhoto, attachmentStore),
        resources: await Promise.all((Array.isArray(place?.resources) ? place.resources : []).map(
          (resource) => hydrateAttachment(resource, attachmentStore),
        )),
      }))),
    ],
  ));
  hydrated.itinerary = Object.fromEntries(dayEntries);
  return hydrated;
};

export function createLocalExampleTripRepository(options = {}) {
  const recordStore = options.recordStore || createLocalExampleTripRecordStore({
    indexedDB: options.indexedDB,
    databasePromise: options.databasePromise,
  });
  const attachmentStore = options.attachmentStore || createLocalExampleAttachmentStore({
    indexedDB: options.indexedDB,
    databasePromise: options.databasePromise,
    urlApi: options.urlApi,
  });
  const createTemplate = () => createLocalExampleTemplateSnapshot(options);
  const listeners = new Set();
  let envelope = null;
  let loadPromise = null;
  let disposed = false;
  let persistence = 'indexedDB';
  let recoveryReason = null;

  const reportPersistenceError = (error) => {
    options.onPersistenceError?.({
      message: LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE,
      error,
      persistence,
    });
  };

  const assertActive = () => {
    if (disposed) throw new Error('Trip repository has been disposed.');
  };

  const visibleSnapshot = async () => hydrateSnapshotAttachments(
    envelope.snapshot,
    attachmentStore,
  );

  const notify = async () => {
    const snapshot = await visibleSnapshot();
    listeners.forEach((listener) => listener(defensiveTripCopy(snapshot)));
  };

  const persistEnvelope = async (nextEnvelope) => {
    try {
      await recordStore.write(defensiveTripCopy(nextEnvelope));
      persistence = 'indexedDB';
      return nextEnvelope;
    } catch (error) {
      if (isDatabaseUnavailable(error)) {
        persistence = 'memory';
        reportPersistenceError(error);
        return nextEnvelope;
      }
      reportPersistenceError(error);
      throw createWriteError(error);
    }
  };

  const initialize = async () => {
    assertActive();
    let stored;
    try {
      stored = await recordStore.read();
    } catch (error) {
      if (!isDatabaseUnavailable(error)) throw error;
      persistence = 'memory';
      recoveryReason = 'indexeddb-unavailable';
      reportPersistenceError(error);
      envelope = createEnvelope(createTemplate());
      return envelope;
    }

    if (
      stored
      && isStructurallyValidEnvelope(stored)
      && stored.templateVersion === LOCAL_EXAMPLE_TEMPLATE_VERSION
    ) {
      envelope = createEnvelope(stored.snapshot, stored.revision);
      envelope.updatedAt = stored.updatedAt;
      return envelope;
    }

    if (
      stored
      && isStructurallyValidEnvelope(stored)
      && stored.templateVersion === '1.0.0'
    ) {
      envelope = createEnvelope(
        migrateV1SnapshotToV2(stored.snapshot, createTemplate()),
        stored.revision + 1,
      );
      recoveryReason = 'template-migrated';
      await persistEnvelope(envelope);
      return envelope;
    }

    if (stored && isStructurallyValidEnvelope(stored)) {
      envelope = createEnvelope(
        stored.snapshot,
        stored.revision,
        stored.templateVersion,
      );
      envelope.updatedAt = stored.updatedAt;
      recoveryReason = 'template-update-available';
      return envelope;
    }

    recoveryReason = stored
      ? (
        stored.schemaVersion !== LOCAL_EXAMPLE_SCHEMA_VERSION
        || stored.templateVersion !== LOCAL_EXAMPLE_TEMPLATE_VERSION
          ? 'incompatible-version'
          : 'corrupted'
      )
      : 'missing';
    envelope = createEnvelope(createTemplate());
    await persistEnvelope(envelope);
    return envelope;
  };

  const ensureLoaded = () => {
    if (!loadPromise) loadPromise = initialize();
    return loadPromise;
  };

  const updateSnapshotBranch = async (branch, value) => {
    assertActive();
    await ensureLoaded();
    const nextSnapshot = normalizeTripSnapshot({
      ...envelope.snapshot,
      [branch]: defensiveTripCopy(value),
    });
    const nextEnvelope = createEnvelope(nextSnapshot, envelope.revision + 1);
    await persistEnvelope(nextEnvelope);
    envelope = nextEnvelope;
    await notify();
    return defensiveTripCopy(await visibleSnapshot());
  };

  const repository = {
    subscribeTrip(onSnapshot, onError) {
      assertActive();
      if (typeof onSnapshot !== 'function') throw new TypeError('Trip listener is required.');
      listeners.add(onSnapshot);
      void ensureLoaded()
        .then(visibleSnapshot)
        .then((snapshot) => {
          if (listeners.has(onSnapshot)) onSnapshot(defensiveTripCopy(snapshot));
        })
        .catch((error) => onError?.(error));
      return () => listeners.delete(onSnapshot);
    },

    async loadTrip() {
      assertActive();
      await ensureLoaded();
      return defensiveTripCopy(await visibleSnapshot());
    },

    updateMeta(value) {
      return updateSnapshotBranch('meta', value);
    },

    updateItinerary(value) {
      return updateSnapshotBranch('itinerary', value);
    },

    updateExpenses(value) {
      return updateSnapshotBranch('expenses', value);
    },

    updateSettlements(value) {
      return updateSnapshotBranch('settlements', value);
    },

    updateTickets(value) {
      return updateSnapshotBranch('tickets', value);
    },

    async updateChecklist(patch) {
      await ensureLoaded();
      if (Array.isArray(patch)) return updateSnapshotBranch('checklist', patch);
      const byId = new Map(envelope.snapshot.checklist.map((item) => [String(item.id), item]));
      Object.entries(isRecord(patch) ? patch : {}).forEach(([id, value]) => {
        if (value === null) byId.delete(String(id));
        else byId.set(String(id), { ...value, id: String(value?.id || id) });
      });
      return updateSnapshotBranch('checklist', [...byId.values()]);
    },

    async uploadAttachment(input = {}) {
      assertActive();
      await ensureLoaded();
      const file = input.file || input.blob;
      if (!(file instanceof Blob)) throw new Error('Attachment file is required.');
      const id = String(
        input.attachmentId
        || globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );
      const saved = await attachmentStore.putAttachment({
        id,
        file,
        fileName: file.name || input.fileName,
        contentType: file.type || input.contentType,
      });
      const url = await attachmentStore.createObjectUrl(saved.storagePath);
      input.onProgress?.(100);
      return {
        url,
        storagePath: saved.storagePath,
        fileName: saved.fileName,
        contentType: saved.contentType,
        size: saved.size,
        uploadedAt: saved.updatedAt,
        attachmentKind: saved.contentType === 'application/pdf' ? 'pdf' : 'image',
      };
    },

    async deleteAttachment(input) {
      assertActive();
      const storagePath = typeof input === 'string' ? input : input?.storagePath;
      return attachmentStore.deleteAttachment(storagePath);
    },

    async readAttachment(input) {
      assertActive();
      const storagePath = typeof input === 'string' ? input : input?.storagePath;
      return attachmentStore.createObjectUrl(storagePath);
    },

    async reset() {
      assertActive();
      await ensureLoaded();
      await attachmentStore.clear();
      const nextEnvelope = createEnvelope(createTemplate(), envelope.revision + 1);
      await persistEnvelope(nextEnvelope);
      envelope = nextEnvelope;
      recoveryReason = 'reset';
      await notify();
      return defensiveTripCopy(await visibleSnapshot());
    },

    async removeLocalData() {
      assertActive();
      await attachmentStore.clear();
      try {
        await recordStore.clear();
      } catch (error) {
        if (!isDatabaseUnavailable(error)) throw error;
        persistence = 'memory';
      }
      envelope = null;
      loadPromise = null;
      recoveryReason = 'removed';
      return true;
    },

    async restoreCurrentTemplate() {
      assertActive();
      await attachmentStore.clear();
      const nextEnvelope = createEnvelope(createTemplate(), 0);
      await persistEnvelope(nextEnvelope);
      envelope = nextEnvelope;
      loadPromise = Promise.resolve(nextEnvelope);
      recoveryReason = 'restored';
      await notify();
      return defensiveTripCopy(await visibleSnapshot());
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      void attachmentStore.dispose();
      void recordStore.close?.();
    },

    getCapabilities() {
      return LOCAL_EXAMPLE_TRIP_CAPABILITIES;
    },

    getTripId() {
      return LOCAL_EXAMPLE_TRIP_ID;
    },

    getPersistenceState() {
      return {
        persistence,
        recoveryReason,
      };
    },
  };

  return assertTripRepository(repository);
}
