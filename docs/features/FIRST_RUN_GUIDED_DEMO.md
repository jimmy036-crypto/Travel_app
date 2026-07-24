# First-run Guided Demo Foundation

## 產品目的

Local Guided Demo 讓尚未建立旅程的使用者先理解 Travel App 的行程、多人協作、票券、記帳、清單與離線／PWA 概念。第一階段只提供本機內建資料與唯讀展示元件，尚未接入 Lobby、Settings、路由或正式 App UI。

示範內容是東京三日的虛構範例，包含三位示範成員、十一個行程項目、三種 audience 的票券、四筆費用與六個 checklist item。所有內容都標示為示範或範例，不是即時旅遊、營業、交通、價格或匯率建議。

## 為何不自動建立 Firebase 旅程

預覽示範不等於使用者同意建立或同步資料。若自動建立 room，會污染使用者的旅程清單、產生不必要的雲端資料，也可能讓使用者誤以為範例已成為正式行程。因此本階段遵守以下邊界：

- 不建立 Firebase room，也不發出 Database 或 Storage 請求。
- 不寫入 `google-travel-my-trips`。
- 不寫入 Offline Trip Cache。
- 不讀寫 localStorage，不修改 URL。
- 不自動建立旅程，也不自動複製範例。
- 不操作 production Firebase，不修改 Firebase rules。

`DemoTripPreview` 只展示傳入資料並呼叫明確的 `onBack`、`onCreateTrip`、`onCloneDemo` callback。真正的 persistence 決策必須留給未來 App integration，而且在建立真實旅程前必須再次取得使用者確認。

## 本機內建、唯讀且不會同步

`createTokyoDemoTrip()` 建立的根 view model 使用固定識別資訊：

```js
{
  roomId: 'demo-getting-started',
  isDemo: true,
  readOnly: true,
  source: 'built-in',
  version: 1,
  meta,
  itinerary,
  tickets,
  expenses,
  checklist,
  guidance,
}
```

`roomId` 是 built-in demo identity，不是 Firebase room ID。`isBuiltInDemoTrip()` 同時驗證 ID、唯讀、來源與版本 marker，避免只靠可偽造的 `isDemo` flag 判斷。

資料工廠不讀 localStorage、URL、Firebase 或 Offline Cache。日期運算使用本地 calendar date，不用 `toISOString().slice(0, 10)`，並可注入 `startDate` 與 `now` 以進行確定性測試。每次呼叫都產生獨立物件，不共享可變資料。

## 東京三日內容範圍

- Day 1：抵達東京、飯店寄放行李、淺草寺、東京晴空塔。
- Day 2：明治神宮、原宿、澀谷、東京鐵塔夜景。
- Day 3：築地場外市場、銀座、機場返程。

景點只有靜態展示資訊，不載入 Google Maps、不呼叫 Places API、天氣 API 或路線服務。時間與地址皆是行程排版範例，不宣稱精確營業時間或即時交通狀態。

## Demo data 與 Firebase schema 邊界

Demo 根物件是明確的 built-in view model，不可直接視為 `rooms/{roomId}` 的 Firebase record。內部展示資料盡量沿用已確認的正式欄位，讓 Preview 呈現與現有產品概念一致：

- `meta`：沿用 title、destination、座標、日期、members、memberBudgets、transport、themeColor、dayThemes。
- `itinerary`：沿用 `Day N` array branch 與 place 的 id、name、time、address、memo、tags、nextLeg；額外展示用的 `notes`、`category`、`dayId` 只存在 built-in data。
- `tickets`：每張都經現有 `normalizeTicket()` 建立 canonical ticket，沒有 attachment 或 Storage URL。
- `expenses`：沿用 id、dayId、item、cost、localCost、currency、exchangeRate、category、payer、split、note 與 timestamps。
- `checklist`：沿用已確認的 id、text、scope、owner、assignee、category、important、completed 與 timestamps，沒有創造新的 Firebase checklist branch。
- `guidance`：是 demo-only metadata，只描述未來章節與 Preview `data-testid` target，不屬於 Firebase canonical schema。

