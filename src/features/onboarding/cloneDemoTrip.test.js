import { describe, expect, it } from 'vitest';

import { createDemoSandbox } from './demoSandboxStore.js';
import {
  convertDemoSandboxToTrip,
  createCloneStableId,
  fingerprintClonePayload,
} from './cloneDemoTrip.js';
import { CLONE_FORBIDDEN_KEYS, CLONE_PLACE_VERIFICATION } from './cloneDemoConstants.js';

const OPERATION_ID = 'operation-12345678';

function sandbox() {
  return createDemoSandbox({
    now: new Date('2026-07-23T04:00:00.000Z'),
    templateOptions: {
      now: new Date('2026-07-23T04:00:00.000Z'),
      startDate: '2026-08-01',
    },
  });
}

describe('Demo Sandbox Clone converter', () => {
  it('builds a fresh owner-only allowlist graph from the edited current snapshot', () => {
    const input = sandbox();
    input.trip.itinerary['Day 1'][0].name = '使用者編輯的景點';
    input.trip.checklist[0].text = '使用者編輯的清單';
    const before = structuredClone(input);
    const output = convertDemoSandboxToTrip(input, {
      operationId: OPERATION_ID,
      owner: '目前使用者',
    });
    expect(output.meta.members).toEqual(['目前使用者']);
    expect(output.meta.memberBudgets).toEqual({ 目前使用者: 0 });
    expect(output.itinerary['Day 1'][0]).toMatchObject({
      name: '使用者編輯的景點',
      locationVerification: CLONE_PLACE_VERIFICATION,
    });
    expect(output.checklist[0]).toMatchObject({
      text: '使用者編輯的清單',
      completed: false,
      completedAt: null,
      completedBy: '',
      assignee: '目前使用者',
    });
    expect(input).toEqual(before);
    expect(output).not.toBe(input.trip);
    expect(output.meta).not.toBe(input.trip.meta);
  });

  it('generates fresh deterministic room place and Checklist IDs', () => {
    const first = convertDemoSandboxToTrip(sandbox(), { operationId: OPERATION_ID, owner: '自己' });
    const retry = convertDemoSandboxToTrip(sandbox(), { operationId: OPERATION_ID, owner: '自己' });
    const next = convertDemoSandboxToTrip(sandbox(), { operationId: 'operation-87654321', owner: '自己' });
    expect(retry).toEqual(first);
    expect(next.roomId).not.toBe(first.roomId);
    expect(first.roomId).not.toBe('local-demo-sandbox');
    expect(first.itinerary['Day 1'][0].id).toBe(retry.itinerary['Day 1'][0].id);
    expect(first.checklist[0].id).toBe(retry.checklist[0].id);
    expect(first.itinerary['Day 1'][0].id).not.toContain('demo-place');
    expect(first.checklist[0].id).not.toContain('demo-checklist');
  });

  it('uses only owner or unassigned Checklist assignees', () => {
    const input = sandbox();
    input.trip.checklist[0].assignee = '';
    input.trip.checklist[0].owner = '';
    const output = convertDemoSandboxToTrip(input, { operationId: OPERATION_ID, owner: 'Owner' });
    expect(new Set(output.checklist.map((item) => item.assignee))).toEqual(new Set(['', 'Owner']));
    expect(output.checklist.every((item) => item.completed === false)).toBe(true);
  });

  it('serializes none of the forbidden domains or field names', () => {
    const input = sandbox();
    input.trip.attachments = [{ storagePath: 'private/demo-secret' }];
    input.trip.audit = { completedAt: 123 };
    const output = convertDemoSandboxToTrip(input, { operationId: OPERATION_ID, owner: 'Owner' });
    const serialized = JSON.stringify(output);
    for (const key of CLONE_FORBIDDEN_KEYS) expect(serialized).not.toContain(`"${key}"`);
    expect(serialized).not.toContain('DEMO-ORDER');
    expect(serialized).not.toContain('example.com');
    expect(serialized).not.toContain('demo-ticket');
    expect(serialized).not.toContain('demo-expense');
    expect(serialized).not.toContain('local-demo-sandbox');
  });

  it('drops credential-like text rather than serializing it', () => {
    const input = sandbox();
    input.trip.itinerary['Day 1'][0].notes = 'api_key = should-not-copy';
    input.trip.itinerary['Day 1'][0].memo = input.trip.itinerary['Day 1'][0].notes;
    const output = convertDemoSandboxToTrip(input, { operationId: OPERATION_ID, owner: 'Owner' });
    expect(output.itinerary['Day 1'][0].notes).toBe('');
    expect(JSON.stringify(output)).not.toContain('should-not-copy');
  });

  it('rejects invalid or identity-colliding inputs', () => {
    expect(() => convertDemoSandboxToTrip({}, { operationId: OPERATION_ID })).toThrow(/Invalid Demo Sandbox/);
    expect(() => convertDemoSandboxToTrip(sandbox(), { operationId: 'short' })).toThrow(/operationId/);
    expect(() => convertDemoSandboxToTrip(sandbox(), {
      operationId: OPERATION_ID,
      roomId: 'local-demo-sandbox',
    })).toThrow(/collides/);
  });

  it('creates stable IDs and fingerprints without treating them as authorization', () => {
    expect(createCloneStableId('place', OPERATION_ID, 'source-1')).toBe(
      createCloneStableId('place', OPERATION_ID, 'source-1'),
    );
    expect(fingerprintClonePayload({ b: 2, a: 1 })).toBe(fingerprintClonePayload({ a: 1, b: 2 }));
    expect(fingerprintClonePayload({ a: 1 })).toMatch(/^fnv1a-/);
  });
});
