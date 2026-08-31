import { createHash } from 'node:crypto';

import { expect, test, type Page } from '@playwright/test';

import {
  E2E_AUTH_UID,
  clearEmulatorDatabase,
  clearEmulatorStorage,
  listEmulatorStorageObjects,
  readEmulatorData,
  readEmulatorFirestoreDocument,
  seedTestTrip,
  seedTestTripInvite,
  uploadEmulatorStorageObject,
  writeEmulatorData,
  writeEmulatorFirestoreDocument,
} from './support/emulator';

type DeletionJournal = {
  completedAt?: number;
  creationId?: string;
  deletionId?: string;
  inviteHashes?: Record<string, true>;
  members?: Record<string, unknown>;
  ownerUid?: string;
  requestedAt?: number;
  roomId?: string;
  state?: string;
  titleSnapshot?: string;
};

type RoomReservation = {
  createdAt?: number;
  createdByUid?: string;
  creationId?: string;
  deletedAt?: number;
  deletionId?: string;
  roomId?: string;
  state?: string;
};

type RoomAccess = {
  creationId?: string;
  invite?: {
    active?: boolean;
    tokenHash?: string;
  };
  members?: Record<string, {
    aclVersion?: number;
    role?: string;
    status?: string;
    uid?: string;
  }>;
  ownerUid?: string;
  state?: string;
};

type TripRoom = {
  meta?: {
    ownerUid?: string;
  };
};

type FirestoreRestDocument = {
  fields?: Record<string, unknown>;
};

const firestoreString = (
  document: FirestoreRestDocument | null,
  field: string,
): string => {
  const value = document?.fields?.[field] as { stringValue?: string } | undefined;
  return String(value?.stringValue || '');
};

async function closeUpdateNoticeIfVisible(page: Page) {
  const closeButton = page.getByRole('button', {
    name: '太棒了，開始使用！',
  });

  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }
}

test.beforeEach(async () => {
  await Promise.all([
    clearEmulatorDatabase(),
    clearEmulatorStorage(),
  ]);
});

test.afterEach(async () => {
  await Promise.all([
    clearEmulatorDatabase(),
    clearEmulatorStorage(),
  ]);
});