本階段沒有 migration、schema write 或 persistence adapter。未來若要複製範例，必須由專門的轉換流程挑選 canonical fields、產生新的正式 ID，並在寫入前再次要求使用者確認。

## 安全的示範內容

- 不使用真實姓名、訂位資訊、票券條碼、聯絡資料或付款資料。
- 訂單編號皆以 `DEMO-` 開頭。
- 唯一網址是安全的 `https://example.com/demo-ticket` 功能範例。
- 不包含 Firebase Storage URL、追蹤參數、密碼、token、cookie、驗證碼或解碼後的動態 QR 內容。
- Demo Preview 的票券操作使用 `button`，不使用 anchor、不導航、不開啟第三方網站，也不寫 Clipboard。
- external-app ticket 使用 manual mode；網路、登入、動態條碼只作為提醒概念。
- 費用使用 TWD 靜態示範值，不宣稱東京目前價格，也不提供即時匯率承諾。

## Demo Preview

公開 props：

```js
{
  demo,
  t,
  initialTab,
  onBack,
  onCreateTrip,
  onCloneDemo,
}
```

Preview 提供總覽、行程、票券、記帳、清單五個分頁。分頁與日期切換只存在 React component state；checkbox 為 disabled，避免看似已保存。頂部持續標示「示範模式」、「唯讀」、「不會同步」與「範例資料」。行動版使用可水平捲動的 tabs、safe-area padding、`min-h-dvh`、`overflow-y-auto` 與整頁 `overflow-x-hidden`。

元件不 import Firebase、Database、Storage 或 Offline Cache，也不接觸 localStorage、URL、地圖、第三方導航、Clipboard、`window.alert` 或 `window.confirm`。

## Guidance metadata

資料先定義以下未來章節，但本階段不啟動 Spotlight Tour、不操作 DOM，也不修改 `FeatureTour`：

- overview
- itinerary
- collaboration
- tickets
- expenses
- checklist
- offline-pwa

每個 `targetTestId` 都對應 `DemoTripPreview` 中實際存在的元素。下一階段整合時仍需決定章節順序、可見 target 與跨分頁切換協定。

## 未來整合方向

### 明確複製流程

「複製這份範例開始修改」目前只呼叫 `onCloneDemo(demo)`。未來流程必須先顯示清楚的確認內容，再建立新的 room 與正式 IDs；不得因開啟 Preview 或首次進入 App 就自動複製。

### 首次啟動 Welcome

Phase 7B-3 已加入僅對真正新使用者顯示的四步 Welcome；Lobby 與 Settings 的示範入口則由 Phase 7B-2 提供。判定、互斥與延後規則見下方 Phase 7B-3 章節。

### What's New 顯示順序

First-run Welcome 優先於 What's New；首次 onboarding session 不會連續彈出版本訊息，也不會把 release 標記為 seen。返回使用者仍保留原本的 What's New 行為。

### 導覽中心與 FeatureTour

`guidance.chapters` 可在未來導覽中心顯示進度，或驅動 Demo Preview 內的 chapter 導覽。若與 `FeatureTour` spotlight 整合，必須處理分頁 target 可見性、focus、mobile safe-area 與退出行為；本階段沒有修改 `FeatureTour` 或建立 spotlight。

## 本階段非目標

- 不接入正式 App UI、Lobby、Settings 或 routing。
- 不建立 Firebase room 或雲端資料。
- 不寫入 myTrips 或 Offline Trip Cache。
- First-run Welcome 只管理導覽狀態，不建立旅程或複製資料。
- 不修改 FeatureTour chapters。
- 不建立 production deploy。

## Phase 7B-2：Lobby 與 Settings 入口

本機示範已接入正式 App view，但仍維持唯讀與零 persistence：

