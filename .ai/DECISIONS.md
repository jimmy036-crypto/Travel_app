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

## ADR-006 — Clone Flow Architecture Decision approved for Gate 2 planning

- **Status:** Accepted at Gate 1; implementation remains pending Gate 2
- **Recorded:** 2026-07-23
- **Context:** Reviewed Round 1 analysis and independent Round 2 critique produced `clone-demo-architecture-proposal`, which defines a bounded owner-only Demo Clone MVP and separates technical development from production enablement.
- **Decision:** Approve the architecture direction in `.ai/discussions/active/clone-demo-architecture-pilot/decision/proposal.json`. Prepare six execution-disabled Assignments for a pure allowlist converter, same-device Journal/state machine, explicit Demo-only confirmation UI, Emulator-only integration, independent code review, and QA. The approval artifact is `.ai/discussions/active/clone-demo-architecture-pilot/decision/human-approval.json`.
- **Consequences:** Gate 2 may now review the implementation and conditional-Merge plan. No Assignment may execute until Gate 2 is separately approved. Product code, Firebase Rules, production Firebase, dependency changes, migrations, Merge, and deployment remain unauthorized.
- **Alternatives:** Deep-copying Demo data, mapping fictional members, claiming cross-device idempotency from localStorage, copying tickets/expenses/attachments, treating Demo places as verified, or enabling production before Auth and Rules approval remain rejected by the approved Proposal.
- **Links:** `decision/gate-1-result.md`, `assignments/gate-2-summary.md`, and the six tracked Assignment artifacts under the active Session.

## ADR-007 — Editable local Demo Sandbox and replayable Feature Introduction amend Gate 2 planning

- **Status:** Accepted; revised Gate 2 implementation, review, and QA passed; conditional Merge pending
- **Recorded:** 2026-07-23
- **Context:** During Gate 2 review, the human requested that Demo interactions be editable and persist locally after refresh, with an explicit reset, plus a visible high-level Feature Introduction replay entry. The human then explicitly confirmed adoption of the bounded amended behavior.
- **Decision:** Use a versioned local Demo Sandbox derived defensively from immutable `createTokyoDemoTrip` output. Sandbox edits and reset remain local and never write Firebase, `myTrips`, or Offline Trip Cache. Clone consumes the current validated Sandbox snapshot through the existing allowlist and owner-only safety model. Add replayable high-level Feature Introduction entries in Lobby and Settings without changing first-run eligibility, while retaining the existing trip-contextual FeatureTour as a separate action.
- **Consequences:** The independent `clone-demo-editable-sandbox-amendment` Session supersedes only the original six-Assignment Gate 2 plan, which remains immutable and non-executable Audit History. Human approved revised Gate 2, and the nine amended Assignments were implemented, reviewed, and QA-verified on `feat/editable-demo-sandbox-clone`. Conditional Merge is authorized only to `feat/ai-editable-demo-amendment-plan`. Firebase Rules, dependencies, migrations, production Firebase, main Merge, and deployment remain unauthorized and unchanged.
- **Alternatives:** Keep Demo read-only; mutate the source template; persist Demo as a cloud trip; merge Feature Introduction with FeatureTour; or execute the original Gate 2 plan. These were rejected because they conflict with the confirmed product behavior, local-only boundaries, onboarding-state isolation, or audit history.
- **Links:** `.ai/discussions/active/clone-demo-editable-sandbox-amendment/decision/proposal.json`, `decision/human-approval.json`, and `assignments/gate-2-summary.md`.
