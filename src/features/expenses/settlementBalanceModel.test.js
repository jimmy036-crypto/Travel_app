import { describe, expect, it } from 'vitest';

import {
  buildSettlementBalanceModel,
  classifySettlementExpense,
} from './settlementBalanceModel.js';
import { PRE_TRIP_ID } from './expenseConstants.js';

const MEMBERS = ['Alice', 'Bob'];
const paidRecord = (overrides = {}) => ({
  id: 'paid-1',
  fromParticipantId: 'Bob',
  toParticipantId: 'Alice',
  amount: 100,
  currency: 'TWD',
  scope: 'pretrip',
  status: 'paid',
  paidAt: '2026-07-28T04:30:00.000Z',
  createdAt: '2026-07-28T04:30:00.000Z',
  updatedAt: '2026-07-28T04:30:00.000Z',
  ...overrides,
});

const expense = (dayId, cost = 200) => ({
  id: `${dayId}-${cost}`,
  dayId,
  cost,
  payer: 'Alice',
  split: { Alice: cost / 2, Bob: cost / 2 },
});

describe('scoped settlement balance model', () => {
  it('classifies canonical pre-trip separately from every trip-day expense', () => {
    expect(classifySettlementExpense({ dayId: PRE_TRIP_ID })).toBe('pretrip');
    expect(classifySettlementExpense({ dayId: 'Day 1' })).toBe('intrip');
    expect(classifySettlementExpense({ dayId: 'Day 99' })).toBe('intrip');
  });

  it('keeps equal transfers in both scopes independent', () => {
    const model = buildSettlementBalanceModel({
      expenses: [expense(PRE_TRIP_ID), expense('Day 1')],
      settlements: [paidRecord()],
      members: MEMBERS,
    });

    expect(model.scopes.pretrip.remainingSummary.isSettled).toBe(true);
    expect(model.scopes.pretrip.remainingBalances).toEqual({ Alice: 0, Bob: 0 });
    expect(model.scopes.intrip.remainingTransfers).toEqual([
      expect.objectContaining({ from: 'Bob', to: 'Alice', amount: 100, scope: 'intrip' }),
    ]);
    expect(model.aggregate.remainingSummary.transferCount).toBe(1);
  });

  it('all current scoped transfers paid makes every remaining balance zero', () => {
    const model = buildSettlementBalanceModel({
      expenses: [expense(PRE_TRIP_ID), expense('Day 1')],
      settlements: [
        paidRecord(),
        paidRecord({ id: 'paid-2', scope: 'intrip' }),
      ],
      members: MEMBERS,
    });

    expect(model.scopes.pretrip.remainingBalances).toEqual({ Alice: 0, Bob: 0 });
    expect(model.scopes.intrip.remainingBalances).toEqual({ Alice: 0, Bob: 0 });
    expect(model.aggregate.remainingSummary).toMatchObject({
      receivableTotal: 0,
      payableTotal: 0,
      transferCount: 0,
      isSettled: true,
    });
  });

  it('cancelled records restore the remaining transfer', () => {
    const model = buildSettlementBalanceModel({
      expenses: [expense(PRE_TRIP_ID)],
      settlements: [paidRecord({ status: 'pending', paidAt: null })],
      members: MEMBERS,
    });

    expect(model.scopes.pretrip.remainingBalances).toEqual({ Alice: 100, Bob: -100 });
    expect(model.scopes.pretrip.remainingTransfers).toHaveLength(1);
    expect(model.scopes.pretrip.completedRecords).toHaveLength(0);
  });

  it('changed expenses preserve history without completing the new amount', () => {
    const model = buildSettlementBalanceModel({
      expenses: [expense(PRE_TRIP_ID, 240)],
      settlements: [paidRecord()],
      members: MEMBERS,
    });

    expect(model.scopes.pretrip.remainingTransfers).toEqual([
      expect.objectContaining({ amount: 120 }),
    ]);
    expect(model.scopes.pretrip.completedRecords).toEqual([
      expect.objectContaining({
        id: 'paid-1',
        amount: 100,
        matchesCurrent: false,
      }),
    ]);
  });

  it('infers a missing legacy scope only for one unique current suggestion', () => {
    const model = buildSettlementBalanceModel({
      expenses: [expense(PRE_TRIP_ID, 200), expense('Day 1', 100)],
      settlements: [paidRecord({ scope: undefined })],
      members: MEMBERS,
    });

    expect(model.scopes.pretrip.remainingSummary.isSettled).toBe(true);
    expect(model.scopes.pretrip.completedRecords[0]).toMatchObject({
      inferredScope: true,
      matchesCurrent: true,
    });
    expect(model.scopes.intrip.remainingTransfers[0]).toMatchObject({ amount: 50 });
    expect(model.unresolvedLegacyRecords).toHaveLength(0);
  });

  it('keeps an ambiguous legacy record as unapplied history', () => {
    const model = buildSettlementBalanceModel({
      expenses: [expense(PRE_TRIP_ID), expense('Day 1')],
      settlements: [paidRecord({ scope: undefined })],
      members: MEMBERS,
    });

    expect(model.scopes.pretrip.remainingTransfers).toHaveLength(1);
    expect(model.scopes.intrip.remainingTransfers).toHaveLength(1);
    expect(model.unresolvedLegacyRecords).toEqual([
      expect.objectContaining({
        id: 'paid-1',
        legacyUnscoped: true,
        effectiveScope: null,
      }),
    ]);
  });
});
