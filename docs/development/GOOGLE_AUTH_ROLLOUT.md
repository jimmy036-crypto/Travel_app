# Google 登入與安全旅程協作上線手冊

本文件說明如何把 Travel App 從「知道 room ID 即可進入」切換為 Google
登入、可撤銷邀請與 owner/member 權限。這是一次不向後相容的安全切換；舊 room
必須先由可信任管理者指定 owner，不能讓第一個開啟連結的人自行認領。

## 最終架構

- Firebase Authentication：只接受 Google provider。
- Realtime Database：旅程內容、權限名冊、每個帳號的旅程索引與 invite state。
- Cloud Functions（`us-central1`）：建立旅程、簽發／換發／撤銷邀請、兌換邀請、
  移除／恢復成員。
- Standard Firestore `(default)`（`us-central1`）：只保存最小化的 Storage ACL
  mirror；瀏覽器端 Firestore 讀寫全部拒絕。
- Cloud Storage：每次透過已登入 SDK 讀取，Rules 會查 Firestore ACL。新資料不再
  保存長效 download-token URL。

Functions、Realtime Database 與 Firestore 無法形成單一跨產品 transaction。
Functions 因此以撤權 fail-closed、補償寫入與可重試操作降低部分失敗風險。

權限資料使用同一個正整數 `aclVersion` 做單調版本控制：

- `roomAccess/{roomId}/members/{uid}` 是 Realtime Database 的 canonical membership；
- `userTrips/{uid}/{roomId}` 是帳號的 Lobby 索引；
- `tripAccess/{roomId}/members/{uid}` 是 Firestore 的 Storage ACL mirror。

三處都保存 `role`、`status`、`aclVersion` 與 `updatedAt`。移除成員時保留
`status: "removed"` tombstone，不刪除 ACL；舊版本的延遲重試不得覆蓋較新的撤權。

## 0. 上線前安全閘門

在進入維護時段並完成下列項目前，不要部署新的 `database.rules.json` 或
`storage.rules`：

1. PR 的 Preview、單元測試、Rules Emulator 與 Playwright 全部通過。
2. 每個 production room 都已對應到正確的 Google Auth UID，且 migration dry-run
   已證明 mapping 對 production `/rooms` 是完整且精確的覆蓋。
3. Realtime Database 與 Storage 已完成可還原備份。
4. Mapping 內每個 UID 已通過 Firebase Auth 驗證：帳號存在、未停用，且有
   `google.com` provider。
5. Legacy migration dry-run 已通過；apply 尚未執行。
6. 新前端、Cloud Functions 與 final strict Rules 已準備好在同一維護時段切換。

正式切換的不可交換順序是：先部署 Functions，再封鎖使用者入口，接著部署 final
strict Rules，然後才用 Admin SDK 執行 migration；完成 download-token/CORS 清理後，
最後才發佈前端並做 smoke test。這個順序刻意讓 legacy room 在 migration 前暫時
不可用，避免公開 Rules 與 owner metadata 寫入之間出現可被搶寫的 TOCTOU 窗口。

Codex／CI 不應代替管理者執行正式部署或帳務操作。

## 1. 人工：升級 Blaze

1. 開啟 Firebase Console，選擇 `travel-app-923ef`。
2. 進入 **Usage and billing / 用量與帳單**。
3. 選擇 **Blaze (pay as you go)**，連結正確的 Google Cloud Billing account。
4. 在 Google Cloud Billing 設定預算通知。預算通知不是硬性停機上限；仍應監控
   Functions 呼叫、Firestore 讀寫與 Storage 流量。

程式已將 2nd gen Functions 的 `maxInstances` 設為 10，但這不是完整的濫用防護。

## 2. 人工：建立 Standard Firestore

本專案使用 Standard edition 的 `(default)` database，位置固定為
`us-central1`，以接近既有 Realtime Database 與 Functions。

1. Firebase Console → **Build → Firestore Database**。
2. 選擇 **Create database**。
3. Edition 選 **Standard**，Database ID 選 `(default)`。
4. Location 選 `us-central1`。位置建立後不可更改，送出前再次確認。
5. 初始模式可選 Production；repo 的 `firestore.rules` 本身也會拒絕所有 browser
   讀寫。

若 `(default)` 已存在，先確認它確實是 Standard 且位置正確，不要再建立第二個
database。不要把 Enterprise edition 混入這次 rollout。

## 3. 人工：啟用 Google 登入

1. Firebase Console → **Build → Authentication → Get started**。
2. **Sign-in method → Google → Enable**。
3. Public-facing project name 建議填「智の旅行」。
4. 選擇正確的 Project support email 後儲存。
5. **Authentication → Settings → Authorized domains** 加入：
   - production 網域；
   - Vercel Preview 實際使用且可信任的固定網域（不要放寬成任意網域）；
   - 本機測試需要的 `localhost`。

