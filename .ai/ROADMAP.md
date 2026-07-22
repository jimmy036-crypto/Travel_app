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
- **Phase AI-3B1 — Controlled Live Runner Foundation:** Add disabled policies, deterministic plans, hash-bound approval, nested execution guards, bounded subprocesses, and manual result review. Completed.
- **Phase AI-3B2A — Prepare Codex Round 1 Pilot:** Add the first evidence-based non-synthetic Session, deterministic disabled Packet, and human-only runbook. Completed.
- **Phase AI-3B2B-R1 — Recoverable Runner Attempts:** Add atomic Approval claims, pre-spawn Run records, durable launch failures, deterministic attempt labels, read-only status, and failure-safe inspection. Completed.
- **Phase AI-3B2B-R2B — Codex Exit-1 Diagnosis:** Add secret-safe, read-only JSONL diagnosis; repair the Codex transport schema from direct failure evidence; and prepare a deterministic, execution-disabled retry Plan. Completed.
- **Phase AI-3B2B-R2C — Codex Schema Compatibility:** Separate the RE2-compatible Codex transport schema from strict canonical Discussion validation, bind both layers into the Plan, and prepare deterministic retry-2. Completed.
- **Phase AI-3B2B-R2D — Human-approved retry-2 execution and inspection:** retry-2 was launched from an ordinary human shell, consumed its Approval, and completed with exit code `0`, no timeout, and no truncation. Completed.
- **Phase AI-3B2B-R2E — Codex JSONL Candidate Recovery:** Add terminal event-aware Candidate extraction, immutable offline Run recovery, full canonical and identity validation, Candidate/Transcript secret-scope separation, and successful-run extraction-failure diagnosis. Completed.
- **Phase AI-3B2B-R2F — Human review of recovered Round 1 Candidate:** Review the recovered local Candidate without automatic ingest, new Agent execution, or retry-3. Next.
- **Phase AI-3B3 — Controlled Runner Expansion:** Evaluate additional providers only after pilot evidence and separate approval. Planned.
- **Phase AI-4 — Governance Automation:** Add safe local checks for status freshness, decision links, risk ownership, and release evidence without changing CI unless separately authorized. Planned.
- **Phase AI-5 — Release Intelligence:** Produce evidence-based release readiness summaries and roadmap updates from verified repository state. Planned.

## Near-term Exit Criteria

AI-1.1 is complete when the foundation commit and alignment record sit above the Phase 7B-3 baseline, validation passes, the original worktree remains untouched, and the integration branch is pushed without product changes.
