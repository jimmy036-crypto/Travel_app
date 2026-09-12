# T4A CI follow-up — bounded fixes, unresolved module-load stalls

The sections through “Scope, skills and review” record repair commit `6a27460`. The later, separately authorized instrumentation and its verification are recorded under “Authorized request-boundary diagnostics”; earlier statements about unchanged CI/Vite settings describe only that earlier repair.

## Baseline and actual CI result

Investigated head `5ab0711d7ff935d8454d48ce26ad65ffa533849a`, Draft PR #66, on 2026-09-12 (Asia/Taipei). Task worktree was clean and matched the pushed task branch. `npm run task:preflight -- --allow-feature` returned **FAIL** solely because shared local main remains six commits behind fetched origin/main; branch/upstream/clean worktree checks passed. This is a continuation on the existing feature, not a new stacked PR. Only PR #66 was open.

- [PR run 34622932273](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34622932273), [artifacts](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34622932273/artifacts/10273692849).
- [Push run 34622917193](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34622917193), [artifacts](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34622917193/artifacts/10274303120).
- Fast quality gate and guardrails passed; **both E2E jobs were cancelled around the unchanged 30-minute limit**. They did not finish their full suite. This supersedes the initial handoff's “CI running”, not its separate local results.
- Both jobs were still progressing near cancellation. PR completed WebKit `unified-example-trip:114` at 17:06:14.590Z and entered `:153`; push completed WebKit `offline-trip-preview:268` at 17:06:11.082Z and entered `:314`. The final test is not evidence of an infinite hang.

Attempt counts, not final suite totals:

| Run | Passed attempts | Failed assertions | Timed-out attempts | Existing skipped | Retry attempts |
|---|---:|---:|---:|---:|---:|
| PR | 308 | 3 | 4 | 14 | 7 |
| Push | 260 | 0 | 7 | 7 | 7 |

Each run has six completed cases which needed retries. PR failed attempts consumed about 253.7 seconds; push about 401.2 seconds, with additional teardown delays of roughly 14–31 seconds on some attempts. Later retry passes do not demonstrate their root causes are fixed. Do not sum the two cancelled runs into an all-pass result.

## 1. Offline preview: reproduced test setup bug — fixed

CI failed `offline-trip-preview.spec.ts` → `Uncached trip and reconnect behavior` twice before passing. The cache had already been read and validated, the card click completed, then the page showed “離線資料已損壞、失效或需要重新連線開啟。” before reconnect began.

The suite's `prepareAccountCache()` registered an unconditional `localStorage.removeItem` with `page.addInitScript`. Playwright runs that script for child frames as well. Firebase's existing RTDB long-poll fallback creates a same-origin blank iframe; both CI traces show the offline WebSocket failure and long-poll fallback. The trace alone does not contain the removeItem stack, so a deterministic browser reproduction was added:

1. Build the real canonical offline cache through the existing UI/Emulator path.
2. Return to the lobby and go offline.
3. Attach a synthetic same-origin blank iframe, await its load and immediately inspect cache.
4. Before repair, the cache-presence assertion fails. This directly confirms test-induced deletion without changing product data/cache code.

Repair round 1: limit only this suite's initialization cleanup to `window === window.top`. Keep all original uncached/cached/reconnect/cloud-data assertions. No shared fixture, App, cache format, Firebase SDK or repository change.

## 2. Tour spotlight: stale geometry after header reflow — fixed locally

CI failed `whats-new-tour.spec.ts` → `keeps the active tour target clear and inside the spotlight` at the place-details step:

- Target title: y=435, height=40; its bottom needs containment to at least 474 with the existing one-pixel tolerance.
- Spotlight: top=416, height=56, bottom=472, corresponding to the previous target y=424.
- Trace snapshots around `call@4258` show the header weather changing from unavailable to `25~31°C`, shifting the target approximately 11px.
- FeatureTour updated on step/window resize/scroll, but not when an ancestor's size changed after asynchronous content arrived. The title itself stayed the same size.

Repair round 1: observe the resolved target and its ancestor layout chain with ResizeObserver; batch callback updates onto the next animation frame and disconnect/cancel on cleanup. No new animation, header, weather calculation, theme or navigation change. Existing window resize/scroll behavior remains.

Evidence distinctions:

- New Unit regression failed before repair (19 passed / 1 failed), then passed (20/20); it verifies ancestor observation, shifted target geometry and disconnect.
- A controlled forecast browser case passed even before the product fix on Windows. It is **not** reported as a locally reproduced weather failure; the original Linux CI trace provides that evidence.
- The browser case now holds and releases a fixed forecast, checks containment after response, and retains the original viewport, one-pixel tolerance, overlap <0.35 and no-blur assertions.
- The helper samples target/spotlight/card geometry in one browser task instead of three protocol round trips. It still selects the first target and strictly checks tour/spotlight/card visibility; positive width/height checks replace the old non-null box guard. No containment assertion was relaxed.
- The new observer chain is established per step. This does not certify all later asynchronous shifts after crossing a mobile/desktop breakpoint mid-step.