Authorized domain 只填 hostname，不含 `https://`、path 或 port。若遇到
`auth/unauthorized-domain`，先檢查這份清單。Firebase Web config 的 API key
不是服務帳號密鑰；仍不可把服務帳號 JSON、token 或 `.env.local` 提交到 Git。

## 4. 人工：確認前端環境變數

Vercel Preview 與 Production 應保留同一 Firebase Web App 的既有
`VITE_FIREBASE_*` 設定：

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_DATABASE_URL`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`（若既有環境有使用）

Production/Preview 不可設定 `VITE_USE_FIREBASE_EMULATOR=true`，也不可設定
`VITE_E2E_AUTH_UID`；後者只供 Playwright 的 demo emulator 自動登入。

### 4.1 人工：處理曾進入 Git 歷史的 API key

本分支已移除早期提交在 repo 根目錄的 `data` 設定副本，並阻止它再次被加入；但
刪除目前版本不會清除既有 Git 歷史。正式 rollout 前應把其中出現過的 key 視為已
公開，先在 Google Cloud Console 的 **APIs & Services → Credentials** 與 Metrics
確認實際用途、流量與目前限制，再依下列方式處理：

1. `VITE_GOOGLE_MAPS_API_KEY` 使用獨立的 browser key。套用 **Websites** application
   restrictions，只允許精確的 production、可信任 Preview 與本機測試 origin；再加上
   API restrictions，只允許 App 實際使用且已由 Metrics 確認的 Maps／Places／Routes
   服務。不要讓同一 key 同時承擔 server-side Web Service 流量。
2. Firebase Web API key 本身不是 Realtime Database、Firestore 或 Storage 的授權
   機制，資料權限仍由 Auth、IAM、App Check 與 Security Rules 決定；但仍要確認它是
   對應本專案 Web App 的 key、沒有被拿去呼叫無關 API，並保留 Firebase 所需 API。
3. 若 key 已有異常流量或無法安全限制，建立／rotate 新 key，先更新 Preview 的
   `VITE_GOOGLE_MAPS_API_KEY` 或 `VITE_FIREBASE_API_KEY`，完成 Google 登入、地圖、
   Routes、callable、RTDB 與附件 smoke test，再更新 Production。
4. 觀察舊 key 已無合法流量後才刪除舊 key。不要先刪除仍由已部署 PWA 使用的 key；
   也不要把新值寫入 repo、issue、PR、log 或 rollout 紀錄。

金鑰限制與輪替必須和第 13 節的 Preview/production smoke test 一起審核。若是 PWA
已安裝版本，還要確認新版 Service Worker 已接管，再停用舊 key。

## 5. 人工：建立 owner UID 對照

1. 先在 PR Preview 以每位實際 owner 的 Google 帳號登入一次。
2. Firebase Console → **Authentication → Users** 讀取對應 UID。
3. 盤點每一個 production room，人工確認真正 owner。
4. 複製範例檔，建立不提交 Git 的本機 mapping：

```powershell
Copy-Item functions/scripts/legacy-owner-map.example.json `
  functions/scripts/legacy-owner-map.production.local.json
```

每筆只填 `roomId`、Google Auth `uid`、顯示名稱與可選的 HTTPS `photoURL`。
不要放 email。`functions/.gitignore` 已排除 `*.production.local.json` 形式的檔案。

若無法可信任地判定某個 room 的 owner，停止整次 migration 並人工處理；絕對不要
把「最先登入的人」設為 owner。產品端不得提供 first-opener claim、room-ID claim
或任何由 client 自行補 owner 的流程。

## 6. 人工：備份 production 資料

在 Firebase Console 匯出完整 Realtime Database JSON，並把 Cloud Storage
`rooms/` 物件複製到受限、具版本或保留政策的備份位置。備份檔可能包含旅程與票券
私密資料，不能提交 Git，也不能放在公開分享空間。

記錄：

- 備份時間與操作者；
- RTDB database URL；
- Storage bucket；
- migration 使用的 Git commit；
- room 數與 object 數。

## 7. 人工：執行 migration dry-run

腳本使用 Application Default Credentials。建議由 Cloud Shell 或受管控的管理者
工作站執行，不要建立或下載長效 service-account key。

先從 Firebase Console 複製精確 RTDB URL；以下以
`https://YOUR_DATABASE_URL` 表示，不能猜測 region-specific hostname。

### Dry run（預設，不寫入）

```powershell
$travelStorageBucket = 'travel-app-923ef.firebasestorage.app'
npm --prefix functions run migrate:legacy -- `
  --mapping functions/scripts/legacy-owner-map.production.local.json `
  --project travel-app-923ef `
  --database-url https://YOUR_DATABASE_URL `
  --storage-bucket $travelStorageBucket
