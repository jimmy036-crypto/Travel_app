function clone(value) {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function snapshotValue(snapshot) {
  if (!snapshot || typeof snapshot.val !== 'function') return null;
  return snapshot.val();
}

function sameOperation(existing, payload) {
  return Boolean(
    existing
    && payload
    && existing.cloneOperation?.operationId === payload.cloneOperation?.operationId
    && existing.cloneOperation?.payloadFingerprint === payload.cloneOperation?.payloadFingerprint,
  );
}

function assertPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Clone payload must be an object.');
  }
  if (!/^[a-z0-9][a-z0-9-]{5,127}$/i.test(payload.roomId || '')) {
    throw new Error('Clone payload has an invalid roomId.');
  }
  if (!payload.cloneOperation?.operationId || !payload.cloneOperation?.payloadFingerprint) {
    throw new Error('Clone payload is missing its operation marker.');
  }
}

export function createCloneDemoRepository(options = {}) {
  const {
    database,
    emulatorAuthorized,
    ref,
    get,
    runTransaction,
  } = options;

  const assertEmulator = () => {
    if (!emulatorAuthorized) {
      const error = new Error('Clone writes are restricted to the local Firebase Emulator.');
      error.code = 'CLONE_EMULATOR_REQUIRED';
      throw error;
    }
    if (!database || !ref || !get || !runTransaction) {
      throw new Error('Clone repository dependencies are unavailable.');
    }
  };

  const readRoom = async (roomId) => {
    assertEmulator();
    return snapshotValue(await get(ref(database, `rooms/${roomId}`)));
  };

  const verifyRoom = async (payload) => {
    assertPayload(payload);
    const existing = await readRoom(payload.roomId);
    if (!existing) return { status: 'missing', room: null };
    if (sameOperation(existing, payload)) {
      return { status: 'verified', room: clone(existing) };
    }
    return { status: 'collision', room: clone(existing) };
  };

  const createRoom = async (payload) => {
    assertEmulator();
    assertPayload(payload);
    const roomReference = ref(database, `rooms/${payload.roomId}`);
    try {
      const result = await runTransaction(
        roomReference,
        (current) => {
          if (current === null) return clone(payload);
          if (sameOperation(current, payload)) return current;
          return undefined;
        },
        { applyLocally: false },
      );
      const current = snapshotValue(result?.snapshot);
      if (result?.committed && sameOperation(current, payload)) {
        return { status: 'created', room: clone(current) };
      }
      if (sameOperation(current, payload)) {
        return { status: 'already-created', room: clone(current) };
      }
      if (current) {
        const error = new Error('Clone room identity collided with another operation.');
        error.code = 'CLONE_ROOM_COLLISION';
        throw error;
      }
      const verification = await verifyRoom(payload);
      if (verification.status === 'verified') {
        return { status: 'verified-after-transaction', room: verification.room };
      }
      const error = new Error('Clone room transaction was not committed.');
      error.code = 'CLONE_ROOM_NOT_COMMITTED';
      throw error;
    } catch (error) {
      if (error?.code === 'CLONE_ROOM_COLLISION') throw error;
      const verification = await verifyRoom(payload);
      if (verification.status === 'verified') {
        return {
          status: 'verified-after-ambiguous-result',
          room: verification.room,
          ambiguousError: error,
        };
      }
      if (verification.status === 'collision') {
        const collision = new Error('Clone room identity collided after read-back.');
        collision.code = 'CLONE_ROOM_COLLISION';
        throw collision;
      }
      const ambiguous = new Error('Clone room result is ambiguous and could not be verified.');
      ambiguous.code = 'CLONE_ROOM_AMBIGUOUS';
      ambiguous.cause = error;
      throw ambiguous;
    }
  };

  return { createRoom, readRoom, verifyRoom };
}

export function writeAndVerifyMyTrips(myTrips, tripReference) {
  if (!Array.isArray(myTrips)) throw new Error('myTrips must be an array.');
  if (!tripReference?.roomId) throw new Error('Trip reference is invalid.');
  const existing = myTrips.find((item) => item?.roomId === tripReference.roomId);
  const next = existing
    ? myTrips.map((item) => item?.roomId === tripReference.roomId ? clone(tripReference) : item)
    : [...myTrips, clone(tripReference)];
  const verified = next.find((item) => item?.roomId === tripReference.roomId);
  if (!verified) throw new Error('myTrips read-back failed.');
  return { trips: clone(next), reference: clone(verified) };
}

