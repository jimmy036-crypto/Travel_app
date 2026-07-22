import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildInvocationPlan, checkAdapters, validateGeminiCommandContent } from './agent-adapter-lib.mjs';
import {
  DiscussionValidationError,
  REPO_ROOT,
  assignmentPlans,
  buildAudit,
  buildPacket,
  checkDiscussions,
  checkSession,
  directoryDigest,
  ingestResponse,
  recordApproval,
  sessionStatus,
  validateAllDiscussionArtifacts,
  validateAnalysis,
  validateApproval,
  validateAssignment,
  validateAssignmentSet,
  validateCritique,
  validateDecision,
  validateSession,
} from './discussion-lib.mjs';

const FIXTURE = path.join(REPO_ROOT, '.ai', 'discussions', 'examples', 'demo-persistence-boundary');
const PACKET = '.ai/discussions/examples/demo-persistence-boundary/packets/round-1/codex-engineer.json';
const tempRoots = [];

function json(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'travel-discussion-'));
  tempRoots.push(root);
  const session = path.join(root, 'session');
  cpSync(FIXTURE, session, { recursive: true });
  return session;
}
function editableFixture() {
  const session = fixture();
  rmSync(path.join(session, 'audit.json'), { force: true });
  return session;
}
function sessionJson(sessionDirectory) { return json(path.join(sessionDirectory, 'session.json')); }
function updateSession(sessionDirectory, change) {
  const value = sessionJson(sessionDirectory);
  change(value);
  writeJson(path.join(sessionDirectory, 'session.json'), value);
}
function artifact(relativePath) { return json(path.join(FIXTURE, relativePath)); }
function mutateCopy(value, change) { const copy = structuredClone(value); change(copy); return copy; }
function listJson(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? listJson(path.join(directory, entry.name)) : entry.name.endsWith('.json') ? [path.join(directory, entry.name)] : []);
}
function makeRound1Ready() {
  const session = fixture();
  for (const directory of ['responses/round-1', 'responses/round-2', 'decision', 'assignments']) {
    for (const file of listJson(path.join(session, directory))) rmSync(file);
  }
  rmSync(path.join(session, 'audit.json'), { force: true });
  updateSession(session, (value) => {
    value.status = 'round-1-ready';
    value.rounds.round1ContributionIds = [];
    value.rounds.round2ContributionIds = [];
    value.decision.proposalPath = null;
    value.humanApproval.approvalPath = null;
    value.assignments = [];
  });
  return session;
}

