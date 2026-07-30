import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLONE_JOURNAL_EXPIRY_MS,
  CLONE_JOURNAL_STORAGE_KEY,
  checkCloneJournalStorage,
  createCloneJournal,
  readCloneJournal,
  removeCloneJournal,
  validateCloneJournal,
  writeCloneJournal,
} from './cloneOperationJournal.js';

const NOW = new Date('2026-07-23T04:00:00.000Z');

function validInput(overrides = {}) {
  return {
    operationId: 'operation-12345678',
    roomId: 'trip-1234567',
    templateVersion: 1,
    title: 'Editable Demo Clone',
    startDate: '2026-08-01',
    payloadFingerprint: 'fnv1a-abc1234',
    ...overrides,
  };
}

describe('Clone operation Journal', () => {
  beforeEach(() => localStorage.clear());

  it('stores only the approved minimal same-browser recovery fields', () => {
    const journal = createCloneJournal(validInput(), { now: NOW });
    expect(Object.keys(journal).sort()).toEqual([
      'createdAt',
      'operationId',
      'payloadFingerprint',
      'roomId',
      'schemaVersion',
      'startDate',
      'state',
      'templateVersion',
      'title',
      'updatedAt',
    ]);
    expect(JSON.stringify(journal)).not.toMatch(/itinerary|checklist|expenses|tickets|attachments|"trip":/);
  });

  it('preflights write read and remove', () => {
    expect(checkCloneJournalStorage(localStorage)).toEqual({ available: true, reason: null });
    expect(localStorage.getItem(`${CLONE_JOURNAL_STORAGE_KEY}:probe`)).toBeNull();
  });

  it('writes, reads defensive copies, and removes a valid Journal', () => {
    const journal = createCloneJournal(validInput(), { now: NOW });
    expect(writeCloneJournal(journal, { storage: localStorage, now: NOW })).toMatchObject({ ok: true, status: 'written' });
    const first = readCloneJournal({ storage: localStorage, now: NOW });
    expect(first).toMatchObject({ status: 'ready' });
    first.journal.title = 'caller mutation';
    expect(readCloneJournal({ storage: localStorage, now: NOW }).journal.title).toBe('Editable Demo Clone');
    expect(removeCloneJournal({ storage: localStorage })).toEqual({ ok: true, status: 'removed', error: null });
  });

  it.each([
    ['corrupted', '{bad', 'corrupted'],
    ['extra payload', JSON.stringify({ ...createCloneJournal(validInput(), { now: NOW }), transformedTrip: {} }), 'invalid'],
    ['wrong schema', JSON.stringify({ ...createCloneJournal(validInput(), { now: NOW }), schemaVersion: '2.0.0' }), 'invalid'],
    ['wrong fingerprint', JSON.stringify({ ...createCloneJournal(validInput(), { now: NOW }), payloadFingerprint: 'signature' }), 'invalid'],
  ])('treats %s storage as untrusted and never returns it', (_label, raw, status) => {
    localStorage.setItem(CLONE_JOURNAL_STORAGE_KEY, raw);
    expect(readCloneJournal({ storage: localStorage, now: NOW })).toMatchObject({ journal: null, status });
  });

  it('expires after seven days without executing anything', () => {
    const journal = createCloneJournal(validInput(), { now: NOW });
    localStorage.setItem(CLONE_JOURNAL_STORAGE_KEY, JSON.stringify(journal));
    const result = readCloneJournal({
      storage: localStorage,
      now: new Date(NOW.getTime() + CLONE_JOURNAL_EXPIRY_MS + 1),
    });
    expect(result).toMatchObject({ journal: null, status: 'expired' });
  });

  it('detects same-room operation or fingerprint collision', () => {
    const first = createCloneJournal(validInput(), { now: NOW });
    writeCloneJournal(first, { storage: localStorage, now: NOW });
    const collision = createCloneJournal(validInput({
      operationId: 'operation-87654321',
      payloadFingerprint: 'fnv1a-zzz9999',
    }), { now: NOW });
    expect(writeCloneJournal(collision, { storage: localStorage, now: NOW })).toMatchObject({
      ok: false,
      status: 'collision',
    });
  });

  it('fails closed when storage preflight fails', () => {
    const storage = {
      setItem: vi.fn(() => { throw new Error('blocked'); }),
      getItem: vi.fn(),
      removeItem: vi.fn(),
    };
    const journal = createCloneJournal(validInput(), { now: NOW });
    expect(writeCloneJournal(journal, { storage, now: NOW })).toMatchObject({
      ok: false,
      status: 'preflight-failed',
    });
    expect(readCloneJournal({ storage, now: NOW })).toMatchObject({
      journal: null,
      status: 'preflight-failed',
    });
  });

  it('rejects malformed IDs, versions, dates, states, and added fields', () => {
    const journal = createCloneJournal(validInput(), { now: NOW });
    expect(validateCloneJournal({ ...journal, operationId: 'short' }).valid).toBe(false);
    expect(validateCloneJournal({ ...journal, templateVersion: 0 }).valid).toBe(false);
    expect(validateCloneJournal({ ...journal, startDate: 'today' }).valid).toBe(false);
    expect(validateCloneJournal({ ...journal, state: 'auto-write-firebase' }).valid).toBe(false);
    expect(validateCloneJournal({ ...journal, payload: {} }).valid).toBe(false);
  });
});
