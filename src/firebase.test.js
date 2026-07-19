import { beforeEach, describe, expect, it, vi } from 'vitest';

const firebaseAppMocks = vi.hoisted(() => ({
  initializeApp: vi.fn(() => ({ name: 'test-app' })),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({ name: 'existing-app' })),
}));

const firebaseAuthMocks = vi.hoisted(() => ({
  getAuth: vi.fn((app) => ({ service: 'auth', app })),
  connectAuthEmulator: vi.fn(),
}));

const firebaseDatabaseMocks = vi.hoisted(() => ({
  getDatabase: vi.fn((app) => ({ service: 'database', app })),
  connectDatabaseEmulator: vi.fn(),
}));

const firebaseStorageMocks = vi.hoisted(() => ({
  getStorage: vi.fn((app) => ({ service: 'storage', app })),
  connectStorageEmulator: vi.fn(),
}));

vi.mock('firebase/app', () => firebaseAppMocks);
vi.mock('firebase/auth', () => firebaseAuthMocks);
vi.mock('firebase/database', () => firebaseDatabaseMocks);
vi.mock('firebase/storage', () => firebaseStorageMocks);

const completeEnv = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-travel-e2e.firebaseapp.com',
  VITE_FIREBASE_DATABASE_URL:
    'https://demo-travel-e2e-default-rtdb.firebaseio.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-travel-e2e',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-travel-e2e.appspot.com',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  VITE_FIREBASE_APP_ID: '1:000000000000:web:e2e',
};

function stubFirebaseEnv(overrides = {}) {
  Object.entries({
    ...completeEnv,
    VITE_USE_FIREBASE_EMULATOR: 'false',
    ...overrides,
  }).forEach(([key, value]) => {
    vi.stubEnv(key, value);
  });
}

async function importFirebaseModule() {
  return await import('./firebase.js');
}

describe('firebase auth emulator foundation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, '__TRAVEL_FIREBASE_EMULATORS_CONNECTED__');
  });

  it('FIREBASE-AUTH-01 creates auth, db, and storage when config is complete', async () => {
    stubFirebaseEnv();

    const firebaseModule = await importFirebaseModule();

    expect(firebaseModule.auth).toMatchObject({ service: 'auth' });
    expect(firebaseModule.db).toMatchObject({ service: 'database' });
    expect(firebaseModule.storage).toMatchObject({ service: 'storage' });
    expect(firebaseAppMocks.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'test-api-key',
        projectId: 'demo-travel-e2e',
      }),
    );
    expect(firebaseAuthMocks.getAuth).toHaveBeenCalledTimes(1);
    expect(firebaseDatabaseMocks.getDatabase).toHaveBeenCalledTimes(1);
    expect(firebaseStorageMocks.getStorage).toHaveBeenCalledTimes(1);
  });

  it('FIREBASE-AUTH-02 connects all Firebase emulators in emulator mode', async () => {
    stubFirebaseEnv({ VITE_USE_FIREBASE_EMULATOR: 'true' });

    await importFirebaseModule();

    expect(firebaseAuthMocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(firebaseAuthMocks.connectAuthEmulator).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'auth' }),
      'http://127.0.0.1:9099',
      {
        disableWarnings: true,
      },
    );
    expect(firebaseDatabaseMocks.connectDatabaseEmulator).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'database' }),
      '127.0.0.1',
      9000,
    );
    expect(firebaseStorageMocks.connectStorageEmulator).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'storage' }),
      '127.0.0.1',
      9199,
    );
  });

  it('FIREBASE-AUTH-03 does not connect emulators in production mode', async () => {
    stubFirebaseEnv({ VITE_USE_FIREBASE_EMULATOR: 'false' });

    await importFirebaseModule();

    expect(firebaseAuthMocks.connectAuthEmulator).not.toHaveBeenCalled();
    expect(firebaseDatabaseMocks.connectDatabaseEmulator).not.toHaveBeenCalled();
    expect(firebaseStorageMocks.connectStorageEmulator).not.toHaveBeenCalled();
  });

  it('FIREBASE-AUTH-04 returns null services when required config is incomplete', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFirebaseEnv({ VITE_FIREBASE_API_KEY: '' });

    const firebaseModule = await importFirebaseModule();

    expect(firebaseModule.auth).toBeNull();
    expect(firebaseModule.db).toBeNull();
    expect(firebaseModule.storage).toBeNull();
    expect(firebaseAppMocks.initializeApp).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      'Firebase config is incomplete.',
      expect.objectContaining({
        missingConfigKeys: expect.arrayContaining(['apiKey']),
      }),
    );

    warnSpy.mockRestore();
  });

  it('FIREBASE-AUTH-05 handles initialization exceptions without throwing to consumers', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    firebaseAuthMocks.getAuth.mockImplementationOnce(() => {
      throw new Error('auth init failed');
    });
    stubFirebaseEnv();

    const firebaseModule = await importFirebaseModule();

    expect(firebaseModule.auth).toBeNull();
    expect(firebaseModule.db).toBeNull();
    expect(firebaseModule.storage).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      'Firebase initialization failed.',
      expect.objectContaining({ message: 'auth init failed' }),
    );

    warnSpy.mockRestore();
  });

  it('FIREBASE-AUTH-06 does not reconnect emulators during repeated module evaluation', async () => {
    stubFirebaseEnv({ VITE_USE_FIREBASE_EMULATOR: 'true' });

    await importFirebaseModule();
    vi.resetModules();
    await importFirebaseModule();

    expect(firebaseAuthMocks.connectAuthEmulator).toHaveBeenCalledTimes(1);
    expect(firebaseDatabaseMocks.connectDatabaseEmulator).toHaveBeenCalledTimes(1);
    expect(firebaseStorageMocks.connectStorageEmulator).toHaveBeenCalledTimes(1);
  });
});
