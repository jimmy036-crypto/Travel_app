# Task

將 Travel App 改為使用 Google Authentication 的帳號系統，並以可撤銷邀請、owner/editor 成員權限及受保護附件存取取代「知道 room ID 即可進入」的公開模型。

## Prerequisites

- 使用者已授權 Cloud Functions、Cloud Firestore、Firebase Security Rules、相關套件與 lockfile，並採用 Blaze。
- 正式資料 owner UID mapping、Google provider、authorized domains 與 Blaze 由人工在 rollout 時確認。
- 不覆寫或 rebase 其他未合併 PR；如有相同核心檔案衝突，在 Draft PR 中揭露並等待人工決定。

## Scope

- Google 登入、登出、帳號狀態與帳號範圍 Lobby、離線快取。
- Callable Functions：建立旅程、邀請建立/換發/撤銷/兌換、成員列表/移除/恢復。
- RTDB canonical ACL、Firestore Storage ACL mirror、strict RTDB/Firestore/Storage Rules。
- 附件僅保存 `storagePath`，讀取改用逐次驗證的 Blob/object URL。
- Legacy owner migration、download-token 盤點/撤銷、rollout 與 rollback 文件。
- Auth、Functions、Rules、Emulator 與相關 UI/E2E 回歸測試。

## Out of Scope

- Codex 不執行 production deploy、Rules deploy、billing 變更或 Firebase Console 人工設定。
- 不暫時恢復公開 Rules，不保留舊版無驗證 room-link 相容路徑。
- App Check enforce 在 Preview 註冊與驗證前不直接啟用，但列為擴大分享前的 rollout gate。

## Acceptance Criteria

- 只有有效 Google 帳號的 active owner/editor 可讀寫旅程；知道 room ID 的 outsider 被拒絕。
- 邀請使用高熵 fragment token，撤銷/換發後舊 token 失效，removed 成員不能自動重加入。
- RTDB、`userTrips`、Firestore ACL 使用單調 `aclVersion`，延遲 trigger 不得將 rollback/revocation 後的帳號重新授權。
- Storage 每次讀取重新經過 Auth + Rules，不新增或持久化長效 download URL。
- Legacy migration 預設 dry-run、需明確 project confirmation，並在 strict Rules 與維護模式中 fail closed。
- Functions/Rules/unit/targeted E2E 與完整 `verify:full` 通過；不使用 skip、降低斷言或任意 timeout。

## Related Tests

- Unit/component/integration: Auth session、trip access client/dialog、account hydration、repository Blob 附件、Functions domain/collaboration/migration。
- Rules: owner/editor/removed/outsider/non-Google 的 RTDB、Firestore、Storage Emulator matrix。
- E2E: create/redeem、Lobby/appearance/first-run、Realtime、tickets/places Storage、完整 Desktop Chrome + Mobile Safari。
- Manual QA: production Google provider/authorized domains、owner mapping、Functions/Rules/migration 順序、token/CORS、owner/editor/outsider smoke test。

## Commit

```text
feat: secure travel collaboration with Google accounts
```
