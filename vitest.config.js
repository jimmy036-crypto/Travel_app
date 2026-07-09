import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  test: {
    // 只允許執行正式 src 資料夾內的 Vitest 測試。
    include: [
      'src/**/*.{test,spec}.{js,jsx,ts,tsx}',
    ],

    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    globals: true,
    css: true,

    clearMocks: true,
    restoreMocks: true,

    exclude: [
      'node_modules/**',
      'dist/**',
      'dev-dist/**',
      'coverage/**',

      // Playwright 測試不能交給 Vitest 執行。
      'e2e/**',
      'test-results/**',
      'playwright-report/**',

      // 避免未來的診斷包與安裝備份被誤掃。
      'travel-e2e-debug-current/**',
      'react-root-fix-backup-*/**',
    ],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],

      include: [
        'src/helpers.js',
      ],
    },
  },
})