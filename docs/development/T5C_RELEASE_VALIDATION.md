# T5C Release Validation

> Identifier: `TRAVEL-T5C-RELEASE-VALIDATION`
> Baseline: `075c2f1a3eb7d14aaa175ba42ba47878b6e431f5` (main, 2026-09-17)
> Validation branch: `test/travel-t5c-release-validation`

## Scope and safety boundary

This is a release-regression and evidence closeout, not a feature release. It
does not modify Firebase rules, schema, repositories, calculations, PWA policy,
application source, packages, or CI configuration. Browser tests use only the
`demo-travel-e2e` Firebase Emulator project and localhost.

The original `npm run task:preflight` in the user worktree was **FAIL** because
that worktree was on another task branch with two user-owned untracked files and
its local `main` was 18 commits behind `origin/main`. Nothing there was changed.
An isolated worktree was created from `origin/main` at the baseline SHA. Its
`npm run task:preflight -- --allow-feature` has the same shared-local-main
warning, but its worktree is clean and
`git merge-base --is-ancestor origin/main HEAD` succeeds. This branch is
therefore based on current remote main.

`npm ci --ignore-scripts --no-audit --no-fund` was used only inside the
isolated worktree. `npm run firebase:version` then reports `15.25.0`; this
retains PR #73's approved Firebase CLI fix.

## Evidence matrix

| Area | Current evidence | Later change assessed | Result / release impact |
| --- | --- | --- | --- |
| Lobby, auth, collaboration | T3 validation and main CI at `075c2f1` | PRs #66–#73 | Existing emulator regression remains valid; no relevant product change in T5C. |
| Itinerary, map, add/edit/reorder | T1/T2 validation; PR #73 time-control validation; T5C `place-crud` run | PR #73 | Re-run completed for time control in both projects. Real Google Places remains external-service coverage, not an Emulator claim. |
| Tickets and protected attachments | T4A / PR #64 validation and PR #73 main CI | PRs #65–#73 | No attachment-path change after PR #64; retain prior focused storage evidence. |
| Expenses, budgets, settlement | T4B-1, T5A and T5B validation; PR #73 main CI | PR #73 | No expense or calculation change; prior exact amount/scope evidence remains applicable. |
| Companion preference / multi-context | T4B-0 / T4B-1 validation and PR #73 main CI | PR #73 | No preference, account-isolation, or data-mode change. |
| PWA / offline | Task-specific production-preview config and existing `pwa-install.spec.ts` | Current PWA update prompt behavior | Manifest and SW registration pass safely on localhost+Emulator. Install/real offline/update-transition coverage is incomplete; see C-05. |

## T5C additions

### 200% time-control browser evidence

`e2e/place-crud.spec.ts` adds a narrow, behavior-preserving case at
390×844 using `document.documentElement.style.fontSize = '200%'`. It checks:

- the explicit recalculation checkbox remains visible, 44px high and accepts
  keyboard Space;
- Save and Cancel can be scrolled to and their center points are not covered;
- no document-level horizontal overflow occurs; and
- saving the selected cascade persists the exact `10:00`, `10:40`, `11:20`
  sequence in the Emulator.

This is an HTML font-size equivalent, not browser zoom, OS Dynamic Type, or a
physical iPhone result.

### Safe PWA validation entry

`playwright.t5c-pwa.config.ts` is a task-only configuration. It accepts no URL
input, hard-codes `http://127.0.0.1:4175`, injects only public demo Emulator
settings at build time, uses an isolated Firebase CLI home, and does not use
the existing PWA config's `VITE_USE_FIREBASE_EMULATOR=false` remote-shaped
configuration. It does not modify the shared Playwright configuration.

The safe production-preview command completed `PWA-PROD-01` (manifest) and
`PWA-PROD-02` (service-worker registration/update root) in Desktop Chrome:
2 passed, 2 expected project skips. The main PWA install suite was also run
once to diagnose outstanding behavior: 2 passed, 5 failed, 7 project skips.
The failed install cases are not treated as passes:

