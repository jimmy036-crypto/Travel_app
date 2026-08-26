import { describe, expect, it } from 'vitest';

import { selectLobbyTripSummary } from './lobbyTripSummary.js';

const NOW = new Date(2026, 7, 25, 12);

function trip(overrides = {}) {
  return {
    roomId: 'room-default',
    title: '預設旅程',
    destination: '台北',
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    ...overrides,
  };
}

describe('selectLobbyTripSummary', () => {
  it('selects the earliest valid future trip from unsorted Lobby data', () => {
    const trips = [
      trip({ roomId: 'past', startDate: '2026-08-01', endDate: '2026-08-05' }),
      trip({ roomId: 'later', startDate: '2026-10-01', endDate: '2026-10-05' }),
      trip({ roomId: 'invalid', startDate: 'not-a-date' }),
      trip({
        roomId: 'next',
        title: '沖繩六日',
        destination: '日本沖繩縣',
        startDate: '2026-09-20',
        endDate: '2026-09-25',
      }),
    ];

    expect(selectLobbyTripSummary(trips, { now: NOW })).toEqual({
      roomId: 'next',
      timing: 'upcoming',
      title: '沖繩六日',
      destination: '日本沖繩縣',
      startDate: '2026-09-20',
      endDate: '2026-09-25',
      durationDays: 6,
      daysUntil: 26,
      currentDay: null,
    });
  });

  it('prioritizes an ongoing trip and chooses the one ending first', () => {
    const selected = selectLobbyTripSummary([
      trip({ roomId: 'future', startDate: '2026-09-01', endDate: '2026-09-03' }),
      trip({ roomId: 'ongoing-long', startDate: '2026-08-20', endDate: '2026-08-30' }),
      trip({ roomId: 'ongoing-near', startDate: '2026-08-24', endDate: '2026-08-28' }),
    ], { now: NOW });

    expect(selected).toMatchObject({
      roomId: 'ongoing-near',
      timing: 'ongoing',
      currentDay: 2,
      durationDays: 5,
      daysUntil: 0,
    });
  });

  it('keeps the original order when future dates tie', () => {
    const selected = selectLobbyTripSummary([
      trip({ roomId: 'first' }),
      trip({ roomId: 'second' }),
    ], { now: NOW });

    expect(selected.roomId).toBe('first');
  });

  it('rejects past, malformed, reversed, and invalid-room candidates', () => {
    const selected = selectLobbyTripSummary([
      null,
      trip({ roomId: 'past', startDate: '2026-08-01', endDate: '2026-08-24' }),
      trip({ roomId: 'bad-date', startDate: '2026-02-30' }),
      trip({ roomId: 'reversed', startDate: '2026-09-05', endDate: '2026-09-01' }),
      trip({ roomId: 'too-long', startDate: '2026-09-01', endDate: '2026-10-01' }),
      trip({ roomId: 'bad/room' }),
      trip({ roomId: '' }),
    ], { now: NOW });

    expect(selected).toBeNull();
  });

  it('treats a one-day trip today as ongoing', () => {
    const selected = selectLobbyTripSummary([
      trip({ startDate: '2026-08-25', endDate: '2026-08-25' }),
    ], { now: NOW });

    expect(selected).toMatchObject({
      timing: 'ongoing',
      durationDays: 1,
      currentDay: 1,
      daysUntil: 0,
    });
  });

  it('uses approved fallbacks for missing title and destination', () => {
    const selected = selectLobbyTripSummary([
      trip({ title: ' ', destination: null }),
    ], { now: NOW });

    expect(selected).toMatchObject({
      title: '未命名旅程',
      destination: '主要地點未設定',
    });
  });

  it('calculates calendar-day countdown across a year boundary', () => {
    const selected = selectLobbyTripSummary([
      trip({
        startDate: '2027-01-02',
        endDate: '2027-01-04',
      }),
    ], { now: new Date(2026, 11, 31, 23, 30) });

    expect(selected).toMatchObject({ daysUntil: 2, durationDays: 3 });
  });

  it('does not mutate the source trips or their order', () => {
    const trips = [
      trip({ roomId: 'later', startDate: '2026-10-01', endDate: '2026-10-02' }),
      trip({ roomId: 'earlier' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(trips));

    selectLobbyTripSummary(trips, { now: NOW });

    expect(trips).toEqual(snapshot);
  });

  it('returns null for missing trips or an invalid reference date', () => {
    expect(selectLobbyTripSummary(null, { now: NOW })).toBeNull();
    expect(selectLobbyTripSummary([], { now: NOW })).toBeNull();
    expect(selectLobbyTripSummary([trip()], { now: new Date('invalid') })).toBeNull();
  });
});
