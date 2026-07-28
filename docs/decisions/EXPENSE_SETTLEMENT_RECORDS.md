# Expense settlement transfer records

Status: implementation decision for this change only. This document does not represent Gate 1, Gate 3, or release approval.

## Context

The expense engine already stored a `settlements` array, but legacy entries were manual pre-trip transfers that directly changed calculated balances. They did not have a completion state, currency, `paidAt`, or `updatedAt`. Because records and current recommendations shared the same calculation, editing an expense could make old payment data silently affect a different recommendation.

## Decision

Keep the existing repository branch and evolve each entry into an independent transfer completion record:

```ts
type SettlementTransferRecord = {
  id: string;
  fromParticipantId: string;
  toParticipantId: string;
  amount: number;
  currency: string;
  status: "pending" | "paid";
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Current settlement suggestions remain derived only from expenses. A suggestion is complete only when a paid record matches payer, recipient, currency, and exact rounded amount. Changed amounts and currencies therefore produce a new pending suggestion, while the old completed record remains visible.

Marking and cancelling use `TripRepository.updateSettlements`. Firebase trips write the existing `rooms/{tripId}/settlements` branch; the example trip writes its versioned IndexedDB snapshot. Components do not import or call Firebase.

Legacy records with `from`, `to`, `amount`, and `createdAt` are read as paid TWD history. New writes always use the complete contract.

## Scope limits

No partial payments, exchange-rate settlement, banking integration, proof uploads, data migration, Rules change, dependency change, or production access is included.
