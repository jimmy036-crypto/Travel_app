# Test Policy

Use risk-based validation. Run the smallest local test scope that proves the changed behavior, then rely on GitHub Actions for full regression.

## During implementation

- Run only tests directly related to the changed files, behavior, or failure.
- After a failure, rerun only the failed suite and directly related suites while debugging.
- Do not run full E2E after every edit.
- Prefer stable selectors such as roles and `data-testid` in E2E work.

## Before commit

For normal tasks, run:

```bash
npm run agent:guardrails
npm run agent:verify
npm run test:e2e -- <task-required-spec>
git diff --check
```

Run the task-required E2E command only when `TASK.md` requires it or the changed behavior needs it. Do not report skipped commands as passing.

## GitHub Actions

GitHub Actions is responsible for neutral final validation:

- Complete lint, typecheck, unit, and build checks.
- Complete Playwright regression.
- PR-quality signal independent of the local implementer.

## Full local verification

Run `npm run agent:verify:all` locally only when one of these applies:

- `playwright.config.ts` changed.
- Firebase Emulator startup changed.
- Shared E2E helper or fixture changed.
- GitHub Actions changed.
- CI full E2E failed and must be reproduced locally.
- A major release needs local full regression.
- `TASK.md` explicitly requires full local validation.

## Risk levels

- Low: documentation, copy, comments, and non-behavior CSS.
- Medium: general UI, Empty State, Skeleton, Toast, and non-destructive interactions.
- High: Firebase writes, Realtime listeners, Storage lifecycle, deletion flows, expense calculation, drag data, CI, and test infrastructure.
- Critical: production config, authentication, Firebase rules, schema migration, secrets, and production deployment.

Changing E2E test files does not automatically make the product change high risk. Risk is based on product behavior and data impact. Test edits still require careful review because they affect confidence.

## Prohibited shortcuts

- Do not use `test.only`.
- Do not delete or skip tests to make a branch green.
- Do not lower assertions to hide defects.
- Do not add arbitrary long timeouts or sleeps to mask race conditions.
- Do not use force click as a substitute for fixing overlay or locator problems.
