# City-first travel memories

Approved in conversation: implement the city-first flow and travel-journal presentation, then merge together with the contrast fix in PR #79.

## Outcome

A traveller can record a three-city trip without typing or confirming every attraction. Saving a memory remains independent of visit confirmation. Explicitly confirmed cities are durable personal records; planning, suggestions, unchecked places and transit never constitute confirmation.

## Flow

- Offer deduplicated canonical city suggestions from available itinerary coordinates or a city destination. Missing or failed geographic lookup never blocks saving. Allow an optional city search.
- City checkboxes and an explicit select-all action are the shortest path. No required notes, photos or attraction statuses. Existing confirmed attraction cities also remain available.
- Show optional “走過的地方” with a text action “補上景點” / “完成” / “編輯”, without disclosure arrows. Preview saved places; edit in place with one-tap visited checkboxes and an explicit day batch action. Put city correction, other visit states and per-place notes behind a secondary detail action.
- Retain manual additions, first experiences, notes, local drafts, revision conflict handling and source-independent permanent snapshots. Optional manual entries still cannot be silently discarded.
- Footprints overview groups by canonical city. City detail groups records by distinct trips and years, exposes the original trip and the optional place editor, and counts “趟旅行”. City-only records contain no invented attraction or place count.
- Removing a city confirmation retains the associated attraction records and notes, clears their city assignment, and explains that they can be organized later. Saved attraction confirmation is valid evidence of a city; inferred geography alone is not.

## Data and safety

Add a bounded `cities` map to each personal memory, keyed by encoded canonical city ID. Values contain cityId, city, country, cityLat and cityLng. Existing visits remain actual attractions; no synthetic place records or schema migration. Aggregate city confirmations and real visited attractions without duplicate trip counts. A visited attraction may remain unassigned and is saved without blocking other content.

Use the existing account transaction and revision checks. Preserve caller isolation and source ACL checks. Do not change security rules, dependencies, workflow, shared emulator infrastructure or permanent-storage lifecycle. Test only against fakes or Firebase Emulator.

Backend and frontend must agree on city persistence. Record and verify deployment readiness before claiming the feature is available in production; merge authorization does not itself prove a backend deployment occurred.

## Acceptance

1. Explicit city-only confirmation persists, reloads, appears on the map, and survives source removal; planned attractions remain unconfirmed.
2. Repeated cities deduplicate by canonical identity; distinct countries remain distinct; trips, annual review, search and return stamps include city-only memories without inflated attraction counts.
3. Missing geography, offline mode, failed save and concurrent revisions retain input and expose useful recovery.
4. Optional attraction editing supports keyboard and mobile use, day batches, city correction, manual entries and prior wishlist/first-experience features.
5. Light/dark and custom app surfaces remain readable with no horizontal overflow. New interfaces use text actions and date-led travel-journal composition.


## Release contract

The save request must include the cities map, including an empty map for a trip without city confirmations. An outdated request is rejected before any write, prompting refresh rather than silently removing cities. Deploy only the updated saveTravelMemory callable before promoting the frontend. Existing open pages must refresh to save; reads remain available. The client also verifies the returned city data before clearing a draft.

No existing private records are migrated or deleted. If a UI rollback is required, retain the city save contract and stored cities; reverting the backend to a version that drops this field is not a safe data-preserving rollback.
