# T4B-0 CI follow-up — explicit payer contract and unresolved browser stalls

## Scope and baseline

Investigated PR #67 head `99a1d831ee18b163867daabb3e3729cba4eb4aa4` on 2026-09-12. The existing task worktree was clean and matched the remote feature branch; `origin/main` was `9c94b9c94b1b5f53a4d533394fb4148fdbc3ceca`, already contained in the branch. Only this Draft PR was open. Original unrelated worktree files were preserved.

`npm run task:preflight -- --allow-feature` returned **FAIL** because shared local main was 10 commits behind fetched origin/main. Clean worktree, feature/upstream, fetch and tool checks passed. Supplemental checks are not a relabeling of the failed preflight; local main was not reset.

This follow-up changes only `e2e/unified-example-trip.spec.ts` and verification documents. No product code, amount algorithm, data model, Firebase/Storage/Auth contract, shared fixture, package, CI, reporter, Vite or Playwright configuration change. No Skill installation/update, production test or deployment. Existing demo-only Emulator tools and request diagnostics were reused. No tracked-file edits occurred during E2E execution.

## Confirmed failure: missed test contract — repaired

The original `local example persists itinerary and expense edits with zero cloud writes` case filled the item and amount, then saved without choosing a payer. T4B-0 intentionally removed the automatic first-member payer. The correct product response is `請選擇付款人。`, not a saved expense.

Both CI projects failed this case on the original attempt and both retries in each run below. A fresh local invocation reproduced both failures before repair: **0 passed / 2 failed / 0 retries**. This is a deterministic missed test update, not a Firebase write failure or a flaky expense save. The initial implementation's related-suite selection missed this demo path; updating the other expense suites was insufficient.

Repair round 1 keeps the original case and all original itinerary, reload and cloud-isolation assertions. It now:

1. Verifies an unconfirmed new payer is blank; save reports the exact validation message and leaves the entire persisted expense array unchanged.
2. Explicitly selects the original fixture's payer, `自己`, without confirming companion identity.
3. Verifies exactly one added record, payer `自己`, cost/localCost `900`, currency `TWD`, exchangeRate `1`, and an **exact** split object of `自己:300`, `旅伴 A:300`, `旅伴 B:300`.
4. Compares every prior expense unchanged, opens another new form to prove the in-memory companion remains unconfirmed, and checks no versioned companion preference was written.
5. Reloads and compares the complete expense array exactly. Original no-cloud-room, no-Storage-object, no-example-cloud-artifact, local-trip-list and offline-cache assertions remain.

The added IndexedDB helper is read-only and local to this suite; it uses the existing envelope/storage contract and closes its database connection. No shared fixture or test-only product mutation was introduced. Independent review strengthened split equality (not subset matching) and the next-form check before the final full run. Other existing E2E new-expense entry points were inspected; no additional implicit-first-payer save was found.

## Original CI: incomplete, not an all-pass result

- [Push run 34677445698](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34677445698), [artifact](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34677445698/artifacts/10293416173).
- [PR run 34677448341](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34677448341), [artifact](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34677448341/artifacts/10293570925).

Both fast gates and guardrails passed. Both E2E jobs were cancelled with the explicit **30m0s maximum execution time** annotation. Both were still progressing near cancellation. Their expected suite size was 368, with one worker and two CI retries.

| Original run | Passed attempts | Failed assertion attempts | Timed-out attempts | Existing skipped | Retry starts |
| --- | ---: | ---: | ---: | ---: | ---: |
| Push | 325 | 6 | 2 | 14 | 6 |
| PR | 335 | 6 | 1 | 14 | 5 |

These are completed-attempt counts, not final suite totals. Before cancellation, push had 323 clean-passed cases, 2 retry-passed/flaky cases, 2 exhausted failures, 14 skips and 27 incomplete/unstarted cases. PR had 334 clean passes, 1 retry-passed/flaky case, 2 exhausted failures, 14 skips and 17 incomplete/unstarted cases. The new companion suite passed 20/20 in each original run. Never combine runs/retries into a fictional full pass.

Failed/timed-out attempt durations alone total roughly 181.5s (push) and 116.8s (PR); these sums exclude successful retries and other overhead. Fixing the deterministic case does not prove all job-budget or intermittent-stall causes are resolved. The unchanged job limit also includes dependency/browser installation and startup.

## New localization: request completion versus browser snapshot responsiveness

The other retried failures occurred during initial trip readiness: push Chromium tour, push WebKit mobile itinerary, and PR Chromium realtime. They were not failures of ticket CRUD or deletion assertions.

UTC-correlated Vite diagnostics show:

| Failed attempt | Browser HAR incomplete `/src` requests | Matching server receipt + finish in the failed window | Maximum matching server duration |
| --- | ---: | ---: | ---: |
| Push Chromium tour | 13 | 13 | 0.843ms |
| PR Chromium realtime | 16 | 16 | 2.748ms |
| Push WebKit mobile itinerary | 13 | 1 | 0.741ms |

For WebKit, the other 12 requests have no matching server receipt within the failed attempt window. Files span companion/ticket/itinerary/map/Parking modules, not one failed module. Whole-run logs have paired request-start/response-finish counts (push 58,112; PR 58,879), no response-close events and no truncation. A server finish does **not** prove the browser received/evaluated the module. HAR `status=-1` is an incomplete-record placeholder, not an HTTP error.

Trace action timing gives a more precise location for additional waiting:

