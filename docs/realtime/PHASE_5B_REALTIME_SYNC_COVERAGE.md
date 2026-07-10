# Phase 5B Realtime Sync Coverage

## Phase 5B 目標

Phase 5B 驗證真實 UI 層級的多人即時同步。測試以兩個 browser context 進入同一個 Firebase room / trip，Context A 透過 UI 操作，Context B 不重新整理即可看到同步結果，並在 reload 後確認資料已持久化。

## 已完成測試清單

### 5B-1 Place creation sync

- 測試名稱：`syncs place creation between active browser contexts in realtime`
- 驗證內容：Context A 新增景點，Context B 即時看到，reload 後仍存在。

### 5B-2 Place edit sync

- 測試名稱：`syncs place edits between active browser contexts in realtime`
- 驗證內容：名稱、抵達時間、停留時間、備註同步。

### 5B-3 Place deletion sync

- 測試名稱：`syncs place deletion between active browser contexts in realtime`
- 驗證內容：Context A 刪除景點，Context B 即時消失，reload 後仍不存在。

### 5B-4 Itinerary drag sync

- 測試名稱：`syncs itinerary drag changes between active browser contexts in realtime`
- 驗證內容：同日排序、鍵盤 DnD、順序與時間重算同步。

### 5B-5 Expense creation sync

- 測試名稱：`syncs expense creation between active browser contexts in realtime`
- 驗證內容：平均分帳、費用列、總支出、個人分攤統計同步。

### 5B-6 Expense edit sync

- 測試名稱：`syncs expense edits between active browser contexts in realtime`
- 驗證內容：費用名稱、金額、付款人、備註、統計同步。

### 5B-6 Expense deletion sync

- 測試名稱：`syncs expense deletion between active browser contexts in realtime`
- 驗證內容：費用刪除、confirm dialog、統計歸零同步。

### 5B-7 Storage attachment status sync

- 測試名稱：`syncs storage attachment status between active browser contexts in realtime`
- 驗證內容：票券圖片附件上傳狀態、票券卡片、備註、附件 UI 狀態同步。

## 測試檔案位置

- `e2e/realtime-sync.spec.ts`
- `e2e/itinerary-drag.spec.ts`
- `e2e/expense-crud.spec.ts`
- `e2e/ticket-storage.spec.ts`
- `e2e/place-storage.spec.ts`

## 目前驗證基準

```bash
npm run agent:guardrails
npx tsc --noEmit
npm run lint
npm run test:run
npm run build
npm run test:e2e -- e2e/realtime-sync.spec.ts
npm run agent:verify
npm run agent:verify:all
```

## 已知風險

- E2E 測試數量增加，CI 時間會逐步上升。
- Storage 測試不能併行亂跑，可能造成 emulator port conflict。
- Drag 測試應優先使用既有鍵盤 DnD flow，避免 Mobile Safari pointer drag 不穩。
- 刪除按鈕若缺少 `data-testid`，未來可能需要補穩定 selector。
- Bottom Sheet / mobile keyboard 仍需持續觀察。

## 尚未覆蓋項目

- Storage 附件刪除同步。
- 票券 PDF 同步。
- 景點圖片附件同步。
- 景點 PDF 附件同步。
- 自訂分帳 realtime sync。
- 離線後重新同步。
- 多人同時編輯衝突提示。
- 遠端刪除時本地正在編輯的處理。
- 同步中 / 已同步 / 同步失敗的 UI 狀態。

## 後續建議

- 先進行 realtime UX polish，而不是繼續堆更多 E2E。
- 可做「正在同步」狀態提示。
- 可做「遠端更新提示」。
- 可逐步建立 Page Object 降低 E2E selector 重複。
- CI 若超過 5-8 分鐘，再拆 Storage heavy tests 或 nightly full E2E。
