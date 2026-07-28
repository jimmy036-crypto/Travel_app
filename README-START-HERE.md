# 使用方式

先在 `travel-release-rc` 同步 PR #40 分支，確認沒有既有未知變更，再解壓縮任務包。

## 1. 先同步正確基底

```powershell
cd C:\Users\jimmy\PycharmProjects\travel-release-rc

git status --short
git switch fix/expense-settlement-theme-mobile-itinerary
git pull --ff-only origin fix/expense-settlement-theme-mobile-itinerary
git rev-parse HEAD
```

預期 head：

```text
231e6e3827388a9c41629ee1339106a301c8274a
```

若原本 `git status --short` 有你不認識的修改，停止，不要 reset、clean 或 stash。

## 2. 再解壓縮 ZIP

將 ZIP 內容解壓到：

```text
C:\Users\jimmy\PycharmProjects\travel-release-rc
```

解壓後應存在：

```text
CODEX_TASK_MOBILE_ITINERARY_MAP_REDESIGN.md
README-START-HERE.md
SHA256SUMS.txt
docs/references/mobile-itinerary-map-redesign/itinerary-reference.png
docs/references/mobile-itinerary-map-redesign/map-reference.png
```

這五個任務包檔案是預期的未追蹤內容，不代表異常。

不要解壓到：

```text
C:\Users\jimmy\PycharmProjects\travel
```

## 3. 啟動 Codex

```powershell
cd C:\Users\jimmy\PycharmProjects\travel-release-rc

codex --ask-for-approval never --sandbox workspace-write
```

在 Codex 中貼上：

```text
請以 UTF-8 讀取 CODEX_TASK_MOBILE_ITINERARY_MAP_REDESIGN.md，
先檢視其中指定的兩張 PNG 參考圖，
再嚴格依任務完成。任務包列出的五個未追蹤檔案是允許的；
除此之外若有未知變更就停止。不要修改 PR #40，不要合併或部署。
```
