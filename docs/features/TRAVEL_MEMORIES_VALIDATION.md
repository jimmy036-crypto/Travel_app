# 旅行回憶、足跡與收藏驗收紀錄

## 範圍與授權

使用者要求一次完成三批，已授權個人資料模型與 Firebase Rules，並明確要求提交與部署。基底為 main `d76c4ff48b8a6ff447bf65bc8f5cf957f5e3d4eb`；功能分支為 `ai/travel-memories-footprints`。不修改套件、鎖檔或 CI，不使用正式資料做測試、不讀取本機私密環境檔、不自行合併 main。

## 驗收對照

| 批次 | 已實作 | 驗證 |
| --- | --- | --- |
| 一 | 個人完成／封存、首頁過濾、年分／搜尋／封面卡、原行程入口、還原、複製規劃 | App 整合與雙瀏覽器 E2E 涵蓋確認後移除、重載、還原、共用行程不變、帳號隔離；後端測試涵蓋原子建立與重試 |
| 二 | 去過／沒去／留待下次、可略過後補、本人確認城市、地圖、無座標城市清單、重遊次數、城市收藏、不同年份感想與原旅程照片 | 模型、照片元件與 E2E 涵蓋只計去過、同趟去重、重遊、缺失座標、來源權限撤銷 |
| 三 | 主題收藏增刪編輯、到訪來源、完成比例、首次／收藏／重遊護照章、年度回顧、勾選後預覽與複製文字 | 模型與互動測試涵蓋 RTDB 空 map、到訪更正、來源連結、年份、分享選取；E2E 串接收藏、章、回顧與分享 |
| 隱私與同步 | Google 帳號專屬資料、客戶端唯讀、callable 交易／revision、多端衝突提示、帳號切換隔離、來源刪除仍保留私人紀錄 | 服務身分／篡改／權限／交易測試、Rules 負向案例、雙帳號 E2E 全部通過 |

## 2026-10-16 本機驗證

權限恢復後，將隔離副本的 40 個成果檔案逐一核對雜湊並同步至原掛接 worktree；先前 worktree 內容另行備份。功能分支 HEAD 與最新 origin/main 都為上述基底；原使用者工作目錄及兩個既有未追蹤檔案未變。

- `npm run verify:fast`：實際 Git diff guardrails（40 個檔案、高風險）、TypeScript、ESLint、118 個 Vitest 檔／1326 項測試、production build 全部通過，105.4 秒。
- `npm --prefix functions test`：203 項通過，包含 24 項旅行回憶服務測試，沒有 skipped。
- `npm run test:rules`：demo-travel-rules Emulator，19 項通過，沒有 skipped。
- `npm run test:e2e -- e2e/travel-memories.spec.ts`：demo-travel-e2e Emulator，Desktop Chrome 3 項、Mobile Safari 3 項，全部首次通過；沒有 retry、flaky 或 skipped，1.5 分鐘。
- `git diff --check` 通過；無秘密、鎖檔、CI 或無關檔案混入。
- 先前 Chromium 1280×1000／WebKit 390×844 靜態元件畫面檢查無水平溢位與 pageerror，長表單可捲動至儲存按鈕；目前 E2E 也檢查分享返回後的頁寬。
- 獨立後端與完整功能審查發現的 RTDB 空 map、交通方式、複製失敗重試、失效來源還原、收藏來源更正問題，均修補並新增回歸測試；複核無剩餘 P1/P2。

先前受限工作階段的 Git 唯讀、MCP never approval 與 loopback／npm 網路阻塞已記錄於交付歷史；使用者調整權限後，Git fetch、Firebase CLI 與 loopback 均成功。`task:preflight --allow-feature` 的 dirty tree 是本任務尚未提交的成果；main-sync 警示針對未更新的本機 main，功能分支本身已直接以最新 origin/main 為基底。沒有為排除警示修改主分支。

## CI 與部署

完整 E2E 由現有 PR CI 執行；需核對最新 head 的 push 與 pull_request runs，包含 Agent guardrails、Fast quality gate、兩個瀏覽器與 Playwright E2E 總檢查。CI 與部署的最終 SHA、run 及網址記錄於 Draft PR 與任務交付報告，不以本機通過代替 CI。

- Firebase：`travel-app-923ef`；發布範圍為 `functions:saveTravelMemory,functions:saveTravelCollection,functions:cloneMemoryTrip,database`。三個 callable 包含最新複製服務；不需部署其他既有 callable。
- Vercel：既有 `travel-app`，project `prj_UUxsadHt1joErWI0Nbne1B2z6sgv`，team `team_eitcWOsUuaddsSxBt1w0Clw7`。後端成功後發布同一功能 commit 的前端。
- 發布前 production 為 `dpl_9qsibgVRwrgDNnwsyhdt1yjju8Px`，對應 main `d76c4ff`，可供前端回滾參考。
- 未進行正式資料寫入測試。實機 iPhone、真實 Google 登入後操作及真人旅伴驗收仍屬人工 QA。

## 風險與回滾

高風險：私人模型、RTDB Rules、Cloud Functions、同步交易與複製流程，保留人工 PR 審核與合併。既有 build 大 chunk、Browserslist 與測試 CSS parser 警告仍保留，沒有降低檢查。

原行程與照片不另存副本；失去原旅程權限後，私人感想／足跡保留，原照片不再顯示，且不能還原至不存在的首頁行程。複製只帶規劃欄位，不帶票券、附件、支出或完成紀錄。

回滾前端至先前 production，或建立 revert 功能 commit 的 PR。保留 personalTravel 資料與本人讀取保護，不清空資料庫；停用新功能時也不刪除使用者已保存的回憶。
