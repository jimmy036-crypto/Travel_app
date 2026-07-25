import { describe, expect, it, vi } from 'vitest';

import {
  LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE,
  LOCAL_EXAMPLE_SCHEMA_VERSION,
  LOCAL_EXAMPLE_TEMPLATE_VERSION,
  LOCAL_EXAMPLE_TRIP_ID,
} from './exampleTripConstants.js';
import {
  createLocalExampleTemplateSnapshot,
  createLocalExampleTripRepository,
} from './localExampleTripRepository.js';

const createMemoryRecordStore = (initial = null) => {
  let value = initial;
  return {
    read: vi.fn(async () => value),
    write: vi.fn(async (next) => {
      value = structuredClone(next);
      return next;
    }),
    close: vi.fn(),
    inspect: () => value,
  };
};

const createAttachmentStore = () => ({
  putAttachment: vi.fn(async ({ id, file }) => ({
    id,
    storagePath: `${LOCAL_EXAMPLE_TRIP_ID}/attachments/${id}`,
    fileName: file.name || 'file',
    contentType: file.type,
    size: file.size,
    updatedAt: 1,
  })),
  createObjectUrl: vi.fn(async (path) => `blob:${path}`),
  deleteAttachment: vi.fn(async () => true),
  clear: vi.fn(async () => undefined),
  dispose: vi.fn(async () => undefined),
});

describe('local example trip repository', () => {
  it('creates a sanitized title with exactly one example suffix', () => {
    const snapshot = createLocalExampleTemplateSnapshot({
      createTemplate: () => ({
        meta: { title: '東京五日示範旅程（範例）（範例）' },
        itinerary: {},
        expenses: [],
        tickets: [],
        checklist: [],
      }),
    });

    expect(snapshot.meta.title).toBe('東京五日自由行（範例）');
    expect(JSON.stringify(snapshot)).not.toContain('示範旅程');
  });

  it('persists reload-safe defensive snapshots without mutating the template', async () => {
    const template = {
      meta: { title: 'Tokyo' },
      itinerary: { 'Day 1': [] },
      expenses: [],
      settlements: [],
      tickets: [],
      checklist: [],
    };
    const recordStore = createMemoryRecordStore();
    const first = createLocalExampleTripRepository({
      recordStore,
      attachmentStore: createAttachmentStore(),
      createTemplate: () => template,
    });
    const loaded = await first.loadTrip();
    loaded.meta.title = 'Caller mutation';
    await first.updateMeta({ ...loaded.meta, title: 'Saved title（範例）' });

    const second = createLocalExampleTripRepository({
      recordStore,
      attachmentStore: createAttachmentStore(),
      createTemplate: () => template,
    });

    expect((await second.loadTrip()).meta.title).toBe('Saved title（範例）');
    expect(template.meta.title).toBe('Tokyo');
  });

  it('recovers corrupted and incompatible records from the immutable template', async () => {
    const incompatibleStore = createMemoryRecordStore({
      schemaVersion: '999',
      templateVersion: '999',
      tripId: LOCAL_EXAMPLE_TRIP_ID,
      revision: 4,
      snapshot: {},
    });
    const repository = createLocalExampleTripRepository({
      recordStore: incompatibleStore,
      attachmentStore: createAttachmentStore(),
      createTemplate: () => ({
        meta: { title: 'Recovered' },
        itinerary: {},
        expenses: [],
        settlements: [],
        tickets: [],
        checklist: [],
      }),
    });

    expect((await repository.loadTrip()).meta.title).toBe('Recovered（範例）');
    expect(repository.getPersistenceState().recoveryReason).toBe('incompatible-version');
    expect(incompatibleStore.inspect()).toMatchObject({
      schemaVersion: LOCAL_EXAMPLE_SCHEMA_VERSION,
      templateVersion: LOCAL_EXAMPLE_TEMPLATE_VERSION,
      tripId: LOCAL_EXAMPLE_TRIP_ID,
    });
  });

  it('resets only local data and attachments', async () => {
    const recordStore = createMemoryRecordStore();
    const attachmentStore = createAttachmentStore();
    const repository = createLocalExampleTripRepository({
      recordStore,
      attachmentStore,
      createTemplate: () => ({
        meta: { title: 'Original' },
        itinerary: {},
        expenses: [],
        settlements: [],
        tickets: [],
        checklist: [],
      }),
    });
    await repository.loadTrip();
    await repository.updateExpenses([{ id: 'expense-1' }]);

    const reset = await repository.reset();

    expect(reset.expenses).toEqual([]);
    expect(reset.meta.title).toBe('Original（範例）');
    expect(attachmentStore.clear).toHaveBeenCalledOnce();
  });

  it('stores Blob attachments locally and never calls a cloud adapter', async () => {
    const attachmentStore = createAttachmentStore();
    const repository = createLocalExampleTripRepository({
      recordStore: createMemoryRecordStore(),
      attachmentStore,
    });
    const file = new File(['pdf'], 'ticket.pdf', { type: 'application/pdf' });

    const result = await repository.uploadAttachment({ file, scope: 'ticket' });

    expect(result).toMatchObject({
      attachmentKind: 'pdf',
      contentType: 'application/pdf',
    });
    expect(result.storagePath).toMatch(/^local-example-trip\/attachments\//);
    expect(attachmentStore.putAttachment).toHaveBeenCalledOnce();
  });

  it('reports quota/write failures without pretending persistence succeeded', async () => {
    const failure = Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
    const onPersistenceError = vi.fn();
    const recordStore = createMemoryRecordStore();
    recordStore.write.mockRejectedValueOnce(failure);
    const repository = createLocalExampleTripRepository({
      recordStore,
      attachmentStore: createAttachmentStore(),
      onPersistenceError,
    });

    await expect(repository.loadTrip()).rejects.toMatchObject({
      code: 'LOCAL_EXAMPLE_WRITE_FAILED',
      message: LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE,
    });
    expect(onPersistenceError).toHaveBeenCalledWith(expect.objectContaining({
      message: LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE,
      error: failure,
    }));
  });
});
