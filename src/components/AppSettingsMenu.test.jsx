import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppSettingsMenu } from './AppSettingsMenu.jsx';

const installMock = vi.hoisted(() => ({
  snapshot: null,
  requestInstall: vi.fn(),
}));

const toastMock = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../hooks/usePwaInstall.js', () => ({
  usePwaInstall: () => installMock.snapshot,
}));

vi.mock('./ui/useToast.js', () => ({
  useToast: () => toastMock,
}));

const theme = {
  cardBg: 'bg-white',
  cardBorder: 'border-slate-200',
  headerBg: 'bg-white',
  mainText: 'text-slate-950',
  subText: 'text-slate-500',
};

function setInstallSnapshot(overrides = {}) {
  installMock.requestInstall = vi.fn(async () => ({ status: 'dismissed' }));
  installMock.snapshot = {
    initialized: true,
    isInstalled: false,
    isStandalone: false,
    nativePromptAvailable: false,
    isPrompting: false,
    platform: 'desktop',
    browser: 'chromium',
    requestInstall: installMock.requestInstall,
    ...overrides,
  };
  if (overrides.requestInstall) {
    installMock.requestInstall = overrides.requestInstall;
    installMock.snapshot.requestInstall = overrides.requestInstall;
  }
}

function renderMenu(props = {}) {
  return render(
    <AppSettingsMenu
      t={theme}
      version="2026.07-test"
      onOpenAppearance={vi.fn()}
      onOpenReleaseNotes={vi.fn()}
      onStartFeatureTour={vi.fn()}
      onCheckUpdates={vi.fn()}
      {...props}
    />,
  );
}

async function openMenu(user) {
  await user.click(screen.getByTestId('app-settings-trigger'));
  return screen.getByTestId('app-settings-menu');
}

