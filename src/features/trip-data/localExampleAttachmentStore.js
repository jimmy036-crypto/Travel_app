import {
  LOCAL_EXAMPLE_ATTACHMENT_STORE,
  LOCAL_EXAMPLE_DATABASE_NAME,
  LOCAL_EXAMPLE_DATABASE_VERSION,
  LOCAL_EXAMPLE_TRIP_ID,
  LOCAL_EXAMPLE_TRIP_STORE,
} from './exampleTripConstants.js';

const copyBlob = (blob) => (
  blob instanceof Blob
    ? blob.slice(0, blob.size, blob.type)
    : blob
);

const copyBuffer = (buffer) => (
  buffer instanceof ArrayBuffer ? buffer.slice(0) : buffer
);

const blobFromRecord = (record) => {
  if (record?.blob instanceof Blob) return copyBlob(record.blob);
  if (record?.bytes instanceof ArrayBuffer) {
    return new Blob(
      [copyBuffer(record.bytes)],
      { type: record.contentType || 'application/octet-stream' },
    );
  }
  return null;
};

const requestResult = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
});

const transactionDone = (transaction) => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted.'));
});

export function openLocalExampleDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb || typeof indexedDb.open !== 'function') {
    return Promise.reject(Object.assign(
      new Error('IndexedDB is unavailable.'),
      { code: 'LOCAL_EXAMPLE_INDEXEDDB_UNAVAILABLE' },
    ));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(
      LOCAL_EXAMPLE_DATABASE_NAME,
      LOCAL_EXAMPLE_DATABASE_VERSION,
    );
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LOCAL_EXAMPLE_TRIP_STORE)) {
        database.createObjectStore(LOCAL_EXAMPLE_TRIP_STORE);
      }
      if (!database.objectStoreNames.contains(LOCAL_EXAMPLE_ATTACHMENT_STORE)) {
        database.createObjectStore(LOCAL_EXAMPLE_ATTACHMENT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open IndexedDB.'));
    request.onblocked = () => reject(Object.assign(
      new Error('IndexedDB upgrade is blocked.'),
      { code: 'LOCAL_EXAMPLE_INDEXEDDB_BLOCKED' },
    ));
  });
}

export function createLocalExampleTripRecordStore(options = {}) {
  let databasePromise = options.databasePromise || null;
  const getDatabase = () => {
    if (!databasePromise) databasePromise = openLocalExampleDatabase(options.indexedDB);
    return databasePromise;
  };

  return {
    async read() {
      const database = await getDatabase();
      const transaction = database.transaction(LOCAL_EXAMPLE_TRIP_STORE, 'readonly');
      return requestResult(
        transaction.objectStore(LOCAL_EXAMPLE_TRIP_STORE).get(LOCAL_EXAMPLE_TRIP_ID),
      );
    },
    async write(value) {
      const database = await getDatabase();
      const transaction = database.transaction(LOCAL_EXAMPLE_TRIP_STORE, 'readwrite');
      transaction.objectStore(LOCAL_EXAMPLE_TRIP_STORE).put(value, LOCAL_EXAMPLE_TRIP_ID);
      await transactionDone(transaction);
      return value;
    },
    async clear() {
      const database = await getDatabase();
      const transaction = database.transaction(LOCAL_EXAMPLE_TRIP_STORE, 'readwrite');
      transaction.objectStore(LOCAL_EXAMPLE_TRIP_STORE).delete(LOCAL_EXAMPLE_TRIP_ID);
      await transactionDone(transaction);
    },
    async close() {
      try {
        const database = await getDatabase();
        database.close();
      } catch {
        // An unavailable database has nothing to close.
      }
    },
  };
}

