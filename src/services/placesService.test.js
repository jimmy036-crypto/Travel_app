import { beforeEach, describe, expect, it, vi } from 'vitest';

import { persistItinerary } from './placesService.js';

const firebaseMocks = vi.hoisted(() => ({
  ref: vi.fn((_db, path) => ({ path })),
  update: vi.fn(async () => undefined),
}));

vi.mock('firebase/database', () => ({
  ref: firebaseMocks.ref,
  update: firebaseMocks.update,
}));

describe('placesService', () => {
  beforeEach(() => {
    firebaseMocks.ref.mockClear();
    firebaseMocks.update.mockReset();
    firebaseMocks.update.mockResolvedValue(undefined);
  });

  it('uses the correct room itinerary path and payload', async () => {
    const db = { app: 'mock-db' };
    const itinerary = {
      'Day 1': [
        { id: 'place-1', name: 'Museum', time: '09:00' },
      ],
    };

    await persistItinerary({ db, roomId: 'room-123', itinerary });

    expect(firebaseMocks.ref).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.ref).toHaveBeenCalledWith(db, 'rooms/room-123');
    expect(firebaseMocks.update).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { path: 'rooms/room-123' },
      { itinerary },
    );
  });

  it('does not modify the itinerary object or arrays passed in', async () => {
    const dayItems = Object.freeze([
      Object.freeze({ id: 'place-1', name: 'Museum' }),
    ]);
    const itinerary = Object.freeze({
      'Day 1': dayItems,
    });

    await persistItinerary({
      db: { app: 'mock-db' },
      roomId: 'room-immutability',
      itinerary,
    });

    expect(firebaseMocks.update.mock.calls[0][1]).toEqual({ itinerary });
    expect(firebaseMocks.update.mock.calls[0][1].itinerary).toBe(itinerary);
    expect(itinerary['Day 1']).toBe(dayItems);
  });

  it('resolves with the Firebase update result', async () => {
    const result = { committed: true };
    firebaseMocks.update.mockResolvedValueOnce(result);

    await expect(persistItinerary({
      db: { app: 'mock-db' },
      roomId: 'room-success',
      itinerary: { 'Day 1': [] },
    })).resolves.toBe(result);
  });

  it('rejects Firebase write failures without swallowing the error', async () => {
    const error = new Error('permission denied');
    firebaseMocks.update.mockRejectedValueOnce(error);

    await expect(persistItinerary({
      db: { app: 'mock-db' },
      roomId: 'room-failure',
      itinerary: { 'Day 1': [] },
    })).rejects.toThrow('permission denied');
  });

  it('does not create a Firebase path when roomId is missing', async () => {
    expect(() => persistItinerary({
      db: { app: 'mock-db' },
      roomId: '',
      itinerary: { 'Day 1': [] },
    })).toThrow('roomId is required');

    expect(firebaseMocks.ref).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('does not call Firebase when db is missing', async () => {
    expect(() => persistItinerary({
      db: null,
      roomId: 'room-missing-db',
      itinerary: { 'Day 1': [] },
    })).toThrow('Firebase Database is required');

    expect(firebaseMocks.ref).not.toHaveBeenCalled();
    expect(firebaseMocks.update).not.toHaveBeenCalled();
  });

  it('calls Firebase update only once per persist operation', async () => {
    await persistItinerary({
      db: { app: 'mock-db' },
      roomId: 'room-once',
      itinerary: { 'Day 1': [] },
    });

    expect(firebaseMocks.ref).toHaveBeenCalledTimes(1);
    expect(firebaseMocks.update).toHaveBeenCalledTimes(1);
  });
});
