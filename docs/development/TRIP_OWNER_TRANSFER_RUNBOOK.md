# 旅程擁有者轉移操作手冊

本手冊適用於已啟用 Google 登入與成員權限模型的 production 旅程。擁有者轉移是跨
Realtime Database、Firestore ACL 與使用者旅程索引的高風險管理操作，只能使用經審查的
`transfer:trip-owner` 工具執行。

不得直接在 Firebase Console 修改 `ownerUid`、成員角色或索引，也不得為了轉移擁有者而
重跑任何 legacy migration／repair。這些做法會讓權限鏡像、刪除身分與 quota bookkeeping
互相矛盾。

## 轉移語意

- 目的帳號必須是已用 Google 登入、而且已加入該旅程的 **active editor**。不可只憑
  email、顯示名稱、尚未兌換的邀請，或手動新增的 UID 轉移。
- `fromUid` 必須是目前唯一的 active owner；`toUid` 必須是該旅程目前的 active editor。
- 成功後 `toUid` 成為 owner；`fromUid` 預設保留為 editor。若舊擁有者之後要離開，應在
  完成轉移與雙帳號 smoke test 後，另走既有的成員移除流程。
- 原始建立者與建立 quota 歸屬是不可變的歷史資料。轉移權限不得改寫原始
  `createdByUid`／quota owner，也不得把歷史建立額度搬給新擁有者。
- 旅程內容與 `rooms/{roomId}/**` Storage object 不搬移；變更的是管理權與授權鏡像。
- 工具會撤銷所有轉移前的邀請 lookup、清除 canonical invite 並提高 invite version。完成
  轉移後由新擁有者建立新邀請；既有邀請不得拿來當 rollback 資料，也不得恢復舊 token。

## 0. 先以實作的 `--help` 為準

本文件中的命令採預定介面。每次 production 操作前，必須在準備部署的最新 `main` 執行：

```bash
cd ~/Travel_app
git switch main
git pull --ff-only origin main
npm --prefix functions ci --ignore-scripts
npm --prefix functions run transfer:trip-owner -- --help
```

逐一核對 `--mapping`、`--manifest`、`--project`、`--database-url`、
`--expected-count`、`--apply`、`--verify` 與所有 `--confirm-*` 選項。若 `--help` 與本文件
不同，**停止操作並先同步文件與已審查實作**；不可猜測旗標、刪除確認 gate 或改用 Console。

### 合併後先部署本次必要 Functions

擁有者轉移工具本身是 operator CLI，不需部署成 Cloud Function；但本次同時補強了轉移中
的 callable／ACL 同步防護，以及轉移後擁有者的刪除與原始建立者 quota 語意。PR 合併後、
PLAN 前，從最新 `main` 只部署下列受影響的 Functions：

```bash
cd ~/Travel_app
git switch main
git pull --ff-only origin main
npm --prefix functions ci --ignore-scripts

npx -y firebase-tools@latest deploy \
  --only functions:getOrCreateTripInvite,functions:rotateTripInvite,functions:revokeTripInvite,functions:redeemTripInvite,functions:removeTripMember,functions:restoreTripMember,functions:syncTripMemberAccess,functions:deleteTrip,functions:processTripDeletion \
  --project travel-app-923ef

npx -y firebase-tools@latest functions:list --project travel-app-923ef
```

在 Functions 清單確認下列九筆都存在，且 deploy 完整成功後，才能繼續 PLAN：

- `getOrCreateTripInvite`：v2 callable，`us-central1`；
- `rotateTripInvite`：v2 callable，`us-central1`；
- `revokeTripInvite`：v2 callable，`us-central1`；
- `redeemTripInvite`：v2 callable，`us-central1`；
- `removeTripMember`：v2 callable，`us-central1`；
- `restoreTripMember`：v2 callable，`us-central1`；
- `syncTripMemberAccess`：v2 Realtime Database written trigger，`us-central1`；
- `deleteTrip`：v2 callable，`us-central1`；
- `processTripDeletion`：v2 Realtime Database written trigger，`us-central1`。

版本、trigger 或 region 不符，或清單缺少任一 Function 時停止；不要改成整包 Functions
deploy，也不要開始 production 資料轉移。

