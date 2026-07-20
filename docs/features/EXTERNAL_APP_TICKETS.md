# External App Tickets

## 產品目的

Phase 7A-1 建立票券的共用 Domain 基礎，使旅程可以逐步支援附件、網頁票券與外部 App 票券，同時維持既有票券資料可讀。這一階段只提供資料正規化、開啟決策、audience 篩選、日期推導與裝置層成員身分，不建立 UI，也不寫回 Firebase。

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

## 下一階段 UI 計畫

後續 UI 階段預計整合票券 CRUD 表單、三種來源欄位、共同／個人成員分頁、出示人選擇、manual mode 說明、使用日期顯示，以及 Realtime Database／Storage 寫入與清理流程。該階段需補 Ticket CRUD、Realtime 與 Storage 的 Firebase Emulator E2E；本 Domain 階段不建立 UI 或示範旅程。
