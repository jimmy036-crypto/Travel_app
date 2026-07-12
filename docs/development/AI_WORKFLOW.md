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
請讀取專案根目錄 GEMINI.md，以及其中指定的所有上下文文件。

本次只做工作流程驗證：
- 不要修改檔案
- 不要建立分支
- 不要執行測試

請回報：

1. 專案名稱與技術棧
2. 任務前 preflight
3. 禁止的 Git 操作
4. 禁止的 Firebase 操作
5. 本機測試與 GitHub Actions 分工
6. TASK.md 未指定 branch 時的處理
7. 工作樹不乾淨時的處理
8. HANDOFF.md 必須包含的內容

如果無法讀取任何上下文文件，列出完整路徑並停止。
```