## 1. 前置確認

每筆轉移都必須先確認：

1. 目前 owner 與目標 editor 都已在 production Web App 用各自的 Google 帳號登入。
2. 目標帳號已兌換該旅程邀請，而且在成員管理畫面顯示為可共同編輯。
3. 從 Firebase Authentication 讀出的目標 UID，與 mapping 的 `toUid` 完全相同。
4. 從旅程資料讀出的 room ID、完整旅程名稱與目前 owner UID，分別與
   `roomId`、`expectedTitle`、`fromUid` 完全相同。
5. 該旅程沒有進行中的刪除、成員移除、邀請輪替或其他 maintenance operation。
6. 所有已知使用者同意維護窗口；在 APPLY 前會完全關閉 PWA 與瀏覽器分頁。

任一項無法確認就停止。尤其不要把「看得到邀請連結」當成 active editor 的證明。

## 2. 建立本機 mapping

mapping 必須是未提交的 `*.production.local.json`。建議位置：

```text
functions/scripts/trip-owner-transfer.production.local.json
```

在 repo root 執行下列檢查，確認檔案會被 Git 忽略：

```bash
git check-ignore functions/scripts/trip-owner-transfer.production.local.json
git status --short
```

檔案格式：

```json
{
  "version": 1,
  "transfers": [
    {
      "expectedTitle": "完整旅程名稱",
      "roomId": "room_id",
      "fromUid": "目前擁有者的 Google Auth UID",
      "toUid": "已加入旅程之 active editor 的 Google Auth UID"
    }
  ]
}
```

`expectedTitle` 是避免選錯 room 的人工與工具雙重防線，必須包含完全相同的空格與標點。
不要在 mapping 放 email、token、API key、service-account JSON 或任何憑證。

實際 production room ID 與 UID 不得提交到 repo。由操作人員將已核准的值填入本機
mapping；若只有一筆，`expected-count` 應為 `1`。若之後要再轉移其他旅程，先建立新的
mapping／manifest 批次並重新走完整流程，不要悄悄修改已審核或已 APPLY 的 manifest。

## 3. PLAN：只讀檢查並建立 manifest

以下命令與目前介面一致，但執行時仍必須先與第 0 節的實際 `--help` 比對：

```bash
cd ~/Travel_app

project_id='travel-app-923ef'
database_url='https://travel-app-923ef-default-rtdb.firebaseio.com'
database_host='travel-app-923ef-default-rtdb.firebaseio.com'
transfer_count='1'
mapping_path='scripts/trip-owner-transfer.production.local.json'
manifest_path="${HOME}/trip-owner-transfer-$(date -u +%Y%m%dT%H%M%SZ).production.local.json"

umask 077

npm --prefix functions run transfer:trip-owner -- \
  --mapping "$mapping_path" \
  --manifest "$manifest_path" \
  --project "$project_id" \
  --database-url "$database_url" \
  --expected-count "$transfer_count"
```

PLAN 必須明確表示沒有修改 Firebase。逐筆審閱輸出與 manifest，至少確認：

- `expectedTitle`、`roomId`、`fromUid`、`toUid` 與已核准資料完全相同；
- `fromUid` 是唯一 active owner，`toUid` 是 active editor；
- room metadata、canonical membership、兩個 `userTrips` 索引與 Firestore ACL 鏡像一致；
- reservation／creation identity 完整，原始建立者與 quota owner 不會被改寫；
- 沒有 deletion journal、deletion worker、maintenance lease 或其他衝突中的操作；
- candidate count 恰好等於 `transfer_count`，沒有額外 room。

保存 PLAN 顯示的 64 字元 SHA-256，並再次計算：

```bash
manifest_sha='貼上 PLAN 輸出的 64 字元 SHA-256'
printf '%s  %s\n' "$manifest_sha" "$manifest_path" | sha256sum --check
jq . "$manifest_path" >/dev/null
```

若 count、角色、title、UID、ACL version 或 creation identity 有任何差異，不可調低
`expected-count` 或改 confirmation 繞過；停止並保持 production 不變。

## 4. 建立操作前備份

manifest 是經簽章的執行計畫，不等於可直接覆寫 production 的備份。另建立權限 `0700`
的本機目錄，至少保存 manifest 副本、目標 room 的 RTDB 權限相關資料，以及 Storage
namespace 清單：

