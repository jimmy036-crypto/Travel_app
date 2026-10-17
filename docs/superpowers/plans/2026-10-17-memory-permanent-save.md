# Travel Memory Preservation and UX Implementation Plan

> Execution uses parallel specialists with exclusive file ownership, root integration and independent review under dispatching-parallel-agents. Checkboxes track actual completion.

**Goal:** Save independent personal travel snapshots and photos, then make archiving, reading, editing, footprints and collections easier to use.

**Architecture:** Keep personal edits separate from immutable trip/photo archives. Use existing callable and durable RTDB worker patterns, owner-only Storage reads, operation fencing and generation preconditions. Reuse the existing UI primitives and dependencies.

**Tech Stack:** React 19, Firebase RTDB/Auth/Storage/Functions, Node 22, Vitest, Node test, Firebase Emulator, Playwright.

**Spec:** [Memory preservation design](../specs/2026-10-17-memory-permanent-save-design.md).

## Global constraints

- Do not edit the unrelated original checkout's product source, existing untracked task files, main branch, CI, lockfile, secrets or production data.
- No compatibility fallbacks or speculative framework; old memories explicitly opt into the new preservation operation.
- Separate successful personal archive from fully successful photo preservation in UI and tests.
- Finish each layer end to end before moving to the next; do not publish a partially working replacement.
- At most three repair rounds for the same failure; retain cause and rationale.
- Use the existing feature PR if still open. Verify its live status after network access recovers.

## Review focus

1. A photo copy can succeed while its result write fails: retry must discover the same owned object and avoid duplicate files.
2. Deletion may race a worker or finalize event: operation fencing and generation-specific cleanup must prevent resurrection.
3. Source access can disappear mid-copy: missing files cannot become a false fully-preserved state.
4. Another device may save while a local draft is open: preserve both edits until conflicts are resolved.
5. Old free-text cities and account switching: no guessed city merge and no cross-account draft or photo display.

## Task 0: Restore executable workspace

- [x] Confirm write permission for `C:/Users/jimmy/.codex/worktrees/travel-memories-footprints/travel` and its linked Git metadata.
- [x] Run `npm run task:preflight -- --allow-feature` in the canonical worktree; preserve unrelated user changes. Clean/fetch pass; local-main-sync check fails, but feature merge-base equals current origin/main. Leave main unchanged.
- [x] Read PR #78 and compare its head with local HEAD. PR remains open draft at 3d28857; continue this branch.
- [x] Save spec and plan at the canonical paths above. Record user authorization from this session; do not request duplicate approval for the already requested work.

## Task 1: Personal preservation lifecycle

Files:
- Create `functions/src/travelMemoryArchive.js`, `functions/src/travelMemoryArchive.test.js`.
- Modify `functions/src/index.js`, `database.rules.json`, `storage.rules`, `src/firebase.rules.test.js`.

Interfaces:
- `createTravelMemoryArchiveService({ database, bucket, clock, operationIdFactory })`.
- `requestTravelMemoryPreservation({ roomId, operationId }, auth)` creates or returns the caller's existing operation.
- `processTravelMemoryPreservation(uid, roomId)` handles queued work under a lease and returns completion/retry state.
- `deleteTravelMemory({ roomId, revision }, auth)` requests deletion; `processTravelMemoryDeletion(uid, roomId)` removes only the personal namespace and cleans collection links.
- `cleanupFinalizedMemoryObject(object)` removes late objects only for obsolete/deleted operations and the event generation.
- Archive nodes and states are defined in the spec; private notes revision must not increment for worker progress.

- [x] Write failing Node tests for requester identity, canonical source path/MIME/size, 12-photo completion, partial failure, duplicate operation, post-copy write failure, source revocation and source generation mismatch.
- [x] Add deletion-race tests with a paused copy and a delayed finalize event. Assert original `rooms/` and another UID's files are unchanged and deleted notes cannot reappear.
- [x] Implement bounded copy batches with per-item checkpoints and existing-namespace cleanup. Only mark complete after every declared source entry is verified.
- [x] Register callable, RTDB worker and finalize handlers using the actual bucket event region pattern in `index.js`.
- [x] Add Emulator rules tests: owner read succeeds; outsider, anonymous, removed-source companion accessing another user's archive, client writes and operation reads fail. Own completed copy remains readable after source ACL removal.
- [x] Run `node --test functions/src/travelMemoryArchive.test.js functions/src/travelJournal.test.js` and `npm run test:rules`.
- [x] Commit only after relevant tests and required fast verification pass.

