// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref as databaseRef, set, update } from 'firebase/database';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  deleteObject,
  getBytes,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ID = 'demo-travel-rules';
const ROOM_ID = 'secure-room';
const OWNER_UID = 'owner-uid';
const EDITOR_UID = 'editor-uid';
const REMOVED_UID = 'removed-uid';
const OUTSIDER_UID = 'outsider-uid';

let environment;

const authContext = (uid) => environment.authenticatedContext(uid, {
  firebase: { sign_in_provider: 'google.com' },
});

async function seedAuthorization() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.database();
    await set(databaseRef(database), {
      rooms: {
        [ROOM_ID]: {
          meta: {
            ownerUid: OWNER_UID,
            title: '安全旅程',
          },
          itinerary: { 'Day 1': [{ id: 'place-1', name: '台北車站' }] },
          expenses: [],
          settlements: [],
          tickets: [],
          checklist: {},
        },
      },
      roomAccess: {
        [ROOM_ID]: {
          ownerUid: OWNER_UID,
          members: {
            [OWNER_UID]: { uid: OWNER_UID, role: 'owner', status: 'active', aclVersion: 1 },
            [EDITOR_UID]: { uid: EDITOR_UID, role: 'editor', status: 'active', aclVersion: 1 },
            [REMOVED_UID]: { uid: REMOVED_UID, role: 'editor', status: 'removed', aclVersion: 2 },
          },
        },
      },
      userTrips: {
        [OWNER_UID]: { [ROOM_ID]: { role: 'owner', status: 'active', aclVersion: 1 } },
        [EDITOR_UID]: { [ROOM_ID]: { role: 'editor', status: 'active', aclVersion: 1 } },
      },
    });

    const firestore = context.firestore();
    for (const [uid, role, status] of [
      [OWNER_UID, 'owner', 'active'],
      [EDITOR_UID, 'editor', 'active'],
      [REMOVED_UID, 'editor', 'removed'],
    ]) {
      await setDoc(doc(firestore, `tripAccess/${ROOM_ID}/members/${uid}`), {
        uid,
        role,
        status,
        aclVersion: status === 'removed' ? 2 : 1,
        updatedAt: new Date(),
      });
    }
  });
}

beforeAll(async () => {
  const [databaseRules, firestoreRules, storageRules] = await Promise.all([
    readFile(resolve('database.rules.json'), 'utf8'),
    readFile(resolve('firestore.rules'), 'utf8'),
    readFile(resolve('storage.rules'), 'utf8'),
  ]);
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules: databaseRules },
    firestore: { rules: firestoreRules },
    storage: { rules: storageRules },
  });
});

beforeEach(async () => {
  await Promise.all([
    environment.clearDatabase(),
    environment.clearFirestore(),
    environment.clearStorage(),
  ]);
  await seedAuthorization();
});

afterAll(async () => {
  await environment?.cleanup();
});

