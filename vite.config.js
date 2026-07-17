import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 新版下載完成後顯示提示，由使用者決定何時重新載入。
      // 避免正在填記帳、清單或行程時被強制刷新。
      registerType: 'prompt',

      // 由 PWAUpdatePrompt 統一註冊，避免重複註冊 Service Worker。
      injectRegister: false,

      // 開發模式不要啟用 Service Worker，避免 localhost 經常看到舊畫面。
      // 要測試 PWA 請使用：npm run build && npm run preview
      devOptions: {
        enabled: false
      },

      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        navigateFallback: '/index.html'
      },

      manifest: {
        id: '/',
        name: '智の旅行',
        short_name: '智の旅行',
        description: '專屬旅遊行程與記帳神器',
        lang: 'zh-TW',
        start_url: '/',
        scope: '/',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        orientation: 'portrait',
        categories: ['travel', 'productivity'],
        icons: [
          {
            src: '/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-maskable-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
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
