import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const firebaseCliHome = resolve('.tmp/firebase-home');
const firebaseCliAppData = resolve(firebaseCliHome, 'appdata');
const firebaseCliConfigHome = resolve(firebaseCliHome, '.config');

mkdirSync(firebaseCliAppData, { recursive: true });
mkdirSync(firebaseCliConfigHome, { recursive: true });

const result = spawnSync('firebase', ['--version'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APPDATA: firebaseCliAppData,
    FIREBASE_CLI_SKIP_UPDATE_CHECK: 'true',
    HOME: firebaseCliHome,
    NO_UPDATE_NOTIFIER: '1',
    USERPROFILE: firebaseCliHome,
    XDG_CONFIG_HOME: firebaseCliConfigHome,
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

if (result.error) {
  console.error(`Failed to start Firebase CLI: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
