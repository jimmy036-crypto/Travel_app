import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const MANIFEST_PATH = '.ai/adapters/adapter-manifest.json';
export const INVOCATION_SCHEMA_PATH = '.ai/schemas/agent-invocation.schema.json';
export const INVOCATION_EXAMPLES_DIR = '.ai/invocations/examples';

const AGENTS = ['codex', 'claude', 'gemini'];
const SKILLS = ['understand', 'explain-diff'];
const PERMISSIONS = Object.freeze({
  filesystem: 'read-only',
  network: false,
  productionFirebase: false,
  gitWrite: false,
  deploy: false,
});
const SKILL_CONFIG = Object.freeze({
  understand: {
    canonical: '.ai/skills/understand/SKILL.md',
    schema: '.ai/schemas/understanding-guide.schema.json',
  },
  'explain-diff': {
    canonical: '.ai/skills/explain-diff/SKILL.md',
    schema: '.ai/schemas/explain-diff.schema.json',
  },
});
const ADAPTER_PATHS = Object.freeze({
  codex: {
    understand: '.agents/skills/understand/SKILL.md',
    'explain-diff': '.agents/skills/explain-diff/SKILL.md',
  },
  claude: {
    understand: '.claude/skills/understand/SKILL.md',
    'explain-diff': '.claude/skills/explain-diff/SKILL.md',
  },
  gemini: {
    understand: '.agents/skills/understand/SKILL.md',
    'explain-diff': '.agents/skills/explain-diff/SKILL.md',
  },
});

export class AdapterValidationError extends Error {
  constructor(errors) {
    const list = Array.isArray(errors) ? errors : [errors];
    super(`Agent adapter validation failed:\n- ${list.join('\n- ')}`);
    this.name = 'AdapterValidationError';
    this.errors = list;
  }
}

function fail(message) {
  throw new AdapterValidationError(message);
}

function exactKeys(value, expected, location) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${location} must be an object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${location} keys must be exactly: ${wanted.join(', ')}`);
  }
}

function readJson(root, repositoryPath) {
  try {
    return JSON.parse(readFileSync(path.join(root, repositoryPath), 'utf8'));
  } catch (error) {
    fail(`${repositoryPath} is not valid JSON: ${error.message}`);
  }
}

export function assertRepositoryPath(value, location = 'path') {
  if (typeof value !== 'string' || !value.trim()) fail(`${location} must be a non-empty repository-relative path`);
  if (value.includes('\0') || value.includes('\\')) fail(`${location} contains a forbidden character`);
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) fail(`${location} must not be absolute`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) fail(`${location} must not use a URL or file scheme`);
  if (value.split('/').includes('..')) fail(`${location} must not traverse outside the repository`);
  return value;
}

export function assertRegularFile(root, repositoryPath, location = repositoryPath) {
  assertRepositoryPath(repositoryPath, location);
  let stat;
  try {
    stat = lstatSync(path.join(root, repositoryPath));
  } catch {
    fail(`${location} is missing`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`${location} must be a regular file`);
}

export function sha256File(root, repositoryPath) {
  assertRegularFile(root, repositoryPath);
  return createHash('sha256').update(readFileSync(path.join(root, repositoryPath))).digest('hex');
}

export function parseFrontmatter(content, location = 'adapter') {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) fail(`${location} must start with YAML frontmatter`);
  const metadata = {};
  const lines = match[1].split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines) {
    const separator = line.indexOf(':');
    if (separator < 1) fail(`${location} has invalid frontmatter`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (Object.hasOwn(metadata, key)) fail(`${location} repeats frontmatter key ${key}`);
    metadata[key] = value;
  }
  if (lines[0]?.split(':')[0].trim() !== 'name') fail(`${location} frontmatter must start with name`);
  return metadata;
}

function nonEmptyLineCount(content) {
  return content.split(/\r?\n/).filter((line) => line.trim()).length;
}

function normalizedLines(content) {
  return content.split(/\r?\n/)
    .map((line) => line.trim().toLowerCase().replace(/[`*_]/g, '').replace(/\s+/g, ' '))
    .filter((line) => line.length >= 24);
}

