# 文案精簡與首次旅伴確認：驗證紀錄

## 狀態與基準

- 基準 `origin/main`：`c48e9fd4bdda969506486b3e02578a09d208b295`，已包含 PR #67。
- 分支：`fix/travel-copy-companion-flow`；獨立 worktree，未覆蓋其他工作目錄。
- 狀態：本機實作與相關驗證完成，準備 Draft PR；**完整 CI 驗收仍為 PARTIAL**。完整本機批次曾有 2 個入口適配失敗，修正後相關 104 個 E2E 通過；不能合併成虛構的單次完整全過。
- 不修改 CI、Playwright 設定、timeout、重試、資料／權限 fixture、正式 Firebase 或部署。

## Preflight

`npm run task:preflight -- --allow-feature` 首次因本機 main 落後 13 個 commit 失敗。
確認 `main...origin/main` 為 `0 13`、main 未被 worktree 使用後，
以 `git fetch origin main:main` 快轉本機 main；同一 preflight 重跑通過。
建立本分支前工作樹乾淨，GitHub 無未合併 PR。其他任務的未追蹤檔案未動。

後續收到 E2E helper 授權重新執行同一 preflight：因保留本任務的未提交變更而 FAIL；
fetch、main sync、feature branch、工具檢查皆 PASS。重新核對 38 個既有變更均屬本任務，
origin/main 未變、無未合併 PR，繼續使用原獨立 worktree；未 stash/reset/clean 或修改 preflight。

2026-09-13 提交前再次 fetch：main 仍為上述 SHA、無未合併 PR。其他 worktree 與原工作目錄未修改。

## Skills

- ui-ux-pro-max、impeccable、web-design-guidelines：本機指令檔存在且已閱讀，分別用於資訊層級／焦點、已確認問題精簡、介面及鍵盤檢查；MASTER 優先。
- vercel-react-best-practices、playwright Skill：未安裝；使用專案已有 Playwright。
- Firebase Firestore Skill：只作 Emulator 安全邊界參考，未查詢／建立正式資料庫或更改版本。
- 未安裝、更新、覆蓋 Skill／套件；未新增測試架構。焦點檢查亦參照 [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)。

## 核准後的實際修改

- 第一次進入且名單就緒時使用既有旅伴選擇 sheet；「先看看」不確認、不寫入業務資料。
- 移除票券、清單、記帳表單重複的旅伴說明與更正區，罕用更正移至旅程設定。
- 保留帳號／旅程／資料來源隔離、既有本機記憶及清除紀錄，不新增持久化格式。
- 本機偏好儲存失敗的文案依有無當次選擇區分，不誤稱已有確認旅伴。
- 精簡記帳、票券、清單、匯出、大廳、邀請、地圖及停車的重複／工程用語。
- 保留付款人與分攤差異、個人清單非私密空間、邀請權限、唯讀快取及停車資料限制。
- 清單修正「旅程存取權」說明、區分篩選空結果、範本不再把候選數量誤報為新增數量。
- 區分說明入口「認識 Travel」與引導操作「操作導覽」。
- 修正新首次提示與未讀版本公告同時開啟：沿用旅程 readiness，先完成／略過旅伴選擇，再顯示公告；不修改共用 focus trap 或公告已讀契約。

## 修改檔案與審查重點

18 個產品檔案，沒有整檔重構：

