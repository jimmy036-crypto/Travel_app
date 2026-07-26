import { db, storage } from '../../firebase.js';
import { createFirebaseTripRepository } from './firebaseTripRepository.js';

export function createDefaultFirebaseTripRepository(tripId) {
  if (!db || !tripId) return null;
  return createFirebaseTripRepository({
    db,
    storage,
    tripId,
  });
}
