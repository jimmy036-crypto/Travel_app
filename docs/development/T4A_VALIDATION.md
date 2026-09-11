# T4A — Ticket reading and interactions

## Baseline and isolation

- Task branch: `fix/travel-t4a-ticket-ux`.
- Fetched `origin/main`: `fedd9936dba987d560fbb1dc7dfdc88889cabb1a` (execution date: 2026-09-12, Asia/Taipei).
- T1 `85acda39ecbee598abc5a669709059a01f082a1c`, T2 `b42af785ef0ececd664518f27943e90fe3a825da`, and T3 `f18012094fed91d2c3fed1d2f8ad1404a5b6c0fc` were checked as ancestors. GitHub PR #64 is merged at `edfe08366cdc4ee31a19850ef77a1ba67ab235af`; PR #65 is merged at the baseline above. No open PR was returned by the conflict check.
- Original `npm run task:preflight`: FAIL (unrelated feature branch, existing untracked user files, local main six commits behind origin/main). No stash/reset/clean or user-file edits were performed.
- A clean independent worktree was created directly from fetched origin/main. `npm run task:preflight -- --allow-feature` there: FAIL because the shared local main ref remains six commits behind; this is **not** reported as PASS. Supplemental Git checks confirmed the exact clean starting SHA, task branch, remote, isolation and absence of conflicting open PRs. Other worktrees were not reset or modified.
- Tests used the existing `demo-travel-e2e` Emulator setup with `TRAVEL_E2E_SKIP_LOCAL_ENV=true`. No production Firebase, secret files, deployment, new package, configuration or infrastructure changes.

## Skills

- `ui-ux-pro-max`: installed; read instructions and local keyboard/focus guidance as a reference subordinate to MASTER.
- `impeccable`: installed; read hardening/craft guidance for reproduced issues only. Its context launcher was not run because it could download tooling; repository context was read directly instead.
- `web-design-guidelines`: installed; used [current interface guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md) for names, focus, semantic controls, loading and recovery.
- Playwright Skill: not installed; existing project Playwright used.
- `vercel-react-best-practices`: not installed; not a prerequisite.
- Existing Firebase Firestore skill instructions were read for the Emulator boundary; no cloud provisioning/database listing was performed.
- No skill was installed, updated or overwritten.

## Before-change inventory

### Already working — preserved

- Existing all/common/member filtering, common-ticket uniqueness and separate device identity.
- Existing manual App instructions, safe links, ticket creation and delete confirmation/cancel.
- Protected repository attachment reads, PDF MIME/byte repair, cache/dedup/release and popup pre-opening.
- Existing editor validation, keep/replace/remove payloads, pending close restrictions, rollback and cleanup warnings.
- Four mobile destinations and existing desktop itinerary/map composition.

### Reproduced gaps and bugs

- At 390×844 and 320×844, ticket body metadata was 12px. Add was 80×40, identity switch approximately 48×16, filters about 34px high, edit/delete 40×36 with 4px gap. Selected filters had the same transparent background as unselected ones.
- More than two assigned members were abbreviated without a non-hover full-list path when no instructions existed. Expand controls lacked `aria-expanded`/`aria-controls`.
- Unit reproduction: Tab from the editor's last control escaped to the page; the editor did not use the existing shared focus trap.
- Unit reproduction: a delayed image read could open after trip change; repeated PDF activation pre-opened two windows.
- Fullscreen image had an unnamed close glyph and no decode-failure explanation/focus containment.
- Browser reproduction at 200% root font size: the sticky ticket header covered the main action (center hit-test failed). Removing that local stickiness made the action reachable by scrolling.
- WebKit screenshots showed a white native select surface with light text in the dark editor. Local `color-scheme` corrects the native control without a new theme mechanism.
- Visual follow-up: excessive editor footer horizontal padding wrapped Save into four rows at 200%. Reduced local padding; a maximum-two-lines/min-height assertion now protects it.

### Remaining evidence gaps

