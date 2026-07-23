# Editable Demo Clone Code Review

- Reviewed commit: `396535f`
- Review scope: complete diff from `f47f58d9f6edb1a9e75bdda0ec15aaf0fc5ae035`
- Reviewer: `codex-reviewer`
- Result: PASS

## Changed files

- Editable Sandbox store, constants, tests, and App wiring
- Editable Demo Preview and tests
- Clone allowlist converter and denylist serialization tests
- Same-device operation journal, state machine, and tests
- Clone confirmation dialog and tests
- Feature Introduction replay components, Settings integration, and tests
- Emulator-only Clone repository, feature flag, App integration, and tests

## Blocking findings

None.

Two blocking findings found during review were corrected before this report:

1. Error and ambiguous-result retries now release the dialog confirmation lock.
2. Initial Clone preparation now uses one browser-wide Web Locks mutex, while Firebase create-only transactions and journal identity checks remain the final collision boundary.

The focused regressions for both fixes pass.

## Non-blocking findings

- The App orchestration remains intentionally centralized for this approved assignment. Future extraction should require a separately approved scope because `App.jsx` is the sole integration owner.
- The operation journal guarantees same-device, same-browser recovery only. It does not claim cross-device idempotency.
- Unverified text-only places remain intentionally non-navigational until a later product decision.

## Decision compliance

- Source Demo templates are copied defensively and never mutated.
- Sandbox reads return defensive copies; invalid or incompatible local data rebuilds from the current template.
- Demo open, edit, and reset have no Firebase, myTrips, Offline Cache, or Storage upload write path.
- Reset affects only the versioned local Sandbox.
- Clone revalidates the current Sandbox and uses an allowlist converter.
- Clone output is owner-only and excludes expenses, settlements, tickets, attachments, storage paths, Demo identities, audit state, and credential-like content.
- Recovery remains local and minimal; the transformed payload is not journaled.
- Feature Introduction replay is distinct from the trip-contextual Feature Tour and does not alter onboarding eligibility.
- The Clone feature flag defaults to disabled.
- Database writes require an explicit Emulator configuration, a local hostname, and a non-production build.
- No Database Rules, Storage Rules, dependency, migration, production Firebase, or deployment changes exist.

## Scope compliance

All product and test changes are within the seven approved implementation assignments. No original Discussion evidence, approved assignment JSON, Firebase Rules, package file, lockfile, environment file, deployment configuration, ticket/expense implementation, or Offline Cache implementation changed.

## Accessibility

The editable Preview, reset confirmation, Feature Introduction replay, Settings actions, and Clone dialog have keyboard paths, accessible names, focus handling, and responsive Desktop/Mobile layouts covered by component tests.

## Recommendation

Proceed to Assignment 9 QA and Emulator-only Playwright verification.
