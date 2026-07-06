# Claude Code 專案指令

開始任何工作前，必須完整閱讀並遵守根目錄的 `AGENTS.md`。

本專案採用「Agent 實作與測試、CI 驗證、人工合併」模式。禁止直接推送保護分支、正式部署、存取 secrets，或為了通過測試而降低測試標準。

常用指令：

```bash
npm run agent:guardrails
npm run agent:verify
npm run agent:verify:all
```
