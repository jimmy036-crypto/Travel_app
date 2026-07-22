import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  AdapterValidationError,
  MANIFEST_PATH,
  REPO_ROOT,
  buildInvocationPlan,
  checkAdapters,
  doctorAgents,
  loadInvocation,
  validateAllInvocations,
  validateInvocation,
  validateManifest,
} from './agent-adapter-lib.mjs';

const tempRoots = [];
const manifest = JSON.parse(readFileSync(path.join(REPO_ROOT, MANIFEST_PATH), 'utf8'));
const exampleNames = [
  'codex-discuss.json',
  'codex-understand.json',
  'claude-discuss.json',
  'claude-understand.json',
  'gemini-discuss.json',
  'gemini-understand.json',
  'codex-explain-diff.json',
  'claude-explain-diff.json',
  'gemini-explain-diff.json',
];
const requiredPaths = [
  MANIFEST_PATH,
  '.ai/schemas/agent-invocation.schema.json',
  ...manifest.skills.flatMap((skill) => [
    skill.canonicalPath,
    `${path.posix.dirname(skill.canonicalPath)}/OUTPUT_CONTRACT.md`,
    `${path.posix.dirname(skill.canonicalPath)}/EXAMPLE.md`,
    skill.outputSchema,
    ...(skill.outputSchemas ?? []),
    ...Object.values(skill.adapters),
  ]),
  ...exampleNames.map((name) => `.ai/invocations/examples/${name}`),
];

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'travel-agent-adapter-'));
  tempRoots.push(root);
  for (const repositoryPath of new Set(requiredPaths)) {
    const destination = path.join(root, repositoryPath);
    mkdirSync(path.dirname(destination), { recursive: true });
    copyFileSync(path.join(REPO_ROOT, repositoryPath), destination);
  }
  return root;
}

function mutate(root, repositoryPath, change) {
  const file = path.join(root, repositoryPath);
  writeFileSync(file, change(readFileSync(file, 'utf8')));
}

function invocation(name) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, '.ai/invocations/examples', name), 'utf8'));
}

function contentHashes(root) {
  return Object.fromEntries([...new Set(requiredPaths)].sort().map((repositoryPath) => [
    repositoryPath,
    createHash('sha256').update(readFileSync(path.join(root, repositoryPath))).digest('hex'),
  ]));
}

test.after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

test('manifest validates', () => {
  assert.equal(validateManifest(structuredClone(manifest)).skills.length, 3);
});

test('canonical hashes match', () => {
  assert.equal(checkAdapters().manifest.skills.length, 3);
});

test('missing canonical fails', () => {
  const root = fixture();
  rmSync(path.join(root, manifest.skills[0].canonicalPath));
  assert.throws(() => checkAdapters({ root }), AdapterValidationError);
});

test('stale canonical hash fails', () => {
  const root = fixture();
  mutate(root, manifest.skills[0].canonicalPath, (value) => `${value}\nchanged\n`);
  assert.throws(() => checkAdapters({ root }), /canonical hash is stale/);
});

test('missing adapter fails', () => {
  const root = fixture();
  rmSync(path.join(root, manifest.skills[0].adapters.shared));
  assert.throws(() => checkAdapters({ root }), /adapter is missing/);
});

test('wrong canonical reference fails', () => {
  const root = fixture();
  const skill = manifest.skills[0];
  mutate(root, skill.adapters.shared, (value) => value.replace(skill.canonicalPath, '.ai/skills/other/SKILL.md'));
  assert.throws(() => checkAdapters({ root }), /wrong canonical skill/);
});

test('shared adapter name mismatch fails', () => {
  const root = fixture();
  const skill = manifest.skills[0];
  mutate(root, skill.adapters.shared, (value) => value.replace('name: understand', 'name: wrong'));
  assert.throws(() => checkAdapters({ root }), /name does not match/);
});

test('Claude adapter name mismatch fails', () => {
  const root = fixture();
  const skill = manifest.skills[0];
  mutate(root, skill.adapters.claude, (value) => value.replace('name: understand', 'name: wrong'));
  assert.throws(() => checkAdapters({ root }), /name does not match/);
});

