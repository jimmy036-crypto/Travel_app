import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_ROOT, RunnerValidationError, approveLiveRun, assertLiveWorktreeClean, buildApproval, buildLiveRunPlan,
  checkRunner, computePlanHash, createApprovalClaim, detectManagedAgentEnvironment, diagnoseRun, doctorAgents, executeLiveRun, inspectRun,
  loadRunnerArtifact, prepareLiveRun, runChildProcess, sanitizeChildEnvironment, scanSecretPatterns,
  statusLiveRunPlan, validateAllRunnerArtifacts, validateApproval, validateAttemptId, validateBoundFiles, validateCandidate, validatePlan,
  validateCodexOutputSchemaCompatibility, validatePolicy, validateResult,
} from './agent-runner-lib.mjs';

const PACKET = '.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json';
const FIXED = '2026-07-22T04:00:00.000Z';
const tempRoots = [];
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const clone = (value) => structuredClone(value);

function tempRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'travel-runner-')); tempRoots.push(root);
  for (const repositoryPath of ['.ai/runtime/policy.template.json', PACKET, '.agents/skills/discuss/SKILL.md', '.ai/schemas/discussion-analysis.schema.json', '.ai/schemas/codex-discussion-analysis.schema.json']) {
    const target = path.join(root, repositoryPath); mkdirSync(path.dirname(target), { recursive: true }); cpSync(path.join(REPO_ROOT, repositoryPath), target);
  }
  return root;
}
function plan(root = REPO_ROOT) { return buildLiveRunPlan('codex', 'discuss', PACKET, { root, clock: () => new Date(FIXED), capabilities: { supportedFlags: ['exec', '--ephemeral', '--sandbox', '--json', '--output-schema'] } }); }
function writeArtifact(root, repositoryPath, value) { const file = path.join(root, repositoryPath); mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); return repositoryPath; }
function enabledPolicy(root) { const policy = json(path.join(root, '.ai/runtime/policy.template.json')); policy.executionEnabled = true; return writeArtifact(root, '.ai/runtime/local/policy.json', policy); }
function validCandidate() { return json(path.join(REPO_ROOT, '.ai/discussions/examples/demo-persistence-boundary/responses/round-1/codex-analysis.json')); }
function executionSetup() {
  const root = tempRoot(); const livePlan = plan(root); const approval = buildApproval(livePlan, `I APPROVE LIVE RUN ${livePlan.planId}`, { clock: () => new Date('2026-07-22T04:01:00.000Z') });
  writeArtifact(root, '.ai/runtime/local/plans/plan.json', livePlan); writeArtifact(root, '.ai/runtime/local/approvals/approval.json', approval); enabledPolicy(root);
  return { root, livePlan, approval, options: { root, env: {}, clock: () => new Date('2026-07-22T04:02:00.000Z'), doctor: () => [{ agent: 'codex', liveExecutionEligible: true }], gitStatusLines: [], runProcess: successfulProcess() } };
}
function successfulProcess(overrides = {}) {
  return async (_argv, _stdin, _limits, lifecycle = {}) => {
    const spawned = overrides.spawned ?? true; const spawnedAt = overrides.spawnedAt ?? '2026-07-22T04:02:00.000Z';
    if (spawned) lifecycle.onSpawn?.(spawnedAt);
    return { exitCode: 0, timedOut: false, truncated: false, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: '', removedEnvironmentNames: [], spawned, spawnedAt: spawned ? spawnedAt : null, spawnError: null, ...overrides };
  };
}
function diagnosticFailureEvent(code, message, type = 'invalid_request_error') {
  return { type: 'turn.failed', error: { message: JSON.stringify({ type: 'error', error: { type, code, message, param: null } }) } };
}
function diagnosticRun({ events, rawLines, stderr = '', candidate = null, resultOverrides = {} } = {}) {
  const root = tempRoot(); const livePlan = plan(root); const runDirectory = '.ai/runs/run-diagnostic-test-001';
  const approval = buildApproval(livePlan, `I APPROVE LIVE RUN ${livePlan.planId}`, { clock: () => new Date(FIXED) });
  const defaultEvents = [{ type: 'thread.started', thread_id: 'redacted' }, { type: 'turn.started' }, diagnosticFailureEvent('unknown_error', 'Unclassified failure.')];
  const stdout = `${(rawLines ?? (events ?? defaultEvents).map((event) => JSON.stringify(event))).join('\n')}\n`;
  const validation = candidate === null ? { valid: false, errors: ['No structured candidate response was found in stdout.'] } : { valid: true, errors: [] };
  const result = validateResult({ schemaVersion: '1.0.0', artifactType: 'live-run-result', runId: 'run-diagnostic-test-001', planId: livePlan.planId, planSha256: livePlan.planSha256, attemptId: livePlan.attemptId, agent: 'codex', skill: 'discuss', startedAt: FIXED, completedAt: '2026-07-22T04:00:01.000Z', launchStatus: 'started', childStarted: true, approvalConsumed: true, exitCode: 1, timedOut: false, truncated: false, stdoutFormat: 'jsonl', rawOutputPath: `${runDirectory}/stdout.jsonl`, validatedResponsePath: `${runDirectory}/candidate-response.json`, validation, security: { reviewRequired: false, findings: [], removedEnvironmentNames: [] }, importStatus: 'not-reviewed', ...resultOverrides });
  writeArtifact(root, `${runDirectory}/plan.json`, livePlan); writeArtifact(root, `${runDirectory}/approval.json`, approval);
  const directory = path.join(root, runDirectory); mkdirSync(directory, { recursive: true }); writeFileSync(path.join(directory, 'stdout.jsonl'), stdout); writeFileSync(path.join(directory, 'stderr.txt'), stderr); writeFileSync(path.join(directory, 'candidate-response.json'), `${JSON.stringify(candidate, null, 2)}\n`); writeFileSync(path.join(directory, 'result.json'), `${JSON.stringify(result, null, 2)}\n`);
  return { root, runDirectory, livePlan, result };
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

function mockChild({ chunks = ['{}\n'], close = true, spawnEvent = true, exitCode = 0 } = {}) {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = { end(value) { child.stdinValue = value; queueMicrotask(() => { if (spawnEvent) child.emit('spawn'); chunks.forEach((chunk) => child.stdout.emit('data', Buffer.from(chunk))); if (close) child.emit('close', exitCode); }); } }; child.kill = () => { child.killed = true; queueMicrotask(() => child.emit('close', -1)); }; return child;
}
test('spawn uses shell false', async () => { let options; await runChildProcess(['codex', 'exec'], 'prompt', { maxRuntimeSeconds: 1, maxOutputBytes: 1024 }, { env: {}, spawnImpl: (_c, _a, value) => { options = value; return mockChild(); } }); assert.equal(options.shell, false); });
test('stdin carries prompt', async () => { const child = mockChild(); await runChildProcess(['codex', 'exec'], 'prompt-body', { maxRuntimeSeconds: 1, maxOutputBytes: 1024 }, { env: {}, spawnImpl: () => child }); assert.equal(child.stdinValue, 'prompt-body'); });
test('prompt is not in argv', () => assert.equal(plan().argv.includes(readFileSync(path.join(REPO_ROOT, PACKET), 'utf8')), false));
test('timeout kills process', async () => { const child = mockChild({ close: false }); const result = await runChildProcess(['codex', 'exec'], 'x', { maxRuntimeSeconds: 0.001, maxOutputBytes: 1024 }, { env: {}, spawnImpl: () => child }); assert.equal(result.timedOut, true); assert.equal(child.killed, true); });
test('output limit kills process', async () => { const child = mockChild({ chunks: ['123456789'] }); const result = await runChildProcess(['codex', 'exec'], 'x', { maxRuntimeSeconds: 1, maxOutputBytes: 4 }, { env: {}, spawnImpl: () => child }); assert.equal(result.truncated, true); assert.equal(child.killed, true); });
test('nonzero exit fails validation', async () => { const setup = executionSetup(); setup.options.runProcess = successfulProcess({ exitCode: 7, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: 'failure' }); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(result.validation.valid, false); });
test('invalid JSON output fails', () => assert.equal(validateCandidate(null, plan(), json(path.join(REPO_ROOT, PACKET))).valid, false));
test('invalid Schema response fails', () => assert.equal(validateCandidate({ artifactType: 'discussion-analysis' }, plan(), json(path.join(REPO_ROOT, PACKET))).valid, false));
test('valid response becomes reviewable', () => assert.equal(validateCandidate(validCandidate(), plan(), json(path.join(REPO_ROOT, PACKET))).valid, true));
test('valid response is not auto-imported', async () => { const setup = executionSetup(); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(result.importStatus, 'not-reviewed'); });
test('stderr is not parsed as response', async () => { const setup = executionSetup(); setup.options.runProcess = successfulProcess({ stdout: '', stderr: JSON.stringify(validCandidate()) }); const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(result.validation.valid, false); });
test('secret environment names are removed', () => assert.deepEqual(sanitizeChildEnvironment({ PATH: 'safe', API_KEY: 'do-not-log', GITHUB_TOKEN: 'do-not-log' }).removedNames, ['API_KEY', 'GITHUB_TOKEN']));
test('secret environment values are never logged', () => assert.equal(JSON.stringify(sanitizeChildEnvironment({ API_KEY: 'sensitive-value' })).includes('sensitive-value'), false));
test('secret-like model output blocks import', async () => { const setup = executionSetup(); const candidate = validCandidate(); candidate.recommendation = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz'; setup.options.runProcess = successfulProcess({ stdout: `${JSON.stringify(candidate)}\n` }); const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(inspectRun(output.runDirectory, { root: setup.root }).importEligibility, 'ineligible'); });
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

test('approval claim is created with wx', () => {
  const root = tempRoot(); const value = plan(root); let observed;
  const claim = { planId: value.planId, planSha256: value.planSha256, approvalPath: '.ai/runtime/local/approvals/plan.json', claimedAt: FIXED, attemptId: value.attemptId, runId: 'run-claim-test-001' };
  createApprovalClaim(claim, { root, writeFileSyncImpl(file, contents, options) { observed = options; writeFileSync(file, contents, options); } });
  assert.equal(observed.flag, 'wx');
});
test('existing approval claim is blocked', () => {
  const root = tempRoot(); const value = plan(root); const claim = { planId: value.planId, planSha256: value.planSha256, approvalPath: '.ai/runtime/local/approvals/plan.json', claimedAt: FIXED, attemptId: value.attemptId, runId: 'run-claim-test-002' };
  createApprovalClaim(claim, { root });
  assert.throws(() => createApprovalClaim(claim, { root }), /BLOCKED_APPROVAL_ALREADY_CLAIMED/);
});
test('run directory and claimed attempt exist before child spawn', async () => {
  const setup = executionSetup();
  setup.options.runProcess = async (_argv, _stdin, _limits, lifecycle) => {
    const claims = path.join(setup.root, '.ai/runtime/local/approval-claims', `${setup.livePlan.planId}.json`);
    assert.equal(existsSync(claims), true);
    const runId = json(claims).runId; const runDirectory = path.join(setup.root, '.ai/runs', runId);
    assert.equal(json(path.join(runDirectory, 'attempt.json')).status, 'claimed');
    assert.equal(existsSync(path.join(runDirectory, 'plan.json')), true);
    assert.equal(existsSync(path.join(runDirectory, 'approval.json')), true);
    lifecycle.onSpawn(FIXED);
    return { exitCode: 0, timedOut: false, truncated: false, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: '', removedEnvironmentNames: [], spawned: true, spawnedAt: FIXED, spawnError: null };
  };
  await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
});
test('used marker does not exist before spawn event', async () => {
  const setup = executionSetup();
  setup.options.runProcess = async (_argv, _stdin, _limits, lifecycle) => {
    const used = path.join(setup.root, '.ai/runtime/local/used-approvals', `${setup.livePlan.planId}.json`);
    assert.equal(existsSync(used), false); lifecycle.onSpawn(FIXED); assert.equal(existsSync(used), true);
    return { exitCode: 0, timedOut: false, truncated: false, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: '', removedEnvironmentNames: [], spawned: true, spawnedAt: FIXED, spawnError: null };
  };
  await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
});
test('spawn event atomically promotes claim to used marker', async () => {
  const setup = executionSetup(); const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/approval-claims', `${setup.livePlan.planId}.json`)), false);
  assert.equal(json(path.join(setup.root, '.ai/runtime/local/used-approvals', `${setup.livePlan.planId}.json`)).runId, output.result.runId);
});
test('runChildProcess reports a real spawn event', async () => {
  const result = await runChildProcess(['codex', 'exec'], 'x', { maxRuntimeSeconds: 1, maxOutputBytes: 1024 }, { env: {}, clock: () => new Date(FIXED), spawnImpl: () => mockChild() });
  assert.equal(result.spawned, true); assert.equal(result.spawnedAt, FIXED); assert.equal(result.spawnError, null);
});
test('runChildProcess reports synchronous spawn failure without throwing', async () => {
  const error = Object.assign(new Error('sensitive path omitted'), { code: 'ENOENT' });
  const result = await runChildProcess(['codex', 'exec'], 'x', { maxRuntimeSeconds: 1, maxOutputBytes: 1024 }, { env: {}, spawnImpl: () => { throw error; } });
  assert.equal(result.spawned, false); assert.equal(result.exitCode, -1); assert.match(result.spawnError, /^ENOENT:/); assert.equal(result.spawnError.includes('sensitive'), false);
});
test('pre-spawn failure removes the current claim', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ spawned: false, spawnedAt: null, exitCode: -1, stdout: '', stderr: 'ENOENT', spawnError: 'ENOENT' });
  await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/approval-claims', `${setup.livePlan.planId}.json`)), false);
});
test('pre-spawn failure preserves a complete failed run', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ spawned: false, spawnedAt: null, exitCode: -1, stdout: '', stderr: 'ENOENT', spawnError: 'ENOENT' });
  const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  for (const file of ['attempt.json', 'plan.json', 'approval.json', 'stdout.jsonl', 'stderr.txt', 'candidate-response.json', 'result.json']) assert.equal(existsSync(path.join(setup.root, output.runDirectory, file)), true);
  assert.equal(json(path.join(setup.root, output.runDirectory, 'candidate-response.json')), null);
});
test('pre-spawn failure does not consume approval', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ spawned: false, spawnedAt: null, exitCode: -1, stdout: '', stderr: 'ENOENT', spawnError: 'ENOENT' });
  const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  assert.deepEqual({ childStarted: result.childStarted, launchStatus: result.launchStatus, approvalConsumed: result.approvalConsumed, exitCode: result.exitCode }, { childStarted: false, launchStatus: 'not-started', approvalConsumed: false, exitCode: -1 });
  assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/used-approvals', `${setup.livePlan.planId}.json`)), false);
});
test('spawned nonzero exit still consumes approval', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ exitCode: 9, stderr: 'failure' });
  const { result } = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  assert.equal(result.approvalConsumed, true); assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/used-approvals', `${setup.livePlan.planId}.json`)), true);
});
test('timeout after spawn leaves a complete run', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ exitCode: -1, timedOut: true });
  const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  assert.equal(output.result.timedOut, true); assert.equal(statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root }).completeRuns.length, 1);
});
test('truncation after spawn leaves a complete run', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ exitCode: -1, truncated: true, stdout: '{' });
  const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  assert.equal(output.result.truncated, true); assert.equal(statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root }).completeRuns.length, 1);
});
test('schema-invalid candidate remains inspectable', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ stdout: `${JSON.stringify({ artifactType: 'discussion-analysis' })}\n` });
  const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); const report = inspectRun(output.runDirectory, { root: setup.root });
  assert.equal(report.validation.valid, false); assert.equal(report.importEligibility, 'ineligible');
});
test('null candidate remains inspectable', async () => {
  const setup = executionSetup(); setup.options.runProcess = successfulProcess({ stdout: '' });
  const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); const report = inspectRun(output.runDirectory, { root: setup.root });
  assert.equal(report.childStarted, true); assert.equal(report.importEligibility, 'ineligible');
});
test('same attempt label creates deterministic plan identity', () => {
  const first = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-1' }); const second = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-1' });
  assert.equal(first.planId, second.planId); assert.equal(first.planSha256, second.planSha256);
});
test('different attempt labels create different plan identities', () => {
  const initial = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'initial' }); const retry = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-1' });
  assert.notEqual(initial.planId, retry.planId); assert.notEqual(initial.planSha256, retry.planSha256);
});
test('default attempt label is initial', () => assert.equal(plan().attemptId, 'initial'));
test('illegal attempt labels are rejected', () => {
  for (const value of ['', 'Retry-1', '-retry', 'a'.repeat(33), 'retry_1']) assert.throws(() => validateAttemptId(value), RunnerValidationError);
});
test('status is read-only', () => {
  const setup = executionSetup(); const file = path.join(setup.root, '.ai/runtime/local/plans/plan.json'); const before = readFileSync(file, 'utf8'); statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root }); assert.equal(readFileSync(file, 'utf8'), before);
});
test('status identifies a legacy orphaned used marker', () => {
  const setup = executionSetup(); writeArtifact(setup.root, `.ai/runtime/local/used-approvals/${setup.livePlan.planId}.json`, { planId: setup.livePlan.planId, planSha256: setup.livePlan.planSha256, usedAt: FIXED });
  const report = statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root }); assert.equal(report.legacyOrphanedUsedMarker, true); assert.equal(report.recommendedNextAction, 'prepare-new-attempt');
});
test('status identifies a complete matching run', async () => {
  const setup = executionSetup(); await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  const report = statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root }); assert.equal(report.completeRuns.length, 1); assert.equal(report.recommendedNextAction, 'inspect-existing-run');
});
test('status identifies an active claim', () => {
  const setup = executionSetup(); createApprovalClaim({ planId: setup.livePlan.planId, planSha256: setup.livePlan.planSha256, approvalPath: '.ai/runtime/local/approvals/approval.json', claimedAt: FIXED, attemptId: setup.livePlan.attemptId, runId: 'run-status-claim-001' }, { root: setup.root });
  const report = statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root }); assert.equal(report.claimExists, true); assert.equal(report.recommendedNextAction, 'wait-for-running-attempt');
});
test('status identifies an expired approval', () => {
  const setup = executionSetup(); writeArtifact(setup.root, `.ai/runtime/local/approvals/${setup.livePlan.planId}.json`, setup.approval); const report = statusLiveRunPlan('.ai/runtime/local/plans/plan.json', { root: setup.root, now: () => new Date('2026-07-22T05:00:00.000Z') }); assert.equal(report.recommendedNextAction, 'approval-expired');
});
test('inspect never enables automatic ingest', async () => {
  const setup = executionSetup(); const output = await executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options); assert.equal(inspectRun(output.runDirectory, { root: setup.root }).automaticIngest, false);
});
test('concurrent execution permits only one claim', async () => {
  const setup = executionSetup(); let release; const gate = new Promise((resolve) => { release = resolve; });
  setup.options.runProcess = async (_argv, _stdin, _limits, lifecycle) => { await gate; lifecycle.onSpawn(FIXED); return { exitCode: 0, timedOut: false, truncated: false, stdout: `${JSON.stringify(validCandidate())}\n`, stderr: '', removedEnvironmentNames: [], spawned: true, spawnedAt: FIXED, spawnError: null }; };
  const first = executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options);
  await assert.rejects(() => executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options), /BLOCKED_APPROVAL_ALREADY_CLAIMED/);
  release(); await first;
});
test('disabled local policy does not create a claim', async () => {
  const setup = executionSetup(); const policy = json(path.join(setup.root, '.ai/runtime/local/policy.json')); policy.executionEnabled = false; writeFileSync(path.join(setup.root, '.ai/runtime/local/policy.json'), `${JSON.stringify(policy)}\n`);
  await assert.rejects(() => executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options), /explicitly enabled/);
  assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/approval-claims', `${setup.livePlan.planId}.json`)), false);
});
test('nested Agent block does not create a claim', async () => {
  const setup = executionSetup(); setup.options.env = { CODEX_THREAD_ID: 'redacted' };
  await assert.rejects(() => executeLiveRun('.ai/runtime/local/plans/plan.json', '.ai/runtime/local/approvals/approval.json', setup.options), /BLOCKED_NESTED_AGENT_EXECUTION/);
  assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/approval-claims', `${setup.livePlan.planId}.json`)), false);
});

