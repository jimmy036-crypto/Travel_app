# T4B-1 FIX1 驗證紀錄

## 修改前盤點

- 已順暢：既有記帳新增、分帳計算、預算更新 callback、圖表與結算資料模型。
- 已重現缺口：六位旅伴時，個人預算明細在首屏先佔用大量垂直空間，視圖切換入口被推離；結算範圍使用半套 tab 語意。
- 明確 bug：未發現計算、付款人、分帳或結算結果錯誤。
- 待驗證：真實瀏覽器／CI 的多尺寸首屏與完整 E2E，需使用專案既有 Emulator。

## FIX1 變更

- 個人預算明細預設收合；新增原生按鈕，使用 `aria-expanded`／`aria-controls`，展開後保留原有六位旅伴資料與 `onUpdateBudget` 行為。
- 記帳總額 → 視圖切換 → 個人預算摘要的視覺順序固定，讓主要入口先出現。
- 圖表說明與分類文字由 10px 提高至 14px，總計短標籤提高至 12px；結算範圍改用 toggle button 語意（`aria-pressed`）。結算異常說明與整體對比仍需另行實測，不能由此變更推定通過。
- 新增六位旅伴首屏與鍵盤收合／展開回歸測試；不新增或修改任何業務寫入。

## 測試證據

- 初版 `ee643ea`：相關 Vitest 5 files／71 tests passed；`verify:fast` 107 files／1209 tests、TypeScript、ESLint 與 build 通過；`git diff --check` 通過。
- 初版只跑 `expense-crud` 與 `expense-settlement` 的 Desktop Chrome（10 passed），沒有涵蓋使用相同預算明細的多端同步測試。這個驗證範圍不足是本次 CI 遺漏的原因。

## PR #70 E2E 修補（2026-09-14）

### 基準與 Preflight

- 修補前 HEAD：`ee643ea3eb41a49ffba6cc0fa1af14e72298b0d2`。
- 最新 `origin/main`：`a7a7874ad263e493ba413a93354d19ed6ecc2975`；本分支相對它落後 0、超前 1 個 commit。
- `npm run task:preflight -- --allow-feature`：FAIL，唯一失敗為本地 `main` 落後 `origin/main` 5 commits；工作樹乾淨、遠端 fetch 與分支核對通過。沒有改 preflight 腳本或其他 worktree。
- 開啟中的 PR 只有本任務 #70，沒有其他核心檔案衝突。

### 原因、範圍與修補輪次

[PR run 34807541276](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34807541276) 與 [push run 34807527514](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34807527514) 的兩種瀏覽器皆為：177 passed／3 failed／0 flaky／7 skipped。每個失敗案例初次及 2 次自動重試都失敗。

三個失敗都位於 `realtime-sync.spec.ts`：

| 案例 | 原失敗點 | 本次保留的資料驗證 |
| --- | --- | --- |
| expense creation | 找不到收合區內 Alice 的 `member-spent` | 總額 1,200、每人 600、原 payer／備註、遠端不得出現本地成功 toast、reload 保留 |
| expense edits | 建立階段同樣找不到 `member-spent` | JPY 2,000、匯率 0.21、TWD 420、每人 210、更換 payer、reload 保留 |
| expense deletion | 刪除前建立階段同樣找不到 `member-spent` | 原確認操作、帳目移除、總額與兩人的已花金額歸零、reload 保留 |

- 分類：測試前置操作未跟上已核准的 UI 收合契約，非本次證據所支持的 listener／Emulator／flaky 問題。
- 本地未修補版本單跑 creation：1 failed，重現同一行、同一 selector。失敗快照已有遠端帳目與 `NT$ 1,200`，預算按鈕顯示「2 人 · 查看」。
- 第 1 輪修補：只在此 suite 的 `openExpenseTab` 補原生點擊；先斷言預設收合且無預算列，再展開並斷言 2 列。兩個獨立 contexts 與 reload 都走此步驟。
- 全 repository 搜尋 `member-spent`／預算相關 selectors：只有 `expense-crud.spec.ts` 與 `realtime-sync.spec.ts` 使用已花明細；前者已有明確展開，後者本輪補齊。
- 原有金額、分帳、重新整理與多端斷言零刪除、零放寬；未改產品程式、共用 fixture、CI、timeout、retry 或 workers。

### 本輪執行結果

在既有 `demo-travel-e2e` Emulator（本機 `127.0.0.1`）執行：

```text
TRAVEL_E2E_SKIP_LOCAL_ENV=true
npm run test:e2e -- e2e/realtime-sync.spec.ts e2e/expense-crud.spec.ts e2e/expense-settlement.spec.ts
```

| Project | Expense CRUD | Settlement | Realtime sync | Failed／Flaky／Skipped／Retry |
| --- | --- | --- | --- | --- |
| Desktop Chrome | 8 passed | 2 passed | 10 passed | 0／0／0／0 |
| Mobile Safari（WebKit 模擬） | 8 passed | 2 passed | 10 passed | 0／0／0／0 |

單次修補後執行合計 **40 passed（4.0 分鐘）**。修補前的失敗與修補後的執行分開記錄，未將重跑合併成虛構的單次全過。完整新 CI 結果以 [PR #70 checks](https://github.com/jimmy036-crypto/Travel_app/pull/70/checks) 對應最新 commit 為準；此處不預先宣告通過。

本輪提交前 `npm run verify:fast` 通過（107 files／1209 tests，TypeScript、ESLint、build 通過）；`git diff --check` 通過。`verify:fast` 的輸出保留在 `.tmp/pr70-e2e-fix/verify-fast.log`。

本地重現 trace／截圖保留於忽略目錄 `.tmp/pr70-e2e-fix/before/`，修補後命令紀錄位於 `.tmp/pr70-e2e-fix/targeted.log`；這些是本機證據。審查者可由上述 GitHub run 的 logs／artifacts 查看 CI 證據（artifact 保留 14 天）。

## 瀏覽器限制

本紀錄不包含真實票券或個資。390×844 六人案例已在兩個 Playwright projects 驗證元素可見、沒有全頁水平溢出及鍵盤展開／收合；其 `toBeVisible` 斷言不等同完整首屏 bounding box／hit-test 驗收。320／375、768／1024／1440、完整 light／dark 對比與 200% 仍未補齊，本次 E2E 修補不能覆蓋這些缺口。

實體 iPhone Safari、VoiceOver、軟鍵盤與 safe-area 仍待人工確認。T2／T3／T4A 的外部服務、正式 Google 登入／部署後 smoke 及未定位的歷史間歇性問題仍保留；這次固定失敗的修復不表示那些問題已解決。
