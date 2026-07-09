const DEFAULT_MONEY_TOLERANCE = 0.02;
const DEFAULT_TRANSFER_THRESHOLD = 0.5;

const toFiniteNumber = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const toMemberList = (members) => (
  [...new Set((Array.isArray(members) ? members : []).map(String).filter(Boolean))]
);

const makeZeroRecord = (members) => (
  Object.fromEntries(toMemberList(members).map((member) => [member, 0]))
);

export const roundMoney = (value, decimals = 2) => {
  const numericValue = toFiniteNumber(value, 0);
  const safeDecimals = Number.isInteger(decimals) && decimals >= 0 ? decimals : 2;
  const factor = 10 ** safeDecimals;
  return Math.round((numericValue + Number.EPSILON) * factor) / factor;
};

export const calculateTwdCost = (localCost, exchangeRate) => {
  const numericLocalCost = toFiniteNumber(localCost, 0);
  const numericRate = toFiniteNumber(exchangeRate, 0);
  if (numericLocalCost <= 0 || numericRate <= 0) return 0;
  return Math.round(numericLocalCost * numericRate);
};

export const calculateCustomTotal = (members, customAmounts) => (
  toMemberList(members).reduce(
    (sum, member) => sum + toFiniteNumber(customAmounts?.[member], 0),
    0,
  )
);

export const inferExpenseSplitState = ({
  expense = null,
  isEditing = false,
  members = [],
} = {}) => {
  const validMembers = toMemberList(members);

  if (!isEditing || !expense?.split || typeof expense.split !== 'object') {
    return {
      type: 'EQUAL',
      involved: validMembers,
      customAmounts: Object.fromEntries(validMembers.map((member) => [member, ''])),
    };
  }

  const amounts = validMembers.map((member) => toFiniteNumber(expense.split?.[member], 0));
  const involvedMembers = validMembers.filter((member, index) => amounts[index] > 0.005);
  const positiveAmounts = amounts.filter((amount) => amount > 0.005);
  const looksEqual = positiveAmounts.length > 0
    && Math.max(...positiveAmounts) - Math.min(...positiveAmounts) <= DEFAULT_MONEY_TOLERANCE;

  return {
    type: looksEqual ? 'EQUAL' : 'CUSTOM',
    involved: involvedMembers.length > 0 ? involvedMembers : validMembers,
    customAmounts: Object.fromEntries(
      validMembers.map((member) => {
        const amount = toFiniteNumber(expense.split?.[member], 0);
        return [member, amount > 0 ? String(amount) : ''];
      }),
    ),
  };
};

export const buildEqualSplit = ({ total, members, involved } = {}) => {
  const validMembers = toMemberList(members);
  const involvedSet = new Set(toMemberList(involved));
  const activeMembers = validMembers.filter((member) => involvedSet.has(member));
  const numericTotal = toFiniteNumber(total, 0);

  if (numericTotal <= 0) {
    return {
      ok: false,
      error: 'INVALID_TOTAL',
      activeMembers,
      split: makeZeroRecord(validMembers),
    };
  }

  if (activeMembers.length === 0) {
    return {
      ok: false,
      error: 'NO_INVOLVED_MEMBERS',
      activeMembers,
      split: makeZeroRecord(validMembers),
    };
  }

  const totalInCents = Math.round(numericTotal * 100);
  const baseShareInCents = Math.floor(totalInCents / activeMembers.length);
  const split = makeZeroRecord(validMembers);
  let distributedInCents = 0;

  activeMembers.forEach((member, index) => {
    const memberShareInCents = index === activeMembers.length - 1
      ? totalInCents - distributedInCents
      : baseShareInCents;

    split[member] = memberShareInCents / 100;
    distributedInCents += memberShareInCents;
  });

  return {
    ok: true,
    error: null,
    activeMembers,
    split,
  };
};

