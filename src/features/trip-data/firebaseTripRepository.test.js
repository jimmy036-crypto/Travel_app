import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  get: vi.fn(),
  onValue: vi.fn(),
  ref: vi.fn((_db, path) => ({ path })),
  update: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  getBlob: vi.fn(),
  ref: vi.fn((_storage, path) => ({ path })),
  uploadBytesResumable: vi.fn(),
}));

const placeServiceMocks = vi.hoisted(() => ({
  persistItinerary: vi.fn(),
}));

const ticketServiceMocks = vi.hoisted(() => ({
  deleteTicketAttachment: vi.fn(),
  uploadTicketAttachment: vi.fn(),
}));

vi.mock('firebase/database', () => databaseMocks);
vi.mock('firebase/storage', () => storageMocks);
vi.mock('../../services/placesService.js', () => placeServiceMocks);
vi.mock('../../services/ticketsService.js', () => ticketServiceMocks);

import { createFirebaseTripRepository } from './firebaseTripRepository.js';

describe('firebase trip repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storageMocks.getBlob.mockResolvedValue(new Blob(['attachment']));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:trip-attachment'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('normalizes Firebase snapshots before publishing them', () => {
    let valueHandler;
    const unsubscribe = vi.fn();
    databaseMocks.onValue.mockImplementation((_ref, onValue) => {
      valueHandler = onValue;
      return unsubscribe;
    });
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });
    const listener = vi.fn();
    const stop = repository.subscribeTrip(listener);

    valueHandler({
      val: () => ({
        meta: { title: 'Trip' },
        itinerary: { 'Day 1': [] },
        checklist: { one: { id: 'one' } },
      }),
    });

    expect(listener).toHaveBeenCalledWith({
      meta: { title: 'Trip' },
      itinerary: { 'Day 1': [] },
      expenses: [],
      settlements: [],
      tickets: [],
      checklist: [{ id: 'one' }],
    });
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('preserves existing Firebase room paths for every branch', async () => {
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });

    await repository.updateMeta({ title: 'Updated' });
    await repository.updateExpenses([{ id: 'expense-1' }]);
    const settlementRecord = {
      id: 'settlement-1',
      fromParticipantId: '自己',
      toParticipantId: '朋友',
      amount: 100,
      currency: 'TWD',
      scope: 'intrip',
      status: 'paid',
      paidAt: '2026-07-28T04:30:00.000Z',
      createdAt: '2026-07-28T04:30:00.000Z',
      updatedAt: '2026-07-28T04:30:00.000Z',
    };
    await repository.updateSettlements([settlementRecord]);
    await repository.updateTickets([{ id: 'ticket-1' }]);
    await repository.updateChecklist({ one: { id: 'one' } });
    await repository.updateItinerary({ 'Day 1': [] });

    expect(databaseMocks.update).toHaveBeenNthCalledWith(
      1,
      { path: 'rooms/room-1' },
      { meta: { title: 'Updated' } },
    );
    expect(databaseMocks.update).toHaveBeenNthCalledWith(
      3,
      { path: 'rooms/room-1' },
      { settlements: [settlementRecord] },
    );
    expect(databaseMocks.update).toHaveBeenLastCalledWith(
      { path: 'rooms/room-1/checklist' },
      { one: { id: 'one' } },
    );
    expect(placeServiceMocks.persistItinerary).toHaveBeenCalledWith({
      db: {},
      roomId: 'room-1',
      itinerary: { 'Day 1': [] },
    });
  });

  it('does not add undefined attachment fields to plain itinerary places', async () => {
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });

    await repository.updateItinerary({
      'Day 1': [{
        id: 'place-1',
        name: '早餐',
        placePhoto: undefined,
        resources: undefined,
      }],
    });

    expect(placeServiceMocks.persistItinerary).toHaveBeenCalledWith({
      db: {},
      roomId: 'room-1',
      itinerary: {
        'Day 1': [{ id: 'place-1', name: '早餐' }],
      },
    });
  });

  it('delegates ticket attachments without changing their storage contract', async () => {
    ticketServiceMocks.uploadTicketAttachment.mockResolvedValue({
      storagePath: 'rooms/room-1/tickets/ticket-1/revision/file.pdf',
      url: 'blob',
    });
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });
    const file = { name: 'file.pdf', type: 'application/pdf', size: 10 };

    await repository.uploadAttachment({
      scope: 'ticket',
      ownerId: 'ticket-1',
      file,
    });

    expect(ticketServiceMocks.uploadTicketAttachment).toHaveBeenCalledWith({
      storage: {},
      roomId: 'room-1',
      ticketId: 'ticket-1',
      file,
      onProgress: undefined,
    });
  });

  it('uploads place attachments with private no-store metadata', async () => {
    storageMocks.uploadBytesResumable.mockReturnValue({
      on: vi.fn((_event, _progress, _error, complete) => complete()),
    });
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });
    const file = new File(['image'], 'photo.png', { type: 'image/png' });

    await expect(repository.uploadAttachment({
      scope: 'place',
      ownerId: 'place-1',
      resourceId: 'resource-1',
      resourceType: 'photo',
      timestamp: 123,
      file,
    })).resolves.toMatchObject({
      url: '',
      storagePath: 'rooms/room-1/places/place-1/123_resource-1_photo.png',
    });

    expect(storageMocks.uploadBytesResumable).toHaveBeenCalledWith(
      { path: 'rooms/room-1/places/place-1/123_resource-1_photo.png' },
      file,
      {
        contentType: 'image/png',
        cacheControl: 'private, no-store, max-age=0',
        customMetadata: {
          roomId: 'room-1',
          itemId: 'place-1',
          resourceId: 'resource-1',
          resourceType: 'photo',
        },
      },
    );
  });

  it('downloads protected attachments with a size cap and reuses the object URL', async () => {
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });

    await expect(repository.readAttachment({ storagePath: 'rooms/room-1/file.pdf' }))
      .resolves.toBe('blob:trip-attachment');
    await expect(repository.readAttachment({ storagePath: 'rooms/room-1/file.pdf' }))
      .resolves.toBe('blob:trip-attachment');

    expect(storageMocks.getBlob).toHaveBeenCalledOnce();
    expect(storageMocks.getBlob).toHaveBeenCalledWith(
      { path: 'rooms/room-1/file.pdf' },
      15 * 1024 * 1024,
    );
    expect(URL.createObjectURL).toHaveBeenCalledOnce();

    repository.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:trip-attachment');
  });

  it('deduplicates concurrent reads and refuses to publish an object URL after dispose', async () => {
    let resolveBlob;
    storageMocks.getBlob.mockReturnValue(new Promise((resolve) => {
      resolveBlob = resolve;
    }));
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
    });

    const first = repository.readAttachment('rooms/room-1/file.pdf');
    const second = repository.readAttachment('rooms/room-1/file.pdf');
    expect(storageMocks.getBlob).toHaveBeenCalledOnce();
    repository.dispose();
    resolveBlob(new Blob(['attachment']));

    await expect(first).rejects.toThrow('disposed');
    await expect(second).rejects.toThrow('disposed');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('writes offline snapshots only through the injected cache adapter', () => {
    const buildSnapshot = vi.fn(() => ({ roomId: 'room-1' }));
    const writeSnapshot = vi.fn(() => ({ ok: true }));
    const repository = createFirebaseTripRepository({
      db: {},
      storage: {},
      tripId: 'room-1',
      offline: { buildSnapshot, writeSnapshot },
    });

    expect(repository.writeOfflineSnapshot({ meta: { title: 'Trip' } })).toEqual({ ok: true });
    expect(buildSnapshot).toHaveBeenCalledWith({
      roomId: 'room-1',
      meta: { title: 'Trip' },
    });
    expect(writeSnapshot).toHaveBeenCalledWith({ roomId: 'room-1' });
  });
});
