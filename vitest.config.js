import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  test: {
    // 提供 window、document、localStorage 等瀏覽器環境
    environment: 'jsdom',

    // 所有測試執行前載入
    setupFiles: './src/test/setup.js',

    // 測試中可以直接使用 describe、it、expect、vi
    globals: true,

    // 元件匯入 CSS 時仍能測試
    css: true,

    // 每個測試後清除 mock
    clearMocks: true,
    restoreMocks: true,

    // 避免將 Playwright 測試誤當成 Vitest
    exclude: [
      'node_modules/**',
      'dist/**',
      'e2e/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],

      // 初期先只統計 helpers
      include: [
        'src/helpers.js',
      ],
    },
  },
})