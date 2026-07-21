import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearTicketActiveMember,
  getTicketActiveMemberStorageKey,
  readTicketActiveMember,
  writeTicketActiveMember,
} from './ticketIdentity.js';

const members = ['王泓文', '陳小美'];

describe('ticket active member device identity', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('writes and reads a valid member', () => {
    expect(writeTicketActiveMember({ roomId: 'room-1', member: ' 王泓文 ', members }))
      .toBe(true);
    expect(readTicketActiveMember({ roomId: 'room-1', members })).toBe('王泓文');
    expect(localStorage.getItem('travel-active-member-room-1')).toBe('王泓文');
  });

  it('keeps identities separate for each room', () => {
    writeTicketActiveMember({ roomId: 'room-1', member: '王泓文', members });
    writeTicketActiveMember({ roomId: 'room-2', member: '陳小美', members });

    expect(readTicketActiveMember({ roomId: 'room-1', members })).toBe('王泓文');
    expect(readTicketActiveMember({ roomId: 'room-2', members })).toBe('陳小美');
  });

  it('does not save a blank member', () => {
    expect(writeTicketActiveMember({ roomId: 'room-1', member: '  ', members })).toBe(false);
    expect(localStorage.getItem('travel-active-member-room-1')).toBeNull();
  });

  it('does not save a member who is absent from the trip', () => {
    expect(writeTicketActiveMember({ roomId: 'room-1', member: '已離開成員', members }))
      .toBe(false);
    expect(localStorage.getItem('travel-active-member-room-1')).toBeNull();
  });

  it('reads a valid checklist actor fallback and upgrades the storage key', () => {
    localStorage.setItem('travel-checklist-actor-room-1', '陳小美');

    expect(readTicketActiveMember({ roomId: 'room-1', members })).toBe('陳小美');
    expect(localStorage.getItem('travel-active-member-room-1')).toBe('陳小美');
  });

  it('ignores a checklist actor fallback that is no longer a member', () => {
    localStorage.setItem('travel-checklist-actor-room-1', '已離開成員');

    expect(readTicketActiveMember({ roomId: 'room-1', members })).toBe('');
    expect(localStorage.getItem('travel-active-member-room-1')).toBeNull();
  });

  it('does not throw when localStorage operations fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(readTicketActiveMember({ roomId: 'room-1', members })).toBe('');
    expect(writeTicketActiveMember({ roomId: 'room-1', member: '王泓文', members }))
      .toBe(false);
    expect(clearTicketActiveMember('room-1')).toBe(false);
  });

  it('clears the active member for one room', () => {
    localStorage.setItem('travel-active-member-room-1', '王泓文');
    localStorage.setItem('travel-active-member-room-2', '陳小美');

    expect(clearTicketActiveMember('room-1')).toBe(true);
    expect(localStorage.getItem('travel-active-member-room-1')).toBeNull();
    expect(localStorage.getItem('travel-active-member-room-2')).toBe('陳小美');
  });

  it('does not access storage for an invalid roomId', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');

    expect(getTicketActiveMemberStorageKey('  ')).toBe('');
    expect(readTicketActiveMember({ roomId: '  ', members })).toBe('');
    expect(writeTicketActiveMember({ roomId: '', member: '王泓文', members })).toBe(false);
    expect(clearTicketActiveMember(null)).toBe(false);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });
});
