# T5B E2E follow-up — request acknowledgement and unresolved browser stalls

## Scope / preflight

Investigated Draft PR #72 head `9417f627751f79f4f37bb63a10d63e9c736ec143` on 2026-09-16. The task worktree was clean, contained current `origin/main` `b187d0a5730136478369d933f89f245f808f0df1`, and only this PR was open. Original worktrees were preserved.

`npm run task:preflight -- --allow-feature`: **FAIL**, shared local main is 10 commits behind origin/main. All other checks passed. Supplemental Git checks do not relabel the failed command.

This repair changes only `e2e/trip-deletion.spec.ts` and this document. No product, deletion/Storage lifecycle, authorization, repository, package, workflow, shared fixture, timeout, retry, worker or Playwright/Vite configuration change. Existing installed tools and demo Emulators were used; no production Firebase, secret access, merge or deployment. The Firebase skill was reviewed for Emulator safety; remote discovery/installation instructions were not applicable to this existing test environment. No Skill installed or updated.

## Original PR failure: not yet root-caused

[PR run 34995743342, attempt 1](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34995743342/attempts/1) has the explicit annotation `The job has exceeded the maximum execution time of 30m0s`. Safari was cancelled and the aggregate correctly failed. Fast gate, guardrails and Chrome succeeded.

- Last completed Safari case: `whats-new-tour.spec.ts:605`.
- Next case `:637` started at 17:00:13 UTC, completed setup hooks, but never emitted test-end before shutdown at 17:09:25. The exact blocked operation cannot be determined from these logs; no Safari artifact was uploaded.
- Before cancellation: 173 clean passes, 2 retry-passed cases (`expense-crud:455`, `realtime-sync:1090`), 7 existing skips, 6 unfinished/unstarted cases. Both original failed attempts timed out and each used one retry. These are partial-run counts, not a full pass.

The same-head [push run 34995738422](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34995738422) succeeded but was not flake-free:

| Invocation / project | Clean passed | Exhausted failed | Flaky | Existing skipped | Retries |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original PR / Chrome | 181 | 0 | 0 | 7 | 0 |
| Push / Chrome | 178 | 0 | 3 | 7 | 3 |
| Push / Safari | 181 | 0 | 0 | 7 | 0 |
| One manual PR rerun, attempt 2 / Safari | 180 | 0 | 1 | 7 | 1 |

The manual rerun restored the old head's aggregate check. Chrome/fast/guardrails were retained from attempt 1, not rerun. The Safari flaky deletion case from attempt 2 is separately addressed below. Never treat these multiple invocations as one flake-free run, or use old-head green checks as verification of the new repair commit.

## Additional localization of existing browser stalls

The three push-Chrome flakes stopped at initial `active-trip-view` readiness, showing “載入旅程模組中…”, before their actual drag/layout/map operations. Browser traces and existing localhost Vite diagnostics were correlated by timestamp/path:

| Case | Incomplete source requests in browser HAR | Matching server HTTP 200 finishes | Server duration range | Driver assertion end → caller result delay | After-snapshot |
| --- | ---: | ---: | --- | --- | --- |
| `itinerary-drag:474` | 13 | 13 | 0.130–0.546 ms | 53.603 s | missing |
| `mobile-itinerary-timeline:395` | 14 | 14 | 0.201–2.421 ms | 53.566 s | missing |
| `mobile-map-itinerary-sheet:228` (768px) | 13 | 13 | 0.172–0.677 ms | 53.630 s | missing |

Installed Playwright 1.61.1 writes its after-action event, then awaits snapshot capture before returning to the test. This localizes additional waiting to browser/protocol/after-call processing, but does not establish whether tracing caused the initial module stall or waited for an already stalled browser. HTTP server finish does not prove client receipt/evaluation. HAR status -1 is an incomplete-record placeholder, not an HTTP error. The cancelled Safari case cannot inherit a root-cause conclusion from these separate Chrome traces. No speculative product/runner/Emulator attribution or tracing workaround was applied.

## Confirmed deletion test synchronization defect — repair round 1

The manual PR rerun produced a usable [Safari artifact](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34995743342/artifacts/10426260404). `trip-deletion.spec.ts:101` first failed at line 286: expecting the confirmation dialog to disappear within the default 5 seconds immediately after clicking Delete.

Evidence:

