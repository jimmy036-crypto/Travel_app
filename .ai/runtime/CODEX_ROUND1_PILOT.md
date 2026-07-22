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

## E. Human Plan review

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

## F. Create one short-lived Approval

Only after completing the Plan review, create the one-time local Approval using the exact generated phrase:

```powershell
$approvalInfo = node scripts/ai/agent-runner.mjs approve `
  $planInfo.planPath `
  --phrase $planInfo.approvalPhrase |
  ConvertFrom-Json

$approvalInfo
```

The Approval applies only to one Plan hash, expires quickly, cannot be reused, and must not be committed. It authorizes only the reviewed read-only analysis run—not repository writes, Firebase access, deployment, or ingest.

## G. Execute from the human shell

Reconfirm this is an ordinary PowerShell, the worktree is clean, the local policy is still constrained, and the packet/hash inputs have not changed. Then, and only then:

```powershell
$runInfo = node scripts/ai/agent-runner.mjs execute `
  $planInfo.planPath `
  $approvalInfo.approvalPath |
  ConvertFrom-Json

$runInfo
```

The nested-Agent guard must refuse this command from an Agent-managed environment. Run output is local-only under `.ai/runs/` and must not be committed.

## H. Inspect the bounded result

```powershell
node scripts/ai/agent-runner.mjs inspect $runInfo.runDirectory
```

Inspect reports process, hash, schema, identity, round, and secret-pattern status. Passing inspect means only that the artifact is structurally eligible for human review; it does not prove the analysis is correct.

## I. Human content review

Open `candidate-response.json` inside `$runInfo.runDirectory` and read it completely. Verify repository evidence, assumptions, alternatives, risks, tests, unknowns, confidence, participant/session/round identity, and absence of sensitive data. Reject unsupported or unsafe content. Plan, Approval, stdout, stderr, candidate, and result files remain local and ignored.

## J. Later, separate ingest

This Runner never ingests automatically. Only after a human accepts the candidate should a later, separately authorized task validate a copied response artifact and call the Discussion ingest command. Do not combine review and ingest into this runbook, do not auto-answer prompts, and do not pipe output directly into the active Session.