- Physical iPhone/PWA, native PDF reader, soft keyboard, third-party App launch/login and production smoke were not tested.
- At 200%, the closed native date select can abbreviate its selected date; full no-clipping compliance is not claimed. The pre-existing global settings control can also be partly outside the viewport. Ticket Save/Cancel and four bottom destinations passed hit-testing; the global header was not redesigned.
- Contrast is sampled against real composited backgrounds, not certification of every custom theme/color or all editor text.

## Changes and acceptance mapping

| File | Purpose / criteria |
|---|---|
| `src/features/tickets/TicketWalletSection.jsx` | 14px metadata, date hierarchy, 44px actions/8px tools, visible selected filters, full members through existing expansion, copy failure fallback, attachment busy/cancel and focus return (01–03, 05–06, 08–09). |
| `src/features/tickets/TicketEditorModal.jsx` | Reuse existing ResponsiveBottomSheet for focus/scroll/Escape, readable explanations, member targets, native color scheme and compact zoom footer (07–09). Validation and mutation contract unchanged. |
| `src/TripDetail.jsx` | Ticket-only pending/request identity/cancel and return focus; preserve synchronous PDF popup creation and non-ticket document behavior; return clipboard success boolean (04–06). |
| `src/components/UIComponents.jsx` | Only FullscreenTicketModal: existing sheet, named close, load/decode status, contain image, scrolling and focus return (04, 06, 08–09). Old unused ticket editor unchanged. |
| `TicketWalletSection.test.jsx` | Full member expansion, clipboard pending/failure, attachment busy/cancel. |
| `TicketEditorModal.test.jsx` | Tab/Shift+Tab containment and return focus; all existing validation/pending/payload assertions retained. |
| `src/TripDetail.ticketIntegration.test.jsx` | Delayed loading versus empty, trip/request invalidation, repeated PDF open guard and switching selected attachment. |
| `src/components/FullscreenTicketModal.test.jsx` | Image decode error remains escapable; focus trap and return. |
| `e2e/external-app-ticket.spec.ts` | Add measurements to existing mobile flow; add six-width long text/keyboard/cancel tests and two theme/clipboard/200% tests. No old assertion removed or relaxed. |
| `e2e/ticket-storage.spec.ts` | Add synthetic representative image read failure, delayed cancel, retry, reload, protected blob and focus/filter preservation. Existing PDF MIME/bytes and lifecycle cases unchanged. |
| This document and `evidence/t4a/` | Review-accessible synthetic before/after and bounded validation results. |

The E2E edits require careful review. Assertions were strengthened or added, not changed into permissive counts. Ticket tools are explicitly exactly two (edit/delete); the main open/detail controls are checked independently. Local report extraction and screenshots stayed in ignored output directories while E2E ran; tracked evidence/docs were written only after all browser runs ended.

## Acceptance → executed evidence → remaining limits

| Criterion | Result | Evidence and scope |
|---|---|---|
| T4A-01 Filter/identity | PASS | Existing Wallet/model/identity unit tests and external-app-ticket browser filters/device persistence; common ticket uniqueness and viewing another member without changing identity. No cloud-write path added to filtering. |
| T4A-02 Readability | PASS | Six-width synthetic long Chinese/unbroken English/member/order data; title/tool bounding separation; measured metadata 14px; existing missing-date/model tests. Scope: card reading at normal text size. |
| T4A-03 States/actions | PASS | Visible selected background plus aria-pressed; independent tools; Wallet empty/filter-empty tests; TripDetail delayed loading and read-error tests. |
| T4A-04 Attachments | PASS | Both-browser ticket-storage PNG/PDF reload, MIME and byte assertions; protected read failure/cancel/retry uses blob URL without changing metadata. Repository attachment unit regression retained. Does not certify a native iPhone PDF reader. |
| T4A-05 External/copy | PASS | Existing safe URL/manual/distinct fallback browser cases and clipboard helper/unit tests; new browser clipboard denial offers selectable exact order number without success toast. Actual third-party App startup not claimed. |
| T4A-06 Pending/failure/return | PASS | Unit duplicate PDF and stale response guards; browser protected image fail/cancel/retry plus Escape/focus/filter return; decode-error unit test. No write retry or attachment lifecycle change. |
| T4A-07 Editor/data | PASS | Existing editor/actions unit contracts and ticket-edit-lifecycle in both browsers: metadata-only edit, replace/conversion, upload failure and saved-with-cleanup-warning; cancel leaves records unchanged. |
| T4A-08 Mobile/accessibility | PARTIAL | Six widths, 44px measured targets, 8px gap, center hit-test, Enter/Space and Tab/Shift+Tab/Escape pass. HTML 200% Save/Cancel and bottom navigation pass; closed native date label truncation/global header limitation and physical keyboard/safe-area remain. |
| T4A-09 Theme/data modes | PARTIAL | Light/dark sampled contrast ≥4.5 and native select screenshot checked; existing offline/read-only unit and offline-awareness E2E pass. Not all custom colors or offline attachment availability certified; metadata never advertised as offline attachment guarantee. |
| T4A-10 Regression/boundary | PARTIAL | Relevant T1 timeline, T3 app-shell/offline, desktop density, editor and independent-context ticket update regressions pass locally. Full PR CI is a separate result; inherited external/device/sync limitations remain. T4B untouched. |

