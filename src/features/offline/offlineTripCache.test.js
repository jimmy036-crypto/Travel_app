import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  buildOfflineTripSnapshot,
  writeOfflineTripSnapshot,
  readOfflineTripSnapshot,
  listOfflineTripSummaries,
  removeOfflineTripSnapshot
} from './offlineTripCache.js';

describe('offlineTripCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('CACHE-01 builds a valid snapshot', () => {
    const input = {
      roomId: 'room1',
      meta: { title: 'Trip 1', destination: 'Tokyo' },
      itinerary: [],
      expenseStats: { totalExpense: 1000 },
      expenses: [{ id: 'e1' }],
      checklistItems: [{ id: 'c1', checked: true }, { id: 'c2', checked: false }],
      tickets: [{ id: 't1' }]
    };
    const snap = buildOfflineTripSnapshot(input);
    expect(snap.roomId).toBe('room1');
    expect(snap.version).toBe(1);
    expect(snap.meta.title).toBe('Trip 1');
    expect(snap.summary.expenseTotal).toBe(1000);
    expect(snap.summary.expenseCount).toBe(1);
    expect(snap.summary.checklistCompleted).toBe(1);
    expect(snap.summary.checklistTotal).toBe(2);
    expect(snap.summary.ticketCount).toBe(1);
    expect(snap.cachedAt).toBeGreaterThan(0);
  });

  it('CACHE-02 keeps only allowed fields in itinerary', () => {
    const input = {
      roomId: 'room1',
      meta: { title: 'T' },
      itinerary: [{
        id: 'day1',
        label: 'Day 1',
        secretField: 'secret',
        items: [{
          id: 'place1',
          name: 'P1',
          time: '10:00',
          address: 'A1',
          note: 'N1',
          category: 'C1',
          imageUrl: 'http://img',
          blob: new Blob(['a'])
        }]
      }]
    };
    const snap = buildOfflineTripSnapshot(input);
    expect(snap.days[0].secretField).toBeUndefined();
    expect(snap.days[0].items[0].imageUrl).toBeUndefined();
    expect(snap.days[0].items[0].blob).toBeUndefined();
    expect(snap.days[0].items[0].name).toBe('P1');
  });

  it('CACHE-03 does not save images or Storage URLs', () => {
    const snap = buildOfflineTripSnapshot({
      roomId: 'room1',
      meta: { title: 'T' },
      itinerary: [{
        id: 'day1',
        items: [{
          id: 'p1',
          imageUrl: 'https://firebasestorage.googleapis.com/...',
          attachment: 'xyz'
        }]
      }]
    });
    expect(snap.days[0].items[0].imageUrl).toBeUndefined();
    expect(snap.days[0].items[0].attachment).toBeUndefined();
  });

  it('CACHE-04 writes and reads back', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    const res = writeOfflineTripSnapshot(snap);
    expect(res.ok).toBe(true);
    const readBack = readOfflineTripSnapshot('r1');
    expect(readBack.roomId).toBe('r1');
    expect(readBack.meta.title).toBe('T');
  });

  it('CACHE-05 read returns independent copy', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    writeOfflineTripSnapshot(snap);
    const read1 = readOfflineTripSnapshot('r1');
    read1.meta.title = 'Mutated';
    const read2 = readOfflineTripSnapshot('r1');
    expect(read2.meta.title).toBe('T');
  });

  it('CACHE-06 malformed JSON handled safely', () => {
    localStorage.setItem('google-travel-offline-trip-cache-v1', '{ bad json');
    const read = readOfflineTripSnapshot('r1');
    expect(read).toBeNull();
    const writeRes = writeOfflineTripSnapshot(buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } }));
    expect(writeRes.ok).toBe(true);
  });

  it('CACHE-07 incompatible version safe', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    snap.version = 2; // fake future version
    writeOfflineTripSnapshot(snap); // will fail validation
    const read = readOfflineTripSnapshot('r1');
    expect(read).toBeNull();
  });

  it('CACHE-08 keeps max 3 and CACHE-09 evicts oldest', () => {
    const base = { meta: { title: 'T' } };
    for (let i = 1; i <= 4; i++) {
      const snap = buildOfflineTripSnapshot({ roomId: `r${i}`, ...base });
      // manually adjust cachedAt to ensure order
      snap.cachedAt = 1000 + i; 
      writeOfflineTripSnapshot(snap);
    }
    const summaries = listOfflineTripSummaries();
    expect(summaries.length).toBe(3);
    // r4, r3, r2 should be kept, r1 evicted
    expect(summaries.map(s => s.roomId)).toEqual(['r4', 'r3', 'r2']);
  });

  it('CACHE-10 too large cache does not overwrite existing', () => {
    const base = { meta: { title: 'T' } };
    const snap1 = buildOfflineTripSnapshot({ roomId: 'r1', ...base });
    writeOfflineTripSnapshot(snap1);

    const largeSnap = buildOfflineTripSnapshot({ roomId: 'r2', ...base });
    // Make it ~1.5MB
    largeSnap.meta.title = 'A'.repeat(1.5 * 1024 * 1024);
    
    const writeRes = writeOfflineTripSnapshot(largeSnap);
    expect(writeRes.ok).toBe(false);
    expect(writeRes.reason).toBe('too-large');

    // r1 is still there
    expect(readOfflineTripSnapshot('r1')).not.toBeNull();
  });

  it('CACHE-11 quota error does not throw', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const writeRes = writeOfflineTripSnapshot(snap);
    expect(writeRes.ok).toBe(false);
    expect(writeRes.reason).toBe('quota-error');
  });

  it('CACHE-12 remove only specified room', () => {
    writeOfflineTripSnapshot(buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } }));
    writeOfflineTripSnapshot(buildOfflineTripSnapshot({ roomId: 'r2', meta: { title: 'T2' } }));
    removeOfflineTripSnapshot('r1');
    expect(readOfflineTripSnapshot('r1')).toBeNull();
    expect(readOfflineTripSnapshot('r2')).not.toBeNull();
  });

  it('CACHE-13 summary list sorted by time', () => {
    const snap1 = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } });
    snap1.cachedAt = 1000;
    const snap2 = buildOfflineTripSnapshot({ roomId: 'r2', meta: { title: 'T2' } });
    snap2.cachedAt = 2000;
    writeOfflineTripSnapshot(snap1);
    writeOfflineTripSnapshot(snap2);
    
    const summaries = listOfflineTripSummaries();
    expect(summaries[0].roomId).toBe('r2');
    expect(summaries[1].roomId).toBe('r1');
  });

  it('CACHE-14 invalid roomId not written', () => {
    const snap = buildOfflineTripSnapshot({ roomId: '', meta: { title: 'T' } });
    expect(snap).toBeNull();
    const writeRes = writeOfflineTripSnapshot({ version: 1, roomId: '' });
    expect(writeRes.ok).toBe(false);
  });
});
