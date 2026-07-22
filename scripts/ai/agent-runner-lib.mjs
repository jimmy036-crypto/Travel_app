import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateArtifact as validateDiscussionArtifact } from './discussion-lib.mjs';

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const POLICY_PATH = '.ai/runtime/policy.template.json';
export const LOCAL_POLICY_PATH = '.ai/runtime/local/policy.json';
export const LOCAL_PLANS_DIR = '.ai/runtime/local/plans';
export const LOCAL_APPROVALS_DIR = '.ai/runtime/local/approvals';
export const LOCAL_APPROVAL_CLAIMS_DIR = '.ai/runtime/local/approval-claims';
export const LOCAL_USED_APPROVALS_DIR = '.ai/runtime/local/used-approvals';
export const LOCAL_RECOVERIES_DIR = '.ai/runtime/local/recoveries';
export const RUNS_DIR = '.ai/runs';
export const DEFAULT_LIMITS = Object.freeze({ maxRuntimeSeconds: 600, maxOutputBytes: 5 * 1024 * 1024 });

const AGENTS = ['codex', 'claude', 'gemini'];
const SKILLS = ['discuss', 'understand', 'explain-diff'];
const MANAGED_ENV_NAMES = ['CODEX_THREAD_ID', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_MANAGED_BY_NPM', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'GEMINI_CLI', 'GEMINI_CLI_HOME'];
const SECRET_ENV_NAME = /(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE_KEY|GITHUB_TOKEN|FIREBASE|AWS_|AZURE_|GOOGLE_APPLICATION_CREDENTIALS)/i;
const ATTEMPT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const PERMISSIONS = Object.freeze({ filesystem: 'read-only', network: false, productionFirebase: false, gitWrite: false, deploy: false });
const SKILL_CONFIG = Object.freeze({
  discuss: { adapter: '.agents/skills/discuss/SKILL.md', defaultSchema: '.ai/schemas/discussion-analysis.schema.json' },
  understand: { adapter: '.agents/skills/understand/SKILL.md', defaultSchema: '.ai/schemas/understanding-guide.schema.json' },
  'explain-diff': { adapter: '.agents/skills/explain-diff/SKILL.md', defaultSchema: '.ai/schemas/explain-diff.schema.json' },
});
const CODEX_TRANSPORT_SCHEMA_BY_CANONICAL = Object.freeze({
  '.ai/schemas/discussion-analysis.schema.json': '.ai/schemas/codex-discussion-analysis.schema.json',
});
const CODEX_OUTPUT_SCHEMA_FILES = Object.freeze([...new Set(Object.values(CODEX_TRANSPORT_SCHEMA_BY_CANONICAL))]);
const SCHEMA_FILES = Object.freeze({
  'live-run-policy': '.ai/schemas/live-run-policy.schema.json',
  'live-run-plan': '.ai/schemas/live-run-plan.schema.json',
  'live-run-approval': '.ai/schemas/live-run-approval.schema.json',
  'live-run-result': '.ai/schemas/live-run-result.schema.json',
});

export class RunnerValidationError extends Error {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(`Agent runner validation failed:\n- ${list.join('\n- ')}`);
    this.name = 'RunnerValidationError';
    this.errors = list;
  }
}