```bash
room_id='貼上已核准的 room ID'
from_uid='貼上目前 owner UID'
to_uid='貼上目標 active editor UID'
instance='travel-app-923ef-default-rtdb'
storage_bucket='travel-app-923ef.firebasestorage.app'
backup_dir="${HOME}/trip-owner-transfer-backup-$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -m 700 "$backup_dir"
cp --preserve=mode,timestamps "$manifest_path" "$backup_dir/manifest.production.local.json"

npx -y firebase-tools@latest database:get "/rooms/${room_id}" \
  --project "$project_id" --instance "$instance" \
  --output "$backup_dir/room.production.local.json"
npx -y firebase-tools@latest database:get "/roomAccess/${room_id}" \
  --project "$project_id" --instance "$instance" \
  --output "$backup_dir/roomAccess.production.local.json"
npx -y firebase-tools@latest database:get "/roomReservations/${room_id}" \
  --project "$project_id" --instance "$instance" \
  --output "$backup_dir/roomReservation.production.local.json"
npx -y firebase-tools@latest database:get "/userTrips/${from_uid}/${room_id}" \
  --project "$project_id" --instance "$instance" \
  --output "$backup_dir/from-userTrip.production.local.json"
npx -y firebase-tools@latest database:get "/userTrips/${to_uid}/${room_id}" \
  --project "$project_id" --instance "$instance" \
  --output "$backup_dir/to-userTrip.production.local.json"

gcloud storage ls --recursive "gs://${storage_bucket}/rooms/${room_id}/" \
  > "$backup_dir/storage-inventory.production.local.txt"

chmod 600 "$backup_dir"/*
test -s "$backup_dir/manifest.production.local.json"
test -s "$backup_dir/room.production.local.json"
test -s "$backup_dir/roomAccess.production.local.json"
sha256sum "$backup_dir"/* > "$backup_dir/SHA256SUMS.production.local.txt"
chmod 600 "$backup_dir/SHA256SUMS.production.local.txt"
```

PLAN manifest 應包含或驗證 Firestore `tripAccess` ACL 的 transfer 前 fingerprint。若實作的
`--help`／PLAN 要求額外 Firestore backup artifact，也必須完成後才能繼續。這些備份只能
用於稽核與精準修復；不可把整棵 namespace 直接 restore 回 production，否則可能覆蓋
維護窗口前後的新版本資料。

## 5. 暫停 Production 並關閉寫入窗口

1. 使用已驗證的 Vercel 帳號暫停 **Production** 專案；不要只關閉某一個瀏覽器頁面。
2. 以無快取 HTTP probe 確認 production 回傳維護狀態（目前流程是 HTTP `503` 並含
   `DEPLOYMENT_PAUSED` marker）。
3. 確認所有已知使用者已完全關閉 PWA 與瀏覽器分頁。
4. 至少等待 60 秒，讓已送出的 callable／Realtime write 結束。
5. 再次確認沒有 transfer、delete 或 legacy repair 程序仍在執行。

Vercel Pause 不會撤銷已登入 client 直接連 Firebase 的能力，所以「HTTP 503」與「所有
使用者離線」兩個 gate 缺一不可。任何 gate 失敗都要停止；不得先 APPLY 再補確認。

在 60 秒等待結束後重掃 Storage，確認第 4 節備份後沒有資料漂移：

```bash
gcloud storage ls --recursive "gs://${storage_bucket}/rooms/${room_id}/" \
  > "$backup_dir/storage-inventory-pause-gate.production.local.txt"
diff -u \
  "$backup_dir/storage-inventory.production.local.txt" \
  "$backup_dir/storage-inventory-pause-gate.production.local.txt"
```

`diff` 必須沒有差異。若有差異，維持 Pause，重新查明變更並從 PLAN／備份重新開始；
不要沿用已漂移的 manifest 繼續 APPLY。

驗證 Cloud Shell 與 Node Admin SDK 的 Application Default Credentials：

