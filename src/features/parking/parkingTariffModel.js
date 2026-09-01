const money = (currency, amount) => `${currency === 'JPY' ? '¥' : 'NT$'}${Number(amount).toLocaleString('zh-TW')}`;

export function parseParkingTariff(rawText, currency = 'TWD') {
  const raw = String(rawText || '').trim();
  const effectiveCurrency = /日圓|¥/.test(raw) ? 'JPY' : currency;
  const base = {
    currency: raw ? effectiveCurrency : null,
    rawText: raw || null,
    rules: [],
    hourlyEquivalent: null,
    displaySummary: raw || '費率資料未提供',
    confidence: raw ? 'low' : 'unknown',
    updatedAt: null,
  };
  if (!raw) return base;

  const normalized = raw.replace(/，/g, ' ').replace(/；/g, '\n');
  const maximumMatch = normalized.match(/(?:(\d{1,2}:\d{2})\s*[–—~-]\s*(\d{1,2}:\d{2})\s*)?(?:當日|入場後\s*(\d+)\s*小時)?\s*最高\s*(?:NT\$|新?台幣|日圓|¥)?\s*([\d,]+)\s*(?:元|日圓)?/i);
  const timeRateMatch = normalized.match(/(?:(\d{1,2}:\d{2})\s*[–—~-]\s*(\d{1,2}:\d{2})\s*)?每\s*(?:(\d*)\s*小時|([\d]+)\s*分鐘)\s*(?:NT\$|新?台幣|日圓|¥)?\s*([\d,]+)\s*(?:元|日圓)?/i);

  if (timeRateMatch) {
    const unitMinutes = timeRateMatch[3] !== undefined
      ? (Number(timeRateMatch[3] || 1) * 60)
      : Number(timeRateMatch[4]);
    const unitPrice = Number(timeRateMatch[5].replace(/,/g, ''));
    const rule = {
      type: 'linear', unitMinutes, unitPrice,
      startTime: timeRateMatch[1] || null,
      endTime: timeRateMatch[2] || null,
      applicableDays: null,
      maximumPrice: null,
      maximumPeriod: null,
      conditions: timeRateMatch[1] ? `${timeRateMatch[1]}–${timeRateMatch[2]}` : null,
    };
    base.rules.push(rule);
    if (!rule.startTime && unitMinutes > 0) base.hourlyEquivalent = Math.round((unitPrice * 60) / unitMinutes);
  }

  if (maximumMatch) {
    const maximumPrice = Number(maximumMatch[4].replace(/,/g, ''));
    const maximumPeriod = maximumMatch[3]
      ? `入場後 ${maximumMatch[3]} 小時`
      : (maximumMatch[1] ? `${maximumMatch[1]}–${maximumMatch[2]}` : '當日');
    base.rules.push({
      type: 'maximum', unitMinutes: null, unitPrice: null,
      startTime: maximumMatch[1] || null,
      endTime: maximumMatch[2] || null,
      applicableDays: null,
      maximumPrice,
      maximumPeriod,
      conditions: `${maximumPeriod}最高`,
    });
  }

  const hasComplexConditions = /首(?:小時|半小時)|之後|平日|假日|免費|寬限|活動|特別費率/.test(normalized);
  if (hasComplexConditions) base.hourlyEquivalent = null;
  const fullyRecognized = !hasComplexConditions && base.rules.length > 0
    && normalized.replace(/(?:(?:\d{1,2}:\d{2})\s*[–—~-]\s*(?:\d{1,2}:\d{2})\s*)?每\s*(?:(?:\d*)\s*小時|(?:[\d]+)\s*分鐘)\s*(?:NT\$|新?台幣|日圓|¥)?\s*(?:[\d,]+)\s*(?:元|日圓)?/ig, '')
      .replace(/(?:(?:\d{1,2}:\d{2})\s*[–—~-]\s*(?:\d{1,2}:\d{2})\s*)?(?:當日|入場後\s*(?:\d+)\s*小時)?\s*最高\s*(?:NT\$|新?台幣|日圓|¥)?\s*(?:[\d,]+)\s*(?:元|日圓)?/ig, '')
      .trim().length === 0;
  base.confidence = fullyRecognized ? 'high' : 'low';
  if (base.hourlyEquivalent !== null) base.displaySummary = `約 ${money(effectiveCurrency, base.hourlyEquivalent)}／小時`;
  return base;
}

export const getMaximumLabel = (tariff) => {
  const rule = tariff?.rules?.find((item) => item.type === 'maximum');
  return rule ? `${rule.maximumPeriod}最高 ${money(tariff.currency, rule.maximumPrice)}` : null;
};
