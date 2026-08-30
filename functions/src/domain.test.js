import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CollaborationError,
  hashInviteToken,
  normalizeTripMeta,
  requireGoogleIdentity,
} from './domain.js';

test('hashInviteToken accepts generated 256-bit base64url shape and is deterministic', () => {
  const token = 'a'.repeat(43);
  assert.equal(hashInviteToken(token), hashInviteToken(token));
  assert.equal(hashInviteToken(token).length, 64);
});

test('requireGoogleIdentity rejects non-Google providers', () => {
  assert.throws(
    () => requireGoogleIdentity({
      uid: 'user-1',
      token: { firebase: { sign_in_provider: 'password' } },
    }),
    (error) => error instanceof CollaborationError && error.code === 'permission-denied',
  );
});

test('normalizeTripMeta validates the bounded date range and strips unknown fields', () => {
  const meta = normalizeTripMeta({
    title: '東京',
    destination: '日本東京',
    destLat: 35.6762,
    destLng: 139.6503,
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    members: ['自己', '自己', '朋友'],
    memberBudgets: { 自己: 12000 },
    transport: '電車',
    themeColor: '#ABCDEF',
    attackerControlled: true,
  }, 1234);

  assert.deepEqual(meta.members, ['自己', '朋友']);
  assert.equal(meta.themeColor, '#abcdef');
  assert.equal(meta.createdAt, 1234);
  assert.equal('attackerControlled' in meta, false);
});
