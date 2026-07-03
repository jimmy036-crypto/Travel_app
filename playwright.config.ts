import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',

  // 目前所有測試共用同一套 Firebase Emulator，
  // 初期先循序執行，避免資料互相干擾。
  fullyParallel: false,
  workers: 1,

  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    // 使用 E2E 專屬連接埠，避免重用普通 npm run dev。
    baseURL: 'http://127.0.0.1:4174',

    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // 測試不使用舊 PWA Service Worker。
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],

  webServer: [
    {
      command:
        'firebase emulators:start --only database,storage',
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:e2e',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});