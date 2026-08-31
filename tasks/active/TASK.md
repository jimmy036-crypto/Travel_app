# Task

Google Auth 上線後的第一個安全層：讓 canonical owner 能從 Lobby 永久刪除整趟雲端旅程，並改善帳號／角色辨識。刪除必須 fail closed、可重試且涵蓋 RTDB、Firestore ACL、Storage、邀請與成員索引。

## Prerequisites

- 從 PR #54 已合併的最新 `main` 建立獨立 branch。
- 不修改或疊加 open PR #45 的停車／地圖與 `src/TripDetail.jsx`。
- 所有 Firebase 驗證只使用 Emulator；Codex 不執行 production deploy。

## Scope

- Lobby 保留 `userTrips` role，顯示「擁有者／共同編輯」。
- Owner 使用 typed-confirmation dialog 永久刪除；editor 僅能從本裝置隱藏。
- 新增 owner-only `deleteTrip` callable、可重試 deletion journal 與 durable background worker；callable 只接受要求，不同步等待 Storage 清理完成。
- 刪除時凍結 RTDB 與 Storage client access，清除 room data、所有成員 index、invite lookup、Firestore ACL 與 `rooms/{roomId}/**` Storage objects。
- 保留最小 permanent reservation/deletion tombstone，防止 room ID 與 Storage namespace 重用。
- 延遲 membership trigger 不得重建 ACL；建立配額只能 exact-once 釋放。
- AccountSection 增加切換帳號、情境資訊與長 Email 可讀性。
- Lobby、深連結、離線快取與進行中的 async 操作都綁定目前 Google UID；切換帳號時不得短暫顯示或開啟上一個帳號的旅程。

## Out of Scope

- 本 PR 不修改票券／記帳 participant schema；該項需另做 participant foundation 與 production migration。
- 不修改 `src/TripDetail.jsx`、PR #45 地圖區或金額計算。
- 不執行 deploy、merge、auto-merge 或 production data operation。

## Acceptance Criteria

- 只有 canonical active Google owner 能啟動或重試；editor、removed、outsider、非 Google provider 均零 destructive mutation。
- `roomAccess.state=deleting` 後所有 room client read/write 及 Storage read/create/delete 立即 fail closed。
- 刪除成功後 RTDB room/access/index/invites、Firestore member ACL、Storage room prefix 為零；無關 room 不受影響。
- 任一 phase 失敗後保留 owner retry card；worker lease、bounded Storage cleanup、重試、並發、404 與 final RTDB failure 都 idempotent。
- Storage 使用 generation precondition；object hold 或不完整 metadata 會停止刪除，不會擅自解除 hold。
- quota release exact-once；延遲 trigger 不會重新授權。
- completed tombstone 不保留旅程標題、成員清單或 invite hash。
- Owner dialog 精確輸入完整名稱、離線禁用、busy 不可關閉、錯誤可重試、成功清除本機 offline snapshot。
- Editor 看不到永久刪除；角色與本機隱藏語意清楚。
- 切換 Google 帳號會關閉上一帳號的旅程與破壞性 dialog；舊帳號尚未完成的邀請、建立、編輯或刪除回應不得改動新帳號 UI。
- focused unit、Functions、Rules Emulator、targeted Playwright、`npm run verify:fast` 與 `git diff --check` 通過。

## Related Tests

- `functions/src/tripDeletion.test.js`
- `functions/src/collaboration.test.js`
- `src/firebase.rules.test.js`
- `src/features/trip-access/DeleteTripDialog.test.jsx`
- `src/components/TripCard.test.jsx`
- `src/features/auth/AccountSection.test.jsx`
- `e2e/trip-deletion.spec.ts`

## Commit

```text
feat: add secure owner trip deletion
```
