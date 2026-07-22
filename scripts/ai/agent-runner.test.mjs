import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT, RunnerValidationError, approveLiveRun, assertLiveWorktreeClean, buildApproval, buildLiveRunPlan,
  checkRunner, computePlanHash, detectManagedAgentEnvironment, doctorAgents, executeLiveRun, inspectRun,
  loadRunnerArtifact, prepareLiveRun, runChildProcess, sanitizeChildEnvironment, scanSecretPatterns,
  validateAllRunnerArtifacts, validateApproval, validateBoundFiles, validateCandidate, validatePlan,
  validatePolicy, validateResult,
} from './agent-runner-lib.mjs';

const PACKET = '.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json';
const FIXED = '2026-07-22T04:00:00.000Z';
const tempRoots = [];
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const clone = (value) => structuredClone(value);

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'travel-runner-')); tempRoots.push(root);
  for (const repositoryPath of ['.ai/runtime/policy.template.json', PACKET, '.agents/skills/discuss/SKILL.md', '.ai/schemas/discussion-analysis.schema.json']) {
    const target = path.join(root, repositoryPath); mkdirSync(path.dirname(target), { recursive: true }); cpSync(path.join(REPO_ROOT, repositoryPath), target);
  }
  return root;
}
function plan(root = REPO_ROOT) { return buildLiveRunPlan('codex', 'discuss', PACKET, { root, clock: () => new Date(FIXED), capabilities: { supportedFlags: ['exec', '--ephemeral', '--sandbox', '--json'] } }); }
function writeArtifact(root, repositoryPath, value) { const file = path.join(root, repositoryPath); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); return repositoryPath; }
function enabledPolicy(root) { const policy = json(path.join(root, '.ai/runtime/policy.template.json')); policy.executionEnabled = true; return writeArtifact(root, '.ai/runtime/local/policy.json', policy); }
function validCandidate() { return json(path.join(REPO_ROOT, '.ai/discussions/examples/demo-persistence-boundary/responses/round-1/codex-analysis.json')); }
function executionSetup() {
  const root = tempRoot(); const livePlan = plan(root); const approval = buildApproval(livePlan, `I APPROVE LIVE RUN ${livePlan.planId}`, { clock: () => new Date('2026-07-22T04:01:00.000Z') });
  writeArtifact(root, '.ai/runtime/local/plans/plan.json', livePlan); writeArtifact(root, '.ai/runtime/local/approvals/approval.json', approval); enabledPolicy(root);
  return { root, livePlan, approval, options: { root, env: {}, clock: () => new Date('2026-07-22T04:02:00.000Z'), doctor: () => [{ agent: 'codex', liveExecutionEligible: true }], gitStatusLines: [], runProcess: async () => ({ exitCode: 0, timedOut: false, truncated: false, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: '', removedEnvironmentNames: [] }) } };
}
test.after(() => tempRoots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test('valid committed policy passes', () => assert.equal(validatePolicy(json(path.join(REPO_ROOT, '.ai/runtime/policy.template.json')), { committed: true }).executionEnabled, false));
test('enabled committed policy fails', () => { const value = json(path.join(REPO_ROOT, '.ai/runtime/policy.template.json')); value.executionEnabled = true; assert.throws(() => validatePolicy(value, { committed: true }), RunnerValidationError); });
test('Claude is not allowed in AI-3B1', () => { const value = json(path.join(REPO_ROOT, '.ai/runtime/policy.template.json')); value.allowedAgents = ['claude']; assert.throws(() => validatePolicy(value), RunnerValidationError); });
test('Gemini is not allowed in AI-3B1', () => { const value = json(path.join(REPO_ROOT, '.ai/runtime/policy.template.json')); value.allowedAgents = ['gemini']; assert.throws(() => validatePolicy(value), RunnerValidationError); });
test('Codex plan passes', () => assert.equal(validatePlan(plan()).agent, 'codex'));
test('plan argv is an array', () => assert.ok(Array.isArray(plan().argv)));
test('plan contains read-only sandbox', () => { const argv = plan().argv; assert.equal(argv[argv.indexOf('--sandbox') + 1], 'read-only'); });
test('plan excludes full-auto', () => assert.equal(plan().argv.join(' ').includes('full-auto'), false));
test('plan excludes danger-full-access', () => assert.equal(plan().argv.join(' ').includes('danger-full-access'), false));
test('plan excludes shell command string', () => assert.equal(typeof plan().argv, 'object'));
test('packet hash matches', () => assert.doesNotThrow(() => validateBoundFiles(plan())));
test('changed packet hash fails', () => { const root = tempRoot(); const value = plan(root); writeFileSync(path.join(root, PACKET), '{}'); assert.throws(() => validateBoundFiles(value, { root }), /packet hash changed/); });
test('changed adapter hash fails', () => { const root = tempRoot(); const value = plan(root); writeFileSync(path.join(root, value.adapterPath), 'changed'); assert.throws(() => validateBoundFiles(value, { root }), /adapter hash changed/); });
test('changed schema hash fails', () => { const root = tempRoot(); const value = plan(root); writeFileSync(path.join(root, value.outputSchema), '{}'); assert.throws(() => validateBoundFiles(value, { root }), /output schema hash changed/); });
test('approval exact phrase passes', () => { const value = plan(); assert.equal(buildApproval(value, `I APPROVE LIVE RUN ${value.planId}`, { clock: () => new Date(FIXED) }).actorRole, 'human'); });
test('wrong approval phrase fails', () => assert.throws(() => buildApproval(plan(), 'WRONG'), RunnerValidationError));
test('approval for another plan fails', () => { const value = plan(); const approval = buildApproval(value, `I APPROVE LIVE RUN ${value.planId}`); const other = clone(value); other.planId = 'live-another-plan-001'; other.planSha256 = computePlanHash(other); assert.throws(() => validateApproval(approval, { plan: other }), /another plan/); });
test('expired approval fails', () => { const value = plan(); const approval = buildApproval(value, `I APPROVE LIVE RUN ${value.planId}`, { clock: () => new Date(FIXED) }); assert.throws(() => validateApproval(approval, { plan: value, now: new Date('2026-07-22T05:00:00.000Z') }), /expired/); });
test('reused approval fails', async () => { const setup = executionSetup(); await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); await assert.rejects(() => executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options), /already been used/); });
test('non-human approval fails', () => { const value = buildApproval(plan(), `I APPROVE LIVE RUN ${plan().planId}`); value.actorRole = 'codex'; assert.throws(() => validateApproval(value), RunnerValidationError); });
test('nested Codex environment blocks execute', async () => { const setup = executionSetup(); setup.options.env = { CODEX_THREAD_ID: 'redacted' }; await assert.rejects(() => executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options), /BLOCKED_NESTED_AGENT_EXECUTION/); });
test('nested Claude environment blocks execute', () => assert.equal(detectManagedAgentEnvironment({ CLAUDECODE: '1' }).managed, true));
test('nested Gemini environment blocks execute', () => assert.equal(detectManagedAgentEnvironment({ GEMINI_CLI: '1' }).managed, true));
test('nested detection reports names but not values', () => assert.deepEqual(detectManagedAgentEnvironment({ CODEX_THREAD_ID: 'secret-value' }).matchedNames, ['CODEX_THREAD_ID']));
test('no nested bypass exists', () => { const source = readFileSync(path.join(REPO_ROOT, 'scripts/ai/agent-runner.mjs'), 'utf8'); assert.equal(/allow-nested|force-enable|\bbypass\b/.test(source), false); });

