import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type FirebaseRc = {
  projects?: {
    default?: string;
  };
};

type StorageObjectMetadata = {
  name: string;
  bucket?: string;
  contentType?: string;
  size?: string;
  generation?: string;
  metageneration?: string;
  timeCreated?: string;
  updated?: string;
  metadata?: Record<string, string>;
};

type StorageObjectListResponse = {
  items?: StorageObjectMetadata[];
  prefixes?: string[];
  nextPageToken?: string;
};

function parseEnvFile(fileName: string): Record<string, string> {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        const key = line.slice(0, separatorIndex).trim();
        const value = line
          .slice(separatorIndex + 1)
          .trim()
          .replace(/^['"]|['"]$/gu, '');
        return [key, value];
      }),
  );
}

const emulatorLocalEnv = parseEnvFile('.env.emulator.local');

function getEmulatorEnvValue(key: string): string | undefined {
  const value = process.env.CI
    ? process.env[key] ?? emulatorLocalEnv[key]
    : emulatorLocalEnv[key] ?? process.env[key];
  return value ? String(value) : undefined;
}

function getFirebaseProjectId(): string {
  const envProjectId = getEmulatorEnvValue('VITE_FIREBASE_PROJECT_ID');
  if (envProjectId) return envProjectId;

  const firebaseRcPath = resolve(process.cwd(), '.firebaserc');

  if (existsSync(firebaseRcPath)) {
    const firebaseRc = JSON.parse(
      readFileSync(firebaseRcPath, 'utf8'),
    ) as FirebaseRc;

    const projectId = firebaseRc.projects?.default;
    if (projectId) return projectId;
  }

  throw new Error(
    '無法從 .firebaserc 或環境檔讀取 Firebase project ID。',
  );
}

function getStorageBucket(): string {
  const storageBucket = getEmulatorEnvValue('VITE_FIREBASE_STORAGE_BUCKET');
  if (storageBucket) return storageBucket;

  return `${getFirebaseProjectId()}.appspot.com`;
}

function normalizeStoragePath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/^\/+|\/+$/gu, '');
}

function getStorageObjectsUrl(
  prefix = '',
  pageToken = '',
): string {
  const query = new URLSearchParams({ delimiter: '/' });
  const normalizedPrefix = normalizeStoragePath(prefix);

  // Firebase Web SDK 的 list() 會把資料夾 path 轉成 `path/`。
  // Storage Emulator 也依照這個格式解析 prefix。
  query.set('prefix', normalizedPrefix ? `${normalizedPrefix}/` : '');
  if (pageToken) query.set('pageToken', pageToken);

  return (
    `http://127.0.0.1:9199/v0/b/`
    + `${encodeURIComponent(getStorageBucket())}/o?${query.toString()}`
  );
}

function getStorageUploadUrl(path: string): string {
  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) throw new Error('Storage object path 不可為空。');

  const query = new URLSearchParams({ name: normalizedPath });
  return (
    `http://127.0.0.1:9199/v0/b/`
    + `${encodeURIComponent(getStorageBucket())}/o?${query.toString()}`
  );
}

function getStorageObjectUrl(path: string): string {
  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) throw new Error('Storage object path 不可為空。');

  return (
    `http://127.0.0.1:9199/v0/b/`
    + `${encodeURIComponent(getStorageBucket())}/o/`
    + encodeURIComponent(normalizedPath)
  );
}

function getDatabaseNamespace(): string {
  const databaseUrl = getEmulatorEnvValue('VITE_FIREBASE_DATABASE_URL');

  if (databaseUrl) {
    try {
      const host = new URL(databaseUrl).hostname;
      const namespace = host.split('.')[0];
      if (namespace) return namespace;
    } catch {
      // URL 格式異常時改用 project ID。
    }
  }

  return getFirebaseProjectId();
}

