const INVALID = { ok: false, error: 'INVALID_EXPRESSION' };
const ZERO = { numerator: 0n, denominator: 1n };

const fraction = (numerator, denominator) => (
  denominator < 0n
    ? { numerator: -numerator, denominator: -denominator }
    : { numerator, denominator }
);

// Money fields accept arithmetic, but never execute user text as JavaScript.
// Exact decimal fractions avoid binary floating-point rounding at half cents.
export const parseExpenseAmount = (raw) => {
  const source = String(raw ?? '').trim()
    .replaceAll('＋', '+').replaceAll('－', '-').replaceAll('−', '-')
    .replaceAll('×', '*').replaceAll('÷', '/');
  if (!source || source.length > 120 || !/^[\d.+\-*/()\s]+$/.test(source)) return INVALID;

  let index = 0;
  let error = null;
  const skipSpaces = () => {
    while (index < source.length && /\s/.test(source[index])) index += 1;
  };
  const parseFactor = () => {
    skipSpaces();
    if (source[index] === '+' || source[index] === '-') {
      const sign = source[index++] === '-' ? -1n : 1n;
      const value = parseFactor();
      return fraction(sign * value.numerator, value.denominator);
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
      return ZERO;
    }
    index += match[0].length;
    const [whole = '0', decimals = ''] = match[0].split('.');
    return fraction(BigInt(`${whole || '0'}${decimals}`), 10n ** BigInt(decimals.length));
  };
  const parseProduct = () => {
    let value = parseFactor();
    skipSpaces();
    while (source[index] === '*' || source[index] === '/') {
      const operator = source[index++];
      const next = parseFactor();
      if (operator === '/' && next.numerator === 0n) {
        error = 'DIVIDE_BY_ZERO';
        value = ZERO;
      } else if (operator === '*') {
        value = fraction(value.numerator * next.numerator, value.denominator * next.denominator);
      } else {
        value = fraction(value.numerator * next.denominator, value.denominator * next.numerator);
      }
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
      const signedNumerator = operator === '+' ? next.numerator : -next.numerator;
      value = fraction(
        value.numerator * next.denominator + signedNumerator * value.denominator,
        value.denominator * next.denominator,
      );
      skipSpaces();
    }
    return value;
  };

  const value = parseSum();
  skipSpaces();
  if (error) return { ok: false, error };
  if (index !== source.length) return INVALID;
  if (value.numerator < 0n) return { ok: false, error: 'NEGATIVE_AMOUNT' };
  const cents = (value.numerator * 200n + value.denominator) / (2n * value.denominator);
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, error: 'AMOUNT_TOO_LARGE' };
  return { ok: true, value: Number(cents) / 100 };
};

export const parseOptionalExpenseAmount = (raw) => (
  String(raw ?? '').trim() === '' ? { ok: true, value: 0 } : parseExpenseAmount(raw)
);