function mockChild({ chunks = ['{}\n'], close = true } = {}) {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = { end(value) { child.stdinValue = value; queueMicrotask(() => { chunks.forEach((chunk) => child.stdout.emit('data', Buffer.from(chunk))); if (close) child.emit('close', 0); }); } }; child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', -1)); }; return child;
}
test('spawn uses shell false', async () => { let options; await runChildProcess(['codex', 'exec'], 'prompt', { maxRuntimeSeconds: 1, maxOutputBytes: 1024 }, { env: {}, spawnImpl: (_c, _a, value) => { options = value; return mockChild(); } }); assert.equal(options.shell, false); });
test('stdin carries prompt', async () => { const child = mockChild(); await runChildProcess(['codex', 'exec'], 'prompt-body', { maxRuntimeSeconds: 1, maxOutputBytes: 1024 }, { env: {}, spawnImpl: () => child }); assert.equal(child.stdinValue, 'prompt-body'); });
test('prompt is not in argv', () => assert.equal(plan().argv.includes(readFileSync(path.join(REPO_ROOT, PACKET), 'utf8')), false));
test('timeout kills process', async () => { const child = mockChild({ close: false }); const result = await runChildProcess(['codex', 'exec'], 'x', { maxRuntimeSeconds: 0.001, maxOutputBytes: 1024 }, { env: {}, spawnImpl: () => child }); assert.equal(result.timedOut, true); assert.equal(child.killed, true); });
test('output limit kills process', async () => { const child = mockChild({ chunks: ['123456789'] }); const result = await runChildProcess(['codex', 'exec'], 'x', { maxRuntimeSeconds: 1, maxOutputBytes: 4 }, { env: {}, spawnImpl: () => child }); assert.equal(result.truncated, true); assert.equal(child.killed, true); });
test('nonzero exit fails validation', async () => { const setup = executionSetup(); setup.options.runProcess = async () => ({ exitCode: 7, timedOut: false, truncated: false, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: 'failure', removedEnvironmentNames: [] }); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(result.validation.valid, false); });
test('invalid JSON output fails', () => assert.equal(validateCandidate(null, plan(), json(path.join(REPO_ROOT, PACKET))).valid, false));
test('invalid Schema response fails', () => assert.equal(validateCandidate({ artifactType: 'discussion-analysis' }, plan(), json(path.join(REPO_ROOT, PACKET))).valid, false));
test('valid response becomes reviewable', () => assert.equal(validateCandidate(validCandidate(), plan(), json(path.join(REPO_ROOT, PACKET))).valid, true));
test('valid response is not auto-imported', async () => { const setup = executionSetup(); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(result.importStatus, 'not-reviewed'); });
test('stderr is not parsed as response', async () => { const setup = executionSetup(); setup.options.runProcess = async () => ({ exitCode: 0, timedOut: false, truncated: false, stdout: '', stderr: JSON.stringify(validCandidate()), removedEnvironmentNames: [] }); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(result.validation.valid, false); });
test('secret environment names are removed', () => assert.deepEqual(sanitizeChildEnvironment({ PATH: 'safe', API_KEY: 'do-not-log', GITHUB_TOKEN: 'do-not-log' }).removedNames, ['API_KEY', 'GITHUB_TOKEN']));
test('secret environment values are never logged', () => assert.equal(JSON.stringify(sanitizeChildEnvironment({ API_KEY: 'sensitive-value' })).includes('sensitive-value'), false));
test('secret-like model output blocks import', async () => { const setup = executionSetup(); const candidate = validCandidate(); candidate.recommendation = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'; setup.options.runProcess = async () => ({ exitCode: 0, timedOut: false, truncated: false, stdout: `${JSON.stringify(candidate)}\n`, stderr: '', removedEnvironmentNames: [] }); const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(inspectRun(output.runDirectory, { root: setup.root }).importEligibility, 'ineligible'); });
test('commit SHA is not treated as secret', () => assert.deepEqual(scanSecretPatterns('e5c1f96313159422a223a31079e9d02770fe6172'), []));
test('dirty tracked worktree blocks execute', () => assert.throws(() => assertLiveWorktreeClean([' M src/App.jsx']), /BLOCKED_LIVE_RUN_DIRTY_TRACKED_WORKTREE/));
test('unknown untracked file blocks execute', () => assert.throws(() => assertLiveWorktreeClean(['?? notes.txt']), /BLOCKED_LIVE_RUN_UNKNOWN_UNTRACKED_FILE/));
test('local runtime directories are allowed', () => assert.doesNotThrow(() => assertLiveWorktreeClean(['?? .ai/runtime/local/policy.json', '?? .ai/runs/run-1/result.json'])));

function doctorMock(command, args) {
  if (command === 'codex' && args[0] === '--version') return { status: 0, stdout: 'codex 1.0\n' };
  if (command === 'codex') return { status: 0, stdout: '--ephemeral --sandbox --json' };
  return { error: { code: 'ENOENT' }, status: null, stdout: '' };
}
test('doctor handles missing CLI', () => assert.equal(doctorAgents({ spawnSyncImpl: () => ({ error: { code: 'ENOENT' }, status: null }) }).length, 3));
test('doctor detects missing required Codex flag', () => { const result = doctorAgents({ spawnSyncImpl: (command, args) => command === 'codex' && args[0] === '--version' ? { status: 0, stdout: 'codex' } : command === 'codex' ? { status: 0, stdout: '--sandbox --json' } : { error: { code: 'ENOENT' } } }); assert.equal(result[0].liveExecutionEligible, false); });
test('doctor enables capable Codex only', () => assert.equal(doctorAgents({ spawnSyncImpl: doctorMock })[0].liveExecutionEligible, true));
test('Claude remains execution-ineligible', () => assert.equal(doctorAgents({ spawnSyncImpl: doctorMock }).find((item) => item.agent === 'claude').liveExecutionEligible, false));
test('Gemini remains execution-ineligible', () => assert.equal(doctorAgents({ spawnSyncImpl: doctorMock }).find((item) => item.agent === 'gemini').liveExecutionEligible, false));
test('deterministic Plan with fixed clock', () => assert.deepEqual(plan(), plan()));
test('inspect does not modify files', async () => { const setup = executionSetup(); const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); const before = readFileSync(path.join(setup.root, output.runDirectory, 'result.json'), 'utf8'); const report = inspectRun(output.runDirectory, { root: setup.root }); assert.equal(report.automaticIngest, false); assert.equal(readFileSync(path.join(setup.root, output.runDirectory, 'result.json'), 'utf8'), before); });
test('result path traversal fails', () => { const value = json(path.join(REPO_ROOT, '.ai/runtime/examples/codex-discuss-result.json')); value.rawOutputPath = '../secret'; assert.throws(() => validateResult(value), RunnerValidationError); });
test('absolute path fails', () => { const value = plan(); value.packetPath = 'C:/secret'; value.planSha256 = computePlanHash(value); assert.throws(() => validatePlan(value), RunnerValidationError); });
test('URL path fails', () => { const value = plan(); value.packetPath = 'https://example.com'; value.planSha256 = computePlanHash(value); assert.throws(() => validatePlan(value), RunnerValidationError); });
test('package output never includes environment dump', () => assert.equal(JSON.stringify(doctorAgents({ spawnSyncImpl: doctorMock })).includes('PATH'), false));
test('approval file is local-only', () => { const root = tempRoot(); const prepared = prepareLiveRun('codex', 'discuss', PACKET, { root, clock: () => new Date(FIXED) }); const approved = approveLiveRun(prepared.planPath, prepared.approvalPhrase, { root, clock: () => new Date(FIXED) }); assert.ok(approved.approvalPath.startsWith('.ai/runtime/local/approvals/')); });
test('run output is local-only', async () => { const setup = executionSetup(); const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.ok(output.runDirectory.startsWith('.ai/runs/')); });
test('execute mock produces audit result', async () => { const setup = executionSetup(); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(validateResult(result).validation.valid, true); });
test('check does not modify files', () => { const file = path.join(REPO_ROOT, '.ai/runtime/policy.template.json'); const before = readFileSync(file, 'utf8'); checkRunner(); assert.equal(readFileSync(file, 'utf8'), before); });
test('all committed runner artifacts validate', () => assert.equal(validateAllRunnerArtifacts().length, 4));
test('approval examples remain hash-bound', () => { const value = loadRunnerArtifact('.ai/runtime/examples/codex-discuss-plan.json'); const approval = loadRunnerArtifact('.ai/runtime/examples/codex-discuss-approval.json'); assert.doesNotThrow(() => validateApproval(approval, { plan: value })); });
test('result defaults to not-reviewed', () => assert.equal(loadRunnerArtifact('.ai/runtime/examples/codex-discuss-result.json').importStatus, 'not-reviewed'));
