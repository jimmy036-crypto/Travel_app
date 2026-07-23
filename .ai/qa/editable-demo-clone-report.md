# Editable Demo Sandbox and Clone Flow QA Report

- Tested commit: `ce4f578`
- QA owner: `codex-qa`
- QA result: PASS
- Production Firebase accessed: false
- Deployment performed: false

## Vitest

- Test files: 51 passed
- Tests: 723 passed
- Failed: 0
- Skipped: 0

The baseline contained 43 files and 652 tests. No test count was removed, skipped, weakened, or marked `only`.

## Playwright

- Browser projects: Desktop Chrome, Mobile Safari
- Full regression: 192 passed
- Failed: 0
- Conditional skips: 14
- New Editable Demo coverage: 8 passed, 0 failed, 0 skipped

The 14 conditional skips are the pre-existing PWA production/install cases intentionally excluded by their existing environment/project guards. No new test uses `skip` or `only`.

## Emulator boundary

- Firebase project: `demo-travel-e2e`
- Emulator UI: `127.0.0.1:4000`
- Emulator Hub: `127.0.0.1:4400`
- Authentication Emulator: `127.0.0.1:9099`
- Realtime Database Emulator: `127.0.0.1:9000`
- Storage Emulator: `127.0.0.1:9199`
- Database Rules changed: false
- Storage Rules changed: false
- Production Firebase accessed: false

Clone writes require all of the following:

1. The Clone feature flag is explicitly enabled.
2. Vite runs in `emulator` mode on a local hostname.
3. Firebase uses a `demo-*` project ID.
4. The Database SDK is connected to `127.0.0.1:9000` before the create-only transaction.

Any failed condition rejects before a database write.

## Editable Demo evidence

- Demo edits persist across reload through the versioned local Sandbox.
- Reset restores the current immutable template and affects no real trip.
- Itinerary add, edit, delete, time/note updates, and reorder pass.
- Checklist add, edit, toggle, owner assignment, and delete pass.
- Demo open, edit, and reset produce zero Firebase room writes.
- Demo does not create a myTrips entry.
- Demo does not create an Offline Trip Cache entry.
- Source template immutability and defensive-copy behavior pass unit tests.
- Corrupted/incompatible Sandbox data safely rebuilds locally.
- Storage-unavailable behavior uses the documented memory fallback.

## Clone evidence

- Clone uses the currently edited and validated Sandbox snapshot.
- Owner-only output is enforced.
- Expenses, settlements, tickets, attachments, Storage paths, Demo identities, example order data, and audit state are excluded.
- Feature flag defaults to disabled.
- A tampered journal is treated as untrusted and cannot bypass canonical conversion.
- Seven-day expiry, schema validation, fingerprint validation, collision behavior, retry/reload, ambiguous read-back, and myTrips repair pass unit/integration tests.
- Browser-wide locking plus create-only transaction semantics prevent a two-tab double operation.
- Room verification precedes myTrips write/read-back and navigation.

## Feature Introduction evidence

- Lobby exposes a prominent Feature Introduction action.
- Settings exposes a separate Feature Introduction replay action.
- Existing trip-contextual Feature Tour remains present with a different accessible name, callback, and test ID.
- Replay does not modify first-run onboarding eligibility.
- Desktop and Mobile layouts pass.

## Other regression

- Typecheck: PASS
- ESLint: PASS
- Production build: PASS
- Agent guardrails: PASS
- Agent verify: PASS
- `git diff --check`: PASS

## Remaining risks

- The recovery journal is intentionally same-device and same-browser only.
- Unverified text-only cloned places require user review before navigation use.
- Clone remains disabled by default and cannot be enabled for production by this phase.
- The broad current production Rules remain an existing risk; this implementation neither changes nor relies on them for enablement.

## Final result

PASS. The implementation is eligible for PR and conditional merge to `feat/ai-editable-demo-amendment-plan`; it is not approved for main or deployment.