## Executed runs (do not combine into a fictional single run)

1. Baseline Mobile Safari existing mobile ticket flow: **1 passed**, no failure/flaky/skip/retry, 1.2m.
2. Red editor-focus reproduction: **62 passed / 1 failed**. Product bug; first repair reused the existing sheet.
3. Red delayed-opening reproduction with repaired editor: **69 passed / 2 failed**. Product bugs; first repair added local ticket request identity/guard.
4. Red fullscreen reproduction: **1 failed**. Product accessibility gap; first repair used the existing sheet and named close/error state.
5. Initial directly related unit run: **208 passed**, 9 files, 24.01s.
6. Mobile Safari width/mobile batch: **7 passed**, 1.2m, no retries.
7. Light/dark 200% red run: **2 failed**, main-action hit-test blocked by sticky ticket header. Product bug, first repair removed local stickiness.
8. Focused light/dark 200% and protected image recovery: **3 passed**, 1.4m, no retries.
9. First `npm run verify:fast`: guardrails/typecheck/lint passed; Unit **1106 passed / 1 failed**; build not reached. New delayed-listener test emitted before the component's existing initialization microtask. Classified **test timing bug**, fixed by flushing mount before synthetic response; no product loading change. Separate mistaken `npm run test:unit` invocation found no such script and executed no tests; corrected to existing `test:run`.
10. Post-fix direct unit rerun: **99 passed**, 4 files, 23.29s.
11. Final related E2E command below: **96 passed**, 48 Desktop Chrome + 48 Mobile Safari, **0 failed / 0 flaky / 0 skipped / 0 retries**, 6.6m. No tracked-file writes during this run.
12. Independent-context realtime command below: **6 passed**, **0 failed / 0 flaky / 0 skipped / 0 retries**, 1.0m. Two independent browser contexts use the existing Emulator fixture, including ticket image persistence/update and reload.
13. Final `npm run verify:fast`: **PASS**, 55.5s; guardrails, TypeScript, ESLint, **103 unit/integration files / 1107 tests passed**, production build and PWA generation. No failed/flaky/skipped unit cases. Existing chunk-size and outdated Browserslist-data warnings remain; no package/config changes made to suppress them.
14. Final `git diff --check`: **PASS** (only Git's Windows LF/CRLF conversion notices). GitHub checks are not part of this local result; consult the Draft PR checks for their current status.

All identified failures required one repair round, not three. Focused reruns are separate manual invocations, not Playwright retries. No skip/only/force click, arbitrary sleep/timeout, shared fixture or CI/config change was used.

```powershell
$env:TRAVEL_E2E_SKIP_LOCAL_ENV='true'
npm run test:e2e -- e2e/external-app-ticket.spec.ts e2e/ticket-storage.spec.ts e2e/ticket-edit-lifecycle.spec.ts e2e/mobile-itinerary-timeline.spec.ts e2e/app-shell-ux.spec.ts e2e/offline-awareness.spec.ts e2e/desktop-itinerary-density.spec.ts
npm run test:e2e -- e2e/realtime-sync.spec.ts --grep 'keeps isolated contexts|shows realtime sync status|syncs storage attachment status'
npm run verify:fast
git diff --check
```

Full local E2E/verify:full not run: no shared fixture/config/CI/startup change; TEST_POLICY assigns full regression to PR CI. Rules-specific tests were not separately rerun because authorization/rules were unchanged; UI tests are not represented as new backend authorization evidence.

## Browser evidence

All links below are committed repository assets, available to reviewers with repository access, not inaccessible `C:\...` paths. Synthetic data only; no real order number, usable barcode, invitation token or passenger data. Screenshots prove layout only; interaction evidence is the executed tests above.

- 390 baseline: [before](evidence/t4a/before-wallet-390.png) / [after](evidence/t4a/after-ticket-wallet-390.png).
- 320 baseline: [before](evidence/t4a/before-wallet-320.png) / [after](evidence/t4a/after-ticket-wallet-320.png); [long content](evidence/t4a/after-long-wallet-320.png).
- [Editor at 390](evidence/t4a/after-ticket-editor-390.png), [representative image](evidence/t4a/after-image-reading-390.png).
- 200% obstruction: [before](evidence/t4a/before-200-sticky.png) / [reachable wallet action after](evidence/t4a/after-ticket-light-200-wallet.png).
- [200% light editor](evidence/t4a/after-ticket-light-200-editor.png) / [200% dark editor](evidence/t4a/after-ticket-dark-200-editor.png). Save no longer forms four rows. Closed date text truncation is explicitly not a pass.
- 320/375/390/768/1024/1440: both Chromium and WebKit tests passed no page overflow, long-title/tool separation, actual action dimensions/hit-testing and editor keyboard/cancel. Desktop composition retained; synthetic Emulator map warnings are not real Google Places verification.
- Scaling method: `document.documentElement.style.fontSize = '200%'` at 390×844. Not browser zoom, OS Dynamic Type, native mobile keyboard, or physical iPhone Safari.

Measured normal-size targets: Add 80×44, identity switch 72×44, filters height 44 (width ≥50), edit/delete 44×44 with gap 8, manual open 116×44. Metadata 14px; filter/tool labels 12px.

Contrast samples used each element's actual computed color plus alpha-composited ancestor backgrounds; the helper rejects gradients/group opacity instead of falsely treating the root as the only background. At light `#f8fafc`: title/date 17.79, edit 6.82, delete 6.41, network warning 8.26, selected filter 5.25. At dark `#0f172a`: title/date 18.78, edit 14.47, delete 14.16, network warning 15.32, selected filter 5.25. These are sampled ratios, not all-theme certification.

## Inherited limitations / manual QA

CI follow-up (2026-09-12): the original head's PR/push E2E jobs were cancelled at the existing 30-minute limit, not all-pass. Two bounded fixes and their separate red/green runs are documented in [T4A_CI_DIAGNOSTICS](T4A_CI_DIAGNOSTICS.md): suite initialization deleting cache inside a child frame, and tour geometry remaining stale after header reflow. Follow-up verification: 1108 Unit/Integration tests plus fast checks passed; 76 affected E2E passed, with zero retries. Shared dependent-module loading stalls remain unresolved; this does not clear T4A-10's PARTIAL status or replace the original run history.

- Real Google Places search → select → focus → Add remains unverified.
- Real Google login and deployment smoke evidence remain unverified; deployment status is separate from tests.
- Physical iPhone Safari/PWA native PDF, soft keyboard, external App/login/ticket presentation, gestures and safe-area require manual testing. MIME/bytes and WebKit emulation do not prove native-reader behavior.
- T2/T3 CI intermittent stall root causes remain incompletely diagnosed. Passing this local run does not prove they are fixed.
- T3 overlapping global sync-state aggregation and local save fallback limitations remain PARTIAL; no sync/repository architecture change in T4A.

## Risk and rollback

Product risk: **medium**, localized asynchronous ticket opening and modal/focus behavior. Test-review risk: **high**, because existing E2E files receive new assertions; review their specificity and synthetic network gates. No old assertion was relaxed.

Unmerged: close the Draft PR, leaving main unchanged. If merged later, verify actual merge method/commit, then create a new revert branch + PR. No rewriting main history or automatic deployment. Stop after Draft PR; do not start T4B.
