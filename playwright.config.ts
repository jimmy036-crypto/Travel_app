import { defineConfig, devices } from '@playwright/test';

const e2eFirebaseEnv = {
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_API_KEY: 'emulator-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'travel-app-923ef.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL:
    'https://travel-app-923ef-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'travel-app-923ef',
  VITE_FIREBASE_STORAGE_BUCKET: 'travel-app-923ef.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
};

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

const firebaseEmulatorCommand = process.env.CI
  ? 'npx -y firebase-tools@15.22.4 emulators:start --only database,storage --project travel-app-923ef'
  : 'firebase emulators:start --only database,storage --project travel-app-923ef';

const e2eDevServerEnv = process.env.CI
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
      command: firebaseEmulatorCommand,
      url: 'http://127.0.0.1:4000',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:e2e',
      env: e2eDevServerEnv,
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});