export const validateCustomSplit = ({
  total,
  members,
  customAmounts,
  tolerance = DEFAULT_MONEY_TOLERANCE,
} = {}) => {
  const validMembers = toMemberList(members);
  const numericTotal = toFiniteNumber(total, 0);
  const split = makeZeroRecord(validMembers);
  const invalidMembers = [];
  const negativeMembers = [];

  validMembers.forEach((member) => {
    const rawValue = customAmounts?.[member];
    const numericValue = Number(rawValue || 0);

    if (!Number.isFinite(numericValue)) {
      invalidMembers.push(member);
      return;
    }

    if (numericValue < 0) {
      negativeMembers.push(member);
    }

    split[member] = numericValue;
  });

  const customTotal = Object.values(split).reduce((sum, amount) => sum + amount, 0);
  const difference = roundMoney(customTotal - numericTotal, 2);
  const safeTolerance = Math.max(0, toFiniteNumber(tolerance, DEFAULT_MONEY_TOLERANCE));

  let error = null;
  if (numericTotal <= 0) error = 'INVALID_TOTAL';
  else if (invalidMembers.length > 0) error = 'INVALID_AMOUNT';
  else if (negativeMembers.length > 0) error = 'NEGATIVE_AMOUNT';
  else if (Math.abs(difference) > safeTolerance) error = 'TOTAL_MISMATCH';

  return {
    ok: error === null,
    error,
    split,
    customTotal,
    difference,
    invalidMembers,
    negativeMembers,
  };
};

export const rebalanceCustomAmounts = ({ total, members, customAmounts } = {}) => {
  const validMembers = toMemberList(members);
  const numericTotal = toFiniteNumber(total, 0);
  if (numericTotal <= 0 || validMembers.length === 0) return null;

  const activeMembers = validMembers.filter(
    (member) => toFiniteNumber(customAmounts?.[member], 0) > 0,
  );
  const targets = activeMembers.length > 0 ? activeMembers : validMembers;
  const existingTotal = targets.reduce(
    (sum, member) => sum + toFiniteNumber(customAmounts?.[member], 0),
    0,
  );

  const next = Object.fromEntries(validMembers.map((member) => [member, '']));
  const totalInCents = Math.round(numericTotal * 100);
  let distributedInCents = 0;

  targets.forEach((member, index) => {
    const rawShareInCents = existingTotal > 0
      ? totalInCents * (toFiniteNumber(customAmounts?.[member], 0) / existingTotal)
      : totalInCents / targets.length;

    const amountInCents = index === targets.length - 1
      ? totalInCents - distributedInCents
      : Math.floor(rawShareInCents);

    next[member] = String(amountInCents / 100);
    distributedInCents += amountInCents;
  });

  return next;
};

export const calculateBalanceSnapshot = ({
  expenses,
  members,
  expenseFilter = () => true,
} = {}) => {
  const validMembers = toMemberList(members);
  const balances = makeZeroRecord(validMembers);
  const personal = makeZeroRecord(validMembers);
  const safeExpenses = Array.isArray(expenses) ? expenses : [];

  safeExpenses.filter(expenseFilter).forEach((expense) => {
    const payer = String(expense?.payer || '');
    const cost = toFiniteNumber(expense?.cost, 0);

    if (balances[payer] !== undefined) {
      balances[payer] += cost;
    }

    if (expense?.split && typeof expense.split === 'object') {
      Object.entries(expense.split).forEach(([member, rawAmount]) => {
        if (balances[member] === undefined) return;
        const amount = toFiniteNumber(rawAmount, 0);
        balances[member] -= amount;
        personal[member] += amount;
      });
      return;
    }

    const splitAmount = cost / Math.max(1, validMembers.length);
    validMembers.forEach((member) => {
      balances[member] -= splitAmount;
      personal[member] += splitAmount;
    });
  });

  return { balances, personal };
};

export const applySettlementsToBalances = ({
  balances,
  settlements,
  scope = 'pretrip',
} = {}) => {
  const nextBalances = { ...(balances && typeof balances === 'object' ? balances : {}) };
  const safeSettlements = Array.isArray(settlements) ? settlements : [];

  safeSettlements
    .filter((settlement) => !scope || String(settlement?.scope || '') === String(scope))
    .forEach((settlement) => {
      const from = String(settlement?.from || '');
      const to = String(settlement?.to || '');
      const amount = toFiniteNumber(settlement?.amount, 0);

      if (from === to || amount <= 0) return;
      if (nextBalances[from] === undefined || nextBalances[to] === undefined) return;

      nextBalances[from] += amount;
      nextBalances[to] -= amount;
    });

  return nextBalances;
};

