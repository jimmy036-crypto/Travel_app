import { describe, expect, it } from 'vitest';
import { verifyReport } from '../../scripts/verify-playwright-report.mjs';

const testCase = (id, status = 'expected', results = [{ status: 'passed', retry: 0 }], projectName = 'Desktop Chrome') => ({
  id,
  tests: [{ projectName, status, results }],
});
const report = (...specs) => ({ suites: [{ suites: [{ specs }] }], errors: [] });

describe('merged Playwright report coverage', () => {
  it('counts passed, skipped, flaky and retries separately across browsers', () => {
    const expected = report(testCase('pass'), testCase('skip'), testCase('retry', undefined, undefined, 'Mobile Safari'));
    const actual = report(
      testCase('pass'),
      testCase('skip', 'skipped', [{ status: 'skipped', retry: 0 }]),
      testCase('retry', 'flaky', [{ status: 'failed', retry: 0 }, { status: 'passed', retry: 1 }], 'Mobile Safari'),
    );
    expect(verifyReport(expected, actual)).toEqual({
      'Desktop Chrome': { passed: 1, skipped: 1, flaky: 0, retries: 0, total: 2 },
      'Mobile Safari': { passed: 0, skipped: 0, flaky: 1, retries: 1, total: 1 },
    });
  });

  it('rejects a missing shard even if every reported case passed', () => {
    expect(() => verifyReport(report(testCase('one'), testCase('two')), report(testCase('one')))).toThrow(/missing/i);
  });

  it('rejects duplicate results rather than counting an extra shard as coverage', () => {
    expect(() => verifyReport(report(testCase('one')), report(testCase('one'), testCase('one')))).toThrow(/duplicate/i);
  });

  it('rejects stale or wrong-browser results', () => {
    expect(() => verifyReport(report(testCase('one')), report(testCase('one', undefined, undefined, 'Mobile Safari')))).toThrow(/unexpected/i);
  });

  it.each([
    ['unexpected', [{ status: 'failed', retry: 0 }]],
    ['skipped', []],
    ['expected', [{ status: 'interrupted', retry: 0 }]],
    ['unknown', [{ status: 'passed', retry: 0 }]],
  ])('rejects incomplete or unsuccessful results: %s', (status, results) => {
    expect(() => verifyReport(report(testCase('one')), report(testCase('one', status, results)))).toThrow(/unsuccessful|incomplete/i);
  });

  it('rejects global errors even when all cases passed', () => {
    expect(() => verifyReport(report(testCase('one')), { ...report(testCase('one')), errors: [{ message: 'worker crashed' }] })).toThrow(/error/i);
  });

  it('rejects an empty discovered suite', () => {
    expect(() => verifyReport(report(), report())).toThrow(/empty/i);
  });
});
