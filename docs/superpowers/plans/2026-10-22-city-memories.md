# City-first memories implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved scope inline, then obtain a fresh whole-branch review.

**Goal:** Make city confirmation a complete personal travel record, with optional journal-style attraction detail.

**Architecture:** Store explicit city confirmations independently of attractions in the existing personal-memory transaction. Resolve suggestions separately from confirmation; aggregate both real city and attraction evidence in the journal model. Keep a compact city-first editor and extract optional attraction editing into its own component.

**Tech Stack:** Existing React, Google Maps JavaScript Geocoder, Firebase callable/Realtime Database, Vitest, node:test, Playwright and Firebase Emulator.

**Spec:** `docs/superpowers/specs/2026-10-22-city-memories.md`

## Global constraints

- Use the clean existing `fix/memory-surface-contrast` worktree and extend PR #79; never commit directly to main.
- Preserve existing personal records, notes, permanent snapshots, authentication and revision checks.
- No dependency, rules, workflow or shared test-infrastructure changes.
- No assumed visit confirmations or synthetic attraction records.
- User explicitly requested implementation and merge; do not ask again for the same scope.

## Review focus

- City-only visits must survive source revocation and archive/restore without creating attraction evidence.
- Removing a city must not silently delete place notes or retain an invisible city footprint.
- Out-of-order geocoding and account/trip switches must never import another trip's decisions.
- Unassigned places, failed saves and concurrent changes must preserve local drafts.
- A backend that has not stored city data must not be reported as a successful durable save.

## Task 1: Deliver the complete city-first journey

**Files:** `functions/src/travelJournal{,.test}.js`; `src/features/memories/journalModel{,.test}.js`, `visitDraftModel{,.test}.js`, new `citySuggestions{,.test}.js` and `useCitySuggestions.js`, `MemoryEditor.jsx`, new `MemoryVisitEditor.jsx`, `MemoryEditorLoader.jsx`, `FootprintsPage.jsx`, `TravelJournal.jsx`, `MemoryConflictDialog.jsx`, `memories.css`; relevant existing component and E2E tests.

**Interfaces:** `cities` is an explicit canonical-city map in memory save/read payloads. `buildFootprints` returns separate `tripIds` and actual `visits`. `resolveCitySuggestions(candidates, destination, geocoder)` returns `{cities, placeCities}` without confirmation. `MemoryEditor` receives suggested cities and visit-to-city assignments separately from saved decisions.

- [x] Add failing service/model tests: city-only persistence, invalid canonical identity rejection, partial geography save, no inflated attraction counts, revisits/search/share and city removal retaining notes.
- [x] Implement city normalization and aggregation; run `node --test functions/src/travelJournal.test.js` and targeted Vitest model tests until green.
- [x] Add failing suggestion/editor tests: no automatic selection, no-text city confirmation, explicit day batches, retry/late results, manual records, keyboard editing and conflict recovery. Update obsolete interaction selectors while retaining their behavioral assertions.
- [x] Implement suggestion lookup, independent city selection and optional journal editor. Preserve current account-scoped draft/save lifecycle.
- [x] Update city/trip reading, archive/restore and collection handling. Extend real Emulator E2E to verify city-only persistence, reload, source removal and optional detail; adapt existing suites to the new controls without dropping scenarios.
- [x] Run targeted model/component/service tests, then related Playwright suites and inspect phone/desktop light/dark captures together. Repair only evidenced defects (maximum three rounds per failure).
- [ ] Run `npm run verify:fast` and `git diff --check`, obtain a fresh branch review, resolve important findings and repeat only affected verification.
- [ ] Commit on the feature branch, update PR title/body for final scope, push, verify latest-head push and PR CI separately, then merge once all expected checks pass. Verify the returned merge state and report deployment state accurately.

## Execution ledger

- Preflight PASS; branch clean, main at 05872d1; existing contrast commit f091e5d remains included. Existing PR #79 CI success was freshly inspected before implementation.
- Ruling: use the existing PR branch for the combined scope, as the user requested “先實作新版，再一起合併”; no stacked PR or unrelated checkout changes are needed. Cost if wrong: PR presentation only.

- Implementation verified: backend 39/39; current fast gate passed (1,408 tests in 134 files, TypeScript, ESLint, production build); relevant E2E final coverage 18/18 (12 memories + 6 contrast), with zero final failures/skips/retries. The first run had a photo Emulator timing failure that passed without changing the timeout; two new test contract/selector errors were corrected.
- Real desktop light/dark and mobile city/journal screenshots inspected; text-action contrast checks passed.
- Release contract rejects requests without an explicit cities map so stale pages cannot erase new city records. Existing pages must refresh before saving.