export const buildSettlementTransfers = (
  balances,
  threshold = DEFAULT_TRANSFER_THRESHOLD,
) => {
  const safeThreshold = Math.max(0, toFiniteNumber(threshold, DEFAULT_TRANSFER_THRESHOLD));
  const debtors = [];
  const creditors = [];

  Object.entries(balances && typeof balances === 'object' ? balances : {}).forEach(
    ([member, rawBalance]) => {
      const balance = toFiniteNumber(rawBalance, 0);
      if (balance < -safeThreshold) debtors.push({ member, amount: -balance });
      else if (balance > safeThreshold) creditors.push({ member, amount: balance });
    },
  );

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = Math.min(
      debtors[debtorIndex].amount,
      creditors[creditorIndex].amount,
    );

    if (amount > safeThreshold) {
      transfers.push({
        from: debtors[debtorIndex].member,
        to: creditors[creditorIndex].member,
        amount: roundMoney(amount, 2),
      });
    }

    debtors[debtorIndex].amount -= amount;
    creditors[creditorIndex].amount -= amount;

    if (debtors[debtorIndex].amount < safeThreshold) debtorIndex += 1;
    if (creditors[creditorIndex].amount < safeThreshold) creditorIndex += 1;
  }

  return transfers;
};

export const calculateBalanceTotal = (balances) => (
  roundMoney(
    Object.values(balances && typeof balances === 'object' ? balances : {})
      .reduce((sum, balance) => sum + toFiniteNumber(balance, 0), 0),
    2,
  )
);

export const calculateSettlementSummary = ({
  balances,
  transfers,
  members,
  threshold = DEFAULT_TRANSFER_THRESHOLD,
} = {}) => {
  const safeThreshold = Math.max(0, toFiniteNumber(threshold, DEFAULT_TRANSFER_THRESHOLD));
  const memberOrder = toMemberList([
    ...toMemberList(members),
    ...Object.keys(balances && typeof balances === 'object' ? balances : {}),
  ]);
  const safeTransfers = Array.isArray(transfers)
    ? transfers
    : buildSettlementTransfers(balances, safeThreshold);

  let receivableTotal = 0;
  let payableTotal = 0;
  let balancedMemberCount = 0;
  let receivableMemberCount = 0;
  let payableMemberCount = 0;

  memberOrder.forEach((member) => {
    const balance = toFiniteNumber(balances?.[member], 0);
    if (balance > safeThreshold) {
      receivableTotal += balance;
      receivableMemberCount += 1;
      return;
    }

    if (balance < -safeThreshold) {
      payableTotal += Math.abs(balance);
      payableMemberCount += 1;
      return;
    }

    balancedMemberCount += 1;
  });

  return {
    receivableTotal: roundMoney(receivableTotal, 2),
    payableTotal: roundMoney(payableTotal, 2),
    balancedMemberCount,
    receivableMemberCount,
    payableMemberCount,
    unsettledMemberCount: receivableMemberCount + payableMemberCount,
    transferCount: safeTransfers.length,
    transfersTotal: roundMoney(
      safeTransfers.reduce((sum, transfer) => sum + toFiniteNumber(transfer?.amount, 0), 0),
      2,
    ),
    isSettled: safeTransfers.length === 0 && receivableMemberCount === 0 && payableMemberCount === 0,
  };
};

