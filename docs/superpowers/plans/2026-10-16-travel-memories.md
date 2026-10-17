# Travel memories implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated implementation and review tasks. User authorized all three batches; execute without repeated design approval.

**Goal:** Ship private travel memories, confirmed footprints, collections, passport stamps and annual review.
**Architecture:** A private personalTravel account tree, callable validation/transactions, one account listener, and modular React journal screens. Shared trip data and authorization remain separate.
**Tech Stack:** Existing React, Firebase RTDB/Functions, Leaflet, Vitest, node:test, Playwright.
**Spec:** docs/features/TRAVEL_MEMORIES_DESIGN.md

## Global constraints

- No production-data tests, secrets, lockfile or CI changes. The user subsequently explicitly requested commit and deployment; both are authorized, subject to available execution permissions and required verification. No automatic main merge.
- User explicitly authorized the new owner-only read rule and personal data model.
- All mutations use auth.uid and revisions. Stale responses cannot cross accounts.
- No scheduled location becomes visited automatically. Missing coordinates never become (0,0).
- Original trip photos retain their existing ACL; copying trips strips protected attachments and financial/completion data.

## Review focus

- Two accounts and concurrent edits: no cross-account leaks or lost updates (tasks 1, 2).
- Removed/deleted source trip: saved private notes remain, original protected content unavailable (tasks 1, 2).
- Duplicate place IDs/day entries and repeated city visits: stable decisions, one city visit per trip (tasks 1, 3).
- Failed save / offline / listener failure: retained input, recoverable error, no apparent successful archive (task 2).
- Empty years, no coordinates, no selected share data: clear empty states and no invented stats (task 3).

## Task 1 — Private persistence

Files: functions/src/travelJournal.js, travelJournal.test.js, index.js; src/features/memories/journalClient.js, useTravelJournal.js and tests.

Interfaces: get UI data through RTDB personalTravel/{uid}. saveTravelMemory({roomId, revision, archived, note, visits, firsts}) returns {memory}; saveTravelCollection({id, revision, title, items, deleted}) returns {collection}; cloneMemoryTrip({sourceRoomId, roomId, meta}) returns {roomId, meta}. Shape memory = {roomId, revision, archived, archivedAt, title, destination, startDate, endDate, note, visits: keyed records, firsts: keyed labels}; collection = {id, revision, title, items: keyed {name, city, roomId, visitId}, deleted}. A collection item without visit link is wishlist; with a validated visited link is visited.

- [x] Add failing service tests for Google identity, source access, own tree writes, input bounds, revisions and clone sanitization; run node --test functions/src/travelJournal.test.js.
- [x] Implement service and callable exports; rerun targeted tests.
- [x] Implement account listener and callable client with stale-account guards and error handling; test with Vitest.
- [x] Review API and invariants before UI integration.

## Task 2 — Batch 1 complete/archive/memories/restore

Files: src/App.jsx, src/components/TripCard.jsx, src/features/memories/MemoryEditor.jsx, MemoriesPage.jsx, memories.css and tests; e2e/travel-memories.spec.ts.

- [x] Add failing tests for archive filtering and dual account flow.
- [x] Add lobby navigation and archive actions, archive confirmation with optional visits, year/search cards, restore/open and clone forms. Keep error state visible.
- [x] Run related unit tests and Emulator E2E including account isolation, reload, restore and source itinerary preservation.
- [x] Review first batch before continuing derived experiences.

## Task 3 — Batch 2 and 3 confirmed visits, collections and review

Files: src/features/memories/journalModel.js and tests, FootprintsPage.jsx, FootprintsMap.jsx, CollectionsPage.jsx, PassportReview.jsx, ShareMemoryDialog.jsx.

- [x] Add failing model tests for visited-only grouping, repeat-trip dedup, missing coordinates, yearly filtering, validated collection progress and source-linked stamps.
- [x] Implement pure derivations, visit editing, map/list cities, source photos/notes and city collections.
- [x] Implement themes, first experience confirmation, derived passport stamps, annual review and explicit text selection share.
- [x] Run targeted unit/E2E across the entire flow at desktop and mobile sizes; inspect screenshots.

## Task 4 — Integration and delivery

- [x] Run npm run verify:fast, backend tests, related Playwright suites, git diff --check.
- [x] Fresh independent review; address findings within three rounds.
- [ ] Record validation/limitations, commit, push feature branch and create/attach Draft PR. No automatic merge. Deployment subsequently authorized; complete backend/Rules first, then publish the matching frontend commit. See the validation record for current Git/network blockers.
