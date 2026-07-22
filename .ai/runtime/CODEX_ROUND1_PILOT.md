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

## F. Human Plan review

First verify:

```powershell
$planInfo.executionEnabled -eq $false
```

Then open `$planInfo.planPath` and manually confirm:

- `execution.enabled` is `false`.
- `agent` is `codex`, `skill` is `discuss`, and mode is read-only analysis.
- `packetPath` is the active Session Round 1 packet in this runbook.
- `outputSchema` is `.ai/schemas/discussion-analysis.schema.json`.
- `argv` is an array and contains `--sandbox`, `read-only`, `--ephemeral`, and `--json`.
- `argv` contains no `full-auto`, `workspace-write`, `danger-full-access`, permission bypass, shell string, or packet body.
- Packet, adapter, output-schema, and Plan SHA-256 values are present.
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

## K. Later, separate ingest

This Runner never ingests automatically. Only after a human accepts the candidate should a later, separately authorized task validate a copied response artifact and call the Discussion ingest command. Do not combine review and ingest into this runbook, do not auto-answer prompts, and do not pipe output directly into the active Session.
