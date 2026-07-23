# Clone Flow Implementation Plan — Gate 2

> **目前所有 Assignment 均為 `executionEnabled=false`；在 Gate 2 獲得批准前，不得執行。**

## Gate 1 結果

人類已明確回覆「批准 Decision」，因此 `clone-demo-architecture-proposal` 的架構方向已通過 Gate 1。此結果只允許準備 execution-disabled Assignments 與 Gate 2 計畫；尚未授權產品實作、Assignment 執行、PR、Merge、Firebase Rules、production Firebase 或 Deploy。

## 實作目標

在預設關閉的 feature flag 下，依已批准 Decision 建立 owner-only Demo Clone MVP：採 allowlist converter、最小化 localStorage Journal、same-device／same-browser recovery、未驗證 text-only 景點、Firebase Emulator create-only room 寫入與 myTrips 驗證。Demo 必須維持 local-only、read-only，且不進入 myTrips 或 Offline Cache。

## 六個 Assignments

1. `clone-demo-converter`：純 allowlist converter、owner-only 資料契約與決定性 IDs。
2. `clone-demo-journal`：最小化七天 Journal、same-device recovery 與 operation state machine。
3. `clone-demo-confirmation-ui`：Built-in Demo Preview 專用、可存取且預設關閉的 Clone 確認介面。
4. `clone-demo-emulator-integration`：Emulator-only room 建立、模糊結果 read-back、myTrips 驗證與 repair。
5. `clone-demo-code-review`：依 Decision 與 path ownership 進行獨立程式碼審查。
6. `clone-demo-qa-verification`：Emulator、完整 regression、Desktop Chrome 與 Mobile Safari Playwright 證據。

## 執行順序

`clone-demo-converter` → `clone-demo-journal` → `clone-demo-confirmation-ui` → `clone-demo-emulator-integration` → `clone-demo-code-review` → `clone-demo-qa-verification`。依賴完成前不得啟動後續 Assignment；Reviewer 有 blocking finding 時不得進入 QA。

## 允許修改範圍

Gate 2 若批准，僅允許各 Assignment 的 `allowedPaths`：隔離的 onboarding converter、Journal/state、確認 UI、Emulator repository/orchestration、指定 App integration test、單一 Clone E2E 與本地 review/QA 報告。四個 implementation Assignment 的 allowed paths 互不重疊。

## 禁止修改範圍

Firebase Database／Storage Rules、production Firebase 設定、Offline Cache、ticket／expense domains、package 與 lockfile、dependency、migration、secret 或 `.env.local` 一律禁止。不得擴大 Assignment path ownership，也不得使用破壞性 Git 操作。

## 測試與 QA

Gate 2 的「批准實作計畫」將授權執行六個 Assignments、在隔離分支修改各 Assignment 允許的產品與測試檔案、執行 Firebase Emulator、Vitest、Playwright、lint、typecheck、build 與 guardrails、commit 與 push、建立 PR，並在全部條件通過後進行條件式 Merge。QA 必須記錄 commit、測試數量、skip、失敗與剩餘風險；任何 skip 或 assertion 弱化都必須阻擋 Merge。

## 條件式 Merge 規則

只有同時符合以下條件，Gate 2 批准才可支援條件式 Merge：

- 所有 Acceptance Criteria 通過。
- 完整 regression 通過。
- Reviewer 無 blocking finding。
- QA 通過。
- CI 通過。
- 沒有超出 allowed paths。
- 沒有修改 Firebase Rules。
- 沒有 production Firebase。
- 沒有新增 dependency。
- 沒有 migration。
- 沒有 test skip 或弱化。
- 實作符合已批准 Decision。

## 會重新升級給人類的例外

以下任一情況發生時，必須取消條件式 Merge 並回到人類 Gate：

- 修改範圍擴大。
- 需要 Firebase Rules。
- 需要 production Firebase。
- 需要 migration。
- 需要新增 dependency。
- Decision 必須改變。
- 測試無法正常通過。
- Reviewer 或 QA 有 blocking finding。
- 需要破壞性 Git 操作。

## 本次不包含的 Production 工作

Gate 2 不授權 Deploy、production Firebase、Firebase Rules、migration、dependency change 或 secrets change。Production Auth、owner/member/invitation、Rules、legacy-room compatibility、rollout 與 rollback 仍須另外決策與批准。

## 審批選項

- 批准實作計畫
- 要求調整範圍
- 拒絕實作

> **本文件僅供 Gate 2 審批。人類尚未批准此實作與條件式 Merge 計畫，所有 Assignment 仍不可執行。**
