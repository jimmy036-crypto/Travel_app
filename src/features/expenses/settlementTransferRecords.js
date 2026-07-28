const DEFAULT_CURRENCY = 'TWD';

const asText = (value) => String(value ?? '').trim();

const asMoney = (value) => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round((amount + Number.EPSILON) * 100) / 100
    : 0;
};

const asIsoTime = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

const nowIso = (now) => {
  const value = typeof now === 'function' ? now() : now;
  return asIsoTime(value, new Date().toISOString());
};

const createRecordId = () => (
  globalThis.crypto?.randomUUID?.()
  || `settlement-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
);

export const settlementTransferKey = (value, fallbackCurrency = DEFAULT_CURRENCY) => {
  const fromParticipantId = asText(value?.fromParticipantId ?? value?.from);
  const toParticipantId = asText(value?.toParticipantId ?? value?.to);
  const currency = asText(value?.currency || fallbackCurrency).toUpperCase();
  const amount = asMoney(value?.amount);
  return `${fromParticipantId}\u0000${toParticipantId}\u0000${currency}\u0000${amount.toFixed(2)}`;
};

export const normalizeSettlementTransferRecord = (
  value,
  fallbackCurrency = DEFAULT_CURRENCY,
) => {
  const id = asText(value?.id);
  const fromParticipantId = asText(value?.fromParticipantId ?? value?.from);
  const toParticipantId = asText(value?.toParticipantId ?? value?.to);
  const amount = asMoney(value?.amount);
  const currency = asText(value?.currency || fallbackCurrency).toUpperCase();
  if (!id || !fromParticipantId || !toParticipantId || fromParticipantId === toParticipantId) {
    return null;
  }
  if (!amount || !currency) return null;

  const createdAt = asIsoTime(value?.createdAt, new Date(0).toISOString());
  const status = value?.status === 'pending' ? 'pending' : 'paid';
  const paidAt = status === 'paid'
    ? asIsoTime(value?.paidAt ?? value?.createdAt, createdAt)
    : null;

  return {
    id,
    fromParticipantId,
    toParticipantId,
    amount,
    currency,
    status,
    paidAt,
    createdAt,
    updatedAt: asIsoTime(value?.updatedAt ?? value?.createdAt, createdAt),
  };
};

export const createPaidSettlementTransferRecord = ({
  transfer,
  currency = DEFAULT_CURRENCY,
  idFactory = createRecordId,
  now = () => new Date(),
} = {}) => {
  const timestamp = nowIso(now);
  const record = normalizeSettlementTransferRecord({
    id: idFactory(),
    fromParticipantId: transfer?.fromParticipantId ?? transfer?.from,
    toParticipantId: transfer?.toParticipantId ?? transfer?.to,
    amount: transfer?.amount,
    currency: transfer?.currency || currency,
    status: 'paid',
    paidAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, currency);

  if (!record) throw new TypeError('Settlement transfer is invalid.');
  return record;
};

export const markSettlementTransferPaid = ({
  records,
  transfer,
  currency = DEFAULT_CURRENCY,
  idFactory,
  now = () => new Date(),
} = {}) => {
  const safeRecords = (Array.isArray(records) ? records : [])
    .map((record) => normalizeSettlementTransferRecord(record, currency))
    .filter(Boolean);
  const key = settlementTransferKey(transfer, currency);
  const timestamp = nowIso(now);
  let matched = false;

  const nextRecords = safeRecords.map((record) => {
    if (matched || settlementTransferKey(record, currency) !== key) return record;
    matched = true;
    if (record.status === 'paid') return record;
    return {
      ...record,
      status: 'paid',
      paidAt: timestamp,
      updatedAt: timestamp,
    };
  });

  if (!matched) {
    nextRecords.push(createPaidSettlementTransferRecord({
      transfer,
      currency,
      idFactory,
      now: () => timestamp,
    }));
  }

  return nextRecords;
};

export const cancelSettlementTransferPaid = ({
  records,
  recordId,
  currency = DEFAULT_CURRENCY,
  now = () => new Date(),
} = {}) => {
  const targetId = asText(recordId);
  const timestamp = nowIso(now);
  return (Array.isArray(records) ? records : [])
    .map((record) => normalizeSettlementTransferRecord(record, currency))
    .filter(Boolean)
    .map((record) => (
      record.id === targetId
        ? {
            ...record,
            status: 'pending',
            paidAt: null,
            updatedAt: timestamp,
          }
        : record
    ));
};

export const partitionSettlementTransfers = ({
  suggestions,
  records,
  currency = DEFAULT_CURRENCY,
} = {}) => {
  const normalizedRecords = (Array.isArray(records) ? records : [])
    .map((record) => normalizeSettlementTransferRecord(record, currency))
    .filter(Boolean);
  const paidKeys = new Set(
    normalizedRecords
      .filter((record) => record.status === 'paid')
      .map((record) => settlementTransferKey(record, currency)),
  );
  const pending = (Array.isArray(suggestions) ? suggestions : [])
    .map((suggestion) => ({
      fromParticipantId: asText(suggestion?.fromParticipantId ?? suggestion?.from),
      toParticipantId: asText(suggestion?.toParticipantId ?? suggestion?.to),
      amount: asMoney(suggestion?.amount),
      currency: asText(suggestion?.currency || currency).toUpperCase(),
    }))
    .filter((suggestion) => (
      suggestion.fromParticipantId
      && suggestion.toParticipantId
      && suggestion.fromParticipantId !== suggestion.toParticipantId
      && suggestion.amount > 0
      && !paidKeys.has(settlementTransferKey(suggestion, currency))
    ));
  const completed = normalizedRecords
    .filter((record) => record.status === 'paid')
    .sort((left, right) => (
      new Date(right.paidAt || right.updatedAt).getTime()
      - new Date(left.paidAt || left.updatedAt).getTime()
    ));

  return { pending, completed, records: normalizedRecords };
};