## 3. Shared module-load stalls: NOT resolved

Eight downloaded traces across the two runs show a distinct pattern before feature interactions:

- `/src/TripDetail.jsx` itself returned HTTP 200 (approximately 15.9–51.6ms).
- Between 9 and 34 dependent JavaScript requests then have no recorded completed response, spanning common UI, itinerary, map, ticket and package modules, not one fixed file.
- Representative ticket trace: TripDetail completed in 15.885ms, then the DnD package completed in 11.32ms; 33 other imports were registered within about 4ms and remained incomplete. The page stayed at “載入旅程模組中…”, before ticket CRUD.
- HAR `status=-1`, timings=-1 are Playwright's initial placeholders, **not** HTTP error responses from Vite. There is no failureText or server-side receipt evidence.
- No matching Vite transform error, HMR reload or dependency re-optimization was recorded. The only optimization message was startup's existing `--force`.
- Setup hooks had completed. No evidence ties all failures to Emulator seed, Storage writes, reporter promises, socket limits or a specific product module.

Therefore these two bounded fixes do **not** establish that the full CI timeout/flake problem is fixed. Do not add warmup, longer timeouts, retries, different workers, production shortcuts or a large TripDetail refactor as a speculative remedy.

If the existing rerun evidence remains insufficient, further CI/Vite/shared instrumentation requires separate authorization. Minimal proposed diagnostics: correlate only localhost:4174 request **pathname**, request start/end time and HTTP status with browser requestfinished/requestfailed. Exclude queries, headers, bodies, credentials and tokens. This would distinguish “browser did not send” from “server received but did not complete”. No such configuration change is included here.

## Local verification chronology

1. Initial focused command ran **zero tests**: Functions discovery hit its existing 10-second timeout, then webServer readiness hit the existing 120-second limit. Classified environment startup failure; no timeout/config change. A separate invocation started successfully.
2. Deterministic red E2E: **1 failed** (new iframe/cache assertion), **1 passed** (controlled tour case), 32.8s, no retries.
3. Red Unit: **19 passed / 1 failed**; after product repair **20 passed**, 4.34s.
4. Focused repair run: three scenarios × two browsers × two intentional repetitions = **12 passed**, **0 failed / 0 flaky / 0 skipped / 0 retries**, 1.3m. Scenarios: offline reconnect+iframe, controlled tour spotlight, external App Link CRUD. Intentional repetitions are not retries.
5. Final `npm run verify:fast`: **PASS**, 103 Unit/Integration files / **1108 tests**, TypeScript, ESLint and build; 48.2s. Existing build/Browserslist warnings remain.
6. Full affected suites (`offline-trip-preview`, `whats-new-tour`, `external-app-ticket`): **76 passed** (38 Chromium + 38 WebKit), **0 failed / 0 flaky / 0 skipped / 0 retries**, 4.5m. Separate from the 12-case intentional repetition run above and the original T4A 96-case run.
7. `git diff --check`: **PASS**. This follow-up does not claim that the full GitHub E2E gate or the shared module-load stall is resolved. New commit checks must be read separately after pushing.

```powershell
$env:TRAVEL_E2E_SKIP_LOCAL_ENV='true'
npm run test:e2e -- e2e/offline-trip-preview.spec.ts e2e/whats-new-tour.spec.ts e2e/external-app-ticket.spec.ts --grep 'Uncached trip and reconnect behavior|keeps the active tour target clear|runs external App Link create' --repeat-each 2
npm run verify:fast
npm run test:e2e -- e2e/offline-trip-preview.spec.ts e2e/whats-new-tour.spec.ts e2e/external-app-ticket.spec.ts
git diff --check
```

All browser tests use existing demo Emulators and `TRAVEL_E2E_SKIP_LOCAL_ENV=true`. No tracked-file writes while E2E runs. Full local regression was not substituted for the targeted diagnosis; full GitHub CI is still a separate, uncompleted verification. No production Firebase, deployment, secrets, dependency, rules, CI, reporter, Vite or Playwright configuration changes.

## Scope, skills and review