describe('Realtime Database authorization', () => {
  it('denies anonymous, outsider and removed users while active members can read/write', async () => {
    const anonymous = environment.unauthenticatedContext().database();
    const outsider = authContext(OUTSIDER_UID).database();
    const removed = authContext(REMOVED_UID).database();
    const owner = authContext(OWNER_UID).database();
    const editor = authContext(EDITOR_UID).database();

    await assertFails(get(databaseRef(anonymous, `rooms/${ROOM_ID}`)));
    await assertFails(get(databaseRef(outsider, `rooms/${ROOM_ID}`)));
    await assertFails(get(databaseRef(removed, `rooms/${ROOM_ID}`)));
    await assertSucceeds(get(databaseRef(owner, `rooms/${ROOM_ID}`)));
    await assertSucceeds(update(databaseRef(editor, `rooms/${ROOM_ID}/itinerary/Day 1/0`), {
      memo: 'editor update',
    }));
    const passwordUser = environment.authenticatedContext(OWNER_UID, {
      firebase: { sign_in_provider: 'password' },
    }).database();
    await assertFails(get(databaseRef(passwordUser, `rooms/${ROOM_ID}`)));
  });

  it('keeps ACL, invite state and account indexes server-managed', async () => {
    const owner = authContext(OWNER_UID).database();
    const editor = authContext(EDITOR_UID).database();

    await assertFails(update(databaseRef(owner, `roomAccess/${ROOM_ID}/members/${EDITOR_UID}`), {
      role: 'owner',
    }));
    await assertFails(set(databaseRef(owner, `tripInvites/forged`), { active: true }));
    await assertFails(set(databaseRef(owner, `userTrips/${OWNER_UID}/forged-room`), true));
    await assertSucceeds(get(databaseRef(owner, `userTrips/${OWNER_UID}`)));
    await assertFails(get(databaseRef(editor, `userTrips/${OWNER_UID}`)));
  });

  it('requires meta ownerUid to remain immutable', async () => {
    const owner = authContext(OWNER_UID).database();
    await assertSucceeds(update(databaseRef(owner, `rooms/${ROOM_ID}/meta`), {
      title: '更新名稱',
    }));
    await assertFails(update(databaseRef(owner, `rooms/${ROOM_ID}/meta`), {
      ownerUid: EDITOR_UID,
    }));
  });

  it('fails closed for malformed member identity or ACL version records', async () => {
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.database();
      await set(databaseRef(database, `roomAccess/${ROOM_ID}/members/${OUTSIDER_UID}`), {
        uid: 'different-uid',
        role: 'editor',
        status: 'active',
        aclVersion: 1,
      });
      await update(databaseRef(database, `roomAccess/${ROOM_ID}/members/${EDITOR_UID}`), {
        aclVersion: 0,
      });
    });

    await assertFails(get(databaseRef(authContext(OUTSIDER_UID).database(), `rooms/${ROOM_ID}`)));
    await assertFails(get(databaseRef(authContext(EDITOR_UID).database(), `rooms/${ROOM_ID}`)));
  });

  it('rejects malformed branch records and oversized immediate strings', async () => {
    const editor = authContext(EDITOR_UID).database();
    await assertFails(set(
      databaseRef(editor, `rooms/${ROOM_ID}/expenses/0`),
      'not-an-expense-record',
    ));
    await assertFails(update(
      databaseRef(editor, `rooms/${ROOM_ID}/itinerary/Day 1/0`),
      { memo: 'x'.repeat(10_001) },
    ));
    await assertFails(set(
      databaseRef(editor, `rooms/${ROOM_ID}/unknownBranch`),
      { attacker: true },
    ));
  });
});

describe('Firestore ACL mirror', () => {
  it('denies every browser read and write, including the matching uid', async () => {
    const owner = authContext(OWNER_UID).firestore();
    const target = doc(owner, `tripAccess/${ROOM_ID}/members/${OWNER_UID}`);
    await assertFails(getDoc(target));
    await assertFails(setDoc(target, { uid: OWNER_UID, role: 'owner', status: 'active' }));
  });
});