describe('AppSettingsMenu', () => {
  beforeEach(() => {
    setInstallSnapshot();
    toastMock.info.mockClear();
    toastMock.error.mockClear();
  });

  it('shows manual update check and release version actions', async () => {
    const user = userEvent.setup();
    const onCheckUpdates = vi.fn();

    renderMenu({ onCheckUpdates });

    await openMenu(user);

    expect(screen.getByTestId('app-settings-check-updates')).toHaveTextContent('檢查更新');
    expect(screen.getByTestId('app-settings-version')).toHaveTextContent('2026.07-test');

    await user.click(screen.getByTestId('app-settings-check-updates'));

    expect(onCheckUpdates).toHaveBeenCalledTimes(1);
  });

  it('MENU-INSTALL-01 shows install action when native prompt is available', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ nativePromptAvailable: true });

    renderMenu();
    await openMenu(user);

    expect(screen.getByTestId('app-settings-install-app')).toHaveTextContent('安裝 App');
  });

  it('MENU-INSTALL-02 calls requestInstall once from native install action', async () => {
    const user = userEvent.setup();
    const requestInstall = vi.fn(async () => ({ status: 'dismissed' }));
    setInstallSnapshot({ nativePromptAvailable: true, requestInstall });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    expect(requestInstall).toHaveBeenCalledTimes(1);
  });

  it('MENU-INSTALL-03 closes the settings menu after native install click', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ nativePromptAvailable: true });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    expect(screen.queryByTestId('app-settings-menu')).not.toBeInTheDocument();
  });

  it('MENU-INSTALL-04 shows accepted info toast', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({
      nativePromptAvailable: true,
      requestInstall: vi.fn(async () => ({ status: 'accepted' })),
    });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    await waitFor(() => {
      expect(toastMock.info).toHaveBeenCalledWith({
        title: '安裝要求已接受',
        description: '完成安裝後，即可從裝置主畫面或應用程式列表開啟。',
      });
    });
  });

  it('MENU-INSTALL-05 does not show error toast after dismissed prompt', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({
      nativePromptAvailable: true,
      requestInstall: vi.fn(async () => ({ status: 'dismissed' })),
    });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    await waitFor(() => {
      expect(installMock.snapshot.requestInstall).toHaveBeenCalledTimes(1);
    });
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it('MENU-INSTALL-06 shows error toast after failed prompt', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({
      nativePromptAvailable: true,
      requestInstall: vi.fn(async () => ({ status: 'failed', error: new Error('failed') })),
    });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith({
        title: '無法安裝 App',
        description: '請稍後再試，或使用瀏覽器的安裝選單。',
      });
    });
  });

  it('MENU-INSTALL-07 disables the install action while prompting', async () => {
    const user = userEvent.setup();
    const requestInstall = vi.fn(async () => ({ status: 'prompting' }));
    setInstallSnapshot({ nativePromptAvailable: true, isPrompting: true, requestInstall });

    renderMenu();
    await openMenu(user);
    const installButton = screen.getByTestId('app-settings-install-app');

    expect(installButton).toBeDisabled();
    expect(installButton).toHaveAttribute('aria-disabled', 'true');
    await user.click(installButton);
    expect(requestInstall).not.toHaveBeenCalled();
  });

  it('MENU-INSTALL-08 shows installed status and does not request install', async () => {
    const user = userEvent.setup();
    const requestInstall = vi.fn();
    setInstallSnapshot({ isInstalled: true, isStandalone: true, requestInstall });

    renderMenu();
    await openMenu(user);
    const status = screen.getByTestId('app-settings-install-status');

    expect(status).toHaveTextContent('App 已安裝');
    expect(status).toBeDisabled();
    expect(status).toHaveAttribute('aria-disabled', 'true');
    await user.click(status);
    expect(requestInstall).not.toHaveBeenCalled();
  });

  it('MENU-INSTALL-09 shows add to home screen for iOS Safari', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ platform: 'ios', browser: 'safari' });

    renderMenu();
    await openMenu(user);

    expect(screen.getByTestId('app-settings-install-app')).toHaveTextContent('加入主畫面');
  });

  it('MENU-INSTALL-10 opens instructions dialog from iOS action', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ platform: 'ios', browser: 'safari' });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    expect(screen.queryByTestId('app-settings-menu')).not.toBeInTheDocument();
    expect(screen.getByTestId('pwa-install-instructions')).toBeInTheDocument();
  });

  it('MENU-INSTALL-11 does not call requestInstall for iOS instructions', async () => {
    const user = userEvent.setup();
    const requestInstall = vi.fn();
    setInstallSnapshot({ platform: 'ios', browser: 'safari', requestInstall });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    expect(requestInstall).not.toHaveBeenCalled();
  });

  it('MENU-INSTALL-12 shows Safari reminder for non-Safari iOS browsers', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ platform: 'ios', browser: 'chromium' });

    renderMenu();
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));

    expect(screen.getByTestId('pwa-install-open-in-safari-note')).toHaveTextContent('請先使用 Safari 開啟此頁');
  });

  it('MENU-INSTALL-13 hides install entry for unsupported desktop browsers', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ platform: 'desktop', browser: 'other' });

    renderMenu();
    await openMenu(user);

    expect(screen.queryByTestId('app-settings-install-app')).not.toBeInTheDocument();
    expect(screen.queryByTestId('app-settings-install-status')).not.toBeInTheDocument();
  });

  it('MENU-INSTALL-14 does not request install on render or menu open', async () => {
    const user = userEvent.setup();
    const requestInstall = vi.fn();
    setInstallSnapshot({ nativePromptAvailable: true, requestInstall });

    renderMenu();
    expect(requestInstall).not.toHaveBeenCalled();

    await openMenu(user);
    expect(requestInstall).not.toHaveBeenCalled();
  });

  it('MENU-INSTALL-15 restores focus to trigger after closing instructions dialog', async () => {
    const user = userEvent.setup();
    setInstallSnapshot({ platform: 'ios', browser: 'safari' });

    renderMenu();
    const trigger = screen.getByTestId('app-settings-trigger');
    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));
    await user.click(screen.getByTestId('pwa-install-instructions-close'));

    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });

  it('MENU-INSTALL-16 keeps existing settings actions available', async () => {
    const user = userEvent.setup();
    const onOpenAppearance = vi.fn();
    const onOpenReleaseNotes = vi.fn();
    const onStartFeatureTour = vi.fn();
    const onCheckUpdates = vi.fn();

    renderMenu({
      onOpenAppearance,
      onOpenReleaseNotes,
      onStartFeatureTour,
      onCheckUpdates,
    });

    await openMenu(user);
    expect(screen.getByTestId('app-settings-appearance')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-release-notes')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-feature-tour')).toBeInTheDocument();
    expect(screen.getByTestId('app-settings-check-updates')).toBeInTheDocument();

    await user.click(screen.getByTestId('app-settings-appearance'));
    expect(onOpenAppearance).toHaveBeenCalledTimes(1);

    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-release-notes'));
    expect(onOpenReleaseNotes).toHaveBeenCalledTimes(1);

    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-feature-tour'));
    expect(onStartFeatureTour).toHaveBeenCalledTimes(1);

    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-check-updates'));
    expect(onCheckUpdates).toHaveBeenCalledTimes(1);
  });

  it('hides the demo entry when disabled or callback is missing', async () => {
    const user = userEvent.setup();
    const { unmount } = renderMenu({ showDemoEntry: false, onOpenDemo: vi.fn() });
    await openMenu(user);
    expect(screen.queryByTestId('app-settings-demo-trip')).not.toBeInTheDocument();
    unmount();

    renderMenu({ showDemoEntry: true, onOpenDemo: undefined });
    await openMenu(user);
    expect(screen.queryByTestId('app-settings-demo-trip')).not.toBeInTheDocument();
  });

  it('shows the demo entry, closes first, and calls its callback once', async () => {
    const user = userEvent.setup();
    const onOpenDemo = vi.fn();
    renderMenu({ showDemoEntry: true, onOpenDemo });
    await openMenu(user);
    const entry = screen.getByTestId('app-settings-demo-trip');
    expect(entry).toHaveTextContent('查看示範旅程');
    await user.click(entry);
    expect(onOpenDemo).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('app-settings-menu')).not.toBeInTheDocument();
  });

  it('keeps Escape focus behavior with the demo entry enabled', async () => {
    const user = userEvent.setup();
    renderMenu({ showDemoEntry: true, onOpenDemo: vi.fn() });
    const trigger = screen.getByTestId('app-settings-trigger');
    await openMenu(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('app-settings-menu')).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('keeps release notes, feature tour, and install actions independent', async () => {
    const user = userEvent.setup();
    const onOpenReleaseNotes = vi.fn();
    const onStartFeatureTour = vi.fn();
    const onOpenDemo = vi.fn();
    setInstallSnapshot({ nativePromptAvailable: true });
    renderMenu({ showDemoEntry: true, onOpenDemo, onOpenReleaseNotes, onStartFeatureTour });

    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-release-notes'));
    expect(onOpenReleaseNotes).toHaveBeenCalledTimes(1);
    expect(onOpenDemo).not.toHaveBeenCalled();

    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-feature-tour'));
    expect(onStartFeatureTour).toHaveBeenCalledTimes(1);
    expect(onOpenDemo).not.toHaveBeenCalled();

    await openMenu(user);
    await user.click(screen.getByTestId('app-settings-install-app'));
    expect(installMock.snapshot.requestInstall).toHaveBeenCalledTimes(1);
    expect(onOpenDemo).not.toHaveBeenCalled();
  });

  it('keeps the menu within a small viewport and scrollable', async () => {
    const user = userEvent.setup();
    const originalHeight = window.innerHeight;
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 320 });
    renderMenu({ showDemoEntry: true, onOpenDemo: vi.fn() });
    const trigger = screen.getByTestId('app-settings-trigger');
    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      top: 260, bottom: 304, left: 330, right: 374, width: 44, height: 44, x: 330, y: 260, toJSON: () => ({}),
    });
    await openMenu(user);
    const menu = screen.getByTestId('app-settings-menu');
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(12);
    expect(menu.style.maxHeight).toBe('calc(100dvh - 24px)');
    expect(menu).toHaveClass('overflow-y-auto');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
  });
});