- Product change: only `src/components/FeatureTour.jsx` (localized position observation).
- Tests: its existing Unit file plus `offline-trip-preview.spec.ts` and `whats-new-tour.spec.ts`. No test removed/skipped or timeout/containment tolerance relaxed.
- ui-ux-pro-max local async-layout-shift guidance, Impeccable narrow hardening guidance and Web Interface Guidelines informed the local update/cleanup review; MASTER remains authoritative. No skill download/update/installation or launcher download.
- Product risk: medium (tour positioning). Test review risk: high (existing E2E assertions/setup). Previous T4A device/PDF/theme/200% limitations remain unchanged.
- Unmerged rollback: close Draft PR. To undo only this follow-up after merge, verify the actual merge method/commit and create a new revert branch + PR; no history rewrite or automatic deployment.

## Authorized request-boundary diagnostics — 2026-09-12

The user explicitly replied “授權” to the request for minimal CI/Vite request diagnostics, excluding timeout/retry/parallelism changes and logging of tokens, headers or content. This authorizes the following instrumentation, not speculative changes to Vite optimization, product bootstrapping, Firebase or CI scheduling.

Fresh `npm run task:preflight -- --allow-feature`: **FAIL**, shared local main still six commits behind fetched origin/main. The task worktree was clean at head `6a27460`, matched its upstream, contained fetched main `fedd9936dba987d560fbb1dc7dfdc88889cabb1a`, and PR #66 was the only open PR. No other branch/worktree was reset. This infrastructure-only follow-up did not use UI redesign skills; the Firestore Skill was read for the existing Emulator test scope, without cloud queries or installation. No Skill was installed or updated.

### Latest completed CI, before instrumentation

Head `6a27460f85ab415dbe0fe76bdffc157e744229e2`:

| Run | Actual termination | Completed attempts | Retries |
|---|---|---|---|
| [PR 34628366561](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34628366561) | Cancelled at the unchanged 30-minute job limit | 322 passed / 3 timedOut / 14 existing skipped | 3; all three later passed |
| [Push 34628364631](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34628364631) | Runner shutdown signal after about 18m15s; **not** the 30-minute limit | 208 passed / 2 timedOut / 7 existing skipped | 2; both later passed |

These are incomplete attempt counts, not a final suite pass. The push run has no artifacts and its last in-progress test has no final result; the logs do not identify who or what caused the shutdown. The [PR artifact](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34628366561/artifacts/10276417438) contains useful failed-attempt traces.

- Chromium `editable-demo-clone:104` and `offline-trip-preview:314` both stall in their initial `active-trip-view` wait, after TripDetail returns HTTP 200. The offline case has **not reached offline/reconnect**, so this is not a recurrence of the repaired iframe/cache deletion.
- Both traces show the same eleven unfinished `/src` requests: SettlementPanel, ItineraryTimelineCard, TransitTimelineRow, mapItineraryModel, MapItinerarySheet and six parking modules. HAR alone still cannot locate the server/browser boundary.
- WebKit `realtime-sync:940` opens its first context successfully, but the second waits for `active-trip-view` before the deletion mutation starts. Its trace lacks the same pending-request records; do not assume an identical cause.
- The repaired spotlight case passed without retry in Chromium in both runs. WebKit did not reach that case before termination. Offline/reconnect passed in push Chromium and PR WebKit; PR Chromium passed on retry after the separate bootstrap timeout.

### Minimal implementation and privacy boundary

- `.github/workflows/quality-gate.yml`: add only `TRAVEL_E2E_REQUEST_DIAGNOSTICS: 'true'` to the existing E2E step. Same command, runner, job limit, retry/worker policy and artifact upload.
- `vite.config.js`: register one server-only diagnostic plugin. No product/client code, dependency optimization, warmup, routing or proxy change.
- `scripts/vite-request-diagnostics.mjs`: activate only for **serve + emulator mode + exact opt-in + demo-travel-e2e + Emulator flag + 127.0.0.1:4174 + strictPort**. All checks precede filesystem I/O. Normal development/build/preview do not acquire a new diagnostic endpoint or client script.
- The middleware observes only code/module pathnames: `/src/...` JS/TS/CSS, `/node_modules/.vite/deps/...js` including scoped-package filenames, and Vite/React refresh clients. It rejects arbitrary routes, filesystem URLs, encoded/backslash/control-character/dot-segment paths, hidden files and overly long paths. Query strings/fragments are removed; headers, bodies, tokens, credentials, error payloads and arbitrary data URLs are not read into the records.
- JSONL fields are limited to event, server-local sequential request id, pathname, epoch time, duration and HTTP status. No correlation header or extra browser request is injected. Existing Playwright traces remain the browser-side evidence; no fixture, route interception, reporter or Playwright config change.
- Output is `test-results/vite-request-diagnostics/vite-<epoch>-<pid>.jsonl`, already ignored and already covered by the non-hidden `test-results/` artifact path. Installed Playwright clears output **before** starting its web servers. No broad hidden-directory upload was added.
- Asynchronous file writes are capped at 64 MiB, with a reserved truncation marker and a 1 MiB buffer threshold. If disk I/O fails or bounds are reached, diagnostics stop with a fixed warning; application requests are not paused waiting for disk/drain. No raw error is logged. Remaining records are then unavailable, not evidence of absent requests.

