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
