import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STATUS_ORDER = { PASS: 0, WARN: 1, FAIL: 2 };

export function parseArgs(argv = []) {
  const options = {
    help: false,
    skipFetch: false,
    allowFeature: false,
  };

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--skip-fetch') options.skipFetch = true;
    else if (arg === '--allow-feature') options.allowFeature = true;
    else throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

export function usage() {
  return [
    'Usage: npm run task:preflight -- [options]',
    '',
    'Options:',
    '  --help           Show this help message.',
    '  --skip-fetch     Do not run git fetch origin before checking origin/main.',
    '  --allow-feature  Allow running on a non-main branch.',
    '',
    'The command only inspects local state. It does not switch, pull, merge, stash, reset, clean, or stop processes.',
  ].join('\n');
}

function check(id, label, status, message) {
  return { id, label, status, message };
}

export function summarizeChecks(checks) {
  return checks.reduce(
    (highest, item) => (STATUS_ORDER[item.status] > STATUS_ORDER[highest] ? item.status : highest),
    'PASS',
  );
}

function relationStatus(relation) {
  if (!relation) return { status: 'FAIL', message: 'Unable to compare main with origin/main.' };

  const ahead = Number(relation.ahead || 0);
  const behind = Number(relation.behind || 0);

  if (ahead > 0 && behind > 0) {
    return { status: 'FAIL', message: `main has diverged from origin/main (${ahead} ahead, ${behind} behind).` };
  }
  if (behind > 0) return { status: 'FAIL', message: `main is behind origin/main by ${behind} commit(s).` };
  if (ahead > 0) return { status: 'FAIL', message: `main has ${ahead} unpushed commit(s).` };
  return { status: 'PASS', message: 'main is up to date with origin/main.' };
}

export function evaluatePreflight(state, options = {}) {
  const allowFeature = Boolean(options.allowFeature);
  const checks = [];

  checks.push(check(
    'git-repository',
    'Git repository',
    state.isGitRepository ? 'PASS' : 'FAIL',
    state.isGitRepository ? 'Current directory is inside a Git repository.' : 'Current directory is not a Git repository.',
  ));

  checks.push(check(
    'project-path',
    'Project path',
    'PASS',
    String(state.projectPath || process.cwd()),
  ));

  const branch = String(state.branch || '').trim();
  checks.push(check(
    'branch',
    'Current branch',
    branch === 'main' || (allowFeature && branch)
      ? 'PASS'
      : 'FAIL',
    branch
      ? `${branch}${allowFeature && branch !== 'main' ? ' (--allow-feature)' : ''}`
      : 'Detached HEAD or unknown branch.',
  ));

  checks.push(check(
    'worktree',
    'Working tree',
    state.isDirty ? 'FAIL' : 'PASS',
    state.isDirty ? 'Working tree has uncommitted or untracked changes.' : 'Working tree is clean.',
  ));

  if (state.fetchSkipped) {
    checks.push(check('fetch-origin', 'Fetch origin', 'PASS', 'Skipped by --skip-fetch.'));
  } else if (state.fetchError) {
    checks.push(check('fetch-origin', 'Fetch origin', 'WARN', String(state.fetchError)));
  } else {
    checks.push(check('fetch-origin', 'Fetch origin', 'PASS', 'origin fetched successfully.'));
  }

  checks.push(check(
    'origin-main',
    'origin/main',
    state.originMainExists ? 'PASS' : 'FAIL',
    state.originMainExists ? 'origin/main exists.' : 'origin/main is missing or cannot be read.',
  ));

  const mainRelation = state.originMainExists
    ? relationStatus(state.mainRelation)
    : { status: 'FAIL', message: 'Cannot compare main because origin/main is missing.' };
  checks.push(check('main-sync', 'main sync', mainRelation.status, mainRelation.message));

  const currentAhead = Number(state.currentBranchRelation?.ahead || 0);
  const currentBehind = Number(state.currentBranchRelation?.behind || 0);
  if (state.currentBranchRelation) {
    checks.push(check(
      'unpushed-commits',
      'Unpushed commits',
      currentAhead > 0 ? 'FAIL' : 'PASS',
      currentAhead > 0
        ? `Current branch has ${currentAhead} unpushed commit(s).`
        : currentBehind > 0
          ? `Current branch has no unpushed commits and is ${currentBehind} commit(s) behind its upstream.`
          : 'Current branch has no unpushed commits.',
    ));
  } else if (state.currentBranchUpstreamMissing) {
    checks.push(check(
      'unpushed-commits',
      'Unpushed commits',
      'WARN',
      'Current branch has no upstream; unpushed commits cannot be determined.',
    ));
  } else {
    checks.push(check(
      'unpushed-commits',
      'Unpushed commits',
      'FAIL',
      'Unable to determine whether current branch has unpushed commits.',
    ));
  }

  const requiredTools = [
    ['node', 'Node', state.versions?.node],
    ['npm', 'npm', state.versions?.npm],
    ['git', 'Git', state.versions?.git],
  ];
  for (const [id, label, version] of requiredTools) {
    checks.push(check(
      `tool-${id}`,
      label,
      version ? 'PASS' : 'FAIL',
      version || `${label} is not available.`,
    ));
  }

  const optionalTools = [
    ['java', 'Java', state.versions?.java],
    ['firebase', 'Firebase CLI', state.versions?.firebase],
  ];
  for (const [id, label, version] of optionalTools) {
    checks.push(check(
      `tool-${id}`,
      label,
      version ? 'PASS' : 'WARN',
      version || `${label} is not available.`,
    ));
  }

  if (Array.isArray(state.gitErrors)) {
    for (const error of state.gitErrors.filter(Boolean)) {
      checks.push(check('git-command-error', 'Git command error', 'FAIL', String(error)));
    }
  }

  return {
    status: summarizeChecks(checks),
    checks,
  };
}

function run(command, args, { cwd = process.cwd(), allowFailure = false } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      ok: false,
      stdout: String(error.stdout || '').trim(),
      stderr: String(error.stderr || error.message || '').trim(),
      status: error.status,
    };
  }
}

