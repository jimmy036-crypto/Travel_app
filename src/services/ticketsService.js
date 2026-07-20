import { ref as dbRef, update } from 'firebase/database';
import {
  deleteObject,
  getDownloadURL,
  ref as storageRef,
  uploadBytesResumable,
} from 'firebase/storage';

const MAX_TICKET_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_UPLOAD_TIMEOUT_MS = 30_000;
const FIREBASE_FORBIDDEN_KEY_CHARS = /[.#$[\]/]/;
const SAFE_REVISION_PATTERN = /^[a-z\d_-]+$/i;
const CONTENT_TYPE_BY_EXTENSION = Object.freeze({
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
});
const ALLOWED_CONTENT_TYPES = new Set(Object.values(CONTENT_TYPE_BY_EXTENSION));

const trimText = (value) => String(value ?? '').trim();

const assertFirebasePathSegment = (value, label) => {
  const segment = trimText(value);
  if (!segment || FIREBASE_FORBIDDEN_KEY_CHARS.test(segment)) {
    throw new Error(`${label} is invalid.`);
  }
  return segment;
};

const getFileExtension = (name) => {
  const normalizedName = trimText(name).toLowerCase();
  const separator = normalizedName.lastIndexOf('.');
  return separator >= 0 ? normalizedName.slice(separator + 1) : '';
};

const normalizeTicketFile = (file) => {
  if (!file || typeof file !== 'object') {
    throw new Error('A ticket attachment file is required.');
  }

  const declaredContentType = trimText(file.type).toLowerCase();
  const inferredContentType = CONTENT_TYPE_BY_EXTENSION[getFileExtension(file.name)] || '';
  const contentType = declaredContentType || inferredContentType;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new Error('Ticket attachment MIME type is not allowed.');
  }

  const size = Number(file.size);
  if (!Number.isFinite(size) || size < 0) {
    throw new Error('Ticket attachment size is invalid.');
  }
  if (size > MAX_TICKET_FILE_BYTES) {
    throw new Error('Ticket attachment exceeds the 10 MiB limit.');
  }

  return {
    contentType,
    attachmentKind: contentType === 'application/pdf' ? 'pdf' : 'image',
    size,
  };
};

const notifyProgress = (onProgress, value) => {
  if (typeof onProgress !== 'function') return;
  const progress = Math.min(100, Math.max(0, Number(value) || 0));
  onProgress(progress);
};

const createUploadTimeoutError = () => {
  const error = new Error('Ticket attachment upload timed out.');
  error.code = 'ticket/upload-timeout';
  return error;
};

const isFileValue = (value) => (
  (typeof File !== 'undefined' && value instanceof File)
  || Object.prototype.toString.call(value) === '[object File]'
);

const assertDatabaseSafeValue = (value, seen = new Set()) => {
  if (value === undefined) throw new Error('Ticket records cannot contain undefined.');
  if (isFileValue(value)) throw new Error('Ticket records cannot contain File values.');
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
    throw new Error('Ticket records contain a non-serializable value.');
  }
  if (value === null || typeof value !== 'object') return;
  if (seen.has(value)) throw new Error('Ticket records cannot contain circular references.');

  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item) => assertDatabaseSafeValue(item, seen));
  } else {
    Object.values(value).forEach((item) => assertDatabaseSafeValue(item, seen));
  }
  seen.delete(value);
};

export function sanitizeTicketFileName(name) {
  return trimText(name || 'ticket')
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'ticket';
}

export function createTicketAttachmentRevision() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(4);
    globalThis.crypto.getRandomValues(values);
    return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
  }

  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 13)}`;
}

export function buildTicketStoragePath({
  roomId,
  ticketId,
  revision,
  fileName,
}) {
  const safeRoomId = assertFirebasePathSegment(roomId, 'roomId');
  const safeTicketId = assertFirebasePathSegment(ticketId, 'ticketId');
  const safeRevision = trimText(revision);
  if (!SAFE_REVISION_PATTERN.test(safeRevision)) {
    throw new Error('revision is invalid.');
  }

  return `rooms/${safeRoomId}/tickets/${safeTicketId}/${safeRevision}_${sanitizeTicketFileName(fileName)}`;
}

export async function uploadTicketAttachment({
  storage,
  roomId,
  ticketId,
  file,
  onProgress,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
}) {
  if (!storage) throw new Error('Firebase Storage is required to upload a ticket attachment.');
  const safeRoomId = assertFirebasePathSegment(roomId, 'roomId');
  const safeTicketId = assertFirebasePathSegment(ticketId, 'ticketId');
  const normalizedFile = normalizeTicketFile(file);
  const fileName = sanitizeTicketFileName(file.name);
  const revision = createTicketAttachmentRevision();
  const storagePath = buildTicketStoragePath({
    roomId: safeRoomId,
    ticketId: safeTicketId,
    revision,
    fileName,
  });
  const fileRef = storageRef(storage, storagePath);
  const uploadTask = uploadBytesResumable(fileRef, file, {
    contentType: normalizedFile.contentType,
    customMetadata: {
      roomId: safeRoomId,
      ticketId: safeTicketId,
    },
  });
  const safeTimeoutMs = Number.isFinite(Number(timeoutMs)) && Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : DEFAULT_UPLOAD_TIMEOUT_MS;

  notifyProgress(onProgress, 0);

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return false;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
      return true;
    };
    const timeoutId = globalThis.setTimeout(() => {
      if (settled) return;
      uploadTask.cancel();
      finish(() => reject(createUploadTimeoutError()));
    }, safeTimeoutMs);

    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const totalBytes = Number(snapshot?.totalBytes);
        const bytesTransferred = Number(snapshot?.bytesTransferred);
        const progress = totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0;
        notifyProgress(onProgress, progress);
      },
      (error) => {
        finish(() => reject(error));
      },
      async () => {
        if (settled) return;
        try {
          const url = await getDownloadURL(uploadTask.snapshot.ref);
          notifyProgress(onProgress, 100);
          finish(() => resolve({
            url,
            storagePath,
            attachmentKind: normalizedFile.attachmentKind,
            fileName,
            contentType: normalizedFile.contentType,
            size: normalizedFile.size,
          }));
        } catch (error) {
          finish(() => reject(error));
        }
      },
    );
  });
}

export async function deleteTicketAttachment({ storage, storagePath }) {
  const safeStoragePath = trimText(storagePath);
  if (!safeStoragePath) return { deleted: false, reason: 'empty-path' };
  if (!storage) throw new Error('Firebase Storage is required to delete a ticket attachment.');

  try {
    await deleteObject(storageRef(storage, safeStoragePath));
    return { deleted: true, reason: 'deleted' };
  } catch (error) {
    if (error?.code === 'storage/object-not-found') {
      return { deleted: false, reason: 'not-found' };
    }
    throw error;
  }
}

export function persistTickets({ db, roomId, tickets }) {
  if (!db) throw new Error('Firebase Database is required to persist tickets.');
  const safeRoomId = assertFirebasePathSegment(roomId, 'roomId');
  if (!Array.isArray(tickets)) throw new Error('tickets must be an array.');
  assertDatabaseSafeValue(tickets);

  return update(dbRef(db, `rooms/${safeRoomId}`), { tickets });
}
