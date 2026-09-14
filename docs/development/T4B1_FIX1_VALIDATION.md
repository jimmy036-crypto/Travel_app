# T4B-1 FIX1 驗證紀錄

## 修改前盤點

- 已順暢：既有記帳新增、分帳計算、預算更新 callback、圖表與結算資料模型。
- 已重現缺口：六位旅伴時，個人預算明細在首屏先佔用大量垂直空間，視圖切換入口被推離；結算範圍使用半套 tab 語意。
- 明確 bug：未發現計算、付款人、分帳或結算結果錯誤。
- 待驗證：真實瀏覽器／CI 的多尺寸首屏與完整 E2E，需使用專案既有 Emulator。

## FIX1 變更

- 個人預算明細預設收合；新增原生按鈕，使用 `aria-expanded`／`aria-controls`，展開後保留原有六位旅伴資料與 `onUpdateBudget` 行為。
- 記帳總額 → 視圖切換 → 個人預算摘要的視覺順序固定，讓主要入口先出現。
- 圖表標題、說明、分類與結算範圍文字依 MASTER 提高至可讀尺寸；結算範圍改用完整 toggle button 語意（`aria-pressed`）。
- 新增六位旅伴首屏與鍵盤收合／展開回歸測試；不新增或修改任何業務寫入。

## 測試證據

- 相關 Vitest：5 files、71 tests passed。
- Playwright：待使用本地 Emulator 執行；若 runner 無法啟動，將記錄實際環境錯誤，不以測試檔存在代替通過。
- `npm run verify:fast`、`git diff --check`：提交前執行。

## 瀏覽器限制

本紀錄不包含真實票券或個資。尚未取得可公開分享的 before／after 截圖；390×844、320／375、768／1024／1440 與 200% 需在可啟動的本地瀏覽器／Emulator 中補驗。實體 iPhone Safari、軟鍵盤與 safe-area 仍待人工確認。