function commandVersion(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  });
  if (result.error || result.status !== 0) return '';
  return String(result.stdout || result.stderr || '').trim().split(/\r?\n/)[0] || '';
}

function parseAheadBehind(output) {
  const [left, right] = String(output || '').trim().split(/\s+/).map((value) => Number(value));
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return { ahead: left, behind: right };
}

function collectState(options) {
  const gitErrors = [];
  const projectPath = process.cwd();
  const gitVersion = commandVersion('git', ['--version']);

  const repo = run('git', ['rev-parse', '--is-inside-work-tree'], { allowFailure: true });
  const isGitRepository = repo.ok && repo.stdout === 'true';

  if (!isGitRepository) {
    return {
      isGitRepository: false,
      projectPath,
      branch: '',
      isDirty: false,
      fetchSkipped: options.skipFetch,
      fetchError: '',
      originMainExists: false,
      mainRelation: null,
      currentBranchRelation: null,
      versions: {
        node: commandVersion('node', ['--version']),
        npm: commandVersion('npm', ['--version']),
        git: gitVersion,
        java: commandVersion('java', ['-version']),
        firebase: commandVersion('firebase', ['--version']),
      },
      gitErrors: repo.stderr ? [repo.stderr] : [],
    };
  }

  let fetchError = '';
  if (!options.skipFetch) {
    const fetch = run('git', ['fetch', 'origin'], { allowFailure: true });
    fetchError = fetch.ok ? '' : (fetch.stderr || 'git fetch origin failed.');
  }

  const branch = run('git', ['branch', '--show-current'], { allowFailure: true });
  if (!branch.ok) gitErrors.push(branch.stderr || 'git branch --show-current failed.');

  const status = run('git', ['status', '--porcelain'], { allowFailure: true });
  if (!status.ok) gitErrors.push(status.stderr || 'git status --porcelain failed.');

  const originMain = run('git', ['rev-parse', '--verify', '--quiet', 'origin/main'], { allowFailure: true });

  let mainRelation = null;
  if (originMain.ok) {
    const relation = run('git', ['rev-list', '--left-right', '--count', 'main...origin/main'], { allowFailure: true });
    if (relation.ok) mainRelation = parseAheadBehind(relation.stdout);
    else gitErrors.push(relation.stderr || 'Unable to compare main and origin/main.');
  }

  const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { allowFailure: true });
  let currentBranchRelation = null;
  let currentBranchUpstreamMissing = false;
  if (upstream.ok) {
    const relation = run('git', ['rev-list', '--left-right', '--count', `${upstream.stdout}...HEAD`], { allowFailure: true });
    if (relation.ok) currentBranchRelation = parseAheadBehind(relation.stdout);
    else gitErrors.push(relation.stderr || 'Unable to compare current branch with upstream.');
  } else {
    currentBranchUpstreamMissing = true;
  }

  return {
    isGitRepository,
    projectPath,
    branch: branch.stdout || '',
    isDirty: Boolean(status.stdout),
    fetchSkipped: options.skipFetch,
    fetchError: fetchError || '',
    originMainExists: originMain.ok,
    mainRelation,
    currentBranchRelation,
    currentBranchUpstreamMissing,
    versions: {
      node: commandVersion('node', ['--version']),
      npm: commandVersion('npm', ['--version']),
      git: gitVersion,
      java: commandVersion('java', ['-version']),
      firebase: commandVersion('firebase', ['--version']),
    },
    gitErrors,
  };
}

function printReport(report) {
  console.log(`Task preflight: ${report.status}`);
  for (const item of report.checks) {
    console.log(`[${item.status}] ${item.label}: ${item.message}`);
  }
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(2);
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  const report = evaluatePreflight(collectState(options), options);
  printReport(report);
  if (report.status === 'FAIL') process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