function normalizeDatabasePath(path: string): string {
  return String(path || '')
    .trim()
    .replace(/^\/+/u, '')
    .replace(/\/+$/u, '');
}

function getDatabaseRestUrl(path = ''): string {
  const normalizedPath = normalizeDatabasePath(path);
  const suffix = normalizedPath ? `/${normalizedPath}.json` : '/.json';

  return (
    `http://127.0.0.1:9000${suffix}` +
    `?ns=${encodeURIComponent(getDatabaseNamespace())}`
  );
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, milliseconds);
  });
}

async function requestStorage(
  url: string,
  init?: RequestInit,
  acceptedStatuses: number[] = [],
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    let response: Response;

    try {
      response = await fetch(url, init);
    } catch (error) {
      lastError = error;
      await wait(200);
      continue;
    }

    if (response.ok || acceptedStatuses.includes(response.status)) {
      return response;
    }

    const responseBody = (await response.text()).trim();
    const requestMethod = String(init?.method || 'GET').toUpperCase();
    const detail = responseBody ? `：${responseBody}` : '';
    lastError = new Error(
      `Storage Emulator 回傳 ${response.status} ${response.statusText}`
      + `${detail}\n${requestMethod} ${url}`,
    );

    // 400、401、403 等是固定請求錯誤，重試不會改善；
    // 408、429 與伺服器錯誤才保留短暫重試。
    const shouldRetry = response.status === 408
      || response.status === 429
      || response.status >= 500;

    if (!shouldRetry) throw lastError;
    await wait(200);
  }

  throw new Error(
    `Storage Emulator 請求失敗：${String(lastError)}`,
  );
}

async function requestDatabase(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(getDatabaseRestUrl(path), init);

      if (response.ok) return response;

      lastError = new Error(
        `Database Emulator 回傳 ${response.status} ${response.statusText}`,
      );
    } catch (error) {
      lastError = error;
    }

    await wait(200);
  }

  throw new Error(
    `無法連線 Database Emulator：${String(lastError)}`,
  );
}

export async function clearEmulatorDatabase(): Promise<void> {
  await requestDatabase('', {
    method: 'DELETE',
  });
}

export async function writeEmulatorData(
  path: string,
  value: unknown,
): Promise<void> {
  await requestDatabase(path, {
    method: 'PUT',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(value),
  });
}

export async function readEmulatorData<T>(
  path: string,
): Promise<T | null> {
  const response = await requestDatabase(path);
  return await response.json() as T | null;
}

export async function seedTestTrip(
  roomId: string,
  options: {
    title?: string;
    startDate?: string;
    endDate?: string;
    members?: string[];
    memberBudgets?: Record<string, number>;
    expenses?: unknown[];
    itinerary?: Record<string, unknown[]>;
  } = {},
): Promise<void> {
  const now = Date.now();
  const members = Array.isArray(options.members) && options.members.length > 0
    ? [...new Set(options.members.map(String).filter(Boolean))]
    : ['自己'];
  const memberBudgets = options.memberBudgets || Object.fromEntries(
    members.map((member) => [member, 10000]),
  );

  const defaultItinerary = {
    'Day 1': [
      {
        id: 'e2e-baseline-place',
        name: 'E2E 基準起點',
        place_id: 'e2e-baseline-place-id',
        customName: '',
        lat: 25.0324,
        lng: 121.5645,
        address: '台北市信義區',
        time: '09:00',
        stayTime: '30',
        memo: '用來確保 Day 1 在 Database Emulator 中存在',
        tags: [],
        nextLeg: {
          mode: 'AUTO',
          mins: 30,
        },
      },
    ],
  };

  const itinerary = options.itinerary
    && typeof options.itinerary === 'object'
    ? options.itinerary
    : defaultItinerary;

  await writeEmulatorData(`rooms/${roomId}`, {
    meta: {
      title: options.title || 'E2E 景點測試旅程',
      destination: '台北市',
      destLat: 25.033,
      destLng: 121.5654,
      startDate: options.startDate || '2026-09-20',
      endDate: options.endDate || '2026-09-22',
      members,
      memberBudgets,
      transport: '汽車 🚗',
      themeColor: '#3b82f6',
      dayThemes: {},
      createdAt: now,
      updatedAt: now,
    },
    itinerary,
    expenses: Array.isArray(options.expenses) ? options.expenses : [],
    settlements: [],
    tickets: [],
    checklist: {},
  });
}