function fail(message) { throw new RunnerValidationError(message); }
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value, expected, location) {
  if (!isObject(value)) fail(`${location} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(`${location} keys must be exactly: ${wanted.join(', ')}`);
}
function exactKeysWithOptional(value, required, optional, location) {
  if (!isObject(value)) fail(`${location} must be an object`);
  const actual = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  const unexpected = actual.filter((key) => !allowed.has(key));
  if (missing.length || unexpected.length) fail(`${location} keys are invalid (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'})`);
}
function assertString(value, location) { if (typeof value !== 'string' || !value.trim()) fail(`${location} must be a non-empty string`); }
function assertBoolean(value, expected, location) { if (value !== expected) fail(`${location} must be ${expected}`); }
function assertDate(value, location) { assertString(value, location); if (!Number.isFinite(Date.parse(value))) fail(`${location} must be an ISO date-time`); }
function assertHash(value, location) { if (!/^[a-f0-9]{64}$/.test(value ?? '')) fail(`${location} must be SHA-256 hex`); }
function assertId(value, location) { if (!/^[a-z0-9][a-z0-9-]{7,63}$/.test(value ?? '')) fail(`${location} is invalid`); }
export function validateAttemptId(value, location = 'attemptId') {
  if (!ATTEMPT_ID_PATTERN.test(value ?? '')) fail(`${location} must match [a-z0-9][a-z0-9-]{0,31}`);
  return value;
}
export function planAttemptId(plan) { return plan.attemptId ?? 'initial'; }

export function assertRepositoryPath(value, location = 'path') {
  if (typeof value !== 'string' || !value.trim()) fail(`${location} must be a non-empty repository-relative path`);
  if (value.includes('\0') || value.includes('\\')) fail(`${location} contains a forbidden character`);
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) fail(`${location} must not be absolute`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) fail(`${location} must not use a URL or file scheme`);
  if (value.split('/').includes('..')) fail(`${location} must not traverse outside the repository`);
  return value;
}

function resolveRepositoryFile(root, repositoryPath, location = repositoryPath) {
  assertRepositoryPath(repositoryPath, location);
  const resolved = path.resolve(root, repositoryPath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) fail(`${location} escapes the repository`);
  let stat;
  try { stat = lstatSync(resolved); } catch { fail(`${location} is missing`); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${location} must be a regular file`);
  return resolved;
}

function readJsonFile(root, repositoryPath) {
  const resolved = resolveRepositoryFile(root, repositoryPath);
  try { return JSON.parse(readFileSync(resolved, 'utf8')); } catch (error) { fail(`${repositoryPath} is not valid JSON: ${error.message}`); }
}

export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
export function sha256File(root, repositoryPath) { return sha256(readFileSync(resolveRepositoryFile(root, repositoryPath))); }
export function computePlanHash(plan) { const { planSha256: ignored, ...body } = plan; void ignored; return sha256(stableJson(body)); }

function validatePermissions(value, location = 'permissions') {
  exactKeys(value, Object.keys(PERMISSIONS), location);
  for (const [key, expected] of Object.entries(PERMISSIONS)) if (value[key] !== expected) fail(`${location}.${key} is unsafe`);
}

export function validatePolicy(policy, { committed = false, requireEnabled = false } = {}) {
  exactKeys(policy, ['schemaVersion', 'artifactType', 'executionEnabled', 'allowedAgents', 'allowedSkills', 'allowedModes', 'allowedUntrackedPaths', 'network', 'productionFirebase', 'gitWrite', 'deploy', 'nestedExecution', 'maxRuntimeSeconds', 'maxOutputBytes', 'requireApproval', 'resultImportMode'], 'policy');
  if (policy.schemaVersion !== '1.0.0' || policy.artifactType !== 'live-run-policy') fail('policy identity is invalid');
  if (!Array.isArray(policy.allowedAgents) || JSON.stringify(policy.allowedAgents) !== JSON.stringify(['codex'])) fail('policy.allowedAgents must contain only codex');
  if (!Array.isArray(policy.allowedSkills) || policy.allowedSkills.some((item) => !SKILLS.includes(item)) || new Set(policy.allowedSkills).size !== policy.allowedSkills.length) fail('policy.allowedSkills is invalid');
  if (JSON.stringify(policy.allowedModes) !== JSON.stringify(['read-only-analysis'])) fail('policy.allowedModes must contain read-only-analysis');
  if (JSON.stringify(policy.allowedUntrackedPaths) !== JSON.stringify(['.ai/runtime/local/', '.ai/runs/'])) fail('policy.allowedUntrackedPaths must contain only the two local runtime directories');
  for (const key of ['network', 'productionFirebase', 'gitWrite', 'deploy', 'nestedExecution']) assertBoolean(policy[key], false, `policy.${key}`);
  assertBoolean(policy.requireApproval, true, 'policy.requireApproval');
  if (policy.resultImportMode !== 'manual') fail('policy.resultImportMode must be manual');
  if (!Number.isInteger(policy.maxRuntimeSeconds) || policy.maxRuntimeSeconds < 1 || policy.maxRuntimeSeconds > 600) fail('policy.maxRuntimeSeconds is invalid');
  if (!Number.isInteger(policy.maxOutputBytes) || policy.maxOutputBytes < 1024 || policy.maxOutputBytes > DEFAULT_LIMITS.maxOutputBytes) fail('policy.maxOutputBytes is invalid');
  if (committed && policy.executionEnabled !== false) fail('committed policy must remain disabled');
  if (requireEnabled && policy.executionEnabled !== true) fail('local policy must be explicitly enabled by a human');
  if (typeof policy.executionEnabled !== 'boolean') fail('policy.executionEnabled must be boolean');
  return policy;
}

function validateArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 7 || argv.some((item) => typeof item !== 'string' || !item)) fail('plan.argv must be a non-empty string array');
  if (argv[0] !== 'codex' || argv[1] !== 'exec') fail('plan.argv must target codex exec');
  if (!argv.includes('--ephemeral') || !argv.includes('--sandbox') || argv[argv.indexOf('--sandbox') + 1] !== 'read-only' || !argv.includes('--json') || argv.at(-1) !== '-') fail('plan.argv is missing required read-only Codex flags');
  const text = argv.join(' ');
  if (/full-auto|dangerously-bypass-approvals-and-sandbox|danger-full-access|workspace-write|skip-git-repo-check/i.test(text)) fail('plan.argv contains a forbidden execution bypass');
}

export function validatePlan(plan, { verifyHash = true } = {}) {
  exactKeysWithOptional(plan, ['schemaVersion', 'artifactType', 'planId', 'createdAt', 'agent', 'skill', 'mode', 'workingDirectory', 'packetPath', 'packetSha256', 'adapterPath', 'adapterSha256', 'outputSchema', 'outputSchemaSha256', 'argv', 'stdinSource', 'permissions', 'limits', 'execution', 'planSha256'], ['attemptId', 'canonicalSchema', 'canonicalSchemaSha256'], 'plan');
  if (plan.schemaVersion !== '1.0.0' || plan.artifactType !== 'live-run-plan') fail('plan identity is invalid');
  assertId(plan.planId, 'plan.planId'); assertDate(plan.createdAt, 'plan.createdAt');
  if (Object.hasOwn(plan, 'attemptId')) validateAttemptId(plan.attemptId, 'plan.attemptId');
  if (plan.agent !== 'codex' || !SKILLS.includes(plan.skill) || plan.mode !== 'read-only-analysis' || plan.workingDirectory !== '.') fail('plan provider, skill, mode, or working directory is invalid');
  const canonicalCount = ['canonicalSchema', 'canonicalSchemaSha256'].filter((key) => Object.hasOwn(plan, key)).length;
  if (canonicalCount !== 0 && canonicalCount !== 2) fail('plan canonical schema fields must be provided together');
  for (const key of ['packetPath', 'adapterPath', 'outputSchema', 'stdinSource', ...(canonicalCount ? ['canonicalSchema'] : [])]) assertRepositoryPath(plan[key], `plan.${key}`);
  for (const key of ['packetSha256', 'adapterSha256', 'outputSchemaSha256', 'planSha256', ...(canonicalCount ? ['canonicalSchemaSha256'] : [])]) assertHash(plan[key], `plan.${key}`);
  validateArgv(plan.argv); validatePermissions(plan.permissions, 'plan.permissions');
  const schemaFlag = plan.argv.indexOf('--output-schema');
  if (schemaFlag !== -1 && plan.argv[schemaFlag + 1] !== plan.outputSchema) fail('plan.argv output schema does not match plan.outputSchema');
  exactKeys(plan.limits, ['maxRuntimeSeconds', 'maxOutputBytes'], 'plan.limits');
  if (!Number.isInteger(plan.limits.maxRuntimeSeconds) || plan.limits.maxRuntimeSeconds < 1 || plan.limits.maxRuntimeSeconds > 600) fail('plan.limits.maxRuntimeSeconds is invalid');
  if (!Number.isInteger(plan.limits.maxOutputBytes) || plan.limits.maxOutputBytes < 1024 || plan.limits.maxOutputBytes > DEFAULT_LIMITS.maxOutputBytes) fail('plan.limits.maxOutputBytes is invalid');
  exactKeys(plan.execution, ['enabled', 'reason'], 'plan.execution'); assertBoolean(plan.execution.enabled, false, 'plan.execution.enabled'); assertString(plan.execution.reason, 'plan.execution.reason');
  if (verifyHash && computePlanHash(plan) !== plan.planSha256) fail('plan.planSha256 does not match plan contents');
  return plan;
}

const CODEX_SCHEMA_KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description', 'type', 'additionalProperties', 'required', 'properties', 'items',
  'oneOf', 'anyOf', 'allOf', 'patternProperties', 'dependentSchemas', 'pattern', 'const', 'enum', 'minLength', 'maxLength',
  'minItems', 'maxItems', 'uniqueItems', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
]);

function schemaPointer(root, reference) {
  if (!reference.startsWith('#/')) return null;
  let current = root;
  for (const raw of reference.slice(2).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!isObject(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function codexPatternError(pattern) {
  if (/\(\?(?:[=!]|<[=!])/.test(pattern)) return 'regex lookaround is not supported';
  if (/\\(?:[1-9]|k<)/.test(pattern) || /\(\?P=/.test(pattern)) return 'regex backreferences are not supported';
  try { new RegExp(pattern); } catch { return 'regex is invalid'; }
  return null;
}

export function validateCodexOutputSchemaCompatibility(schema) {
  if (!isObject(schema)) fail('BLOCKED_CODEX_OUTPUT_SCHEMA_INCOMPATIBLE: schema root must be an object');
  const errors = [];
  if (schema.type !== 'object') errors.push('$ must declare type object');
  const visit = (node, location) => {
    if (!isObject(node)) { errors.push(`${location} must be a schema object`); return; }
    for (const key of Object.keys(node)) if (!CODEX_SCHEMA_KEYWORDS.has(key)) errors.push(`${location}.${key} is not supported by Codex structured output`);
    if (Object.hasOwn(node, 'format')) errors.push(`${location}.format is not supported by Codex structured output`);
    if ((Object.hasOwn(node, 'const') || Object.hasOwn(node, 'enum')) && typeof node.type !== 'string') errors.push(`${location} const/enum must declare type`);
    if (node.type === 'object') {
      if (node.additionalProperties !== false) errors.push(`${location} must set additionalProperties to false`);
      if (!isObject(node.properties)) errors.push(`${location}.properties must be an object`);
      else {
        const propertyKeys = Object.keys(node.properties).sort();
        const required = Array.isArray(node.required) ? [...node.required].sort() : [];
        if (JSON.stringify(propertyKeys) !== JSON.stringify(required)) errors.push(`${location}.required must list every property exactly once`);
      }
    }
    if (Object.hasOwn(node, 'pattern')) {
      if (typeof node.pattern !== 'string') errors.push(`${location}.pattern must be a string`);
      else { const reason = codexPatternError(node.pattern); if (reason) errors.push(`${location}.pattern ${reason}`); }
    }
    if (Object.hasOwn(node, '$ref')) {
      if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/')) errors.push(`${location}.$ref must be a deterministic local reference`);
      else if (schemaPointer(schema, node.$ref) === undefined) errors.push(`${location}.$ref does not resolve`);
    }
    const visitMap = (value, childLocation, validateKeys = false) => {
      if (!isObject(value)) { errors.push(`${childLocation} must be an object`); return; }
      for (const [key, child] of Object.entries(value)) {
        if (validateKeys) { const reason = codexPatternError(key); if (reason) errors.push(`${childLocation}.${key} ${reason}`); }
        visit(child, `${childLocation}.${key}`);
      }
    };
    if (Object.hasOwn(node, 'properties')) visitMap(node.properties, `${location}.properties`);
    if (Object.hasOwn(node, '$defs')) visitMap(node.$defs, `${location}.$defs`);
    if (Object.hasOwn(node, 'patternProperties')) visitMap(node.patternProperties, `${location}.patternProperties`, true);
    if (Object.hasOwn(node, 'dependentSchemas')) visitMap(node.dependentSchemas, `${location}.dependentSchemas`);
    if (Object.hasOwn(node, 'items')) {
      if (Array.isArray(node.items)) node.items.forEach((child, index) => visit(child, `${location}.items[${index}]`));
      else visit(node.items, `${location}.items`);
    }
    for (const key of ['oneOf', 'anyOf', 'allOf']) {
      if (!Object.hasOwn(node, key)) continue;
      if (!Array.isArray(node[key])) errors.push(`${location}.${key} must be an array`);
      else node[key].forEach((child, index) => visit(child, `${location}.${key}[${index}]`));
    }
  };
  visit(schema, '$');
  if (errors.length) fail(`BLOCKED_CODEX_OUTPUT_SCHEMA_INCOMPATIBLE: ${[...new Set(errors)].join('; ')}`);
  return schema;
}

export function validateApproval(approval, { plan, now } = {}) {
  exactKeys(approval, ['schemaVersion', 'artifactType', 'planId', 'planSha256', 'actorRole', 'action', 'confirmationPhrase', 'approvedAt', 'expiresAt'], 'approval');
  if (approval.schemaVersion !== '1.0.0' || approval.artifactType !== 'live-run-approval') fail('approval identity is invalid');
  assertId(approval.planId, 'approval.planId'); assertHash(approval.planSha256, 'approval.planSha256');
  if (approval.actorRole !== 'human' || approval.action !== 'approve-live-run') fail('approval must be an explicit human live-run approval');
  if (approval.confirmationPhrase !== `I APPROVE LIVE RUN ${approval.planId}`) fail('approval confirmation phrase is invalid');
  assertDate(approval.approvedAt, 'approval.approvedAt'); assertDate(approval.expiresAt, 'approval.expiresAt');
  if (Date.parse(approval.expiresAt) <= Date.parse(approval.approvedAt)) fail('approval expiry must follow approval time');
  if (plan && (approval.planId !== plan.planId || approval.planSha256 !== plan.planSha256)) fail('approval is bound to another plan');
  if (now && Date.parse(approval.expiresAt) <= new Date(now).getTime()) fail('approval has expired');
  return approval;
}

export function validateResult(result) {
  const lifecycleKeys = ['attemptId', 'launchStatus', 'childStarted', 'approvalConsumed'];
  exactKeysWithOptional(result, ['schemaVersion', 'artifactType', 'runId', 'planId', 'planSha256', 'agent', 'skill', 'startedAt', 'completedAt', 'exitCode', 'timedOut', 'truncated', 'stdoutFormat', 'rawOutputPath', 'validatedResponsePath', 'validation', 'security', 'importStatus'], lifecycleKeys, 'result');
  if (result.schemaVersion !== '1.0.0' || result.artifactType !== 'live-run-result') fail('result identity is invalid');
  assertId(result.runId, 'result.runId'); assertId(result.planId, 'result.planId'); assertHash(result.planSha256, 'result.planSha256');
  const lifecycleCount = lifecycleKeys.filter((key) => Object.hasOwn(result, key)).length;
  if (lifecycleCount !== 0 && lifecycleCount !== lifecycleKeys.length) fail('result lifecycle fields must be provided together');
  if (lifecycleCount) {
    validateAttemptId(result.attemptId, 'result.attemptId');
    if (!['not-started', 'started'].includes(result.launchStatus)) fail('result.launchStatus is invalid');
    if (typeof result.childStarted !== 'boolean' || typeof result.approvalConsumed !== 'boolean') fail('result lifecycle booleans are invalid');
    if (result.launchStatus === 'not-started' && (result.childStarted || result.approvalConsumed || result.exitCode !== -1)) fail('not-started result lifecycle is inconsistent');
    if (result.childStarted && (!result.approvalConsumed || result.launchStatus !== 'started')) fail('started child must consume approval');
  }
  if (result.agent !== 'codex' || !SKILLS.includes(result.skill)) fail('result provider or skill is invalid');
  assertDate(result.startedAt, 'result.startedAt'); assertDate(result.completedAt, 'result.completedAt');
  if (!Number.isInteger(result.exitCode) || typeof result.timedOut !== 'boolean' || typeof result.truncated !== 'boolean' || result.stdoutFormat !== 'jsonl') fail('result process fields are invalid');
  assertRepositoryPath(result.rawOutputPath, 'result.rawOutputPath'); assertRepositoryPath(result.validatedResponsePath, 'result.validatedResponsePath');
  exactKeys(result.validation, ['valid', 'errors'], 'result.validation'); if (typeof result.validation.valid !== 'boolean' || !Array.isArray(result.validation.errors)) fail('result.validation is invalid');
  exactKeys(result.security, ['reviewRequired', 'findings', 'removedEnvironmentNames'], 'result.security');
  if (typeof result.security.reviewRequired !== 'boolean' || !Array.isArray(result.security.findings) || !Array.isArray(result.security.removedEnvironmentNames)) fail('result.security is invalid');
  for (const finding of result.security.findings) { exactKeys(finding, ['type', 'masked'], 'result.security.finding'); assertString(finding.type, 'finding.type'); assertString(finding.masked, 'finding.masked'); }
  if (!['not-reviewed', 'human-reviewed', 'imported', 'rejected'].includes(result.importStatus)) fail('result.importStatus is invalid');
  return result;
}

export function validateRunnerArtifact(artifact, options = {}) {
  if (!isObject(artifact)) fail('artifact must be an object');
  if (artifact.artifactType === 'live-run-policy') return validatePolicy(artifact, options);
  if (artifact.artifactType === 'live-run-plan') return validatePlan(artifact, options);
  if (artifact.artifactType === 'live-run-approval') return validateApproval(artifact, options);
  if (artifact.artifactType === 'live-run-result') return validateResult(artifact, options);
  fail(`unsupported artifactType: ${artifact.artifactType ?? 'missing'}`);
}

export function loadRunnerArtifact(file, { root = REPO_ROOT, ...options } = {}) {
  const repositoryPath = path.isAbsolute(file) ? path.relative(root, file).replace(/\\/g, '/') : file.replace(/\\/g, '/');
  assertRepositoryPath(repositoryPath, 'artifact path');
  return validateRunnerArtifact(readJsonFile(root, repositoryPath), options);
}

export function detectManagedAgentEnvironment(env = {}) {
  const matched = MANAGED_ENV_NAMES.filter((name) => Object.hasOwn(env, name));
  return { managed: matched.length > 0, matchedNames: matched };
}

export function sanitizeChildEnvironment(env = {}) {
  const childEnv = {};
  const removedNames = [];
  for (const [name, value] of Object.entries(env)) {
    if (SECRET_ENV_NAME.test(name)) removedNames.push(name);
    else if (['PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TERM', 'LANG'].includes(name)) childEnv[name] = value;
  }
  return { env: childEnv, removedNames: removedNames.sort() };
}

function commandResult(spawnSyncImpl, command, args) {
  const result = spawnSyncImpl(command, args, { shell: false, encoding: 'utf8', windowsHide: true, timeout: 5000 });
  return { ok: !result.error && result.status === 0, stdout: String(result.stdout ?? ''), errorCode: result.error?.code ?? null };
}

export function doctorAgents({ spawnSyncImpl = spawnSync } = {}) {
  const codexVersion = commandResult(spawnSyncImpl, 'codex', ['--version']);
  const codexHelp = codexVersion.ok ? commandResult(spawnSyncImpl, 'codex', ['exec', '--help']) : { ok: false, stdout: '' };
  const help = codexHelp.stdout;
  const requiredFlags = ['exec', '--ephemeral', '--sandbox', '--json'];
  const supportedFlags = requiredFlags.filter((flag) => flag === 'exec' ? codexHelp.ok : help.includes(flag));
  if (help.includes('--output-schema')) supportedFlags.push('--output-schema');
  const codexEligible = codexVersion.ok && requiredFlags.every((flag) => supportedFlags.includes(flag));
  const result = [{ agent: 'codex', installed: codexVersion.ok, version: codexVersion.ok ? codexVersion.stdout.trim().split(/\r?\n/)[0] : null, requiredFlags, supportedFlags, liveExecutionEligible: codexEligible, reason: codexEligible ? 'Codex CLI supports the AI-3B1 required flags; human-shell approval is still required.' : codexVersion.ok ? 'Codex CLI is missing one or more required flags.' : 'Codex CLI is not installed.' }];
  for (const agent of ['claude', 'gemini']) {
    const version = commandResult(spawnSyncImpl, agent, ['--version']);
    result.push({ agent, installed: version.ok, version: version.ok ? version.stdout.trim().split(/\r?\n/)[0] : null, requiredFlags: [], supportedFlags: [], liveExecutionEligible: false, reason: 'provider not enabled in AI-3B1 policy' });
  }
  return result;
}

function validateInput(skill, packet, packetPath) {
  if (skill === 'discuss') {
    if (packet.artifactType !== 'discussion-packet' || !['round-1', 'round-2', 'decision'].includes(packet.round) || packet.execution?.enabled !== false) fail('discuss input must be a disabled discussion packet');
    assertRepositoryPath(packet.outputSchema, 'packet.outputSchema');
    return packet.outputSchema;
  }
  if (packet.artifactType && packet.artifactType !== 'skill-input') fail(`${skill} input must be plain text or a skill-input artifact`);
  return SKILL_CONFIG[skill].defaultSchema;
}

function codexSchemaBinding(skill, canonicalSchema) {
  if (skill === 'discuss') {
    const outputSchema = CODEX_TRANSPORT_SCHEMA_BY_CANONICAL[canonicalSchema];
    if (!outputSchema) fail(`BLOCKED_CODEX_OUTPUT_SCHEMA_INCOMPATIBLE: no Codex transport schema is registered for ${canonicalSchema}`);
    return { outputSchema, canonicalSchema };
  }
  return { outputSchema: canonicalSchema, canonicalSchema };
}

export function buildLiveRunPlan(agent, skill, inputPath, { root = REPO_ROOT, clock = () => new Date(), capabilities, attemptId = 'initial' } = {}) {
  if (agent !== 'codex') fail('only codex may be prepared in AI-3B1');
  if (!SKILLS.includes(skill)) fail('skill is not allowed');
  validateAttemptId(attemptId);
  const policy = validatePolicy(readJsonFile(root, POLICY_PATH), { committed: true });
  if (!policy.allowedSkills.includes(skill)) fail('skill is not allowed by committed policy');
  const packetFile = resolveRepositoryFile(root, inputPath, 'input path');
  let packet;
  const text = readFileSync(packetFile, 'utf8');
  try { packet = JSON.parse(text); } catch { packet = { text }; }
  const canonicalSchema = validateInput(skill, packet, inputPath);
  const { outputSchema } = codexSchemaBinding(skill, canonicalSchema);
  resolveRepositoryFile(root, outputSchema, 'output schema');
  resolveRepositoryFile(root, canonicalSchema, 'canonical schema');
  validateCodexOutputSchemaCompatibility(readJsonFile(root, outputSchema));
  const adapterPath = SKILL_CONFIG[skill].adapter;
  resolveRepositoryFile(root, adapterPath, 'adapter path');
  const packetSha256 = sha256(text);
  const adapterSha256 = sha256File(root, adapterPath);
  const outputSchemaSha256 = sha256File(root, outputSchema);
  const canonicalSchemaSha256 = sha256File(root, canonicalSchema);
  const planId = `live-${sha256(stableJson({ agent, skill, attemptId, packetSha256, adapterSha256, outputSchemaSha256, canonicalSchemaSha256 })).slice(0, 20)}`;
  const supportsOutputSchema = capabilities?.supportedFlags?.includes('--output-schema') ?? false;
  const argv = ['codex', 'exec', '--ephemeral', '--sandbox', 'read-only', '--json'];
  if (supportsOutputSchema) argv.push('--output-schema', outputSchema);
  argv.push('-');
  const plan = {
    schemaVersion: '1.0.0', artifactType: 'live-run-plan', planId, attemptId, createdAt: new Date(clock()).toISOString(), agent, skill, mode: 'read-only-analysis', workingDirectory: '.',
    packetPath: inputPath.replace(/\\/g, '/'), packetSha256, adapterPath, adapterSha256, outputSchema, outputSchemaSha256, canonicalSchema, canonicalSchemaSha256, argv, stdinSource: inputPath.replace(/\\/g, '/'),
    permissions: { ...PERMISSIONS }, limits: { maxRuntimeSeconds: policy.maxRuntimeSeconds, maxOutputBytes: policy.maxOutputBytes },
    execution: { enabled: false, reason: 'Preparation only. A hash-bound human approval and enabled local policy are required from an ordinary shell.' }, planSha256: '0'.repeat(64),
  };
  plan.planSha256 = computePlanHash(plan);
  return validatePlan(plan);
}

function writeLocalJson(root, repositoryDirectory, filename, value) {
  assertRepositoryPath(repositoryDirectory, 'local output directory');
  if (!repositoryDirectory.startsWith('.ai/runtime/local/') && !repositoryDirectory.startsWith('.ai/runs')) fail('runner output must remain in a local-only directory');
  const directory = path.join(root, repositoryDirectory);
  mkdirSync(directory, { recursive: true });
  const output = path.join(directory, filename);
  if (existsSync(output)) fail(`refusing to overwrite ${path.relative(root, output).replace(/\\/g, '/')}`);
  writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path.relative(root, output).replace(/\\/g, '/');
}

function safeLaunchError(error) {
  const code = typeof error?.code === 'string' ? error.code : error?.name === 'Error' ? 'ERROR' : String(error?.name ?? 'ERROR');
  return `${code}: child process could not be started`;
}

export function createApprovalClaim(claim, { root = REPO_ROOT, writeFileSyncImpl = writeFileSync } = {}) {
  exactKeys(claim, ['planId', 'planSha256', 'approvalPath', 'claimedAt', 'attemptId', 'runId'], 'approval claim');
  assertId(claim.planId, 'approval claim.planId'); assertHash(claim.planSha256, 'approval claim.planSha256');
  assertRepositoryPath(claim.approvalPath, 'approval claim.approvalPath'); assertDate(claim.claimedAt, 'approval claim.claimedAt');
  validateAttemptId(claim.attemptId, 'approval claim.attemptId'); assertId(claim.runId, 'approval claim.runId');
  const directory = path.join(root, LOCAL_APPROVAL_CLAIMS_DIR);
  mkdirSync(directory, { recursive: true });
  const output = path.join(directory, `${claim.planId}.json`);
  try {
    writeFileSyncImpl(output, `${JSON.stringify(claim, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') fail('BLOCKED_APPROVAL_ALREADY_CLAIMED');
    throw error;
  }
  return path.relative(root, output).replace(/\\/g, '/');
}

function removeCurrentClaim(root, claimPath) {
  const resolved = path.join(root, claimPath);
  if (existsSync(resolved)) unlinkSync(resolved);
}

function promoteClaimToUsed(root, claimPath, planId) {
  const usedDirectory = path.join(root, LOCAL_USED_APPROVALS_DIR);
  mkdirSync(usedDirectory, { recursive: true });
  const usedPath = path.join(usedDirectory, `${planId}.json`);
  if (existsSync(usedPath)) fail('approval has already been used');
  renameSync(path.join(root, claimPath), usedPath);
  return path.relative(root, usedPath).replace(/\\/g, '/');
}

function writeRunJson(root, runDirectory, filename, value) {
  writeFileSync(path.join(root, runDirectory, filename), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export function prepareLiveRun(agent, skill, inputPath, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const plan = buildLiveRunPlan(agent, skill, inputPath, options);
  const planPath = writeLocalJson(root, LOCAL_PLANS_DIR, `${plan.planId}.json`, plan);
  return { plan, planPath, approvalPhrase: `I APPROVE LIVE RUN ${plan.planId}` };
}

export function buildApproval(plan, phrase, { clock = () => new Date(), ttlMinutes = 15 } = {}) {
  validatePlan(plan);
  if (phrase !== `I APPROVE LIVE RUN ${plan.planId}`) fail('confirmation phrase does not exactly match the plan');
  const approvedAt = new Date(clock());
  const approval = { schemaVersion: '1.0.0', artifactType: 'live-run-approval', planId: plan.planId, planSha256: plan.planSha256, actorRole: 'human', action: 'approve-live-run', confirmationPhrase: phrase, approvedAt: approvedAt.toISOString(), expiresAt: new Date(approvedAt.getTime() + ttlMinutes * 60_000).toISOString() };
  return validateApproval(approval, { plan });
}

export function approveLiveRun(planPath, phrase, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const plan = loadRunnerArtifact(planPath, { root });
  const approval = buildApproval(plan, phrase, options);
  const approvalPath = writeLocalJson(root, LOCAL_APPROVALS_DIR, `${plan.planId}.json`, approval);
  return { approval, approvalPath };
}

export function scanSecretPatterns(text) {
  const patterns = [
    ['pem-private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gi],
    ['github-token', /\b(?:ghp|github_pat)_[A-Za-z0-9_]{16,}\b/g],
    ['google-api-key', /\bAIza[0-9A-Za-z_-]{20,}\b/g],
    ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['bearer-token', /\bBearer\s+[A-Za-z0-9._~+\/-]{16,}/gi],
    ['secret-assignment', /\b(?:password|passwd|secret|api[_-]?key)\s*[:=]\s*[^\s,;]{8,}/gi],
  ];
  const findings = [];
  for (const [type, pattern] of patterns) {
    for (const match of text.matchAll(pattern)) findings.push({ type, masked: `${match[0].slice(0, 4)}…${match[0].slice(-4)}` });
  }
  return findings;
}

function expectedCandidateArtifactType(plan) {
  return { discuss: 'discussion-analysis', understand: 'understanding-guide', 'explain-diff': 'explain-diff' }[plan?.skill] ?? null;
}

export function validateCandidateCanonical(candidate, plan) {
  const errors = [];
  if (!isObject(candidate)) return { valid: false, errors: ['Candidate must be a single JSON object.'] };
  try {
    if (plan.skill === 'discuss') validateDiscussionArtifact(candidate);
    else if (!candidate.artifactType) errors.push('Candidate is not a structured artifact.');
  } catch (error) { errors.push(error.message); }
  return { valid: errors.length === 0, errors };
}

export function validateCandidateIdentity(candidate, plan, packet) {
  if (plan.skill !== 'discuss') return { valid: true, sessionMatch: true, participantMatch: true, roundMatch: true, errors: [] };
  const sessionMatch = candidate?.sessionId === packet.sessionId;
  const participantMatch = candidate?.participant?.participantId === packet.participant?.participantId;
  const expectedRound = { 'round-1': 'independent-analysis', 'round-2': 'cross-review', decision: undefined }[packet.round];
  const roundMatch = packet.round === 'decision' ? candidate?.status === 'proposed' : candidate?.round === expectedRound;
  const errors = [];
  if (!sessionMatch) errors.push('Candidate sessionId does not match the packet.');
  if (!participantMatch) errors.push('Candidate participant does not match the packet.');
  if (!roundMatch) errors.push(packet.round === 'decision' ? 'Decision candidate must remain proposed.' : 'Candidate round does not match the packet.');
  return { valid: errors.length === 0, sessionMatch, participantMatch, roundMatch, errors };
}

function assessCandidate(candidate, plan, packet) {
  if (!isObject(candidate)) return { valid: false, reasons: ['non-object'], canonicalValidation: { valid: false, errors: ['Candidate must be a single JSON object.'] }, identityValidation: { valid: false, sessionMatch: false, participantMatch: false, roundMatch: false, errors: ['Candidate identity cannot be checked.'] } };
  const expectedArtifactType = expectedCandidateArtifactType(plan);
  if (expectedArtifactType && candidate.artifactType !== expectedArtifactType) return { valid: false, reasons: ['unexpected-artifact-type'], canonicalValidation: { valid: false, errors: ['Candidate artifactType is not the expected canonical artifact.'] }, identityValidation: { valid: false, sessionMatch: false, participantMatch: false, roundMatch: false, errors: ['Candidate identity cannot be checked.'] } };
  const canonicalValidation = validateCandidateCanonical(candidate, plan);
  const identityValidation = validateCandidateIdentity(candidate, plan, packet);
  const reasons = [];
  if (!canonicalValidation.valid) reasons.push('canonical-validation-failed');
  if (!identityValidation.valid) reasons.push('identity-validation-failed');
  return { valid: canonicalValidation.valid && identityValidation.valid, reasons, canonicalValidation, identityValidation };
}

function parseJsonl(stdout) {
  return String(stdout ?? '').split(/\r?\n/).filter((line) => line.trim()).map((line, index) => {
    try { return { index, value: JSON.parse(line), validJson: true }; }
    catch { return { index, value: null, validJson: false }; }
  });
}

function directJsonObject(text) {
  if (typeof text !== 'string') return { candidate: null, reason: 'candidate-text-not-string' };
  try {
    const candidate = JSON.parse(text.trim());
    return isObject(candidate) ? { candidate, reason: null } : { candidate: null, reason: 'non-object' };
  } catch { return { candidate: null, reason: 'invalid-json' }; }
}

export function extractCandidateFromCodexJsonl(stdout, { plan, packet } = {}) {
  if (!plan || !packet) fail('candidate extraction requires the bound plan and packet');
  const entries = parseJsonl(stdout);
  const rejectionReasons = [];
  const validCandidates = [];
  let rejectedCandidateCount = entries.filter((entry) => !entry.validJson).length;
  if (rejectedCandidateCount) rejectionReasons.push('invalid-jsonl-line');

  const completedTurnIndex = entries.filter((entry) => entry.validJson && entry.value?.type === 'turn.completed').at(-1)?.index ?? null;
  if (completedTurnIndex !== null) {
    const precedingItems = entries.filter((entry) => entry.validJson && entry.index < completedTurnIndex && entry.value?.item && typeof entry.value.item.type === 'string');
    const lastNonAgentItemIndex = precedingItems.filter((entry) => entry.value.item.type !== 'agent_message').at(-1)?.index ?? -1;
    const agentMessages = precedingItems.filter((entry) => entry.value.type === 'item.completed' && entry.value.item.type === 'agent_message');
    const terminalMessages = agentMessages.filter((entry) => entry.index > lastNonAgentItemIndex);
    for (const entry of agentMessages.filter((item) => item.index <= lastNonAgentItemIndex)) {
      void entry; rejectedCandidateCount += 1; rejectionReasons.push('non-terminal-agent-message');
    }
    for (const entry of terminalMessages) {
      const parsed = directJsonObject(entry.value.item.text);
      if (!parsed.candidate) { rejectedCandidateCount += 1; rejectionReasons.push(parsed.reason); continue; }
      const assessment = assessCandidate(parsed.candidate, plan, packet);
      if (!assessment.valid) { rejectedCandidateCount += 1; rejectionReasons.push(...assessment.reasons); continue; }
      validCandidates.push({ candidate: parsed.candidate, sourceEventType: entry.value.type, sourceItemType: entry.value.item.type, sourceEventIndex: entry.index, sourceField: 'item.text', ...assessment });
    }
  }

  if (validCandidates.length === 0) {
    const legacy = [];
    for (const entry of entries) {
      if (!entry.validJson || !isObject(entry.value) || typeof entry.value.type === 'string') continue;
      if (isObject(entry.value.response)) legacy.push({ candidate: entry.value.response, sourceEventType: 'legacy.response', sourceItemType: null, sourceEventIndex: entry.index, sourceField: 'response' });
      else if (isObject(entry.value.candidate)) legacy.push({ candidate: entry.value.candidate, sourceEventType: 'legacy.candidate', sourceItemType: null, sourceEventIndex: entry.index, sourceField: 'candidate' });
      else if (entry.value.artifactType && !String(entry.value.artifactType).startsWith('live-run-')) legacy.push({ candidate: entry.value, sourceEventType: 'legacy.artifact', sourceItemType: null, sourceEventIndex: entry.index, sourceField: null });
    }
    for (const item of legacy) {
      const assessment = assessCandidate(item.candidate, plan, packet);
      if (!assessment.valid) { rejectedCandidateCount += 1; rejectionReasons.push(...assessment.reasons); continue; }
      validCandidates.push({ ...item, ...assessment });
    }
  }

  if (!validCandidates.length) {
    const sawCandidateSource = rejectionReasons.some((reason) => reason !== 'invalid-jsonl-line' && reason !== 'non-terminal-agent-message');
    return { candidate: null, extractionStatus: sawCandidateSource ? 'invalid' : 'no-final-candidate', sourceEventType: null, sourceItemType: null, sourceEventIndex: null, sourceField: null, candidateCount: 0, rejectedCandidateCount, rejectionReasons: [...new Set(rejectionReasons)].sort(), ambiguous: false, canonicalValidation: { valid: false, errors: ['No valid final Candidate was found.'] }, identityValidation: { valid: false, sessionMatch: false, participantMatch: false, roundMatch: false, errors: ['No valid final Candidate was found.'] } };
  }

  const hashes = new Set(validCandidates.map((item) => sha256(stableJson(item.candidate))));
  const ambiguous = validCandidates.length > 1 && hashes.size > 1;
  if (ambiguous) return { candidate: null, extractionStatus: 'ambiguous', sourceEventType: null, sourceItemType: null, sourceEventIndex: null, sourceField: null, candidateCount: validCandidates.length, rejectedCandidateCount, rejectionReasons: [...new Set(rejectionReasons)].sort(), ambiguous: true, canonicalValidation: { valid: false, errors: ['Multiple conflicting final Candidates were found.'] }, identityValidation: { valid: false, sessionMatch: false, participantMatch: false, roundMatch: false, errors: ['Multiple conflicting final Candidates were found.'] } };
  const selected = validCandidates.at(-1);
  return { candidate: selected.candidate, extractionStatus: 'recovered', sourceEventType: selected.sourceEventType, sourceItemType: selected.sourceItemType, sourceEventIndex: selected.sourceEventIndex, sourceField: selected.sourceField, candidateCount: validCandidates.length, rejectedCandidateCount, rejectionReasons: [...new Set(rejectionReasons)].sort(), ambiguous: false, canonicalValidation: selected.canonicalValidation, identityValidation: selected.identityValidation };
}

export function parseCandidateResponse(stdout, options = {}) {
  if (options.plan && options.packet) return extractCandidateFromCodexJsonl(stdout, options).candidate;
  const parsed = parseJsonl(stdout).filter((entry) => entry.validJson).map((entry) => entry.value);
  for (const value of parsed.reverse()) {
    if (isObject(value?.response)) return value.response;
    if (isObject(value?.candidate)) return value.candidate;
    if (value?.artifactType && !String(value.artifactType).startsWith('live-run-')) return value;
    if (value?.type === 'item.completed' && value.item?.type === 'agent_message') {
      const direct = directJsonObject(value.item.text);
      if (direct.candidate) return direct.candidate;
    }
  }
  return null;
}

export function validateCandidate(candidate, plan, packet) {
  if (!candidate) return { valid: false, errors: ['No structured candidate response was found in stdout.'] };
  const canonical = validateCandidateCanonical(candidate, plan);
  const identity = validateCandidateIdentity(candidate, plan, packet);
  const errors = [...canonical.errors, ...identity.errors];
  return { valid: errors.length === 0, errors };
}

function repositoryPathsFromMetadata(text) {
  const pattern = /(?:^|[^A-Za-z0-9_.-])((?:\.ai|\.agents|scripts|src|e2e|public|firebase|docs?)[\\/][^\s"'|]+?\.(?:mjs|cjs|jsx|js|tsx|ts|json|md|txt))/g;
  const paths = [];
  for (const match of String(text ?? '').matchAll(pattern)) {
    const repositoryPath = match[1].replace(/\\/g, '/');
    try { assertRepositoryPath(repositoryPath, 'transcript repository path metadata'); }
    catch { continue; }
    if (!paths.includes(repositoryPath)) paths.push(repositoryPath);
  }
  return paths;
}

function classifyTranscriptFinding(repositoryPaths) {
  if (repositoryPaths.some((file) => /(?:^|\/)(?:fixtures?|examples?|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[^/]+$/.test(file))) return 'likely-fixture';
  if (repositoryPaths.some((file) => /(?:^|\/)(?:docs?|documentation)(?:\/|$)|\.md$/.test(file))) return 'likely-documentation';
  if (repositoryPaths.some((file) => /\.(?:mjs|cjs|jsx|js|tsx|ts|json)$/.test(file))) return 'likely-code-example';
  return 'unknown';
}

function transcriptReview(findings) {
  const classifications = {};
  for (const finding of findings) classifications[finding.classification] = (classifications[finding.classification] ?? 0) + 1;
  return { status: classifications.unknown ? 'security-review-required' : 'classified', classifications, findings };
}

export function scanTranscriptSecretFindings(stdout, { excludeSourceEventIndex = null, excludeSourceField = null } = {}) {
  const findings = [];
  const entries = String(stdout ?? '').split(/\r?\n/).filter((line) => line.trim());
  const recordText = (text, metadata, fallbackPaths = []) => {
    for (const logicalLine of String(text ?? '').split(/\r?\n/)) {
      const secretTypes = [...new Set(scanSecretPatterns(logicalLine).map((finding) => finding.type))];
      if (!secretTypes.length) continue;
      const repositoryPaths = repositoryPathsFromMetadata(logicalLine);
      const effectivePaths = repositoryPaths.length ? repositoryPaths : fallbackPaths;
      for (const type of secretTypes) findings.push({ type, sourceEventIndex: metadata.sourceEventIndex, sourceEventType: metadata.sourceEventType, sourceItemType: metadata.sourceItemType, sourceField: metadata.sourceField, repositoryPaths: effectivePaths, classification: classifyTranscriptFinding(effectivePaths) });
    }
  };
  entries.forEach((line, sourceEventIndex) => {
    let event;
    try { event = JSON.parse(line); }
    catch { recordText(line, { sourceEventIndex, sourceEventType: '(invalid-json)', sourceItemType: null, sourceField: 'raw-line' }); return; }
    const commandPaths = event?.item?.type === 'command_execution' ? repositoryPathsFromMetadata(event.item.command) : [];
    const walk = (value, sourceField) => {
      if (sourceEventIndex === excludeSourceEventIndex && sourceField === excludeSourceField) return;
      if (typeof value === 'string') { recordText(value, { sourceEventIndex, sourceEventType: event?.type ?? '(missing)', sourceItemType: event?.item?.type ?? null, sourceField }, commandPaths); return; }
      if (Array.isArray(value)) { value.forEach((item, index) => walk(item, `${sourceField}[${index}]`)); return; }
      if (isObject(value)) for (const [key, nested] of Object.entries(value)) walk(nested, sourceField ? `${sourceField}.${key}` : key);
    };
    walk(event, '');
  });
  return findings;
}

const SOURCE_RUN_FILES = Object.freeze(['plan.json', 'approval.json', 'attempt.json', 'stdout.jsonl', 'stderr.txt', 'candidate-response.json', 'result.json']);

function sourceRunSha256s(directory) {
  return Object.fromEntries(SOURCE_RUN_FILES.map((file) => [file, sha256(readFileSync(path.join(directory, file)))]));
}

function sameHashes(left, right) {
  return SOURCE_RUN_FILES.every((file) => left[file] === right[file]);
}

function boundHashStatus(plan, root) {
  const matches = (repositoryPath, expected) => {
    try { return sha256File(root, repositoryPath) === expected; }
    catch { return false; }
  };
  return {
    packet: matches(plan.packetPath, plan.packetSha256),
    adapter: matches(plan.adapterPath, plan.adapterSha256),
    outputSchema: matches(plan.outputSchema, plan.outputSchemaSha256),
    canonicalSchema: plan.canonicalSchema ? matches(plan.canonicalSchema, plan.canonicalSchemaSha256) : null,
  };
}

export function recoverRun(runDirectory, { root = REPO_ROOT, clock = () => new Date() } = {}) {
  const normalizedRunDirectory = String(runDirectory ?? '').replace(/\\/g, '/');
  assertRepositoryPath(normalizedRunDirectory, 'run directory');
  if (!normalizedRunDirectory.startsWith(`${RUNS_DIR}/`)) fail('recover may only read .ai/runs directories');
  const sourceDirectory = path.join(root, normalizedRunDirectory);
  const sourceRunId = path.posix.basename(normalizedRunDirectory);
  const recoveryDirectory = `${LOCAL_RECOVERIES_DIR}/${sourceRunId}`;
  const absoluteRecoveryDirectory = path.join(root, recoveryDirectory);
  if (existsSync(absoluteRecoveryDirectory)) fail('BLOCKED_RECOVERY_ALREADY_EXISTS');

  const initialSha256s = sourceRunSha256s(sourceDirectory);
  const plan = validatePlan(JSON.parse(readFileSync(path.join(sourceDirectory, 'plan.json'), 'utf8')));
  const result = validateResult(JSON.parse(readFileSync(path.join(sourceDirectory, 'result.json'), 'utf8')));
  const attempt = JSON.parse(readFileSync(path.join(sourceDirectory, 'attempt.json'), 'utf8'));
  const approval = JSON.parse(readFileSync(path.join(sourceDirectory, 'approval.json'), 'utf8'));
  const stdout = readFileSync(path.join(sourceDirectory, 'stdout.jsonl'), 'utf8');
  const packet = JSON.parse(readFileSync(resolveRepositoryFile(root, plan.packetPath), 'utf8'));
  const extraction = extractCandidateFromCodexJsonl(stdout, { plan, packet });
  const candidateSecretFindings = extraction.candidate ? [...new Set(scanSecretPatterns(stableJson(extraction.candidate)).map((finding) => finding.type))].sort() : [];
  const transcriptSecretFindings = scanTranscriptSecretFindings(stdout, { excludeSourceEventIndex: extraction.sourceEventIndex, excludeSourceField: extraction.sourceField });
  const transcriptFindingReview = transcriptReview(transcriptSecretFindings);
  const transcriptSecretFindingTypes = [...new Set(transcriptSecretFindings.map((finding) => finding.type))].sort();
  const hashStatus = boundHashStatus(plan, root);
  let approvalIdentity = false;
  try { validateApproval(approval, { plan }); approvalIdentity = true; } catch { /* recorded as ineligible */ }
  const attemptId = planAttemptId(plan);
  const resultIdentity = result.runId === sourceRunId && result.planId === plan.planId && result.planSha256 === plan.planSha256 && (result.attemptId ?? attemptId) === attemptId;
  const attemptIdentity = attempt.runId === sourceRunId && attempt.planId === plan.planId && attempt.planSha256 === plan.planSha256 && (attempt.attemptId ?? attemptId) === attemptId;
  const turnCompleted = parseJsonl(stdout).some((entry) => entry.validJson && entry.value?.type === 'turn.completed');
  const boundHashesValid = Object.values(hashStatus).every((value) => value === true || value === null);
  const securityReviewRequired = transcriptFindingReview.status === 'security-review-required';
  const eligibleForHumanReview = result.exitCode === 0 && !result.timedOut && !result.truncated && result.childStarted !== false && turnCompleted && boundHashesValid && resultIdentity && attemptIdentity && approvalIdentity && extraction.extractionStatus === 'recovered' && !extraction.ambiguous && extraction.canonicalValidation.valid && extraction.identityValidation.valid && candidateSecretFindings.length === 0 && !securityReviewRequired;
  const humanReviewEligibility = eligibleForHumanReview ? 'eligible-for-human-review' : securityReviewRequired ? 'security-review-required' : 'ineligible';
  const finalSha256s = sourceRunSha256s(sourceDirectory);
  if (!sameHashes(initialSha256s, finalSha256s)) fail('BLOCKED_SOURCE_RUN_MUTATED');

  const recoveryResult = {
    schemaVersion: '1.0.0', artifactType: 'live-run-recovery-result', sourceRunDirectory: normalizedRunDirectory, sourceRunId, sourcePlanId: plan.planId, attemptId,
    sourceRunSha256s: initialSha256s, sourceRunImmutable: true, sourceExitCode: result.exitCode, sourceTimedOut: result.timedOut, sourceTruncated: result.truncated, sourceTurnCompleted: turnCompleted,
    boundFileHashStatus: hashStatus, boundHashesValid, resultIdentity, attemptIdentity, approvalIdentity,
    extractionStatus: extraction.extractionStatus, sourceEventType: extraction.sourceEventType, sourceItemType: extraction.sourceItemType, sourceEventIndex: extraction.sourceEventIndex,
    candidateCount: extraction.candidateCount, rejectedCandidateCount: extraction.rejectedCandidateCount, rejectionReasons: extraction.rejectionReasons, ambiguous: extraction.ambiguous,
    transportShapeValid: extraction.extractionStatus === 'recovered', canonicalValidation: extraction.canonicalValidation, identityValidation: extraction.identityValidation,
    candidateSecretFindings, transcriptSecretFindingTypes, transcriptFindingReview,
    eligibleForHumanReview, humanReviewEligibility, automaticIngest: false, recoveredAt: new Date(clock()).toISOString(),
  };
  mkdirSync(path.dirname(absoluteRecoveryDirectory), { recursive: true });
  mkdirSync(absoluteRecoveryDirectory);
  writeFileSync(path.join(absoluteRecoveryDirectory, 'candidate-response.json'), `${JSON.stringify(extraction.candidate, null, 2)}\n`, 'utf8');
  writeFileSync(path.join(absoluteRecoveryDirectory, 'recovery-result.json'), `${JSON.stringify(recoveryResult, null, 2)}\n`, 'utf8');
  return { recoveryDirectory, result: recoveryResult };
}

export function runChildProcess(argv, stdin, limits, { spawnImpl = spawn, cwd = REPO_ROOT, env = process.env, clock = () => new Date(), onSpawn } = {}) {
  return new Promise((resolve) => {
    const sanitized = sanitizeChildEnvironment(env);
    let child;
    try { child = spawnImpl(argv[0], argv.slice(1), { cwd, shell: false, env: sanitized.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { resolve({ exitCode: -1, timedOut: false, truncated: false, stdout: '', stderr: safeLaunchError(error), removedEnvironmentNames: sanitized.removedNames, spawned: false, spawnedAt: null, spawnError: safeLaunchError(error) }); return; }
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let timedOut = false; let truncated = false; let settled = false; let spawned = false; let spawnedAt = null; let spawnError = null; let timer;
    const finish = (exitCode) => { if (settled) return; settled = true; clearTimeout(timer); resolve({ exitCode: Number.isInteger(exitCode) ? exitCode : -1, timedOut, truncated, stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8'), removedEnvironmentNames: sanitized.removedNames, spawned, spawnedAt, spawnError }); };
    const collect = (kind) => (chunk) => {
      const data = Buffer.from(chunk); const current = kind === 'stdout' ? stdout : stderr;
      const remaining = limits.maxOutputBytes - current.length;
      const next = remaining > 0 ? Buffer.concat([current, data.subarray(0, remaining)]) : current;
      if (kind === 'stdout') stdout = next; else stderr = next;
      if (data.length > remaining) { truncated = true; child.kill(); }
    };
    child.stdout.on('data', collect('stdout')); child.stderr.on('data', collect('stderr'));
    child.on('spawn', () => {
      spawned = true; spawnedAt = new Date(clock()).toISOString();
      try { onSpawn?.(spawnedAt); } catch (error) { spawnError = safeLaunchError(error); child.kill(); }
    });
    child.on('error', (error) => { spawnError = safeLaunchError(error); finish(-1); }); child.on('close', finish);
    timer = setTimeout(() => { timedOut = true; child.kill(); }, limits.maxRuntimeSeconds * 1000);
    child.stdin.end(stdin);
  });
}

function gitStatus(root, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, shell: false, encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) fail('unable to inspect Git worktree status');
  return String(result.stdout ?? '').split(/\r?\n/).filter(Boolean);
}

export function assertLiveWorktreeClean(lines, allowedUntrackedPaths = ['.ai/runtime/local/', '.ai/runs/']) {
  for (const line of lines) {
    const status = line.slice(0, 2); const file = line.slice(3).replace(/\\/g, '/');
    if (status !== '??') fail('BLOCKED_LIVE_RUN_DIRTY_TRACKED_WORKTREE');
    if (!allowedUntrackedPaths.some((prefix) => file.startsWith(prefix))) fail('BLOCKED_LIVE_RUN_UNKNOWN_UNTRACKED_FILE');
  }
}

export function validateBoundFiles(plan, { root = REPO_ROOT } = {}) {
  if (sha256File(root, plan.packetPath) !== plan.packetSha256) fail('packet hash changed after plan preparation');
  if (sha256File(root, plan.adapterPath) !== plan.adapterSha256) fail('adapter hash changed after plan preparation');
  if (sha256File(root, plan.outputSchema) !== plan.outputSchemaSha256) fail('output schema hash changed after plan preparation');
  validateCodexOutputSchemaCompatibility(readJsonFile(root, plan.outputSchema));
  if (plan.canonicalSchema && sha256File(root, plan.canonicalSchema) !== plan.canonicalSchemaSha256) fail('canonical schema hash changed after plan preparation');
}

export async function executeLiveRun(planPath, approvalPath, options = {}) {
  const root = options.root ?? REPO_ROOT;
  const nested = detectManagedAgentEnvironment(options.env ?? process.env);
  if (nested.managed) fail(`BLOCKED_NESTED_AGENT_EXECUTION (${nested.matchedNames.join(', ')})`);
  validatePolicy(readJsonFile(root, POLICY_PATH), { committed: true });
  const localPolicy = validatePolicy(readJsonFile(root, options.localPolicyPath ?? LOCAL_POLICY_PATH), { requireEnabled: true });
  const plan = loadRunnerArtifact(planPath, { root });
  const approval = loadRunnerArtifact(approvalPath, { root });
  validateApproval(approval, { plan, now: options.clock ? options.clock() : new Date() });
  if (!localPolicy.allowedAgents.includes(plan.agent) || !localPolicy.allowedSkills.includes(plan.skill)) fail('plan is not allowed by local policy');
  validateBoundFiles(plan, { root });
  const usedPath = `${LOCAL_USED_APPROVALS_DIR}/${plan.planId}.json`;
  if (existsSync(path.join(root, usedPath))) fail('approval has already been used');
  const capabilities = (options.doctor ?? doctorAgents)({ spawnSyncImpl: options.spawnSyncImpl }).find((item) => item.agent === plan.agent);
  if (!capabilities?.liveExecutionEligible) fail('Agent CLI is not live-execution eligible');
  assertLiveWorktreeClean(options.gitStatusLines ?? gitStatus(root, options.spawnSyncImpl), localPolicy.allowedUntrackedPaths);
  const packetText = readFileSync(resolveRepositoryFile(root, plan.stdinSource), 'utf8');
  const startedAt = new Date(options.clock ? options.clock() : new Date());
  const runId = `run-${sha256(`${plan.planSha256}:${startedAt.toISOString()}`).slice(0, 20)}`;
  const runDir = `${RUNS_DIR}/${runId}`;
  const attemptId = planAttemptId(plan);
  const claimedAt = startedAt.toISOString();
  const approvalRepositoryPath = path.isAbsolute(approvalPath) ? path.relative(root, approvalPath).replace(/\\/g, '/') : approvalPath.replace(/\\/g, '/');
  const claim = { planId: plan.planId, planSha256: plan.planSha256, approvalPath: approvalRepositoryPath, claimedAt, attemptId, runId };
  const claimPath = createApprovalClaim(claim, { root, writeFileSyncImpl: options.writeFileSyncImpl });
  if (existsSync(path.join(root, usedPath))) { removeCurrentClaim(root, claimPath); fail('approval has already been used'); }
  const initialAttempt = { schemaVersion: '1.0.0', artifactType: 'live-run-attempt', runId, planId: plan.planId, planSha256: plan.planSha256, attemptId, claimedAt, childStarted: false, status: 'claimed' };
  try {
    mkdirSync(path.join(root, RUNS_DIR), { recursive: true });
    mkdirSync(path.join(root, runDir));
    writeRunJson(root, runDir, 'plan.json', plan);
    writeRunJson(root, runDir, 'approval.json', approval);
    writeRunJson(root, runDir, 'attempt.json', initialAttempt);
  } catch (error) {
    removeCurrentClaim(root, claimPath);
    throw error;
  }

  let childStarted = false; let approvalConsumed = false; let spawnedAt = null; let lifecycleError = null;
  const markSpawned = (value) => {
    if (childStarted && approvalConsumed) return;
    childStarted = true; approvalConsumed = true; spawnedAt = value ?? new Date(options.clock ? options.clock() : new Date()).toISOString();
    writeRunJson(root, runDir, 'attempt.json', { ...initialAttempt, childStarted: true, status: 'running', spawnedAt });
    promoteClaimToUsed(root, claimPath, plan.planId);
  };
  let processResult;
  try {
    processResult = await (options.runProcess ?? runChildProcess)(plan.argv, packetText, plan.limits, { spawnImpl: options.spawnImpl, cwd: root, env: options.env ?? process.env, clock: options.clock, onSpawn: markSpawned });
  } catch (error) {
    processResult = { exitCode: -1, timedOut: false, truncated: false, stdout: '', stderr: safeLaunchError(error), removedEnvironmentNames: [], spawned: childStarted, spawnedAt, spawnError: safeLaunchError(error) };
  }
  if (processResult?.spawned && !childStarted) {
    try { markSpawned(processResult.spawnedAt); } catch (error) { lifecycleError = safeLaunchError(error); childStarted = true; approvalConsumed = true; spawnedAt = processResult.spawnedAt; }
  }
  if (!childStarted) removeCurrentClaim(root, claimPath);

  const stdout = String(processResult?.stdout ?? '');
  const stderr = String(processResult?.stderr ?? processResult?.spawnError ?? lifecycleError ?? '');
  const exitCode = childStarted && Number.isInteger(processResult?.exitCode) ? processResult.exitCode : -1;
  const timedOut = childStarted ? Boolean(processResult?.timedOut) : false;
  const truncated = childStarted ? Boolean(processResult?.truncated) : false;
  let packet;
  try { packet = JSON.parse(packetText); } catch { packet = { text: packetText }; }
  const extraction = childStarted ? extractCandidateFromCodexJsonl(stdout, { plan, packet }) : null;
  const candidate = extraction?.candidate ?? null;
  const validation = !childStarted
    ? { valid: false, errors: ['Child process did not start.'] }
    : exitCode === 0 && !timedOut && !truncated
      ? validateCandidate(candidate, plan, packet)
      : { valid: false, errors: ['Process did not complete successfully within limits.'] };
  if (lifecycleError) { validation.valid = false; validation.errors.push('Approval lifecycle transition failed after child start.'); }
  const findings = scanSecretPatterns(stdout);
  const completedAt = new Date(options.clock ? options.clock() : new Date()).toISOString();
  const launchStatus = childStarted ? 'started' : 'not-started';
  writeFileSync(path.join(root, runDir, 'stdout.jsonl'), stdout, 'utf8');
  writeFileSync(path.join(root, runDir, 'stderr.txt'), stderr, 'utf8');
  writeRunJson(root, runDir, 'candidate-response.json', candidate);
  const relative = (name) => `${runDir}/${name}`;
  const result = validateResult({ schemaVersion: '1.0.0', artifactType: 'live-run-result', runId, planId: plan.planId, planSha256: plan.planSha256, attemptId, agent: plan.agent, skill: plan.skill, startedAt: claimedAt, completedAt, launchStatus, childStarted, approvalConsumed, exitCode, timedOut, truncated, stdoutFormat: 'jsonl', rawOutputPath: relative('stdout.jsonl'), validatedResponsePath: relative('candidate-response.json'), validation, security: { reviewRequired: findings.length > 0, findings, removedEnvironmentNames: processResult?.removedEnvironmentNames ?? [] }, importStatus: 'not-reviewed' });
  writeRunJson(root, runDir, 'result.json', result);
  writeRunJson(root, runDir, 'attempt.json', { ...initialAttempt, childStarted, status: childStarted ? 'completed' : 'launch-failed', spawnedAt, completedAt, launchStatus, approvalConsumed, exitCode, timedOut, truncated, spawnError: processResult?.spawnError ?? lifecycleError ?? null });
  return { runDirectory: runDir, result };
}

export function inspectRun(runDirectory, { root = REPO_ROOT } = {}) {
  assertRepositoryPath(runDirectory, 'run directory');
  if (!runDirectory.startsWith('.ai/runs/')) fail('inspect may only read .ai/runs directories');
  const directory = path.join(root, runDirectory);
  const plan = validatePlan(JSON.parse(readFileSync(path.join(directory, 'plan.json'), 'utf8')));
  const result = validateResult(JSON.parse(readFileSync(path.join(directory, 'result.json'), 'utf8')));
  let candidate = null; try { candidate = JSON.parse(readFileSync(path.join(directory, 'candidate-response.json'), 'utf8')); } catch { /* represented as an invalid candidate below */ }
  let packet; const packetText = readFileSync(resolveRepositoryFile(root, plan.packetPath), 'utf8'); try { packet = JSON.parse(packetText); } catch { packet = { text: packetText }; }
  const hashStatus = {
    packet: sha256File(root, plan.packetPath) === plan.packetSha256,
    adapter: sha256File(root, plan.adapterPath) === plan.adapterSha256,
    outputSchema: sha256File(root, plan.outputSchema) === plan.outputSchemaSha256,
    canonicalSchema: plan.canonicalSchema ? sha256File(root, plan.canonicalSchema) === plan.canonicalSchemaSha256 : null,
  };
  const sessionMatch = plan.skill !== 'discuss' || candidate?.sessionId === packet.sessionId;
  const participantMatch = plan.skill !== 'discuss' || candidate?.participant?.participantId === packet.participant?.participantId;
  const roundMatch = plan.skill !== 'discuss' || (packet.round === 'decision' ? candidate?.status === 'proposed' : candidate?.round === (packet.round === 'round-1' ? 'independent-analysis' : 'cross-review'));
  let approvalIdentity = false;
  try { const approval = JSON.parse(readFileSync(path.join(directory, 'approval.json'), 'utf8')); validateApproval(approval, { plan }); approvalIdentity = true; } catch { /* a failed identity check makes the run ineligible */ }
  const attemptId = planAttemptId(plan);
  const childStarted = result.childStarted ?? result.exitCode !== -1;
  const launchStatus = result.launchStatus ?? (childStarted ? 'started' : 'not-started');
  const approvalConsumed = result.approvalConsumed ?? childStarted;
  const resultIdentity = result.planId === plan.planId && result.planSha256 === plan.planSha256 && (result.attemptId ?? attemptId) === attemptId;
  let currentValidation; try { currentValidation = validateCandidate(candidate, plan, packet); } catch (error) { currentValidation = { valid: false, errors: [error.message] }; }
  const eligible = launchStatus === 'started' && childStarted && approvalConsumed && resultIdentity && approvalIdentity && Object.values(hashStatus).every(Boolean) && result.exitCode === 0 && !result.timedOut && !result.truncated && result.validation.valid && currentValidation.valid && sessionMatch && participantMatch && roundMatch && result.security.findings.length === 0 && result.importStatus !== 'rejected';
  const recommendedNextAction = eligible ? 'human-review-required' : childStarted || approvalConsumed ? 'prepare-new-attempt' : 'human-may-retry-approved-plan';
  return { planIdentity: { planId: plan.planId, attemptId, planSha256: plan.planSha256 }, agent: plan.agent, skill: plan.skill, launchStatus, childStarted, approvalConsumed, boundFileHashStatus: hashStatus, packetHashStatus: hashStatus.packet, exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated, validation: result.validation, candidateResponseValidation: result.validation, currentCandidateValidation: currentValidation, secretPatternScan: result.security.findings, importEligibility: eligible ? 'eligible-for-human-review' : 'ineligible', automaticIngest: false, recommendedNextAction, humanReviewChecklist: ['Confirm the response matches the requested round and participant.', 'Review every security finding without reproducing secret-like content.', 'Verify repository evidence and unresolved assumptions.', 'Run discussion ingest separately only after human acceptance.'] };
}

function collectErrorDetails(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return { messages: [], codes: [], types: [] };
  if (typeof value === 'string') {
    try { return collectErrorDetails(JSON.parse(value), depth + 1); }
    catch { return { messages: [value], codes: [], types: [] }; }
  }
  if (!isObject(value)) return { messages: [], codes: [], types: [] };
  const details = { messages: [], codes: [], types: [] };
  if (typeof value.code === 'string') details.codes.push(value.code);
  if (typeof value.type === 'string') details.types.push(value.type);
  for (const nested of [value.message, value.error]) {
    const collected = collectErrorDetails(nested, depth + 1);
    details.messages.push(...collected.messages); details.codes.push(...collected.codes); details.types.push(...collected.types);
  }
  return details;
}

function diagnosticSecretTypes(text) { return scanSecretPatterns(String(text ?? '')).map((finding) => finding.type); }

function safeDiagnosticSummary(message, secretTypes) {
  const before = diagnosticSecretTypes(message);
  before.forEach((type) => secretTypes.add(type));
  if (before.length) return null;
  let safe = String(message).replace(/[\r\n\t]+/g, ' ').trim();
  safe = safe.replace(/Authorization\s*:\s*\S+/gi, 'Authorization: [redacted]');
  safe = safe.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  safe = safe.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-account]');
  safe = safe.replace(/(?:[A-Z]:\\|\/Users\/|\/home\/)[^\s]+/gi, '[redacted-path]');
  safe = safe.replace(/\b[A-Za-z0-9._~-]{24,}\b/g, '[redacted-id]');
  if (safe.length > 300) safe = safe.slice(0, 300);
  const after = diagnosticSecretTypes(safe);
  after.forEach((type) => secretTypes.add(type));
  return after.length ? null : safe;
}

function classifyRunFailure(evidenceText) {
  const text = evidenceText.toLowerCase();
  if (/invalid_json_schema|invalid schema|response_format|output.?schema|schema must/.test(text)) return { rootCauseCategory: 'OUTPUT_SCHEMA_REJECTED', confidence: 'high', retryWithoutCodeChange: false, humanActionRequired: false, recommendedNextAction: 'repair-runner-before-retry' };
  if (/authentication|unauthori|invalid_api_key|login required|not logged in|sign.?in/.test(text)) return { rootCauseCategory: 'CODEX_AUTHENTICATION_FAILURE', confidence: 'high', retryWithoutCodeChange: false, humanActionRequired: true, recommendedNextAction: 'reauthenticate-codex' };
  if (/quota|rate.?limit|too many requests|\b429\b/.test(text)) return { rootCauseCategory: 'CODEX_QUOTA_OR_RATE_LIMIT', confidence: 'high', retryWithoutCodeChange: true, humanActionRequired: true, recommendedNextAction: 'wait-and-retry-later' };
  if (/repository_error|not (?:a )?trusted (?:git )?repository|repository.{0,24}trust|safe\.directory|git repository check/.test(text)) return { rootCauseCategory: 'CODEX_REPOSITORY_TRUST_FAILURE', confidence: 'high', retryWithoutCodeChange: false, humanActionRequired: true, recommendedNextAction: 'repair-local-environment' };
  if (/missing environment|environment variable|not found in path|\benoent\b/.test(text)) return { rootCauseCategory: 'SANITIZED_ENVIRONMENT_INCOMPLETE', confidence: 'medium', retryWithoutCodeChange: false, humanActionRequired: false, recommendedNextAction: 'repair-runner-before-retry' };
  if (/config\.toml|configuration error|invalid config|model is not configured|unknown model/.test(text)) return { rootCauseCategory: 'CODEX_CONFIGURATION_FAILURE', confidence: 'high', retryWithoutCodeChange: false, humanActionRequired: true, recommendedNextAction: 'repair-local-environment' };
  if (/unknown (?:argument|option)|unexpected argument|invalid value for/.test(text)) return { rootCauseCategory: 'RUNNER_ARGV_INVALID', confidence: 'high', retryWithoutCodeChange: false, humanActionRequired: false, recommendedNextAction: 'repair-runner-before-retry' };
  if (/stdin packet|invalid packet|prompt is required|no prompt/.test(text)) return { rootCauseCategory: 'STDIN_PACKET_INVALID', confidence: 'medium', retryWithoutCodeChange: false, humanActionRequired: false, recommendedNextAction: 'repair-runner-before-retry' };
  if (/service unavailable|temporar(?:y|ily)|upstream|provider|connection reset|network error|stream error|\b503\b/.test(text)) return { rootCauseCategory: 'CODEX_PROVIDER_TRANSIENT_FAILURE', confidence: 'medium', retryWithoutCodeChange: true, humanActionRequired: false, recommendedNextAction: 'wait-and-retry-later' };
  if (/internal error|internal failure|panic|fatal runtime/.test(text)) return { rootCauseCategory: 'CODEX_CLI_INTERNAL_FAILURE', confidence: 'medium', retryWithoutCodeChange: false, humanActionRequired: true, recommendedNextAction: 'investigate-manually' };
  return { rootCauseCategory: 'UNKNOWN_EXIT1', confidence: 'low', retryWithoutCodeChange: false, humanActionRequired: true, recommendedNextAction: 'investigate-manually' };
}

export function diagnoseRun(runDirectory, { root = REPO_ROOT } = {}) {
  assertRepositoryPath(runDirectory, 'run directory');
  if (!runDirectory.startsWith('.ai/runs/')) fail('diagnose may only read .ai/runs directories');
  const directory = path.join(root, runDirectory);
  const plan = validatePlan(JSON.parse(readFileSync(path.join(directory, 'plan.json'), 'utf8')));
  const result = validateResult(JSON.parse(readFileSync(path.join(directory, 'result.json'), 'utf8')));
  const stdout = readFileSync(path.join(directory, 'stdout.jsonl'), 'utf8');
  const stderr = readFileSync(path.join(directory, 'stderr.txt'), 'utf8');
  let candidate; let candidateParsed = true;
  try { candidate = JSON.parse(readFileSync(path.join(directory, 'candidate-response.json'), 'utf8')); }
  catch { candidate = null; candidateParsed = false; }
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim());
  const eventTypeCounts = new Map(); const errorEventTypes = new Set(); const errorCodes = new Set(); const errorTypes = new Set(); const rawMessages = [];
  let parsedEventCount = 0; let invalidLineCount = 0; let errorEventCount = 0; let threadOrSessionCreated = false; let turnStarted = false; let turnCompleted = false; let turnFailed = false;
  for (const line of lines) {
    let event;
    try { event = JSON.parse(line); parsedEventCount += 1; }
    catch { invalidLineCount += 1; continue; }
    const eventType = typeof event?.type === 'string' ? event.type : '(missing)';
    eventTypeCounts.set(eventType, (eventTypeCounts.get(eventType) ?? 0) + 1);
    if (/^(?:thread|session)\.started$/.test(eventType)) threadOrSessionCreated = true;
    if (eventType === 'turn.started') turnStarted = true;
    if (eventType === 'turn.completed') turnCompleted = true;
    if (eventType === 'turn.failed') turnFailed = true;
    if (eventType === 'error' || /(?:error|failed)$/.test(eventType)) {
      errorEventCount += 1; errorEventTypes.add(eventType);
      const details = collectErrorDetails(event);
      details.messages.forEach((message) => rawMessages.push(message));
      details.codes.forEach((code) => errorCodes.add(code));
      details.types.forEach((type) => errorTypes.add(type));
    }
  }
  const transcriptSecretFindings = scanTranscriptSecretFindings(stdout);
  const stderrSecretTypes = diagnosticSecretTypes(stderr);
  const secretTypes = new Set([...transcriptSecretFindings.map((finding) => finding.type), ...stderrSecretTypes]);
  const transcriptFindingReview = transcriptReview(transcriptSecretFindings);
  const safeErrorSummaries = [];
  for (const message of rawMessages) {
    const summary = safeDiagnosticSummary(message, secretTypes);
    if (summary && !safeErrorSummaries.includes(summary)) safeErrorSummaries.push(summary);
  }
  const evidenceText = [...errorCodes, ...errorTypes, ...rawMessages].join(' ');
  const candidateStatus = !candidateParsed ? 'invalid' : candidate === null ? 'null' : result.validation.valid ? 'valid' : 'invalid';
  const candidateExtractionFailed = result.exitCode === 0 && turnCompleted && !turnFailed && errorEventCount === 0 && candidateStatus === 'null';
  const classification = candidateExtractionFailed
    ? { rootCauseCategory: 'CANDIDATE_EXTRACTION_FAILED', confidence: 'high', retryWithoutCodeChange: false, humanActionRequired: false, recommendedNextAction: 'recover-existing-run' }
    : classifyRunFailure(evidenceText);
  const attemptId = planAttemptId(plan);
  const childStarted = result.childStarted ?? result.exitCode !== -1;
  const launchStatus = result.launchStatus ?? (childStarted ? 'started' : 'not-started');
  let recommendedNextAction = classification.recommendedNextAction;
  if (transcriptFindingReview.status === 'security-review-required' || stderrSecretTypes.length) recommendedNextAction = 'security-review-required';
  else if (candidateStatus === 'valid' && childStarted && result.exitCode === 0 && !result.timedOut && !result.truncated && result.validation.valid) recommendedNextAction = 'human-review-existing-candidate';
  const safeFailureSummary = safeErrorSummaries[0] ?? (result.exitCode === 0 ? 'Run completed without a diagnostic error event.' : `Run exited with code ${result.exitCode}; no safe structured error message was available.`);
  return {
    runDirectory, runId: result.runId, planId: plan.planId, attemptId, launchStatus, childStarted, exitCode: result.exitCode, timedOut: result.timedOut, truncated: result.truncated,
    stdoutBytes: Buffer.byteLength(stdout), stderrBytes: Buffer.byteLength(stderr), jsonlLineCount: lines.length, parsedEventCount, invalidLineCount,
    eventTypeCounts: Object.fromEntries([...eventTypeCounts].sort(([left], [right]) => left.localeCompare(right))), errorEventCount,
    supportingEventTypes: [...errorEventTypes].sort(), errorCodes: [...errorCodes].sort(), safeErrorSummaries, safeFailureSummary,
    secretFindingTypes: [...secretTypes].sort(), transcriptSecretFindingTypes: [...new Set(transcriptSecretFindings.map((finding) => finding.type))].sort(), transcriptFindingReview,
    threadOrSessionCreated, turnStarted, turnCompleted, turnFailed, candidateStatus,
    rootCauseCategory: classification.rootCauseCategory, confidence: classification.confidence, retryWithoutCodeChange: classification.retryWithoutCodeChange,
    humanActionRequired: classification.humanActionRequired, recommendedNextAction, automaticPrepare: false, automaticApproval: false, automaticExecute: false, automaticIngest: false,
  };
}

function readJsonIfPresent(file) {
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return null; }
}

export function statusLiveRunPlan(planPath, { root = REPO_ROOT, now = () => new Date() } = {}) {
  const plan = loadRunnerArtifact(planPath, { root });
  const attemptId = planAttemptId(plan);
  const approvalFile = path.join(root, LOCAL_APPROVALS_DIR, `${plan.planId}.json`);
  const usedFile = path.join(root, LOCAL_USED_APPROVALS_DIR, `${plan.planId}.json`);
  const claimFile = path.join(root, LOCAL_APPROVAL_CLAIMS_DIR, `${plan.planId}.json`);
  const approval = readJsonIfPresent(approvalFile);
  const approvalExists = existsSync(approvalFile);
  const approvalExpiresAt = typeof approval?.expiresAt === 'string' ? approval.expiresAt : null;
  const approvalExpired = approvalExpiresAt !== null && Date.parse(approvalExpiresAt) <= new Date(now()).getTime();
  const matchingRuns = [];
  const runsDirectory = path.join(root, RUNS_DIR);
  if (existsSync(runsDirectory)) {
    for (const name of readdirSync(runsDirectory).sort()) {
      const directory = path.join(runsDirectory, name);
      let stat; try { stat = lstatSync(directory); } catch { continue; }
      if (!stat.isDirectory() || stat.isSymbolicLink()) continue;
      const runPlan = readJsonIfPresent(path.join(directory, 'plan.json'));
      const runResult = readJsonIfPresent(path.join(directory, 'result.json'));
      const matches = (runPlan?.planId === plan.planId && runPlan?.planSha256 === plan.planSha256) || (runResult?.planId === plan.planId && runResult?.planSha256 === plan.planSha256);
      if (!matches) continue;
      const required = ['plan.json', 'approval.json', 'stdout.jsonl', 'stderr.txt', 'candidate-response.json', 'result.json'];
      const complete = runResult !== null && required.every((file) => existsSync(path.join(directory, file)));
      matchingRuns.push({ runId: runResult?.runId ?? name, path: `${RUNS_DIR}/${name}`, complete, startedAt: runResult?.startedAt ?? null, completedAt: runResult?.completedAt ?? null, exitCode: Number.isInteger(runResult?.exitCode) ? runResult.exitCode : null, validationValid: typeof runResult?.validation?.valid === 'boolean' ? runResult.validation.valid : null });
    }
  }
  const completeRuns = matchingRuns.filter((run) => run.complete);
  const incompleteRuns = matchingRuns.filter((run) => !run.complete);
  const approvalUsed = existsSync(usedFile);
  const claimExists = existsSync(claimFile);
  const legacyOrphanedUsedMarker = approvalUsed && completeRuns.length === 0;
  let recommendedNextAction;
  if (completeRuns.length) recommendedNextAction = 'inspect-existing-run';
  else if (claimExists) recommendedNextAction = 'wait-for-running-attempt';
  else if (incompleteRuns.length) recommendedNextAction = 'investigate-incomplete-run';
  else if (approvalUsed) recommendedNextAction = 'prepare-new-attempt';
  else if (!approvalExists) recommendedNextAction = 'create-approval';
  else if (approvalExpired) recommendedNextAction = 'approval-expired';
  else recommendedNextAction = 'execute-approved-plan';
  return { planId: plan.planId, attemptId, planSha256: plan.planSha256, approvalExists, approvalExpiresAt, approvalUsed, claimExists, matchingRuns, completeRuns, incompleteRuns, legacyOrphanedUsedMarker, recommendedNextAction };
}

export function runnerArtifactFiles({ root = REPO_ROOT } = {}) {
  const files = [POLICY_PATH];
  const examples = path.join(root, '.ai/runtime/examples');
  if (existsSync(examples)) for (const name of readdirSync(examples).filter((item) => item.endsWith('.json')).sort()) files.push(`.ai/runtime/examples/${name}`);
  return files;
}

export function validateAllRunnerArtifacts({ root = REPO_ROOT } = {}) {
  const files = runnerArtifactFiles({ root });
  for (const file of files) loadRunnerArtifact(file, { root, committed: file === POLICY_PATH });
  return files;
}

export function checkRunner({ root = REPO_ROOT } = {}) {
  for (const schema of Object.values(SCHEMA_FILES)) JSON.parse(readFileSync(resolveRepositoryFile(root, schema), 'utf8'));
  for (const schema of CODEX_OUTPUT_SCHEMA_FILES) validateCodexOutputSchemaCompatibility(readJsonFile(root, schema));
  const files = validateAllRunnerArtifacts({ root });
  const policy = loadRunnerArtifact(POLICY_PATH, { root, committed: true });
  if (policy.executionEnabled !== false) fail('committed policy is enabled');
  return { files, policy };
}
