# External App Tickets

## 產品目的

票券夾支援附件、網頁票券與外部 App 票券，同時維持既有票券資料可讀。Domain 層負責正規化、開啟決策、audience 篩選與日期推導；正式票券 UI 只在使用者操作時透過 persistence actions 寫入 Firebase，不會因讀取舊資料而自動 migration。

## 票券來源

第一版支援三種 `ticketType`：

- `attachment`：圖片或 PDF 附件。
- `web-link`：一般 HTTP 或 HTTPS 網頁票券；未提供 scheme 時預設補上 `https://`。
- `external-app`：以 Universal Link 或 App Link 開啟外部 App，可另設網頁 fallback。`appUrl` 可以留空；若 App 與 fallback 連結都沒有，進入 manual mode，顯示人工開啟說明。

第一版不支援 custom URL scheme，也不接受 `javascript:`、`data:`、`file:`、`blob:`、`intent:` 或其他非 HTTP(S) scheme。

## Canonical schema

正規化後的票券至少包含以下欄位：

```js
{
  id,
  title,

  ticketType, // attachment | web-link | external-app
  attachmentKind, // image | pdf | ""
  url,
  storagePath,

  audienceType, // all | members
  assignedMembers,
  presenterMember,

  dayId,
  usageTime,
  reminderMinutes,

  appName,
  appUrl,
  fallbackUrl,
  orderNumber,

  requiresNetwork,
  requiresLogin,
  dynamicCode,

  usageDetails,
  memo,
  instructions,

  owner,
  createdAt,
  updatedAt,
}
```

字串欄位會移除頭尾空白。`usageTime` 只接受 `HH:mm`；`reminderMinutes` 只接受 `0`、`5`、`15`、`30` 或 `60`。`dynamicCode` 只是票券是否使用動態碼的布林描述，不包含 QR 或驗證碼內容。

票券只保存 `dayId`。顯示日期會以旅程 `startDate` 和 `dayId` 動態推導，不保存可能與旅程日期失去同步的 `usageDate` 副本。

## 舊資料相容策略

舊票券不做批次 migration，也不會在讀取或正規化時自動寫回 Firebase：

- 合法的新 `ticketType` 優先。
- 舊 `type: "image" | "pdf"` 或具有 `storagePath` 的資料正規化為 `attachment`。
- 其他舊資料（包括 `type: "link"`）正規化為 `web-link`。
- Attachment 會保留 `image`／`pdf` 相容資訊，供舊呈現邏輯辨識。
- 舊 `owner: "所有人"` 正規化為共同票券。
- 舊 `owner` 若仍是有效旅程成員，正規化為該成員的單人票券；無效或缺失時安全回退為共同票券。

第一版不做資料 migration。未來若需要持久化 canonical shape，必須另行設計可回滾的 migration 與 Firebase rules／schema 審查。

## Audience 與出示人

`audienceType: "all"` 代表所有旅程成員共同使用，`assignedMembers` 必須是空陣列。`audienceType: "members"` 可指定一位或多位現有旅程成員；空白、重複與已不存在的成員會被移除。

個人成員分頁必須同時包含：

- `assignedMembers` 包含該成員的票券。
- 所有 `audienceType === "all"` 的共同票券。

篩選保持原始順序，共同票券不重複。共同或多人票券可指定 `presenterMember`：多人票券的出示人必須在 `assignedMembers` 中；共同票券的出示人必須仍是旅程成員。

## 開啟模式與 URL 安全

外部 App 票券依序選擇：

1. 合法 `appUrl`：`app-link`。
2. 合法 `fallbackUrl`：`web`。
3. 兩者皆無：`manual`，讓使用者查看手動開啟方式。

網頁票券只有在 URL 合法時才使用 `web`；附件依圖片或 PDF 使用 `fullscreen-image` 或 `pdf`，缺少可用附件時標記為 `invalid`。

URL 正規化只允許 HTTP 與 HTTPS。未指定 scheme 時以 HTTPS 為預設；明確提供的 HTTP 仍可相容，但 production 與一般流程應優先使用 HTTPS。嵌入 URL 的帳號或密碼也不接受。

票券模型不保存登入帳號、密碼、token、cookie、驗證碼、動態 QR 內容或其他認證祕密。`requiresLogin` 只描述開啟票券時是否可能需要登入。

## 提醒限制

`reminderMinutes` 第一版只保存與顯示提醒設定，不等於系統通知。本階段不實作 Notification API、Push Notification、背景排程或其他裝置通知能力。

## 裝置成員身分

票券使用 `travel-active-member-${roomId}` 在 localStorage 保存裝置層暫時身分。每個 room 的值互相隔離，而且只有仍存在於旅程 `members` 的成員才能保存或讀取。localStorage 不可用時所有操作安全失敗，不會 throw，也不會把此身分同步至 Firebase。

