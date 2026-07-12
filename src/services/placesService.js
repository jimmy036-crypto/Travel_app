import { ref as dbRef, update } from 'firebase/database';

function assertWritableRoom({ db, roomId }) {
  if (!db) {
    throw new Error('Firebase Database is required to persist itinerary.');
  }

  const safeRoomId = String(roomId || '').trim();
  if (!safeRoomId) {
    throw new Error('roomId is required to persist itinerary.');
  }

  return safeRoomId;
}

export function persistItinerary({ db, roomId, itinerary }) {
  const safeRoomId = assertWritableRoom({ db, roomId });
  return update(dbRef(db, `rooms/${safeRoomId}`), { itinerary });
}
