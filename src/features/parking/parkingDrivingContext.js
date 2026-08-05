const DRIVING_META_VALUES = ['汽車', '自駕', '開車', 'car', 'drive', 'driving'];
const DRIVING_LEG_MODES = new Set(['AUTO', 'DRIVE', 'DRIVING', 'CAR']);

export function isDrivingContext({ metaTransport, nextLegMode, previousLegMode } = {}) {
  const transport = String(metaTransport || '').normalize('NFKC').toLowerCase();
  if (DRIVING_META_VALUES.some((value) => transport.includes(value))) return true;
  return [nextLegMode, previousLegMode]
    .some((mode) => DRIVING_LEG_MODES.has(String(mode || '').toUpperCase()));
}
