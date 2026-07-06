# 任務：Travel 專案全域健檢、保守清理與可維護性優化

## 分支要求

目前分支必須是：

`refactor/project-audit-cleanup`

不得在 `main`、`master`、`test/phase-5-realtime-sync` 或任何尚未完成的功能分支上執行。

## 任務目標

全面檢查 Travel 專案中所有「由專案維護者編寫或追蹤」的檔案與程式碼，找出：

- 不再使用的檔案、元件、函式、型別、樣式、常數與依賴
- 重複程式碼與可以抽取的共用邏輯
- 不一致的命名、型別、環境變數與 Firebase Emulator 設定
- 缺少的錯誤處理、邊界檢查、loading/empty/error 狀態
- 缺少或不足的測試
- 過度複雜、過長、責任混雜的元件或函式
- 過時、失真或重複的文件與註解
- TODO/FIXME/HACK、未完成程式碼與臨時 workaround
- 未被使用或可移除的 npm dependencies/devDependencies
- 可能被誤提交的產物、快取、測試報告或本機設定
- GitHub Actions、Playwright、Vitest、TypeScript、ESLint 與 Firebase Emulator 的設定問題

## 掃描範圍

檢查所有 Git 追蹤檔案，尤其包括：

- src/
- e2e/
- scripts/
- docs/
- public/
- .github/
- package.json
- package-lock.json
- tsconfig*.json
- vite.config.*
- playwright.config.*
- firebase.json
- .firebaserc
- eslint.config.*
- AGENTS.md
- README 與其他 Markdown 文件
- .gitignore
- 其他專案設定檔

不要掃描或修改：

- node_modules/
- dist/
- build/
- coverage/
- playwright-report/
- test-results/
- .codex-runs/
- .git/
- 作業系統或 IDE 快取
- 真實 secrets
- .env.local
- 正式 Firebase credentials
- 使用者個人 Codex 設定

## 重要原則

1. 先做完整盤點，再修改。
2. 保持目前可觀察行為與使用者流程不變。
3. 只做有明確證據支持的刪除。
4. 不得因為「看起來沒用」就刪除檔案。
5. 刪除前必須使用至少兩種方式確認未被使用，例如：
   - 全專案 import/reference 搜尋
   - TypeScript/ESLint unused 檢查
   - route、dynamic import、test、script、HTML 或設定檔引用檢查
6. 不得刪除或弱化測試來讓 CI 通過。
7. 不得改動正式 Firebase 專案、Rules、Secrets 或部署目標。
8. 不得改變資料模型，除非有明確 bug 且提供相容性處理與測試。
9. 不得進行大規模 UI 重設計。
10. 不得加入沒有需求的第三方套件。
11. 不得為了「加註解」而替每一行加入註解。
12. 註解只加在：
    - 複雜演算法
    - 非直覺商業規則
    - Firebase/Playwright/Emulator 特殊限制
    - 容易被誤改的相容性邏輯
    - 重要安全邊界
13. 優先使用更清楚的命名、型別與小函式取代冗長註解。
14. 不得 merge、deploy、firebase deploy、force push、reset --hard 或 git clean。
15. 最多進行三輪修補；仍有阻塞時停止擴大修改並回報。

## 執行階段

### 階段 0：基準確認

開始前執行並記錄：

- git status --short
- git branch --show-current
- node --version
- npm --version
- npm run agent:guardrails
- npx tsc --noEmit
- npm run lint
- npm run test:run
- npm run build
- npm run test:e2e
- git diff --check

如果基準測試本來就失敗：

- 不得把既有失敗算成這次重構造成
- 先清楚記錄既有失敗
- 只有在與本任務直接相關且能安全修正時才修
- 不得用 cleanup 名義掩蓋既有功能分支問題

### 階段 1：只讀盤點

先不要修改，建立：

`docs/code-audit/PROJECT_AUDIT.md`

內容至少包含：

1. 專案結構摘要
2. 主要功能模組與責任
3. 高風險區域
4. 確定可刪除項目
5. 疑似可刪除但證據不足項目
6. 重複程式碼
7. 過長或過度複雜檔案
8. 型別與錯誤處理問題
9. 測試缺口
10. 文件缺口
11. npm 依賴盤點
12. 設定與 CI 問題
13. 建議優先順序：
    - P0：會造成錯誤、安全或資料風險
    - P1：高價值低風險
    - P2：可維護性改善
    - P3：可延後的美化或重構

盤點時可使用：

- git ls-files
- rg / Select-String
- TypeScript compiler
- ESLint
- npm scripts
- npm dependency inspection
- package.json scripts reference search
- import/reference search