export async function uploadEmulatorStorageObject(
  path: string,
  contents: string | Uint8Array,
  contentType = 'application/octet-stream',
): Promise<StorageObjectMetadata> {
  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) throw new Error('Storage object path 不可為空。');

  const boundary = (
    `phase-4-storage-${Date.now()}-`
    + Math.random().toString(16).slice(2)
  );
  const metadata = JSON.stringify({
    name: normalizedPath,
    contentType,
  });
  const prefix = Buffer.from(
    `--${boundary}\r\n`
    + 'Content-Type: application/json; charset=utf-8\r\n\r\n'
    + `${metadata}\r\n`
    + `--${boundary}\r\n`
    + `Content-Type: ${contentType}\r\n\r\n`,
  );
  const data = Buffer.from(contents);
  const suffix = Buffer.from(`\r\n--${boundary}--`);

  const response = await requestStorage(
    getStorageUploadUrl(normalizedPath),
    {
      method: 'POST',
      headers: {
        'content-type': `multipart/related; boundary=${boundary}`,
        'x-goog-upload-protocol': 'multipart',
      },
      body: Buffer.concat([prefix, data, suffix]),
    },
  );

  return await response.json() as StorageObjectMetadata;
}

export async function listEmulatorStorageObjects(
  prefix = '',
): Promise<StorageObjectMetadata[]> {
  const objects: StorageObjectMetadata[] = [];
  const pendingPrefixes = [normalizeStoragePath(prefix)];
  const visitedPrefixes = new Set<string>();

  while (pendingPrefixes.length > 0) {
    const currentPrefix = pendingPrefixes.shift() || '';
    if (visitedPrefixes.has(currentPrefix)) continue;
    visitedPrefixes.add(currentPrefix);

    let pageToken = '';
    do {
      const response = await requestStorage(
        getStorageObjectsUrl(currentPrefix, pageToken),
      );
      const payload = await response.json() as StorageObjectListResponse;

      if (Array.isArray(payload.items)) objects.push(...payload.items);

      for (const childPrefix of payload.prefixes || []) {
        const normalizedChildPrefix = normalizeStoragePath(childPrefix);
        if (!visitedPrefixes.has(normalizedChildPrefix)) {
          pendingPrefixes.push(normalizedChildPrefix);
        }
      }

      pageToken = String(payload.nextPageToken || '');
    } while (pageToken);
  }

  return objects;
}

export async function readEmulatorStorageObjectMetadata(
  path: string,
): Promise<StorageObjectMetadata | null> {
  const response = await requestStorage(
    getStorageObjectUrl(path),
    undefined,
    [404],
  );

  if (response.status === 404) return null;
  return await response.json() as StorageObjectMetadata;
}

export async function storageObjectExists(
  path: string,
): Promise<boolean> {
  return (await readEmulatorStorageObjectMetadata(path)) !== null;
}

export async function deleteEmulatorStorageObject(
  path: string,
): Promise<void> {
  const response = await requestStorage(
    getStorageObjectUrl(path),
    { method: 'DELETE' },
    [404],
  );

  if (response.status !== 404 && !response.ok) {
    throw new Error(`刪除 Storage object 失敗：${path}`);
  }
}

export async function clearEmulatorStorage(
  prefix = '',
): Promise<void> {
  const objects = await listEmulatorStorageObjects(prefix);

  for (const object of objects) {
    await deleteEmulatorStorageObject(object.name);
  }
}
