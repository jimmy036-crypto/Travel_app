import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true // 讓你在 npm run dev 也能測試 PWA
      },
      manifest: {
        name: '智の旅行',
        short_name: '智の旅行',
        description: '專屬旅遊行程與記帳神器',
        theme_color: '#0f172a', // 配合你的暗色系介面 (slate-900)
        background_color: '#020617', // App 啟動時的背景色 (slate-950)
        display: 'standalone', // 🌟 關鍵！這會隱藏瀏覽器的網址列
        orientation: 'portrait', // 鎖定直向顯示
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    allowedHosts: true,
    cors: true
  }
})