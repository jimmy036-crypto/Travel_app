# Test Policy

Use the smallest test scope that proves the behavior, then rely on PR CI for the full regression suite.

## Test Responsibility

- Unit tests: pure functions, calculations, mapping, validation, and branch-free data transforms.
- Component tests: Toast, Confirm, Empty State, Skeleton, Modal, and local UI state.
- Integration tests: Firebase service boundaries, listener mapping, write failure behavior, and persistence edge cases.
- E2E tests: complete user flows, realtime collaboration, routing, drag and drop, Storage, and cross-device behavior.

## Risk Levels

- Low: documentation, copy, comments, and isolated CSS with no behavior change.
- Medium: single UI surface, Skeleton, Empty State, and non-destructive Toast feedback.
- High: Firebase writes, deletion flows, money calculations, realtime sync, Storage, drag and drop, shared E2E fixtures, and CI.
- Critical: production config, migrations, authentication, and security rules.

Changing `e2e/**` does not automatically increase product risk. It increases review risk because assertions and fixtures influence confidence. Product risk still depends on the behavior being changed.

## Local Validation

During development:

```bash
npm run test:run -- <unit-or-component-test>
npm run test:e2e -- <relevant-spec>
```

Before commit:

```bash
npm run verify:fast
npm run test:e2e -- <relevant-spec>
git diff --check
```

Run `npm run verify:full` locally only when one of these applies:

- `playwright.config.ts` changed.
- Firebase Emulator startup changed.
- Shared E2E helper or fixture changed.
- GitHub Actions changed.
- A major release needs local full regression.
- CI full E2E failed and must be reproduced locally.
- The user explicitly requests full local validation.

## Prohibited Test Shortcuts

- Do not use `test.only`.
- Do not skip or delete tests to make a branch green.
- Do not weaken assertions to hide a bug.
- Do not add arbitrary long timeouts or sleeps to mask race conditions.
- Do not use force click as a substitute for fixing overlay or locator problems.
