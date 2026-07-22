# Architecture Decision Records

Use the following format for new records: ID, title, status, recorded date, context, decision, consequences, alternatives, and links. Never silently rewrite an accepted decision; supersede it with a new ADR.

## ADR-001 — Built-in Demo does not write Firebase

- **Status:** Accepted
- **Recorded:** 2026-07-22
- **Context:** New users need a safe way to understand the product without creating cloud data or appearing to own a real trip.
- **Decision:** Demo data is bundled locally and Demo Preview performs no Firebase Database or Storage request.
- **Consequences:** Demo is deterministic and privacy-safe, but it cannot demonstrate true remote writes without a later explicit user flow.
- **Alternatives:** Seed a shared Firebase room; create a private room automatically. Both were rejected because they create cloud state without clear consent.

## ADR-002 — Built-in Demo is excluded from myTrips

- **Status:** Accepted
- **Recorded:** 2026-07-22
- **Context:** `google-travel-my-trips` represents user-selected real room references.
- **Decision:** Demo identity and view state remain separate from the Lobby trip list.
- **Consequences:** Lobby counts, offline badges, and room navigation stay truthful. App routing needs an explicit Demo view state.
- **Alternatives:** Insert a synthetic room card into `myTrips`. Rejected because it would blur local examples and real rooms.

## ADR-003 — Clone Flow is deferred

- **Status:** Accepted
- **Recorded:** 2026-07-22
- **Context:** Copying Demo content requires consent, new canonical IDs, schema validation, and partial-failure handling across multiple branches.
- **Decision:** Do not expose Clone CTA until a dedicated confirmed conversion flow exists.
- **Consequences:** Users can create a blank trip from Demo, while accidental data creation and misleading no-op controls are avoided.
- **Alternatives:** Auto-fill the create modal or show a disabled placeholder. Rejected because both misrepresent the final behavior.

## ADR-004 — Offline Preview is read-only

- **Status:** Accepted
- **Recorded:** 2026-07-22
- **Context:** Local snapshots cannot safely resolve concurrent edits without a complete offline mutation and conflict protocol.
- **Decision:** Offline snapshots support viewing only; writes require the online Firebase flow.
- **Consequences:** Offline behavior is predictable and conflict-free, but full offline editing remains a non-goal.
- **Alternatives:** Queue writes locally for later replay. Deferred due to consistency and migration risk.

## ADR-005 — Demo phases do not modify FeatureTour

- **Status:** Accepted
- **Recorded:** 2026-07-22
- **Context:** FeatureTour has established release-state and spotlight contracts. Demo guidance metadata is not yet a compatible controller.
- **Decision:** Keep FeatureTour chapters and behavior unchanged through Phase 7B-3.
- **Consequences:** Existing tour regressions remain stable; Demo-specific guided chapters require a later designed integration.
- **Alternatives:** Reuse current spotlight targets inside Demo Preview. Rejected because the views and target lifecycles differ.
