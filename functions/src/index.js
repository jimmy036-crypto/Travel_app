import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { setGlobalOptions } from 'firebase-functions/v2';
import { onValueWritten } from 'firebase-functions/v2/database';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { createCollaborationService } from './collaboration.js';
import { CollaborationError } from './domain.js';

initializeApp();
setGlobalOptions({ region: 'us-central1', maxInstances: 10 });

const service = createCollaborationService({
  database: getDatabase(),
  firestore: getFirestore(),
});

const callable = (name, handler) => onCall(async (request) => {
  try {
    return await handler(request.data, request.auth);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    if (error instanceof CollaborationError) {
      throw new HttpsError(error.code, error.message);
    }
    logger.error(`${name} failed`, error);
    throw new HttpsError('internal', '服務暫時無法完成操作，請稍後再試。');
  }
});

export const createTrip = callable('createTrip', service.createTrip);
export const getOrCreateTripInvite = callable(
  'getOrCreateTripInvite',
  service.getOrCreateTripInvite,
);
export const rotateTripInvite = callable('rotateTripInvite', service.rotateTripInvite);
export const revokeTripInvite = callable('revokeTripInvite', service.revokeTripInvite);
export const redeemTripInvite = callable('redeemTripInvite', service.redeemTripInvite);
export const listTripMembers = callable('listTripMembers', service.listTripMembers);
export const removeTripMember = callable('removeTripMember', service.removeTripMember);
export const restoreTripMember = callable('restoreTripMember', service.restoreTripMember);

export const syncTripMemberAccess = onValueWritten(
  {
    ref: '/roomAccess/{roomId}/members/{uid}',
    retry: true,
  },
  async (event) => {
    const { roomId, uid } = event.params;
    const current = event.data.after.val();
    if (current) {
      // Active grants must always be derived from the canonical RTDB record at
      // execution time. Event delivery can be delayed until after a rollback;
      // trusting event.data.after here could resurrect a revoked Storage ACL.
      await service.syncMemberAccess(roomId, uid);
      return;
    }

    const previous = event.data.before.val();
    if (!previous) return;
    const previousVersion = Number(previous.aclVersion);
    const eventTime = Date.parse(String(event.time || ''));
    await service.syncMemberAccess(roomId, uid, {
      ...previous,
      status: 'removed',
      aclVersion: Number.isSafeInteger(previousVersion) && previousVersion > 0
        ? previousVersion + 1
        : 2,
      updatedAt: Number.isFinite(eventTime) ? eventTime : Number(previous.updatedAt) || 1,
    });
  },
);
