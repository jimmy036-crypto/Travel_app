import { get, onValue, ref as dbRef, update } from 'firebase/database';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';

import {
  buildOfflineTripSnapshot,
  writeOfflineTripSnapshot,
} from '../offline/offlineTripCache.js';
import { persistItinerary } from '../../services/placesService.js';
import {
  deleteTicketAttachment,
  uploadTicketAttachment,
} from '../../services/ticketsService.js';
import { FIREBASE_TRIP_CAPABILITIES } from './tripCapabilities.js';
import {
  assertTripRepository,
  normalizeTripSnapshot,
} from './tripRepositoryContract.js';

const FORBIDDEN_PATH_CHARACTERS = /[.#$[\]/]/;

const trimText = (value) => String(value ?? '').trim();

const assertTripId = (value) => {
  const tripId = trimText(value);
  if (!tripId || FORBIDDEN_PATH_CHARACTERS.test(tripId)) {
    throw new Error('tripId is invalid.');
  }
  return tripId;
};

const sanitizeFileName = (name) => trimText(name || 'attachment')
  .normalize('NFKC')
  .replace(/[^a-zA-Z0-9._-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 120) || 'attachment';

const toProgress = (snapshot) => {
  const total = Number(snapshot?.totalBytes) || 1;
  return Math.round((Number(snapshot?.bytesTransferred) / total) * 100);
};

const uploadFirebaseFile = ({
  storage,
  path,
  file,
  metadata,
  onProgress,
}) => new Promise((resolve, reject) => {
  const uploadTask = uploadBytesResumable(storageRef(storage, path), file, metadata);
  uploadTask.on(
    'state_changed',
    (snapshot) => onProgress?.(toProgress(snapshot)),
    reject,
    async () => {
      try {
        resolve({
          url: await getDownloadURL(uploadTask.snapshot.ref),
          storagePath: path,
        });
      } catch (error) {
        reject(error);
      }
    },
  );
});

export function createFirebaseTripRepository(options = {}) {
  const {
    db,
    storage,
    tripId: requestedTripId,
    offline = {
      buildSnapshot: buildOfflineTripSnapshot,
      writeSnapshot: writeOfflineTripSnapshot,
    },
  } = options;
  const tripId = assertTripId(requestedTripId);
  if (!db) throw new Error('Firebase Database is required.');

  const activeSubscriptions = new Set();
  let disposed = false;

  const assertActive = () => {
    if (disposed) throw new Error('Trip repository has been disposed.');
  };

  const writeBranch = async (branch, value) => {
    assertActive();
    await update(dbRef(db, `rooms/${tripId}`), { [branch]: value });
  };

  const repository = {
    subscribeTrip(onSnapshot, onError) {
      assertActive();
      const unsubscribe = onValue(
        dbRef(db, `rooms/${tripId}`),
        (snapshot) => {
          const value = snapshot.val();
          onSnapshot?.(value ? normalizeTripSnapshot(value) : null);
        },
        onError,
      );
      activeSubscriptions.add(unsubscribe);
      return () => {
        activeSubscriptions.delete(unsubscribe);
        unsubscribe();
      };
    },

    async loadTrip() {
      assertActive();
      const snapshot = await get(dbRef(db, `rooms/${tripId}`));
      return snapshot.exists() ? normalizeTripSnapshot(snapshot.val()) : null;
    },

    updateMeta(value) {
      return writeBranch('meta', value);
    },

    updateItinerary(value) {
      assertActive();
      return persistItinerary({ db, roomId: tripId, itinerary: value });
    },

    updateExpenses(value) {
      return writeBranch('expenses', value);
    },

    updateSettlements(value) {
      return writeBranch('settlements', value);
    },

    updateTickets(value) {
      return writeBranch('tickets', value);
    },

    async updateChecklist(patch) {
      assertActive();
      if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) return;
      await update(dbRef(db, `rooms/${tripId}/checklist`), patch);
    },

    async uploadAttachment(input = {}) {
      assertActive();
      if (!storage) throw new Error('Firebase Storage is required for attachments.');
      const scope = trimText(input.scope);
      if (scope === 'ticket') {
        return uploadTicketAttachment({
          storage,
          roomId: tripId,
          ticketId: input.ownerId,
          file: input.file,
          onProgress: input.onProgress,
        });
      }

      if (scope !== 'place') throw new Error('Attachment scope is invalid.');
      const ownerId = assertTripId(input.ownerId);
      const resourceId = sanitizeFileName(input.resourceId || 'attachment');
      const file = input.file;
      if (!file) throw new Error('Attachment file is required.');
      const contentType = trimText(file.type) || 'application/octet-stream';
      const timestamp = Number(input.timestamp) || Date.now();
      const storagePath = `rooms/${tripId}/places/${ownerId}/${timestamp}_${resourceId}_${sanitizeFileName(file.name)}`;
      const result = await uploadFirebaseFile({
        storage,
        path: storagePath,
        file,
        onProgress: input.onProgress,
        metadata: {
          contentType,
          customMetadata: {
            roomId: tripId,
            itemId: ownerId,
            resourceId,
            resourceType: trimText(input.resourceType || 'other'),
          },
        },
      });
      return {
        ...result,
        fileName: trimText(file.name || 'attachment'),
        contentType,
        size: Number(file.size || 0),
        uploadedAt: timestamp,
        attachmentKind: contentType === 'application/pdf' ? 'pdf' : 'image',
      };
    },

    async deleteAttachment(input) {
      assertActive();
      if (!storage) throw new Error('Firebase Storage is required for attachments.');
      const storagePath = trimText(
        typeof input === 'string' ? input : input?.storagePath,
      );
      if (!storagePath) return false;
      if (input?.scope === 'ticket') {
        return deleteTicketAttachment({ storage, storagePath });
      }
      await deleteObject(storageRef(storage, storagePath));
      return true;
    },

    async readAttachment(input) {
      assertActive();
      const directUrl = trimText(input?.url);
      if (directUrl) return directUrl;
      if (!storage) throw new Error('Firebase Storage is required for attachments.');
      const storagePath = trimText(
        typeof input === 'string' ? input : input?.storagePath,
      );
      if (!storagePath) return '';
      return getDownloadURL(storageRef(storage, storagePath));
    },

    writeOfflineSnapshot(input) {
      assertActive();
      const snapshot = offline.buildSnapshot({ ...input, roomId: tripId });
      return snapshot ? offline.writeSnapshot(snapshot) : null;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      activeSubscriptions.forEach((unsubscribe) => unsubscribe());
      activeSubscriptions.clear();
    },

    getCapabilities() {
      return FIREBASE_TRIP_CAPABILITIES;
    },

    getTripId() {
      return tripId;
    },
  };

  return assertTripRepository(repository);
}