| 檔案 | 目的 |
| --- | --- |
| `src/App.jsx` | 大廳重複文案精簡；首次提示／版本公告依既有 readiness 依序顯示 |
| `src/TripDetail.jsx` | 首次旅伴入口、設定更正、焦點返回、導覽等待與精確儲存失敗提示 |
| `src/features/companion/CompanionIdentity.jsx` | 沿用同一 picker；首次／更正文案分層，移除重複常駐 notice |
| `src/features/companion/useCompanionIdentity.js` | 暴露既有 `known`，不改本機格式或確認邏輯 |
| `src/components/AppSettingsMenu.jsx` | 容納罕用旅伴更正入口的長文案；說明／導覽名稱區分 |
| `src/components/UIComponents.jsx` | 精簡記帳、清單、附件與匯出說明；保留歸屬／權限／限制資訊 |
| `src/components/OfflineBanner.jsx` | 快取唯讀說明仍在常駐頂部，底部避免重複 |
| `src/features/expenses/ExpenseSection.jsx` | 記帳清單文案精簡，不改計算或付款人 |
| `src/features/expenses/SettlementPanel.jsx` | 保留分攤與實際轉帳差別，移除重複說明 |
| `src/features/tickets/TicketWalletSection.jsx` | 精簡標題與常駐身分說明，保留篩選／我的契約 |
| `src/features/tickets/TicketEditorModal.jsx` | 移除重複新增／編輯副標 |
| `src/features/trip-access/TripSharingDialog.jsx` | 錯誤只呈現一份並保留安全重試，精簡邀請說明 |
| `src/features/map/MapExploreControls.jsx` | 移除重複 Explore 小標，保留範圍與錨點 |
| `src/features/parking/ParkingLayerController.jsx` | 將工程用語改為操作結果，不改搜尋與保存 |
| `src/features/parking/ParkingResultSheet.jsx` | 說明資料比對／來源限制，不誤稱停車位已驗證 |
| `src/features/parking/SavedParkingCard.jsx` | 精簡資料比對標籤 |
| `src/features/onboarding/FeatureIntroductionButton.jsx` | 說明入口名稱一致 |
| `src/features/onboarding/FirstRunWelcomeDialog.jsx` | 新手導引名稱一致 |

測試：17 個既有 unit 檔案調整＋1 個 `CompanionIdentity.test.jsx` 新增；32 個既有 E2E/helper 調整＋1 個 `e2e/support/companion.ts` 新增。多數 E2E diff 只有 import 與冷入口明確按「先看看」，不是修改原業務斷言。

刻意改變的測試契約：`companion-identity.spec.ts` 的 B0-08 不再從記帳表單更正旅伴，改為驗證表單不含更正、付款人獨立、關閉後從旅程設定更正、新表單使用新預設、完整歷史記錄不變。原 `payer`、1000 金額及 500／500 分攤精確斷言保留；unit 仍驗證已開草稿不被後續旅伴變更覆蓋。

文件：本驗證紀錄與 11 張合成圖片。沒有提交使用者真實帳目截圖或私密資料。

## 第三部分的修改前證據

以既有 React 元件、合成資料、本機 Chromium 重現；未連正式服務。

| 區域 | 已確認的重複 | 保留的功能資訊 |
| --- | --- | --- |
| 地圖搜尋 | 額外 Explore 小標 | 範圍切換、目前錨點名稱、搜尋與選取語意 |
| 離線預覽 | 底部與常駐頂部重述完整唯讀說明 | 常駐頂部的唯讀、快取時間、可能過期說明；底部「目前離線。」 |
| 分享失敗 | 上方失敗區與底部再次顯示錯誤 | 一份實際錯誤、原有安全重試、owner-only 契約 |

## 已執行測試

### 授權後的 E2E 批次與修補紀錄

1. `npm run test:e2e -- e2e/companion-identity.spec.ts e2e/app-shell-ux.spec.ts e2e/expense-crud.spec.ts e2e/ticket-storage.spec.ts`：**54 passed／2 failed／0 flaky／0 skipped，retry 0，4.7 分鐘**。
   - 兩個失敗皆為 B0-11 尺寸案例，分別在 Desktop Chrome 與 Mobile Safari。
   - 分類：test bug。兩份 trace 都證明 390→768 後仍抓到 outgoing mobile 設定按鈕，在 `scrollIntoViewIfNeeded` 時被 desktop header 替換而 detached；還沒按 Enter 開選單，也尚未執行 1024px／200%。
   - 第一輪修補：量測前精確等待既有 `aria-haspopup` 變為當前斷點的 `dialog/menu`，返回 390px 時也等待 `dialog`。不修改產品、不增加 sleep/timeout、不移除任何 44px／hit-test／焦點／溢位斷言。
   - 地圖 SDK 錯誤出現在較晚快照，但不是這個 detached 失敗的已證實原因；不為此改地圖。
   - 原始輸出 `.tmp/copy-targeted-1.log`、兩份 trace／context／video 已保留於 `.tmp/copy-targeted-1-results/`（本機證據）。