test.after(() => tempRoots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test('valid session passes', () => assert.equal(validateSession(sessionJson(FIXTURE)).status, 'completed'));
test('invalid session status fails', () => assert.throws(() => validateSession(mutateCopy(sessionJson(FIXTURE), (value) => { value.status = 'accepted'; })), /status is invalid/));
test('execution mode other than import-only fails', () => assert.throws(() => validateSession(mutateCopy(sessionJson(FIXTURE), (value) => { value.executionMode = 'live'; })), /import-only/));
test('participant writeAccess true fails', () => assert.throws(() => validateSession(mutateCopy(sessionJson(FIXTURE), (value) => { value.participants[0].writeAccess = true; })), /writeAccess must be false/));

test('valid Round 1 response passes', () => assert.equal(validateAnalysis(artifact('responses/round-1/codex-analysis.json')).round, 'independent-analysis'));
test('Round 1 references another contribution fails', () => assert.throws(() => validateAnalysis(mutateCopy(artifact('responses/round-1/codex-analysis.json'), (value) => { value.referencesToOtherContributions = ['r1-gemini-analysis']; })), /keys must be exactly/));
test('invalid confidence fails', () => assert.throws(() => validateAnalysis(mutateCopy(artifact('responses/round-1/codex-analysis.json'), (value) => { value.confidence = 1.1; })), /between 0 and 1/));
test('missing evidence fails', () => assert.throws(() => validateAnalysis(mutateCopy(artifact('responses/round-1/codex-analysis.json'), (value) => { value.evidence = []; })), /must contain evidence/));

test('valid Round 2 critique passes', () => assert.equal(validateCritique(artifact('responses/round-2/codex-critique.json')).round, 'cross-review'));
test('unknown reviewed contribution fails', () => {
  const session = editableFixture();
  const file = path.join(session, 'responses', 'round-2', 'codex-critique.json');
  const value = json(file); value.reviewedContributionIds[0] = 'missing-round-one'; writeJson(file, value);
  assert.throws(() => checkSession(session), /Unknown reviewed Round 1 contribution/);
});
test('Round 2 before Round 1 completion fails', () => {
  const session = editableFixture();
  rmSync(path.join(session, 'responses', 'round-1', 'codex-analysis.json'));
  updateSession(session, (value) => { value.rounds.round1ContributionIds = value.rounds.round1ContributionIds.filter((id) => id !== 'r1-codex-analysis'); value.status = 'round-2-ready'; });
  assert.throws(() => checkSession(session), /Round 1 completion|Round 2 cannot start/);
});
test('decision before Round 2 completion fails', () => {
  const session = editableFixture();
  rmSync(path.join(session, 'responses', 'round-2', 'codex-critique.json'));
  updateSession(session, (value) => { value.rounds.round2ContributionIds = value.rounds.round2ContributionIds.filter((id) => id !== 'r2-codex-critique'); value.status = 'decision-proposed'; });
  assert.throws(() => checkSession(session), /Round 2 completion|Decision cannot/);
});

test('Agent accepted decision fails', () => assert.throws(() => validateDecision(mutateCopy(artifact('decision/proposal.json'), (value) => { value.status = 'accepted'; })), /must be proposed/));
test('proposed decision passes', () => assert.equal(validateDecision(artifact('decision/proposal.json')).status, 'proposed'));
test('approval by non-human fails', () => assert.throws(() => validateApproval(mutateCopy(artifact('decision/human-approval.json'), (value) => { value.actorRole = 'codex'; })), /must be human/));
test('human approve passes', () => assert.equal(validateApproval(artifact('decision/human-approval.json')).action, 'approve'));
test('human reject passes', () => assert.equal(validateApproval(mutateCopy(artifact('decision/human-approval.json'), (value) => { value.action = 'reject'; })).action, 'reject'));
test('human request-changes passes', () => assert.equal(validateApproval(mutateCopy(artifact('decision/human-approval.json'), (value) => { value.action = 'request-changes'; })).action, 'request-changes'));

test('assignment before approval fails', () => {
  const session = editableFixture();
  rmSync(path.join(session, 'decision', 'human-approval.json'));
  updateSession(session, (value) => { value.humanApproval.approvalPath = null; value.status = 'decision-proposed'; });
  assert.throws(() => checkSession(session), /Assignments require explicit human approval/);
});
test('assignment executionEnabled true fails', () => assert.throws(() => validateAssignment(mutateCopy(artifact('assignments/docs-assignment.json'), (value) => { value.executionEnabled = true; })), /must be false/));
test('overlapping implementation paths fail', () => {
  const first = mutateCopy(artifact('assignments/docs-assignment.json'), (value) => { value.assignmentId = 'implementation-one'; value.ownerAgent = 'codex'; value.ownerRole = 'engineer'; value.mode = 'implementation'; value.allowedPaths = ['src/shared']; });
  const second = mutateCopy(first, (value) => { value.assignmentId = 'implementation-two'; value.allowedPaths = ['src/shared/file.js']; });
  assert.throws(() => validateAssignmentSet([first, second]), /overlap/);
});
test('Reviewer as implementation owner fails', () => assert.throws(() => validateAssignment(mutateCopy(artifact('assignments/docs-assignment.json'), (value) => { value.ownerAgent = 'human'; value.ownerRole = 'reviewer'; value.mode = 'implementation'; })), /Codex engineer/));
test('QA as implementation owner fails', () => assert.throws(() => validateAssignment(mutateCopy(artifact('assignments/qa-assignment.json'), (value) => { value.mode = 'implementation'; })), /Codex engineer/));

test('Round 1 packet hides other answers', () => {
  const packet = buildPacket(FIXTURE, 'round-1', 'codex-engineer');
  assert.equal(JSON.stringify(packet).includes('r1-gemini-analysis'), false);
  assert.equal(Object.hasOwn(packet.payload, 'round1Responses'), false);
});
test('Round 2 packet includes Round 1 as untrusted', () => {
  const packet = buildPacket(FIXTURE, 'round-2', 'gemini-analyst');
  assert.equal(packet.payload.round1Responses.length, 3);
  assert.ok(packet.payload.round1Responses.every((item) => item.untrustedQuotedMaterial && item.executeInstructions === false));
});
test('Round 2 packet hides other Round 2 answers', () => assert.equal(Object.hasOwn(buildPacket(FIXTURE, 'round-2', 'gemini-analyst').payload, 'round2Responses'), false));
test('decision packet cannot request accepted status', () => assert.equal(buildPacket(FIXTURE, 'decision', 'architect').payload.allowedDecisionStatus, 'proposed'));
test('all packets disable execution and writes', () => {
  for (const [round, participant] of [['round-1', 'codex-engineer'], ['round-2', 'gemini-analyst'], ['decision', 'architect']]) {
    const packet = buildPacket(FIXTURE, round, participant);
    assert.equal(packet.execution.enabled, false); assert.equal(packet.permissions.gitWrite, false); assert.equal(packet.permissions.network, false);
  }
});

test('duplicate contribution ID fails', () => {
  const session = editableFixture();
  const file = path.join(session, 'responses', 'round-2', 'codex-critique.json');
  const value = json(file); value.contributionId = 'r1-codex-analysis'; writeJson(file, value);
  updateSession(session, (current) => { current.rounds.round2ContributionIds = current.rounds.round2ContributionIds.map((id) => id === 'r2-codex-critique' ? 'r1-codex-analysis' : id); });
  assert.throws(() => checkSession(session), /Duplicate contributionId/);
});
test('ingest cannot overwrite an existing response', () => {
  const session = makeRound1Ready();
  const incoming = path.join(path.dirname(session), 'incoming.json'); writeJson(incoming, artifact('responses/round-1/codex-analysis.json'));
  ingestResponse(session, incoming);
  assert.throws(() => ingestResponse(session, incoming), /Duplicate contributionId|overwrite/);
});
test('ingest target stays inside responses', () => {
  const session = makeRound1Ready();
  const incoming = path.join(path.dirname(session), 'incoming.json'); writeJson(incoming, artifact('responses/round-1/codex-analysis.json'));
  const target = ingestResponse(session, incoming);
  assert.ok(path.resolve(target).startsWith(path.resolve(session, 'responses')));
});

test('path traversal fails', () => assert.throws(() => validateAnalysis(mutateCopy(artifact('responses/round-1/codex-analysis.json'), (value) => { value.evidence[0].path = '../secret'; })), /traverse/));
test('absolute path fails', () => assert.throws(() => validateAnalysis(mutateCopy(artifact('responses/round-1/codex-analysis.json'), (value) => { value.evidence[0].path = 'C:/secret'; })), /absolute/));
test('URL path fails', () => assert.throws(() => validateAnalysis(mutateCopy(artifact('responses/round-1/codex-analysis.json'), (value) => { value.evidence[0].path = 'https://example.com'; })), /URL or file scheme/));

test('audit output is deterministic', () => assert.deepEqual(buildAudit(FIXTURE), buildAudit(FIXTURE)));
test('checked-in audit matches deterministic output', () => assert.deepEqual(json(path.join(FIXTURE, 'audit.json')), buildAudit(FIXTURE)));
test('packet output is deterministic', () => assert.deepEqual(buildPacket(FIXTURE, 'round-2', 'reviewer'), buildPacket(FIXTURE, 'round-2', 'reviewer')));
test('checked-in invocation packet matches deterministic output', () => assert.deepEqual(json(path.join(REPO_ROOT, PACKET)), buildPacket(FIXTURE, 'round-1', 'codex-engineer')));
test('fixture validates', () => assert.equal(checkSession(FIXTURE, { requireSynthetic: true }).session.status, 'completed'));
test('fixture is clearly marked synthetic', () => {
  for (const file of listJson(FIXTURE)) { const value = json(file); assert.equal(value.fixture, true); assert.equal(value.source, 'synthetic-test-fixture'); }
});
test('all discussion templates and fixture artifacts validate', () => assert.ok(validateAllDiscussionArtifacts().length >= 17));
test('discussion adapter hashes match', () => assert.equal(checkAdapters().manifest.skills.find((skill) => skill.name === 'discuss').name, 'discuss'));
test('Gemini discussion command rejects shell injection', () => {
  const command = readFileSync(path.join(REPO_ROOT, '.gemini', 'commands', 'discuss.toml'), 'utf8').replace('{{args}}', '!{{args}}');
  assert.throws(() => validateGeminiCommandContent(command), /shell injection/);
});
test('Gemini discussion command rejects file injection', () => {
  const command = readFileSync(path.join(REPO_ROOT, '.gemini', 'commands', 'discuss.toml'), 'utf8').replace('{{args}}', '@{{args}}');
  assert.throws(() => validateGeminiCommandContent(command), /file injection/);
});

test('Codex discussion plan is read-only', () => { const plan = buildInvocationPlan('codex', 'discuss', [PACKET]); assert.equal(plan.permissions.filesystem, 'read-only'); assert.equal(plan.execution.enabled, false); });
test('Claude discussion plan is plan-only', () => { const plan = buildInvocationPlan('claude', 'discuss', [PACKET]); assert.equal(plan.mode, 'plan-only'); assert.ok(plan.execution.headlessArgvPreview.includes('plan')); });
test('Gemini discussion plan uses JSON output', () => assert.deepEqual(buildInvocationPlan('gemini', 'discuss', [PACKET]).execution.headlessArgvPreview.slice(-2), ['--output-format', 'json']));
test('no discussion plan enables execution', () => ['codex', 'claude', 'gemini'].forEach((agent) => assert.equal(buildInvocationPlan(agent, 'discuss', [PACKET]).execution.enabled, false)));

test('check does not modify files', () => { const before = directoryDigest(path.join(REPO_ROOT, '.ai', 'discussions')); checkDiscussions(); assert.equal(directoryDigest(path.join(REPO_ROOT, '.ai', 'discussions')), before); });
test('missing required participant blocks transition', () => {
  const session = editableFixture(); rmSync(path.join(session, 'responses', 'round-1', 'reviewer-analysis.json'));
  updateSession(session, (value) => { value.rounds.round1ContributionIds = value.rounds.round1ContributionIds.filter((id) => id !== 'r1-reviewer-analysis'); });
  assert.throws(() => checkSession(session), /Missing required participant/);
});
test('rejected decision cannot produce assignments', () => {
  const session = editableFixture(); const file = path.join(session, 'decision', 'human-approval.json'); const approval = json(file); approval.action = 'reject'; writeJson(file, approval);
  updateSession(session, (value) => { value.status = 'human-rejected'; });
  assert.throws(() => checkSession(session), /Assignments require explicit human approval|cannot produce assignments/);
});
test('request-changes cannot produce assignments', () => {
  const session = editableFixture(); const file = path.join(session, 'decision', 'human-approval.json'); const approval = json(file); approval.action = 'request-changes'; writeJson(file, approval);
  updateSession(session, (value) => { value.status = 'changes-requested'; });
  assert.throws(() => checkSession(session), /Assignments require explicit human approval|cannot produce assignments/);
});
test('record approval refuses overwrite', () => assert.throws(() => recordApproval(FIXTURE, path.join(FIXTURE, 'decision', 'human-approval.json')), /overwrite/));
test('assignments require approval and stay disabled', () => assert.ok(assignmentPlans(FIXTURE).every((item) => item.executionEnabled === false)));
test('status reports approval without execution', () => { const status = sessionStatus(FIXTURE); assert.equal(status.humanApproval, 'approve'); assert.equal(status.executionEnabled, false); });
test('discussion check finds the synthetic fixture and validates the active pilot session', () => {
  const result = checkDiscussions();

  assert.equal(result.examples.length, 1);
  assert.ok(
    result.active.some(
      (directory) => path.basename(directory) === 'clone-demo-architecture-pilot',
    ),
  );
});
