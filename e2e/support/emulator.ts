import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type FirebaseRc = {
  projects?: {
    default?: string;
  };
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

function getFirebaseProjectId(): string {
  const firebaseRcPath = resolve(process.cwd(), '.firebaserc');

  if (existsSync(firebaseRcPath)) {
    const firebaseRc = JSON.parse(
      readFileSync(firebaseRcPath, 'utf8'),
    ) as FirebaseRc;

    const projectId = firebaseRc.projects?.default;
    if (projectId) return projectId;
  }

  const env = {
    ...parseEnvFile('.env.local'),
    ...parseEnvFile('.env.emulator.local'),
  };

  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  if (projectId) return projectId;

  throw new Error(
    '無法從 .firebaserc 或環境檔讀取 Firebase project ID。',
  );
}

function getDatabaseNamespace(): string {
  const env = {
    ...parseEnvFile('.env.local'),
    ...parseEnvFile('.env.emulator.local'),
  };

  const databaseUrl = env.VITE_FIREBASE_DATABASE_URL;

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
  } = {},
): Promise<void> {
  const now = Date.now();

  await writeEmulatorData(`rooms/${roomId}`, {
    meta: {
      title: options.title || 'E2E 景點測試旅程',
      destination: '台北市',
      destLat: 25.033,
      destLng: 121.5654,
      startDate: options.startDate || '2026-09-20',
      endDate: options.endDate || '2026-09-22',
      members: ['自己'],
      memberBudgets: {
        自己: 10000,
      },
      transport: '汽車 🚗',
      themeColor: '#3b82f6',
      dayThemes: {},
      createdAt: now,
      updatedAt: now,
    },
    itinerary: {
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
    },
    expenses: [],
    settlements: [],
    tickets: [],
    checklist: {},
  });
}