export const calculateExpenseStats = ({
  expenses,
  settlements,
  members,
  existingDays,
  preTripId,
} = {}) => {
  const safeExpenses = Array.isArray(expenses) ? expenses : [];
  const safeSettlements = Array.isArray(settlements) ? settlements : [];
  const validMembers = toMemberList(members);
  const safePreTripId = String(preTripId || 'PRE_TRIP');
  const groupOrder = [
    safePreTripId,
    ...toMemberList(Array.isArray(existingDays) ? existingDays : []),
  ];
  const groupedMap = Object.fromEntries(groupOrder.map((day) => [day, []]));

  safeExpenses.forEach((expense) => {
    const key = expense?.dayId === safePreTripId
      ? safePreTripId
      : String(expense?.dayId || '');
    if (groupedMap[key]) groupedMap[key].push(expense);
  });

  const allSnapshot = calculateBalanceSnapshot({
    expenses: safeExpenses,
    members: validMembers,
  });
  const preTripSnapshot = calculateBalanceSnapshot({
    expenses: safeExpenses,
    members: validMembers,
    expenseFilter: (expense) => expense?.dayId === safePreTripId,
  });

  const preTripSettlements = safeSettlements.filter(
    (settlement) => settlement?.scope === 'pretrip',
  );
  const allBalances = applySettlementsToBalances({
    balances: allSnapshot.balances,
    settlements: preTripSettlements,
    scope: 'pretrip',
  });
  const preTripBalances = applySettlementsToBalances({
    balances: preTripSnapshot.balances,
    settlements: preTripSettlements,
    scope: 'pretrip',
  });

  const transfers = buildSettlementTransfers(allBalances);
  const preTripTransfers = buildSettlementTransfers(preTripBalances);

  return {
    totalExpense: safeExpenses.reduce(
      (sum, expense) => sum + toFiniteNumber(expense?.cost, 0),
      0,
    ),
    groupedExpenses: groupOrder.map((day) => ({ day, items: groupedMap[day] || [] })),
    balances: allBalances,
    personalSpent: allSnapshot.personal,
    transfers,
    settlementSummary: calculateSettlementSummary({
      balances: allBalances,
      transfers,
      members: validMembers,
    }),
    preTripBalances,
    preTripTransfers,
    preTripSettlementSummary: calculateSettlementSummary({
      balances: preTripBalances,
      transfers: preTripTransfers,
      members: validMembers,
    }),
    preTripTotal: safeExpenses
      .filter((expense) => expense?.dayId === safePreTripId)
      .reduce((sum, expense) => sum + toFiniteNumber(expense?.cost, 0), 0),
    preTripSettlementTotal: preTripSettlements.reduce(
      (sum, settlement) => sum + toFiniteNumber(settlement?.amount, 0),
      0,
    ),
    balanceTotal: calculateBalanceTotal(allBalances),
    preTripBalanceTotal: calculateBalanceTotal(preTripBalances),
  };
};

export const calculateCategoryStats = (expenses, categories) => {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const stats = {};

  safeCategories.forEach((category) => {
    stats[category.id] = { ...category, amount: 0 };
  });

  (Array.isArray(expenses) ? expenses : []).forEach((expense) => {
    if (!stats[expense?.category]) return;
    stats[expense.category].amount += toFiniteNumber(expense?.cost, 0);
  });

  return Object.values(stats)
    .filter((category) => category.amount > 0)
    .sort((a, b) => b.amount - a.amount);
};

export const calculateMemberCategoryStats = (expenses, members, categories) => {
  const safeMembers = toMemberList(members);
  const safeCategories = Array.isArray(categories) ? categories : [];
  const knownCategoryIds = new Set(safeCategories.map((category) => category.id));
  const fallbackCategoryId = knownCategoryIds.has('other') ? 'other' : safeCategories[0]?.id;
  const result = {};

  safeMembers.forEach((member) => {
    const memberCategories = {};
    safeCategories.forEach((category) => {
      memberCategories[category.id] = { ...category, amount: 0 };
    });
    result[member] = { total: 0, categories: memberCategories };
  });

  (Array.isArray(expenses) ? expenses : []).forEach((expense) => {
    const categoryId = knownCategoryIds.has(expense?.category)
      ? expense.category
      : fallbackCategoryId;

    if (!categoryId) return;

    const addShare = (member, rawAmount) => {
      const memberKey = String(member);
      const amount = toFiniteNumber(rawAmount, 0);
      if (amount <= 0 || !result[memberKey]) return;
      result[memberKey].total += amount;
      result[memberKey].categories[categoryId].amount += amount;
    };

    if (expense?.split && typeof expense.split === 'object') {
      Object.entries(expense.split).forEach(([member, amount]) => addShare(member, amount));
      return;
    }

    if (safeMembers.length === 0) return;
    const equalShare = toFiniteNumber(expense?.cost, 0) / safeMembers.length;
    safeMembers.forEach((member) => addShare(member, equalShare));
  });

  Object.values(result).forEach((memberStats) => {
    memberStats.categories = Object.values(memberStats.categories)
      .filter((category) => category.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  });

  return result;
};