不要安裝大型分析工具，除非現有工具完全不足且能清楚說明必要性。

### 階段 2：保守清理

只執行 P0、P1 與明確安全的 P2。

允許：

- 移除已證實未引用的檔案、export、函式、型別與樣式
- 移除已證實未使用的 dependency/devDependency
- 合併重複 helper
- 抽取共用常數、型別與純函式
- 縮短過長函式
- 拆分責任混雜但可保持 API 不變的元件
- 補上缺少的 null/undefined/error handling
- 改善 async 錯誤處理
- 修正明確錯誤的 env 或 Emulator 邏輯
- 補上真正有價值的註解
- 更新失真的 README、AGENTS.md 或開發文件
- 補上必要的 .gitignore 規則
- 修正 script 名稱或重複 script，但不得破壞 CI

不允許：

- 全專案純格式化造成巨大 diff
- 大規模重新命名
- 把整個架構改成新 pattern
- 同時更換狀態管理、路由、Firebase SDK 或測試框架
- 刪除看似舊但仍可能被 dynamic import、route 或測試使用的檔案
- 以 any、eslint-disable、ts-ignore 掩蓋問題
- 新增無意義註解
- 改動正式環境設定

### 階段 3：補缺口

只補與現有功能直接相關、且能用測試證明的缺口，例如：

- 重要 helper 缺少單元測試
- 關鍵 CRUD 缺少失敗狀態
- Firebase Emulator 測試資料隔離不足
- 缺少 loading/empty/error UI
- 缺少型別守衛
- 缺少輸入驗證
- 缺少必要文件
- 缺少 CI 檢查
- 缺少測試 teardown/cleanup

每個新增內容都必須回答：

- 這個缺口會造成什麼實際問題？
- 為什麼現在補？
- 如何驗證？

## 修改批次與提交策略

不要把所有內容塞進一個巨大 commit。

最多建立以下四個 commit，依實際需要使用：

1. `docs: add project code audit`
2. `refactor: remove verified dead code and duplication`
3. `fix: harden project configuration and error handling`
4. `test: cover critical cleanup regressions`

每個 commit 前都要：

- 查看 git diff
- 確認沒有 secrets
- 確認沒有誤刪功能
- 執行與該批次相關的最低必要測試

## 完整驗證

所有修改完成後執行：

- npm run agent:guardrails
- npx tsc --noEmit
- npm run lint
- npm run test:run
- npm run build
- npm run test:e2e
- PowerShell：`$env:CI = 'true'; npm run test:e2e; Remove-Item Env:CI -ErrorAction SilentlyContinue`
- git diff --check
- git status --short

另外確認：

- package-lock.json 與 package.json 一致
- 所有 npm scripts 仍可解析
- 沒有未追蹤的產物或暫存檔
- 沒有新增 eslint-disable、ts-ignore、any 作為逃避手段
- 沒有測試被 skip、only 或刪除
- 沒有 secrets 或正式 Firebase config 被提交
- 所有刪除檔案都在 audit 文件中有證據與理由

## 停止條件

如果在 Windows Codex sandbox 執行 Playwright 時出現 `spawn EPERM`：

- 先確認這是子程序啟動限制，不得將它誤判為測試 assertion 失敗。
- 不得因此刪除、skip 或弱化測試。
- 完成其他靜態與單元驗證後，輸出需要在一般 PowerShell 執行的精確驗證命令。
- 在使用者回報外部 E2E 通過前，不得 commit/push 高風險清理。

以下任一情況發生就停止擴大修改並回報：

- 需要產品決策才能判斷是否刪除
- 需要資料遷移
- 需要改正式 Firebase
- 需要改 UI/UX 需求
- 測試在基準階段已不穩定且無法安全判斷
- 修改範圍超過 25 個核心程式檔
- 單一重構會造成超過約 1500 行非測試 diff
- 需要更換主要框架或套件
- 三輪修補後仍未通過必要測試

## 完成後回報

最後輸出清楚摘要：

1. 基準測試結果
2. 掃描檔案數量與範圍
3. 發現項目數量，依 P0/P1/P2/P3 分類
4. 刪除的檔案與刪除證據
5. 移除的 dependencies
6. 重構與優化內容
7. 新增的註解與原因
8. 補上的缺口與測試
9. 未處理項目與原因
10. 所有測試結果
11. commit hashes
12. push 結果
13. 需要人工確認的事項
14. 回滾方式

## Git 與遠端

- 全部必要測試通過後才可 push。
- push 到目前分支：
  `refactor/project-audit-cleanup`
- 如果 gh 可用，可建立 Draft PR。
- 不得 merge。
- 不得 deploy。
