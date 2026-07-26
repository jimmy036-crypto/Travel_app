import { describe, expect, it, vi } from 'vitest';

import { createLocalExampleAttachmentStore } from './localExampleAttachmentStore.js';

const unavailableIndexedDb = {
  open() {
    const request = {};
    queueMicrotask(() => {
      request.error = Object.assign(
        new Error('unavailable'),
        { code: 'LOCAL_EXAMPLE_INDEXEDDB_UNAVAILABLE' },
      );
      request.onerror?.();
    });
    return request;
  },
};

describe('local example attachment store', () => {
  it('persists defensive Blob copies in the memory fallback', async () => {
    const store = createLocalExampleAttachmentStore({
      indexedDB: unavailableIndexedDb,
      urlApi: {
        createObjectURL: vi.fn(() => 'blob:local-example'),
        revokeObjectURL: vi.fn(),
      },
    });
    const blob = new Blob(['ticket'], { type: 'application/pdf' });

    const saved = await store.putAttachment({
      id: 'ticket-1',
      blob,
      fileName: 'ticket.pdf',
    });
    const loaded = await store.getAttachment(saved.storagePath);

    expect(saved.storagePath).toBe('local-example-trip/attachments/ticket-1');
    expect(await loaded.blob.text()).toBe('ticket');
    expect(loaded.blob).not.toBe(blob);
    expect(store.getPersistence()).toBe('memory');
  });

  it('reuses and revokes object URLs', async () => {
    const urlApi = {
      createObjectURL: vi.fn(() => 'blob:ticket'),
      revokeObjectURL: vi.fn(),
    };
    const store = createLocalExampleAttachmentStore({
      indexedDB: unavailableIndexedDb,
      urlApi,
    });
    await store.putAttachment({
      id: 'ticket-1',
      blob: new Blob(['ticket']),
    });

    expect(await store.createObjectUrl('ticket-1')).toBe('blob:ticket');
    expect(await store.createObjectUrl('ticket-1')).toBe('blob:ticket');
    expect(urlApi.createObjectURL).toHaveBeenCalledOnce();

    await store.deleteAttachment('ticket-1');
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith('blob:ticket');
  });

  it('revokes every active URL when disposed', async () => {
    const urlApi = {
      createObjectURL: vi.fn((blob) => `blob:${blob.size}`),
      revokeObjectURL: vi.fn(),
    };
    const store = createLocalExampleAttachmentStore({
      indexedDB: unavailableIndexedDb,
      urlApi,
    });
    await store.putAttachment({ id: 'one', blob: new Blob(['1']) });
    await store.putAttachment({ id: 'two', blob: new Blob(['22']) });
    await store.createObjectUrl('one');
    await store.createObjectUrl('two');

    await store.dispose();

    expect(urlApi.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