describe('Cloud Storage authorization', () => {
  const validMetadata = {
    contentType: 'image/png',
    cacheControl: 'private, no-store, max-age=0',
    customMetadata: { roomId: ROOM_ID, ticketId: 'ticket-1' },
  };

  it('allows active members to create/read/delete a valid object and denies overwrite', async () => {
    const owner = authContext(OWNER_UID).storage();
    const file = storageRef(owner, `rooms/${ROOM_ID}/tickets/ticket-1/revision.png`);
    await assertSucceeds(uploadBytes(file, new Uint8Array([1, 2, 3]), validMetadata));
    await assertSucceeds(getBytes(file));
    await assertFails(uploadBytes(file, new Uint8Array([4]), validMetadata));
    await assertSucceeds(deleteObject(file));
  });

  it('denies anonymous, outsider and removed users', async () => {
    const path = `rooms/${ROOM_ID}/tickets/ticket-1/revision.png`;
    await assertFails(uploadBytes(
      storageRef(environment.unauthenticatedContext().storage(), path),
      new Uint8Array([1]),
      validMetadata,
    ));
    await assertFails(uploadBytes(
      storageRef(authContext(OUTSIDER_UID).storage(), path),
      new Uint8Array([1]),
      validMetadata,
    ));
    await assertFails(uploadBytes(
      storageRef(authContext(REMOVED_UID).storage(), path),
      new Uint8Array([1]),
      validMetadata,
    ));
    await assertFails(uploadBytes(
      storageRef(environment.authenticatedContext(OWNER_UID, {
        firebase: { sign_in_provider: 'password' },
      }).storage(), path),
      new Uint8Array([1]),
      validMetadata,
    ));
  });

  it('requires Google provider claims even when the uid has an active ACL', async () => {
    const path = `rooms/${ROOM_ID}/tickets/ticket-1/provider-check.png`;
    const ownerStorage = authContext(OWNER_UID).storage();
    await assertSucceeds(uploadBytes(
      storageRef(ownerStorage, path),
      new Uint8Array([1, 2, 3]),
      validMetadata,
    ));

    const passwordContext = environment.authenticatedContext(OWNER_UID, {
      firebase: { sign_in_provider: 'password' },
    });
    await assertFails(get(
      databaseRef(passwordContext.database(), `rooms/${ROOM_ID}`),
    ));
    await assertFails(getBytes(storageRef(passwordContext.storage(), path)));
    await assertFails(uploadBytes(
      storageRef(passwordContext.storage(), `rooms/${ROOM_ID}/tickets/ticket-1/password.png`),
      new Uint8Array([4]),
      validMetadata,
    ));

    await assertSucceeds(deleteObject(storageRef(ownerStorage, path)));
  });

  it('denies wrong metadata, unsupported MIME, unknown paths and oversized files', async () => {
    const owner = authContext(OWNER_UID).storage();
    const ticketPath = `rooms/${ROOM_ID}/tickets/ticket-1`;
    await assertFails(uploadBytes(
      storageRef(owner, `${ticketPath}/wrong-room.png`),
      new Uint8Array([1]),
      { ...validMetadata, customMetadata: { roomId: 'another-room', ticketId: 'ticket-1' } },
    ));
    await assertFails(uploadBytes(
      storageRef(owner, `${ticketPath}/script.svg`),
      new Uint8Array([1]),
      { ...validMetadata, contentType: 'image/svg+xml' },
    ));
    await assertFails(uploadBytes(
      storageRef(owner, `rooms/${ROOM_ID}/unknown/file.png`),
      new Uint8Array([1]),
      validMetadata,
    ));
    await assertFails(uploadBytes(
      storageRef(owner, `${ticketPath}/oversized.png`),
      new Uint8Array((10 * 1024 * 1024) + 1),
      validMetadata,
    ));
  });

  it('applies separate place image/PDF metadata and path constraints', async () => {
    const editor = authContext(EDITOR_UID).storage();
    const image = storageRef(editor, `rooms/${ROOM_ID}/places/place-1/photo.webp`);
    await assertSucceeds(uploadBytes(image, new Uint8Array([1]), {
      contentType: 'image/webp',
      cacheControl: 'private, no-store, max-age=0',
      customMetadata: { roomId: ROOM_ID, itemId: 'place-1' },
    }));
    const wrongItem = storageRef(editor, `rooms/${ROOM_ID}/places/place-1/menu.pdf`);
    await assertFails(uploadBytes(wrongItem, new Uint8Array([1]), {
      contentType: 'application/pdf',
      cacheControl: 'private, no-store, max-age=0',
      customMetadata: { roomId: ROOM_ID, itemId: 'place-2' },
    }));
    expect(true).toBe(true);
  });
});
