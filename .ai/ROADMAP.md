# Roadmap

Statuses describe the product program, while `PROJECT_STATUS.md` records branch-level evidence.

## Product Phases

- **Phase 1 — Foundation:** Core React application, trip room concept, Firebase setup, and basic itinerary management. Completed.
- **Phase 2 — Trip Planning:** Lobby, trip metadata, day navigation, and place workflows. Completed.
- **Phase 3 — Collaboration Domains:** Expenses, checklist, shared member concepts, and responsive trip UI. Completed.
- **Phase 4 — Attachment Storage:** Ticket/place attachments, validation, failure cleanup, and Emulator tooling. Completed.
- **Phase 5 — Realtime and Offline Awareness:** Multi-context synchronization, sync status, offline awareness, and recovery behavior. Completed.
- **Phase 6 — App Shell and PWA:** Offline preview, PWA install/update experiences, release notes, FeatureTour, and security foundations. Completed.
- **Phase 7A — External App Tickets:** Canonical ticket domain, editor, persistence ordering, member filtering, legacy compatibility, and Emulator coverage. Completed.
- **Phase 7B-1 — Local Guided Demo Foundation:** Built-in Tokyo data and read-only preview. Completed.
- **Phase 7B-2 — Demo Entry Integration:** Empty-Lobby and Settings entry points with mutually exclusive App routing. Completed.
- **Phase 7B-3 — First-run Welcome:** Four-step new-user flow, release-priority rules, and deep-link deferral. Completed.

## AI Project OS Phases

- **Phase AI-1 — Foundation:** Establish `.ai/` as the single source for status, architecture, decisions, risks, roles, tests, tasks, and schemas. Completed.
- **Phase AI-1.1 — Guided Demo Alignment:** Align the foundation with the Phase 7B-3 product baseline in an isolated worktree. Completed.
- **Phase AI-2A — Understanding Skills:** Add tool-agnostic Understand and Explain Diff contracts, schemas, deterministic offline rendering, quizzes, validation, and real First-run Welcome artifacts. Completed.
- **Phase AI-2B — Agent Adapters and Invocation Workflow:** Connect shared skills to supported agent invocation surfaces without duplicating skill rules. Completed.
- **Phase AI-3A — Structured Multi-Agent Discussion Protocol:** Add fixed-round, import-only discussion packets, immutable responses, Architect proposals, Human Approval, and execution-disabled assignments. Completed.
- **Phase AI-3B — Controlled Live Agent Runners:** Add separately authorized, sandboxed runners without weakening human approval or production boundaries. Next.
- **Phase AI-4 — Governance Automation:** Add safe local checks for status freshness, decision links, risk ownership, and release evidence without changing CI unless separately authorized. Planned.
- **Phase AI-5 — Release Intelligence:** Produce evidence-based release readiness summaries and roadmap updates from verified repository state. Planned.

## Near-term Exit Criteria

AI-1.1 is complete when the foundation commit and alignment record sit above the Phase 7B-3 baseline, validation passes, the original worktree remains untouched, and the integration branch is pushed without product changes.
