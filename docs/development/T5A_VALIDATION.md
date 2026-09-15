# T5A 介面一致性與遺留驗收紀錄

## 範圍

- 基準：`80f4100a22f3b0cbbfca320ea89548e4de1e09d2`（已含 PR #70）。
- 僅調整記帳區 DOM／焦點順序、結算說明可讀性與記帳表單原生 select 的主題／觸控呈現。
- 未修改計算、分帳、結算、付款人預設、repository、權限、Firebase 或同步架構。

## 自動化驗收對照

| 驗收 | 證據 |
| --- | --- |
| T5A-01 | `ExpenseSection.test.jsx` 驗證 DOM 內可聚焦控制順序；`expense-crud.spec.ts` 以 Tab／Shift+Tab 實測收合與展開順序。 |
| T5A-02 | 合成六人旅程、390×844：首屏不先捲動，對新增、三視圖、預算與首筆帳目標題量測位置、底部導覽裁切與中心 hit-test；展開後逐一捲到六位旅伴輸入。 |
| T5A-03 | 合成長中文／無空格英文姓名、長帳目與大金額於 320、375、768、1024、1440 px 檢查 `scrollWidth <= innerWidth` 與關鍵金額。 |
| T5A-04 | `SettlementPanel` 範圍說明、未抵銷／舊紀錄提示提升為正文；既有 `expense-settlement.spec.ts` 保留精確範圍與金額契約。 |
| T5A-05 | 新增、三視圖、預算、預算輸入以實際 bounding box（至少 44×44）及中心 hit-test 驗證；展開按鈕有 `aria-expanded`。 |
| T5A-06 | Light 與 Dark 行程主題下，幣別、日期、付款人原生 select 實測 `color-scheme`；Dark 案例以 OS Light 偏好執行。 |
| T5A-07 | 390×844 以 `html { font-size: 200% }` 測試記帳 sheet，確認 Save／Cancel 的矩形與 hit-test、modal focus trap、關閉返回觸發器。這是 html font-size equivalent，不是 browser zoom、Dynamic Type 或實體軟鍵盤。 |
| T5A-08 | 收合／展開／視圖切換前後 Emulator room snapshot 完全相同；明確預算輸入仍由既有 `onUpdateBudget` callback 處理。既有 expense CRUD／settlement／realtime 套件保留 TWD、JPY、split、reload 與多端斷言。 |
| T5A-09 | `companion-identity.spec.ts`、`unified-example-trip.spec.ts` 回歸票券、旅伴偏好、付款人與四入口流程。 |

## 本地結果

- 相關 unit：5 files／73 passed／0 failed。
- 記帳、結算、即時同步 E2E：42 passed／0 failed／0 retry（Desktop Chrome、Mobile Safari）。
- 旅伴與範例旅程 E2E：28 passed／0 failed／0 retry（Desktop Chrome、Mobile Safari）。
- 第一次 E2E 啟動在 0 個案例前失敗：新 worktree 缺少既有 Functions 依賴。使用忽略的 junction 指向既有工作目錄依賴後，沒有安裝套件、沒有改 E2E 設定，相關 E2E 才可執行。

## 截圖與限制

- 新增 E2E 會附加合成的 390×844 收合／展開與 200% sheet 截圖至 Playwright test artifact；CI artifact 可供 PR 審查。
- 未使用正式 Firebase、真實帳目、真實帳號或真機。
- 實體 iPhone Safari 的原生 select／日期選擇器、軟鍵盤、safe-area、VoiceOver 與旋轉後操作仍需真機驗證。