若新 key 尚不存在，可以相容讀取 `travel-checklist-actor-${roomId}`；fallback 成員仍有效時可寫入新的 active-member key。已移除的成員不會被沿用。

這只是裝置層暫時身分，不是登入、成員授權或資料存取證明。未來應由 Firebase Auth UID 與旅程 member binding 取代，Firebase Security Rules 也只能信任經驗證的 UID 關係。

## Persistence service 與 actions

Phase 7A-3A 新增獨立 `ticketsService` 與 `useTicketActions`；Phase 7A-3B 已由 `TripDetail` 正式接入。Database 仍寫入既有 `rooms/{roomId}` 路徑下的 `tickets` array，不新增 schema path，也不自動 migration 舊資料。

新附件使用版本化路徑：

```text
rooms/{roomId}/tickets/{ticketId}/{revision}_{safeFileName}
```

每次上傳使用新的 revision，避免相同檔名 replacement 讓新舊 `storagePath` 相同。附件上傳限制維持 10 MiB，只接受 JPEG、PNG、WebP、GIF 與 PDF，預設 30 秒 timeout，並回報 0–100 progress。

儲存的交易順序固定為：先上傳新附件、再持久化 Database、成功後更新 raw local state，最後才清除舊附件。Database 失敗時會嘗試刪除剛上傳的新 object，且不動本地 state 或舊附件。Database 已成功但舊附件 cleanup 失敗時不回滾票券資料，sync 維持 saved，並顯示可稍後整理儲存空間的警告；這種情況可能暫時留下 orphan Storage object。

刪除票券也先寫 Database、更新本地 state，最後清除 Storage object。`storage/object-not-found` 視為已完成清理。所有 Storage `remove` 都只是 Service／Action 層意圖，Modal 本身不接觸 Firebase。

`TicketEditorModal` 的 `onSubmit` 現在支援 Promise。pending 期間鎖定 submit、cancel 與 Escape，reject 時保留表單並透過 aria-live 顯示 submission error；可選 `uploadProgress` 會以可存取的 progressbar 呈現。Modal 不自行關閉，成功後由父層 callback 控制。

## 正式票券夾整合

`TicketWalletSection` 由 `TripDetail` 正式 render，非目前 tab 時使用 `hidden` 保留篩選及卡片說明展開狀態。所有 raw Realtime tickets 只在顯示時正規化；未編輯的 legacy record 不會被改寫，只有使用者成功編輯的單張票券會保存 canonical record。

票券夾提供全部、共同與每位成員篩選。成員篩選同時包含該成員個人票券與所有共同票券，不會重複共同票券。裝置身分只控制「我的」標示、新票券預設 audience 與首次預設成員分頁；查看其他成員篩選不會變更裝置身分。身分失效時會清除 localStorage key 並在票券分頁內重新顯示非阻塞選擇區。

圖片附件沿用全螢幕票券 Modal；PDF、網頁與 Universal Link／App Link 使用由使用者點擊的安全 anchor。外部 App 沒有有效連結時只展開 manual mode 說明，不會自動導航、偵測 App 或計時跳轉。若 App link 與 fallback 不同，才顯示備用網頁；訂單編號只在使用者點擊後複製，Clipboard API 不可用時採用立即移除的 textarea fallback。

卡片會呈現日期、時間、使用成員、主要出示人、建議提前時間及外部 App 的登入／網路／動態條碼提示。這些提示不代表系統通知，也不會要求 Notification 權限。

## Phase 7A-4 Emulator E2E

Firebase Emulator E2E 覆蓋三種票券來源 CRUD、App Link／fallback／manual mode、成員與共同票券篩選、裝置身分、Realtime 多 Context、legacy read compatibility，以及附件 keep／replace／remove 與 cleanup failure。自動化測試只使用 Emulator，不會跟隨第三方票券連結，也不會要求 Notification 權限或偵測 App 是否安裝。

## 尚待真實裝置人工 QA

以下項目需要真實裝置與已安裝／未安裝的第三方 App 才能確認；Emulator E2E 通過不代表這些項目已通過。

### iPhone Safari

- Universal Link 由使用者點擊後的實際行為。
- 未安裝 App 時是否正確落到網頁。
- 動態票券提示。
- Clipboard。
- Editor safe-area。

### iPhone 主畫面 PWA

- 外部連結跳轉。
- 返回 Travel App。
- Modal 捲動。
- 安全區域。

### Android Chrome

- Android App Link。
- 未安裝 App fallback。
- 返回鍵行為。
- Clipboard。

第一版仍不建立示範旅程、首次導覽、custom scheme、Notification API 或 production deploy。
