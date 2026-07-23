# Risk Register

Each risk has an owner role, status, and mitigation. Promote or close risks based on evidence, not optimism.

## Critical

### R-C01 — Accidental production Firebase mutation

- **Status:** Controlled
- **Owner:** QA / Reviewer
- **Risk:** Automated validation or troubleshooting could target production data, Storage, rules, or deployment.
- **Mitigation:** Use the demo Firebase project and Emulator only; prohibit deploy and production credentials; review all Firebase-related commands before execution.

## High

### R-H01 — Device identity mistaken for authorization

- **Status:** Open
- **Owner:** Architect
- **Risk:** Active member and checklist actor values live in localStorage and can be changed by the device user.
- **Mitigation:** Treat them as display/filter preferences only. A future authorization design requires Firebase Auth binding and rules review.

### R-H02 — Large coordination components

- **Status:** Open
- **Owner:** Codex / Reviewer
- **Risk:** `App.jsx` and `TripDetail.jsx` coordinate many views and domains, increasing regression and merge-conflict probability.
- **Mitigation:** Extract only evidence-backed boundaries, retain integration tests, and avoid cross-domain refactors without an architecture decision.

### R-H03 — Delivered Phase 7B work is not on stable main

- **Status:** Open
- **Owner:** Architect
- **Risk:** Documentation or follow-up branches may assume guided-demo capabilities that are still isolated on a feature branch.
- **Mitigation:** Keep stable and feature-line status explicit in `PROJECT_STATUS.md`; do not stack dependent product work without authorization.

### R-H04 — Local Demo Sandbox mistaken for trusted or cloud data

- **Status:** Controlled by design; implementation pending
- **Owner:** Architect / Reviewer
- **Risk:** Editable Sandbox state could be mistaken for a Firebase room, inserted into `myTrips` or Offline Trip Cache, or trusted without validation.
- **Mitigation:** Use an explicit local Sandbox identity and versioned schema, validate every read as untrusted input, keep all Firebase and cache boundaries negative by construction, and require dedicated regression evidence before any implementation may merge.

### R-H05 — Superseded Clone Assignments execute accidentally

- **Status:** Controlled
- **Owner:** Human Approver / Reviewer
- **Risk:** The original six-Assignment plan remains tracked and could be mistaken for the current Gate 2 plan.
- **Mitigation:** Preserve it as immutable Audit History, mark it superseded and non-executable in the Amendment Session and Project OS, and permit only the nine revised Assignments to become a future Gate 2 approval target.

## Medium

### R-M01 — Emulator E2E cost and flakiness

- **Status:** Open
- **Owner:** QA
- **Risk:** Full Desktop/Mobile suites are slow and depend on sequential Emulator lifecycle and browser timing.
- **Mitigation:** Use targeted suites during development, stable role/test-id selectors, no arbitrary sleeps, and full verification only at required gates.

### R-M02 — Offline snapshot staleness

- **Status:** Controlled
- **Owner:** Architect / QA
- **Risk:** A local snapshot may be older than cloud state.
- **Mitigation:** Label Offline Preview as read-only, expose cached time, and require reconnect for authoritative editing.

### R-M03 — Documentation status drift

- **Status:** Open
- **Owner:** Documentation
- **Risk:** Branch, test counts, decisions, and risks can become stale as features merge.
- **Mitigation:** Update `PROJECT_STATUS.md`, relevant ADRs, and `CHANGELOG_AI.md` in every milestone handoff.

### R-M04 — Demo template mutation or incompatible local Sandbox state

- **Status:** Mitigated in Phase AI-3B2B-R2L; continue regression coverage
- **Owner:** Engineer / QA
- **Risk:** Mutation leakage, corrupt JSON, or schema/template version drift could alter the source Demo or produce unsafe Clone input.
- **Mitigation:** Generate fresh template objects, use defensive copies, validate schema and template versions, rebuild a safe local copy on corruption or incompatibility, scope Reset only to the Sandbox key, and revalidate before Clone conversion.

### R-M05 — Feature Introduction replay changes onboarding state or obscures FeatureTour

- **Status:** Mitigated in Phase AI-3B2B-R2L; continue regression coverage
- **Owner:** Engineer / QA
- **Risk:** Replay could incorrectly mark/reset first-run eligibility or conflate high-level product introduction with the trip-contextual spotlight tour.
- **Mitigation:** Give replay a state-neutral mode, separate labels, accessible names, test IDs, and entry points, and retain the existing FeatureTour action independently.

## Low

### R-L01 — Large production bundle warnings

- **Status:** Open
- **Owner:** Reviewer
- **Risk:** Current build reports large chunks that can affect first-load performance.
- **Mitigation:** Measure before changing chunk boundaries; preserve lazy loading for large exclusive views.

### R-L02 — Real-device behavior gaps

- **Status:** Open
- **Owner:** QA
- **Risk:** Universal/App Links, clipboard permissions, safe areas, installed PWA navigation, and mobile keyboards differ from emulation.
- **Mitigation:** Maintain explicit manual QA lists and never claim real-device validation from Playwright projects alone.
