import { parseDateOnlyLocal } from '../../helpers.js';

export const EXPENSE_CURRENCIES = Object.freeze([
  { code: 'TWD', rate: 1, label: '台幣 (TWD)' },
  { code: 'JPY', rate: 0.21, label: '日幣 (JPY)' },
  { code: 'USD', rate: 32.5, label: '美金 (USD)' },
  { code: 'KRW', rate: 0.024, label: '韓元 (KRW)' },
  { code: 'EUR', rate: 35, label: '歐元 (EUR)' },
  { code: 'THB', rate: 0.023, label: '泰銖 (THB)' },
]);

const DESTINATION_CURRENCIES = [
  ['JPY', /日本|東京|大阪|京都|沖繩|北海道|福岡|名古屋|Japan|Tokyo|Osaka|Kyoto/i],
  ['KRW', /韓國|首爾|釜山|濟州|Korea|Seoul|Busan/i],
  ['THB', /泰國|曼谷|清邁|普吉|Thailand|Bangkok|Chiang Mai|Phuket/i],
  ['USD', /美國|紐約|洛杉磯|夏威夷|United States|USA|New York|Hawaii/i],
  ['EUR', /歐洲|歐元|法國|德國|義大利|西班牙|荷蘭|巴黎|羅馬|Europe|France|Germany|Italy|Spain|Netherlands|Paris|Rome/i],
];

export const getSuggestedExpenseCurrency = ({ destination = '', expenseCurrency = '' } = {}) => {
  if (EXPENSE_CURRENCIES.some(({ code }) => code === expenseCurrency)) return expenseCurrency;
  const match = DESTINATION_CURRENCIES.find(([, pattern]) => pattern.test(String(destination)));
  return match?.[0] || 'TWD';
};

const localDayOrdinal = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000;

export const resolveExpenseDefaultDay = ({ startDate, days = [], selectedDay = '', now = new Date() } = {}) => {
  const validDays = Array.isArray(days) ? days.map(String) : [];
  const start = parseDateOnlyLocal(startDate);
  if (start && now instanceof Date && !Number.isNaN(now.getTime())) {
    const dayNumber = localDayOrdinal(now) - localDayOrdinal(start) + 1;
    const todayDay = `Day ${dayNumber}`;
    if (validDays.includes(todayDay)) return todayDay;
  }
  return validDays.includes(String(selectedDay)) ? String(selectedDay) : (validDays.find((day) => day !== 'PRE_TRIP') || validDays[0] || '');
};