## Task 2: Fast archive and independent memory reading

Files:
- Create `src/features/memories/ArchiveTripDialog.jsx`, `MemoryDetail.jsx`, `MemoryPhotos.jsx`, `useMemoryArchive.js`, and corresponding tests. Extend the existing journalClient rather than adding a second client.
- Modify `TravelJournal.jsx`, `MemoriesPage.jsx`, `FootprintsPage.jsx`, `journalClient.js`, `useTravelJournal.js`, `MemoryEditorLoader.jsx`, `memories.css`, `src/App.jsx`.
- Remove obsolete `SourcePhotos.jsx` and its tests only when the independent replacement has equivalent and stronger permission/lifecycle coverage.
- Modify `functions/src/travelJournal.js` and its tests for cloning from the caller's saved snapshot.

Interfaces:
- Archive confirmation takes a trip and calls the existing personal archive save, followed by `requestTravelMemoryPreservation`; an unaccepted second request remains visibly incomplete and retryable.
- `MemoryDetail({ roomId, accountUid, onEdit, onClose, ... })` loads only that user's saved snapshot and photos.
- `MemoryPhotos` uses authenticated Blob reads, lazy loading and URL revocation on account/operation changes.
- `cloneMemoryTrip` reads the caller's permanent snapshot, preserves existing duration/sanitization guarantees and does not require access to a deleted source.

- [x] Add failing UI tests for two-action quick archive with no notes/visits, queued/partial/complete progress, unavailable old source, source deletion, and photo account switching.
- [x] Implement read-first card behavior and separate original-trip entry. Display saved snapshot itinerary with explicit unconfirmed status, never inferred visits.
- [x] Implement actual photo opening and accessible close/return focus; no public token URL.
- [x] Add backend clone-from-snapshot tests and preserve all existing financial/private-field exclusion assertions under the new contract.
- [x] Run targeted Vitest and Node suites, then add the permanent-save/source-deletion journey to `e2e/travel-memories.spec.ts` using real Emulator Storage objects.

## Task 3: Draft protection and conflict recovery

Files:
- Create `src/features/memories/journalDraftStore.js`, `useJournalDraft.js`, `MemoryConflictDialog.jsx`, and tests.
- Modify `MemoryEditor.jsx`, `CollectionsPage.jsx`, `CloneMemoryDialog.jsx`, `journalClient.js`, `TravelJournal.jsx`.

Interfaces:
- `readJournalDraft({ uid, kind, recordId })`, `writeJournalDraft({ uid, kind, recordId, baseRevision, baseValue, value })`, `removeJournalDraft(...)` return explicit success/failure.
- `useJournalDraft` exposes current draft, dirty/persistence status, protected close and successful-save clearing.
- Conflict resolution uses base/current/local values. Same-field conflicts require an explicit choice; independently edited fields may be combined and saved against the newly read revision.

- [x] Test close/reopen, Escape, backdrop, refresh, offline, quota/storage failure, account switch and source deletion without silently losing input.
- [x] Test two-device disjoint edits and conflicting edits; no automatic force overwrite and no new-user draft leakage.
- [x] Implement through existing confirmation/modal primitives; do not alter unrelated form behavior.
- [x] Add focused browser coverage with unsaved text and a conflicting Emulator update.

## Task 4: Efficient visit confirmation and city identity

Files:
- Create `src/features/memories/CityPicker.jsx`, `visitDraftModel.js`, and tests.
- Modify `MemoryEditor.jsx`, `journalModel.js`, `FootprintsPage.jsx`, `FootprintsMap.jsx`, `functions/src/travelJournal.js` and related tests.
- Reuse existing destination prediction hooks in `src/components/UIComponents.jsx`; inspect their current canonical-branch implementation before adapting.