test('owner permanently deletes one complete trip without touching another room', async ({
  page,
}) => {
  const tripTitle = `E2E 永久刪除 ${Date.now()}`;
  const unrelatedRoomId = 'e2e-unrelated-delete-room';
  const unrelatedTitle = 'E2E 保留旅程';
  const editorUid = 'e2e-delete-editor';
  const editorDisplayName = 'E2E Delete Editor';
  const inviteToken = 'd'.repeat(43);
  const inviteTokenHash = createHash('sha256')
    .update(inviteToken, 'utf8')
    .digest('hex');
  const unrelatedStoragePath = (
    `rooms/${unrelatedRoomId}/tickets/keep-ticket/keep.pdf`
  );

  // Seed the control room before the browser listener starts. seedTestTrip
  // intentionally writes mirrors before roomAccess, which is safe while no UI
  // listener can observe that short setup window.
  await seedTestTrip(unrelatedRoomId, { title: unrelatedTitle });
  await uploadEmulatorStorageObject(
    unrelatedStoragePath,
    'unrelated room attachment',
    'application/pdf',
  );

  await page.goto('/');
  await closeUpdateNoticeIfVisible(page);
  await expect(page.getByTestId('travel-lobby')).toBeVisible();

  await page.getByTestId('create-trip-button').click();
  await expect(page.getByTestId('trip-modal')).toBeVisible();
  await page.getByTestId('trip-name-input').fill(tripTitle);
  await page.getByTestId('fill-emulator-required-fields').click();
  await page.getByTestId('create-trip-submit').click();

  const routeContext = page.getByTestId('trip-route-context');
  await expect(routeContext).toBeAttached();
  const roomId = String(await routeContext.getAttribute('data-room-id') || '');
  expect(roomId).not.toBe('');

  const storagePath = `rooms/${roomId}/tickets/delete-ticket/attachment.pdf`;

  await writeEmulatorData(`rooms/${roomId}/tickets`, [{
    id: 'delete-ticket',
    title: '刪除測試票券',
    type: 'document',
    storagePath,
  }]);
  await writeEmulatorData(`rooms/${roomId}/expenses`, [{
    id: 'delete-expense',
    item: '刪除測試費用',
    amount: 1280,
    payer: 'E2E Owner',
    split: { 'E2E Owner': 1280 },
  }]);
  await uploadEmulatorStorageObject(
    storagePath,
    'trip deletion attachment',
    'application/pdf',
  );

  const editorUpdatedAt = Date.now();
  // Seed derived mirrors before the canonical member. The canonical write
  // schedules syncTripMemberAccess, so this ordering avoids racing a direct
  // Firestore seed against the trigger transaction.
  await writeEmulatorData(`userTrips/${editorUid}/${roomId}`, {
    role: 'editor',
    status: 'active',
    aclVersion: 1,
    updatedAt: editorUpdatedAt,
  });
  await writeEmulatorFirestoreDocument(
    `tripAccess/${roomId}/members/${editorUid}`,
    {
      uid: { stringValue: editorUid },
      role: { stringValue: 'editor' },
      status: { stringValue: 'active' },
      aclVersion: { integerValue: '1' },
      updatedAt: { timestampValue: new Date(editorUpdatedAt).toISOString() },
    },
  );
  await writeEmulatorData(`roomAccess/${roomId}/members/${editorUid}`, {
    uid: editorUid,
    displayName: editorDisplayName,
    photoURL: `https://example.test/${editorUid}.png`,
    role: 'editor',
    status: 'active',
    aclVersion: 1,
    joinedAt: editorUpdatedAt,
    updatedAt: editorUpdatedAt,
  });
  await seedTestTripInvite(roomId, {
    token: inviteToken,
    createdByUid: E2E_AUTH_UID,
  });

  const reservationBefore = await readEmulatorData<RoomReservation>(
    `roomReservations/${roomId}`,
  );
  expect(reservationBefore).toEqual(expect.objectContaining({
    roomId,
    createdByUid: E2E_AUTH_UID,
  }));
  expect(reservationBefore?.creationId).toBeTruthy();

  await expect.poll(async () => {
    const ownerAcl = await readEmulatorFirestoreDocument(
      `tripAccess/${roomId}/members/${E2E_AUTH_UID}`,
    );
    return firestoreString(ownerAcl, 'status');
  }).toBe('active');
  await expect.poll(async () => {
    const editorAcl = await readEmulatorFirestoreDocument(
      `tripAccess/${roomId}/members/${editorUid}`,
    );
    return firestoreString(editorAcl, 'status');
  }).toBe('active');

  await page.getByTestId('back-to-lobby').click();
  await expect(page.getByTestId('travel-lobby')).toBeVisible();

  const [roomBeforeDelete, accessBeforeDelete, reservationBeforeDelete] = await Promise.all([
    readEmulatorData<TripRoom>(`rooms/${roomId}`),
    readEmulatorData<RoomAccess>(`roomAccess/${roomId}`),
    readEmulatorData<RoomReservation>(`roomReservations/${roomId}`),
  ]);
  expect(roomBeforeDelete?.meta?.ownerUid).toBe(E2E_AUTH_UID);
  expect(accessBeforeDelete).toEqual(expect.objectContaining({
    state: 'ready',
    ownerUid: E2E_AUTH_UID,
    creationId: reservationBefore?.creationId,
  }));
  expect(accessBeforeDelete?.members?.[E2E_AUTH_UID]).toEqual(expect.objectContaining({
    uid: E2E_AUTH_UID,
    role: 'owner',
    status: 'active',
    aclVersion: expect.any(Number),
  }));
  expect(accessBeforeDelete?.members?.[editorUid]).toEqual(expect.objectContaining({
    uid: editorUid,
    role: 'editor',
    status: 'active',
    aclVersion: 1,
  }));
  expect(accessBeforeDelete?.invite).toEqual(expect.objectContaining({
    active: true,
    tokenHash: inviteTokenHash,
  }));
  expect(await readEmulatorData(`userTrips/${editorUid}/${roomId}`)).toEqual(
    expect.objectContaining({
      role: 'editor',
      status: 'active',
      aclVersion: 1,
    }),
  );
  expect(await readEmulatorData(`tripInvites/${inviteTokenHash}`)).toEqual(
    expect.objectContaining({
      roomId,
      role: 'editor',
      active: true,
      version: 1,
    }),
  );
  expect(reservationBeforeDelete).toEqual(expect.objectContaining({
    roomId,
    creationId: accessBeforeDelete?.creationId,
    createdByUid: E2E_AUTH_UID,
    createdAt: expect.any(Number),
  }));

  const targetCard = page.locator(
    `[data-testid="trip-card"][data-room-id="${roomId}"]`,
  );
  await expect(targetCard).toBeVisible();
  const deleteAction = targetCard.getByTestId('delete-trip-action');
  await expect(deleteAction).toHaveAccessibleName(`永久刪除旅程：${tripTitle}`);
  await deleteAction.click();

  const dialog = page.getByRole('dialog', { name: '永久刪除整趟旅程' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(`輸入完整旅程名稱「${tripTitle}」以確認`).fill(tripTitle);
  await dialog.getByRole('button', { name: '永久刪除整趟旅程' }).click();

  await expect(dialog).toHaveCount(0);
  await expect.poll(async () => {
    const deletion = await readEmulatorData<DeletionJournal>(
      `tripDeletions/${roomId}`,
    );
    return deletion?.state;
  }, {
    message: `durable deletion journal for ${roomId} reaches deleted`,
    // The Functions Emulator may cold-start before the worker performs its
    // deliberate two-pass Storage sweep with a 2-second settle window.
    timeout: 30_000,
  }).toBe('deleted');

  await expect(targetCard).toHaveCount(0);
  await expect(page.getByTestId('trip-card-title').filter({
    hasText: unrelatedTitle,
  })).toBeVisible();

  expect(await readEmulatorData(`rooms/${roomId}`)).toBeNull();
  expect(await readEmulatorData(`roomAccess/${roomId}`)).toBeNull();
  expect(await readEmulatorData(`userTrips/${E2E_AUTH_UID}/${roomId}`)).toBeNull();
  expect(await readEmulatorData(`userTrips/${editorUid}/${roomId}`)).toBeNull();
  expect(await readEmulatorData(`tripInvites/${inviteTokenHash}`)).toBeNull();

  const journal = await readEmulatorData<DeletionJournal>(
    `tripDeletions/${roomId}`,
  );
  const reservationAfter = await readEmulatorData<RoomReservation>(
    `roomReservations/${roomId}`,
  );
  expect(journal).toEqual(expect.objectContaining({
    roomId,
    ownerUid: E2E_AUTH_UID,
    creationId: reservationBefore?.creationId,
    deletionId: expect.any(String),
    requestedAt: expect.any(Number),
    state: 'deleted',
  }));
  expect(journal?.completedAt).toEqual(expect.any(Number));
  expect(journal?.titleSnapshot).toBeUndefined();
  expect(journal?.members).toBeUndefined();
  expect(journal?.inviteHashes).toBeUndefined();
  expect(reservationAfter).toEqual(expect.objectContaining({
    roomId,
    creationId: reservationBefore?.creationId,
    createdByUid: E2E_AUTH_UID,
    createdAt: reservationBefore?.createdAt,
    deletionId: journal?.deletionId,
    state: 'deleted',
    deletedAt: expect.any(Number),
  }));
  expect(Number(reservationAfter?.deletedAt)).toBeGreaterThanOrEqual(
    Number(journal?.requestedAt),
  );
  expect(Number(reservationAfter?.deletedAt)).toBeLessThanOrEqual(
    Number(journal?.completedAt),
  );

  expect(await readEmulatorFirestoreDocument(
    `tripAccess/${roomId}/members/${E2E_AUTH_UID}`,
  )).toBeNull();
  expect(await readEmulatorFirestoreDocument(
    `tripAccess/${roomId}/members/${editorUid}`,
  )).toBeNull();
  const deletionGuard = await readEmulatorFirestoreDocument(
    `tripAccess/${roomId}`,
  );
  expect(firestoreString(deletionGuard, 'roomId')).toBe(roomId);
  expect(firestoreString(deletionGuard, 'ownerUid')).toBe(E2E_AUTH_UID);
  expect(firestoreString(deletionGuard, 'state')).toBe('deleted');

  // Removing roomAccess emits syncTripMemberAccess independently from the
  // deletion worker. Consecutive clean reads keep this assertion open across
  // that trigger drain, catching a delayed handler that recreates an editor
  // index, Firestore ACL, or invite lookup after the journal says deleted.
  let consecutiveCleanReads = 0;
  await expect.poll(async () => {
    const [editorIndex, editorAcl, inviteLookup] = await Promise.all([
      readEmulatorData(`userTrips/${editorUid}/${roomId}`),
      readEmulatorFirestoreDocument(
        `tripAccess/${roomId}/members/${editorUid}`,
      ),
      readEmulatorData(`tripInvites/${inviteTokenHash}`),
    ]);
    const remainsDeleted = (
      editorIndex === null
      && editorAcl === null
      && inviteLookup === null
    );
    consecutiveCleanReads = remainsDeleted ? consecutiveCleanReads + 1 : 0;
    return consecutiveCleanReads;
  }, {
    message: `delayed member sync for ${editorUid} remains fail-closed`,
    intervals: [500, 1_000, 1_000],
    timeout: 5_000,
  }).toBe(3);

  expect(await listEmulatorStorageObjects(`rooms/${roomId}`)).toEqual([]);
  const lateStoragePath = (
    `rooms/${roomId}/tickets/late-finalize/late-after-deletion.pdf`
  );
  await uploadEmulatorStorageObject(
    lateStoragePath,
    'resumable upload finalized after deletion',
    'application/pdf',
  );
  await expect.poll(async () => (
    await listEmulatorStorageObjects(`rooms/${roomId}`)
  ).map((object) => object.name), {
    message: `late finalized object is removed from deleted namespace ${roomId}`,
    intervals: [250, 500, 1_000],
    timeout: 15_000,
  }).toEqual([]);

  expect(await readEmulatorData(`rooms/${unrelatedRoomId}/meta/title`))
    .toBe(unrelatedTitle);
  expect(await readEmulatorData(
    `userTrips/${E2E_AUTH_UID}/${unrelatedRoomId}/status`,
  )).toBe('active');
  expect(await readEmulatorFirestoreDocument(
    `tripAccess/${unrelatedRoomId}/members/${E2E_AUTH_UID}`,
  )).not.toBeNull();
  expect((await listEmulatorStorageObjects(`rooms/${unrelatedRoomId}`))
    .map((object) => object.name)).toContain(unrelatedStoragePath);
});