function validateThinAdapter(content, canonical, limit, location) {
  if (nonEmptyLineCount(content) > limit) fail(`${location} exceeds the ${limit}-line thin-adapter limit`);
  const canonicalSet = new Set(normalizedLines(canonical));
  const overlap = normalizedLines(content).filter((line) => canonicalSet.has(line));
  if (new Set(overlap).size >= 3) fail(`${location} duplicates too much canonical content`);
  const canonicalSections = canonical.split(/\r?\n/).filter((line) => /^##\s+/.test(line.trim()));
  const repeatedSections = canonicalSections.filter((section) => content.includes(section));
  if (repeatedSections.length >= 2) fail(`${location} repeats multiple canonical sections`);
}

function parseGeminiToml(content, location) {
  const values = {};
  const lines = content.split(/\r?\n/).filter((line) => line.trim());
  for (const line of lines) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*=\s*("(?:[^"\\]|\\.)*")\s*$/);
    if (!match) fail(`${location} must contain simple quoted TOML assignments only`);
    if (!['description', 'prompt'].includes(match[1])) fail(`${location} contains unsupported field ${match[1]}`);
    if (Object.hasOwn(values, match[1])) fail(`${location} repeats ${match[1]}`);
    try { values[match[1]] = JSON.parse(match[2]); } catch { fail(`${location} contains invalid quoted text`); }
  }
  exactKeys(values, ['description', 'prompt'], location);
  if (!values.description.trim()) fail(`${location} description must not be empty`);
  if (values.prompt.includes('!{')) fail(`${location} contains forbidden Gemini shell injection`);
  if (values.prompt.includes('@{')) fail(`${location} contains forbidden Gemini file injection`);
  return values;
}

export function validateManifest(manifest) {
  exactKeys(manifest, ['schemaVersion', 'canonicalRoot', 'skills'], 'manifest');
  if (manifest.schemaVersion !== '1.0.0') fail('manifest.schemaVersion must be 1.0.0');
  if (manifest.canonicalRoot !== '.ai/skills') fail('manifest.canonicalRoot must be .ai/skills');
  if (!Array.isArray(manifest.skills) || manifest.skills.length !== 2) fail('manifest.skills must contain exactly two skills');
  const names = new Set();
  for (const [index, skill] of manifest.skills.entries()) {
    const location = `manifest.skills[${index}]`;
    exactKeys(skill, ['name', 'canonicalPath', 'canonicalSha256', 'outputSchema', 'adapters'], location);
    if (!SKILLS.includes(skill.name) || names.has(skill.name)) fail(`${location}.name is invalid or duplicated`);
    names.add(skill.name);
    if (skill.canonicalPath !== SKILL_CONFIG[skill.name].canonical) fail(`${location}.canonicalPath is incorrect`);
    if (skill.outputSchema !== SKILL_CONFIG[skill.name].schema) fail(`${location}.outputSchema is incorrect`);
    if (!/^[a-f0-9]{64}$/.test(skill.canonicalSha256)) fail(`${location}.canonicalSha256 must be SHA-256 hex`);
    exactKeys(skill.adapters, ['shared', 'claude', 'geminiCommand'], `${location}.adapters`);
    const expected = {
      shared: `.agents/skills/${skill.name}/SKILL.md`,
      claude: `.claude/skills/${skill.name}/SKILL.md`,
      geminiCommand: `.gemini/commands/${skill.name}.toml`,
    };
    for (const key of Object.keys(expected)) {
      assertRepositoryPath(skill.adapters[key], `${location}.adapters.${key}`);
      if (skill.adapters[key] !== expected[key]) fail(`${location}.adapters.${key} is incorrect`);
    }
  }
  return manifest;
}