### How to interpret the evidence

| Server evidence matched by pathname/time to a browser trace | Supported interpretation |
|---|---|
| `request-start`, no terminal row before a test fails | The request reached this middleware, but no completed server response is recorded before failure. This alone does not prove a deadlock. |
| `response-finish`, browser trace still unfinished | Server output completed its handoff; browser receipt/processing or trace completeness still needs investigation. |
| `response-close` before finish | The response closed early, possibly because navigation/test teardown cancelled it; not automatically a server defect. Status is null if no headers were sent. |
| Browser pending request, no matching server start | No evidence it reached the observed middleware; this does **not** alone prove the browser never sent it. Check filtering, other middleware, log availability and truncation. |

Node's [ServerResponse finish/close semantics](https://nodejs.org/api/http.html#class-httpserverresponse) do not certify that the client received or evaluated the response. Vite's [configureServer hook](https://vite.dev/guide/api-plugin.html#configureserver) installs this middleware before its transform middlewares; teardown uses `httpServer.close`, not the hook's returned post-install callback. A forced process/runner shutdown can omit the final log tail or prevent artifact upload. Request ids are local to each server file; no unique browser/server id was injected, so same-path concurrent requests require careful timestamp correlation.

### Executed validation

- New diagnostic Unit tests: **33 passed**. Covers opt-in/build/project/host/port gates, safe scoped dependency paths, denied paths, no sensitive fields, one `next()`, finish/close deduplication, null pre-header status, filesystem/stream failure, file/buffer caps and cleanup. Existing progress reporter test also passed separately.
- Harness repair history: initial mock omitted the `node:fs` default export (**0 tests**, suite import failure); the next partial mock left that default bound to real fs (**24 passed / 6 failed**). Second repair mocked named and default exports consistently; **30 passed**, followed by cap/scoped-path additions and **33 passed**. These were test-harness defects, not application or Emulator failures; no assertion was relaxed.
- That intermediate mock generated six small synthetic JSONL files under `C:\synthetic-repo\test-results\vite-request-diagnostics`. Automatic cleanup was denied by the execution environment; these contain only synthetic test records and remain for manual cleanup. The fixture root now resolves inside the worktree's ignored `.tmp`, and the corrected tests mock all writes. No user file was overwritten or removed.
- Workflow parsed successfully; asserted the exact opt-in flag and unchanged E2E command, 30-minute job limit, 45-second test timeout, two CI retries and one worker. No diagnostic code/flag was found in built client JS.
- **`npm run verify:full`: PASS**, 1219.8s overall. TypeScript, ESLint, build and **1141 Unit/Integration tests / 104 files** passed. Full E2E: **334 passed** (167 Chromium + 167 WebKit), **0 failed / 0 flaky / 14 existing skipped / 0 retries**, 19.3m. This was one complete local run with instrumentation enabled, not combined runs.
- The actual diagnostic artifact survived full teardown: **14,134,290 bytes**, **111,175 records**, **55,587 request starts and 55,587 response finishes**, no unmatched requests, no truncation. Counts include one explicit read-only module GET used to verify logging, not only browser E2E requests. Statuses: 45,043 HTTP 200 / 10,544 HTTP 304. All paths/field names passed a post-run allowlist check. No server-close row was emitted by forced process teardown; do not invent one.
- Separate final `npm run verify:fast`: **PASS**, 91.4s, 104 files / 1141 tests plus typecheck/lint/build. `git diff --check`: **PASS** before commit.

```powershell
$env:TRAVEL_E2E_SKIP_LOCAL_ENV='true'
$env:TRAVEL_E2E_REQUEST_DIAGNOSTICS='true'
npm run verify:full
npm run verify:fast
git diff --check
```

Full E2E was run because this follow-up changes CI/Vite diagnostic infrastructure. No tracked-file edits occurred while it ran. Local logs/artifacts are not presented as remotely accessible CI evidence; the next GitHub run must separately confirm upload and provide Linux request-boundary evidence. Local full PASS does not resolve the CI stall or inherited T4A-10 PARTIAL status. Product risk is low for this addition (server-only opt-in observer); infrastructure/test-review risk is high. Earlier T4A product changes retain their medium risk. No deployment, production Firebase, secret file, package/lockfile, model/rules, T4B or unrelated worktree change.
