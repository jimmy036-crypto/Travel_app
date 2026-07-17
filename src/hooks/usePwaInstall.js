import { useCallback, useSyncExternalStore } from 'react';

import {
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from '../pwaInstallController.js';

let cachedSnapshot = null;

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  return (
    a.initialized === b.initialized
    && a.isInstalled === b.isInstalled
    && a.isStandalone === b.isStandalone
    && a.nativePromptAvailable === b.nativePromptAvailable
    && a.isPrompting === b.isPrompting
    && a.platform === b.platform
    && a.browser === b.browser
  );
}

function getCachedPwaInstallSnapshot() {
  const nextSnapshot = getPwaInstallSnapshot();
  if (snapshotsEqual(cachedSnapshot, nextSnapshot)) {
    return cachedSnapshot;
  }

  cachedSnapshot = nextSnapshot;
  return cachedSnapshot;
}

export function usePwaInstall() {
  const snapshot = useSyncExternalStore(
    subscribePwaInstall,
    getCachedPwaInstallSnapshot,
    getCachedPwaInstallSnapshot,
  );
  const requestInstall = useCallback(() => requestPwaInstall(), []);

  return {
    ...snapshot,
    requestInstall,
  };
}