- 沒有真實旅程時，Lobby 的既有「建立新旅程／匯入旅程」EmptyState 保持主要操作，旁邊顯示較低視覺權重的「先看看東京三日範例」卡片。
- 已有真實旅程時，Lobby 不混入假旅程卡片；示範入口只出現在設定選單，並與「功能導覽」及「更新內容」維持獨立操作。
- 設定選單沒有真實旅程時不顯示重複入口。

App 使用獨立的 `demoPreviewState`：

```js
{
  demo,
  initialTab,
}
```

正式 view priority 是 UX Foundation dev demo、DemoTripPreview、OfflineTripPreview、TripDetail、Lobby。當 Demo Preview 開啟時，不會在底下 mount Lobby、TripDetail、Offline Preview、FeatureTour、建立／編輯 Modal或 Whats New；關閉只會清除 `demoPreviewState`，不重新載入頁面、不改 URL，也不改變 release seen 或 feature-tour pending marker。

從 Demo Preview 點「建立我的第一個旅程」或「建立另一個旅程」只會關閉示範並開啟既有的空白建立 Modal。它不會預填東京資料、不會送出表單、不會建立 Firebase room，也不會複製 itinerary、tickets、expenses 或 checklist。

真正 Clone Flow 尚未實作，因此正式 App integration 傳入 `showCloneAction={false}`，完全不 render Clone CTA；元件本身仍保留 Phase 7B-1 的預設契約，供 Phase 7B-5 完成真正複製流程後明確重新啟用。

此整合仍然：

- 不把 demo 放進 `myTrips`，不寫 `google-travel-my-trips`。
- 不寫入或修改 Offline Trip Cache。
- 不建立或讀寫 Firebase demo room。
- First-run Welcome 與 onboarding seen key 由 Phase 7B-3 獨立處理。
- 不修改 FeatureTour chapters 或 spotlight controller。

Browser Back 的專用 demo history 行為尚未加入；目前開啟與關閉示範都不修改 URL，返回由 Preview 的「返回首頁」按鈕處理。若未來要讓 browser Back 關閉 Preview，必須先定義不產生 Firebase room query、且不干擾既有 TripDetail／Offline Preview history 的路由契約。

## Phase 7B-3：首次使用 Welcome

首次使用流程使用版本化 marker `travel-app-seen-onboarding-v1`，目前版本為 `1`，完成值為字串 `true`。所有 storage 操作都有失敗保護；即使瀏覽器拒絕寫入，本次 session 仍會完成使用者選擇並關閉 Welcome，不會反覆開啟。

「真正的新使用者」會在 App 寫入預設值前，以一次性 snapshot 判斷。非空 `google-travel-my-trips`、任何 release seen 紀錄、非預設外觀色、有效 Offline Trip Cache、active member 或 checklist actor 紀錄都代表已有使用歷史。僅存在內容為 `[]` 的 myTrips key，或外觀色仍為預設 `#d8b4e2`，不會被誤判為 returning user。

Welcome 共四步：

1. 歡迎與集中管理功能概覽。
2. 東京三日唯讀示範的資料邊界。
3. 建立正式旅程與旅伴協作。
4. 即時同步、唯讀離線預覽與支援瀏覽器的主畫面安裝提示。

Welcome 的優先順序高於 What's New，並與 FeatureTour、Demo Preview、Offline Preview、TripDetail、建立／匯入 Modal 互斥。首次 onboarding session 完成後不會立刻接著顯示 What's New，也不會把 current release 標記為 seen；下一次重新載入時，未讀 release 會恢復既有提示流程。

以 `?room=...` 直接進入共享旅程時，Welcome 只延後而不完成 onboarding：TripDetail 先正常載入，本 session 也不顯示 What's New，回到 Lobby 後才顯示 Welcome。

三種完成操作都先記錄 onboarding：查看東京示範只開啟本機 Demo Preview；建立我的第一個旅程只開啟既有空白建立 Modal；略過介紹則留在 Lobby。這些操作都不建立 Firebase room、不寫 Offline Cache、不複製東京資料，也不標記 release seen。

Guided Tour chapters、Clone Flow 與 Tour Center 仍未實作，且本階段沒有修改 FeatureTour chapters。
