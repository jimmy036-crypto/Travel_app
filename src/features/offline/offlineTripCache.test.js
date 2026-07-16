import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { generateId } from '../../helpers.js';
import {
  buildOfflineTripSnapshot,
  writeOfflineTripSnapshot,
  readOfflineTripSnapshot,
  listOfflineTripSummaries,
  removeOfflineTripSnapshot
} from './offlineTripCache.js';

const CACHE_KEY = 'google-travel-offline-trip-cache-v1';

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
      checklistItems: [{ id: 'c1', completed: true }, { id: 'c2', completed: false }],
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

  it('CACHE-OBJECT-01 builds snapshot from Record<string, item[]>', () => {
    const input = {
      roomId: 'room1',
      meta: { title: 'Trip 1', destination: 'Tokyo', startDate: '2026-07-15' },
      itinerary: {
        'Day 2': [],
        'Day 1': [
          { id: 'item1', name: 'P1', time: '10:00', address: 'Addr 1', memo: 'Memo 1', category: '景點' }
        ]
      },
      expenseStats: { totalExpense: 100 },
      expenses: [],
      checklistItems: [],
      tickets: []
    };
    const snap = buildOfflineTripSnapshot(input);
    expect(snap.days.length).toBe(2);
    expect(snap.days[0].id).toBe('Day 1');
    expect(snap.days[0].label).toContain('第一天');
    expect(snap.days[0].items.length).toBe(1);
    expect(snap.days[0].items[0].name).toBe('P1');
    expect(snap.days[0].items[0].note).toBe('Memo 1');
    expect(snap.days[1].id).toBe('Day 2');
    expect(snap.days[1].items.length).toBe(0);
  });

  it('CACHE-OBJECT-02 checks customName priority over name', () => {
    const input = {
      roomId: 'room1',
      meta: { title: 'Trip 1' },
      itinerary: {
        'Day 1': [
          { id: 'item1', customName: 'My Custom Name', name: 'Original Name' }
        ]
      }
    };
    const snap = buildOfflineTripSnapshot(input);
    expect(snap.days[0].items[0].name).toBe('My Custom Name');
  });

  it('CACHE-OBJECT-03 checks memo to note mapping', () => {
    const input = {
      roomId: 'room1',
      meta: { title: 'Trip 1' },
      itinerary: {
        'Day 1': [
          { id: 'item1', memo: 'This is memo', note: 'This is note' }
        ]
      }
    };
    const snap = buildOfflineTripSnapshot(input);
    expect(snap.days[0].items[0].note).toBe('This is memo');
  });

  it('checks checklist summary calculations for completed and checked values', () => {
    const input = {
      roomId: 'room1',
      meta: { title: 'Trip 1' },
      checklistItems: [
        { id: 'c1', completed: true },
        { id: 'c2', completed: false },
        { id: 'c3', checked: true }, // fallback compatibility
        { id: 'c4' } // missing fields
      ]
    };
    const snap = buildOfflineTripSnapshot(input);
    expect(snap.summary.checklistCompleted).toBe(2); // c1 (completed:true) and c3 (checked:true)
    expect(snap.summary.checklistTotal).toBe(4);
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
    largeSnap.meta.title = 'A'.repeat(1.5 * 1024 * 1024);
    
    const writeRes = writeOfflineTripSnapshot(largeSnap);
    expect(writeRes.ok).toBe(false);
    expect(writeRes.reason).toBe('too-large');

    expect(readOfflineTripSnapshot('r1')).not.toBeNull();
  });

  it('CACHE-11 quota error does not throw and does not destroy existing cache', () => {
    const snap1 = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } });
    writeOfflineTripSnapshot(snap1);

    const snap2 = buildOfflineTripSnapshot({ roomId: 'r2', meta: { title: 'T2' } });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const writeRes = writeOfflineTripSnapshot(snap2);
    expect(writeRes.ok).toBe(false);
    expect(writeRes.reason).toBe('quota-error');

    // restore
    vi.restoreAllMocks();
    expect(readOfflineTripSnapshot('r1')).not.toBeNull();
  });

  it('CACHE-12 remove only specified room and checks quota error rollback', () => {
    writeOfflineTripSnapshot(buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } }));
    writeOfflineTripSnapshot(buildOfflineTripSnapshot({ roomId: 'r2', meta: { title: 'T2' } }));
    
    const removeRes = removeOfflineTripSnapshot('r1');
    expect(removeRes.ok).toBe(true);
    expect(readOfflineTripSnapshot('r1')).toBeNull();
    expect(readOfflineTripSnapshot('r2')).not.toBeNull();

    // Check remove failure due to quota error
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const removeFailedRes = removeOfflineTripSnapshot('r2');
    expect(removeFailedRes.ok).toBe(false);
    expect(removeFailedRes.reason).toBe('quota-error');
    
    vi.restoreAllMocks();
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
    
    // blanks, object, array, path separators, excessive length
    expect(writeOfflineTripSnapshot({ version: 1, roomId: '   ' }).ok).toBe(false);
    expect(writeOfflineTripSnapshot({ version: 1, roomId: {} }).ok).toBe(false);
    expect(writeOfflineTripSnapshot({ version: 1, roomId: [] }).ok).toBe(false);
    expect(writeOfflineTripSnapshot({ version: 1, roomId: 'room/id' }).ok).toBe(false);
    expect(writeOfflineTripSnapshot({ version: 1, roomId: 'room\\id' }).ok).toBe(false);
    expect(writeOfflineTripSnapshot({ version: 1, roomId: 'a'.repeat(200) }).ok).toBe(false);
  });

  it('checks readOfflineTripSnapshot verification parameters', () => {
    // roomId mismatch
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } });
    writeOfflineTripSnapshot(snap);
    localStorage.setItem('google-travel-offline-trip-cache-v1', JSON.stringify({
      'r1': { ...snap, roomId: 'r2' }
    }));
    expect(readOfflineTripSnapshot('r1')).toBeNull();

    // cachedAt invalid
    const snap2 = { ...snap, cachedAt: -10 };
    localStorage.setItem('google-travel-offline-trip-cache-v1', JSON.stringify({
      'r1': snap2
    }));
    expect(readOfflineTripSnapshot('r1')).toBeNull();

    // schema corrupted
    const snap3 = { ...snap, meta: 'corrupted' };
    localStorage.setItem('google-travel-offline-trip-cache-v1', JSON.stringify({
      'r1': snap3
    }));
    expect(readOfflineTripSnapshot('r1')).toBeNull();
  });

  it('checks listOfflineTripSummaries filtering invalid snapshots', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } });
    localStorage.setItem('google-travel-offline-trip-cache-v1', JSON.stringify({
      'r1': { ...snap, roomId: 'r2' }, // mismatched roomId
      'r3': { ...snap, roomId: 'r3', cachedAt: 'invalid' } // invalid cachedAt
    }));
    const list = listOfflineTripSummaries();
    expect(list.length).toBe(0);
  });

  it('checks new snapshots are not immediately evicted when written with older cachedAt', () => {
    // Write 3 snapshots first
    for (let i = 1; i <= 3; i++) {
      const snap = buildOfflineTripSnapshot({ roomId: `r${i}`, meta: { title: `T${i}` } });
      snap.cachedAt = 1000 + i;
      writeOfflineTripSnapshot(snap);
    }
    
    // Now write a 4th one with an older cachedAt (e.g. 500)
    const snap4 = buildOfflineTripSnapshot({ roomId: 'r4', meta: { title: 'T4' } });
    snap4.cachedAt = 500;
    const writeRes = writeOfflineTripSnapshot(snap4);
    expect(writeRes.ok).toBe(true);
    
    // Verify that r4 (the new snapshot) was NOT evicted immediately.
    // Out of [r1, r2, r3, r4] with cachedAt [1001, 1002, 1003, 500]
    // The eviction logic keeps r4 and the 2 newest from [r1, r2, r3] (which are r2 and r3).
    // So r1 (the oldest from others) should be evicted.
    expect(readOfflineTripSnapshot('r4')).not.toBeNull();
    expect(readOfflineTripSnapshot('r1')).toBeNull();
    expect(readOfflineTripSnapshot('r3')).not.toBeNull();
    expect(readOfflineTripSnapshot('r2')).not.toBeNull();
  });

  it('checks updating existing room does not increase total count', () => {
    for (let i = 1; i <= 3; i++) {
      const snap = buildOfflineTripSnapshot({ roomId: `r${i}`, meta: { title: `T${i}` } });
      writeOfflineTripSnapshot(snap);
    }
    expect(listOfflineTripSummaries().length).toBe(3);
    
    const snapUpdate = buildOfflineTripSnapshot({ roomId: 'r2', meta: { title: 'T2 Updated' } });
    writeOfflineTripSnapshot(snapUpdate);
    
    expect(listOfflineTripSummaries().length).toBe(3);
    expect(readOfflineTripSnapshot('r2').meta.title).toBe('T2 Updated');
  });

  it('CACHE-KEY-01 rejects __proto__ as a room id', () => {
    expect(buildOfflineTripSnapshot({ roomId: '__proto__', meta: { title: 'T' } })).toBeNull();
    expect(writeOfflineTripSnapshot({ version: 1, roomId: '__proto__' }).ok).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('CACHE-KEY-02 rejects constructor as a room id', () => {
    expect(buildOfflineTripSnapshot({ roomId: 'constructor', meta: { title: 'T' } })).toBeNull();
    expect(writeOfflineTripSnapshot({ version: 1, roomId: 'constructor' }).ok).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('CACHE-KEY-03 rejects prototype as a room id', () => {
    expect(buildOfflineTripSnapshot({ roomId: 'prototype', meta: { title: 'T' } })).toBeNull();
    expect(writeOfflineTripSnapshot({ version: 1, roomId: 'prototype' }).ok).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBeNull();
  });

  it('CACHE-KEY-04 writes and reads a generated room id', () => {
    const roomId = generateId();
    const snap = buildOfflineTripSnapshot({ roomId, meta: { title: 'Generated' } });
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(readOfflineTripSnapshot(roomId).roomId).toBe(roomId);
  });

  it('CACHE-CONTAINER-01 treats non-plain cache containers as empty', () => {
    [JSON.stringify([]), JSON.stringify('x'), JSON.stringify(1), JSON.stringify(true), JSON.stringify('2026-07-15T00:00:00.000Z')].forEach((raw) => {
      localStorage.setItem(CACHE_KEY, raw);
      expect(listOfflineTripSummaries()).toEqual([]);
      const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
      expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
      expect(readOfflineTripSnapshot('r1').meta.title).toBe('T');
      localStorage.clear();
    });
  });

  it('CACHE-STORAGE-01 getItem throw makes write fail without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    expect(() => writeOfflineTripSnapshot(snap)).not.toThrow();
    expect(writeOfflineTripSnapshot(snap)).toEqual({ ok: false, reason: 'storage-unavailable' });
  });

  it('CACHE-STORAGE-02 getItem throw makes read return null', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(() => readOfflineTripSnapshot('r1')).not.toThrow();
    expect(readOfflineTripSnapshot('r1')).toBeNull();
  });

  it('CACHE-STORAGE-03 getItem throw makes list return []', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(() => listOfflineTripSummaries()).not.toThrow();
    expect(listOfflineTripSummaries()).toEqual([]);
  });

  it('CACHE-STORAGE-04 getItem throw makes remove fail without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    expect(() => removeOfflineTripSnapshot('r1')).not.toThrow();
    expect(removeOfflineTripSnapshot('r1')).toEqual({ ok: false, reason: 'storage-unavailable' });
  });

  it('CACHE-STORAGE-05 setItem throw does not make failed write visible', () => {
    const snap1 = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T1' } });
    expect(writeOfflineTripSnapshot(snap1).ok).toBe(true);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    const snap2 = buildOfflineTripSnapshot({ roomId: 'r2', meta: { title: 'T2' } });
    expect(writeOfflineTripSnapshot(snap2)).toEqual({ ok: false, reason: 'storage-unavailable' });

    vi.restoreAllMocks();
    expect(readOfflineTripSnapshot('r1')).not.toBeNull();
    expect(readOfflineTripSnapshot('r2')).toBeNull();
  });

  it('CACHE-SCHEMA-01 days array containing null does not make public APIs throw', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    snap.days = [null, { id: 'day1', label: 'Day 1', items: [] }];
    expect(() => writeOfflineTripSnapshot(snap)).not.toThrow();
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(() => readOfflineTripSnapshot('r1')).not.toThrow();
    expect(readOfflineTripSnapshot('r1').days).toHaveLength(1);
    expect(() => listOfflineTripSummaries()).not.toThrow();
  });

  it('CACHE-SCHEMA-02 day.items that is not an array is normalized to []', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    snap.days = [{ id: 'day1', label: 'Day 1', items: { bad: true } }];
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(readOfflineTripSnapshot('r1').days[0].items).toEqual([]);
  });

  it('CACHE-SCHEMA-03 item text fields that are objects are not retained', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    snap.days = [{
      id: 'day1',
      label: 'Day 1',
      items: [{ id: 'p1', name: { unsafe: true }, time: {}, address: {}, note: {}, category: {} }]
    }];
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(readOfflineTripSnapshot('r1').days[0].items[0]).toEqual({
      id: 'p1',
      name: '',
      time: '',
      address: '',
      note: '',
      category: ''
    });
  });

  it('CACHE-SCHEMA-04 members removes objects and empty strings', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T', members: ['Ann', '', '  ', { name: 'Bob' }, 'Bob'] } });
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(readOfflineTripSnapshot('r1').meta.members).toEqual(['Ann', 'Bob']);
  });

  it('CACHE-SCHEMA-05 summary NaN, Infinity, and negative values are normalized', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    snap.summary = {
      expenseTotal: Number.NaN,
      expenseCount: Number.POSITIVE_INFINITY,
      checklistCompleted: -1,
      checklistTotal: 2.8,
      ticketCount: -10
    };
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(readOfflineTripSnapshot('r1').summary).toEqual({
      expenseTotal: 0,
      expenseCount: 0,
      checklistCompleted: 0,
      checklistTotal: 2,
      ticketCount: 0
    });
  });

  it('CACHE-SCHEMA-06 direct snapshot write strips resources, attachment, and storagePath', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    snap.resources = [{ url: 'https://example.test' }];
    snap.attachment = 'file';
    snap.storagePath = 'rooms/r1/file';
    snap.days = [{
      id: 'day1',
      label: 'Day 1',
      resources: ['x'],
      items: [{
        id: 'p1',
        name: 'P',
        attachment: 'a',
        storagePath: 's',
        resources: [{ id: 'r' }],
        imageUrl: 'https://firebasestorage.googleapis.com/file'
      }]
    }];
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    const readBack = readOfflineTripSnapshot('r1');
    expect(readBack.resources).toBeUndefined();
    expect(readBack.attachment).toBeUndefined();
    expect(readBack.storagePath).toBeUndefined();
    expect(readBack.days[0].resources).toBeUndefined();
    expect(readBack.days[0].items[0].resources).toBeUndefined();
    expect(readBack.days[0].items[0].attachment).toBeUndefined();
    expect(readBack.days[0].items[0].storagePath).toBeUndefined();
    expect(readBack.days[0].items[0].imageUrl).toBeUndefined();
  });

  it('CACHE-SCHEMA-07 read snapshot is safe for OfflineTripPreview consumption', () => {
    const snap = buildOfflineTripSnapshot({
      roomId: 'r1',
      meta: { title: 'T', destination: 'D', members: ['Ann'] },
      itinerary: [{ id: 'Day 1', label: 'Day 1', items: [{ id: 'p1', name: 'P' }] }]
    });
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    const readBack = readOfflineTripSnapshot('r1');
    expect(readBack.meta && typeof readBack.meta === 'object').toBe(true);
    expect(Array.isArray(readBack.days)).toBe(true);
    expect(readBack.days.every(day => day && Array.isArray(day.items))).toBe(true);
    expect(readBack.summary && typeof readBack.summary === 'object').toBe(true);
    expect(() => readBack.days.map(day => day.items.map(item => item.name || ''))).not.toThrow();
  });

  it('CACHE-SIZE-01 writes a legal snapshot when Blob is unavailable', () => {
    const originalBlob = globalThis.Blob;
    vi.stubGlobal('Blob', undefined);
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'T' } });
    expect(writeOfflineTripSnapshot(snap).ok).toBe(true);
    expect(readOfflineTripSnapshot('r1')).not.toBeNull();
    vi.stubGlobal('Blob', originalBlob);
  });

  it('CACHE-SIZE-02 applies the size limit using UTF-8 bytes for Chinese text', () => {
    const snap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: '旅'.repeat(360000) } });
    const res = writeOfflineTripSnapshot(snap);
    expect(res).toEqual({ ok: false, reason: 'too-large' });
  });

  it('CACHE-SIZE-03 oversized Chinese snapshot does not overwrite old cache', () => {
    const oldSnap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'old' } });
    expect(writeOfflineTripSnapshot(oldSnap).ok).toBe(true);
    const largeSnap = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: '旅'.repeat(360000) } });
    expect(writeOfflineTripSnapshot(largeSnap)).toEqual({ ok: false, reason: 'too-large' });
    expect(readOfflineTripSnapshot('r1').meta.title).toBe('old');
  });

  it('CACHE-EVICT-01 keeps a newly written older room', () => {
    for (let i = 1; i <= 3; i++) {
      const snap = buildOfflineTripSnapshot({ roomId: `r${i}`, meta: { title: `T${i}` } });
      snap.cachedAt = 1000 + i;
      writeOfflineTripSnapshot(snap);
    }
    const oldNewRoom = buildOfflineTripSnapshot({ roomId: 'r4', meta: { title: 'T4' } });
    oldNewRoom.cachedAt = 1;
    expect(writeOfflineTripSnapshot(oldNewRoom).ok).toBe(true);
    expect(readOfflineTripSnapshot('r4')).not.toBeNull();
    expect(listOfflineTripSummaries().map(item => item.roomId).sort()).toEqual(['r2', 'r3', 'r4']);
  });

  it('CACHE-EVICT-02 updating an existing room keeps the total at 3', () => {
    for (let i = 1; i <= 3; i++) {
      const snap = buildOfflineTripSnapshot({ roomId: `r${i}`, meta: { title: `T${i}` } });
      writeOfflineTripSnapshot(snap);
    }
    const updated = buildOfflineTripSnapshot({ roomId: 'r1', meta: { title: 'Updated' } });
    expect(writeOfflineTripSnapshot(updated).ok).toBe(true);
    expect(listOfflineTripSummaries()).toHaveLength(3);
    expect(readOfflineTripSnapshot('r1').meta.title).toBe('Updated');
  });

  it('CACHE-EVICT-03 evicts deterministically when cachedAt values are equal', () => {
    ['r1', 'r2', 'r3'].forEach((roomId) => {
      const snap = buildOfflineTripSnapshot({ roomId, meta: { title: roomId } });
      snap.cachedAt = 1000;
      writeOfflineTripSnapshot(snap);
    });
    const snap4 = buildOfflineTripSnapshot({ roomId: 'r4', meta: { title: 'r4' } });
    snap4.cachedAt = 1000;
    expect(writeOfflineTripSnapshot(snap4).ok).toBe(true);
    expect(listOfflineTripSummaries().map(item => item.roomId)).toEqual(['r1', 'r2', 'r4']);
  });

  it('CACHE-EVICT-04 invalid entries do not count toward the max trip limit', () => {
    const valid = {};
    for (let i = 1; i <= 3; i++) {
      const snap = buildOfflineTripSnapshot({ roomId: `r${i}`, meta: { title: `T${i}` } });
      snap.cachedAt = 1000 + i;
      valid[`r${i}`] = snap;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      ...valid,
      invalid1: { version: 1, roomId: 'invalid1', cachedAt: 10000, meta: 'bad', days: [], summary: {} },
      invalid2: { version: 2, roomId: 'invalid2' }
    }));
    const snap4 = buildOfflineTripSnapshot({ roomId: 'r4', meta: { title: 'T4' } });
    snap4.cachedAt = 2000;
    expect(writeOfflineTripSnapshot(snap4).ok).toBe(true);
    expect(listOfflineTripSummaries().map(item => item.roomId)).toEqual(['r4', 'r3', 'r2']);
  });
});
