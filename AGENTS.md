# Travel 專案 AI Agent 規範

本檔是所有 AI coding agent 的最高層專案規範。若工具有自己的指令檔，也必須以本檔為準。

## 目標工作模式

使用者只需要提供任務與驗收標準。Agent 負責：

1. 讀取現有實作與測試。
2. 建立或使用獨立工作分支。
3. 做最小且可回滾的修改。
4. 執行相關檢查與測試。
5. 根據失敗結果修補，最多自動修補三輪。
6. 整理變更摘要、測試結果、風險與未完成項目。
7. 建立或更新 Draft PR，等待最新 head 的預期 CI checks 完成；失敗時依規範修補與重測。
8. CI 通過後才交付完成報告，等待人工合併；遇到需要額外授權等真正阻塞時，明確回報 BLOCKED，不宣稱完成。

## 不可逾越的安全邊界

Agent 不得：

- 直接修改、提交或推送到 `main`、`master`、`release`。
- 執行 `git push --force`、刪除遠端分支、重寫已推送歷史。
- 執行 `firebase deploy`、`vercel deploy` 或任何正式環境部署。
- 存取、顯示、修改或提交 `.env.local`、`.env.*.local`、API key、token、憑證。
- 連線正式 Firebase 資料庫做測試；測試只能使用 Firebase Emulator。
- 為了讓測試變綠而降低斷言、移除案例、增加任意長 timeout 或跳過測試。
- 未經明確授權修改 Firebase Security Rules、GitHub Actions、套件鎖檔或核心資料模型。
- 執行破壞性命令，例如未限制路徑的 `rm -rf`、`git clean -fdx`、清空資料庫。

## 開始任務前

1. 執行 `npm run task:preflight`。若在 feature branch 做後續修正，可使用 `--allow-feature`。
2. 確認工作樹乾淨，且不會覆蓋不屬於本任務的變更。
3. 從最新 `main` 建立或使用明確指定的獨立工作分支。
4. 前一個會修改相同核心檔案的 PR 未 merge 前，不開始下一個功能；除非使用者明確要求 stacked PR。
5. 將需求轉成可驗證的 acceptance criteria。
6. 找出最接近的既有單元測試或 E2E 測試。
7. 先說明預計修改範圍；避免一次跨越多個里程碑。

詳細工作流程見 `docs/development/WORKFLOW.md`。精簡任務格式見 `docs/development/CODEX_TASK_TEMPLATE.md`。

建議分支格式：

```text
ai/<issue-number>-<short-slug>
fix/<short-slug>
test/<phase-or-feature>
```

## 實作原則

- 優先最小修改，不順便重構無關程式碼。
- 優先沿用現有 helper、data-testid、Firebase Emulator 與測試風格。
- Realtime Database 寫入必須考慮多端 listener、資料一致性與刪除流程。
- Storage 變更必須同時考慮 Database metadata、Storage object 與失敗清理。
- 金額計算必須維持守恆，不用浮點數近似掩蓋差異。
- E2E 必須使用穩定 selector；優先 `getByRole` 與 `data-testid`，不得依賴脆弱 CSS 結構。
- 測試失敗時，先判斷是產品 bug、測試 bug、環境問題或 flaky test，再決定修改位置。

## 驗證規則

開發中只跑與修改直接相關的測試。Commit 前至少執行：

```bash
npm run verify:fast
git diff --check
```

若修改 Firebase、Realtime listener、Storage、Drag and Drop、支出或跨頁流程，還必須執行相關 Playwright suite。

完整 E2E 預設交由 PR CI 執行。只有修改 Playwright config、Firebase Emulator 啟動流程、共用 E2E helper/fixture、GitHub Actions、重大 release，或需要重現 CI 問題時，才在本機執行：

```bash
npm run verify:full
```

不得使用 `test.only`，不得刪除測試、降低斷言、增加任意長 timeout 或跳過測試。詳細測試政策見 `docs/development/TEST_POLICY.md`。

## PR CI 完成交付門檻

- 推送 commit 或建立 Draft PR 不等於任務完成。正常執行期間持續等待並檢查 CI，不以「已 push／CI 執行中」作為完成交付。
- 每次推送後重新取得 PR 最新 head SHA，核對該版本的預期 checks。依目前 workflow 至少包含 Agent guardrails、Fast quality gate、Desktop Chrome、Mobile Safari 與 Playwright E2E 總檢查；另核對其他適用檢查。不能因 branch protection 未設定 required checks，就把空清單視為通過。
- 必須確認預期 checks 已結束且成功。queued、in progress、failure、cancelled、timed out、缺少結果或必要 job 被 skipped 都不是 PASS。核對 PR synthetic merge 時須能追溯至最新 head／base。
- 同一 head 同時有 push 與 pull_request runs 時，分開核對與記錄，不以成功的 push run 蓋過失敗的 PR run，也不以舊 head 的綠燈交付新 commit。再次推送後，重新等待新版本檢查。
- 失敗先閱讀 job log、trace 與階段證據，分類為產品、測試、環境或 flaky；依同一失敗最多三輪的規則修補，重跑相關本地測試後再推送並等待 CI。不得只反覆重跑直到綠燈而宣稱根因已修復。
- 完成報告列出 head SHA、run 連結、各瀏覽器及總檢查結果；本地與 CI、passed／failed／flaky／skipped、retry 與人工重跑分開記錄。既有案例的條件式 skipped 也須如實列出，不能稱全部案例已執行。
- 需要受限修改的額外授權、無法安全使用測試環境、無法取得 CI 結果或三輪仍失敗時，停止受影響範圍，回報具體 BLOCKED、已嘗試內容與最少必要下一步。不得以放寬測試、擅改 workflow／套件／權限或轉交人工 QA 來繞過門檻。
- 此門檻不授權 auto-merge、正式部署或修改 GitHub branch protection；仍由使用者人工合併。

## 自動修補上限

- 同一個失敗最多自動修補三輪。
- 每一輪都必須保留失敗原因與修改理由。
- 三輪後仍失敗，停止擴大修改，建立 Draft PR 或報告阻塞點。
- 不得用刪除測試、`test.skip`、放寬斷言作為預設解法。

## 風險分級

### 高風險，必須人工審核

- `.github/workflows/**`
- `database.rules.json`、`storage.rules`、`firebase.json`
- `src/firebase.js`
- `package.json`、`package-lock.json`
- `playwright.config.ts`、`vite.config.js`
- `e2e/**` 與既有測試斷言
- 資料模型、刪除流程、同步衝突、付款或金額計算

注意：修改 `e2e/**` 本身不會自動提高產品風險；它提高的是測試信心與審查風險。產品風險仍依實際行為變更判斷。

### 中風險

- `src/TripDetail.jsx`
- `src/components/**`
- Firebase CRUD、Storage、Realtime listener
- PWA cache、Service Worker、路由與狀態管理

### 低風險

- 純文件、註解、開發說明
- 不影響邏輯的文案與樣式微調
- 新增但不改變既有契約的測試工具

Autopilot Phase 1 不啟用任何 auto-merge；所有 PR 都由使用者合併。

## 完成報告格式

Agent 最終必須回報：

```text
任務：
分支：
修改檔案：
實作摘要：
驗收標準結果：
已執行測試：
未執行測試及原因：
風險等級：
需要人工確認：
回滾方式：
```
