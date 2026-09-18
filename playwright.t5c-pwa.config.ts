import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// This task-only configuration deliberately has no URL input. It can run only
// against the local production preview and the demo Firebase Emulator project.
const previewUrl = 'http://127.0.0.1:4175';
const isCI = Boolean(process.env.CI);
const firebaseCliHome = resolve('.tmp/firebase-home-t5c-pwa');

const publicEmulatorEnv = {
  VITE_USE_FIREBASE_EMULATOR: 'true',
  VITE_FIREBASE_API_KEY: 'emulator-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-travel-e2e.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL: 'https://demo-travel-e2e-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-travel-e2e',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-travel-e2e.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
};

const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  ),
);

const firebaseCliEnv = {
  NO_UPDATE_NOTIFIER: '1',
  FIREBASE_CLI_SKIP_UPDATE_CHECK: 'true',
  APPDATA: resolve(firebaseCliHome, 'appdata'),
  HOME: firebaseCliHome,
  USERPROFILE: firebaseCliHome,
  XDG_CONFIG_HOME: resolve(firebaseCliHome, '.config'),
  DATABASE_URL: publicEmulatorEnv.VITE_FIREBASE_DATABASE_URL,
  STORAGE_BUCKET_URL: publicEmulatorEnv.VITE_FIREBASE_STORAGE_BUCKET,
};

export default defineConfig({
  testDir: './e2e',
  testMatch: 'pwa-install.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: previewUrl,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: {
      cookies: [],
      origins: [{
        origin: previewUrl,
        localStorage: [{
          name: 'travel-app-seen-release-2026.07-trip-management-redesign',
          value: 'true',
        }],
      }],
    },
  },
  projects: [
    { name: 'PWA Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'PWA Mobile Safari', use: { ...devices['iPhone 13'] } },
  ],
  webServer: [
    {
      name: 'Firebase Emulator',
      command: 'npm run emulators:e2e',
      env: { ...inheritedEnv, ...publicEmulatorEnv, ...firebaseCliEnv },
      url: 'http://127.0.0.1:5001/demo-travel-e2e/us-central1/createTrip',
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      name: 'Vite Production Preview',
      command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4175 --strictPort',
      env: { ...inheritedEnv, ...publicEmulatorEnv, TRAVEL_E2E_SKIP_LOCAL_ENV: 'true' },
      url: previewUrl,
      reuseExistingServer: false,
      stdout: isCI ? 'pipe' : 'ignore',
      stderr: 'pipe',
      timeout: 120_000,
    },
  ],
});
