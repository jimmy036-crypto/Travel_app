import React from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resetPwaUpdateControllerForTest,
} from '../pwaUpdateController.js';
import PWAUpdatePrompt from './PWAUpdatePrompt.jsx';

const pwaRegisterMock = vi.hoisted(() => ({
  callbacks: null,
  updateSW: vi.fn(async () => undefined),
}));

vi.mock('../pwaRegister.js', () => ({
  registerAppServiceWorker: vi.fn((callbacks) => {
    pwaRegisterMock.callbacks = callbacks;
    return pwaRegisterMock.updateSW;
  }),
}));

describe('PWAUpdatePrompt', () => {
  beforeEach(() => {
    resetPwaUpdateControllerForTest();
    pwaRegisterMock.callbacks = null;
    pwaRegisterMock.updateSW.mockClear();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetPwaUpdateControllerForTest();
  });

  it('shows the existing update prompt when a waiting worker is registered', async () => {
    render(<PWAUpdatePrompt />);

    expect(screen.queryByTestId('pwa-update-prompt')).not.toBeInTheDocument();

    await act(async () => {
      pwaRegisterMock.callbacks.onRegisteredSW('/sw.js', {
        waiting: {},
        update: vi.fn(async () => undefined),
      });
    });

    expect(screen.getByTestId('pwa-update-prompt')).toHaveTextContent('有新的 App 版本');
  });

  it('applies the waiting update when the user chooses immediate update', async () => {
    const user = userEvent.setup();
    render(<PWAUpdatePrompt />);

    await act(async () => {
      pwaRegisterMock.callbacks.onRegisteredSW('/sw.js', {
        waiting: {},
        update: vi.fn(async () => undefined),
      });
    });

    await user.click(screen.getByRole('button', { name: '立即更新' }));

    expect(pwaRegisterMock.updateSW).toHaveBeenCalledWith(true);
  });
});