```

Dry run 會在任何寫入前完成下列檢查：

- mapping 的 room ID 必須與 production `/rooms` 完全相等，不可遺漏，也不可多出；
- `--project` 與 RTDB hostname 必須指向同一個預期專案；Application Default
  Credentials 必須只具備本次管理操作所需的授權；
- `--storage-bucket` 必須是同一專案的 default Firebase bucket；腳本會向 Storage API
  再確認實際 bucket name，不接受其他專案、URL 或任意 bucket；
- 每個 owner UID 必須存在、未停用，且 Auth provider 包含 `google.com`；
- 現有 owner、ACL、versioned `userTrips` 與 Firestore mirror 不可有衝突或不相容
  schema；
- 盤點 RTDB `rooms/**` 的 tokenized Firebase download URL，以及 Storage `rooms/**`
  每個 object 的 `firebaseStorageDownloadTokens` metadata。舊版票券若仍指向根目錄
  `tickets/{fileName}`，dry-run 會依 RTDB ticket record 的穩定 `id` 規劃搬到
  `rooms/{roomId}/tickets/{ticketId}/{fileName}`；只接受由該 room 的 `tickets` record
  明確引用的 object。輸出只包含數量，不會列印 capability URL 或
  token；若 URL 指向其他 bucket、路徑無法安全歸屬、同一來源被不同 room 引用，或和
  既有 `storagePath` 衝突，整批 fail closed。
- 每個 Storage `rooms/{roomId}/**` namespace 必須對應現存 production room，或已有
  server-only 的永久 `roomReservations/{roomId}` 保留記錄。格式不合法的 object 或
  沒有 room/reservation 的孤兒 namespace 都會讓 dry-run 停止，避免日後用相同 room ID
  建立旅程後接管舊附件。

若 dry-run 回報孤兒 Storage namespace，先依備份查明來源；不可建立假的旅程來繞過。
確認仍需保留時，由經審核的 Admin 程序建立永久 reservation tombstone；確認可清除時，
在維護時段隔離或刪除該 prefix，保留操作紀錄後重跑 dry-run。一般 App client 永遠不能
寫入或刪除 `roomReservations`。

Dry run 不會修改 RTDB、Firestore、Storage metadata，也不會換發或撤銷 token。任何
檢查失敗都會讓整批停止。Dry run 通過不代表可以在公開 Rules 下直接 apply；apply
必須等到第 9–10 節的維護封鎖與 final strict Rules 完成後才執行。

## 8. 人工：先部署 Functions

在已登入正確 Firebase project 的受信任終端執行：

```powershell
npx -y firebase-tools@latest use travel-app-923ef
npm ci --prefix functions
npm test --prefix functions
npm run check --prefix functions
npx -y firebase-tools@latest deploy --only functions --project travel-app-923ef
```

確認 Functions deployment 健康且 callable region 是 `us-central1`。此時不要發佈
新 production 前端，也不要用 production 資料做建立旅程 smoke test；舊公開 Rules
仍在作用，這一步只準備 server-side 能力，不會自動修改 legacy room。

## 9. 人工：進入維護模式並封鎖入口

1. 停止新的 production 使用者工作階段，例如把 Hosting/Vercel production 指向
   明確的維護頁，或在既有邊緣層封鎖 App 入口。
2. 確認主要 production URL、既有 deep link 與 PWA navigation 都無法再進入舊 App。
3. 等待既有前端工作階段退出；如無法強制退出，至少確認下一步 strict Rules 會
   fail closed。
4. 在整個 Rules 切換、migration 與 token/CORS 清理期間維持封鎖。

不要把「請使用者先不要操作」當成維護模式。入口必須由部署或邊緣層實際封鎖，
且不要把可呼叫 first-opener claim 的臨時頁面作為過渡方案。

## 10. 人工：部署 final strict Rules

在維護入口已生效後，部署本 PR 已驗證的 Firestore、Realtime Database 與 Storage
Rules：

```powershell
npx -y firebase-tools@latest deploy --only firestore:rules,firestore:indexes `
  --project travel-app-923ef
npx -y firebase-tools@latest deploy --only database --project travel-app-923ef
npx -y firebase-tools@latest deploy --only storage --project travel-app-923ef
```

立即用未登入 client 驗證 legacy room、`roomAccess`、`userTrips` 與 Storage object
均被拒絕。此時 ACL 尚未遷移，owner 暫時也無法使用旅程，這是預期的 fail-closed
維護狀態。不要為了縮短中斷而暫時恢復公開 Rules。

本版 RTDB Rules 也永久要求非空 ticket `storagePath` 使用
`rooms/{roomId}/tickets/{ticketId}/{fileName}`，並拒絕把任何 Firebase Storage download
URL 寫入 ticket 的 `url`、`appUrl` 或 `fallbackUrl`；附件只能保存受 Rules 保護的
`storagePath`。Repair lease 存在時，該 room 的所有 client 寫入分支都會
fail closed；Admin SDK 不受 client Rules 影響。這兩層防護用來阻擋已安裝 PWA 的延遲／
離線寫入重新導入四段式路徑，不能從部署內容移除。

## 11. 人工：用 Admin SDK 執行可信任 migration

final strict Rules 生效後，才從同一個已完成 dry-run 的受信任環境執行 apply：

```powershell
$travelStorageBucket = 'travel-app-923ef.firebasestorage.app'
npm --prefix functions run migrate:legacy -- `
  --mapping functions/scripts/legacy-owner-map.production.local.json `
  --project travel-app-923ef `
  --database-url https://YOUR_DATABASE_URL `
  --storage-bucket $travelStorageBucket `
  --apply `
  --confirm-project travel-app-923ef `
  --confirm-storage-bucket $travelStorageBucket
```

Migration 使用 Admin SDK，因此不需要放寬 client Rules，也不應從瀏覽器執行。
腳本可安全重跑完全相同的 mapping；若偵測到 owner/ACL/version 不一致會 fail
closed。每個 room 寫入後會重新讀取並驗證：

- `rooms/{roomId}/meta/ownerUid`
- `roomAccess/{roomId}/members/{uid}` 的 `role`、`status` 與正整數 `aclVersion`
- `userTrips/{uid}/{roomId}` 的同版本索引物件，不是 legacy boolean
- `tripAccess/{roomId}/members/{uid}`（Firestore）的同版本 ACL mirror

Membership 寫入若失敗，腳本會回復原 canonical membership、`userTrips` 與
Firestore ACL，並立即驗證三處沒有意外的 active grant。若延遲的 deletion trigger
留下較高版本 `removed` tombstone，腳本視為安全的 fail-closed 結果；相同 mapping
下次執行會使用更高 `aclVersion`，不會讓舊事件覆蓋新授權。

Membership 全數驗證後，apply 會先以 generation／destination-create precondition
把被引用的根目錄 `tickets/{fileName}` 複製到
`rooms/{roomId}/tickets/{ticketId}/{fileName}`，驗證內容 fingerprint、移除目的地 download
token 並留下來源 fingerprint proof。全部目的檔都由本次 relocation 的
`temporaryHold` 保護後，腳本才原子切換 RTDB `storagePath`；舊 capability `url` 仍保留為
可重跑 journal。RTDB transaction 會綁定原 record identity、URL 與 source/destination
指標；每一個來源刪除前後都會重讀驗證 canonical 指標，漂移時停止且保留目的檔 hold。
接著以原 generation precondition 刪除來源，再只解除本次 relocation 建立的 hold。任何
foreign hold 都會 fail closed，不會被接管或解除。
之後以 metageneration precondition 清除其他 `rooms/**` object 的
`firebaseStorageDownloadTokens` metadata，並逐一匿名請求所有已盤點的舊 capability
URL；任何 2xx 都會讓 release gate 失敗。只有匿名拒絕驗證成功後，才以同一組 exact
record/pointer invariant transaction 清空 RTDB legacy `url`，並再次驗證 canonical
`storagePath`。
最後會重新盤點，要求 RTDB URL、Storage token 與根目錄 `tickets/**` object 數都等於
0。除已成功搬移且驗證的根目錄票券來源外，腳本不刪除 legacy itinerary、expenses、
tickets records 或 `rooms/**` Storage objects，也不會在輸出中列印 capability URL 或
token。

Token 撤銷是刻意 forward-only 的安全清理。若這一段中斷，不可恢復長效 token；請
維持 maintenance mode 與 strict Rules，重跑完全相同且雙重確認 project/bucket 的
apply 命令，直到內建重掃與匿名拒絕 gate 通過。

Apply 後必須重新執行 verify/dry-run 或腳本內建驗證，確認所有 production room 都有
唯一可信 owner，且三處 membership 的 `aclVersion` 一致。未全數通過時維持維護
模式，不可發佈前端。成功 migration 與所有新建旅程的 `roomReservations` 都是永久
namespace 保留記錄；即使日後刪除旅程，也不可刪除或重用該 room ID。

### 11.1 修復已遷移的四段式票券路徑

若舊版 migration 已完成，但 RTDB ticket 的 `storagePath` 被寫成
`rooms/{roomId}/tickets/{fileName}`，不要重跑完整 owner migration，也不要放寬
Storage Rules。完整 migration 已清空舊 URL 並刪除根目錄來源，重跑不會重新發現這些
紀錄，還會不必要地重新檢查全部 room membership 與 quota。

請先合併含 `repair:legacy-ticket-path` 的修復 PR，保持 production 入口封鎖，並在
Cloud Shell 從最新 `main` 執行。下例只修復已確認的單一 room 與三張票券；變數值必須
以本次 dry-run 的實際目標為準：

```bash
project_id='travel-app-923ef'
database_url='https://travel-app-923ef-default-rtdb.firebaseio.com'
storage_bucket='travel-app-923ef.firebasestorage.app'
room_id='id_1782055259578_uapiufh1s'
repair_count='3'
manifest_path="${HOME}/legacy-ticket-path-repair-20260831.local.json"

npm --prefix functions run repair:legacy-ticket-path -- \
  --project "$project_id" \
  --database-url "$database_url" \
  --storage-bucket "$storage_bucket" \
  --room-id "$room_id" \
  --expected-count "$repair_count" \
  --manifest "$manifest_path"
```

預設模式只讀 Firebase，要求候選數精確相符，並以 exclusive create 建立權限 0600 的
manifest。它會驗證每個來源 object 的 generation、size、CRC32C／MD5、零 download
token 與原 migration marker，也會比對 RTDB `roomAccess`、`userTrips`、
`roomReservations` 與 Firestore `tripAccess` 的 canonical owner／`aclVersion`；任何額外
malformed object、重複 ticket/source、錯 room、不可信目的地或資料漂移都會 fail
closed。輸出會顯示 `Manifest SHA256`，將其原樣保存：

```bash
manifest_sha='PASTE_THE_64_CHARACTER_SHA256_FROM_PLAN_OUTPUT'
```

確認 manifest 路徑、候選數與 SHA 後才執行 apply：

```bash
npm --prefix functions run repair:legacy-ticket-path -- \
  --project "$project_id" \
  --database-url "$database_url" \
  --storage-bucket "$storage_bucket" \
  --room-id "$room_id" \
  --expected-count "$repair_count" \
  --manifest "$manifest_path" \
  --apply \
  --confirm-project "$project_id" \
  --confirm-storage-bucket "$storage_bucket" \
  --confirm-room-id "$room_id" \
  --confirm-count "$repair_count" \
  --confirm-manifest-sha256 "$manifest_sha"
```

Apply 會先把全部來源複製到
`rooms/{roomId}/tickets/{ticketId}/{fileName}`、驗證 fingerprint，並以本次 manifest 的
`runId` 標記及 `temporaryHold` 保護全部目的檔；全部成功後才以單一 RTDB transaction
切換三筆 `storagePath`。目的檔的 hold 會持續保留到 finalize 或 rollback，且此階段不刪除
舊四段式來源。保持一般使用者入口封鎖，使用受信任的 owner session 驗證三張票券都可
開啟，再以 anonymous、outsider 或 removed account 驗證仍被拒絕。

Smoke test 通過後才執行 finalize；它會確認全部 canonical 目的檔仍由本次 repair 的
`temporaryHold` 保護，再次驗證 owner ACL、RTDB、來源／目的 fingerprint、全 bucket
malformed inventory 與 token inventory，最後才以原 generation precondition 刪除舊
來源並解除自己建立的目的檔 hold。即使已安裝的 PWA 在維護期間從快取啟動，也不能在
刪除來源的臨界區間刪掉受 hold 保護的目的檔；工具絕不接管或解除其他程序建立的 foreign
hold：

```bash
npm --prefix functions run repair:legacy-ticket-path -- \
  --project "$project_id" \
  --database-url "$database_url" \
  --storage-bucket "$storage_bucket" \
  --room-id "$room_id" \
  --expected-count "$repair_count" \
  --manifest "$manifest_path" \
  --finalize \
  --confirm-project "$project_id" \
  --confirm-storage-bucket "$storage_bucket" \
  --confirm-room-id "$room_id" \
  --confirm-count "$repair_count" \
  --confirm-manifest-sha256 "$manifest_sha"
```

若 apply 後、finalize 前的 owner smoke test 失敗，可把 `--finalize` 改成 `--rollback`
執行同一組確認參數。Rollback 會先以 temporary hold 保護並重驗全部來源，再把 RTDB
路徑原子切回來源，驗證後才刪除新目的地；任何來源已被 finalize 刪除時會拒絕
rollback。Plan、apply、finalize 與 rollback 都可在各自允許的中斷狀態安全重跑，工具
也會處理前次中斷留下的 hold。Manifest 不含票券標題、URL 或 token，但仍是 production
操作記錄，不可提交 Git；檔名必須符合
`legacy-ticket-path-repair*.local.json`。

Apply、finalize 與 rollback 會在 RTDB
`maintenanceRepairs/legacyTicketPath/{roomId}` 取得單一 room repair lease，避免兩個
Cloud Shell／終端同時修改同一批資料；已部署的 RTDB Rules 同時會在 lease 存在期間拒絕
該 room 的 client 寫入。永久 canonical ticket validator 則會在兩個 phase 之間與 repair
結束後，繼續拒絕舊 PWA 回寫四段式或錯 room/ticket path。若程序中斷而留下 lease，下一次執行會 fail closed
並顯示既有 `invocationId`；工具不使用 TTL、不會自動搶鎖，也不提供 CLI takeover。
先保持 production 暫停，使用 `ps` 等方式確認原 Node 程序已完全結束，再到 Firebase
Console 精確讀取該 room 的 lease，備份其 JSON，並逐一比對 operation、roomId、manifest
`runId`、SHA、phase 與錯誤顯示的 invocationId。全部相符後才人工刪除
`maintenanceRepairs/legacyTicketPath/{roomId}` 這一個 leaf，絕不可刪除較上層 namespace；
接著重跑原本 phase 的完整確認命令。若無法證明舊程序已終止或任一欄位不符，不得清除
lease，應維持 production 暫停並先人工查明。

只有 finalize 成功，且 owner/outsider smoke test 都符合預期後，才解除 production
維護封鎖。

### 11.2 修復 legacy room 缺少的 deletion identity

早期版本的 owner migration 只寫入
`roomReservations/{roomId}/creationId`，卻漏掉刪除流程所需的
`roomAccess/{roomId}/creationId`。症狀是 owner 能正常開啟旅程，但永久刪除回傳
「只有旅程擁有者可以永久刪除此旅程」。不要放寬 `deleteTrip` 的 owner 驗證，也不要
重跑完整 migration；完整 migration 會重新觸碰 ACL、quota 與已完成的 Storage 安全
清理，範圍過大。

合併含 `repair:legacy-creation-id` 的 PR 後，在 Cloud Shell 從最新 `main` 執行。下列
命令以已確認的 35 個 legacy rooms 為例；mapping 使用第 5 節同一份未提交檔案：

```bash
cd ~/Travel_app
git switch main
git pull --ff-only origin main
npm --prefix functions ci --ignore-scripts

project_id='travel-app-923ef'
database_url='https://travel-app-923ef-default-rtdb.firebaseio.com'
repair_count='35'
mapping_path='scripts/legacy-owner-map.production.local.json'
manifest_path="${HOME}/legacy-creation-id-repair-20260901.local.json"
umask 077

npm --prefix functions run repair:legacy-creation-id -- \
  --mapping "$mapping_path" \
  --manifest "$manifest_path" \
  --project "$project_id" \
  --database-url "$database_url" \
  --expected-count "$repair_count"
```

PLAN 不寫 Firebase，只會以 exclusive create 建立權限 0600 的本機 manifest。它會要求
mapping 與 production 所有 `migrated: true` reservations 完全相等，並逐 room 驗證：

- `rooms.meta.ownerUid`、`roomAccess` active owner、`userTrips` 與 Firestore ACL 的 owner
  和 `aclVersion` 一致；
- reservation 的 room、owner、timestamp 與 deterministic
  `legacy-migration-{roomId}` creation ID 完整；
- 沒有 deletion journal、worker、Firestore deletion guard 或既有 ticket repair lease；
- access creation ID 只能是缺少，或已經與 reservation 完全相同；任何其他值都會
  fail closed。

本次已知缺陷的預期輸出是：

```text
PLAN total=35 candidates=35 correct=0
No Firebase data was changed.
```

若 count 不同，不可自行改 confirmation 繞過；先保持 production 不刪除旅程並查明差異。
保存輸出的 manifest SHA，另備份 repair 前的 access subtree 與 manifest：

```bash
manifest_sha='PASTE_THE_64_CHARACTER_SHA256_FROM_PLAN_OUTPUT'
access_backup="${HOME}/roomAccess-before-creation-id-repair-20260901.local.json"
manifest_backup="${HOME}/legacy-creation-id-repair-20260901.backup.local.json"

npx -y firebase-tools@latest database:get /roomAccess \
  --project "$project_id" \
  --instance travel-app-923ef-default-rtdb \
  --output "$access_backup"
cp --preserve=mode,timestamps "$manifest_path" "$manifest_backup"
chmod 600 "$access_backup" "$manifest_backup"
test -s "$access_backup" && test -s "$manifest_backup" && echo 'Repair backups: OK'
jq -e 'type == "object"' "$access_backup" >/dev/null
sha256sum "$manifest_path" "$manifest_backup" "$access_backup"
```

`access_backup` 只供事故比對，不能用整棵 `/roomAccess` restore 覆蓋 repair 後或其他使用者
產生的新資料。

Apply 前暫停 Vercel Production，並確認所有已知使用者已關閉既有 PWA／分頁。Vercel
Pause 不會撤銷已登入使用者直接呼叫 Firebase Functions 的能力，所以兩個條件都必須
成立；至少等待 60 秒讓已送出的 `deleteTrip` callable 結束，再使用 PLAN 顯示的
candidate count 與 SHA 執行：

```bash
candidate_count='35'

npm --prefix functions run repair:legacy-creation-id -- \
  --manifest "$manifest_path" \
  --project "$project_id" \
  --database-url "$database_url" \
  --expected-count "$repair_count" \
  --apply \
  --confirm-project "$project_id" \
  --confirm-database-host 'travel-app-923ef-default-rtdb.firebaseio.com' \
  --confirm-count "$repair_count" \
  --confirm-candidate-count "$candidate_count" \
  --confirm-manifest-sha256 "$manifest_sha" \
  --confirm-maintenance-window production-paused-users-inactive
```

工具會先完成 35/35 preflight，接著在現有
`maintenanceRepairs/legacyTicketPath/{roomId}` 取得每個 room 的 maintenance lease；現行
Rules 與 `deleteTrip` 都認得這個 gate，因此 repair 期間 client write 與新刪除要求會被
拒絕。每筆只以 transaction 將「缺少」補成 manifest 指定值，不覆寫 reservation、room、
member、ACL、quota 或其他 access 欄位。已完成的筆數可安全重跑；若程序中斷並留下本次
manifest 的 lease，新的 apply invocation 會 fail closed，不會自動接管。命令開始時會
輸出本次唯一 `Apply invocation ID`；保持 production 暫停，先用 `ps` 確認舊 Node 程序
已完全停止，再逐筆核對 lease 的 operation、manifest `runId`、SHA、roomId 與
invocation ID。只有全部與中斷程序完全相符時，才能用受審核的 Admin 操作精確清除該
批 leaf，再以同一 manifest 與 SHA 向前續跑。不可刪除整個
`maintenanceRepairs` 或 `legacyTicketPath` namespace，也不可接管 foreign lease。

Apply 必須顯示 `APPLY verified=35`。接著執行獨立 read-only verify：

```bash
npm --prefix functions run repair:legacy-creation-id -- \
  --manifest "$manifest_path" \
  --project "$project_id" \
  --database-url "$database_url" \
  --expected-count "$repair_count" \
  --verify \
  --confirm-manifest-sha256 "$manifest_sha"
```

確認 `VERIFY verified=35` 後才解除 Vercel 維護封鎖，先以 owner 登入並永久刪除一趟
確定不再需要的 legacy 旅程。若沒有 owner-only edge allowlist，解除 Pause 就會形成短暫
公開窗口，因此其他已知使用者仍須保持離線；若 smoke 失敗立刻重新 Pause。確認卡片
消失、RTDB/Firestore/Storage cleanup 完成後，才通知其他使用者恢復操作。

Repair 對跨 namespace 的安全保證是 maintenance lease、全批 preflight、逐 room
`roomAccess` transaction 與全批 post-verify；它不宣稱 RTDB、Firestore 與 Auth 之間是
單一原子 transaction。只有維護窗口與 lease 都成立時才能 apply。

這項 repair 刻意不提供 live rollback。補回 creation ID 是 deterministic、單調且
idempotent 的 canonical invariant；刪回欄位會重新製造缺陷，且可能與已通過 owner
驗證、尚未建立 journal 的 in-flight delete 發生競態，使 deletion worker 永久卡住。
若 apply 中斷，安全恢復方式是保留 manifest 與 lease、用同一 SHA 向前續跑並完成
verify；若留下 lease，必須先依上段完成 ownership 核對與精確清理，而不是還原整個
access snapshot。

## 12. 人工：確認 download-token gate 並設定 Storage CORS

### 確認自動 download-token gate

舊版曾把 `getDownloadURL()` 的長效 capability URL 寫進 RTDB。第 11 節的 apply
現在會自動撤銷 token、清理 RTDB URL 並驗證匿名舊 URL 不再回傳 2xx，不再接受只靠
Firebase Console 人工抽查。管理者仍必須確認命令最後出現
`Download token release gate passed`，並保留不含 URL/token 的數量紀錄。接著：

1. 驗證舊 URL 回傳拒絕／找不到。
2. 驗證 active owner/editor 仍能由 App 透過 `storagePath` 開啟附件。
3. 移除 member 後，該帳號再次讀取同一 `storagePath` 必須被拒絕。

已下載到裝置或既有離線副本無法遠端抹除；移除成員只能停止後續雲端存取。

### 設定 Storage CORS

`getBlob()` 會讓每次下載重新經過 Firebase Auth 與 Storage Rules。瀏覽器 production
網域必須在 bucket CORS allowlist。變更前先用下列命令保存完整 bucket metadata，並
把目前 `cors_config` 另存成可供 `--cors-file` 使用的 JSON 陣列（若目前沒有 CORS，
也要在 rollout 記錄中明確記為「none」）：

```powershell
$travelStorageBucket = 'travel-app-923ef.firebasestorage.app'
$corsAuditFile = 'storage-bucket-before.production.json.local'
gcloud storage buckets describe "gs://$travelStorageBucket" --format=json |
  Set-Content -LiteralPath $corsAuditFile -Encoding utf8
gcloud storage buckets describe "gs://$travelStorageBucket" --format="default(cors_config)"
```

備份與 restore JSON 是 production 敏感操作紀錄，只能存成副檔名 `.local`（repo 的
全域 ignore 規則才會排除）或放在受限位置，
不可提交 Git。接著複製並編輯 `docs/security/storage-cors.example.json`，只保留實際
可信任的 origin。套用前強制拒絕範例 placeholder、wildcard 與空陣列：

```powershell
$corsFile = 'storage-cors.production.json.local'
$corsText = Get-Content -Raw -LiteralPath $corsFile
$corsRules = @($corsText | ConvertFrom-Json)
if (-not $corsRules.Count -or $corsText -match 'YOUR_|example\.(com|org)|"\*"') {
  throw 'CORS 檔仍含 placeholder/wildcard，或沒有任何規則；拒絕套用。'
}
gcloud storage buckets update "gs://$travelStorageBucket" --cors-file=$corsFile
```

套用後再次執行 `gcloud storage buckets describe ... --format="default(cors_config)"`
核對 production 與可信任 Preview origin。若要回滾 CORS，且原本有規則，使用事前
準備的 input-compatible restore JSON 搭配 `--cors-file`；若原本明確為 none，使用：

```powershell
gcloud storage buckets update "gs://$travelStorageBucket" --clear-cors
```

不可拿仍含 `YOUR_...` 的 example 檔直接套用。CORS 不是授權機制；真正授權仍由
Storage Rules + Firestore ACL 決定。

## 13. 發佈前端並執行 smoke test

只有在以下條件全部成立後，才把新的 Vercel production frontend 取代維護頁：

1. Functions 健康。
2. Final strict Rules 已生效。
3. Migration apply 與版本一致性驗證全數通過。
4. 舊 download token 已處理，production CORS allowlist 已套用。
5. Auth authorized domains 與 production 環境變數已再次核對。

發佈後使用 owner、editor、outsider 三個 Google 帳號做 smoke test；全數通過後才
解除剩餘維護告示：

- 未登入只能看到登入入口，不能取得旅程內容。
- outsider 猜到 roomId 或使用舊 `?room=` 連結也不能進入。
- 有效邀請可加入，撤銷／換發後舊 token 失效。
- editor 可編輯旅程，但不可管理成員或換發邀請。
- owner 移除 editor 後，對方立即離開旅程並失去附件讀取權。
- owner 恢復成員後，Lobby 索引與附件權限恢復。
- 登出會關閉 cloud trip；換帳號不會看到前一個 UID 的 Lobby cache。
- 建立旅程、Google 登入與邀請 callable 沒有 Functions error spike。

## 14. 回滾

- **Strict Rules 尚未切換**：維持或解除維護入口，停止 rollout；未使用的 Functions
  可保留或另行回滾。不要執行 migration apply。
- **Strict Rules 已切換、migration 尚未完成**：維持維護頁與 strict Rules，修正
  mapping/環境後重跑 Admin migration。不要發佈 pre-auth 前端，也不要用公開 Rules
  當 rollback。
- **Migration membership 資料問題**：維持 strict Rules；腳本會嘗試恢復原 canonical
  membership、`userTrips` 與 Firestore ACL，並驗證沒有意外 active grant。延遲 trigger
  最多只能留下較高版本 `removed` tombstone。等待 Functions event backlog 清空後，
  再執行 dry-run 檢查；若仍失敗，依備份與已核准 mapping 人工修正，且重新驗證三處
  `aclVersion` 後才可重跑 apply。
- **Download-token 清理已開始**：token 與已清空的 RTDB URL 不回復。保持維護模式，
  重跑同一 apply，直到 token/URL 重掃皆為 0 且所有舊匿名 URL 都不是 2xx。此
  forward-only 行為刻意避免 rollback 重新開放 capability URL。
- **CORS 問題**：用變更前保存的 input-compatible CORS JSON 執行 `--cors-file` 回復；
  若事前已明確記錄為 none，使用 `--clear-cors`。回復後重新執行 owner/editor/outsider
  的附件 smoke test。
- **前端問題**：切回維護頁，而不是回到 pre-auth 前端；修正後向前發佈已驗證的
  auth build。
- **重大事故**：持續封鎖入口並保留 strict Rules。恢復舊公開 Rules 會重新開放
  未授權讀寫，不是受支援的回滾路徑。

## 15. 已知限制與後續強化

- Cloud Storage Security Rules 的 `request.resource` 不暴露 `cacheControl`，因此 Rules
  無法驗證該 header。Web client 的所有受保護上傳仍固定寫入
  `private, no-store, max-age=0`，並由單元測試鎖定；正式 smoke test 需抽查實際 object
  metadata。不要把這項 client 設定視為 Storage ACL，真正授權仍由 Firestore ACL mirror
  與 Storage Rules 執行。

- Google 登入與高熵邀請能識別／授權使用者，但「把連結轉傳給別人」仍會把
  editor 權限授予該人的 Google 帳號；owner 可換發邀請並移除成員。
- Functions 目前有 `maxInstances`、建立旅程／兌換邀請的 per-UID 配額，以及
  owner 邀請操作的 per-room 配額；尚未啟用 App Check enforce mode。正式擴大分享
  前應先觀察流量，再以 Preview 驗證 App Check 後逐步 enforce，避免直接鎖死 PWA。
- 移除成員無法刪除其裝置上已下載／截圖的資料。
- Firestore Rules 是 server-only ACL mirror 的 deny-all prototype；正式廣泛分享前
  仍應再次人工審核 Rules、Emulator 測試與權限模型。