test('diagnose is read-only', () => {
  const setup = diagnosticRun(); const resultPath = path.join(setup.root, setup.runDirectory, 'result.json'); const before = readFileSync(resultPath, 'utf8');
  diagnoseRun(setup.runDirectory, { root: setup.root }); assert.equal(readFileSync(resultPath, 'utf8'), before);
});
test('diagnose does not reproduce complete stdout', () => {
  const marker = 'COMPLETE_RAW_STDOUT_SENTINEL'; const setup = diagnosticRun({ events: [{ type: 'thread.started', payload: marker }, diagnosticFailureEvent('unknown_error', 'Failure summary.') ] });
  assert.equal(JSON.stringify(diagnoseRun(setup.runDirectory, { root: setup.root })).includes(marker), false);
});
test('diagnose counts JSONL event types', () => {
  const setup = diagnosticRun({ events: [{ type: 'thread.started' }, { type: 'turn.started' }, { type: 'error', message: 'Failure.' }, diagnosticFailureEvent('unknown_error', 'Failure.') ] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.deepEqual(report.eventTypeCounts, { error: 1, 'thread.started': 1, 'turn.failed': 1, 'turn.started': 1 }); assert.equal(report.parsedEventCount, 4);
});
test('diagnose counts invalid JSON lines', () => {
  const setup = diagnosticRun({ rawLines: [JSON.stringify({ type: 'turn.started' }), 'not-json'] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.jsonlLineCount, 2); assert.equal(report.parsedEventCount, 1); assert.equal(report.invalidLineCount, 1);
});
test('diagnose extracts structured error events', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('invalid_json_schema', 'Invalid schema for response_format.')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.deepEqual(report.errorCodes, ['invalid_json_schema']); assert.deepEqual(report.supportingEventTypes, ['turn.failed']);
});
test('diagnose scans error summaries for secrets', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('auth_error', 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.deepEqual(report.secretFindingTypes, ['bearer-token']); assert.equal(report.recommendedNextAction, 'security-review-required');
});
test('diagnose never reproduces secret-like values', () => {
  const secret = 'abcdefghijklmnopqrstuvwxyz123456'; const setup = diagnosticRun({ events: [diagnosticFailureEvent('auth_error', `Bearer ${secret}`)] });
  assert.equal(JSON.stringify(diagnoseRun(setup.runDirectory, { root: setup.root })).includes(secret), false);
});
test('diagnose classifies output schema rejection', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('invalid_json_schema', "Invalid schema for response_format: schema must have a 'type' key.")] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.rootCauseCategory, 'OUTPUT_SCHEMA_REJECTED'); assert.equal(report.confidence, 'high'); assert.equal(report.recommendedNextAction, 'repair-runner-before-retry');
});
test('diagnose classifies authentication failure', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('authentication_error', 'Login required before this request.')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.rootCauseCategory, 'CODEX_AUTHENTICATION_FAILURE'); assert.equal(report.recommendedNextAction, 'reauthenticate-codex');
});
test('diagnose classifies quota failure', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('rate_limit_error', 'Rate limit exceeded (429).')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.rootCauseCategory, 'CODEX_QUOTA_OR_RATE_LIMIT'); assert.equal(report.retryWithoutCodeChange, true);
});
test('diagnose classifies transient provider failure', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('provider_error', 'Service unavailable from upstream provider.')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.rootCauseCategory, 'CODEX_PROVIDER_TRANSIENT_FAILURE'); assert.equal(report.recommendedNextAction, 'wait-and-retry-later');
});
test('diagnose classifies repository trust failure', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('repository_error', 'Repository trust check failed: not a trusted repository.')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.rootCauseCategory, 'CODEX_REPOSITORY_TRUST_FAILURE'); assert.equal(report.recommendedNextAction, 'repair-local-environment');
});
test('diagnose classifies unknown failure', () => {
  const setup = diagnosticRun({ events: [diagnosticFailureEvent('mystery', 'Something unrecognized happened.')] }); const report = diagnoseRun(setup.runDirectory, { root: setup.root });
  assert.equal(report.rootCauseCategory, 'UNKNOWN_EXIT1'); assert.equal(report.confidence, 'low');
});
test('diagnose handles empty stderr', () => {
  const setup = diagnosticRun({ stderr: '' }); assert.equal(diagnoseRun(setup.runDirectory, { root: setup.root }).stderrBytes, 0);
});
test('diagnose handles a null candidate', () => {
  const setup = diagnosticRun({ candidate: null }); assert.equal(diagnoseRun(setup.runDirectory, { root: setup.root }).candidateStatus, 'null');
});
test('diagnose never automatically prepares a Plan', () => {
  const setup = diagnosticRun(); const report = diagnoseRun(setup.runDirectory, { root: setup.root }); assert.equal(report.automaticPrepare, false); assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/plans')), false);
});
test('diagnose never automatically creates an Approval', () => {
  const setup = diagnosticRun(); const report = diagnoseRun(setup.runDirectory, { root: setup.root }); assert.equal(report.automaticApproval, false); assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/approvals')), false);
});
test('diagnose never automatically executes an Agent', () => {
  const setup = diagnosticRun(); const report = diagnoseRun(setup.runDirectory, { root: setup.root }); assert.equal(report.automaticExecute, false); assert.equal(existsSync(path.join(setup.root, '.ai/runtime/local/used-approvals')), false);
});
test('diagnose never automatically ingests a response', () => {
  const setup = diagnosticRun(); const report = diagnoseRun(setup.runDirectory, { root: setup.root }); assert.equal(report.automaticIngest, false); assert.equal(existsSync(path.join(setup.root, '.ai/discussions/examples/demo-persistence-boundary/responses')), false);
});
test('retry Plan records retry-1 attempt label', () => {
  const retry = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-1' }); assert.equal(retry.attemptId, 'retry-1'); assert.notEqual(retry.planId, plan().planId);
});
test('discussion output schema gives const and enum nodes explicit types', () => {
  const pending = [json(path.join(REPO_ROOT, '.ai/schemas/discussion-analysis.schema.json'))];
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object') continue;
    if (Object.hasOwn(value, 'const') || Object.hasOwn(value, 'enum')) assert.equal(typeof value.type, 'string');
    pending.push(...Object.values(value));
  }
});

