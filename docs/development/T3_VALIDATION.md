# T3 — Lobby, collaboration and sync feedback

Base: `edfe08366cdc4ee31a19850ef77a1ba67ab235af` (includes T1 PR #61, T2 PR #63 and PR #64).
Branch: `fix/travel-t3-lobby-collaboration-ux`.

## Preflight and boundaries

- Original checkout was on another feature branch with user-owned untracked files. Nothing there was stashed, reset, cleaned or edited.
- Created a clean T3 worktree from the freshly fetched `origin/main`. `npm run task:preflight -- --allow-feature` passed before edits. The continuation check failed only for this task's uncommitted files; all other checks passed.
- On September 11, fetched main again: PR #64 was merged and no PR remained open. Its four changed files do not overlap T3. Fast-forwarded this unpushed T3 branch from b42af78 to edfe083, preserving all T3 work. No stacked PR or history rewrite.
- Resume preflight reported task-owned uncommitted files and an outdated main before the fast-forward. It was not labelled PASS; direct Git checks confirmed the exact branch, base and non-overlapping changes.
- No package/lockfile, Firebase rules/config/schema, repository API, deployment or production-data changes. `npm ci --ignore-scripts` restored the committed dependencies inside this worktree only. Existing dependency audit warnings were not auto-fixed.
- Installed skills checked: ui-ux-pro-max, impeccable, web-design-guidelines. vercel-react-best-practices and Playwright Skill were not found. No skills installed/updated. Existing Playwright used directly.
- MASTER remained authoritative. Skills informed loading/error copy, native semantics and scoped polish. Firestore Skill was read because existing fixtures use its Emulator; no cloud database discovery/provisioning was run.
- Impeccable mechanical detector reported one pre-existing export/print accent-border warning in TripDetail. That unrelated export styling was left unchanged; the detector is not an accessibility test.

## Baseline inventory

| State | Evidence and decision |
|---|---|
| Already smooth | 320/390 Chromium: no page overflow, card tools 44×44, native keyboard open; sharing Escape returns to settings trigger. Preserve. |
| Readability gap | Card dates/companions computed 12px; now 14px. Companion metadata explicitly labelled 旅伴, separate from account access. |
| Loading bug | App summary showed empty while list waited; index failure showed zero trips/first-trip CTA. Two new unit cases failed before the fix (44 existing passed). |
| Sharing bug | Pending load simultaneously declared invite inactive. Deferred room-A rotation overwrote room-B invite; new unit case failed before fix (5 existing passed). |
| Offline bug | At 320px banner occupied y=780–844; four nav targets y=769–836 all failed center hit testing. Banner now sits above navigation. |
| Confirmation bug | Actual sharing confirmation Tab moved focus back to underlying sheet. Existing trap now targets foreground modal; Escape does not close the underlying sheet. |
| Role gap | Editor setting menu hid owner actions but supplied no current-role explanation. Existing AccountSection now receives role/context; authorization unchanged. |

## Changes and test contracts

- App: load/error presentation, explicit index retry, account/room/role keyed sharing, mode-specific offline presentation. No summary/date selection algorithm change.
- TripCard: body typography and long title wrapping; original native open and separate tools retained. The existing theme card surface is composited over the trip color, and the label/tool row wraps at large text sizes.
- TripSharingDialog: distinct load states, user-requested retry, clipboard completion/failure selection, mutually exclusive pending actions, stale-response protection across close/reopen/room/role changes, real confirmation option names, theme-safe colors and account-member explanation.
- ResponsiveBottomSheet: reuse existing keyboard trap for foreground confirmation instead of stealing its focus. No new trap or modal system.
- SyncStatusIndicator/OfflineBanner: explicit last-known saved label, visible compact error/offline, reduced-motion pulse, data-mode copy and navigation-safe placement.
- TripDetail: listener feedback cannot clear saving/error; existing AccountSection gets actual role. No changes to writes, conflict resolution, data models or listener architecture.

Existing member-button unit selector was changed from `移除` to exact `移除成員：旅伴` to verify the improved accessible name. Existing behavior assertions remain. Added E2E assertions do not remove or weaken existing tests. E2E edits require human review.

## State/source mapping

| Source / trigger | Existing state | Display | Available action / limit |
|---|---|---|---|
| Room/repository load begins | idle | 正在連線… | Wait or return to lobby. |
| Existing repository mutation starts | saving | 正在同步… | Existing editor pending guards; no new background retry. |
| Initial subscription snapshot or write promise completes | saved | 上次已同步 | Last-known result, not proof all collaborators read it or a fresh reconnect acknowledgment. |
| Later subscription update, outside recent-local suppression | remote-updated | 遠端已更新 | Non-interrupting; existing timer returns to saved only if still remote-updated. Does not clear error/saving. |
| Repository/listener failure | error | 同步失敗 | Check connection and contents; do not blindly repeat an uncertain mutation. Existing safe flows only. |
| Browser reports no network | offline (display override) | 離線 + mode-specific notice | Network status is not a repository acknowledgment. Navigation remains available. |
| Network returns | Existing underlying state retained | 已恢復連線 toast; saved remains 上次已同步 | User is told to confirm latest data; no mutation replay added. |
| Local example capabilities | Cloud indicator hidden | 示範旅程 · 不與雲端同步; offline notice describes unavailable online features | Does not claim cloud sync or durable persistence. |
| Cached offline preview | Existing read-only mode | 離線唯讀預覽 + existing cache timestamp | Return, clear device cache with confirmation, or explicitly open latest trip online. |

## Verification record

Screenshots prove layout only; interaction assertions are separate. The configured local E2E port 4174 was released. Latest return-focus wiring and strengthened 200% card checks passed in both browser projects (8/8 focused cases, retries 0).

| Check | Executed result / coverage |
|---|---|
| Related unit tests after explicit focus wiring | 27 passed: sharing and TripDetail repository integration. |
| Backend collaboration/domain tests | 22 passed, synthetic service tests; not real Google sign-in. |
| Firebase Rules | 18 passed using demo-travel-rules Emulator only; no rule changes. |
| Earlier seven-suite E2E run, Chrome + Mobile Safari | 92 passed / 2 failed / 0 flaky / 0 skipped, retries 0. Both failures: sharing return focus in WebKit; repaired and passed in the focused rerun. |
| Latest seven-suite run on edfe083 | 93 passed / 1 failed / 0 report-classified flaky / 0 skipped / 0 configured retries (6.3 minutes). Chromium owner/editor invite case encountered an unexpected page reload. This failed run remains part of the record. |
| Isolated affected-suite rerun | app-shell-ux: 16 passed / 0 failed / 0 report-classified flaky / 0 skipped / 0 configured retries (2.0 minutes). One manual suite rerun; no code/assertion/timeout changes and no concurrent workspace edits. One observed intermittent case is still disclosed; do not combine these runs into a fictional 94/94 single-run pass. |
| Browser widths | 320/375/390/768/1024/1440 long-name and native-card controls passed in both projects before latest focus wiring. |
| T1/T2 regression | Existing mobile itinerary/map-sheet, offline preview and two-context realtime suites passed in that 94-case run. |
| 200% | html font-size equivalent only. Both projects passed ready-card tool count/bounds, actual center hit targets, default-card date contrast >=4.5, scrollable sharing actions and explicit return focus. Not browser zoom or real soft keyboard. |
| Contrast samples after the surface fix | Dark custom card: title 15.92, date 10.28; light custom card: title 16.83, date 6.40. Default blue card date also passed >=4.5. Ancestor alpha compositing included. These samples do not certify every possible custom color. |
| git diff --check | Passed after latest focus/copy edits. |
| npm run verify:fast | Final run on edfe083 passed: guardrails, TypeScript, ESLint, 101 unit files / 1097 tests, production build (87.6 seconds). Existing chunk-size/Browserslist warnings retained; no dependency/config changes. |
| GitHub checks | Full CI belongs to the Draft PR. Read its live checks separately from the local results in this document. |

### Evidence access

Representative synthetic screenshots are in [evidence/t3](evidence/t3). They are included with this change so reviewers can access them through the Draft PR branch/commit, not a local Windows path. Invite fields are masked.

- [Before sharing loading](evidence/t3/before-sharing-loading-320.png) / [After explicit loading](evidence/t3/after-sharing-loading-320.png).
- [Before offline navigation overlap](evidence/t3/before-trip-offline-320.png) / [After navigation clearance](evidence/t3/after-trip-offline-320.png).
- [Dark card](evidence/t3/after-dark-trip-card-390.png) / [Light card](evidence/t3/after-light-trip-card-390.png).
- [Before default-card surface at 200%](evidence/t3/before-default-card-200-percent-html-font-size.png) / [After complete-tool-load, hit-target and contrast checks](evidence/t3/after-card-200-percent-html-font-size.png). The before capture is the earlier baseline; the numerical contrast failure was reproduced independently on the resumed branch.

Development failures were classified before repair:

1. Product: two App false-empty cases and stale sharing response, fixed locally.
2. Test selector: existing removal test used the old accessible name; replaced with the exact member-specific name, no assertion weakening.
3. Environment: Rules suite initially could not import committed `@firebase/rules-unit-testing`; restored locked dependencies, no configuration change.
4. Environment/execution order: E2E launched while dependency restore was completing and mixed parent runner/local test modules. No tests ran; rerun after restore without timeout/config changes.
5. Product: foreground-confirmation focus and missing editor context; fixed locally. Chromium T3 focused run subsequently passed 5/5 with no retries.
6. Product: the 94-case related regression completed with 92 passed / 2 failed / 0 flaky / 0 skipped / 0 retries. Both failures were WebKit sharing return focus (normal and html-font 200%). The settings menu already supplies its trigger; T3 now forwards it through App/TripDetail to the existing sheet return-focus prop. A unit regression verifies pointer activation without prior trigger focus.
7. Environment: the next focused run executed zero tests because Functions discovery exceeded its existing 10-second deadline, then Playwright's unchanged 120-second web-server deadline expired. No timeout, concurrency, fixture or CI adjustment was made. This is recorded separately from test failures and is not evidence that the inherited CI stall cause is fixed.
8. Product text contract: verify:fast reached Vitest with 1085 passed / 1 failed. The existing example-trip text policy rejected a new label. The UI was changed to the approved 示範旅程 wording with explicit no-cloud-sync context; the existing policy assertions were not changed.
9. Environment: the focused retry registered Functions successfully but executed zero tests because port 4174 was occupied by an existing non-Travel development process. That process was not stopped; the user was asked to release the port. No Playwright configuration change was made.
10. Product: after the port was released, focused tests yielded 6 passed / 2 failed. Both 200% cases measured default-blue card date contrast at 2.30:1 (required 4.5:1); the screenshot also showed label/tool crowding. Added the existing theme surface and flex wrapping, plus center hit-testing. First repair passed all 8 focused cases in Chrome/WebKit, no retries/skips. The WebKit return-focus failure is now covered by that successful run.
11. Intermittent execution failure: Chromium owner/editor invite flow failed once in the 94-case run after passing in focused runs. Trace records two document GETs at 17:10:09.745Z and 17:10:10.603Z, `FirebaseError: internal`, and a fresh Vite connection. This coincides with this task writing validation documentation; the installed Tailwind Vite plugin has a full-reload path for watched-file changes. File-write/HMR interference is the leading inference, not an isolated proven cause. No product/test assertion/config change was made for it. The affected suite passed 16/16 when rerun with no workspace edits; this does not prove the inherited CI flaky cause is fixed.

## Acceptance evidence matrix

| Criterion | Result | Executed evidence / remaining limit |
|---|---|---|
| T3-01 Lobby states | PASS | App.offlineTripPreview and existing first-run/lobby unit suites passed; delayed loading and index errors no longer render empty. |
| T3-02 Trip information/actions | PASS | TripCard unit tests; app-shell-ux in Chrome/WebKit: six widths, long Chinese/English names, role, separate tools, Enter/Space and A→lobby→B. |
| T3-03 Isolation | PASS | Existing App account-isolation tests plus real Emulator owner/editor room transition. Does not claim production Google sign-in. |
| T3-04 Invite feedback | PASS | Sharing unit tests and both-browser deferred/error/retry/manual-clipboard flow; latest return focus passed. |
| T3-05 Permission/member semantics | PASS | Owner/editor UI tests, 22 backend service tests and 18 Emulator rule tests; metadata companions remain distinct from account members. |
| T3-06 Confirmation/async safety | PASS | Unit cancellation, competing-action and stale-response cases; browser confirmation Tab/Escape/cancel, close/return-focus passed. |
| T3-07 Sync semantics | PARTIAL | Six status renderings and listener-after-error tests passed. Independent overlapping write aggregation remains outside the existing single-state contract; no architecture change. |
| T3-08 Data modes/recovery | PARTIAL | Existing cached-preview/read-only tests passed; mode-specific messaging added. Existing local persistence fallback/feature-specific success wording not comprehensively redesigned or certified. |
| T3-09 Responsive/accessibility | PARTIAL | Six widths, long trip names, 200% html font-size, tool bounds/hit targets, keyboard and sampled composited contrast passed. Real device/keyboard, long account-member names and all custom colors are not comprehensively verified. |
| T3-10 Regression | PARTIAL | Relevant local regression status recorded above; full PR CI and inherited T2 external-service/device/CI-flake limits must remain separate. |

## Remaining limits

- A shared sync status still cannot aggregate independently overlapping branch writes. Solving all cross-branch success/error races requires a separate sync-strategy task; T3 does not claim that guarantee.
- Existing local-example persistence fallback and feature-specific success messages were not redesigned. No new claim that memory-only data is durably saved. Repository persistence semantics are outside T3.
- Actual Google sign-in/account switching is not exercised against production; existing mocked isolation tests and synthetic Emulator permission tests have distinct coverage.
- Browser text scaling uses `html { font-size: 200% }`, not browser zoom, OS accessibility text size or real mobile keyboard testing.
- T2 carryovers remain: real Google Places search→select→focus→Add; physical iPhone Safari/keyboard/gestures/safe-area; deployment smoke evidence; incompletely diagnosed CI flaky/stall causes. Deployment status is not test status.

## Rollback

Unmerged: close the Draft PR. If merged later, verify the merge commit/method and create a new revert branch + PR. Do not rewrite main or deploy automatically.
