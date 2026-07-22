# Project Status

- **Project Name:** Travel App
- **Current Phase:** Phase AI-3B2B-R2E — Codex JSONL Candidate Recovery
- **Current Branch:** `fix/ai-codex-jsonl-candidate-recovery`
- **Product Baseline:** `feature/first-run-guided-demo`
- **Latest Product Commit:** `c847650e6ea2fc58d6bee7b60f72a290e4fc3b21`
- **Latest Stable Commit:** `000650cd1aba2eeabf08361fed6c9018843fae6b` on `origin/main`
- **Active Feature:** Event-aware Codex JSONL extraction and immutable offline Run recovery
- **Completed Product Work:** Phase 7B-1, Phase 7B-2, and Phase 7B-3
- **Completed AI Work:** Phase AI-1, Phase AI-1.1, Phase AI-2A, Phase AI-2B, Phase AI-3A, Phase AI-3B1, Phase AI-3B2A, Phase AI-3B2B-R1, Phase AI-3B2B-R2B, Phase AI-3B2B-R2C, and Phase AI-3B2B-R2E
- **Roadmap Progress:** Phase 7B-1 through Phase 7B-3 and Phase AI-1 through Phase AI-3B2B-R2E are complete on this feature branch.
- **Current Risks:** Large App/TripDetail coordination surfaces, local member identity not being authorization, Emulator-heavy regression cost, documentation drift, and real-device PWA/link behavior pending manual confirmation.
- **Current Decisions:** Built-in Demo is local-only and read-only, Demo is excluded from `myTrips`, Clone Flow is deferred, Offline Preview is read-only, and FeatureTour remains unchanged by the Demo phases.
- **Regression Status:** Phase 7B-3 recorded 652 passing Vitest tests and 184 passing Playwright tests, with 14 existing conditional PWA skips. That evidence belongs to product commit `c847650e6ea2fc58d6bee7b60f72a290e4fc3b21`. This AI Project OS alignment changes no product code and does not claim that the complete E2E matrix was rerun for this alignment.
- **Testing Status:** Phase AI-3B2B-R2E has 165 passing Runner tests covering terminal Codex JSONL extraction, immutable offline recovery, canonical and identity validation, Candidate/Transcript secret-scope separation, successful-run diagnosis, Approval lifecycle, committed disabled policy, and nested execution guards. Full required regression evidence is recorded in `TEST_MATRIX.md`. All external Agent processes are mocked.
- **Production Status:** No deployment performed.
- **Recovery Status:** Preserved retry-2 completed with exit code `0`, no timeout or truncation. The original parser missed the nested terminal `item.completed` / `agent_message`; the Candidate was recovered offline from event index 43, passed canonical and identity validation, and is eligible for human review. The source Run remained immutable.
- **Upcoming Milestone:** Phase AI-3B2B-R2F — Human review of recovered Round 1 Candidate

Update this file whenever the active branch, product baseline, validation evidence, or milestone changes.
