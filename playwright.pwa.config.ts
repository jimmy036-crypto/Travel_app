import { defineConfig, devices } from '@playwright/test';

const isCI = Boolean(process.env.CI);

const pwaFirebaseEnv = {
  VITE_USE_FIREBASE_EMULATOR: 'false',
  VITE_FIREBASE_API_KEY: 'pwa-preview-dummy-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-travel-pwa.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL:
    'https://demo-travel-pwa-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-travel-pwa',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-travel-pwa.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:pwa-preview',
};

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa-install.spec.ts',

  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: 60_000,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: 'http://127.0.0.1:4175',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'PWA Desktop Chrome',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'PWA Mobile Safari',
      use: {
        ...devices['iPhone 13'],
      },
    },
  ],

  webServer: {
    name: 'Vite Production Preview',
    command:
      'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
    env: {
      ...inheritedEnv,
      ...pwaFirebaseEnv,
    },
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    stdout: isCI ? 'pipe' : 'ignore',
    stderr: 'pipe',
    timeout: 120_000,
  },
});