| Failed attempt | Driver action outcome | Delay from driver end to test receiving its result | Final declared after-snapshot |
| --- | --- | ---: | --- |
| Push Chromium tour | Visibility assertion timed out normally after 20s | 37.734s | Missing (`call@681` / `expect@29`) |
| PR Chromium realtime | Route-attribute assertion **succeeded** | 54.852s | Missing (`call@11545` / `expect@23`) |
| Push WebKit mobile itinerary | Visibility assertion timed out normally after 5s | 49.283s | Missing (`call@7616` / `expect@63`) |

Installed Playwright 1.61.1 records driver end, awaits `instrumentation.onAfterCall`, then returns the result; tracing writes the after-event before waiting for its frame snapshot. The traces show no matching final snapshot and screencast activity stops around boot/import loading. In the realtime case, the next `active-trip-view` assertion only starts during cleanup after that earlier successful assertion finally returns; its headline error is therefore misleading.

This localizes additional delay to browser evaluation/protocol responsiveness and after-call instrumentation. It does **not** establish whether snapshot capture caused the initial stall or waited on an already-stalled browser. No recorded console error, dialog, browser crash, Vite transform failure or OOM establishes a deeper cause. Do not disable tracing, extend timeouts, warm modules, change workers, upgrade packages or refactor TripDetail speculatively.

Push and PR workflows have different concurrency refs and separate hosted runners. Duplicate runs consume resources, but there is no evidence they share port 4174 or one Emulator. Windows local passing does not establish that Linux CI stalls are fixed.

## Local verification chronology

| Invocation | Actual result | Classification / retry distinction |
| --- | --- | --- |
| Original-case reproduction, first startup | **0 tests executed** | Functions discovery hit its existing 10s limit, then webServer readiness hit 120s. Environment startup failure, not a passed run. No configuration change. |
| Same original case, separate manual invocation | **2 failed** (Chrome + WebKit) | Both reproduce missing payer; 0 automatic retries. |
| Repair round 1, four related suites | **46 passed**, 0 failed/flaky/skipped, 3.6m | Unified example, companion, expense CRUD and settlement; 0 automatic retries. |
| Independent review | Two stronger checks added | Exact split equality and a fresh blank-payer form; no failing assertion weakened. |
| Final `verify:full` | **PASS**: 106 Unit/Integration files / **1161 tests**, TypeScript, ESLint, build; E2E **354 passed / 0 failed / 0 flaky / 14 existing skipped**, 0 retries | E2E 21.6m; whole verification 1402.9s. One complete invocation of the final test version, not combined batches. |
| Pre-commit `npm run verify:fast` | **PASS**, 106 files / 1161 tests, TypeScript, ESLint and build; 72.3s | Separate pre-commit invocation; not added to the full-run totals. |
| `git diff --check` | **PASS** | No whitespace errors; existing LF/CRLF conversion warnings are not failures. |

```powershell
$env:TRAVEL_E2E_SKIP_LOCAL_ENV='true'
npm --ignore-scripts run test:e2e -- e2e/unified-example-trip.spec.ts --grep 'local example persists itinerary and expense edits'
npm --ignore-scripts run test:e2e -- e2e/unified-example-trip.spec.ts e2e/companion-identity.spec.ts e2e/expense-crud.spec.ts e2e/expense-settlement.spec.ts
$env:TRAVEL_E2E_REQUEST_DIAGNOSTICS='true'
npm --ignore-scripts run verify:full
```

The first command has two separate invocations in the chronology above. Full local verification is justified by TEST_POLICY's failed-CI reproduction exception. `--ignore-scripts` reuses installed dependencies and skips the functions-install prehook, not tests. Existing CSS parse, chunk-size and Browserslist warnings remain. Node 22.22.0 / Java 21.0.11 major versions match CI's Node 22 / Java 21, but Windows/browser caches differ from a fresh Ubuntu runner; local retries are 0 versus CI's 2.

## The 14 skips are a coverage limitation

All 14 are pre-existing `pwa-install.spec.ts` skips: seven scenarios in both default projects. They require project names `PWA Desktop Chrome` / `PWA Mobile Safari`, while this command uses `Desktop Chrome` / `Mobile Safari`. The dedicated `playwright.pwa.config.ts` exists, but neither `verify:full` nor the current workflow invokes it. Manifest, service-worker/update and installation browser scenarios were therefore **not run**, not passed. This follow-up adds no skip and does not change PWA configuration or test scope.

## Evidence, remaining work and review

- The original CI artifacts above are accessible to authorized repository reviewers during GitHub's 14-day retention. Local red traces, targeted HTML report, full HTML report/diagnostics and command logs were retained under ignored `.tmp/ci-analysis-67/`; a local Windows path is not a remotely accessible artifact. This committed report preserves sanitized findings/counts, not real account, invite or ticket data.
- New-commit GitHub checks must be read independently from the PR. The original cancelled checks are not retroactively passed by this repair or the local full run.
- **PASS within local scope:** deterministic demo-expense contract, exact persisted values/history, blank next payer, no companion confirmation, and existing cloud-isolation checks.
- **PARTIAL:** overall CI reliability. The Windows full run did not reproduce the Linux browser/snapshot stall; its initiating cause and variable overall CI runtime remain unresolved.
- Existing T2/T3/T4A/B0 device, Google/Places, deployment-smoke, offline/race and partial sync/data-mode limits remain. No PWA, physical iPhone/VoiceOver/soft-keyboard or production claim.
- Incremental product risk: low (no product code change). Test review risk: high (existing E2E contract/assertions); review the deliberate explicit-payer transition. The original PR's payer/completedBy and account-isolation business risks are unchanged.
- Unmerged: close Draft PR, or revert this follow-up in a new commit if only this test change is unwanted. After merge, inspect actual merge method and create a revert branch + PR. Never rewrite history, deploy automatically or undo user-submitted expense/checklist records.