export function checkAdapters({ root = REPO_ROOT } = {}) {
  assertRegularFile(root, MANIFEST_PATH);
  const manifest = validateManifest(readJson(root, MANIFEST_PATH));
  assertRegularFile(root, INVOCATION_SCHEMA_PATH);
  readJson(root, INVOCATION_SCHEMA_PATH);
  for (const skill of manifest.skills) {
    assertRegularFile(root, skill.canonicalPath);
    const canonicalDirectory = path.posix.dirname(skill.canonicalPath);
    assertRegularFile(root, `${canonicalDirectory}/OUTPUT_CONTRACT.md`);
    assertRegularFile(root, `${canonicalDirectory}/EXAMPLE.md`);
    assertRegularFile(root, skill.outputSchema);
    const canonical = readFileSync(path.join(root, skill.canonicalPath), 'utf8');
    const actualHash = sha256File(root, skill.canonicalPath);
    if (actualHash !== skill.canonicalSha256) fail(`${skill.name} canonical hash is stale`);

    for (const [kind, adapterPath] of Object.entries(skill.adapters)) assertRegularFile(root, adapterPath, `${skill.name} ${kind} adapter`);
    const shared = readFileSync(path.join(root, skill.adapters.shared), 'utf8');
    const sharedMeta = parseFrontmatter(shared, `${skill.name} shared adapter`);
    if (sharedMeta.name !== skill.name) fail(`${skill.name} shared adapter name does not match its directory`);
    if (!sharedMeta.description?.trim()) fail(`${skill.name} shared adapter description must not be empty`);
    if (!shared.includes(skill.canonicalPath)) fail(`${skill.name} shared adapter points to the wrong canonical skill`);
    validateThinAdapter(shared, canonical, 35, `${skill.name} shared adapter`);

    const claude = readFileSync(path.join(root, skill.adapters.claude), 'utf8');
    const claudeMeta = parseFrontmatter(claude, `${skill.name} Claude adapter`);
    if (claudeMeta.name !== skill.name) fail(`${skill.name} Claude adapter name does not match its directory`);
    if (!claudeMeta.description?.trim()) fail(`${skill.name} Claude adapter description must not be empty`);
    if (claudeMeta['disable-model-invocation'] !== 'true') fail(`${skill.name} Claude adapter must disable model invocation`);
    if (!claude.includes(`\${CLAUDE_PROJECT_DIR}/${skill.canonicalPath}`)) fail(`${skill.name} Claude adapter points to the wrong canonical skill`);
    if (!claude.includes('$ARGUMENTS')) fail(`${skill.name} Claude adapter must pass user arguments`);
    if (claude.includes('!`')) fail(`${skill.name} Claude adapter contains dynamic command execution`);
    validateThinAdapter(claude, canonical, 40, `${skill.name} Claude adapter`);

    const gemini = parseGeminiToml(readFileSync(path.join(root, skill.adapters.geminiCommand), 'utf8'), `${skill.name} Gemini command`);
    if (!gemini.prompt.includes(skill.adapters.shared) || !gemini.prompt.includes(skill.outputSchema) || !gemini.prompt.includes('{{args}}')) {
      fail(`${skill.name} Gemini command does not route through the shared adapter with args and schema`);
    }
  }
  const examples = validateAllInvocations({ root });
  return { manifest, examples };
}

