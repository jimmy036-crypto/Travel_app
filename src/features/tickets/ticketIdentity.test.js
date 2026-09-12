import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readLegacyCompanionCandidate } from './ticketIdentity.js';
import { companionStorageKey, readCompanionPreference, writeCompanionPreference } from '../companion/companionIdentity.js';

const members = ['王泓文', '陳小美'];
const key = tripId => companionStorageKey({ source: 'firebase', uid: 'account-a', tripId });

describe('account-scoped companion preferences replace ticket-only identity', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('writes and reads an explicitly confirmed valid member', () => {
    expect(writeCompanionPreference(key('room-1'), members[0], members)).toBe(true);
    expect(readCompanionPreference(key('room-1')).member).toBe(members[0]);
    expect(localStorage.getItem('travel-active-member-room-1')).toBeNull();
  });
  it('keeps identities separate for each room', () => {
    writeCompanionPreference(key('room-1'), members[0], members);
    writeCompanionPreference(key('room-2'), members[1], members);
    expect(readCompanionPreference(key('room-1')).member).toBe(members[0]);
    expect(readCompanionPreference(key('room-2')).member).toBe(members[1]);
  });
  it('does not save whitespace as a confirmed member', () => {
    expect(writeCompanionPreference(key('room-1'), '  ', members)).toBe(false);
    expect(localStorage.getItem(key('room-1'))).toBeNull();
  });
  it('does not save a member absent from the trip', () => {
    expect(writeCompanionPreference(key('room-1'), '已離開成員', members)).toBe(false);
    expect(localStorage.getItem(key('room-1'))).toBeNull();
  });
  it('reads a valid checklist legacy value as a candidate without upgrading it', () => {
    localStorage.setItem('travel-checklist-actor-room-1', members[1]);
    const write = vi.spyOn(Storage.prototype, 'setItem');
    expect(readLegacyCompanionCandidate('room-1', members)).toEqual({ candidate: members[1], conflict: false });
    expect(readCompanionPreference(key('room-1')).member).toBe('');
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem('travel-active-member-room-1')).toBeNull();
  });
  it('ignores a legacy actor no longer in the trip', () => {
    localStorage.setItem('travel-checklist-actor-room-1', '已離開成員');
    expect(readLegacyCompanionCandidate('room-1', members).candidate).toBe('');
    expect(localStorage.getItem(key('room-1'))).toBeNull();
  });
  it('handles blocked get/set/remove and never needs remove for clearing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw Error('blocked'); });
    expect(readCompanionPreference(key('room-1'))).toMatchObject({ member: '', storageError: true });
    expect(readLegacyCompanionCandidate('room-1', members).candidate).toBe('');
    expect(writeCompanionPreference(key('room-1'), members[0], members)).toBe(false);
    expect(writeCompanionPreference(key('room-1'), '', members)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
  it('clears only the selected room with a legacy-suppressing tombstone', () => {
    writeCompanionPreference(key('room-1'), members[0], members);
    writeCompanionPreference(key('room-2'), members[1], members);
    expect(writeCompanionPreference(key('room-1'), '', members)).toBe(true);
    expect(readCompanionPreference(key('room-1'))).toEqual({ member: '', known: true, storageError: false });
    expect(readCompanionPreference(key('room-2')).member).toBe(members[1]);
  });
  it('does not access storage for an invalid trip context', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem');
    const set = vi.spyOn(Storage.prototype, 'setItem');
    expect(key('  ')).toBe('');
    expect(readCompanionPreference('')).toMatchObject({ member: '' });
    expect(writeCompanionPreference('', members[0], members)).toBe(false);
    expect(readLegacyCompanionCandidate('', members).candidate).toBe('');
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
  it('reports matching legacy hints and rejects conflicting hints', () => {
    localStorage.setItem('travel-active-member-room-1', members[0]);
    localStorage.setItem('travel-checklist-actor-room-1', members[0]);
    expect(readLegacyCompanionCandidate('room-1', members)).toEqual({ candidate: members[0], conflict: false });
    localStorage.setItem('travel-checklist-actor-room-1', members[1]);
    expect(readLegacyCompanionCandidate('room-1', members)).toEqual({ candidate: '', conflict: true });
  });
});