2. 第一輪修補後 `npm run test:e2e -- e2e/companion-identity.spec.ts`：**20 passed／0 failed／0 flaky／0 skipped，retry 0，2.0 分鐘**。包含兩個瀏覽器的完整旅伴流程，尺寸案例實際跑到 1024px 與 200%；不是僅重跑 Chrome，也未合併前批數字。
3. `npm run verify:full`：**FAIL**。guardrails／TypeScript／ESLint／107 files、1206 unit tests／build PASS；完整 E2E **352 passed／2 failed／0 flaky／14 skipped，retry 0，22.4 分鐘**。
   - 兩個失敗同為 Desktop Chrome／Mobile Safari 的 `trip-deletion.spec.ts`，新建旅程後漏處理首次提示；`back-to-lobby` 被 companion backdrop 攔截至既有 45 秒 test deadline。
   - trace 證明建立旅程與 owner/editor ACL 檢查已完成，尚未開始永久刪除；teardown 清理後的空大廳不是原始原因。
   - 分類：test bug，第一輪修補只在新 roomId 驗證後呼叫共用「先看看」。全部刪除 journal、ACL、邀請、Storage、延遲 finalize 與其他旅程隔離斷言保留。
   - 14 skipped 全屬既有 `pwa-install.spec.ts` 的專用 `PWA Desktop Chrome`／`PWA Mobile Safari` project guard。一般 Emulator projects 不執行它們；本次沒有新增 skip。
   - 原始輸出 `.tmp/copy-full-1.log`，trace／video／context `.tmp/copy-full-1-results/`，均保留本機。
4. 審查發現首次提示與未讀公告可能疊加；新增 `whats-new-tour.spec.ts` 的 Escape／「先看看」契約，先跑原產品：**0 passed／4 failed／0 flaky／0 skipped，retry 0**。兩瀏覽器均實際觀察到 2 個 modal 同時存在（公告 expected count 0，actual 1），不是僅憑程式碼宣告 bug。
   - 分類：product bug。第一輪修補只在 App 以當前 roomId 的既有 readiness 延後公告；ready／failed 可顯示，未改已讀記錄、global trap 或 timeout。
   - 修補後相同 4 例：**4 passed／0 failed／0 flaky／0 skipped，retry 0，26.8 秒**。驗證初始焦點、Tab／Shift+Tab、Escape／按鈕略過、公告接手焦點、最後返回大廳按鈕與公告不被誤標已讀。
   - 原始 `.tmp/copy-handoff-red.log`／`.tmp/copy-handoff-red-results/` 與修補 `.tmp/copy-handoff-green-1.log`／對應 results 分開保存。
5. 最終相關回歸：`npm run test:e2e -- e2e/companion-identity.spec.ts e2e/whats-new-tour.spec.ts e2e/app-shell-ux.spec.ts e2e/trip-deletion.spec.ts e2e/first-run-welcome.spec.ts e2e/guided-demo-entry.spec.ts e2e/offline-trip-preview.spec.ts`：**104 passed／0 failed／0 flaky／0 skipped，retry 0，5.7 分鐘**。
   - 包含兩瀏覽器、兩個原刪除失敗、新焦點契約、同瀏覽器 Auth A／B／A、旅程隔離、付款人／歷史精確值、大廳分享與離線預覽。
   - `.tmp/copy-regression-final.log`。這是修補後獨立批次，不與第 3 批拼成單次完整綠燈；依 TEST_POLICY 修補後只跑直接相關 suites，其餘完整最終回歸交 Draft PR CI。

### Unit 與快速驗證

- 提交前最後 `npm run verify:fast`：**PASS**，guardrails／TypeScript／ESLint／107 files、1206 tests／build 全部通過，49.7 秒；0 failed／skipped。`.tmp/copy-verify-fast-final.log`。此輪已包含公告順序修正及所有最終 E2E 編譯檢查。
- 第一輪整合 `npm run verify:fast`：guardrails、TypeScript、ESLint、107 個 unit 檔案／1201 tests、build 全部通過。
- 儲存失敗補測完成後再次執行 `npm run verify:fast`：107 files／1206 passed、0 failed／skipped，TypeScript、ESLint、build 通過（49.2 秒）。這是第二次完整快速驗證，不把兩輪測試數量加總。
- 後續儲存失敗修正的 `TripDetail.ticketIntegration.test.jsx`：14 passed，0 failed，首次通過。
- `CompanionIdentity.test.jsx`：20 passed，含有／無當次選擇的精確儲存失敗文案。
- `git diff --check`：通過；只有既有 Windows CRLF 轉換警告。
- Unit 中實際斷言首次選擇／略過／更正零 Firebase 與票券寫入，並保留附件 stale response／PDF 視窗去重案例。
- `e2e/app-shell-ux.spec.ts --list`：16 個 project cases 成功列舉；**不是 E2E 通過**。
- Auth Emulator、跨功能／同瀏覽器跨帳號流程已執行通過，範圍及批次如上；不是僅 mock callback 或不同 browser contexts 的儲存隔離。
- GitHub 本分支 CI：建立 Draft PR 後交由 CI 執行；在結果出現前不能宣稱通過。