function validateRef(value, location) {
  if (typeof value !== 'string' || !value) fail(`${location} must not be empty`);
  if (value.startsWith('-')) fail(`${location} must not begin with a dash`);
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) fail(`${location} must not be an absolute path`);
  if (value.includes('../') || value.includes('..\\') || value.includes('..') || value.includes('//')) fail(`${location} contains forbidden traversal or ref syntax`);
  if (/[@{\s;&|<>`$()\[\]*?!~^:'"\\\0]/.test(value)) fail(`${location} contains a forbidden character`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) || value.endsWith('/') || value.endsWith('.')) fail(`${location} is not a supported Git ref`);
  return value;
}

function validateTopic(value) {
  if (typeof value !== 'string' || !value.trim()) fail('arguments.topic must not be empty');
  if (value.includes('\0') || /[\r\n]/.test(value)) fail('arguments.topic must be a single plain-text argument');
  return value.trim();
}

export function validateInvocation(invocation) {
  exactKeys(invocation, ['schemaVersion', 'artifactType', 'agent', 'skill', 'mode', 'workingDirectory', 'canonicalSkill', 'adapterPath', 'arguments', 'permissions', 'expectedOutput', 'execution'], 'invocation');
  if (invocation.schemaVersion !== '1.0.0') fail('invocation.schemaVersion must be 1.0.0');
  if (invocation.artifactType !== 'agent-invocation') fail('invocation.artifactType must be agent-invocation');
  if (!AGENTS.includes(invocation.agent)) fail('invocation.agent is unsupported');
  if (!SKILLS.includes(invocation.skill)) fail('invocation.skill is unsupported');
  if (invocation.mode !== 'plan-only') fail('invocation.mode must be plan-only');
  for (const [key, value] of Object.entries({
    workingDirectory: invocation.workingDirectory,
    canonicalSkill: invocation.canonicalSkill,
    adapterPath: invocation.adapterPath,
  })) assertRepositoryPath(value, `invocation.${key}`);
  const config = SKILL_CONFIG[invocation.skill];
  if (invocation.canonicalSkill !== config.canonical) fail('invocation.canonicalSkill does not match the selected skill');
  if (invocation.adapterPath !== ADAPTER_PATHS[invocation.agent][invocation.skill]) fail('invocation.adapterPath does not match the selected agent and skill');

  if (invocation.skill === 'understand') {
    exactKeys(invocation.arguments, ['topic'], 'invocation.arguments');
    validateTopic(invocation.arguments.topic);
  } else {
    exactKeys(invocation.arguments, ['baseRef', 'headRef'], 'invocation.arguments');
    validateRef(invocation.arguments.baseRef, 'invocation.arguments.baseRef');
    validateRef(invocation.arguments.headRef, 'invocation.arguments.headRef');
  }

  exactKeys(invocation.permissions, ['filesystem', 'network', 'productionFirebase', 'gitWrite', 'deploy'], 'invocation.permissions');
  for (const [key, expected] of Object.entries(PERMISSIONS)) {
    if (invocation.permissions[key] !== expected) fail(`invocation.permissions.${key} has an unsafe value`);
  }
  exactKeys(invocation.expectedOutput, ['schema', 'draftPath'], 'invocation.expectedOutput');
  assertRepositoryPath(invocation.expectedOutput.schema, 'invocation.expectedOutput.schema');
  assertRepositoryPath(invocation.expectedOutput.draftPath, 'invocation.expectedOutput.draftPath');
  if (invocation.expectedOutput.schema !== config.schema) fail('invocation.expectedOutput.schema does not match the selected skill');

  exactKeys(invocation.execution, ['enabled', 'reason', 'interactiveInvocation', 'headlessArgvPreview'], 'invocation.execution');
  if (invocation.execution.enabled !== false) fail('invocation.execution.enabled must be false');
  if (typeof invocation.execution.reason !== 'string' || !invocation.execution.reason.trim()) fail('invocation.execution.reason must not be empty');
  if (typeof invocation.execution.interactiveInvocation !== 'string' || !invocation.execution.interactiveInvocation.trim()) fail('invocation.execution.interactiveInvocation must not be empty');
  if (!Array.isArray(invocation.execution.headlessArgvPreview) || invocation.execution.headlessArgvPreview.length < 2 || invocation.execution.headlessArgvPreview.some((item) => typeof item !== 'string' || !item)) {
    fail('invocation.execution.headlessArgvPreview must be a non-empty argv array');
  }
  const argvText = invocation.execution.headlessArgvPreview.join(' ');
  if (/danger-full-access|full-auto|dangerously-skip-permissions/i.test(argvText)) fail('invocation headless argv contains a forbidden permission bypass');
  return invocation;
}

export function loadInvocation(jsonFile, { root = REPO_ROOT } = {}) {
  const resolved = path.isAbsolute(jsonFile) ? jsonFile : path.join(root, jsonFile);
  let invocation;
  try { invocation = JSON.parse(readFileSync(resolved, 'utf8')); } catch (error) { fail(`${jsonFile} is not valid JSON: ${error.message}`); }
  return validateInvocation(invocation);
}

export function invocationFiles({ root = REPO_ROOT } = {}) {
  const directory = path.join(root, INVOCATION_EXAMPLES_DIR);
  return readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => path.join(INVOCATION_EXAMPLES_DIR, name).replace(/\\/g, '/'));
}

export function validateAllInvocations({ root = REPO_ROOT } = {}) {
  const files = invocationFiles({ root });
  if (!files.length) fail('No invocation examples were found');
  files.forEach((file) => loadInvocation(file, { root }));
  return files;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64) || 'topic';
}

function executionFor(agent, skill, args, prompt) {
  const marker = agent === 'codex' ? '$' : '/';
  const argumentText = skill === 'understand' ? args.topic : `${args.baseRef} ${args.headRef}`;
  const interactiveInvocation = `${marker}${skill} ${argumentText}`;
  const headlessArgvPreview = agent === 'codex'
    ? ['codex', 'exec', '--sandbox', 'read-only', '--ephemeral', prompt]
    : agent === 'claude'
      ? ['claude', '-p', prompt, '--permission-mode', 'plan', '--output-format', 'json']
      : ['gemini', '-p', prompt, '--output-format', 'json'];
  return {
    enabled: false,
    reason: 'Phase AI-2B generates plans only and does not execute an external agent.',
    interactiveInvocation,
    headlessArgvPreview,
  };
}

export function buildInvocationPlan(agent, skill, rawArguments) {
  if (!AGENTS.includes(agent)) fail(`Unsupported agent: ${agent}`);
  if (!SKILLS.includes(skill)) fail(`Unsupported skill: ${skill}`);
  let args;
  let draftPath;
  let prompt;
  if (skill === 'understand') {
    if (rawArguments.length !== 1) fail('understand requires exactly one quoted topic argument');
    const topic = validateTopic(rawArguments[0]);
    args = { topic };
    draftPath = `.ai/artifacts/drafts/understand-${slug(topic)}.json`;
    prompt = `Use ${agent === 'codex' ? '$' : '/'}understand for topic: ${topic}. Return schema-conforming JSON only.`;
  } else {
    if (rawArguments.length !== 2) fail('explain-diff requires a base ref and head ref');
    const baseRef = validateRef(rawArguments[0], 'base ref');
    const headRef = validateRef(rawArguments[1], 'head ref');
    args = { baseRef, headRef };
    draftPath = `.ai/artifacts/drafts/explain-diff-${slug(baseRef.slice(0, 7))}-${slug(headRef.slice(0, 7))}.json`;
    prompt = `Use ${agent === 'codex' ? '$' : '/'}explain-diff with base ${baseRef} and head ${headRef}. Return schema-conforming JSON only.`;
  }
  const plan = {
    schemaVersion: '1.0.0',
    artifactType: 'agent-invocation',
    agent,
    skill,
    mode: 'plan-only',
    workingDirectory: '.',
    canonicalSkill: SKILL_CONFIG[skill].canonical,
    adapterPath: ADAPTER_PATHS[agent][skill],
    arguments: args,
    permissions: { ...PERMISSIONS },
    expectedOutput: { schema: SKILL_CONFIG[skill].schema, draftPath },
    execution: executionFor(agent, skill, args, prompt),
  };
  return validateInvocation(plan);
}

export function doctorAgents({ spawn = spawnSync } = {}) {
  return AGENTS.map((agent) => {
    const result = spawn(agent, ['--version'], { encoding: 'utf8', shell: false, windowsHide: true });
    const installed = !result.error && result.status === 0;
    const rawVersion = installed ? String(result.stdout || result.stderr || '').split(/\r?\n/)[0].trim() : '';
    return {
      agent,
      installed,
      version: rawVersion.slice(0, 160) || null,
      interactiveInvocation: agent === 'codex' ? '$understand / $explain-diff' : '/understand / /explain-diff',
      headlessPlanned: true,
      executionEnabled: false,
    };
  });
}

export function formatDoctor(results) {
  const lines = [];
  for (const item of results) {
    lines.push(
      `Agent: ${item.agent}`,
      `Installed: ${item.installed ? 'yes' : 'no'}`,
      `Version: ${item.version ?? 'not installed'}`,
      `Interactive Invocation: ${item.interactiveInvocation}`,
      `Headless Planned: ${item.headlessPlanned ? 'yes' : 'no'}`,
      `Execution Enabled: ${item.executionEnabled ? 'yes' : 'no'}`,
      '',
    );
  }
  return lines.join('\n').trimEnd();
}