test('empty description fails', () => {
  const root = fixture();
  const skill = manifest.skills[0];
  mutate(root, skill.adapters.shared, (value) => value.replace(/^description:.*$/m, 'description:'));
  assert.throws(() => checkAdapters({ root }), /description must not be empty/);
});

test('oversized thin adapter fails', () => {
  const root = fixture();
  const skill = manifest.skills[0];
  mutate(root, skill.adapters.shared, (value) => `${value}\n${Array.from({ length: 40 }, (_, index) => `routing note ${index}`).join('\n')}`);
  assert.throws(() => checkAdapters({ root }), /thin-adapter limit/);
});

test('canonical content duplication fails', () => {
  const root = fixture();
  const skill = manifest.skills[0];
  const canonicalLines = readFileSync(path.join(root, skill.canonicalPath), 'utf8').split(/\r?\n/).filter((line) => line.trim().length >= 30).slice(0, 3);
  mutate(root, skill.adapters.shared, (value) => `${value}\n${canonicalLines.join('\n')}`);
  assert.throws(() => checkAdapters({ root }), /duplicates too much canonical content/);
});

test('Gemini shell injection fails', () => {
  const root = fixture();
  const command = manifest.skills[0].adapters.geminiCommand;
  mutate(root, command, (value) => value.replace('{{args}}', '!{{args}}'));
  assert.throws(() => checkAdapters({ root }), /shell injection/);
});

test('Gemini file injection fails', () => {
  const root = fixture();
  const command = manifest.skills[0].adapters.geminiCommand;
  mutate(root, command, (value) => value.replace('{{args}}', '@{{args}}'));
  assert.throws(() => checkAdapters({ root }), /file injection/);
});

test('Gemini command rejects extra fields', () => {
  const root = fixture();
  const command = manifest.skills[0].adapters.geminiCommand;
  mutate(root, command, (value) => `${value}\nmodel = "external"\n`);
  assert.throws(() => checkAdapters({ root }), /unsupported field/);
});

test('valid understand invocation passes', () => {
  assert.equal(validateInvocation(invocation('codex-understand.json')).skill, 'understand');
});

test('valid explain-diff invocation passes', () => {
  assert.equal(validateInvocation(invocation('codex-explain-diff.json')).skill, 'explain-diff');
});

test('absolute path fails', () => {
  const value = invocation('codex-understand.json');
  value.workingDirectory = 'C:/Users/example';
  assert.throws(() => validateInvocation(value), /must not be absolute/);
});

test('path traversal fails', () => {
  const value = invocation('codex-understand.json');
  value.expectedOutput.draftPath = '../outside.json';
  assert.throws(() => validateInvocation(value), /must not traverse/);
});

test('URL path fails', () => {
  const value = invocation('codex-understand.json');
  value.adapterPath = 'https://example.com/adapter';
  assert.throws(() => validateInvocation(value), /URL or file scheme/);
});

test('empty topic fails', () => {
  assert.throws(() => buildInvocationPlan('codex', 'understand', ['   ']), /topic must not be empty/);
});

test('ref beginning with dash fails', () => {
  assert.throws(() => buildInvocationPlan('codex', 'explain-diff', ['--help', 'main']), /must not begin with a dash/);
});

test('ref containing shell metacharacter fails', () => {
  assert.throws(() => buildInvocationPlan('codex', 'explain-diff', ['main;echo', 'HEAD']), /forbidden character/);
});

test('ref containing traversal fails', () => {
  assert.throws(() => buildInvocationPlan('codex', 'explain-diff', ['../main', 'HEAD']), /traversal/);
});

test('Codex plan is read-only', () => {
  const plan = buildInvocationPlan('codex', 'understand', ['First-run Welcome Experience']);
  assert.equal(plan.permissions.filesystem, 'read-only');
  assert.deepEqual(plan.execution.headlessArgvPreview.slice(0, 5), ['codex', 'exec', '--sandbox', 'read-only', '--ephemeral']);
});

test('Claude plan uses permission mode plan', () => {
  const argv = buildInvocationPlan('claude', 'understand', ['First-run Welcome Experience']).execution.headlessArgvPreview;
  assert.deepEqual(argv.slice(-4), ['--permission-mode', 'plan', '--output-format', 'json']);
});

