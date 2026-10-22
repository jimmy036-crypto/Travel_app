import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { expect, it } from 'vitest';

const workflow = load(readFileSync('.github/workflows/quality-gate.yml', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

it('pins each shard image to the locked Playwright browser version', () => {
  const version = lock.packages['node_modules/@playwright/test'].version;
  for (const id of ['e2e-chrome-shards', 'e2e-safari-shards']) {
    expect(workflow.jobs[id]?.container?.image).toMatch(new RegExp(`^mcr\\.microsoft\\.com/playwright:v${version.replaceAll('.', '\\.')}(-noble)@sha256:[a-f0-9]{64}$`));
  }
});

it('assigns every shard once and keeps all browser gates fail closed', () => {
  for (const browser of ['chrome', 'safari']) {
    const shards = workflow.jobs[`e2e-${browser}-shards`];
    expect(shards).toBeDefined();
    expect(shards.strategy['fail-fast']).toBe(false);
    const indices = shards.strategy.matrix.shard;
    expect(indices).toEqual(Array.from({ length: indices.length }, (_, i) => i + 1));
    expect(shards.steps.find(step => step.uses === './.github/actions/playwright-shard').with.total).toBe(indices.length);
    const gate = workflow.jobs[`e2e-${browser}`];
    expect(gate.needs).toBe(`e2e-${browser}-shards`);
    expect(gate.if).toBe('always()');
    expect(gate.steps[0].run).toContain('!= "success"');
    expect(gate.steps[0].run).toContain('exit 1');
  }
  expect(workflow.jobs.e2e.needs).toEqual(['e2e-chrome', 'e2e-safari']);
  expect(workflow.jobs.e2e.if).toBe('always()');
});
