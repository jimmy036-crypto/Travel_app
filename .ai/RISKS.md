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
