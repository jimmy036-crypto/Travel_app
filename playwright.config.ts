import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);
const firebaseCliHome = resolve('.tmp/firebase-home');

const firebaseCliEnv = {
  NO_UPDATE_NOTIFIER: '1',
  FIREBASE_CLI_SKIP_UPDATE_CHECK: 'true',
  APPDATA: resolve(firebaseCliHome, 'appdata'),
  HOME: firebaseCliHome,
  USERPROFILE: firebaseCliHome,
  XDG_CONFIG_HOME: resolve(firebaseCliHome, '.config'),
};

const e2eFirebaseEnv = {
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_API_KEY: 'emulator-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-travel-e2e.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL:
    'https://demo-travel-e2e-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-travel-e2e',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-travel-e2e.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
};

if (isCI) {
  // CI 測試與 helper 需要 Firebase Emulator 設定，
  // 但不可在全域覆寫 HOME，否則 Playwright 會改變瀏覽器快取位置。
  Object.assign(process.env, e2eFirebaseEnv);
}

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

const firebaseEmulatorCommand = 'npm run emulators:e2e';

// Firebase CLI 可以使用獨立 HOME，避免 update check 或 config
// 寫入 runner 的真實使用者目錄。
const firebaseEmulatorEnv = {
  ...inheritedEnv,
  ...firebaseCliEnv,
};

// Vite 與 Playwright 不應繼承 Firebase CLI 的假 HOME。
const e2eDevServerEnv = isCI
  ? {
      ...inheritedEnv,
      ...e2eFirebaseEnv,
    }
  : inheritedEnv;

export default defineConfig({
  testDir: './e2e',

  // All E2E tests share one Firebase Emulator instance.
  fullyParallel: false,
  workers: 1,

  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    // E2E uses the emulator-mode Vite dev server started below.
    baseURL: 'http://127.0.0.1:4174',

    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Keep PWA caching out of browser tests.
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
      name: 'Firebase Emulator',
      command: firebaseEmulatorCommand,
      env: firebaseEmulatorEnv,
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      name: 'Vite E2E',
      command: 'npm run dev:e2e',
      env: e2eDevServerEnv,
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      stdout: isCI ? 'pipe' : 'ignore',
      stderr: 'pipe',
      timeout: 120_000,
    },
  ],
});
