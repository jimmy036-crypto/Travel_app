const INVALID = { ok: false, error: 'INVALID_EXPRESSION' };

// Money fields accept arithmetic, but never execute user text as JavaScript.
export const parseExpenseAmount = (raw) => {
  const source = String(raw ?? '').trim()
    .replaceAll('＋', '+').replaceAll('－', '-').replaceAll('−', '-')
    .replaceAll('×', '*').replaceAll('÷', '/');
  if (!source || source.length > 120 || !/^[\d.+\-*/()\s]+$/.test(source)) return INVALID;

  let index = 0;
  let error = null;
  const skipSpaces = () => {
    while (/\s/.test(source[index] || '') && index < source.length) index += 1;
  };
  const parseFactor = () => {
    skipSpaces();
    if (source[index] === '+' || source[index] === '-') {
      const sign = source[index++] === '-' ? -1 : 1;
      return sign * parseFactor();
    }
    if (source[index] === '(') {
      index += 1;
      const value = parseSum();
      skipSpaces();
      if (source[index] !== ')') error = 'INVALID_EXPRESSION';
      else index += 1;
      return value;
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(source.slice(index));
    if (!match) {
      error = 'INVALID_EXPRESSION';
      return Number.NaN;
    }
    index += match[0].length;
    return Number(match[0]);
  };
  const parseProduct = () => {
    let value = parseFactor();
    skipSpaces();
    while (source[index] === '*' || source[index] === '/') {
      const operator = source[index++];
      const next = parseFactor();
      if (operator === '/' && next === 0) error = 'DIVIDE_BY_ZERO';
      value = operator === '*' ? value * next : value / next;
      skipSpaces();
    }
    return value;
  };
  const parseSum = () => {
    let value = parseProduct();
    skipSpaces();
    while (source[index] === '+' || source[index] === '-') {
      const operator = source[index++];
      const next = parseProduct();
      value = operator === '+' ? value + next : value - next;
      skipSpaces();
    }
    return value;
  };

  const value = parseSum();
  skipSpaces();
  if (error) return { ok: false, error };
  if (index !== source.length || !Number.isFinite(value)) return INVALID;
  if (value < 0) return { ok: false, error: 'NEGATIVE_AMOUNT' };
  const cents = Math.round((value + Number.EPSILON) * 100);
  if (!Number.isSafeInteger(cents)) return { ok: false, error: 'AMOUNT_TOO_LARGE' };
  return { ok: true, value: cents / 100 };
};

export const parseOptionalExpenseAmount = (raw) => (
  String(raw ?? '').trim() === '' ? { ok: true, value: 0 } : parseExpenseAmount(raw)
);
