# Task

使用 Design System Starter 與 UI UX Pro Max 建立 Travel 的第一階段 UI/UX 基礎，優化大廳、旅程卡片與旅程主導覽。

## Prerequisites

- Routes API migration PR #47 已合併至 `main`。
- 不新增套件、不修改 Firebase、資料模型或部署設定。

## Scope

- 全站語意化色彩、圓角、陰影、焦點與動態偏好基礎。
- 共用 SVG icon 與 button primitives。
- 大廳資訊層級、旅程卡片鍵盤操作與主要動作。
- 手機底部導覽、桌機分頁、返回與日期導覽。
- 對應元件測試及 375px / 1440px 視覺驗證。

## Out of Scope

- 重做所有功能頁與所有既有彈窗。
- Firebase、Google Maps、路線計算、資料結構或 API 行為。
- 新增第三方 icon/font 套件。

## Acceptance Criteria

- 大廳與核心旅程導覽使用同一套視覺 tokens 與 SVG icon 語言。
- 主要互動目標至少 44px，鍵盤焦點清楚，旅程卡可由鍵盤開啟。
- 手機底部導覽正確處理 safe area，內容不被遮擋，選取狀態有文字與 `aria-current`。
- 桌機與手機在 375px、768px、1024px、1440px 不產生水平溢位。
- `prefers-reduced-motion` 時停用非必要轉場與動畫。
- 既有建立、匯入、開啟旅程及頁籤切換行為不變。

## Related Tests

- Unit/component: Button、Icon、TripCard、TripTabBar、MobileTripHeader、DesktopDayNavigator。
- E2E: 既有 lobby / mobile trip 核心流程。
- Manual QA: Chromium 375x812 與 1440x900、鍵盤操作、reduced motion。

## Commit

```text
feat: establish shared travel ui foundation
```
