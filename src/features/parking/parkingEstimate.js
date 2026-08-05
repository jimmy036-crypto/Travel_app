export function estimateParkingCost({ tariff, stayTime, arrivalTime }) {
  const minutes = Number(stayTime);
  const arrivalMatch = String(arrivalTime || '').match(/^(\d{1,2}):(\d{2})$/);
  const linearRules = tariff?.rules?.filter((rule) => rule.type === 'linear') || [];
  if (!Number.isFinite(minutes) || minutes <= 0 || !arrivalMatch || linearRules.length !== 1) {
    return { amount: null, message: '費率條件較複雜，請以現場公告為準' };
  }
  const arrivalMinutes = (Number(arrivalMatch[1]) * 60) + Number(arrivalMatch[2]);
  if (arrivalMinutes < 0 || arrivalMinutes >= 1440 || arrivalMinutes + minutes > 1440) {
    return { amount: null, message: '費率條件較複雜，請以現場公告為準' };
  }
  const rule = linearRules[0];
  if (rule.startTime || rule.endTime || !rule.unitMinutes || !Number.isFinite(rule.unitPrice)) {
    return { amount: null, message: '費率條件較複雜，請以現場公告為準' };
  }
  let amount = Math.ceil(minutes / rule.unitMinutes) * rule.unitPrice;
  const maximum = tariff.rules.find((item) => item.type === 'maximum' && item.maximumPeriod === '當日');
  if (maximum) amount = Math.min(amount, maximum.maximumPrice);
  return { amount, message: `估計約 ${tariff.currency === 'JPY' ? '¥' : 'NT$'}${amount.toLocaleString('zh-TW')}` };
}
