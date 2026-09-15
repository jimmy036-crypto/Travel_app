# T5B 效能基準

## 結論

本輪完成 production build + localhost preview + Firebase Emulator 的可重現基準，沒有找到在本任務範圍內、值得以產品程式變更處理的局部瓶頸。因此沒有修改 `src/`。

較大旅程會增加行程開啟與地圖／行程切換時間，但在本輪的無 CPU／網路限速 Chromium 環境中，沒有觀察到 long task；票券、記帳、預算、圖表與表單的中位互動時間維持在約 39–129 ms。把目前 807 kB 的入口 chunk 或 617 kB 的 `TripDetail` chunk 拆分，需重新檢視既有「保留已掛載頁籤以維持草稿、篩選、選定日期與捲動」的產品契約，超出本輪最多 1–2 個局部優化的邊界，列為後續專案而非投機修改。

## 安全與環境

- 基準 commit：`b187d0a5730136478369d933f89f245f808f0df1`。
- build：`vite build`，建置時只注入既有的公開 `demo-travel-e2e` Emulator 設定；沒有讀取 `.env.local`、連線正式 Firebase、使用真實帳號或部署。
- preview：`http://127.0.0.1:4175`；量測腳本拒絕非 localhost URL。
- Emulator：Auth、Realtime Database、Firestore、Functions、Storage 均為 `demo-travel-e2e` 本機服務。RTDB namespace 明確為 `demo-travel-e2e-default-rtdb`。
- Node：`v22.22.0`；Chromium：`149.0.7827.55`；Windows；viewport：390×844。
- Service Worker：在獨立 browser context 中封鎖，以隔離 PWA cache；CPU 與網路未限速。因此數值不是實體 iPhone、Safari 或行動網路的效能結論。
- production build 產物：入口 JS 807.05 kB（gzip 245.05 kB）、lazy `TripDetail` 617.38 kB（gzip 174.35 kB）、CSS 125.25 kB（gzip 19.04 kB）；這是 Vite 產物估計，並非瀏覽器實際傳輸量。

## 資料與量測定義

| 資料組 | 天數／景點 | 旅伴 | 票券 | 支出 |
| --- | --- | ---: | ---: | ---: |
| 一般 | 5 天／25 個 | 6 | 12 | 40 |
| 較大 | 14 天／140 個 | 10 | 60 | 300 |

- 每組採 1 次暖身、5 個正式樣本；原始數值保存在可審查的 [T5B_PERFORMANCE_BASELINE_RESULTS.json](T5B_PERFORMANCE_BASELINE_RESULTS.json)。5 個樣本只報中位數與範圍，不宣稱 p95／p99。
- 冷：每個樣本使用新的 incognito browser context。暖：同一 context 先暖身一次，再以相同 session/cache 條件取得 5 個樣本。
- `lobbyReadyMs`：新頁面載入至 Emulator 身份「E2E Owner」可見；只表示帳號／外框 ready，不表示完整旅程資料已可讀。
- `roomOpenMs`：已完成身份初始化的大廳，導向指定旅程至 `active-trip-view` 可見；首次旅伴確認沒有列為卡頓時間。
- 互動時間：從真實 click 到指定畫面已可見／狀態已變更的 `performance.now()` 差；不是 INP，也不是純 React render 時間。
- `longTasks` 以 Performance Timeline 可用項目記錄；目前為 0，但不把瀏覽器不支援的指標誤記為 0。

## 結果（中位數 ms，範圍）