```bash
gcloud auth print-access-token >/dev/null
gcloud auth application-default print-access-token >/dev/null

cd ~/Travel_app/functions
node --input-type=module - <<'NODE'
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();
const result = await client.getAccessToken();
const token = typeof result === 'string' ? result : result?.token;
if (!token) throw new Error('ADC token is empty');
console.log(`ADC Node test: OK (${client.constructor.name})`);
NODE
cd ~/Travel_app
```

此外，正式操作 shell 不得殘留 `FIREBASE_DATABASE_EMULATOR_HOST`、
`FIRESTORE_EMULATOR_HOST`、`FIREBASE_AUTH_EMULATOR_HOST` 或
`FIREBASE_STORAGE_EMULATOR_HOST`。若 `GCLOUD_PROJECT`／`GOOGLE_CLOUD_PROJECT` 有值，
必須與 `travel-app-923ef` 完全相同；CLI 會在初始化 Admin SDK 前再次檢查並 fail closed，
避免 RTDB、Firestore 或 Auth 指向不同環境。

## 6. APPLY：逐字確認後執行

先重新執行 manifest SHA、備份 checksum、production pause、使用者離線與 ADC gate。
接著依實作的 `--help` 填入 **全部** `--confirm-*`。下列是預定介面範本，複製前仍須
與第 0 節輸出逐項核對：

```bash
candidate_count='1'

npm --prefix functions run transfer:trip-owner -- \
  --manifest "$manifest_path" \
  --project "$project_id" \
  --database-url "$database_url" \
  --expected-count "$transfer_count" \
  --apply \
  --confirm-project "$project_id" \
  --confirm-database-host "$database_host" \
  --confirm-count "$transfer_count" \
  --confirm-candidate-count "$candidate_count" \
  --confirm-manifest-sha256 "$manifest_sha" \
  --confirm-maintenance-window production-paused-users-inactive
```

只有工具回報全部 candidate 已成功套用並 post-verify，才可進入下一節。保存 invocation
ID、完整 stdout/stderr log、Git commit、manifest path 與 SHA。

若 APPLY 中斷、逾時、回報 partial result 或任何 invariant failure：

- **保持 Production 暫停**，不要通知使用者重開 App；
- 不要編輯 manifest、不要建立不同 mapping 直接重跑、不要手動改 Console；
- 不要重跑 `migrate:legacy`、`repair:legacy-ticket-path` 或
  `repair:legacy-creation-id`；
- 保存 invocation ID 與 log，先確認舊 Node 程序已完全停止，再逐 room 比對三道鎖：
  RTDB maintenance lease、Firestore guard，以及 canonical
  `roomAccess.state=maintenance`／`maintenanceLock`；三者的 operation、run ID、manifest
  SHA、room ID 與 invocation ID 都必須相符；
- 若仍有 lock，只有所有現存 lock 都可證明屬於同一次中斷操作時，才能用完全相同的
  APPLY 命令加上 `--invocation-id '<原本輸出的 invocation ID>'` 恢復；工具會沿用 owned
  lock 的原始時間；
- 若三道 lock 均已釋放，ownership 與 ACL 已完成，但舊 callable 延遲留下 manifest
  已記錄的同 room invite lookup，同一份 manifest／invocation 可重新取得三道鎖並只做
  CAS 清理，不會重寫已完成的角色或稽核時間；若 hash 不在 manifest，或已指向其他
  room，工具會停止而不刪除；
- 若 lock 缺少欄位、屬於其他 operation／manifest／invocation，或無法證明舊程序已停止，
  不得接管、刪除或覆寫；
- 在無法證明跨 namespace 狀態一致前，不得解除 Pause。

## 7. VERIFY：獨立唯讀驗證

VERIFY 必須使用同一份 immutable manifest 與 SHA。以下同樣先與 `--help` 核對：

```bash
npm --prefix functions run transfer:trip-owner -- \
  --manifest "$manifest_path" \
  --project "$project_id" \
  --database-url "$database_url" \
  --expected-count "$transfer_count" \
  --verify \
  --confirm-manifest-sha256 "$manifest_sha"
```

成功結果至少要證明：