- 00:59:14.990 UTC: Functions Emulator accepted the callable CORS preflight and began creating its `deleteTrip` worker.
- 00:59:23.125 UTC: the new worker resolved its Firebase modules, about 8.1 seconds later and after the UI assertion had already expired.
- The browser trace's delete POST was still pending. The dialog correctly showed “正在送出刪除要求，收到確認前請保持此視窗開啟。” with disabled controls. `App.jsx` intentionally closes only after a valid accepted callable result.
- Retry 1 passed with the now-started worker. This is a missing asynchronous prerequisite in the test, not evidence of failed business deletion. The reason for variable cold-start duration itself is not claimed fixed.

Repair:

1. Register a response wait before the click, scoped to the exact localhost demo callable and POST (not OPTIONS).
2. Verify HTTP 200 and accepted result with the exact room ID, nonempty deletion ID, and allowed state.
3. Then execute the original dialog-count assertion and every existing journal, room, ACL, invite, reservation, Storage, delayed-trigger, late-upload, unrelated-room and reload assertion unchanged.

No timeout value changed: callable waiting remains within the existing 45-second test deadline; the existing UI 5-second and cleanup polling limits remain. This deliberately corrects the test's timing boundary from “click” to “request acknowledged”; it does not conceal a rejected/missing response or relax data assertions. Review risk is high because an existing E2E synchronization contract changes. Incremental product risk is low: product code is unchanged.

## Local validation (separate invocations)

Environment: Windows, Node 22.22.0, Java 21.0.11, Playwright 1.61.1. Existing `demo-travel-e2e` Emulators only. `npm_config_ignore_scripts=true` reuses installed dependencies without running the functions-install prehook; it does not skip tests. `TRAVEL_E2E_SKIP_LOCAL_ENV=true` and `TRAVEL_E2E_REQUEST_DIAGNOSTICS=true` were used. No tracked files were edited during E2E execution.

| Command / version | Result | Limitation |
| --- | --- | --- |
| Old head: `npm run test:e2e -- e2e/whats-new-tour.spec.ts e2e/expense-crud.spec.ts e2e/realtime-sync.spec.ts --grep 'uses instructional steps\|新增平均分帳後\|syncs place edits between' --repeat-each=3` | 18 passed, 0 failed/flaky/skipped/retries; 3.1m | Three cases × two projects × three explicit repetitions, not automatic retries. Did not reproduce the original PR hang. |
| Old head: `npm run test:e2e -- --project='Mobile Safari'` | 181 passed, 0 failed/flaky/retries, 7 existing skipped; 14.6m | Full browser run under TEST_POLICY's CI-reproduction exception. Windows WebKit is not Linux CI or physical Safari. |
| Repair round 1: `npm run test:e2e -- e2e/trip-deletion.spec.ts --repeat-each=3` | 6 passed, 0 failed/flaky/skipped/retries; 1.3m | Original full deletion contract in both projects, repeated three times. Not proof of historical stall repair. |
| `npm run verify:fast` | PASS; 84.8s; TypeScript, ESLint, Unit/Integration and production build | Functional gate, not an additional performance measurement. Existing chunk-size/Browserslist warnings remain. |
| `git diff --check` | PASS | Existing LF/CRLF warning is not a whitespace error. |

The seven-per-project skips are the existing dedicated-PWA-project guards. No new skip, removed case, weakened assertion, forced click, arbitrary sleep, timeout increase or retry-policy change.

## Evidence and remaining scope

- CI traces/reports: artifacts on the linked runs, accessible to repository reviewers during the existing 14-day retention. Local command logs and reports are under ignored `.tmp/ci72/`; a private Windows path is not presented as remote evidence.
- **Repaired within scope:** deletion test waits for authenticated request acknowledgement before checking its post-request UI state; exact cleanup protections remain.
- **PARTIAL / unresolved:** intermittent initial module loading and after-call snapshot stalls. Neither the unchanged old-head rerun nor this unrelated deletion test repair establishes their root cause.
- Latest repair-head CI must be reported separately in the PR; old-head results cannot substitute for it. No full local E2E rerun after the test-only repair; directly affected case passed in both projects, and full new-head regression is delegated to existing PR CI.
- T5B performance conclusions, product behavior and all inherited T2/T3/T4A/B0/PWA limitations are unchanged. No new manual product QA required by this test-only repair.
- Rollback this follow-up with a new revert commit/PR if needed. Do not rewrite main or deployed history, deploy automatically, or undo user-submitted business records.
