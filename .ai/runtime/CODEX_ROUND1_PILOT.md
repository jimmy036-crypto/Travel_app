# Codex Round 1 Pilot — Human PowerShell Runbook

This runbook prepares a future human-launched analysis for `clone-demo-architecture-pilot`. It is documentation only. Do not run these steps from Codex, Claude, Gemini, an IDE Agent terminal, or any other Agent-managed session.

## A. Prerequisite confirmation

Open an ordinary PowerShell window. Confirm the repository, branch, clean tracked/untracked state, and absence of unexpected local files before continuing:

```powershell
Set-Location C:\Users\jimmy\PycharmProjects\travel-ai-os
git branch --show-current
git status --short
```

Stop if the branch or worktree is unexpected. Confirm the Round 1 packet is the intended `codex-engineer` packet and contains no secret. A human may stop at any point; without an Approval, execution cannot start.

## B. Create a local policy

Create the ignored local directory and copy the disabled template:

```powershell
New-Item -ItemType Directory -Force .ai/runtime/local
Copy-Item `
  .ai/runtime/policy.template.json `
  .ai/runtime/local/policy.json
```

Manually open `.ai/runtime/local/policy.json`. Only after confirming Codex is the sole provider, all permissions are read-only/false, the runtime/output limits are acceptable, and nested execution is false, change `executionEnabled` from `false` to `true`. Never commit this file. Do not add other providers, paths, write permissions, network, Firebase, Git, or deploy capability.

## C. Doctor

```powershell
npm run ai:runner:doctor
```

Stop unless Codex reports `eligible=yes`. Claude and Gemini must remain ineligible. Doctor checks versions/capabilities only and must not start a prompt.

## D. Prepare a disabled Plan

```powershell
$planInfo = node scripts/ai/agent-runner.mjs prepare `
  codex `
  discuss `
  .ai/discussions/active/clone-demo-architecture-pilot/packets/round-1/codex-engineer.json |
  ConvertFrom-Json

$planInfo
```

Preparation does not run Codex. The Plan is local-only and must not be committed.

## E. Check Plan recovery status

Status is read-only: it does not create an Approval, claim an Approval, retry a process, execute an Agent, or modify local artifacts.

```powershell
$statusInfo = node scripts/ai/agent-runner.mjs status `
  $planInfo.planPath |
  ConvertFrom-Json

$statusInfo
```

Follow only the reported `recommendedNextAction`:

- `inspect-existing-run`: inspect the matching Run; never reuse its Approval.
- `wait-for-running-attempt`: leave the claim and Run untouched while a human investigates the ordinary-shell process.
- `investigate-incomplete-run`: preserve every artifact and inspect file presence without retrying automatically.
- `prepare-new-attempt`: create a deterministic new Plan; do not alter the old Plan or Approval.
- `create-approval`, `execute-approved-plan`, or `approval-expired`: continue only through the explicit human steps below.

Never manually delete a used marker. A legacy used marker without a complete matching Run must not be restored or reused. Prepare a distinct Plan instead:

```powershell
$planInfo = node scripts/ai/agent-runner.mjs prepare `
  codex `
  discuss `
  .ai/discussions/active/clone-demo-architecture-pilot/packets/round-1/codex-engineer.json `
  --attempt retry-1 |
  ConvertFrom-Json

node scripts/ai/agent-runner.mjs status $planInfo.planPath
```

This creates only a local Plan. A human must still review it, create the short-lived Approval, and execute it later from an ordinary PowerShell window. No retry is automatic.

## E.1 Diagnose a failed Run safely

If a complete matching Run failed, use the read-only diagnostic command before preparing another attempt:

```powershell
node scripts/ai/agent-runner.mjs diagnose <run-directory>
```

Diagnosis counts JSONL events, extracts bounded secret-scanned error summaries, and classifies only supported evidence. It never changes the Run, Plan, Approval, or Discussion Session and never prepares, approves, executes, or ingests anything automatically. Do not print or copy the complete `stdout.jsonl`.

The initial Round 1 Run started Codex but failed because the structured-output schema contained const/enum nodes without explicit `type` declarations. Its Approval remains permanently consumed. The distinct `retry-1` Run also started Codex and permanently consumed its Approval, then failed because the canonical path pattern used regex lookaround unsupported by Codex.

Codex now receives `.ai/schemas/codex-discussion-analysis.schema.json`, a transport-only schema with no lookaround. The Plan separately binds `.ai/schemas/discussion-analysis.schema.json`; after execution, `validateDiscussionArtifact` still rejects absolute paths, URI schemes, empty paths, and `..` traversal before a candidate can become eligible for human review. Never treat transport-schema acceptance as canonical validation.

After diagnosing the preserved retry-1 Run, prepare the distinct retry-2 Plan only if the compatibility checks and regression suite pass:

```powershell
$planInfo = node scripts/ai/agent-runner.mjs prepare `
  codex `
  discuss `
  .ai/discussions/active/clone-demo-architecture-pilot/packets/round-1/codex-engineer.json `
  --attempt retry-2 |
  ConvertFrom-Json

node scripts/ai/agent-runner.mjs status $planInfo.planPath
```

