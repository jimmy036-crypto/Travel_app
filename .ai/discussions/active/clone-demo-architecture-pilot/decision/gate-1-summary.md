# Clone Flow Architecture Decision — Gate 1

> **這是 Proposal，尚未獲得 Human Approval，不能建立 Assignment 或修改產品。**

## 推薦方案

採用 owner-only、預設關閉 feature flag 的 Demo Clone MVP。Clone 僅從 Built-in Demo Preview 明確啟動，以 allowlist converter 建立全新旅程；使用最小化、版本化的 localStorage Journal 提供同裝置同瀏覽器復原；景點先採明確標示「未驗證位置」的 cleaned text-only 資料。技術開發只允許 Firebase Emulator；Production 啟用另設 Auth、ownership、membership 與 Firebase Rules Gate。

## 會實作什麼

- Built-in Demo Preview 內的獨立 Clone CTA；Open Demo、Blank Create、Clone 是三個不同操作。
- 版本化完整三日行程，以及重設為未完成、assignee 未指派或指向目前 owner 的 Checklist。
- 建立全新物件圖、room ID、place ID 與 checklist ID 的 allowlist converter。
- owner-only 成員模型，不把虛構顯示名稱當成真實使用者或授權身分。
- 明確標示為未驗證的 text-only 景點，使用者日後可重新透過 Google Places 選取。
- 最小化、七天期限、視為不可信輸入的 localStorage Journal，只承諾 same-device、same-browser recovery。
- Emulator-only 的 create-only room 寫入、模糊結果 read-back、myTrips 同步驗證與 repair/open-link 狀態。
- double-click 共用 in-flight operation，retry／refresh 重用相同 operationId、roomId 與 fingerprint。

## 不會實作什麼

- Lobby entry card、Settings、正式 TripDetail 或 Offline Preview 的 Clone CTA。
- 虛構成員、費用、結算、票券、附件、Storage path、Demo IDs、Demo-only 欄位、guidance、example URL、DEMO order number、舊 timestamp、audit/completion state 或 credential-like data 的複製。
- 把 Demo room ID 放入 myTrips，或把 Demo 寫入 Offline Cache。
- 跨裝置 idempotency、production Firebase、Firebase Rules 修改、production enablement 或 deploy。

## 主要安全限制

- Journal 不保存完整 transformed payload；僅保存必要的版本、operation、room、template、輸入摘要、fingerprint、狀態與時間欄位。
- Journal 每次復原都重新驗證，storage 不可用時不得確認 Clone；過期或不相容資料不可自動寫入。
- fingerprint 只做一致性檢查，不是授權或安全簽章。
- Firebase 結果模糊時只 read-back 驗證，不自動刪除可能已成功的 room。
- Demo 永遠保持 local-only、read-only，且不進入 myTrips 或 Offline Cache。

## 開發 Gate

本 Decision 取得 Human Approval 後，才可在預設關閉的 feature flag 下開發 pure converter、確認 UI、operation state machine、local Journal 與 Firebase Emulator integration。此 Gate 不允許 production Firebase。

## Production Gate

Production 啟用前必須另行批准 Firebase Auth 身分、owner/member/invitation model、Database Rules、Storage Rules、舊 room migration／compatibility、production rule tests，以及 rollout／rollback 計畫。本 Proposal 不批准上述事項。

## 主要風險與緩解

- Journal 遺失或竄改：最小欄位、版本與七天期限、availability preflight、完整重驗與拒絕自動寫入。
- Firebase 模糊成功：create-only operation marker／fingerprint 與 read-back；不自動刪除。
- myTrips 寫入失敗：導航前驗證，保留 Journal 並提供 repair/open-link。
- multi-tab 或 double operation：穩定 operationId／roomId、決定性 IDs、in-flight 共用與 collision 檢查。
- 未驗證景點誤導：清除可信 place_id／routing 宣稱，醒目標示未驗證並允許重新選取。
- App.jsx orchestration 複雜：converter、Journal adapter、state machine 採窄介面分離測試。
- feature flag 意外開啟：預設關閉、回歸測試與獨立 production configuration 審查。
- 現行寬鬆時效 Rules：只在 Emulator 驗證，Production Gate 前不得啟用。

## 尚未決定的後續問題

- 正式 owner/member/invitation authorization model。
- 未來是否需要 backend per-UID ledger 提供 cross-device idempotency。
- Production 是否強制所有 cloned places 重新選取 Google Places。
- 舊 room 的 migration 與 compatibility 政策。

## 審批選項

- 批准 Decision
- 要求修改
- 拒絕 Decision

> **本文件僅供 Gate 1 審批；在 Human Approval 前，不得建立 Assignment、修改產品、修改 Firebase Rules、存取 production Firebase 或部署。**
