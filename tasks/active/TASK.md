# Task

新增受控的旅程擁有者轉移 Admin CLI，讓少量既有旅程可在維護時段透過
PLAN／APPLY／VERIFY 安全轉移給已加入的 Google 編輯者；同時修正永久刪除對
「原建立者」與「現任擁有者」的混用。

## Prerequisites

- 從 PR #58 已合併的最新 `main` 建立獨立 branch。
- 目標 Firestore 為 Standard `(default)`、`us-central1`。
- 新擁有者必須先 Google 登入並成為該旅程的 active editor。
- Codex 不執行 production deploy、pause 或資料寫入。

## Scope

- 新增 ownership transfer mapping example 與 Admin CLI。
- PLAN 產生不可覆寫且 SHA-bound 的 manifest，且不得寫入 Firebase。
- APPLY 需要 project、database host、筆數、manifest SHA 與維護視窗確認。
- 轉移時舊 owner 降為 active editor，新 owner 升為唯一 active owner，兩人的
  `aclVersion` 單調增加。
- 同步 `rooms.meta.ownerUid`、`roomAccess`、`userTrips` 與 Firestore Storage ACL。
- 撤銷該旅程既有邀請連結，保留旅程內容與 Storage object namespace。
- `roomReservations.createdByUid` 保留為歷史建立者與建立配額歸屬；現任 canonical
  owner 仍能永久刪除。

## Out of Scope

- 不新增一般使用者可操作的 owner-transfer callable 或 UI。
- 不修改 Firebase Security Rules、Storage Rules、Firestore Rules 或前端元件。
- 不改寫票券、記帳、同行成員、行程內容或 Storage object。
- 不執行 production migration、deploy、merge 或 auto-merge。

## Acceptance Criteria

- PLAN 對 Firebase 零寫入，拒絕非 Google 身分、非 active editor、owner 漂移、
  creation ID 不一致、刪除／維護中與 ACL mirror 不一致。
- APPLY 在任何轉移前先完成全批 preflight，並使用受控 per-room maintenance lease。
- 轉移期間以 canonical `roomAccess` maintenance state 與 Firestore guard 阻擋
  client、成員 callable、邀請 lookup 修復及延遲 ACL 同步競爭。
- 每趟轉移後只有一個 active owner；舊 owner 保留 active editor。
- RTDB canonical membership/index 與 Firestore ACL 使用提高後的一致版本。
- 舊邀請 lookup 被撤銷，旅程內容、Storage namespace 與 immutable reservation 不變。
- VERIFY 可驗證已完成狀態；重跑不會反轉或重複提高版本。
- 新 owner 可永久刪除，舊 owner 不可；quota 只退回原建立者且 exact-once。
- focused Functions tests、`npm run verify:fast` 與 `git diff --check` 通過。

## Related Tests

- `functions/scripts/transfer-trip-ownership.test.js`
- `functions/src/tripDeletion.test.js`

## Manual QA

- 合併後由使用者在 Production 暫停且使用者離線的維護視窗執行 PLAN/APPLY/VERIFY。
- 驗證新 owner 可管理邀請、成員與永久刪除；舊 owner 顯示為共同編輯者。

## Commit

```text
feat: add guarded trip ownership transfer
```