1. A first service-worker registration calls `revealWaitingPwaUpdate()` in
   `PWAUpdatePrompt`, displaying the existing fixed update prompt before an
   install action. In WebKit it intercepts the `加入主畫面` hit target.
2. The initial safe config auto-signed in the E2E account, whose synthetic
   avatar is `https://example.test/e2e-owner.png`; this produced a
   `ERR_NAME_NOT_RESOLVED` console audit error. The tracked config removes the
   automatic user, and the focused production checks pass without that request.

The first item is a reproducible PWA update-flow behavior, but changing it is
outside this release-validation task's prohibition on changing update/first-run
behavior. No `force` click, timeout increase, assertion relaxation, skip, or
product workaround was used.

## Acceptance result

| ID | Status | Evidence and boundary |
| --- | --- | --- |
| C-01 version correctness | PASS | Baseline is main `075c2f1`; PR #73 is included; isolated dependency check reports Firebase CLI 15.25.0; main Quality Gate run `35202494320` completed successfully at that SHA. |
| C-02 primary flow | PASS | Latest main Chrome and Mobile Safari Emulator jobs passed in run `35202494320`; T1–T4B validation documents identify the focused CRUD/filter/return suites. No later product change beyond PR #73 requires re-running every historical UI matrix. |
| C-03 time control | PASS | `npm run test:e2e -- e2e/place-crud.spec.ts --grep "time control"`: 18 passed (9 Chrome, 9 Mobile Safari). This includes unselected preservation, explicit cascade exact sequence/reload, hook insertion, 320/390/1024 keyboard/touch/theme, rejected-save retry, and the new 200% case. Delayed drag response protection is covered by PR #73's recorded focused regression and latest main CI. |
| C-04 data and permissions | PASS | No data, attachment, authorization, account-isolation, or expense-calculation code changed after the prior focused evidence; latest main CI passed both browser projects. T4A/T4B/T5A exact-data and Emulator-only validation remains the applicable evidence. |
| C-05 PWA / offline | PARTIAL | Safe localhost production build proves manifest and initial SW registration/update root (2 passed). The existing safe install suite reproduces an update prompt blocking install controls; no two-build update conversion, cached-trip offline behavior, native iOS installation, or true iOS Safari result is claimed. |
| C-06 interface regression | PASS | No accepted layout was redesigned. The time control has current 320/390/1024 keyboard, touch, contrast/theme and new 200% evidence in both browser projects. T5A's user-confirmed native select, soft keyboard, VoiceOver, rotation and safe-area evidence remains unchanged. |
| C-07 legacy alignment | PASS | The matrix above distinguishes preserved focused evidence from external-service, PWA and device limitations. Old PARTIAL items are not promoted without new evidence. |
| C-08 trustworthy delivery | PARTIAL | Main CI is fully green at the baseline, and local focused time/PWA production evidence is recorded. The new branch must still pass its own latest-head PR and push runs; PWA install/offline/update-transition remains a release decision, not an artificial pass. |

## Test record

| Layer | Command / run | Result |
| --- | --- | --- |
| Focused E2E | `npm run test:e2e -- e2e/place-crud.spec.ts --grep "time control"` | 18 passed, 0 failed, 0 retry, 0 skipped; Emulator; Desktop Chrome + Mobile Safari. |
| Safe PWA production preview | `npm run test:e2e -- --config playwright.t5c-pwa.config.ts --grep PWA-PROD` | 2 passed, 0 failed, 2 expected project skips; production build + localhost + Emulator; Desktop Chrome only. |
| PWA diagnostic suite | same config without grep | 2 passed, 5 failed, 7 project skips; failures classified above. This is diagnostic evidence, not a passing release result. |
| Main CI | [Quality Gate 35202494320](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35202494320) at `075c2f1` | Agent guardrails, Fast quality gate, Desktop Chrome, Mobile Safari, and aggregate all successful. Chrome and Safari each finished without retry in that run. |

The normal E2E configuration blocks service workers. Its 7 PWA cases are
skipped per browser project because their exact project names are absent; this
is 7 unique PWA cases, not 14 independent successful behaviors.

## Open items and release impact