test('Gemini plan uses JSON output', () => {
  const argv = buildInvocationPlan('gemini', 'understand', ['First-run Welcome Experience']).execution.headlessArgvPreview;
  assert.deepEqual(argv.slice(-2), ['--output-format', 'json']);
});

test('no plan enables execution', () => {
  for (const agent of ['codex', 'claude', 'gemini']) {
    assert.equal(buildInvocationPlan(agent, 'understand', ['Topic']).execution.enabled, false);
    assert.equal(buildInvocationPlan(agent, 'explain-diff', ['main', 'HEAD']).execution.enabled, false);
  }
});

test('all plans disable network, production, Git writes, and deploy', () => {
  const plan = buildInvocationPlan('gemini', 'understand', ['Topic']);
  assert.deepEqual(plan.permissions, { filesystem: 'read-only', network: false, productionFirebase: false, gitWrite: false, deploy: false });
});

test('doctor handles missing CLI', () => {
  const result = doctorAgents({ spawn: () => ({ error: new Error('ENOENT'), status: null, stdout: '', stderr: '' }) });
  assert.equal(result.length, 3);
  assert.ok(result.every((item) => item.installed === false && item.executionEnabled === false));
});

test('doctor JSON does not expose environment', () => {
  const result = doctorAgents({ spawn: (agent, args) => ({ status: args[0] === '--version' ? 0 : 1, stdout: `${agent} 1.0.0\n`, stderr: '' }) });
  const json = JSON.stringify(result);
  assert.doesNotMatch(json, /credential|environment|auth\.json|PATH=/i);
  assert.deepEqual(Object.keys(result[0]).sort(), ['agent', 'executionEnabled', 'headlessPlanned', 'installed', 'interactiveInvocation', 'version'].sort());
});

test('planner outputs argv array', () => {
  assert.ok(Array.isArray(buildInvocationPlan('codex', 'understand', ['Topic']).execution.headlessArgvPreview));
});

test('planner keeps topic in one argv element', () => {
  const argv = buildInvocationPlan('codex', 'understand', ['Topic; still data']).execution.headlessArgvPreview;
  assert.equal(argv.length, 6);
  assert.match(argv[5], /Topic; still data/);
});

test('planner output is deterministic', () => {
  assert.deepEqual(
    buildInvocationPlan('claude', 'explain-diff', ['92ef883', 'c847650']),
    buildInvocationPlan('claude', 'explain-diff', ['92ef883', 'c847650']),
  );
});

test('examples validate', () => {
  assert.equal(validateAllInvocations().length, 9);
  assert.equal(loadInvocation('.ai/invocations/examples/gemini-understand.json').agent, 'gemini');
});

test('Codex discussion plan is read-only', () => {
  const plan = buildInvocationPlan('codex', 'discuss', ['.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json']);
  assert.equal(plan.permissions.filesystem, 'read-only');
  assert.equal(plan.execution.enabled, false);
  assert.deepEqual(plan.execution.headlessArgvPreview.slice(0, 5), ['codex', 'exec', '--sandbox', 'read-only', '--ephemeral']);
});

test('Claude discussion plan is plan-only', () => {
  const plan = buildInvocationPlan('claude', 'discuss', ['.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json']);
  assert.equal(plan.mode, 'plan-only');
  assert.deepEqual(plan.execution.headlessArgvPreview.slice(-4), ['--permission-mode', 'plan', '--output-format', 'json']);
});

test('Gemini discussion plan uses JSON output', () => {
  const plan = buildInvocationPlan('gemini', 'discuss', ['.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json']);
  assert.deepEqual(plan.execution.headlessArgvPreview.slice(-2), ['--output-format', 'json']);
});

test('no discussion plan enables execution', () => {
  for (const agent of ['codex', 'claude', 'gemini']) {
    const plan = buildInvocationPlan(agent, 'discuss', ['.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json']);
    assert.equal(plan.execution.enabled, false);
    assert.equal(plan.permissions.network, false);
  }
});

test('check validates regular files', () => {
  assert.doesNotThrow(() => checkAdapters());
});

test('check does not modify files', () => {
  const root = fixture();
  const before = contentHashes(root);
  checkAdapters({ root });
  assert.deepEqual(contentHashes(root), before);
});
