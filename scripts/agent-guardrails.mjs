import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

function git(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

function getChangedFiles() {
  const baseSha = process.env.AGENT_BASE_SHA;
  const headSha = process.env.AGENT_HEAD_SHA || 'HEAD';

  if (baseSha && !/^0+$/.test(baseSha)) {
    return unique(
      git(['diff', '--name-only', '--diff-filter=ACMR', `${baseSha}...${headSha}`])
        .split(/\r?\n/),
    );
  }

  const tracked = git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'])
    .split(/\r?\n/);
  const untracked = git(['ls-files', '--others', '--exclude-standard'])
    .split(/\r?\n/);
  return unique([...tracked, ...untracked]);
}

const forbiddenPatterns = [
  /^\.env$/,
  /^\.env\..*\.local$/,
  /^\.env\.local$/,
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)test-results\//,
  /(^|\/)playwright-report\//,
  /(^|\/).*debug\.log$/,
  /(^|\/).*\.(pem|key|p12|pfx)$/i,
];

const highRiskPatterns = [
  /^\.github\/workflows\//,
  /^database\.rules\.json$/,
  /^storage\.rules$/,
  /^firebase\.json$/,
  /^src\/firebase\.js$/,
  /^package(-lock)?\.json$/,
  /^playwright\.config\.ts$/,
  /^vite\.config\.js$/,
  /^e2e\//,
  /(^|\/)\w+\.(test|spec)\.[jt]sx?$/,
];

const mediumRiskPatterns = [
  /^src\/TripDetail\.jsx$/,
  /^src\/components\//,
  /^src\/features\//,
  /^src\/App\.jsx$/,
];

const changedFiles = getChangedFiles();
const forbidden = changedFiles.filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)));
const high = changedFiles.filter((file) =>
  highRiskPatterns.some((pattern) => pattern.test(file)));
const medium = changedFiles.filter((file) =>
  !high.includes(file)
  && mediumRiskPatterns.some((pattern) => pattern.test(file)));

const riskLevel = high.length > 0
  ? 'high'
  : medium.length > 0
    ? 'medium'
    : 'low';

console.log('Agent guardrails');
console.log(`Changed files: ${changedFiles.length}`);
console.log(`Risk level: ${riskLevel}`);

if (changedFiles.length > 0) {
  console.log('\nFiles:');
  for (const file of changedFiles) console.log(`- ${file}`);
}

if (high.length > 0) {
  console.log('\nHigh-risk changes requiring human review:');
  for (const file of high) console.log(`- ${file}`);
}

if (forbidden.length > 0) {
  console.error('\nForbidden files detected:');
  for (const file of forbidden) console.error(`- ${file}`);
}

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `risk_level=${riskLevel}\nrequires_human_review=${high.length > 0}\n`,
  );
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    '## Agent guardrails',
    '',
    `- Changed files: ${changedFiles.length}`,
    `- Risk level: **${riskLevel}**`,
    `- Human review required: **${high.length > 0 ? 'yes' : 'no'}**`,
    '',
    ...(high.length > 0
      ? ['### High-risk files', ...high.map((file) => `- \`${file}\``), '']
      : []),
    ...(forbidden.length > 0
      ? ['### Forbidden files', ...forbidden.map((file) => `- \`${file}\``), '']
      : []),
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (forbidden.length > 0) process.exit(1);
