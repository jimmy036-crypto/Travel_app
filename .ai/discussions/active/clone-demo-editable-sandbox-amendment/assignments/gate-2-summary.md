# Editable Demo Sandbox and Clone Flow — Revised Gate 2

> **原六份 Assignment Plan 已被此 Amendment supersede，且不得執行。新九份 Assignment 均為 `executionEnabled=false`。Revised Gate 2 尚未批准，不得開始產品實作。**

## 原計畫變更原因

原 Gate 1 已批准 owner-only Clone 架構，但人類在 Gate 2 要求 Demo 不再唯讀，並新增可重新開啟的高階「功能介紹」。人類其後明確「確認採用」持久化本機可編輯 Sandbox、重設示範資料，以及 Lobby／Settings 功能介紹 replay。原 Session 與六份 Assignment 保留為 immutable audit history；本修正版九份 Assignment 才是後續 Gate 2 審批對象。

## Demo Sandbox 行為

- 每次從不可變的 `createTokyoDemoTrip` source template 建立 defensive local copy。
- 使用 `travel-app-demo-sandbox-v1` 保存 schemaVersion、templateVersion、sandboxId、trip、createdAt、updatedAt。
- `local-demo-sandbox` 只是本機識別，不是真實 room ID，不進入 myTrips。
- 讀寫前做 localStorage availability、JSON、schema、version、ID 與內容驗證；所有資料視為 untrusted。
- storage 不可用時可使用明確標示的 memory-only Sandbox；不會因此連接 Firebase。
- Reset 需確認，只清除本機 Sandbox key，再由最新 templateVersion 重建。
- Demo open/edit/save/reset 全程不寫 Firebase、Storage、myTrips 或 Offline Trip Cache。

## 可編輯功能

- 行程景點新增、編輯、刪除、拖曳排序。
- 抵達時間與備註修改。
- Checklist 新增、編輯、勾選、刪除。
- Checklist assignee 設為目前 owner 或未指派。
- Clone 使用當下通過 Sandbox validator 的 snapshot，再經原 approved allowlist converter。

## 不在此次範圍的功能

費用、結算、票券、附件、Storage upload 與 Firebase collaboration 不在本 Amendment 的可編輯範圍。這些區域若保留範例內容，必須清楚標為 preview-only，且不得產生任何雲端副作用。Clone 成功後也不會自動 Reset Sandbox。

## 功能介紹與功能導覽的差異

- **功能介紹：** Lobby 與 Settings 可見，重用 `FirstRunWelcomeDialog` 的 App 高階能力內容；replay 不讀寫 onboarding completion／eligibility／seen 狀態，仍可選擇開啟 Demo 或建立旅程。
- **功能導覽：** 保留既有 Settings 入口與 TripDetail contextual spotlight tour，只在旅程情境中介紹控制項。
- 兩者必須使用不同文案、test ID、accessible name、callback 與狀態流程，不得合併。

## 九份 Assignments

1. `editable-demo-sandbox-store`：版本化 localStorage、defensive copy、validation、reset、memory fallback。
2. `editable-demo-preview`：行程與 Checklist 編輯、Reset confirmation、local-only UI。
3. `clone-demo-converter`：驗證 current Sandbox snapshot、allowlist、owner-only、retry IDs。
4. `clone-demo-journal`：原 approved same-device recovery 與 minimal Journal。
5. `clone-demo-confirmation-ui`：以「目前示範副本」為來源的獨立 Clone confirmation。
6. `feature-introduction-replay`：Lobby／Settings 功能介紹與無 onboarding side effect 的 replay mode。
7. `editable-demo-app-integration`：Sandbox、Clone、replay、Emulator repository 與 myTrips verification wiring。
8. `editable-demo-code-review`：Decision、path、immutability、local-only 與 Feature Introduction/Tour separation review。
9. `editable-demo-qa-verification`：Emulator、Vitest、Playwright、Desktop/Mobile 與 isolation evidence。

## 執行順序

Store 與 Feature Introduction replay 可獨立開始；Preview 與 Converter 依賴 Store；Journal 依賴 Converter；Confirmation 依賴 Converter、Journal 與 Preview；App Integration 依賴前六份 implementation work；Code Review 依賴全部七份 implementation Assignments；QA 只在 Review 無 blocking finding 後執行。

## 允許路徑

只允許各 Assignment JSON 中列出的 `allowedPaths`。七份 implementation Assignment 的 allowed paths 互不重疊：`App.jsx` 只屬於 `editable-demo-app-integration`；`DemoTripPreview` 只屬於 `editable-demo-preview`；`FirstRunWelcomeDialog` 與 `AppSettingsMenu` 只屬於 `feature-introduction-replay`。Review 與 QA 報告／E2E paths 不與 implementation ownership 衝突。

## 禁止路徑

禁止 Firebase Database／Storage Rules、production Firebase configuration、Offline Cache implementation、ticket／expense domains（除指定 preview-only UI）、package／lockfile、dependency、migration、secret、`.env` 與部署檔案。不得擴大 ownership 或使用破壞性 Git 操作。

## 測試與 QA

Revised Gate 2 若獲批准，才允許依九份 Assignments 在隔離分支實作並執行指定 Vitest、Firebase Emulator、Playwright、typecheck、lint、build、guardrails、review 與 QA。QA 必須證明 reload persistence、Reset isolation、完整 edit flows、template immutability、zero cloud writes、Clone edited snapshot、forbidden-data exclusion、功能介紹／功能導覽分離、onboarding eligibility 不變、Desktop Chrome、Mobile Safari 與完整 regression。

## 條件式 Merge 條件

- 所有 Acceptance Criteria 與完整 regression 通過。
- 七份 implementation work 全部在各自 allowed paths 內。
- Reviewer 無 blocking finding，QA 與 CI 通過。
- Demo open/edit/reset 對 Firebase、Storage、myTrips、Offline Cache 零寫入。
- Clone 符合 amended Decision 與所有 original safety gates。
- 功能介紹 replay 不改變 onboarding state，功能導覽保持獨立。
- 沒有 Firebase Rules、production Firebase、dependency、migration、secret 或 deploy 變更。
- 沒有 test skip、only、assertion 弱化或被吞掉的 failure。

## 重新升級給人類的例外

範圍或 path ownership 擴大、需要 Rules／production Firebase／dependency／migration／secret／deploy、Decision 必須改變、Sandbox 需要雲端同步、需新增 expense/ticket/attachment editing、測試無法正常通過、Reviewer/QA 有 blocking finding、或需要破壞性 Git 操作時，必須取消條件式 Merge 並回到人類 Gate。

## 審批選項

- 批准修正版實作計畫
- 要求調整範圍
- 拒絕實作

> **本 Amendment 不允許 production Firebase、Firebase Rules、dependency、migration 或 Deploy。Revised Gate 2 尚未批准前，九份 Assignment 不得執行。**
