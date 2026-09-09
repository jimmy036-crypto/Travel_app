# Task

解除選用 TDX 停車 Secret 與其他 Firebase Functions 部署的耦合，讓旅程擁有者轉移所需
的限定 Functions deploy 不必先建立不相關的 TDX 憑證。

## Prerequisites

- PR #59 已合併，ownership transfer 工具與操作手冊已存在於 `main`。
- 從最新 `main` 建立獨立 branch，且沒有 open PR 修改相同 Functions 入口。
- Codex 不執行 production deploy、Secret 建立或 production 資料寫入。

## Scope

- 移除 `TDX_CLIENT_ID`／`TDX_CLIENT_SECRET` 的 build-wide parameter registration。
- 僅在 `searchParking` endpoint 保留兩個 Secret Manager runtime bindings。
- 停車服務仍從 runtime environment 讀取憑證；未設定時維持既有 `not_configured` 降級。
- 增加 endpoint manifest regression test 與 ownership transfer runbook 說明。

## Out of Scope

- 不修改 Firebase Security Rules、Storage Rules、Firestore Rules、前端或資料模型。
- 不改變 TDX API、停車搜尋、quota 或 fallback 行為。
- 不建立、讀取、顯示或修改 production Secret 值。
- 不執行 production deploy、ownership APPLY、merge 或 auto-merge。

## Acceptance Criteria

- Functions build manifest 不再宣告 TDX build-time params。
- `searchParking` 仍精確綁定 `TDX_CLIENT_ID` 與 `TDX_CLIENT_SECRET`。
- ownership transfer 所需九個 endpoints 均沒有 TDX Secret binding。
- 未設定 TDX 環境值時，停車 provider 仍安全降級且不呼叫 TDX。
- Functions tests、`npm run verify:fast` 與 `git diff --check` 通過。

## Related Tests

- `functions/src/index.test.js`
- `functions/src/parking.test.js`

## Manual QA

- 合併後由使用者從最新 `main` 重試 runbook 中的九個 Functions 限定部署。
- 未設定 TDX Secret 時，部署不應查詢或提示 TDX；不得用占位值繞過。

## Commit

```text
fix: decouple optional TDX secrets from function deploys
```