function objectSchema(propertySchema) {
  return { type: 'object', additionalProperties: false, required: ['value'], properties: { value: propertySchema } };
}
function candidateWithPath(repositoryPath) {
  const candidate = validCandidate(); candidate.evidence[0].path = repositoryPath; return candidate;
}

test('Codex compatibility rejects negative lookahead', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ type: 'string', pattern: '^(?!secret).+$' })), /BLOCKED_CODEX_OUTPUT_SCHEMA_INCOMPATIBLE.*lookaround/);
});
test('Codex compatibility rejects positive lookahead', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ type: 'string', pattern: '^(?=safe).+$' })), /lookaround/);
});
test('Codex compatibility rejects lookbehind', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ type: 'string', pattern: '(?<=safe)value' })), /lookaround/);
});
test('Codex compatibility finds unsupported pattern in nested defs', () => {
  const schema = objectSchema({ $ref: '#/$defs/value' }); schema.$defs = { value: { type: 'string', pattern: '(?!blocked)' } };
  assert.throws(() => validateCodexOutputSchemaCompatibility(schema), /\$\.\$defs\.value\.pattern/);
});
test('Codex compatibility finds unsupported pattern in array items', () => {
  const schema = objectSchema({ type: 'array', items: { type: 'string', pattern: '(?=value)' } });
  assert.throws(() => validateCodexOutputSchemaCompatibility(schema), /items\.pattern/);
});
test('Codex compatibility recursively checks schema composition containers', () => {
  const bad = { type: 'string', pattern: '(?!blocked)' };
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    const schema = objectSchema({ [keyword]: [bad] });
    assert.throws(() => validateCodexOutputSchemaCompatibility(schema), new RegExp(`${keyword}\\[0\\]\\.pattern`));
  }
  const patterned = objectSchema({ type: 'string' }); patterned.patternProperties = { '(?=bad)': { type: 'string' } };
  assert.throws(() => validateCodexOutputSchemaCompatibility(patterned), /patternProperties.*lookaround/);
  const dependent = objectSchema({ type: 'string' }); dependent.dependentSchemas = { value: objectSchema({ type: 'string', pattern: '(?<!bad)' }) };
  assert.throws(() => validateCodexOutputSchemaCompatibility(dependent), /dependentSchemas\.value.*lookaround/);
});
test('Codex compatibility rejects regex backreferences', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ type: 'string', pattern: '^(a)\\1$' })), /backreferences/);
});
test('Codex compatibility rejects remote refs', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ $ref: 'https://example.com/schema.json' })), /deterministic local reference/);
});
test('Codex compatibility rejects unsupported format', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ type: 'string', format: 'date-time' })), /format is not supported/);
});
test('Codex compatibility rejects custom keywords', () => {
  assert.throws(() => validateCodexOutputSchemaCompatibility(objectSchema({ type: 'string', customRule: true })), /customRule is not supported/);
});
test('Codex discussion transport schema is compatible', () => {
  const schema = json(path.join(REPO_ROOT, '.ai/schemas/codex-discussion-analysis.schema.json'));
  assert.doesNotThrow(() => validateCodexOutputSchemaCompatibility(schema));
});
test('prepare uses the Codex discussion transport schema', () => {
  const value = plan(); assert.equal(value.outputSchema, '.ai/schemas/codex-discussion-analysis.schema.json');
  assert.equal(value.argv[value.argv.indexOf('--output-schema') + 1], value.outputSchema);
  assert.equal(value.canonicalSchema, '.ai/schemas/discussion-analysis.schema.json');
});
test('Plan hash binds the transport schema path', () => {
  const value = plan(); value.outputSchema = value.canonicalSchema; value.argv[value.argv.indexOf('--output-schema') + 1] = value.canonicalSchema;
  assert.throws(() => validatePlan(value), /planSha256 does not match/);
});
test('changed transport schema is blocked before execute', () => {
  const root = tempRoot(); const value = plan(root); writeFileSync(path.join(root, value.outputSchema), JSON.stringify(objectSchema({ type: 'string' })));
  assert.throws(() => validateBoundFiles(value, { root }), /output schema hash changed/);
});
test('changed canonical schema is blocked before execute', () => {
  const root = tempRoot(); const value = plan(root); writeFileSync(path.join(root, value.canonicalSchema), '{}');
  assert.throws(() => validateBoundFiles(value, { root }), /canonical schema hash changed/);
});
test('prepare blocks an incompatible transport schema before writing a Plan', () => {
  const root = tempRoot(); writeFileSync(path.join(root, '.ai/schemas/codex-discussion-analysis.schema.json'), JSON.stringify(objectSchema({ type: 'string', pattern: '(?!blocked)' })));
  assert.throws(() => prepareLiveRun('codex', 'discuss', PACKET, { root, clock: () => new Date(FIXED) }), /BLOCKED_CODEX_OUTPUT_SCHEMA_INCOMPATIBLE/);
  assert.equal(existsSync(path.join(root, '.ai/runtime/local/plans')), false);
});
test('canonical validator accepts a normal repository-relative evidence path', () => {
  assert.equal(validateCandidate(candidateWithPath('scripts/ai/agent-runner-lib.mjs'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, true);
});
test('canonical validator rejects a Windows absolute evidence path', () => {
  assert.equal(validateCandidate(candidateWithPath('C:/secret.txt'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('canonical validator rejects a Unix absolute evidence path', () => {
  assert.equal(validateCandidate(candidateWithPath('/secret.txt'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('canonical validator rejects parent traversal', () => {
  assert.equal(validateCandidate(candidateWithPath('../secret'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('canonical validator rejects nested parent traversal', () => {
  assert.equal(validateCandidate(candidateWithPath('folder/../../secret'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('canonical validator rejects an HTTPS URI', () => {
  assert.equal(validateCandidate(candidateWithPath('https://example.com/file'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('canonical validator rejects a file URI', () => {
  assert.equal(validateCandidate(candidateWithPath('file:///secret'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('relaxed transport path does not bypass canonical validation', () => {
  const transport = json(path.join(REPO_ROOT, '.ai/schemas/codex-discussion-analysis.schema.json'));
  assert.equal(transport.$defs.path.pattern, undefined);
  assert.equal(validateCandidate(candidateWithPath('../secret'), plan(), json(path.join(REPO_ROOT, PACKET))).valid, false);
});
test('retry-2 Plan identity is deterministic and distinct from earlier attempts', () => {
  const initial = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'initial' });
  const retry1 = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-1' });
  const retry2 = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-2' });
  const repeated = buildLiveRunPlan('codex', 'discuss', PACKET, { clock: () => new Date(FIXED), attemptId: 'retry-2' });
  assert.equal(retry2.attemptId, 'retry-2'); assert.notEqual(retry2.planId, initial.planId); assert.notEqual(retry2.planId, retry1.planId); assert.equal(retry2.planId, repeated.planId);
});
