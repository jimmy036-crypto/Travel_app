# Unified Example Trip Code Review

- Reviewed commit: `403881749093e76473522215de346a3371990a4c`
- Review scope: Track A Amendment — Unified Example Trip Interface Implementation
- Blocking findings: none
- Recommendation: proceed to QA

## Changed files

- Shared data layer: `src/features/trip-data/**`
- Shared trip view and actions: `src/TripDetail.jsx`, repository integration tests, and the directly related place, expense, and ticket hooks
- Unified entry and card UI: `src/App*`, `src/components/TripCard*`, and `src/features/onboarding/**`
- Emulator E2E: the approved onboarding/example specs, `e2e/unified-example-trip.spec.ts`, and `e2e/support/emulator.ts`
- Removed: `DemoTripPreview.jsx` and its dedicated test

## Architecture review

- The repository contract exposes the required subscription, loading, branch-update, attachment, lifecycle, and capability methods.
- Every repository returns a normalized snapshot containing `meta`, `itinerary`, `expenses`, `settlements`, `tickets`, and `checklist`.
- `TripDetail` imports neither Firebase Database/Storage nor Offline Trip Cache and does not interpret Firebase snapshots.
- App explicitly injects either a Firebase repository or the Local Example repository into the same `TripDetail`.
- No `isExample` branches are distributed through the shared trip layout. Capability checks are limited to unavailable behavior.
- Normal Firebase paths and branch contracts are unchanged.

## Local data review

- Structured data is stored as a schema- and template-versioned IndexedDB envelope.
- Attachment bytes are stored in IndexedDB as a WebKit-compatible `ArrayBuffer` and reconstructed as defensive `Blob` values on read.
- IndexedDB-unavailable errors use memory fallback and the approved generic save-failure notification; quota and other write failures remain explicit failures.
- Corrupted and incompatible envelopes recover from an immutable template copy.
- Branch writes persist the next envelope before publishing it to subscribers.
- Attachment URLs are reused and revoked on replacement, deletion, reset, and repository disposal.
- Reset only clears the local example stores and cannot address a Firebase trip.

## Cloud-write and behavior review

- The local repository imports no Firebase modules and has no Firebase or Offline Cache write methods.
- App excludes `local-example-trip` from `myTrips` metadata updates.
- The legacy place editor receives no cloud room ID when `firebaseStorage` is unavailable, preventing it from constructing or uploading an example Storage path.
- Ticket image/PDF attachments use the IndexedDB attachment store and survive reload.
- Cloud-only sharing remains in its normal UI position and reports `建立自己的旅程後即可使用此功能`.
- Clone remains disabled by default and no local example flow creates a Firebase room.

## UI, text, and accessibility review

- Example and regular trips use the same `TripCard` and `TripDetail` structures.
- The title has exactly one `（範例）` suffix and no extra badge or mode label.
- The runtime template sanitizer and text-policy regression test prevent prohibited labels from reaching the active UI.
- Existing role-based controls, modal semantics, stable test IDs, shared tabs, feature tour, and responsive layout remain intact.
- Desktop Chrome and Mobile Safari exercise the same shared roots and controls.

## Scope and decision compliance

- No dependency, lockfile, Firebase Rules/config, environment, workflow, deployment, migration, or secret changes.
- No production Firebase access, deployment, main merge, rebase, force push, skipped test, weakened assertion, or release-PR readiness change.
- All modified paths are within the human-approved amendment scope.

## Non-blocking findings

- The retained default-disabled Clone converter/dialog still contains legacy internal wording for future use; runtime entry points remain disabled and active UI text scans pass.
- The legacy place editor still owns its Firebase attachment implementation outside this amendment's approved file scope. Local example cloud paths are blocked, while fully local image/PDF attachments are provided by the shared ticket wallet. A future adapter migration could extend local persistence to place photos/resources.

## Decision

Blocking findings: none.
