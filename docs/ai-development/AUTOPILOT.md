# AI Autopilot 開發流程

## Phase 1 目標

將原本「AI 回覆程式碼、人工複製貼上」改為：

```text
使用者建立任務
→ Agent 在獨立 branch 直接修改
→ Agent 執行 typecheck / lint / Vitest / build / 定向 E2E
→ Agent 最多自動修補三輪
→ Agent 建立 Draft PR
→ GitHub Actions 執行完整品質閘門
→ 使用者審核並合併
```

Phase 1 不允許 Agent 自動合併或部署。

## 每個任務的標準輸入

至少提供：

- 目標：要改善什麼。
- 驗收標準：畫面、資料與測試應呈現什麼結果。
- 不在範圍：本次明確不做什麼。
- 手動驗證：是否需要真機、地圖、相機、分享或其他人工操作。

可直接使用 `.github/ISSUE_TEMPLATE/ai-task.yml` 建立任務。

## Agent 執行順序

1. 讀 `AGENTS.md`。
2. 檢查工作區與目前 branch。
3. 建立小型實作計畫。
4. 修改產品程式與必要測試。
5. 執行 `npm run agent:guardrails`。
6. 執行 `npm run agent:verify`。
7. 視變更執行定向 Playwright。
8. 準備 PR 前執行 `npm run agent:verify:all`，或交由 CI 執行完整 E2E。
9. 建立 Draft PR，附上測試證據與風險。

## 人工保留的控制點

使用者只保留：

- 定義需求與驗收標準。
- 確認高風險變更。
- 執行無法自動化的真機或視覺驗收。
- 合併 PR。
- 正式部署。

## 建議觀察期

先完成 10 個 Agent PR，記錄：

- 首次通過率。
- 平均修補輪數。
- flaky test 次數。
- 人工退回原因。
- 進入正式環境後的 regression。

達到以下條件後，才考慮 Phase 2 低風險 auto-merge：

- 連續 10 個 PR 無 production regression。
- CI 必要檢查穩定。
- Agent 沒有削弱測試或越權修改。
- auto-merge 僅限文件或明確低風險路徑。
