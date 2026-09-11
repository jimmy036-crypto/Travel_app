# T4A CI follow-up — bounded fixes, unresolved module-load stalls

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
