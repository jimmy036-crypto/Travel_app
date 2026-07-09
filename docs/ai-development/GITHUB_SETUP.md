# GitHub 一次性設定

這些設定無法只靠 repository 檔案強制完成，需要在 GitHub 網頁執行一次。

## 保護 main

Repository → Settings → Branches / Rulesets，對 `main` 設定：

- Require a pull request before merging
- Require at least 1 approval
- Dismiss stale approvals when new commits are pushed
- Require status checks to pass
- Require branches to be up to date before merging
- Block force pushes
- Block branch deletion

必要 status checks：

- `Fast quality gate`
- `Playwright E2E`
- `Agent guardrails`

## Phase 1 合併政策

- 禁用 auto-merge。
- Agent 一律開 Draft PR。
- 高風險檔案必須人工檢查 diff。
- 不給 Agent 正式 Firebase、Vercel 或其他部署 secrets。
- CI 只使用 Emulator，不需要正式環境 secret。

## 之後串接 Agent

Claude Code、Codex、Copilot coding agent、Cursor 或 Cline 都應讀取 `AGENTS.md`。給予 repository write 權限時，僅允許建立 branch 與 PR，不允許 bypass branch protection。
