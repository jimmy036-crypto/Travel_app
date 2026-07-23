const TRANSITIONS = Object.freeze({
  prepared: {
    BEGIN_ROOM_WRITE: 'writing-room',
    ROOM_ALREADY_VERIFIED: 'room-verified',
  },
  'writing-room': {
    ROOM_VERIFIED: 'room-verified',
    ROOM_AMBIGUOUS: 'writing-room',
    ROOM_FAILED: 'prepared',
  },
  'room-verified': {
    BEGIN_MYTRIPS_WRITE: 'linking-mytrips',
  },
  'linking-mytrips': {
    MYTRIPS_VERIFIED: 'completed',
    MYTRIPS_FAILED: 'repair-required',
  },
  'repair-required': {
    RETRY_MYTRIPS: 'linking-mytrips',
    OPEN_VERIFIED_ROOM: 'completed',
  },
  completed: {
    RESUME: 'completed',
  },
});

const inFlight = new Map();
const CLONE_BROWSER_LOCK = 'travel-app-demo-clone-operation';

export function transitionCloneOperation(journal, event) {
  const nextState = TRANSITIONS[journal?.state]?.[event];
  if (!nextState) throw new Error(`Invalid Clone transition: ${journal?.state || 'none'} -> ${event}`);
  return { ...journal, state: nextState };
}

export function hasCloneCollision(existing, candidate) {
  if (!existing || !candidate || existing.roomId !== candidate.roomId) return false;
  return existing.operationId !== candidate.operationId
    || existing.payloadFingerprint !== candidate.payloadFingerprint;
}

export function sameCloneOperation(left, right) {
  return Boolean(
    left
    && right
    && left.operationId === right.operationId
    && left.roomId === right.roomId
    && left.payloadFingerprint === right.payloadFingerprint,
  );
}

export function runCloneOperationOnce(operationId, executor) {
  if (!operationId || typeof executor !== 'function') return Promise.reject(new Error('Invalid Clone execution.'));
  if (inFlight.has(operationId)) return inFlight.get(operationId);
  const promise = Promise.resolve().then(executor).finally(() => {
    if (inFlight.get(operationId) === promise) inFlight.delete(operationId);
  });
  inFlight.set(operationId, promise);
  return promise;
}

export function runCloneBrowserLock(executor, options = {}) {
  if (typeof executor !== 'function') return Promise.reject(new Error('Invalid Clone execution.'));
  const locks = options.locks ?? globalThis.navigator?.locks;
  if (!locks || typeof locks.request !== 'function') return Promise.resolve().then(executor);
  return locks.request(CLONE_BROWSER_LOCK, { mode: 'exclusive' }, executor);
}

export function clearCloneOperationLocks() {
  inFlight.clear();
}
