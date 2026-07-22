# AI Project Changelog

Record important AI-governance changes and decisions. Product release notes remain in the product release system.

## Phase AI-3B2B-R2B — Codex Exit-1 Diagnosis

- Safely diagnosed the initial Run's four JSONL events without reproducing raw output or sensitive values.
- Confirmed that the initial child process started, the initial Approval remains consumed, exit code was `1`, and the candidate was null; no response was ingested.
- Classified the root cause as `OUTPUT_SCHEMA_REJECTED` with high confidence: Codex rejected const/enum schema nodes that omitted explicit JSON Schema `type` declarations.
- Added the read-only `diagnose` command with bounded, secret-scanned summaries and evidence-based failure categories.
- Applied a transport-schema compatibility fix without weakening canonical Discussion validation, and added mock-only regression coverage.
- Prepared a deterministic, execution-disabled local `retry-1` Plan after the fix passed all required tests. No Approval was created and no Agent prompt was executed during diagnosis.
- No product behavior changed and no deployment occurred. Approval and execute remain human-only operations in an ordinary shell.

## Phase AI-3B2B-R1 — Recoverable Runner Attempts

- Added atomic, exclusive Approval claims that become used markers only after the child `spawn` event.
- Added Run directories and `attempt.json` before process launch, plus durable result/stdout/stderr/candidate artifacts for launch failures.
- Added deterministic `--attempt` Plan identities and read-only Plan status reporting.
- Made inspect tolerate failed launches, invalid candidates, and null candidates without enabling automatic ingest.
- Preserved the existing used marker; no Approval was reused.
- The existing Plan has a complete matching failed Run and status recommends `inspect-existing-run`, so no retry Plan was prepared by this task.
- No Agent prompt was executed, no response was ingested, no product behavior changed, and no deployment occurred.
- Approval and execute remain human-only operations in an ordinary shell.

## Phase AI-3B2A — First Codex Round 1 Pilot Preparation

- Added the first non-synthetic Discussion Session.
- Added an evidence-based Demo Clone architecture brief.
- Added a deterministic, execution-disabled Codex Round 1 Packet.
- Added a human-only PowerShell pilot runbook.
- Updated the active-session regression contract because the Project OS now intentionally contains its first validated non-synthetic active Discussion Session.
- The regression still validates the synthetic fixture and now verifies that the named Pilot Session is discovered and validated; no Discussion validation rule was weakened.
- No live Agent prompt was executed.
- No Approval was created.
- No response was ingested.
- No product behavior changed.
- No deployment was performed.

## Phase AI-3B1 — Controlled Live Runner Foundation

- Added the controlled live runner foundation.
- Added plan-hash-bound, expiring human approval.
- Added a non-bypassable nested Agent execution guard.
- Added CLI capability feature detection, timeout and output limits, and secret environment-name redaction.
- Added schema-validated results with manual-only import status.
- No live Agent prompt was executed.
- No product behavior changed.
- No deployment was performed.

## 2026-07-22 — AI Project OS Foundation

- Established `.ai/` as the single source of truth for project status, architecture, roadmap, ADRs, risks, roles, test strategy, active tasks, and machine-readable schemas.
- Added six bounded agent roles with explicit permissions and handoff expectations.
- Recorded the existing Demo, Offline Preview, Clone Flow, and FeatureTour decisions as ADRs.
- Added shared schemas for agent responses, tasks, and decisions without adding SDKs, MCP configuration, CI, or production code.
- Kept provider-specific root files as navigation only so they cannot drift into separate project histories.

## Phase AI-1.1 — AI Project OS Alignment

- The original AI Project OS branch was based on `main`.
- A clean integration worktree was created from `feature/first-run-guided-demo`.
- The AI Project OS foundation commit was cherry-picked.
- Existing untracked files in the original worktree were left untouched.
- No production source code changed.
- No product behavior changed.
- No deployment was performed.
- No branch history was rewritten.

## Phase AI-2A — Understanding Skills

- Added a tool-agnostic Understand Skill.
- Added a tool-agnostic Explain Diff Skill.
- Added structured understanding-guide and explain-diff schemas.
- Added a deterministic, self-contained offline HTML renderer using only Node.js built-ins.
- Added quiz behavior, semantic validation, security escaping, and stale-artifact detection.
- Added the first real First-run Welcome understanding and diff artifacts.
- No product behavior changed.
- No deployment was performed.

## Phase AI-2B - Agent Adapters and Invocation Workflow

- Added shared Codex/Gemini skill adapters.
- Added Claude project skill adapters.
- Added Gemini slash-command adapters.
- Added an adapter manifest with computed canonical hashes.
- Added an invocation schema and six plan-only examples.
- Added a deterministic plan-only invocation generator.
- Added a redacted CLI availability doctor.
- No external Agent prompt was executed.
- No product behavior changed.
- No deployment was performed.

## Phase AI-3A - Structured Multi-Agent Discussion Protocol

- Added a fixed-round discussion protocol.
- Added independent-analysis isolation and cross-review contracts.
- Added an Architect proposal gate with proposed-only status.
- Added mandatory Human Approval before assignment planning.
- Added non-executing work assignments and path-ownership checks.
- Added a clearly labelled synthetic protocol fixture.
- No external Agent prompt was executed.
- No product behavior changed.
- No deployment was performed.
