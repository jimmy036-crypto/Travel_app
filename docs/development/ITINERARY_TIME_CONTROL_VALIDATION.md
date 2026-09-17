# 景點編輯：時間連動控制

## 基準與安全隔離

- Base: `e3a7689430e7e079481e9ba6cae6bd9c972d8476`（PR #72 已合併）。
- 提交前重新 fetch，origin/main 未變；該基準 [GitHub run 35045000014](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35045000014) 為 success，不冒充本分支 CI。
- Branch: `fix/travel-itinerary-time-control`。執行前與提交前查詢 open PR 均無其他衝突 PR。
- 原工作區 `npm run task:preflight -- --allow-feature`：**FAIL**，存在使用者未追蹤檔案，且本機 main 落後 origin/main 14 commits；fetch 與工具核對通過。沒有將補充 Git 查詢當成 preflight PASS。
- 從最新 origin/main 建立乾淨獨立 worktree；原工作區 `6D-0-diff.patch`、`tasks/active/TASK.md` 均保留，未 stash/reset/clean。
- 原功能實作階段沿用已安裝 dependencies、既有 Emulator／Playwright，未更動 package、lockfile、共用 fixture、設定或 CI；後續授權的 CLI／lockfile 修復另見下方 2026-09-17 紀錄。
- Windows、Node 22；既有 Desktop Chrome／Mobile Safari projects。所有瀏覽器寫入使用 localhost `demo-travel-e2e`，明確設定 `TRAVEL_E2E_SKIP_LOCAL_ENV=true`，未讀秘密檔案、測試正式 Firebase 或部署。
- ui-ux-pro-max／impeccable 僅用於局部互動、字級、焦點及主題。Impeccable detector 的兩項提示位於未修改的第 350 行；本次控制無提示。不安裝／更新 Skills。

## 修改前盤點與刻意改變的契約

- 已順暢：新增搜尋／Explore 不會主動改既有景點時間；沿用新增、附件、錯誤回饋、編輯焦點與拖曳功能。
- 缺口：編輯器原本預設 `autoCascade=true`，即使只改備註，也可能把原本有空檔的後續行程重新排成連續時間。
- 明確 bug：拖曳產生的延遲路線回應，可在另一筆明確編輯保存後再次覆蓋時間。整合測試重現保存 `[12:00,09:30,10:00]` 被舊回應改成 `[09:00,09:05,09:10]`。
- 畫面檢查發現：Safari 暗色 App／淺色 OS 下，原生交通 select 顯示白底淺字。只補這個 select 的 App `color-scheme`。
- 不新增永久鎖定、時間衝突提示或自動調整策略，不修改計算算法、資料模型、repository、地圖供應商或排序算法。

## 實作

產品：

- `src/features/places/placeSchedule.js`：只比較抵達、停留、交通模式與手動交通分鐘的有效變化；數字字串等價，AUTO 的儲存分鐘不視為手動輸入。
- `src/components/UIComponents.jsx`：每次新開編輯器預設不連動；有效排程改變、有後續景點及有效抵達時間時，才出現未勾選的「重新計算後續時間」。普通 rerender 不清除同一草稿的選擇；恢復原排程則清除選擇。原有保存 pending／失敗保留／焦點流程不變。交通 select 沿用 App 主題。
- `src/features/places/usePlaceActions.js`：保存層再次檢查明確 `true`、實際排程變化、有效抵達及後續景點，才呼叫既有 recalculator。內容修改即使誤傳 `true` 也不重算。
- `src/TripDetail.jsx`：傳入是否有後續景點；不同日期／景點的 editor 使用獨立 key。明確保存前取消該日舊拖曳的 pending 時間重算；晚回的路線仍可更新交通資訊，但不能改時間。一般拖曳流程保持不變。

測試：

- `placeSchedule.test.js`：有效變化／等價數值／AUTO／內容不影響。
- `usePlaceActions.test.jsx`：保存 guards、完整後續欄位及他日保留、搜尋及 Explore before/after/end 插入。
- `EditItemModal.test.jsx`：預設、條件顯示、rerender、恢復原值、取消、pending 防重複、失敗重試及重開。
- `TripDetail.recalculation.test.jsx`：舊路線回應在保存中／成功／失敗後不覆蓋；一般拖曳仍重算。
- `TripDetail.repositoryIntegration.test.jsx`：從既有 Explore UI 搜尋／選取／前後插入，完整保存既有欄位及另一日。
- `e2e/place-crud.spec.ts`：每 project 新增 8 個案例，沿用原 suite，未降低既有斷言。

## 驗收對照

