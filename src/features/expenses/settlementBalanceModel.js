import {
  buildSettlementTransfers,
  calculateBalanceSnapshot,
  calculateSettlementSummary,
  roundMoney,
} from './expenseCalculations.js';
import {
  normalizeSettlementScope,
  normalizeSettlementTransferRecord,
  settlementTransferIdentityKey,
  settlementTransferKey,
} from './settlementTransferRecords.js';
import { PRE_TRIP_ID } from './expenseConstants.js';

export const SETTLEMENT_SCOPES = Object.freeze({
  ALL: 'all',
  PRETRIP: 'pretrip',
  INTRIP: 'intrip',
});

export const classifySettlementExpense = (
  expense,
  preTripId = PRE_TRIP_ID,
) => (
  String(expense?.dayId || '') === String(preTripId)
    ? SETTLEMENT_SCOPES.PRETRIP
    : SETTLEMENT_SCOPES.INTRIP
);

const normalizeSuggestion = (transfer, scope) => ({
  from: String(transfer?.from || transfer?.fromParticipantId || ''),
  to: String(transfer?.to || transfer?.toParticipantId || ''),
  fromParticipantId: String(transfer?.fromParticipantId || transfer?.from || ''),
  toParticipantId: String(transfer?.toParticipantId || transfer?.to || ''),
  amount: roundMoney(Number(transfer?.amount) || 0, 2),
  currency: String(transfer?.currency || 'TWD').toUpperCase(),
  scope,
});

const applyMatchedPaidTransfers = (balances, transfers) => {
  const next = { ...balances };
  transfers.forEach((transfer) => {
    const from = String(transfer.fromParticipantId);
    const to = String(transfer.toParticipantId);
    const amount = Number(transfer.amount) || 0;
    if (amount <= 0 || from === to) return;
    if (next[from] === undefined || next[to] === undefined) return;
    next[from] = roundMoney(next[from] + amount, 2);
    next[to] = roundMoney(next[to] - amount, 2);
  });
  return next;
};

const sortHistory = (records) => [...records].sort((left, right) => (
  new Date(right.paidAt || right.updatedAt).getTime()
  - new Date(left.paidAt || left.updatedAt).getTime()
));

export function buildSettlementBalanceModel({
  expenses,
  settlements,
  members,
  preTripId = PRE_TRIP_ID,
  currency = 'TWD',
} = {}) {
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeMembers = Array.isArray(members) ? members : [];
  const normalizedRecords = (Array.isArray(settlements) ? settlements : [])
    .map((record) => normalizeSettlementTransferRecord(record, currency))
    .filter(Boolean);
  const scopes = [SETTLEMENT_SCOPES.PRETRIP, SETTLEMENT_SCOPES.INTRIP];

  const scopeDrafts = Object.fromEntries(scopes.map((scope) => {
    const scopeExpenses = safeExpenses.filter(
      (expense) => classifySettlementExpense(expense, preTripId) === scope,
    );
    const rawSnapshot = calculateBalanceSnapshot({
      expenses: scopeExpenses,
      members: safeMembers,
    });
    const rawTransfers = buildSettlementTransfers(rawSnapshot.balances)
      .map((transfer) => normalizeSuggestion(transfer, scope));
    return [scope, {
      scope,
      expenses: scopeExpenses,
      expenseTotal: roundMoney(
        scopeExpenses.reduce((sum, expense) => sum + (Number(expense?.cost) || 0), 0),
        2,
      ),
      rawBalances: rawSnapshot.balances,
      rawTransfers,
    }];
  }));

  const allSuggestions = scopes.flatMap((scope) => scopeDrafts[scope].rawTransfers);
  const resolvedRecords = normalizedRecords.map((record) => {
    const explicitScope = normalizeSettlementScope(record.scope);
    const matches = allSuggestions.filter((suggestion) => (
      settlementTransferIdentityKey(suggestion, currency)
      === settlementTransferIdentityKey(record, currency)
      && (!explicitScope || suggestion.scope === explicitScope)
    ));
    const inferredScope = !explicitScope && matches.length === 1
      ? matches[0].scope
      : null;
    const effectiveScope = explicitScope || inferredScope;
    return {
      ...record,
      effectiveScope,
      inferredScope: Boolean(inferredScope),
      matchesCurrent: Boolean(
        record.status === 'paid'
        && effectiveScope
        && matches.some((suggestion) => suggestion.scope === effectiveScope),
      ),
      legacyUnscoped: !explicitScope,
    };
  });

  const models = Object.fromEntries(scopes.map((scope) => {
    const draft = scopeDrafts[scope];
    const suggestionKeys = new Set(
      draft.rawTransfers.map((suggestion) => settlementTransferKey(suggestion, currency)),
    );
    const appliedKeys = new Set();
    const matchedPaidTransfers = [];

    resolvedRecords.forEach((record) => {
      if (record.status !== 'paid' || record.effectiveScope !== scope) return;
      const scopedRecord = { ...record, scope };
      const key = settlementTransferKey(scopedRecord, currency);
      if (!suggestionKeys.has(key) || appliedKeys.has(key)) return;
      appliedKeys.add(key);
      matchedPaidTransfers.push(scopedRecord);
    });

    const remainingBalances = applyMatchedPaidTransfers(
      draft.rawBalances,
      matchedPaidTransfers,
    );
    const remainingTransfers = buildSettlementTransfers(remainingBalances)
      .map((transfer) => normalizeSuggestion(transfer, scope));
    const completedRecords = sortHistory(
      resolvedRecords.filter((record) => (
        record.status === 'paid' && record.effectiveScope === scope
      )),
    );

    return [scope, {
      ...draft,
      rawSummary: calculateSettlementSummary({
        balances: draft.rawBalances,
        transfers: draft.rawTransfers,
        members: safeMembers,
      }),
      matchedPaidTransfers,
      remainingBalances,
      remainingTransfers,
      remainingSummary: calculateSettlementSummary({
        balances: remainingBalances,
        transfers: remainingTransfers,
        members: safeMembers,
      }),
      completedRecords,
    }];
  }));

  const unresolvedLegacyRecords = sortHistory(
    resolvedRecords.filter((record) => (
      record.status === 'paid' && !record.effectiveScope
    )),
  );
  const aggregate = {
    expenseTotal: roundMoney(
      models.pretrip.expenseTotal + models.intrip.expenseTotal,
      2,
    ),
    remainingSummary: {
      receivableTotal: roundMoney(
        models.pretrip.remainingSummary.receivableTotal
        + models.intrip.remainingSummary.receivableTotal,
        2,
      ),
      payableTotal: roundMoney(
        models.pretrip.remainingSummary.payableTotal
        + models.intrip.remainingSummary.payableTotal,
        2,
      ),
      transferCount: (
        models.pretrip.remainingSummary.transferCount
        + models.intrip.remainingSummary.transferCount
      ),
      balancedMemberCount: (
        models.pretrip.remainingSummary.balancedMemberCount
        + models.intrip.remainingSummary.balancedMemberCount
      ),
      isSettled: (
        models.pretrip.remainingSummary.isSettled
        && models.intrip.remainingSummary.isSettled
      ),
    },
  };

  return {
    scopes: models,
    aggregate,
    unresolvedLegacyRecords,
    normalizedRecords,
  };
}
