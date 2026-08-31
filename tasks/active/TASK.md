# Task

修正 Google Auth rollout 後舊版票券附件被遷移到非 canonical Storage 路徑，導致已授權 owner 仍無法開啟票券的問題，並提供可審核、可重跑且預設 dry-run 的 production repair 工具。

## Prerequisites

- PR #53 已合併至 `main`，Google Auth、strict Firebase Rules 與 legacy migration 已存在。
- Production 在既有三個錯誤附件修復並完成 owner/outsider smoke test 前維持暫停。
- 不修改或疊加 open PR #45 的停車功能與 `TripDetail.jsx` 區域。

## Scope

- Legacy root `tickets/{fileName}` 的目的路徑改為 `rooms/{roomId}/tickets/{ticketId}/{fileName}`。
- 修補 migration focused tests，覆蓋 canonical ticketId namespace、衝突與重跑安全。
- 提供只處理已知非 canonical `rooms/{roomId}/tickets/{fileName}` 的 production repair 規劃／工具。
- Repair 必須驗證 RTDB ticket identity、來源與目的 object、metadata/checksum、ACL namespace，以及更新 `storagePath` 的一致性。
- 補上 dry-run、明確 project confirmation、SHA-bound manifest、apply/finalize/rollback
  三階段驗證，以及 RTDB／Firestore owner ACL mirror gate。
- 強化 RTDB Rules，讓 repair lease 期間 client 寫入 fail closed，並永久拒絕非 canonical
  ticket `storagePath` 與 URL 欄位中的 Firebase Storage download URL。

## Out of Scope

- Codex 不連線 production Firebase、不執行 deploy、不直接搬動或刪除正式 object。
- 不放寬 RTDB、Firestore 或 Storage Rules。
- 不修改 ticket UI、TripDetail、費用、旅程刪除或 participant identity schema。
- Codex 不刪除 production 來源 object；只有人工在 smoke test 通過後明確執行
  `--finalize`，工具才可依 generation precondition 清理來源。

## Acceptance Criteria

- 新的 legacy migration 會把 root ticket object 放到 Storage Rules 允許的 canonical ticketId 路徑。
- 同一來源不能對應多個目的；既有不同 `storagePath` 或不可信目的 object 時 fail closed。
- 已遷移錯誤路徑可在 dry-run 中被精確辨識，不能掃描或修改不相關附件。
- Apply 順序可重跑：先 copy/驗證並 hold 所有 canonical 目的檔，再原子更新 RTDB
  `storagePath`，且保留來源供 smoke test 與 rollback；hold 持續到 finalize／rollback。
- Finalize 重驗 hold ownership、ACL、RTDB、來源與目的 fingerprint，最後才依 generation
  precondition 刪來源；中斷後可安全重跑，且工具不接管或解除 foreign hold。
- Rollback 在任何來源已被 finalize 刪除時 fail closed，且跨階段留下的 temporary hold
  不會造成雙邊 object 同時遺失。
- Apply／finalize／rollback 以 per-room RTDB lease 序列化；中斷後只能在人工確認舊程序
  已結束，並備份及精確確認既有 invocation ID、manifest `runId` 與 SHA 後，才可人工
  清除該 room 的 lease；工具不提供 in-band takeover。
- RTDB Rules 在 lease 存在時拒絕 owner/editor client 寫入；lease 解除後仍以永久 validator
  拒絕 legacy root、四段式、跨 room、錯 ticket ID 與額外 path segment 的 attachment path。
- Ticket create/update 不能把 Firebase Storage download URL 寫回 RTDB 的 `url`、
  `appUrl` 或 `fallbackUrl`；合法 web link、空／缺省 storagePath 與 ticket deletion 維持正常。
- 修復後 owner 可透過 Auth + Rules 讀取；removed/outsider/anonymous 仍被拒絕。
- Functions migration tests、`npm run verify:fast` 與 `git diff --check` 通過。

## Related Tests

- Unit: `functions/scripts/migrate-legacy-trip-access.test.js`、
  `functions/scripts/repair-legacy-ticket-storage-path.test.js`
- Rules/Emulator: Storage owner/editor/removed/outsider path matrix（如既有 targeted suite 可直接覆蓋則沿用）。
- E2E: 不新增；PR CI 執行完整 regression。Production 僅在人工維護窗口做 owner/outsider smoke test。

## Commit

```text
fix: repair canonical legacy ticket storage paths
```
