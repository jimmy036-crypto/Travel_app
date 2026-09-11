# T3 CI diagnostics follow-up

## Observed failure (head `6be3b664`)

- [PR run 34507548309](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34507548309): E2E cancelled. GitHub annotation: job exceeded 30 minutes. Last completed test was Mobile Safari `storage-emulator.spec.ts`; the available log does not identify the subsequent blocked operation.
- [Push run 34507524154](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34507524154): 309 passed, 5 flaky, 14 skipped. The five flaky cases used six retries in total. This does not prove their root causes are fixed.
- Neither run has downloadable artifacts. The previous `failure()` upload condition omitted success-with-retries and did not preserve this cancelled run.

## Authorized diagnostic changes

The user explicitly authorized GitHub Actions / Playwright diagnostic settings on 2026-09-11.

- Upload existing HTML reports and `test-results` using `always()`, including successful runs with failed attempts.
- Add a reporter emitting timestamped test/hook start/end events, project, source file/line, worker, retry, duration and status to the job log. It intentionally excludes titles, step arguments, URLs, form values and error payloads.
- Keep the 30-minute job limit, 45-second test limit, retry policy, single worker, Emulator startup, fixtures and assertions unchanged.
- Cancellation uploads are **best effort**. A hard runner termination can prevent the upload step or final HTML report from completing. Already-streamed job progress is the fallback evidence; this change cannot guarantee a trace for a forcibly killed test.

## Local validation

- Reporter unit test: 1 passed; checks failed/retried event metadata and excludes sensitive payloads.
- Workflow parsed with the already installed YAML library; asserted `always()` and unchanged 30-minute job limit.
- `npm run verify:full`: PASS, 1149.1 seconds. Typecheck, lint, unit and build passed. Full Chromium + WebKit E2E: **314 passed, 0 failed, 0 flaky, 14 existing skipped, 0 retries** (17.9 minutes).
- `npm run verify:fast`: PASS, 54.0 seconds; 102 unit files / 1098 tests. `git diff --check`: PASS.
- Local run used `TRAVEL_E2E_SKIP_LOCAL_ENV=true` and the existing `demo-travel-e2e` Emulator configuration. No production Firebase or credentials accessed.
- No CI hang was reproduced locally. The root cause of the previous CI hang/flakes remains unproven. The new GitHub run must separately verify progress output and artifact availability.
- Preflight command: `npm run task:preflight -- --allow-feature`; FAIL because local `main` is two commits behind `origin/main`. Supplemental checks confirmed clean task worktree before changes, only this PR open, and current task HEAD contains latest `origin/main` (`edfe08366cdc4ee31a19850ef77a1ba67ab235af`). No unrelated checkout or branch was reset.

## Review and rollback

Product behavior is unchanged by this follow-up. CI/test-infrastructure review risk is high; review the two configuration changes and reporter separately from T3 UI changes. Existing T2/T3 manual, external-service and flaky-investigation gaps remain open.

Revert this follow-up commit with a new branch and PR if necessary; do not rewrite pushed history, merge automatically or deploy.

## Follow-up: reproduced desktop density defect

The diagnostic commit produced usable artifacts on both runs:

- [Push run 34548957964](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34548957964): 312 passed, 1 failed, 1 flaky, 14 skipped. WebKit desktop density failed on all three attempts; external-app ticket multi-context flow passed after one retry.
- [PR run 34548960957](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34548960957): 313 passed, 1 flaky, 14 skipped. Chromium desktop density passed after one retry. Neither run hit the job timeout.

### Root cause and bounded fix

The desktop day header inserted weather in a separate row after its asynchronous response. That row reduced the itinerary viewport enough to clip the fourth basic card at 1440×900. The existing density test used live Open-Meteo, so its outcome depended on forecast availability/timing for the seeded dates.

First, only the test was changed to supply a fixed successful forecast and explicitly wait for its text. Both Chromium and WebKit then failed the unchanged four-card assertion locally. This is a **product layout defect with nondeterministic test input**, not justification to lower the assertion.

Repair round 1: move the existing desktop weather label into the date row's available horizontal space, allow wrapping under text scaling, and use the existing 12px label size instead of 10px. No card size, action target, mobile header, map provider, data model or weather fetch logic changed. The original four-card minimum and 112px card-height maximum remain intact.

- Original density suite after repair: 4 passed (45.5s).
- Density with forecast + delayed forecast / 200% text + external ticket multi-context flow, each twice in Chromium and WebKit: 12 passed (1.4m), 0 failed/flaky/skipped/retries.
- Final five related suites (desktop density, app-shell, offline awareness, realtime sync, mobile itinerary timeline): **68 passed** (5.4m), 0 failed/flaky/skipped/retries.
- `npm run verify:fast`: PASS (83.3s; 102 files / 1098 unit tests, typecheck/lint/build). `git diff --check`: PASS. No configuration/shared-fixture change in this repair; full E2E is left to the new PR CI run per TEST_POLICY.
- New delayed-forecast regression checks four fully visible cards both before and after the response, weather bounds at HTML font-size 200%, no overlap with Add, and successful details opening.
- [Before](evidence/t3/desktop-density-weather-before.png) / [After](evidence/t3/desktop-density-weather-after.png): synthetic data, WebKit 1440×900 CSS pixels. Google Maps displays the existing test-environment warning; these captures certify itinerary layout, not real Places/Maps integration. The fourth card is fully visible after the fix.

### Separate unresolved ticket flake

The failed ticket attempt's trace points to `e2e/support/tickets.ts:91`, waiting for `active-trip-view` before CRUD starts. Its screenshot is blank; the later `context.close` error is not evidence that ticket mutation failed. Repeated local runs pass without changes. The available evidence does not establish a product, browser or runner root cause. No ticket logic, shared fixture, retries or timeouts were changed. This remains a tracked investigation, not a claimed fix.

Skills used: ui-ux-pro-max's targeted async layout-shift guidance, Impeccable's narrow adaptation reference (engine not launched to avoid unauthorized downloads), and Web Interface Guidelines. MASTER remains authoritative. No skills installed/updated. No PRODUCT.md or DESIGN.md exists in this worktree; existing code and before/after captures provide the visual baseline.
