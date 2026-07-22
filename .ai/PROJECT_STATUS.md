# Project Status

- **Project Name:** Travel App
- **Current Phase:** Phase AI-3B1 - Controlled Live Runner Foundation
- **Current Branch:** `feat/ai-controlled-agent-runner`
- **Product Baseline:** `feature/first-run-guided-demo`
- **Latest Product Commit:** `c847650e6ea2fc58d6bee7b60f72a290e4fc3b21`
- **Latest Stable Commit:** `000650cd1aba2eeabf08361fed6c9018843fae6b` on `origin/main`
- **Active Feature:** Human-approved, nested-execution-blocked live Agent runner
- **Completed Product Work:** Phase 7B-1, Phase 7B-2, and Phase 7B-3
- **Completed AI Work:** Phase AI-1, Phase AI-1.1, Phase AI-2A, Phase AI-2B, Phase AI-3A, and Phase AI-3B1
- **Roadmap Progress:** Phase 7B-1 through Phase 7B-3 and Phase AI-1 through Phase AI-3B1 are complete on this feature branch.
- **Current Risks:** Large App/TripDetail coordination surfaces, local member identity not being authorization, Emulator-heavy regression cost, documentation drift, and real-device PWA/link behavior pending manual confirmation.
- **Current Decisions:** Built-in Demo is local-only and read-only, Demo is excluded from `myTrips`, Clone Flow is deferred, Offline Preview is read-only, and FeatureTour remains unchanged by the Demo phases.
- **Regression Status:** Phase 7B-3 recorded 652 passing Vitest tests and 184 passing Playwright tests, with 14 existing conditional PWA skips. That evidence belongs to product commit `c847650e6ea2fc58d6bee7b60f72a290e4fc3b21`. This AI Project OS alignment changes no product code and does not claim that the complete E2E matrix was rerun for this alignment.
- **Testing Status:** Phase AI-3B1 passed 61 mock-only Runner tests, 56 Discussion regressions, 40 Adapter regressions, 19 Artifact regressions, parsing for all 4 Live Runner schemas, validation of 4 disabled Runner artifacts, 17 Discussion artifacts, 9 plan-only invocations, and 2 learning artifacts. Typecheck, lint, build, guardrails, and fast verification passed; fast verification included 43 Vitest files with 652 passing tests. No `codex exec`, Claude, or Gemini prompt ran; there is no live Agent output, product behavior change, or deployment.
- **Production Status:** No deployment performed.
- **Upcoming Milestone:** Phase AI-3B2 - Human-launched Codex Round 1 pilot

Update this file whenever the active branch, product baseline, validation evidence, or milestone changes.
