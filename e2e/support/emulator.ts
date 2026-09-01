import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

type FirestoreDocument = {
  fields?: Record<string, unknown>;
};

export const E2E_AUTH_UID = 'e2e-owner';
export const E2E_AUTH_DISPLAY_NAME = 'E2E Owner';
const EMULATOR_ADMIN_AUTH = 'owner';

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

const emulatorLocalEnv = process.env.CI || process.env.TRAVEL_E2E_SKIP_LOCAL_ENV === 'true'
  ? {}
  : parseEnvFile('.env.emulator.local');

function getEmulatorEnvValue(key: string): string | undefined {
  // playwright.config.ts 會將 E2E demo project 設定注入 process.env。
  // 明確的 runner 設定必須優先，避免本機 env 檔把 helper
  // 導向另一個 Firebase project namespace。
  const value = process.env[key] ?? emulatorLocalEnv[key];
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

function getDatabaseRestUrl(path = '', disableTriggers = false): string {
  const normalizedPath = normalizeDatabasePath(path);
  const suffix = normalizedPath ? `/${normalizedPath}.json` : '/.json';

  const query = new URLSearchParams({
    ns: getDatabaseNamespace(),
  });
  if (disableTriggers) query.set('disableTriggers', 'true');
  return `http://127.0.0.1:9000${suffix}?${query.toString()}`;
}

function getFirestoreDocumentsUrl(path = ''): string {
  const normalizedPath = normalizeDatabasePath(path);
  const encodedPath = normalizedPath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/');
  const suffix = encodedPath ? `/documents/${encodedPath}` : '/documents';
  return (
    `http://127.0.0.1:8080/v1/projects/`
    + `${encodeURIComponent(getFirebaseProjectId())}`
    + `/databases/(default)${suffix}`
  );
}

function getFirestoreClearUrl(): string {
  return (
    `http://127.0.0.1:8080/emulator/v1/projects/`
    + `${encodeURIComponent(getFirebaseProjectId())}`
    + '/databases/(default)/documents'
  );
}

function withAdminAuthorization(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set('authorization', `Bearer ${EMULATOR_ADMIN_AUTH}`);
  return { ...init, headers };
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
      response = await fetch(url, withAdminAuthorization(init));
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

async function requestFirestore(
  url: string,
  init?: RequestInit,
  acceptedStatuses: number[] = [],
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(url, withAdminAuthorization(init));
      if (response.ok || acceptedStatuses.includes(response.status)) {
        return response;
      }

      const responseBody = (await response.text()).trim();
      const detail = responseBody ? `：${responseBody}` : '';
      lastError = new Error(
        `Firestore Emulator 回傳 ${response.status} ${response.statusText}${detail}`,
      );

      const shouldRetry = response.status === 408
        || response.status === 429
        || response.status >= 500;
      if (!shouldRetry) break;
    } catch (error) {
      lastError = error;
    }

    await wait(200);
  }

  throw new Error(`無法連線 Firestore Emulator：${String(lastError)}`);
}

async function requestDatabase(
  path: string,
  init?: RequestInit,
  options: { disableTriggers?: boolean } = {},
): Promise<Response> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      const response = await fetch(
        getDatabaseRestUrl(path, options.disableTriggers === true),
        withAdminAuthorization(init),
      );

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
  // Firebase CLI uses this Emulator-only query flag for imports and resets.
  // It prevents cleanup from invoking syncTripMemberAccess and recreating
  // fail-closed tombstones after the next test has already started.
  await Promise.all([
    requestDatabase('', { method: 'DELETE' }, { disableTriggers: true }),
    requestFirestore(getFirestoreClearUrl(), { method: 'DELETE' }),
  ]);
}