| 操作 | 一般冷 | 一般暖 | 較大冷 | 較大暖 |
| --- | ---: | ---: | ---: | ---: |
| 大廳身份／外框 ready | 106.6（104.5–170.7） | 141.8（103.0–152.0） | 132.7（100.0–164.9） | 142.2（119.4–146.2） |
| 開啟旅程核心畫面 | 736.1（672.6–745.1） | 699.3（689.4–728.0） | 702.5（666.2–765.9） | 699.4（694.7–728.2） |
| 切換地圖 | 40.9（38.0–41.6） | 40.0（38.2–40.8） | 75.4（66.7–89.3） | 90.2（77.1–91.2） |
| 返回行程 | 47.9（40.9–63.9） | 48.3（43.1–64.0） | 59.7（51.1–64.2） | 49.1（48.7–61.1） |
| 切換日期 | 41.6（39.9–56.5） | 40.2（37.0–42.1） | 52.7（50.3–64.5） | 55.9（53.1–61.7） |
| 切換票券 | 44.6（42.6–52.7） | 44.3（42.4–48.3） | 63.2（46.5–65.8） | 49.6（48.8–64.0） |
| 切換記帳 | 66.2（61.7–67.3） | 53.2（51.6–64.9） | 80.8（79.8–85.3） | 81.0（79.2–82.7） |
| 展開預算 | 42.1（28.3–43.2） | 41.6（40.4–43.6） | 39.2（36.5–42.9） | 39.5（37.8–40.4） |
| 收合預算 | 31.2（30.5–32.6） | 32.2（30.3–33.5） | 47.1（43.4–48.4） | 48.3（44.4–52.6） |
| 切換圓餅圖 | 40.7（39.6–43.2） | 40.1（39.0–41.1） | 53.0（40.1–58.7） | 47.8（41.0–55.9） |
| 開啟新增記帳 | 61.7（59.2–62.9） | 61.4（60.9–63.0） | 97.3（71.4–115.2） | 101.9（88.2–135.0） |

## 資料量與反覆使用

| 資料組 | 完成一次「地圖→行程→票券→記帳」10 次循環 | DOM 前→後 | 每循環 resource entries |
| --- | ---: | ---: | --- |
| 一般 | 141.7 ms（130.5–182.0） | 1124 → 1226 | 15、8、0、0、3、0、0、0、0、0 |
| 較大 | 223.9 ms（203.3–276.8） | 5982 → 5932 | 23、0、0、3、0、0、0、0、0、0 |

這項循環不會產生業務寫入。DOM 沒有隨 10 次操作單調增加；resource entries 在前幾次後歸零，沒有可重現的每輪持續請求模式。不過本輪沒有 heap snapshot、listener 計數或實體裝置記憶體追蹤，因此不以此宣稱已證明「沒有任何記憶體洩漏」。

## 瓶頸判斷與不修改理由

1. **大型 JS chunk：已記錄、未改。** Vite 對入口與 `TripDetail` 提出 500 kB 以上警告，是靜態訊號，不是使用者互動瓶頸證據。量測中入口／旅程開啟約 0.63–0.78 秒，較大資料未呈現顯著惡化；盲目 lazy load 反而可能延後首次可用內容，並破壞目前保留頁籤狀態的契約。
2. **較大資料的循環：已記錄、未改。** 較大資料循環中位數比一般資料高約 85.7 ms，但仍無 long task，且未定位到單一可安全 memoize 的衍生運算。對整個 `TripDetail` 或地圖做 memo／卸載會有 stale callback、遠端更新、篩選與草稿回歸風險，沒有足夠證據支持。
3. **記帳表單暖樣本變異：待追蹤、未改。** 較大旅程 warm 開啟新增記帳的範圍為 78.0–135.3 ms；5 個樣本不足以將變異歸因到特定元件，且未伴隨 long task。

## 可重現命令

在隔離 worktree 中，先以既有 npm script 啟動本機 Emulator，使用既有 Emulator 帳號 seed，並在已注入公開 demo 環境的情況下建置、啟動 preview：

```powershell
npm run emulators:e2e
node e2e/support/seed-auth-emulator.mjs
npm run build
npm run preview -- --host 127.0.0.1 --port 4175 --strictPort
$env:GIT_COMMIT = (git rev-parse HEAD)
node scripts/t5b-performance-baseline.mjs --base-url http://127.0.0.1:4175 --output .tmp/t5b-performance-baseline/results.json
```

建置時的 `VITE_*` 值必須是既有 `demo-travel-e2e` 公開 Emulator 設定，且在 build 前注入；preview 階段臨時設定不會改寫已編譯前端。

## 功能回歸與限制

- 本輪未改產品程式，因此沒有「前／後改善」百分比，也沒有因效能而放寬功能斷言。
- `scripts/t5b-performance-baseline.mjs` 僅寫入具固定 `t5b-` 前綴的本機 Emulator 合成旅程，拒絕非 localhost URL；不清除共用 Emulator 資料，也不接受外部目標。
- 此腳本以 Chromium 作診斷；不代表 Safari、iPhone、PWA cache、真實 Google Maps／Places、外部票券服務、慢網路或 CPU 限速。
- T5A 已在 PR #71 紀錄使用者的真機／VoiceOver／safe-area 人工驗收通過；本輪未修改相關 UI，未將該人工結果重複包裝為本輪測試。
