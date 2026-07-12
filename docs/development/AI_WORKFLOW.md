# AI Workflow

This project uses one task, one branch, and one implementer. Other agents may review, but they must not edit the same branch at the same time.

## Agent roles

GPT:

- Architect.
- Task planner.
- Reviewer.
- Risk analyst.
- PR review support.

Gemini:

- Local Implementer.
- Modify code and docs within the task scope.
- Run targeted tests.
- Commit and push the task branch.
- Fill `tasks/active/HANDOFF.md`.

Codex:

- High-risk or complex tasks.
- CI, Firebase, Realtime, and Storage work.
- Difficult debugging.
- Independent review when needed.

GitHub Actions:

- Neutral quality gate.
- Complete regression.
- Final automated validation.

Human:

- Manual QA.
- PR merge decision.
- Production deploy decision.

## Core rule

One task, one branch, one implementer. Other agents only review.

Two agents must not modify the same branch at the same time.

## Standard lifecycle

GPT creates `TASK.md`
-> Implementer develops
-> Implementer runs targeted tests
-> Implementer commits and pushes
-> Implementer writes `HANDOFF.md`
-> GPT reviews
-> Implementer fixes blockers
-> GitHub Actions runs full checks
-> Human performs manual QA
-> Human merges

## Active task bootstrap

A clean clone contains `tasks/active/.gitkeep` but may not contain an active task.

- GPT or a human creates `tasks/active/TASK.md` from `tasks/templates/TASK_TEMPLATE.md` before assigning implementation.
- If `tasks/active/TASK.md` is missing, the implementer stops and reports the missing path.
- If `tasks/active/TASK.md` does not specify a branch, the implementer stops and does not invent one.
- The implementer must not create task content from assumptions.
- `tasks/active/HANDOFF.md` is not required before implementation starts.
- When the task is complete, create `tasks/active/HANDOFF.md` from `tasks/templates/HANDOFF_TEMPLATE.md` if it does not already exist.

## Active task version control

- `tasks/active/TASK.md` is commit-eligible by default so agents and reviewers can share the same task specification.
- `tasks/active/HANDOFF.md` is ignored local state and should not be committed unless the task explicitly requires it.
- `tasks/templates/` must be committed.
- `tasks/active/.gitkeep` must be committed so the active task directory exists in a clean clone.
- If a completed task needs a durable historical record, move the final task or handoff content into `tasks/archive/` manually in a separate documentation change.
- Do not automatically archive every task.
- Do not mix routine handoff updates into product commits.

## Branch lifecycle

- Do not start a new task that modifies the same files as an unmerged PR unless the user explicitly asks for a stacked PR.
- New branches must start from latest `main`.
- A pushed branch is not merged.
- A change is in `main` only after GitHub shows the PR as merged.

## Context handoff

Agents must not report only "done". Every handoff must include:

- Branch.
- Base commit.
- Commits.
- Files changed.
- Validation executed.
- Tests not executed.
- Risks.
- Git status.
- Recommended next action.

## Codex quota policy

Reserve Codex for:

- Firebase.
- Realtime race conditions.
- Storage lifecycle.
- Expense calculation.
- CI infrastructure.
- Large cross-file debugging.
- High-risk pre-release review.

Prefer Gemini for:

- General UI.
- CSS.
- Empty State.
- Skeleton.
- Component tests.
- Selector maintenance.
- Documentation.
- Small refactors.

## Gemini Context Smoke Test

Copy this prompt into Gemini to verify context loading:

```text
Read the project root GEMINI.md and all context files it requires.

This is only a workflow smoke test:
- Do not modify files.
- Do not create a branch.
- Do not run tests.

Report:

1. Project name and technical stack.
2. Required preflight before a task.
3. Forbidden Git operations.
4. Forbidden Firebase operations.
5. Local testing versus GitHub Actions responsibilities.
6. What to do when TASK.md does not specify a branch.
7. What to do when the working tree is not clean.
8. What HANDOFF.md must include.

If any context file cannot be read, list the full path and stop.
```