export function createLocalExampleAttachmentStore(options = {}) {
  let databasePromise = options.databasePromise || null;
  const getDatabase = () => {
    if (!databasePromise) databasePromise = openLocalExampleDatabase(options.indexedDB);
    return databasePromise;
  };
  const urlApi = options.urlApi || globalThis.URL;
  const memoryAttachments = new Map();
  const objectUrls = new Map();
  let persistence = 'indexedDB';
  let disposed = false;

  const assertActive = () => {
    if (disposed) throw new Error('Attachment store has been disposed.');
  };

  const withDatabase = async (operation, fallback) => {
    try {
      const database = await getDatabase();
      return await operation(database);
    } catch (error) {
      if (error?.code !== 'LOCAL_EXAMPLE_INDEXEDDB_UNAVAILABLE') throw error;
      persistence = 'memory';
      return fallback();
    }
  };

  const revokeForId = (id) => {
    const url = objectUrls.get(id);
    if (url) urlApi?.revokeObjectURL?.(url);
    objectUrls.delete(id);
  };

  const store = {
    async putAttachment(input = {}) {
      assertActive();
      const id = String(
        input.id
        || globalThis.crypto?.randomUUID?.()
        || `${Date.now()}-${Math.random()}`,
      );
      const blob = copyBlob(input.blob || input.file);
      if (!(blob instanceof Blob)) throw new Error('Attachment must be a Blob.');
      const record = {
        id,
        bytes: await blob.arrayBuffer(),
        fileName: String(input.fileName || input.file?.name || 'attachment'),
        contentType: String(input.contentType || blob.type || 'application/octet-stream'),
        size: Number(blob.size || 0),
        updatedAt: Number(input.updatedAt || Date.now()),
      };

      await withDatabase(
        async (database) => {
          const transaction = database.transaction(LOCAL_EXAMPLE_ATTACHMENT_STORE, 'readwrite');
          transaction.objectStore(LOCAL_EXAMPLE_ATTACHMENT_STORE).put(record, id);
          await transactionDone(transaction);
        },
        () => memoryAttachments.set(id, record),
      );
      revokeForId(id);
      return {
        ...record,
        bytes: copyBuffer(record.bytes),
        blob: copyBlob(blob),
        storagePath: `${LOCAL_EXAMPLE_TRIP_ID}/attachments/${id}`,
      };
    },

    async getAttachment(idOrPath) {
      assertActive();
      const id = String(idOrPath || '').split('/').filter(Boolean).at(-1) || '';
      if (!id) return null;
      const record = await withDatabase(
        async (database) => {
          const transaction = database.transaction(LOCAL_EXAMPLE_ATTACHMENT_STORE, 'readonly');
          return requestResult(
            transaction.objectStore(LOCAL_EXAMPLE_ATTACHMENT_STORE).get(id),
          );
        },
        () => memoryAttachments.get(id) || null,
      );
      if (!record) return null;
      const blob = blobFromRecord(record);
      return blob
        ? { ...record, bytes: copyBuffer(record.bytes), blob }
        : null;
    },

    async createObjectUrl(idOrPath) {
      assertActive();
      const id = String(idOrPath || '').split('/').filter(Boolean).at(-1) || '';
      if (!id) return '';
      if (objectUrls.has(id)) return objectUrls.get(id);
      const record = await store.getAttachment(id);
      if (!record?.blob || typeof urlApi?.createObjectURL !== 'function') return '';
      const url = urlApi.createObjectURL(record.blob);
      objectUrls.set(id, url);
      return url;
    },

    async deleteAttachment(idOrPath) {
      assertActive();
      const id = String(idOrPath || '').split('/').filter(Boolean).at(-1) || '';
      if (!id) return false;
      await withDatabase(
        async (database) => {
          const transaction = database.transaction(LOCAL_EXAMPLE_ATTACHMENT_STORE, 'readwrite');
          transaction.objectStore(LOCAL_EXAMPLE_ATTACHMENT_STORE).delete(id);
          await transactionDone(transaction);
        },
        () => memoryAttachments.delete(id),
      );
      revokeForId(id);
      return true;
    },

    async clear() {
      assertActive();
      await withDatabase(
        async (database) => {
          const transaction = database.transaction(LOCAL_EXAMPLE_ATTACHMENT_STORE, 'readwrite');
          transaction.objectStore(LOCAL_EXAMPLE_ATTACHMENT_STORE).clear();
          await transactionDone(transaction);
        },
        () => memoryAttachments.clear(),
      );
      objectUrls.forEach((url) => urlApi?.revokeObjectURL?.(url));
      objectUrls.clear();
    },

    getPersistence() {
      return persistence;
    },

    async dispose() {
      if (disposed) return;
      objectUrls.forEach((url) => urlApi?.revokeObjectURL?.(url));
      objectUrls.clear();
      disposed = true;
      try {
        const database = await getDatabase();
        database.close();
      } catch {
        // An unavailable database has nothing to close.
      }
    },
  };

  return store;
}