| 編號 | 結果 | 實際證據與覆蓋 |
|---|---|---|
| TIME-01 內容修改不連動 | PASS | 保存層 unit 完整相等；兩瀏覽器內容修改保存／reload 保留 `09:00 / 13:00 / 18:00` |
| TIME-02 時間修改預設保留 | PASS | 兩瀏覽器只改第一站為 `10:00`，後兩站保持 `13:00 / 18:00`，另一日及顺序不變 |
| TIME-03 明確選擇才重算 | PASS | 兩瀏覽器勾選後保存／reload 為 `10:00 / 10:40 / 11:20`，沿用 30 分停留＋10 分步行算法 |
| TIME-04 選项生命週期 | PASS | unit 覆蓋排程恢復／空及無效時間／同草稿 rerender／無後續；browser 覆蓋取消、重開未勾選、失敗保留及一次成功重試 |
| TIME-05 新增與插入 | PARTIAL | unit 搜尋、before、after、end；React integration 真實 Explore UI＋合成 Places callback；兩瀏覽器既有搜尋 add hook 保存／reload。未連真實 Google Places，未宣稱完整外部服務驗收 |
| TIME-06 保存與延遲回應 | PASS | integration 保存前後舊 route response、成功／失敗；E2E 首次 update 合成拒絕、DB 未變、草稿保留、retry 恰好一次成功 write；兩 contexts 編輯／新增／拖曳同步回歸 |
| TIME-07 手機、鍵盤與主題 | PARTIAL | Chrome／Safari 320、390、1024，App 與 OS 相反偏好；Tab／Shift+Tab／Space／Escape、hit-test、無全頁溢出、14px 與對比。真實 iPhone 原生控制／軟鍵盤未測；本輪未新增 200% 測試 |

## 本地測試紀錄（分開執行，不加總成單次）

所有 E2E 命令前均設定 `$env:TRAVEL_E2E_SKIP_LOCAL_ENV='true'`。

1. `npm run test:e2e -- e2e/place-crud.spec.ts --grep 'time control:'`
   - 16 passed，0 failed / flaky / skipped / retry；1.8m。初版新增契約，不含後補對比數值。
2. `npm run test:e2e -- e2e/place-crud.spec.ts e2e/itinerary-drag.spec.ts e2e/mobile-touch-drag-release.spec.ts e2e/place-menu-layout.spec.ts e2e/place-storage.spec.ts`
   - **58 passed**（Chrome 29、Safari 29），0 failed / flaky / skipped / retry；4.0m。含新增對比、既有 CRUD、focus、拖曳、menu、圖片及 PDF 附件回歸。
3. `npm run test:e2e -- e2e/place-crud.spec.ts e2e/realtime-sync.spec.ts --grep 'time control:.*keyboard|syncs (itinerary drag changes|place creation|place edits)'`
   - **12 passed**（Chrome 6、Safari 6），0 failed / flaky / skipped / retry；1.7m。最後 select color-scheme 修正後，重跑所有新 layout 及 3 個多端案例。
4. `npm run test:run -- src/TripDetail.repositoryIntegration.test.jsx`
   - 最後執行 13 passed；含新增 Explore before／after。
5. `npm run test:run -- src/TripDetail.recalculation.test.jsx src/components/EditItemModal.test.jsx`
   - 17 passed；包含保存 pending／成功／失敗後舊路線保護。
6. `npm run verify:fast`：**PASS**，60.6s；guardrails、TypeScript、ESLint、Vitest（108 files／1238 tests passed，無 failed／skipped）及 production build 通過。保留既有 chunk-size／Browserslist 提示，未為消除提示修改設定。
7. `git diff --check`：PASS。

失敗與修補紀錄：

- Race 測試最初受既有 drag-click suppression 阻擋：測試 harness 以 mock clock 前進既有 300ms，不加 sleep。其後確實重現時間覆蓋（以上 red timestamps），一次局部產品修正後綠燈，另外新增 pending／failure 證據。
- Explore 新整合測試首次 2 failed / 11 passed：baseline 缺既有 listener 正規化的 `resources: []`／`placePhoto: undefined`。分類 test fixture mismatch，補齊合成 baseline，維持完整 deep equality；第二次 13 passed。未改產品正規化流程或共用 fixture。
- 本輪 E2E 無失敗或自動 retry，不能據此宣稱歷史 CI flaky 根因已修復。

## 畫面與量測證據

合成資料，未含真實帳號、票券或私密資訊。以下小型圖片隨 repository 提交，審查者不需存取本機磁碟：

- [320 Light／Chrome](evidence/itinerary-time-control/320-light-chrome.png)
- [390 Dark／Safari：select 修正前](evidence/itinerary-time-control/390-dark-safari-before-select-fix.png)
- [390 Dark／Safari：select 修正後](evidence/itinerary-time-control/390-dark-safari-after.png)
- [1024 Light／Chrome](evidence/itinerary-time-control/1024-light-chrome.png)

