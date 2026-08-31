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
  `tickets/**`，dry-run 會規劃搬到 `rooms/{roomId}/tickets/**`；只接受由該 room 的
  `tickets` record 明確引用的 object。輸出只包含數量，不會列印 capability URL 或
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
把被引用的根目錄 `tickets/**` 搬到 `rooms/{roomId}/tickets/**`，驗證內容 fingerprint、
移除目的地 download token 並留下可重跑的來源標記，確認成功後才刪除舊根目錄物件。
接著以 metageneration precondition 清除其他 `rooms/**` object 的
`firebaseStorageDownloadTokens` metadata，並逐一匿名請求所有已盤點的舊 capability
URL；任何 2xx 都會讓 release gate 失敗。RTDB legacy URL 會保留到匿名拒絕驗證成功，
作為失敗後可重跑的安全 journal，之後才改為房間專屬的 `storagePath` 並把 `url` 清空。
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
