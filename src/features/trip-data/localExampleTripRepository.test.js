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
    clear: vi.fn(async () => {
      value = null;
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

  it('persists settlement transfer records only in the local example record store', async () => {
    const recordStore = createMemoryRecordStore();
    const template = {
      meta: { title: 'Tokyo' },
      itinerary: {},
      expenses: [],
      settlements: [],
      tickets: [],
      checklist: [],
    };
    const repository = createLocalExampleTripRepository({
      recordStore,
      attachmentStore: createAttachmentStore(),
      createTemplate: () => template,
    });
    const transferRecord = {
      id: 'transfer-1',
      fromParticipantId: '自己',
      toParticipantId: '朋友',
      amount: 500,
      currency: 'TWD',
      scope: 'pretrip',
      status: 'paid',
      paidAt: '2026-07-28T04:30:00.000Z',
      createdAt: '2026-07-28T04:30:00.000Z',
      updatedAt: '2026-07-28T04:30:00.000Z',
    };

    await repository.updateSettlements([transferRecord]);

    expect((await repository.loadTrip()).settlements).toEqual([transferRecord]);
    expect(recordStore.inspect().snapshot.settlements).toEqual([transferRecord]);
  });

  it('persists parkingPlan locally across reloads without a cloud write', async () => {
    const recordStore = createMemoryRecordStore();
    const template = {
      meta: { title: 'Tokyo' },
      itinerary: { 'Day 1': [{ id: 'place-1', name: '景點' }] },
      expenses: [], settlements: [], tickets: [], checklist: [],
    };
    const first = createLocalExampleTripRepository({ recordStore, attachmentStore: createAttachmentStore(), createTemplate: () => template });
    const itinerary = (await first.loadTrip()).itinerary;
    itinerary['Day 1'][0].parkingPlan = { schemaVersion: 1, provider: 'google', googlePlaceId: 'G1' };
    await first.updateItinerary(itinerary);
    const second = createLocalExampleTripRepository({ recordStore, attachmentStore: createAttachmentStore(), createTemplate: () => template });
    expect((await second.loadTrip()).itinerary['Day 1'][0].parkingPlan).toEqual({ schemaVersion: 1, provider: 'google', googlePlaceId: 'G1' });
    expect(recordStore.inspect().snapshot).not.toHaveProperty('parkingPlan');
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

  it('migrates the v1 template without overwriting edited fields or restoring deleted items', async () => {
    const recordStore = createMemoryRecordStore({
      schemaVersion: LOCAL_EXAMPLE_SCHEMA_VERSION,
      templateVersion: '1.0.0',
      tripId: LOCAL_EXAMPLE_TRIP_ID,
      revision: 7,
      updatedAt: '2026-07-28T04:30:00.000Z',
      snapshot: {
        meta: { title: '我的東京版本（範例）' },
        itinerary: {
          'Day 2': [{
            id: 'demo-place-day2-meiji',
            name: '我改過的神宮',
            nextLeg: { mode: 'DEMO', mins: 18 },
          }],
        },
        expenses: [{
          id: 'demo-expense-hotel',
          dayId: 'Day 1',
          item: '我改過的住宿',
          cost: 1,
        }],
        settlements: [],
        tickets: [],
        checklist: [],
      },
    });
    const repository = createLocalExampleTripRepository({
      recordStore,
      attachmentStore: createAttachmentStore(),
    });

    const migrated = await repository.loadTrip();

    expect(migrated.meta.title).toBe('我的東京版本（範例）');
    expect(migrated.itinerary['Day 2']).toHaveLength(1);
    expect(migrated.itinerary['Day 2'][0]).toMatchObject({
      name: '我改過的神宮',
      lat: 35.67505,
      lng: 139.69948,
      nextLeg: { mode: 'AUTO', mins: 18 },
    });
    expect(migrated.expenses.find((expense) => expense.id === 'demo-expense-hotel')?.item)
      .toBe('我改過的住宿');
    expect(migrated.expenses.filter((expense) => expense.dayId === 'PRE_TRIP')).toHaveLength(3);
    expect(repository.getPersistenceState().recoveryReason).toBe('template-migrated');
    expect(recordStore.inspect()).toMatchObject({
      templateVersion: LOCAL_EXAMPLE_TEMPLATE_VERSION,
      revision: 8,
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

  it('removes the local snapshot and attachments, then restores the current template', async () => {
    const recordStore = createMemoryRecordStore();
    const attachmentStore = createAttachmentStore();
    const repository = createLocalExampleTripRepository({
      recordStore,
      attachmentStore,
    });
    await repository.loadTrip();
    await repository.updateMeta({ title: 'Edited（範例）' });

    await repository.removeLocalData();

    expect(recordStore.clear).toHaveBeenCalledOnce();
    expect(attachmentStore.clear).toHaveBeenCalledOnce();
    expect(recordStore.inspect()).toBeNull();

    const restored = await repository.restoreCurrentTemplate();
    expect(restored.meta.title).toBe('東京三日自由行（範例）');
    expect(restored.expenses.filter((expense) => expense.dayId === 'PRE_TRIP')).toHaveLength(3);
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
