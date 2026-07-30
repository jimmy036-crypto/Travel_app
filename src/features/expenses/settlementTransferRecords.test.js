import { describe, expect, it } from 'vitest';

import {
  cancelSettlementTransferPaid,
  createPaidSettlementTransferRecord,
  markSettlementTransferPaid,
  partitionSettlementTransfers,
} from './settlementTransferRecords.js';

const NOW = '2026-07-28T04:30:00.000Z';

const transfer = {
  fromParticipantId: '王小明',
  toParticipantId: '陳小華',
  amount: 1250,
  currency: 'TWD',
  scope: 'pretrip',
};

describe('settlement transfer records', () => {
  it('creates a stable paid record with the complete timestamp contract', () => {
    expect(createPaidSettlementTransferRecord({
      transfer,
      idFactory: () => 'transfer-1',
      now: () => NOW,
    })).toEqual({
      id: 'transfer-1',
      fromParticipantId: '王小明',
      toParticipantId: '陳小華',
      amount: 1250,
      currency: 'TWD',
      scope: 'pretrip',
      status: 'paid',
      paidAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('marks a pending record paid without replacing its stable id', () => {
    const result = markSettlementTransferPaid({
      records: [{
        id: 'transfer-1',
        ...transfer,
        status: 'pending',
        paidAt: null,
        createdAt: '2026-07-27T01:00:00.000Z',
        updatedAt: '2026-07-27T01:00:00.000Z',
      }],
      transfer,
      now: () => NOW,
    });

    expect(result).toEqual([expect.objectContaining({
      id: 'transfer-1',
      status: 'paid',
      paidAt: NOW,
      updatedAt: NOW,
    })]);
  });

  it('cancels paid status while preserving the record', () => {
    const result = cancelSettlementTransferPaid({
      records: [{
        id: 'transfer-1',
        ...transfer,
        status: 'paid',
        paidAt: NOW,
        createdAt: NOW,
        updatedAt: NOW,
      }],
      recordId: 'transfer-1',
      now: () => '2026-07-28T05:00:00.000Z',
    });

    expect(result).toEqual([expect.objectContaining({
      id: 'transfer-1',
      status: 'pending',
      paidAt: null,
      updatedAt: '2026-07-28T05:00:00.000Z',
    })]);
  });

  it('only matches payer, recipient, currency, and exact amount', () => {
    const paid = createPaidSettlementTransferRecord({
      transfer,
      idFactory: () => 'transfer-1',
      now: () => NOW,
    });

    const { pending, completed } = partitionSettlementTransfers({
      records: [paid],
      suggestions: [
        transfer,
        { ...transfer, amount: 1300 },
        { ...transfer, currency: 'JPY' },
      ],
    });

    expect(completed).toEqual([paid]);
    expect(pending).toEqual([
      expect.objectContaining({ amount: 1300, currency: 'TWD' }),
      expect.objectContaining({ amount: 1250, currency: 'JPY' }),
    ]);
  });

  it('keeps otherwise-equal transfers in separate scopes', () => {
    const paid = createPaidSettlementTransferRecord({
      transfer,
      idFactory: () => 'transfer-1',
      now: () => NOW,
    });
    const { pending } = partitionSettlementTransfers({
      records: [paid],
      suggestions: [
        transfer,
        { ...transfer, scope: 'intrip' },
      ],
    });

    expect(pending).toEqual([
      expect.objectContaining({ scope: 'intrip', amount: 1250 }),
    ]);
  });

  it('treats legacy transfer entries as paid TWD history without losing them', () => {
    const { completed } = partitionSettlementTransfers({
      records: [{
        id: 'legacy-1',
        from: '王小明',
        to: '陳小華',
        amount: 1250,
        createdAt: 1785213000000,
      }],
      suggestions: [transfer],
    });

    expect(completed).toEqual([
      expect.objectContaining({
        id: 'legacy-1',
        fromParticipantId: '王小明',
        toParticipantId: '陳小華',
        currency: 'TWD',
        status: 'paid',
      }),
    ]);
  });
});
