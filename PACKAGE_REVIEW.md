# package.json 檢查

## 已修正：Vite 相依衝突

原始設定使用：

```text
vite 8.0.0-beta.13
@tailwindcss/vite 4.2.1
@vitejs/plugin-react 5.1.1
```

實際執行 `npm install` 會出現 `ERESOLVE`：目前這兩個 plugin 的 peer dependency 只接受 Vite 7 以下。本版已將 Vite 改為 `^7.3.6`，並移除重複的 `overrides.vite`。

使用修正版依賴後，已成功完成 Vite production build。

## 可能未使用的套件

本次提交的 App、TripDetail、UIComponents、helpers、firebase 與 hook 實際使用：

- react / react-dom
- firebase
- @vis.gl/react-google-maps
- @hello-pangea/dnd
- html2canvas-pro

下列套件沒有出現在本次提交的程式碼中；確認其他頁面也沒用到後才刪除：

- framer-motion
- leaflet
- react-leaflet

`@capacitor/core`、`@capacitor/ios` 與 `vite-plugin-pwa` 可能由未提交的 Capacitor/PWA 設定使用，因此本版沒有擅自移除。
