# T4B-0 — 旅伴身分共用與首次確認

## Scope / baseline

- Branch: `fix/travel-t4b0-companion-identity`.
- Base: `9c94b9c94b1b5f53a4d533394fb4148fdbc3ceca` (PR #66 / T4A merge). The main history includes T1, T2, T3 and PR #64. Main check [34672000265](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34672000265) succeeded; that is baseline evidence, not this branch's CI.
- No T4B-1, deployment, production Firebase, Auth/Rules/schema/repository/Storage/financial algorithm changes.
- Original `npm run task:preflight` **FAIL**: original feature branch, unrelated untracked `6D-0-diff.patch` / `tasks/active/TASK.md`, shared local main behind origin/main by 10 commits. Fetch/tool checks succeeded. The failed preflight is not reported as PASS.
- Supplemental Git checks confirmed latest origin/main and no open overlapping PR. A clean independent worktree was created at `.tmp/t4b0-worktree`; original files/worktree/local main were not reset, stashed or cleaned. All task changes are confined to its branch.
- Existing dependency directories were reused with ignored junctions from the T4A worktree. E2E used `TRAVEL_E2E_SKIP_LOCAL_ENV=true` and `npm --ignore-scripts run test:e2e -- ...`, skipping the existing functions-install prehook, not tests. No package/lock/config changes.
- Environment deviation: initial isolated Emulator startup automatically downloaded Firestore JAR and Emulator UI cache before this was noticed. One startup was interrupted; existing Database/Storage caches were then reused. These downloads were disclosed, remain ignored task-local cache, and were not package/Skill upgrades. Do not describe the session as having downloaded nothing.

## Skills

- Installed and read this round: ui-ux-pro-max (targeted optional-onboarding guidance), impeccable (onboarding/craft checks only), web-design-guidelines (labels, native controls, focus, feedback). MASTER remained authoritative.
- vercel-react-best-practices: not installed. playwright Skill: not installed; existing project Playwright used.
- No Skill installation/update/overwrite. The impeccable engine launcher was not run because it could fetch an engine; manual guidance only. Existing Firebase Auth/Firestore safety instructions were read for synthetic Emulator tests; no cloud setup/query/deploy.

## Before / intentional contract changes

Already working and retained: ticket filter membership/common uniqueness, protected attachments/PDF, repository mutations, expense calculations and existing ResponsiveBottomSheet.

Reproduced gaps: separate ticket/checklist local keys lacked UID isolation; old ticket helper could automatically adopt/write a checklist identity; checklist and new expense silently used the first member. The baseline 390/320 browser run observed an unconfirmed new payer already set to member A.

Intentional changes (not assertion relaxation):

1. Independent identities → one trip-level confirmed preference.
2. Room-only keys → versioned source + Auth UID + trip key.
3. Guess-first → explicit companion confirmation / explicit payer selection.
4. Automatic legacy adoption → read-only candidate requiring confirmation.
5. Ticket “mine” mode → separate from an explicitly viewed member.

## Product files

| File | Purpose |
| --- | --- |
| `src/features/companion/companionIdentity.js` | Versioned local record, unambiguous key, exact-name candidate, scoped in-memory store and storage-failure continuity. |
| `src/features/companion/useCompanionIdentity.js` | Shared selection, readiness/member validation, generation guards, invalidation and skip. |
| `src/features/companion/CompanionIdentity.jsx` | One non-blocking notice and one existing-sheet-based picker; correction/clear/cancel, focus and failure copy. |
| `src/features/tickets/ticketIdentity.js` | Remove obsolete auto-confirm/write paths; retain only read-only legacy hints. |
| `src/features/tickets/TicketWalletSection.jsx` | Consume shared notice/member; separate mine from explicit member browsing; no attachment changes. |
| `src/TripDetail.jsx` | Share state with tickets/checklist/new payer, local context guards and picker focus restoration. |
| `src/App.jsx` | Key TripDetail by source/account/trip so old-context forms unmount. |
| `src/components/UIComponents.jsx` | Checklist actor versus view/owner separation; preserve existing owner/assignee; expense initial payer and validation only. Native color-scheme for the two affected selects. |

Tests: new `useCompanionIdentity.test.jsx`, `ChecklistModal.companion.test.jsx`, `e2e/companion-identity.spec.ts`; adjusted ticketIdentity, TicketWalletSection, TripDetail.ticketIntegration, ExpenseModal.phase2b, external-app-ticket and expense-crud tests. Documents/evidence: this file and `evidence/t4b0/`.

## Shared-state and storage contract

- Key: `travel-companion-v1:` + JSON encoding of `[source, uid, tripId]`. Example source uses its own namespace and empty UID; cloud requires a UID. No Email/displayName/token is stored.
- Value: `{version:1, confirmed:boolean, member:string}`. Clear writes an explicit unconfirmed tombstone, preventing legacy revival; it never removes other accounts/trips or dual-writes old keys.
- One scoped store is consumed through `useSyncExternalStore`; there are no ticket/checklist effects copying identities back and forth.
- Unready/account-switched context exposes no member. Successfully loaded member removal invalidates to unconfirmed; temporarily unloaded/failed metadata does not erase the record.
- Captured callbacks check generation/current context and current valid names. App context key disposes old forms. This does not undo writes already explicitly submitted before a switch.
- Blocked/corrupt storage does not crash. Explicit selection remains shared in memory across trip reopening for the current page session, with a warning. Refresh cannot preserve an unsuccessful write; clearing is not claimed permanently saved when it failed.
- Legacy keys are read only. Agreement yields a candidate, disagreement a conflict, invalid data no confirmed identity. New/tombstone/corrupt records do not silently fall through to legacy identity.
- Names remain the existing data identity: same-name people cannot be distinguished. No real-name verification, new member IDs, cross-device sync or cross-tab sync was added.

## User flow

Unconfirmed → small optional notice → choose / skip. Skip is session-only and shared across tools. Choosing a candidate/name is explicit; completing a checklist or saving an expense still requires a separate action. Correct/cancel/clear use the same picker. Correcting affects future defaults, never the payer in an already-open draft, historical records, account or permissions.

New expense without confirmation has an empty payer and cannot save until manually selected. A manually chosen payer does not confirm companion identity. Edit/copy preserve source payer; a removed payer remains visible and requires explicit correction. Other amount/split/currency inputs are unchanged.

## Acceptance → test evidence → limits

All PASS entries refer only to the concrete local synthetic coverage below, not real-device or production validation.

| Criterion | Result | Existing/new evidence and remaining gap |
| --- | --- | --- |
| B0-01 | PASS | New companion E2E: confirm → tickets → checklist → new expense → reload, both projects; same notice/member, no repeated prompt. |
| B0-02 | PARTIAL | Hook tests plus same-browser A/B/A/B, trip X/Y/X, signed-out demo and account A reload pass. Account B cold reload not validated: existing E2E auto-sign-in bootstrap selects fixed e2e-owner. Same-browser switch uses real Auth Emulator state and lobby navigation; no Auth/config workaround added. |
| B0-03 | PASS | Hook tests: exact-name/one-member/first member remain candidates or blank until explicit confirmation; no Email/owner inference. |
| B0-04 | PASS | ticketIdentity + hook + TripDetail tests cover matching/conflicting/invalid legacy, corrupt/versioned records, clear tombstone and zero legacy writes. |
| B0-05 | PASS | Ticket tests and browser member B browsing retain companion A and new payer A; explicit member versus mine filters remain separate. Checklist view B unit test retains actor A. |
| B0-06 | PASS | Browser cancel/confirm-alone leave checklist unchanged; subsequent explicit completion writes chosen completedBy. Unit tests retain owner/assignee and block implicit personal/template writes without selection. |
| B0-07 | PASS | Empty payer save blocked with zero record; hand-selected B persists exactly cost 1000, split A=500/B=500, without identity record. Existing expense fixtures explicitly choose payer and keep exact data assertions. |
| B0-08 | PASS | Browser correction inside draft/edit preserves payer/amount/split/history; unit edit/copy removed-payer validation and existing expense duplication regression pass. |
| B0-09 | PARTIAL | Hook tests cover delayed/stale A/B/A callbacks, unmount, unready metadata and removal; TripDetail integration checks invalidation; browser account switches pass. Not every remote-removal/open-form race was browser-tested. |
| B0-10 | PARTIAL | get/set/remove throwing, corrupt data, failed clear, remount continuity unit tests; browser blocked writes + trip reopen and signed-out demo pass. New dedicated offline-preview preference E2E not run; no offline write capability added. |
| B0-11 | PARTIAL | Both projects: 320/375/390/768/1024, long CN/unbroken English, 44px bounding boxes + center hit-test, Enter/Space/Tab/Shift+Tab/Escape/focus return, light/dark and HTML font-size 200%. Actual notice/picker contrast 16.66–18.82:1. Real iPhone/VoiceOver/keyboard/safe-area not tested; legacy unrelated native selects still have Safari dark-theme readability gaps. |
| B0-12 | PASS | Identity confirmation/filtering: exact Emulator room equality, zero observed RTDB business put/merge frames; integration mutation spies untouched. Clear/skip/helper tests are local-only. Exact financial/unit/settlement/E2E inputs retained; financial helpers, Rules, schema and repository unchanged. This is not a new backend authorization audit. |

## Executed tests (2026-09-12, local)

- `npm run verify:fast`: PASS, 106 files / 1161 tests, lint/typecheck/build pass. Build retains existing chunk-size/Browserslist warnings; jsdom printed two CSS parse warnings, no failed tests. No dependency updates performed for warnings.
- Related development unit batches: 29, 78 and 4 passed; final full unit count above supersedes totals, not added together.
- Related E2E command: `npm --ignore-scripts run test:e2e -- e2e/companion-identity.spec.ts e2e/external-app-ticket.spec.ts e2e/expense-crud.spec.ts e2e/expense-settlement.spec.ts e2e/ticket-storage.spec.ts e2e/realtime-sync.spec.ts e2e/app-shell-ux.spec.ts` with `TRAVEL_E2E_SKIP_LOCAL_ENV=true`.
- Batch result: **106 passed / 4 failed / 0 flaky / 0 skipped**, 9.2m, 0 automatic retries. Four failures were the old selected-member locator in light/dark × two projects; no product contrast failure.
- After locator repair: entire external-app-ticket suite **30 passed / 0 failed / 0 flaky / 0 skipped**, 3.2m, 0 automatic retries. This is a separate manual rerun, not a single 110/110 run.
- The new companion suite's **20/20** passed in the related batch. Existing realtime suite uses independent browser contexts for actual Emulator listener propagation; same-device account isolation is separately tested within one context.
- `git diff --check`: PASS (LF/CRLF warnings are not whitespace errors).
- Initial implementation did not run full local E2E: no config/shared fixture/infrastructure change. After CI failed, the failed-CI reproduction exception was used; see the separate follow-up below. Branch CI status must be read from the PR, not inferred from baseline or local passes.

### CI repair follow-up (2026-09-12)

- Original head `99a1d831` push/PR E2E jobs were cancelled at the 30-minute job limit; fast gates and guardrails passed. Both consistently failed the demo-expense case because it still assumed the automatic first payer. Other retry-passed startup/browser stalls remain separately unresolved.
- Repair only changes `e2e/unified-example-trip.spec.ts` and documents. It explicitly chooses the original fixture payer, adds exact blank-payer rejection/history/split/reload checks and proves manual payer selection does not confirm companion identity. No product/config/shared fixture changes or assertion weakening.
- Local chronology: first startup ran 0 tests (Functions discovery failure); separate red invocation **2 failed**; repair's related four-suite invocation **46 passed**; independent review added exact split and next-form checks; final **`verify:full` PASS**, 1161 Unit/Integration tests and **354 E2E passed / 0 failed / 0 flaky / 14 existing skipped**, 0 automatic retries, E2E 21.6m. These remain distinct invocations.
- All 14 skips belong to the seven PWA cases under both default projects. Dedicated PWA config was not invoked; this is not 368 passing tests or PWA browser verification.
- Pre-commit `npm run verify:fast` separately passed again (106 files / 1161 tests, typecheck/lint/build, 72.3s); `git diff --check` passed. No automatic retry or configuration changes.
- [Detailed failure/repair history, trace/request correlation and limits](T4B0_CI_DIAGNOSTICS.md). CI artifacts are linked there; local ignored reports are not presented as public evidence. New-commit CI still requires its own result; Linux browser/snapshot stall root cause is not claimed fixed.

### Repair / rerun history (no assertion weakening)

| Failure | Classification / repair count | Outcome |
| --- | --- | --- |
| Initial Emulator startup | Environment; interrupted automatic download | Not a passed test run; later demo-only startup passed. |
| Mistyped test:unit command | Command error; use existing test:run | Correct command passed. |
| Hook lint direct setState in effect | Implementation; 1 repair, scoped external store | Final lint passed. |
| First 5-case browser batch: 4 pass / 1 fail | Test bug; native alert click awaited before accepting; 1 repair uses event handler + click together | Targeted rerun 1 passed. |
| 14-case batch: 11 pass / 3 fail | Empty-lobby selector (both projects), Safari cancel focus | Account repair 1 uses actual Join button; focus product repair 1 explicitly retains/focuses trigger. |
| Targeted 4-case rerun: 2 pass / 2 fail | Account fixture cold navigation resets to fixed e2e-owner; not preference leakage | Account repair 2 uses actual lobby navigation after same-context Auth switch; 2-case rerun passed. No Auth/fixture/config changes. |
| Additional theme/storage/demo/draft batch | 8 passed | No failures. Native color-scheme locally fixes affected payer/checklist-view selects. |
| Related 110-case batch: 106 pass / 4 fail | Test contract bug; “mine” versus explicit member locator; repair 1 adds precise aria-pressed/text assertions and retains original background/contrast/200% checks | Entire 30-case external suite rerun passed. |

No added skips, test.only, forced clicks, arbitrary sleeps/timeouts or automatic retry policy changes. Historical CI intermittent failures are not declared fixed.

## Browser / accessible evidence

- Main flow: 390×844; layout and hit-test: 320/375/390/768/1024. Existing ticket regression additionally covers 1440.
- 200% method: `html { font-size: 200% }` equivalent, scroll allowed. Not browser zoom, OS Dynamic Type, VoiceOver or actual soft keyboard.
- Contrast samples use actual element backgrounds composited through ancestor alpha. Chrome dark notice 18.821, picker 18.093; light notice 17.639, picker 16.657. WebKit same except light notice 17.642. These measurements do not certify unrelated controls/all text.
- Safari's existing currency/date and checklist-category native selects show pale text on a white background. The newly affected payer/view selects use correct native color-scheme; wider editor styling remains outside T4B-0 for T4B-1.
- Before/after images below are synthetic, checked into this PR so reviewers can open them via GitHub; ignored local traces/reports are not presented as public links. CI will produce its own report. Screenshots establish layout, not interaction results.

| Evidence | Link |
| --- | --- |
| Before ticket identity, 390 Chrome | [before wallet](evidence/t4b0/before-wallet-390.png) |
| Before unconfirmed payer, 390 Chrome | [before payer](evidence/t4b0/before-payer-390.png) |
| After view B / companion A, 390 Chrome | [after wallet](evidence/t4b0/after-wallet-390.png) |
| After confirmed initial payer, 390 Chrome | [after payer](evidence/t4b0/after-payer-390.png) |
| Long names, 320 Chrome | [320 picker](evidence/t4b0/after-picker-320.png) |
| 200% HTML font-size, 390 Chrome | [200% picker](evidence/t4b0/after-picker-200pct.png) |
| Light WebKit picker | [light](evidence/t4b0/after-picker-light-webkit.png) |
| Dark WebKit picker | [dark](evidence/t4b0/after-picker-dark-webkit.png) |
| WebKit payer and existing out-of-scope selects | [payer limitations](evidence/t4b0/after-payer-webkit.png) |

## Risk / manual review / inherited limitations

- Local preference: medium (version/tombstone/failure semantics). Account/trip isolation: medium-high; security-sensitive UI isolation although no authorization change.
- completedBy and payer defaults: high business-attribution review; changing defaults changes future explicit writes, even without calculation changes. Historical records are never migrated.
- E2E/assertion review: high. Review deliberate old auto-adoption → explicit confirmation and first payer → explicit fixture selection; original financial values/counts and contrast requirements remain exact.
- Manual: same real browser Google A/B switch/reload, iPhone Safari/PWA, VoiceOver, soft keyboard/safe-area, long names and source payer no longer in list. No production test authorized/performed.
- Retain T2/T3/T4A gaps: real Google Places flow, real Google login/deployed smoke evidence, native iPhone PDF/external App launch/map gestures, unlocated CI intermittence and T3 partial sync/data-mode limits. This PR does not fix global parallel-save aggregation/local-save fallback.

## Rollback

Unmerged: close Draft PR; main is unaffected. Merged: inspect actual merge method/commit and create a new revert branch + PR; no history rewrite or automatic deployment.

Code rollback does **not** undo expenses/checklist writes explicitly submitted by users. Do not rewrite history. Old code ignores the new versioned local key and may still use its old unscoped legacy keys; this change never dual-writes those keys or deletes other account/trip settings.
