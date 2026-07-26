import { beforeEach, describe, expect, it, vi } from 'vitest';

const databaseMocks = vi.hoisted(() => ({
  get: vi.fn(),
  onValue: vi.fn(),
  ref: vi.fn((_db, path) => ({ path })),
  update: vi.fn(),
}));

const storageMocks = vi.hoisted(() => ({
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
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
    await repository.updateSettlements([{ id: 'settlement-1' }]);
    await repository.updateTickets([{ id: 'ticket-1' }]);
    await repository.updateChecklist({ one: { id: 'one' } });
    await repository.updateItinerary({ 'Day 1': [] });

    expect(databaseMocks.update).toHaveBeenNthCalledWith(
      1,
      { path: 'rooms/room-1' },
      { meta: { title: 'Updated' } },
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