兩輪 build 皆有既有大 bundle 與 Browserslist 資料過期警告，unit 有 CSS stylesheet parser 警告，未因此變更套件或設定。

既有 E2E 現在需要透過明確 UI 操作處理首次旅伴 sheet。
不可預填第一位、隱藏彈窗或用 localStorage 繞過新流程；專用案例仍需實際確認旅伴。
授權後新增 `skipCompanionIntroduction`，明確等待首次對話框、按「先看看」、確認關閉；
沒有全域自動關閉、預寫旅伴或 racy 的可見性猜測。已確認旅伴的專用案例明確走恢復路徑。
修改共用 helper 後，已依 TEST_POLICY 執行 `npm run verify:full` 本機完整回歸，失敗與修補如上。

本機測試使用 `TRAVEL_E2E_SKIP_LOCAL_ENV=true`，避免讀取本機私密環境檔；
沿用設定內的 `demo-travel-e2e` 合成設定與 localhost Emulator。
既有 Functions 依賴透過 junction 共用，使用 `npm_config_ignore_scripts=true` 執行測試，
只略過 npm 的 pre/post lifecycle（避免 `preemulators:e2e` 重裝共用依賴），原 E2E、Emulator 與診斷器仍正常執行。
未修改 npm scripts 或安裝套件，Emulator 二進位沿用既有快取。

## 瀏覽器元件驗證

- Chromium，合成資料，封鎖非 localhost 網路；這是元件 harness，不是完整 App／Firebase E2E。
- 旅伴 sheet：320、375、390、768、1024、1440 px；長中文／無空格英文名稱、無全頁水平溢出、Tab／Shift+Tab、初始焦點。
- 實測關閉 68×44 px；成員按鈕最小高 44 px；透過中心點 `elementFromPoint` 驗證未遭遮擋。
- 390 px 明暗主題與 200%：`html font-size` 從 16px 設為 32px；不是 browser zoom、OS Dynamic Type 或真實鍵盤。
- 記帳表單確認正常付款人預填、移除重複旅伴區，關閉／確認新增 bounding box 與 hit-test 通過。
- 地圖範圍按鈕 `aria-pressed` 正確；分享失敗僅一個 alert，重試 146×44 px；离線捲動後唯讀提醒仍可見。
- 窄螢幕第一筆即時寬度探針曾見 331/320；獨立重現未見超界。將驗證改為既有預設期限內重讀同一精確 `scrollWidth <= innerWidth` 條件後通過，未放寬界限或加 timeout/sleep。此為本機 harness 探針重跑，不宣稱歷史 CI flaky 已修復。
- App＋Emulator E2E：旅伴實際表面與文字對比（light／dark）、320／375／390／768／1024、44px bounding box／hit-test、200% 文字，以及設定返回焦點均已通過；大廳另含 1440px。不是整個 App 所有文字的全面對比認證。
- 首次進入／未讀公告／導覽交接及返回焦點：新增 4 例先紅後綠，最終 104 批次再通過。

完整 Before／After 存於此 worktree 忽略的 `.tmp/copy-evidence/`。
代表性合成證據另收錄於 repository，提交 PR 後可從 GitHub 相對連結查看：