Interfaces:
- New city selection carries a stable `cityId`, country, label and coordinates. The label is display data, not identity.
- Bulk visit updates apply only to explicitly selected IDs; city selection never changes status by itself.
- User-added personal visits are explicitly sourced as manual and validated independently of immutable itinerary-source entries.
- Existing free-text records remain explicitly unassigned until the user links them to a city; no automatic label/coordinate heuristic merge.

- [x] Test 7 days/40 places/3 cities, keyboard bulk selection, missing-city focus, first-error positioning, manual visit entry and source loss.
- [x] Test different labels/same city ID merge and same name/different countries remain distinct.
- [x] Implement day groups, batch status/city actions and persistent footer. Preserve no-GPS and skip-later flows.
- [x] Verify map selection and detail alignment, keyboard list alternative and mobile layout.

## Task 5: Collection, stamp, navigation and share completion

Files:
- Modify `CollectionsPage.jsx`, `TravelJournal.jsx`, `PassportReview.jsx`, `ShareMemoryDialog.jsx`, `CloneMemoryDialog.jsx`, `journalModel.js`, `src/App.jsx`, relevant service/tests.

- [x] Test city revisit list starts as wishlist, existing collection selection, source deduplication and pending valid input included on save.
- [x] Enforce one trip per first-experience type inside the account transaction; require explicit reassignment, never silently drop another trip's experience.
- [x] Route revisit stamps to city history and collection stamps to that collection; search includes visit notes.
- [x] Preserve view, selected memory/city, year and query in URL; test reload/back/account switch.
- [x] Add selectable share fields with personal note off by default, accurate preview, native text share and copy behavior.
- [x] Infer clone end date from original duration, show limits before submission and offer opening the created trip.
- [x] Add a representative photo/quote selection for yearly review without scoring, ranking or spending conditions.

## Task 6: Integrated verification and review

- [x] Run `npm run verify:fast` and `git diff --check` after implementation.
- [x] Run backend tests and Rules Emulator, then relevant `travel-memories`, Storage and deletion E2E suites sequentially with builds.
- [x] Validate 390×844 mobile, desktop, 200% typography, keyboard/focus, 40-place form, partial save, refresh and deletion races.
- [x] Verify request counts: memory list does not subscribe to complete source rooms or eagerly load every photo; detail loads only selected memory.
- [x] Update feature/validation docs and obtain independent code review under the applicable review skill. This change is prepared for the existing Draft PR; its commit and CI status are recorded in the PR.
- [x] Do not report new behavior as released until the actual new commit, CI and deployment are verified. Preserve existing user data during rollback; never delete archives as part of disabling a UI.

## Current verification record

- 2026-10-17: existing `functions/src/travelJournal.test.js` 24/24 pass, no skips. Baseline only.
- Permissions restored; canonical branch and open Draft PR verified. Original checkout and main unchanged.
- Backend specialist: 236 Functions tests and 21 Rules Emulator tests passed. Independent review then reproduced an expired-worker cleanup race before a replacement checkpoint; durable exact-generation cleanup fixes it, 56 targeted Node tests pass.
- Frontend review reproduced browser-back draft loss, identified missing Maps API provider, incomplete snapshot reading, and clone payload overrides. Fixes add capture-phase navigation protection, provider context, preserved planning text, and title/date-only clone input. Targeted regressions pass.
- Photo tests reproduce eager cover downloads and repeated loading; viewport-gated covers and stable photo components fix both (7 photo lifecycle/permission tests pass).
- Final fast verification: 130 files / 1394 tests, TypeScript, ESLint and production build pass (86.4s). Relevant browser suites: 22 passed, no retry/flaky/skipped (3.0m), including draft restoration/conflict, real source deletion and companion-preserving personal deletion. Desktop/mobile 200% screenshots inspected. Detailed repair history is retained in docs/features/TRAVEL_MEMORIES_VALIDATION.md. Root also reran Rules Emulator: 21 passed, 0 skipped. Commit and latest full CI are recorded in Draft PR #78; production deployment is excluded by current AGENTS instructions.