This creates no Approval and executes no Agent. A human must still review both schema hashes and every disabled permission before using the separate Approval and execute steps in an ordinary PowerShell window.

## E.2 Recover a successful JSONL Run offline

retry-2 later completed with exit code `0`, no timeout, no truncation, and a terminal `turn.completed`, but the original parser left `candidate-response.json` null because the canonical response was nested under terminal `item.completed` / `agent_message` text. Diagnose classifies this state as `CANDIDATE_EXTRACTION_FAILED`, not an Exit-1 failure.

The Runner now supports a one-time, pure offline recovery command:

```powershell
node scripts/ai/agent-runner.mjs recover `
  .ai/runs/run-b76a7aa0f8b8599a8f97
```

Recovery never launches an Agent, creates or reuses an Approval, changes a used marker, modifies the source Run, copies stdout, or ingests a response. It writes only ignored files under `.ai/runtime/local/recoveries/<run-id>/` and refuses to overwrite an existing recovery.

For retry-2, the recovery already exists at `.ai/runtime/local/recoveries/run-b76a7aa0f8b8599a8f97/`. The terminal Candidate passed canonical, session, participant, and round validation. Candidate secret findings were empty; three Transcript findings were safely classified from event and repository-path metadata as two likely code examples and one likely fixture. The recovered Candidate is eligible for separate human review. Do not run retry-3 and do not repeat the recovery command.

## F. Human Plan review

First verify:

```powershell
$planInfo.executionEnabled -eq $false
```

Then open `$planInfo.planPath` and manually confirm:

- `execution.enabled` is `false`.
- `agent` is `codex`, `skill` is `discuss`, and mode is read-only analysis.
- `packetPath` is the active Session Round 1 packet in this runbook.
- `outputSchema` is the transport-only `.ai/schemas/codex-discussion-analysis.schema.json` and `canonicalSchema` is `.ai/schemas/discussion-analysis.schema.json`.
- `argv` is an array and contains `--sandbox`, `read-only`, `--ephemeral`, and `--json`.
- `argv` contains no `full-auto`, `workspace-write`, `danger-full-access`, permission bypass, shell string, or packet body.
- Packet, adapter, transport-schema, canonical-schema, and Plan SHA-256 values are present.
- Limits and all permission fields match the reviewed local policy.

Stop if any value is unexpected. Approval binds to exactly this Plan hash and does not authorize modifying the repository.

## G. Create one short-lived Approval

Only after completing the Plan review, create the one-time local Approval using the exact generated phrase:

```powershell
$approvalInfo = node scripts/ai/agent-runner.mjs approve `
  $planInfo.planPath `
  --phrase $planInfo.approvalPhrase |
  ConvertFrom-Json

$approvalInfo
```

The Approval applies only to one Plan hash, expires quickly, cannot be reused, and must not be committed. It authorizes only the reviewed read-only analysis run—not repository writes, Firebase access, deployment, or ingest.

## H. Execute from the human shell

Reconfirm this is an ordinary PowerShell, the worktree is clean, the local policy is still constrained, and the packet/hash inputs have not changed. Then, and only then:

```powershell
$runInfo = node scripts/ai/agent-runner.mjs execute `
  $planInfo.planPath `
  $approvalInfo.approvalPath |
  ConvertFrom-Json