「修正前」專指本次發現的 native select 問題，圖片已包含時間選項改動；沒有冒稱為完全未修改 main 的截圖。main 的原連動預設由程式及原 unit 契約核對，未留下完整 main before 畫面。

兩個 project 均得到以下結果（CSS px）：

| Width / App | 控制可點矩形 | 字級 | 文字對比 |
|---|---|---|---|
| 320 / Light | 274 × 46 | 14px | 17.36:1 |
| 390 / Dark | 344 × 46 | 14px | 18.51:1 |
| 1024 / Light | 390 × 46 | 14px | 17.36:1 |

控制中心 hit-test 與實際 label click 通過。對比只適用新選項文字，計算實際 ancestor 合成背景，對未知底層以黑白兩端界定；遇 gradient／group opacity 不支援時測試會失敗，不宣稱全頁對比通過。select 的閉合顯示以 CSS、選定值與畫面核對；OS 彈出選單不在此對比量測中。

Playwright report 附 `time-control-measurements` JSON 與 PNG。完整 CI 以本 PR 最新 head 為準；查詢 PR checks 及既有 playwright artifacts。提交時 CI 尚未開始，不預先宣告通過。

## 風險、限制與回滾

### 2026-09-17：PR #73 CI 失敗診斷（修復前紀錄）