### PR #74 E2E correction — 2026-09-18

Preflight rerun: `npm run task:preflight -- --allow-feature` failed because
the shared local `main` was 18 commits behind `origin/main`. This is not
reported as PASS. The task worktree was clean before this repair, and direct
Git checks confirmed both `origin/main` and the task branch's merge base are
`075c2f1a3eb7d14aaa175ba42ba47878b6e431f5`. No other worktree was changed.

At head `15a57ef4cae1a1697f76ac431bc5f611097ebf8e`,
[push run 35205435884](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35205435884)
passed, but
[PR run 35205459571](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35205459571)
failed. The passing push run does not cancel the PR failure.

- Chrome: 189 passed, 1 failed, 7 existing PWA project skips. The single
  failed case was `spotlights desktop-only planner and map targets` in
  `e2e/whats-new-tour.spec.ts`; both configured retries also failed.
- Safari passed; the aggregate failed because Chrome failed.
- Classification: test synchronization defect, repair round 1. In the
  retry-2 trace, after the step changed to `current-day-planning`, the target
  was at x=26, but the one-shot measurement still read x=153.9375 from the
  previous sync-status spotlight. This exactly matches the previous step's
  measured spotlight. The later failure screenshot shows the frame already
  correctly surrounding the day-theme row. Retry 1 captured the analogous
  previous-step bottom (275.5 vs the required >=463.5).
- Evidence: the failed job's
  [Chrome report and traces](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35205459571/artifacts/10489918356)
  contain all three attempts; no assumption about runner/Emulator speed is
  needed to identify the stale geometry sample.
- Repair: the spec-local `expectTargetInsideSpotlight` waits for the same
  four containment conditions using `expect.poll` and its unchanged default
  assertion deadline. Target, spotlight and card are sampled in one browser
  task; the successful sample is reused by the original assertions. All
  positive-size, viewport, 1px containment, no-blur and <35% card-overlap
  assertions remain. A spotlight that stays on the wrong target still fails.
  No product code, shared helper/config, retries, timeout, skip or tolerance
  was changed.
- Local verification (separate runs, not a fabricated combined run):
  `npm run test:e2e -- e2e/whats-new-tour.spec.ts --grep "spotlights desktop-only planner and map targets" --repeat-each=5`
  passed 10/10 (5 Chrome, 5 Safari), zero failures/skips/retries;
  `npm run test:e2e -- e2e/whats-new-tour.spec.ts` passed 42/42
  (21 per browser), zero failures/skips/retries, including delayed forecast
  reflow coverage.
- `npm run verify:fast`: PASS (guardrails, TypeScript, ESLint, 108 unit test
  files / 1,238 tests, production build). `git diff --check`: PASS.

The new head must complete its own push and PR checks before delivery. The
final immutable head SHA and run results will be recorded in a PR comment
after those runs finish, rather than creating another documentation commit
that invalidates the checked head. This correction does not resolve or
reclassify the separate PWA limitations below or unrelated historical flakes.

| Item | Classification | Release impact / smallest next step |
| --- | --- | --- |
| PWA immediate update prompt blocks installation controls in specialized suite | Product behavior requiring decision | Do not conceal it in tests. A separately authorized PWA update-flow fix should define whether first install may show an update prompt and add two-build regression coverage. |
| Cached-trip offline behavior, two-build update conversion | Missing automated coverage | Build a dedicated Emulator-safe PWA scenario after the above decision; do not equate refresh of one build with update validation. |
| iOS installed PWA / native offline / update | Device-specific | Run the concrete manual steps in `T5C_MANUAL_QA.md`; WebKit emulation is not iPhone Safari. |
| Real Google Maps/Places, real Google login, external ticket app/PDF | External services/device | Retain as prior-scope limitations. They were not contacted in T5C. |
| T3 sync aggregation and local-persistence fallback | Historical architecture limitation | Not changed or reclassified by this task. |

## Rollback

Before merge, close the Draft PR; main is unaffected. After merge, inspect the
actual merge commit and create a new revert branch and PR. Do not rewrite main,
deploy, or alter users' explicitly saved business records.
