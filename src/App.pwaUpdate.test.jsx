import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CURRENT_RELEASE_SEEN_KEY } from './config/releaseNotes.js';
import { GlobalModalProvider } from './components/ui/GlobalModalProvider.jsx';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import {
  resetPwaUpdateControllerForTest,
  setPwaUpdateRegistration,
} from './pwaUpdateController.js';

vi.mock('./firebase', () => ({
  db: { app: 'mock-db' },
  storage: null,
}));

vi.mock('firebase/database', () => ({
  ref: vi.fn((_db, path) => ({ path })),
  get: vi.fn(async () => ({ val: () => null })),
  set: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
  onValue: vi.fn(() => vi.fn()),
}));

function renderApp(children) {
  return render(
    <GlobalModalProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </GlobalModalProvider>,
  );
}

async function openSettingsAndCheckUpdates(user) {
  await user.click(screen.getByTestId('app-settings-trigger'));
  await user.click(screen.getByTestId('app-settings-check-updates'));
}

describe('TravelApp manual PWA update checks', () => {
  beforeEach(() => {
    resetPwaUpdateControllerForTest();
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(CURRENT_RELEASE_SEEN_KEY, 'true');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPwaUpdateControllerForTest();
  });

  it('shows an up-to-date toast when no waiting worker is found', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    });
    setPwaUpdateRegistration({
      registration: {
        waiting: null,
        update: vi.fn(async () => undefined),
      },
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });
    const { default: App } = await import('./App.jsx');

    renderApp(<App />);
    await openSettingsAndCheckUpdates(user);

    await expect(screen.findByText('已是最新版本')).resolves.toBeInTheDocument();
  });

  it('shows an error toast when the manual update check fails', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network failed'));
    setPwaUpdateRegistration({
      registration: {
        waiting: null,
        update: vi.fn(async () => undefined),
      },
      swUrl: '/sw.js',
      updateSW: vi.fn(),
    });
    const { default: App } = await import('./App.jsx');

    renderApp(<App />);
    await openSettingsAndCheckUpdates(user);

    await waitFor(() => {
      expect(screen.getByText('無法檢查更新')).toBeInTheDocument();
    });
  });
});
