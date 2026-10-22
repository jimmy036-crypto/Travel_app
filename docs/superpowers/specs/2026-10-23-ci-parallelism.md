# Faster complete CI

The user explicitly authorizes CI restructuring and parallel execution. Continue in PR 79 so the already-authorized city memories release can pass its complete gates before integration.

## Acceptance criteria

- Run a single full verification for each PR revision, and verify pushes to main separately.
- Run Chrome and Safari in eight native file-level shards each. Every shard owns its runner, Emulator and Vite server; keep one worker and `fullyParallel: false`.
- Remove browser/OS installation from the critical path using the official Playwright 1.61.1 Noble image, pinned by digest and checked against the lockfile. Keep Node 22 and Java 21.
- Cache npm downloads for both package locks under a shared explicit cache path, and only Emulator binaries under the isolated Firebase home. Never cache credentials or database contents.
- Keep Agent guardrails, Fast quality gate, both named browser gates and Playwright E2E. Any failed, cancelled, skipped or missing shard must prevent success.
- Merge blob reports into HTML/JSON. Compare actual test identities with unsharded discovery, rejecting missing, duplicate, unexpected or incomplete results. Report existing skips and retry/flaky counts separately.
- Do not remove tests, weaken assertions, increase test timeouts, modify dependencies or touch production configuration.
- Measure actual latest-head CI wall time against the old 30-minute timeout and successful 26.7-minute Safari test baseline. Predictions exclude setup and queue time.

## Design

Two browser matrices share a local composite action. Separate lightweight browser gates preserve existing check names. The total gate merges reports, validates coverage and verifies both browser results. Failed-attempt diagnostics remain separate from replaceable per-shard blob artifacts, allowing a failed-job retry to combine with successful first-attempt shards.

Eight shards predict a four-minute Safari test critical path and use 16 runners, leaving room for the two independent gates within a 20-job allowance. Actual runner availability and cold image pulls remain measurement risks. Use native Playwright grouping rather than a custom scheduler.