export async function writeEmulatorFirestoreDocument(
  path: string,
  fields: FirestoreDocument['fields'],
): Promise<void> {
  await requestFirestore(getFirestoreDocumentsUrl(path), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
}

export async function readEmulatorFirestoreDocument(
  path: string,
): Promise<FirestoreDocument | null> {
  const response = await requestFirestore(
    getFirestoreDocumentsUrl(path),
    undefined,
    [404],
  );
  if (response.status === 404) return null;
  return await response.json() as FirestoreDocument;
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
    checklist?: Record<string, unknown>;
    tickets?: unknown[];
    settlements?: unknown[];
    destination?: string;
    transport?: string;
    themeColor?: string;
    ownerUid?: string;
    ownerDisplayName?: string;
  } = {},
): Promise<void> {
  const now = Date.now();
  const ownerUid = String(options.ownerUid || E2E_AUTH_UID);
  const ownerDisplayName = String(
    options.ownerDisplayName || (ownerUid === E2E_AUTH_UID
      ? E2E_AUTH_DISPLAY_NAME
      : 'E2E Invite Owner'),
  );
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
      destination: options.destination || '台北市',
      destLat: 25.033,
      destLng: 121.5654,
      startDate: options.startDate || '2026-09-20',
      endDate: options.endDate || '2026-09-22',
      members,
      memberBudgets,
      transport: options.transport || '汽車 🚗',
      themeColor: options.themeColor || '#3b82f6',
      dayThemes: {},
      createdAt: now,
      updatedAt: now,
      ownerUid,
    },
    itinerary,
    expenses: Array.isArray(options.expenses) ? options.expenses : [],
    settlements: Array.isArray(options.settlements) ? options.settlements : [],
    tickets: Array.isArray(options.tickets) ? options.tickets : [],
    checklist: options.checklist && typeof options.checklist === 'object'
      ? options.checklist
      : {},
  });

  // Seed the derived mirrors before the canonical member record. Writing
  // roomAccess starts syncTripMemberAccess asynchronously; putting it first
  // races the trigger's Firestore transaction against this direct ACL seed
  // and can exhaust the Emulator transaction lock during the full suite.
  await writeEmulatorData(`userTrips/${ownerUid}/${roomId}`, {
    role: 'owner',
    status: 'active',
    aclVersion: 1,
    updatedAt: now,
  });
  await writeEmulatorFirestoreDocument(
    `tripAccess/${roomId}/members/${ownerUid}`,
    {
      uid: { stringValue: ownerUid },
      role: { stringValue: 'owner' },
      status: { stringValue: 'active' },
      aclVersion: { integerValue: '1' },
      updatedAt: { timestampValue: new Date(now).toISOString() },
    },
  );
  await writeEmulatorData(`roomAccess/${roomId}`, {
    ownerUid,
    state: 'ready',
    createdAt: now,
    members: {
      [ownerUid]: {
        uid: ownerUid,
        displayName: ownerDisplayName,
        photoURL: `https://example.test/${encodeURIComponent(ownerUid)}.png`,
        role: 'owner',
        status: 'active',
        aclVersion: 1,
        joinedAt: now,
        updatedAt: now,
      },
    },
  });
}

export async function seedTestTripInvite(
  roomId: string,
  options: {
    token?: string;
    createdByUid?: string;
  } = {},
): Promise<string> {
  const token = String(options.token || 'e'.repeat(43));
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) {
    throw new Error('E2E invite token 必須是 43 個 base64url 字元。');
  }
  const createdByUid = String(options.createdByUid || 'e2e-invite-owner');
  const tokenHash = createHash('sha256').update(token, 'utf8').digest('hex');
  const createdAt = Date.now();

  await writeEmulatorData(`roomAccess/${roomId}/inviteVersion`, 1);
  await writeEmulatorData(`roomAccess/${roomId}/invite`, {
    token,
    tokenHash,
    active: true,
    version: 1,
    createdAt,
    createdByUid,
  });
  await writeEmulatorData(`tripInvites/${tokenHash}`, {
    roomId,
    role: 'editor',
    active: true,
    version: 1,
    createdAt,
    createdByUid,
  });
  return token;
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

export async function assertNoExampleCloudArtifacts(
  tripId = 'local-example-trip',
): Promise<void> {
  const room = await readEmulatorData(`rooms/${tripId}`);
  if (room !== null) {
    throw new Error(`Example trip unexpectedly created Emulator room: ${tripId}`);
  }

  const objects = await listEmulatorStorageObjects(`rooms/${tripId}`);
  if (objects.length > 0) {
    throw new Error(
      `Example trip unexpectedly created ${objects.length} Emulator Storage object(s).`,
    );
  }
}
