import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function cases(report) {
  if (report.errors?.length) throw new Error('Playwright reported global errors.');
  const entries = [];
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        entries.push([JSON.stringify([test.projectName, spec.id]), test]);
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  const result = new Map(entries);
  if (result.size !== entries.length) throw new Error('Duplicate Playwright test identities.');
  return result;
}

// Native report merging alone accepts partial input. Compare with unsharded
// discovery so a missing artifact cannot silently remove tests from the gate.
export function verifyReport(expectedReport, actualReport) {
  const expected = cases(expectedReport);
  const actual = cases(actualReport);
  if (!expected.size) throw new Error('Discovered Playwright suite is empty.');
  const totals = {};
  for (const [id, test] of actual) {
    if (!expected.has(id)) throw new Error(`Unexpected Playwright test: ${id}`);
    if (!test.results.length || test.results.some(result => result.status === 'interrupted')) {
      throw new Error(`Incomplete Playwright test: ${id}`);
    }
    const status = { expected: 'passed', skipped: 'skipped', flaky: 'flaky' }[test.status];
    if (!status) throw new Error(`Unsuccessful Playwright test: ${id}`);
    const counts = totals[test.projectName] ??= { passed: 0, skipped: 0, flaky: 0, retries: 0, total: 0 };
    counts[status] += 1;
    counts.total += 1;
    counts.retries += test.results.filter(result => result.retry > 0).length;
  }
  const missing = [...expected.keys()].filter(id => !actual.has(id));
  if (missing.length) throw new Error(`Missing ${missing.length} Playwright test results.`);
  return totals;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [expectedPath, actualPath] = process.argv.slice(2);
    const totals = verifyReport(
      JSON.parse(readFileSync(expectedPath, 'utf8')),
      JSON.parse(readFileSync(actualPath, 'utf8')),
    );
    const summary = [
      '## Complete Playwright coverage',
      '',
      '| Browser | Passed | Skipped | Flaky | Retry attempts | Total |',
      '| --- | ---: | ---: | ---: | ---: | ---: |',
      ...Object.entries(totals).map(([project, c]) =>
        `| ${project} | ${c.passed} | ${c.skipped} | ${c.flaky} | ${c.retries} | ${c.total} |`),
      '',
    ].join('\n');
    console.log(summary);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
