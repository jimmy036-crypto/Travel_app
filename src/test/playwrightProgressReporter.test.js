import { afterEach, expect, it, vi } from 'vitest';
import ProgressReporter from '../../scripts/playwright-progress-reporter.mjs';

afterEach(() => vi.restoreAllMocks());

it('logs start/end and failed retry metadata without test payloads', () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const reporter = new ProgressReporter();
  const test = {
    title: 'private test payload',
    parent: { project: () => ({ name: 'Mobile Safari' }) },
    location: { file: 'C:\\repo\\e2e\\app-shell-ux.spec.ts', line: 42 },
  };
  const result = { retry: 1, workerIndex: 2, status: 'failed', duration: 123 };
  reporter.onTestBegin(test, result);
  reporter.onStepBegin(test, result, { category: 'pw:api', title: 'secret fill' });
  reporter.onStepBegin(test, result, { category: 'hook' });
  reporter.onStepEnd(test, result, {
    category: 'hook', error: new Error('private error'), duration: 12,
  });
  reporter.onTestEnd(test, result);
  const events = log.mock.calls.map(([, json]) => JSON.parse(json));
  expect(events.map(({ event }) => event)).toEqual([
    'test-start', 'hook-start', 'hook-end', 'test-end',
  ]);
  expect(events[0]).toMatchObject({
    project: 'Mobile Safari', file: 'app-shell-ux.spec.ts', line: 42,
    retry: 1, worker: 2,
  });
  expect(events[2]).toMatchObject({ failed: true, durationMs: 12 });
  expect(events[3]).toMatchObject({ status: 'failed', durationMs: 123 });
  expect(JSON.stringify(events)).not.toMatch(/private|secret/);
});
