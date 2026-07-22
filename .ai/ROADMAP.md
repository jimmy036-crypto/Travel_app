# Roadmap

Statuses describe the product program, while `PROJECT_STATUS.md` records branch-level evidence.

## Product Phases

- **Phase 1 — Foundation:** Core React application, trip room concept, Firebase setup, and basic itinerary management. Completed.
- **Phase 2 — Trip Planning:** Lobby, trip metadata, day navigation, and place workflows. Completed.
- **Phase 3 — Collaboration Domains:** Expenses, checklist, shared member concepts, and responsive trip UI. Completed.
- **Phase 4 — Attachment Storage:** Ticket/place attachments, validation, failure cleanup, and Emulator tooling. Completed.
- **Phase 5 — Realtime and Offline Awareness:** Multi-context synchronization, sync status, offline awareness, and recovery behavior. Completed.
- **Phase 6 — App Shell and PWA:** Offline preview, PWA install/update experiences, release notes, FeatureTour, and security foundations. Completed.
- **Phase 7A — External App Tickets:** Canonical ticket domain, editor, persistence ordering, member filtering, legacy compatibility, and Emulator coverage. Merged to `main`.
- **Phase 7B-1 — Local Guided Demo Foundation:** Built-in Tokyo data and read-only preview. Delivered on feature branch.
- **Phase 7B-2 — Demo Entry Integration:** Empty-Lobby and Settings entry points with mutually exclusive App routing. Delivered on feature branch.
- **Phase 7B-3 — First-run Welcome:** Four-step new-user flow, release-priority rules, and deep-link deferral. Delivered on feature branch.

## AI Project OS Phases

- **Phase AI-1 — Foundation:** Establish `.ai/` as the single source for status, architecture, decisions, risks, roles, tests, tasks, and schemas. Completed.
- **Phase AI-2 — Task Lifecycle:** Enforce structured intake, planning, discussion, review, handoff, and archival conventions.
- **Phase AI-3 — Agent Interoperability:** Validate shared task, response, and decision payloads across supported agents.
- **Phase AI-4 — Governance Automation:** Add safe local checks for status freshness, decision links, risk ownership, and release evidence without changing CI unless separately authorized.
- **Phase AI-5 — Release Intelligence:** Produce evidence-based release readiness summaries and roadmap updates from verified repository state.

## Near-term Exit Criteria

AI-1 is complete when all required documents and schemas exist, root agent entry files point to the same ordered source set, validation passes, and the foundation branch is pushed without product changes.