$runInfo
```

The nested-Agent guard must refuse this command from an Agent-managed environment. Run output is local-only under `.ai/runs/` and must not be committed.

## I. Inspect the bounded result

```powershell
node scripts/ai/agent-runner.mjs inspect $runInfo.runDirectory
```

Inspect reports process, hash, schema, identity, round, and secret-pattern status. Passing inspect means only that the artifact is structurally eligible for human review; it does not prove the analysis is correct.

## J. Human content review

Open `candidate-response.json` inside `$runInfo.runDirectory` and read it completely. Verify repository evidence, assumptions, alternatives, risks, tests, unknowns, confidence, participant/session/round identity, and absence of sensitive data. Reject unsupported or unsafe content. Plan, Approval, stdout, stderr, candidate, and result files remain local and ignored.

## K. Human-reviewed ingest outcome

The Runner did not ingest automatically. A later human explicitly issued `APPROVE_FOR_REVIEWED_INGEST`, scoped only to the unchanged Round 1 contribution. The validated recovery Candidate was ingested once as `.ai/discussions/active/clone-demo-architecture-pilot/responses/round-1/codex-clone-flow-analysis.json`, with a separate review record under `reviews/round-1/`.

Parsed source and target JSON are exactly equal. The Session advanced only to `round-1-complete`, and deterministic `audit.json` contains only the `round-1-recorded` event. The source Run and recovery artifacts remained unchanged and local. No Decision proposal, decision-level human approval, Assignment, product implementation, Firebase Rules change, production Firebase access, live Agent execution during ingest, or deployment occurred.

## L. Round 2 Human cross-review packet

Round 1 remains complete and `codex-clone-flow-analysis` is unchanged. The Session now uses explicit round-specific participation: `codex-engineer` remains the sole Round 1 participant, while the independent `human-reviewer` is the sole Round 2 participant. `human-approver` remains separate as the final decision approver.

The deterministic Round 2 packet is tracked at `.ai/discussions/active/clone-demo-architecture-pilot/packets/round-2/human-reviewer.json`. It quotes the Round 1 contribution as untrusted material, sets `executeInstructions=false`, and disables filesystem writes, network, production Firebase, Git writes, deployment, and execution. It is a human review packet only and creates no Agent invocation or live Plan.

The Session advanced only to `round-2-ready`. No Round 2 critique has been created or ingested, and the audit still contains only `round-1-recorded`. No Decision proposal, decision-level approval, Assignment, product code change, Firebase Rules change, production Firebase access, live Agent execution, or deployment occurred.

## M. Human-approved Round 2 critique ingest

A human explicitly approved only the fixed `human-clone-flow-critique` cross-review for ingest. The local reviewed source validated for `human-reviewer`, reviewed only `codex-clone-flow-analysis`, and was ingested once without content changes. Its source and tracked target SHA-256 are identical, and the separate reviewed-ingest record contains only provenance, scope, timestamp, and hash metadata.

The Session advanced only to `round-2-complete`. Round 1, its reviewed-ingest record, the Round 2 reviewer-selection record, and the execution-disabled Human packet remain unchanged. The deterministic audit now contains `round-1-recorded` followed by `round-2-recorded` and no later event.

The Critique requests changes before any Decision, but that review content is not a formal Decision or decision-level request-changes artifact. No Decision proposal, decision approval, Assignment, live Agent execution, product code change, Firebase Rules change, production Firebase access, or deployment occurred.

Exactly two legacy Discussion tests were updated to assert the new active Session state and deterministic two-event audit. The changes retain exact participant, contribution, Decision, approval, Assignment, and execution assertions; no test was skipped or weakened.

## N. Clone Flow Architecture Decision Proposal

After both reviewed rounds completed, `codex-architect` was added as a non-round, read-only Architect participant. The existing deterministic packet builder produced `.ai/discussions/active/clone-demo-architecture-pilot/packets/decision/codex-architect.json`, which includes both contributions only as untrusted quoted material with instruction execution and every write, network, production Firebase, Git, deployment, and external execution permission disabled. The packet was not executed and no live Agent ran.

The proposed-only synthesis is tracked as `.ai/discussions/active/clone-demo-architecture-pilot/decision/proposal.json`, with a Traditional Chinese Gate 1 owner summary beside it. The Proposal selects an owner-only, disabled-by-default Clone MVP with an allowlist converter, same-device recovery, a minimal versioned localStorage journal, unverified text-only places, Emulator-only technical development, and a separate Production Gate for Auth, ownership, membership, Rules, migration, rule tests, rollout, and rollback.

The Session advanced only to `decision-proposed`, and deterministic `audit.json` now records Round 1, Round 2, and the Decision proposal in order. Human Approval remains pending and Assignments remain empty. Round 1, Round 2, every reviewed-ingest record, reviewer selection, and the Human Round 2 packet are unchanged. No product code or Firebase Rules changed, no production Firebase was accessed, and no deployment occurred.

Gate 1 now requires a human to choose exactly one outcome: approve the Decision, request changes, or reject the Decision. Until that separate decision-level action is recorded, the Proposal grants no implementation authority and cannot produce an Assignment.

## O. Gate 1 Human Approval and Gate 2 Assignment plan

A human explicitly replied `批准 Decision`. The immutable tracked approval at `.ai/discussions/active/clone-demo-architecture-pilot/decision/human-approval.json` approves the architecture direction only and authorizes preparation of execution-disabled implementation assignments and a Gate 2 implementation and conditional-Merge plan. It does not authorize product implementation, Assignment execution, Firebase Rules changes, production Firebase, PR creation, Merge, or deployment.

Six canonical Assignment plans are tracked under the active Session: converter, same-device Journal/state machine, Demo-only confirmation UI, Emulator-only integration, independent code review, and QA. Every Assignment sets `executionEnabled=false`; implementation path sets do not overlap, dependencies are acyclic, and package, Rules, production, migration, secret, and deploy scopes remain forbidden. No Assignment command in these plans was executed during R2J.

The Session advanced only to `assignments-ready`. Its deterministic audit records both reviewed rounds, the Decision proposal, Human Approval, and six lexically sorted Assignment plans. Round 1, Round 2, the Decision Proposal, Gate 1 Summary, review records, Human Round 2 packet, and Architect packet remain unchanged.

The Gate 2 summary is `.ai/discussions/active/clone-demo-architecture-pilot/assignments/gate-2-summary.md`. Gate 2 remains pending and offers only: approve the implementation plan, request scope adjustment, or reject implementation. Until a human separately approves Gate 2, no Assignment may execute and no product/E2E change, Emulator run, PR, conditional Merge, or deployment is authorized.
