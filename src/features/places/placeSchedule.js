// Compare scheduling inputs, not content or the persisted representation of numbers.
// AUTO travel minutes come from the route, so its stored mins are not an input.
const minutes = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
};

export function hasPlaceScheduleChanged(previous, next) {
  const previousMode = previous?.nextLeg?.mode || 'AUTO';
  const nextMode = next?.nextLeg?.mode || 'AUTO';
  return String(previous?.time || '').trim() !== String(next?.time || '').trim()
    || minutes(previous?.stayTime) !== minutes(next?.stayTime)
    || previousMode !== nextMode
    || (nextMode !== 'AUTO' && minutes(previous?.nextLeg?.mins) !== minutes(next?.nextLeg?.mins));
}
