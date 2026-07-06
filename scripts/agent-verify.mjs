import { spawnSync } from 'node:child_process';

const profile = process.argv[2] || 'fast';

const profiles = {
  fast: [
    ['TypeScript', 'npm run typecheck'],
    ['ESLint', 'npm run lint'],
    ['Vitest', 'npm run test:run'],
    ['Production build', 'npm run build'],
  ],
  e2e: [
    ['Playwright E2E', 'npm run test:e2e'],
  ],
};

if (!['fast', 'e2e', 'all'].includes(profile)) {
  console.error(`Unknown profile: ${profile}`);
  console.error('Use: fast, e2e, or all');
  process.exit(2);
}

const steps = profile === 'all'
  ? [...profiles.fast, ...profiles.e2e]
  : profiles[profile];

const startedAt = Date.now();

for (const [label, command] of steps) {
  console.log(`\n=== ${label} ===`);
  console.log(`$ ${command}`);

  const result = spawnSync(command, {
    cwd: process.cwd(),
    env: process.env,
    shell: true,
    stdio: 'inherit',
  });

  if (result.error) {
    console.error(`Failed to start ${label}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`\nFAILED: ${label}`);
    process.exit(result.status || 1);
  }
}

const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
console.log(`\nPASS: ${profile} verification completed in ${seconds}s.`);