- 分享失敗：[Before](evidence/copy-companion-flow/before-sharing-390.png)／[After](evidence/copy-companion-flow/after-sharing-390.png)。
- 離線預覽：[Before](evidence/copy-companion-flow/before-offline-scrolled-390.png)／[After](evidence/copy-companion-flow/after-offline-390.png)。
- [首次旅伴 320px](evidence/copy-companion-flow/after-companion-320.png)、[精簡後新增記帳 390px](evidence/copy-companion-flow/after-expense-light-1x.png)。
- 真正 App＋Emulator 的第二批測試：[設定更正 320px](evidence/copy-companion-flow/e2e-correction-320.png)、[設定更正 200%](evidence/copy-companion-flow/e2e-correction-200pct.png)、[新記帳付款人預填](evidence/copy-companion-flow/e2e-payer-390.png)。
- 真正 App＋Emulator 的提示交接：[Before：公告與旅伴疊加](evidence/copy-companion-flow/before-entry-handoff.png)／[After：只有首次旅伴](evidence/copy-companion-flow/after-entry-handoff.png)。

前六張是本機元件渲染；後五張來自實際 App＋Emulator 流程。
圖片只證明版面，互動與寫入仍以各批測試結果為準；其餘尚未收錄圖片僅本機可存取。
沒有把使用者提供的真實帳目畫面加入 repository。

## 本次驗收

| 驗收 | 結果與證據 |
| --- | --- |
| 首次進旅程選旅伴，可略過；已確認不重問 | PASS：companion unit／integration，最終雙瀏覽器 B0-01／06／02 |
| 表單不常駐更正；設定保留罕用修正 | PASS：表單 absence 精確斷言、設定鍵盤／焦點回歸、代表性截圖 |
| 查看他人、手選付款人不改本人；更正不改歷史 | PASS：B0-01／05／07／08，精確 business write／完整 records 相等與 1000、500／500 斷言 |
| 三組核准文案精簡且保留必要限制 | PASS：對應 unit、分享錯誤＋retry、離線常駐唯讀說明、地圖範圍及停車來源元件驗證 |
| 首次提示／公告／導覽不爭搶焦點 | PASS：4 個先紅後綠案例、最終 whats-new-tour 全 suite |
| 手機、桌面、主題、鍵盤與 200% | PASS：上述明確 browser／harness 範圍；200% 僅 html font-size equivalent |
| 全面回歸／CI | PARTIAL：完整本機批次 352／2／14，修補後相關 104 通過；本分支完整 CI 尚待完成 |
| 安全與資料邊界 | PASS：受限檔案 diff 為空；未改 repo／model／計算／權限／附件生命週期，未連正式 Firebase |

## 基準 CI 與尚未定位問題

基準 main 的 [Quality Gate run 34701427988](https://github.com/jimmy036-crypto/Travel_app/actions/runs/34701427988) 已失敗，發生在本分支變更之前（push、attempt 1、相同基準 SHA）。

- Fast quality gate、Agent guardrails success；E2E 第 9 步 failure，runner 收到 shutdown signal、exit 143。不能僅由此判定 shutdown 原因。
- Desktop `place-crud.spec.ts:459` 首次 timedOut、retry 1 passed；這是既有 retry-pass／flaky 證據，根因未確認。
- 終止時 Mobile `expense-crud.spec.ts:415` 尚無 test-end，不宣告該筆是產品失敗。
- 已完成日誌事件是 224 首次 passed、1 retry passed、7 skipped、1 首次 timedOut；368 cases 未跑完，無最終全套 summary。artifact 上傳 skipped，實際 artifacts 0。
- 本次僅唯讀核對，不改 CI／timeout／並行策略、不觸發重跑；本地測試通過不能清除這些限制。

## 風險及承接限制

- 產品風險：中。首次進入改為顯示選擇 sheet，影響進入與導覽時序；不是單純改字。
- 測試審查風險：高。新流程需要既有 E2E 入口适配；原資料、金額、權限與寫入次數斷言不得降低。
- 金額／分帳／結算算法、票券附件、repository、帳號與權限架構皆未改。
- 「先看看」只保留當次 SPA session；未確認者整頁重新載入後仍可能再詢問。確認成功記住者可恢復。
- 真實 Google Places、Google 登入、部署後 smoke、iPhone Safari／PWA／PDF、軟鍵盤、地圖手勢及 safe-area 均未補驗。
- T3 同步／資料模式 PARTIAL、既有 CI 間歇性模組載入問題保持未解，不因本次 unit／元件畫面通過而消除。

## 回滾

未合併 Draft PR 可關閉，不影響 main；已合併則核對實際合併方式建立新的 revert branch／PR，不重寫歷史或自動部署。
程式回滾不會撤銷使用者已明確提交的記帳或清單資料；本次未改本機偏好格式。
