# T4B-1 旅行記帳閱讀與操作精修驗證

## 基準與範圍

- 基準 `origin/main`：`eb78f40`，已包含 T4B-0 與 PR #68 的旅伴流程及 CI 分流。
- 分支：`fix/travel-t4b1-expense-ux`。
- 本次只調整記帳清單、預算、表單、圖表篩選與結算呈現；未修改計算 helper、repository、資料模型、權限或同步架構。

## 修改前盤點

- 已順暢：三個視圖、新增入口、日期分組、既有編輯回呼、付款人／分攤區分、結算範圍與轉帳狀態契約。
- 已重現問題：預算輸入只有很小的文字／不可辨識的 label；部分記帳正文與結算輔助文字低於 MASTER 建議；表單欄位 label 未全部與控制項關聯；320px 兩欄配置壓縮日期與金額。
- 待驗證：真機軟鍵盤、safe-area、原生 select 實際 OS 表面、完整 Emulator E2E（本機 Functions discovery 不穩定）。

## 實作

- `ExpenseSection.jsx`：新增入口、視圖與圖表篩選保留原功能並補觸控／選取語意；預算輸入補成員與幣別 accessible name；記帳正文及長項目改為可讀、可換行。
- `SettlementPanel.jsx`：提高摘要與範圍說明層級；轉帳人員名稱允許長文字換行；主要操作保留 44px 觸控及可見 focus。
- `UIComponents.jsx` 的 `ExpenseModal`：補欄位 `id`／`htmlFor` 關聯；320px 幣別／金額、日期／付款人改單欄；保留原生 select、驗證、payload、保存與取消契約；重算與更多操作補足觸控／focus。
- 新增 unit assertions：確認視圖／統計對象 `aria-pressed`、預算 accessible name 及所有表單 label 關聯。

## 測試證據

- 相關 unit：`5 files / 70 passed`。
- `npm run verify:fast`：`107 files / 1208 passed`，TypeScript、ESLint、build 通過（95.4 秒）。
- `git diff --check`：通過。
- 相關 Playwright：執行 2 次均在 0 個案例開始前停止。第一次為新 worktree 缺少既有 `functions/node_modules` junction；補接既有依賴後第二次仍為 Functions discovery 10 秒載入逾時，webServer 120 秒後停止。未修改 timeout／Emulator／Playwright 設定；記錄於 `.tmp/t4b1-expense-e2e-2.log`、`.tmp/t4b1-expense-e2e-3.log`。
- `impeccable detect` 只回報 `UIComponents.jsx:348` 既有厚邊框樣式警告，位於本次未修改的其他元件；未擴大範圍。

## 驗收狀態

| 驗收 | 結果 |
| --- | --- |
| B1-01～B1-03 | PARTIAL：unit／build 通過；缺完整瀏覽器尺寸證據 |
| B1-04 | PARTIAL：既有 modal unit 保留保存失敗／重複提交；Playwright 被環境阻塞 |
| B1-05～B1-07 | PASS（unit／既有精確計算與結算測試）；本次未改業務值 |
| B1-08 | PARTIAL：DOM／class 與 unit 語意通過；320／375／390、明暗、200% 尚無本輪瀏覽器證據 |
| B1-09 | PASS（計算、結算及 payload 相關既有測試 68 cases 通過；未產生資料 migration） |

## 限制與回滾

- 未使用正式 Firebase、真實帳目或外部服務；未部署。
- 實體 iPhone／VoiceOver、軟鍵盤、safe-area、原生 PDF／第三方 App 不在本階段。
- 未合併前關閉 Draft PR 即可回滾；已合併後以新 revert branch＋PR，不重寫 main。回滾不撤銷使用者已提交的帳目。