- room metadata 與 canonical access 的 owner 都是 `toUid`；
- `toUid` 的 canonical membership、`userTrips` 與 Firestore ACL 都是 active owner；
- `fromUid` 的三個鏡像都是 active editor；
- 沒有第二個 active owner，也沒有殘留的 maintenance lease；
- reservation／creation identity、原始建立者與 quota owner 未變；
- deletion journal／worker 未被建立，旅程內容仍存在；
- canonical invite 已清除、轉移前的 invite lookup 已撤銷，且 invite version 單調增加。

CLI VERIFY 不會掃描 Storage，因此另以 read-only inventory 比對確認 object namespace 沒有
變動：

```bash
gcloud storage ls --recursive "gs://${storage_bucket}/rooms/${room_id}/" \
  > "$backup_dir/storage-inventory-after.production.local.txt"
diff -u \
  "$backup_dir/storage-inventory-pause-gate.production.local.txt" \
  "$backup_dir/storage-inventory-after.production.local.txt"
```

`diff` 必須沒有差異；若使用者在維護窗口外仍可能寫入 Storage，該窗口本身就不成立，
不可把新增 object 當成可以忽略的雜訊。

VERIFY 失敗時維持 Production 暫停。不要用備份整棵覆蓋，也不要只修一個鏡像讓檢查
暫時變綠。

## 8. 雙帳號 smoke test 與解除 Pause

優先在受限制、連到同一 production Firebase 的核准 Preview 做雙帳號 smoke；Production
入口保持暫停。如果沒有這種 Preview，只有在 server-side VERIFY 完全通過、其他使用者仍
離線時才短暫解除 Pause 進行 smoke，任何失敗立刻重新 Pause。

使用兩個獨立瀏覽器 profile／無痕 session 驗證：

### 新擁有者 `toUid`

- Google 登入後首頁可看到並開啟旅程；
- 成員管理顯示自己是唯一擁有者；
- 可以管理成員與建立新的邀請；
- 可以看到永久刪除入口，但不要用這趟正式旅程測試實際刪除；
- 行程、地圖、票券與記帳資料可正常讀寫，票券附件可正常開啟。

### 舊擁有者 `fromUid`

- Google 登入後仍可看到並開啟旅程；
- 顯示為 editor，可進行一般共同編輯；
- 不可管理 owner-only 操作、不可永久刪除旅程、不可再次轉移擁有權；
- 重新整理與重新登入後結果不變。

兩個帳號都通過後，再確認 HTTP `200` 與 `<title>智の旅行</title>`，才通知其他使用者
恢復操作。若任何檢查失敗，立即重新 Pause、保留 log 與 manifest，進入事故處理。

## 9. 回滾原則

已完整成功的擁有者轉移若確定要撤回，正確方式是建立 **新的反向轉移**：

- 新 mapping 的 `fromUid` 是目前 owner（原 `toUid`）；
- 新 mapping 的 `toUid` 是目前 active editor（原 `fromUid`）；
- 使用新的 manifest、SHA、備份與 maintenance window；
- 完整重走 PLAN → APPLY → VERIFY → 雙帳號 smoke。

不要 restore 舊 `roomAccess`／`userTrips`／Firestore snapshot，不要只交換兩個 `role`，也
不要恢復舊邀請。直接 restore 會繞過當前 ACL version、可能覆寫新資料，並重新啟用已
外流的邀請能力。若 APPLY 只完成一部分，則不是一般 rollback 情境；必須保持 Pause，
依同一 manifest 與 invocation 的恢復程序先收斂到一致狀態，再決定是否做反向轉移。

## 10. 操作紀錄

保留但不要提交或公開：

- 操作使用的 Git commit；
- mapping path、manifest path 與 SHA-256；
- backup directory 與 checksum；
- Vercel pause／unpause 時間與 probe 結果；
- APPLY invocation ID、完整 log 與 VERIFY 結果；
- 新舊擁有者各自的 smoke test 結果；
- 若失敗，保持 Pause 的時間、錯誤與後續處置。

Firebase UID 是識別碼而不是登入憑證，但仍不得把實際 production mapping 提交 Git。
room ID、UID、Auth profile、email、manifest fingerprint 與操作 log 等資料只放在受控的
本機／管理環境，不貼到公開 issue 或 PR log。mapping、manifest、backup 與 log 都必須
維持 `*.local.*` 或其他已確認被 `.gitignore` 排除的檔名。