- 最新 head：`ab10454d9b3b538e4d91f69c19ce6d88a94288e0`。本輪 `npm run task:preflight -- --allow-feature` 仍為 **FAIL**：本機 main 落後 origin/main 14 commits；任務 worktree 在修改前乾淨，fetch／工具核對通過，另確認最新 origin/main 仍為上述 base 且為工作分支祖先。未覆蓋原工作區內容。
- [PR run 35131204834](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35131204834) 的 Safari 為 **188 passed／1 failed／7 skipped**，同一 PDF 案例自動 retry 2 次仍失敗；總檢查因 Safari failure 連帶失敗，不是第二個獨立失敗案例。Chrome、guardrails、fast quality 通過。
- [Push run 35131198249](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35131198249) 同版本 Safari 為 **189 passed／7 skipped**，但不能覆蓋 PR run 的失敗，也不能據此宣稱間歇問題已修復。
- 失敗案例：`e2e/ticket-storage.spec.ts` 的 PDF 上傳／持久化／刪除。首次已成功上傳，reload 後開啟 PDF 的兩個 Storage 請求未完成；兩次 retry 則在上傳等待後被既有 30 秒 upload timeout 取消。測試保留 MIME、完整位元組、Database 與 Storage 清理斷言，未增加 timeout 或修改產品附件流程。
- 根因證據：[Safari job 104912371390](https://github.com/jimmy036-crypto/Travel_app/actions/runs/35131204834/job/104912371390) 在 `2026-09-16T18:12:18.191Z` 把 `permit` 回覆 33 與 `fetch_firestore_document` 請求 34 以同一則含換行的 INFO 訊息輸出。已安装 `firebase-tools@15.22.4` 的 `lib/emulator/storage/rules/runtime.js` 將每個 stdout chunk 直接 `JSON.parse`；該 INFO 正是解析失敗後丟棄 chunk 的分支。兩筆訊息因此未分派，後續規則請求卡住；同期 RTDB／Functions 仍有正常完成紀錄。
- 官方 [修復 PR #10852](https://github.com/firebase/firebase-tools/pull/10852) 改為逐行解析並測試合併／分割 chunk；[v15.25.0 發行紀錄](https://github.com/firebase/firebase-tools/releases/tag/v15.25.0) 明列此 Storage Emulator concurrent-request hang 修復。這是測試依賴缺陷，不以更動產品平行讀取、延長等待或 Docker 重跑掩蓋。
- 本輪原版本本地重現命令：`$env:TRAVEL_E2E_SKIP_LOCAL_ENV='true'; npm run test:e2e -- e2e/ticket-storage.spec.ts --project='Mobile Safari'`。結果 **3 passed／0 failed／0 flaky／0 skipped／0 retry，1.4m**（保護圖片、圖片 CRUD、PDF CRUD），只證明本輪未重現，不等於修復完成。全部使用 localhost demo Emulator，未連正式 Firebase。
- **BLOCKED**：可靠修正需將固定開發依賴 `firebase-tools` 由 `15.22.4` 升至含官方修復的 `15.25.0` 並更新 `package-lock.json`，依安全邊界先取得明確授權。尚未改 package／lockfile、workflow、測試設定或產品程式，尚無修復後 CI。此更新也會帶入該 CLI 版本的 Emulator 變動，需相關 Storage／權限測試與完整最新 PR CI 驗證。
- 已在本任務 `AGENTS.md` 補入最新 head CI 成功才完成交付的門檻；此處受阻是新發現的套件授權邊界，不是 CI 尚在執行就結案。

### 2026-09-17：授權後修復第 1 輪

- 使用者明確授權固定更新 `firebase-tools@15.25.0` 與必要 lockfile。僅改開發工具，沒有改 App `firebase` SDK、產品附件讀取／上傳、Rules、repository、workflow、Playwright 設定、timeout、retry、workers 或任何測試斷言。
- `package-lock.json` 只涉及 Firebase CLI 本體及其 `undici@6.28.1`、`ws@8.21.3` 依賴；lock 中 `ws` 的唯一使用者為 CLI。執行 `npm run firebase:version` 實際輸出 `15.25.0`，安裝產物包含 `handleRuntimeStdout` 與跨 chunk buffer。Firestore Emulator 隨官方版本更新至 `1.22.0`，Storage rules runtime jar 仍 `1.1.3`。
- 本輪 preflight 仍 **FAIL**：工作樹有上一輪本任務的兩份文件修改、本機 main 落後 14 commits。已核對差異均屬本任務，origin/main 未變、分支包含最新 base，只有 PR #73 開啟，沒有衝突 PR。
- 為不更新其他 worktree 共用的 node_modules，保留原 junction 於任務 `.tmp`，在本任務建立獨立安裝並執行 `npm ci`。未更動其他工作區檔案。CLI 首次啟動自動下載新版 Firestore Emulator，並清理共用下載快取中的舊版 jar；該檔只是可重新下載的工具快取，不是資料或設定。
- 所有本地 E2E 明確設定 `TRAVEL_E2E_SKIP_LOCAL_ENV=true`，使用既有 localhost `demo-travel-e2e`；權限測試以獨立 CLI HOME／APPDATA／XDG_CONFIG_HOME 啟動既有 `demo-travel-rules`。未讀秘密、登入正式 Firebase 或部署。

本輪執行結果（不同命令不合併成虛構的單次結果）：

| 命令 | 結果 | 覆蓋 |
|---|---|---|
| `npm run test:e2e -- e2e/ticket-storage.spec.ts e2e/place-storage.spec.ts e2e/realtime-sync.spec.ts` | 32 passed（Chrome 16／Safari 16），0 failed／flaky／skipped／retry，5.2m | 受保護圖片／PDF、MIME 與位元組、reload、CRUD、附件與行程／支出多端更新 |
| `npm run test:e2e -- e2e/storage-failure.spec.ts e2e/storage-validation.spec.ts e2e/storage-emulator.spec.ts` | 10 passed（各 5），0 failed／flaky／skipped／retry，1.6m | 上傳失敗零寫入／垃圾清理、格式／大小限制、Storage 工具 |
| `npm run test:rules`（隔離 CLI 使用者目錄，demo project） | 1 file／18 passed，0 failed／skipped，Vitest 7.04s | 既有 Database／Firestore／Storage 授權、跨服務 ACL；未修改 Rules |
| `npm run verify:fast` | PASS，87.5s；108 files／1238 tests passed，0 failed／skipped | guardrails、TypeScript、ESLint、unit／integration、production build；既有 chunk-size 與 Browserslist 提示保留 |
| `git diff --check` | PASS | 本輪四檔差異 |

- 修補次數：針對此次已定位的 CLI 缺陷為第 1 輪；以上本地命令沒有失敗後重跑或自動 retry。前述原版本診斷執行與原 CI 的兩次 retry 另列保留，不混成修復後結果。
- 最新修復 commit 的完整 GitHub checks 需在推送後逐項等待；結果與 head SHA 記錄於 PR，不能拿原 head 的 push 成功替代。歷史其他 CI 間歇問題未因此宣告全部解決。

### 原功能風險與限制（保留）

- 產品風險：中高。改變編輯後時間是否連動的預設，會影響之後使用者明確提交的行程；不是純樣式修改。另有局部 pending 路線撤銷，已覆蓋正常拖曳及晚回情境。
- 測試審查風險：高。既有 editor「預設 true」改為刻意核准的預設 false；既有 cascade hook 測試補真實後續景點，仍要求同一 calculator 恰好呼叫一次。沒有削弱資料／寫入次數斷言。
- 沒有永久時間鎖；保留後續時間可能形成重疊／空檔，本次不加入衝突偵測。拖曳、優化等明確重排仍沿用原流程。
- 不處理既有一般 concurrent repository write／跨端衝突架構；未宣稱所有同步競態已解决。
- 本地未跑完整 E2E，依 TEST_POLICY 交最新 PR CI；未使用正式 Google Maps／Places。WebKit 不等於實體 iPhone；真機時間 picker、軟鍵盤、safe-area 仍需安全合成环境人工確認。
- 未合併：關閉 Draft PR，不影響 main。已合併：核對 merge 方式，另建 revert branch＋PR，不重寫 main、不部署。回滾程式不會還原使用者已明確保存的行程時間，不自動改寫歷史資料。
