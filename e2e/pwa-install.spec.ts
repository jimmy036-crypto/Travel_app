import { expect, test, type Locator, type Page } from '@playwright/test';

import { markCurrentReleaseSeen } from './support/releaseNotes';

type InstallOutcome = 'accepted' | 'dismissed';

type InstallTestState = {
  promptCalls: number;
  prevented: boolean;
  requestedOutcome: InstallOutcome;
  dispatchResult: boolean | null;
};

type ErrorAudit = {
  pageErrors: string[];
  consoleErrors: string[];
};

type ManifestIcon = {
  src?: string;
  sizes?: string;
  purpose?: string;
};

declare global {
  interface Window {
    __pwaInstallE2e?: InstallTestState;
  }
}

const audits = new WeakMap<Page, ErrorAudit>();

function isDesktopProject(projectName: string): boolean {
  return projectName === 'PWA Desktop Chrome';
}

function isMobileSafariProject(projectName: string): boolean {
  return projectName === 'PWA Mobile Safari';
}

function shouldIgnoreConsoleError(message: string): boolean {
  return /A preload for .* was found, but was not used/i.test(message);
}

test.beforeEach(async ({ page }) => {
  const audit: ErrorAudit = {
    pageErrors: [],
    consoleErrors: [],
  };
  audits.set(page, audit);

  page.on('pageerror', (error) => {
    audit.pageErrors.push(error.stack || error.message || String(error));
  });

  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (shouldIgnoreConsoleError(text)) return;
    audit.consoleErrors.push(text);
  });
});

test.afterEach(async ({ page }) => {
  const audit = audits.get(page);
  expect(audit?.pageErrors || [], 'uncaught page errors').toEqual([]);
  expect(audit?.consoleErrors || [], 'console.error messages').toEqual([]);
});

async function setupProductionLobby(page: Page): Promise<void> {
  await markCurrentReleaseSeen(page);
  await page.goto('/');
  await expect(page.locator('#root')).toHaveCount(1);
  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
}

async function openSettingsMenu(page: Page): Promise<void> {
  await page.getByTestId('app-settings-trigger').click();
  await expect(page.getByTestId('app-settings-menu')).toBeVisible();
}

async function dispatchInstallPrompt(
  page: Page,
  outcome: InstallOutcome,
): Promise<void> {
  await page.evaluate((nextOutcome) => {
    const state: InstallTestState = {
      promptCalls: 0,
      prevented: false,
      requestedOutcome: nextOutcome,
      dispatchResult: null,
    };
    let resolveChoice: (choice: { outcome: InstallOutcome }) => void = () => {};
    const userChoice = new Promise<{ outcome: InstallOutcome }>((resolve) => {
      resolveChoice = resolve;
    });
    const event = new Event('beforeinstallprompt', {
      bubbles: false,
      cancelable: true,
    });
    const originalPreventDefault = event.preventDefault.bind(event);

    Object.defineProperty(event, 'preventDefault', {
      configurable: true,
      value: () => {
        state.prevented = true;
        originalPreventDefault();
      },
    });
    Object.defineProperty(event, 'prompt', {
      configurable: true,
      value: async () => {
        state.promptCalls += 1;
        resolveChoice({ outcome: nextOutcome });
      },
    });
    Object.defineProperty(event, 'userChoice', {
      configurable: true,
      value: userChoice,
    });

    window.__pwaInstallE2e = state;
    state.dispatchResult = window.dispatchEvent(event);
    state.prevented = state.prevented || event.defaultPrevented;
  }, outcome);

  await expect
    .poll(() => readInstallTestState(page), {
      message: 'beforeinstallprompt should be prevented by the controller',
    })
    .toMatchObject({
      prevented: true,
      promptCalls: 0,
      requestedOutcome: outcome,
    });
}

async function readInstallTestState(page: Page): Promise<InstallTestState | null> {
  return page.evaluate(() => window.__pwaInstallE2e || null);
}

async function overrideStandaloneDisplayMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query: string) => {
      if (query !== '(display-mode: standalone)') {
        return nativeMatchMedia(query);
      }

      return {
        matches: true,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      } as MediaQueryList;
    };
  });
}

async function waitForServiceWorkerRegistration(page: Page) {
  await page.waitForFunction(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.getRegistration();
    return Boolean(
      registration
      && (registration.active || registration.waiting || registration.installing),
    );
  });

  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const worker =
      registration?.active || registration?.waiting || registration?.installing || null;

    return {
      scope: registration?.scope || '',
      active: Boolean(registration?.active),
      waiting: Boolean(registration?.waiting),
      installing: Boolean(registration?.installing),
      scriptURL: worker?.scriptURL || '',
    };
  });
}

async function requireBoundingBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box`).not.toBeNull();
  if (!box) throw new Error(`${label} should have a bounding box`);
  return box;
}

test('PWA-PROD-01 validates the production manifest', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopProject(testInfo.project.name), 'Desktop Chrome only');

  await setupProductionLobby(page);

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref, 'manifest href').toBeTruthy();
  const manifestUrl = new URL(String(manifestHref), page.url()).href;
  const response = await page.request.get(manifestUrl);
  expect(response.ok(), `manifest request ${manifestUrl}`).toBe(true);
  const manifest = await response.json();

  expect(manifest).toMatchObject({
    id: '/',
    name: '智の旅行',
    short_name: '智の旅行',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'zh-TW',
  });

  const icons: ManifestIcon[] = Array.isArray(manifest.icons) ? manifest.icons : [];
  expect(icons.some((icon) => String(icon.sizes).includes('192x192'))).toBe(true);
  expect(icons.some((icon) => String(icon.sizes).includes('512x512'))).toBe(true);
  expect(icons.some((icon) => String(icon.purpose).includes('maskable'))).toBe(true);

  const icon = icons.find((entry) => String(entry.sizes).includes('512x512')) || icons[0];
  expect(icon?.src, 'manifest icon src').toBeTruthy();
  const iconUrl = new URL(String(icon.src), manifestUrl).href;
  const iconResponse = await page.request.get(iconUrl);
  expect(iconResponse.ok(), `icon request ${iconUrl}`).toBe(true);
});

test('PWA-PROD-02 registers the production service worker and update root', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopProject(testInfo.project.name), 'Desktop Chrome only');

  await setupProductionLobby(page);

  await expect(page.locator('#pwa-update-prompt-root')).toHaveCount(1);
  await expect(page.locator('#root')).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker)))
    .toBe(true);

  const registration = await waitForServiceWorkerRegistration(page);
  const origin = new URL(page.url()).origin;

  expect(registration.scope).toBe(`${origin}/`);
  expect(
    registration.active || registration.waiting || registration.installing,
    'registration should have a worker',
  ).toBe(true);
  expect(new URL(registration.scriptURL).origin).toBe(origin);
});

test('PWA-INSTALL-01 keeps unsupported desktop install UI hidden before prompt', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopProject(testInfo.project.name), 'Desktop Chrome only');

  await setupProductionLobby(page);
  await openSettingsMenu(page);

  await expect(page.getByTestId('app-settings-appearance')).toBeVisible();
  await expect(page.getByTestId('app-settings-release-notes')).toBeVisible();
  await expect(page.getByTestId('app-settings-feature-tour')).toBeVisible();
  await expect(page.getByTestId('app-settings-check-updates')).toBeVisible();
  await expect(page.getByTestId('app-settings-install-app')).toHaveCount(0);
  await expect(page.getByTestId('app-settings-install-status')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__pwaInstallE2e || null))
    .toBeNull();
});

test('PWA-INSTALL-02 handles accepted native prompt and appinstalled', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopProject(testInfo.project.name), 'Desktop Chrome only');

  await setupProductionLobby(page);
  await dispatchInstallPrompt(page, 'accepted');
  await openSettingsMenu(page);

  const installAction = page.getByTestId('app-settings-install-app');
  await expect(installAction).toHaveAttribute('data-install-state', 'native');
  await expect(installAction).toContainText('安裝 App');
  await installAction.click();

  await expect(page.getByTestId('app-settings-menu')).toHaveCount(0);
  await expect
    .poll(async () => (await readInstallTestState(page))?.promptCalls || 0)
    .toBe(1);
  await expect(page.getByTestId('toast').filter({ hasText: '安裝要求已接受' })).toHaveCount(1);
  await expect(page.locator('[data-testid="toast"][data-toast-type="error"]')).toHaveCount(0);

  await openSettingsMenu(page);
  await expect(page.getByTestId('app-settings-install-app')).toHaveCount(0);
  await expect
    .poll(async () => (await readInstallTestState(page))?.promptCalls || 0)
    .toBe(1);

  await page.evaluate(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });

  const installedStatus = page.getByTestId('app-settings-install-status');
  await expect(installedStatus).toBeVisible();
  await expect(installedStatus).toBeDisabled();
  await expect(installedStatus).toHaveAttribute('data-install-state', 'installed');
  await expect(page.getByTestId('app-settings-install-app')).toHaveCount(0);
});

test('PWA-INSTALL-03 handles dismissed native prompt without permanent block', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopProject(testInfo.project.name), 'Desktop Chrome only');

  await setupProductionLobby(page);
  await dispatchInstallPrompt(page, 'dismissed');
  await openSettingsMenu(page);
  await page.getByTestId('app-settings-install-app').click();

  await expect
    .poll(async () => (await readInstallTestState(page))?.promptCalls || 0)
    .toBe(1);
  await expect(page.locator('[data-testid="toast"][data-toast-type="error"]')).toHaveCount(0);

  await openSettingsMenu(page);
  await expect(page.getByTestId('app-settings-install-status')).toHaveCount(0);
  await expect(page.getByTestId('app-settings-install-app')).toHaveCount(0);

  await dispatchInstallPrompt(page, 'dismissed');
  await expect(page.getByTestId('app-settings-install-app')).toHaveAttribute(
    'data-install-state',
    'native',
  );
});

test('PWA-INSTALL-04 shows installed UI in standalone display mode', async ({
  page,
}, testInfo) => {
  test.skip(!isDesktopProject(testInfo.project.name), 'Desktop Chrome only');

  await overrideStandaloneDisplayMode(page);
  await setupProductionLobby(page);
  await openSettingsMenu(page);

  const installedStatus = page.getByTestId('app-settings-install-status');
  await expect(installedStatus).toBeVisible();
  await expect(installedStatus).toBeDisabled();
  await expect(installedStatus).toHaveAttribute('data-install-state', 'installed');
  await expect(page.getByTestId('app-settings-install-app')).toHaveCount(0);
});

test('PWA-IOS-01 shows Safari add-to-home-screen instructions', async ({
  page,
}, testInfo) => {
  test.skip(!isMobileSafariProject(testInfo.project.name), 'Mobile Safari only');

  await setupProductionLobby(page);
  await openSettingsMenu(page);

  const installAction = page.getByTestId('app-settings-install-app');
  await expect(installAction).toHaveAttribute('data-install-state', 'ios');
  await expect(installAction).toContainText('加入主畫面');
  await expect(page.getByText('安裝 App')).toHaveCount(0);
  await installAction.click();

  await expect(page.getByTestId('app-settings-menu')).toHaveCount(0);
  const dialogShell = page.getByTestId('pwa-install-instructions');
  const dialog = page.getByRole('dialog', { name: '將「智の旅行」加入主畫面' });
  await expect(dialogShell).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.getByTestId('pwa-install-instructions-title')).toHaveText(
    '將「智の旅行」加入主畫面',
  );
  await expect(page.getByTestId('pwa-install-ios-safari-steps')).toContainText(
    '點擊 Safari 工具列的「分享」按鈕',
  );
  await expect(page.getByTestId('pwa-install-ios-safari-steps')).toContainText(
    '向下捲動並選擇「加入主畫面」',
  );
  await expect(page.getByTestId('pwa-install-ios-safari-steps')).toContainText(
    '若看到「以網頁 App 開啟」，保持開啟',
  );
  await expect(page.getByTestId('pwa-install-ios-safari-steps')).toContainText(
    '點擊右上角的「加入」',
  );
  await expect(page.getByTestId('pwa-install-open-in-safari-note')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .toBe('hidden');

  const closeButton = page.getByTestId('pwa-install-instructions-close');
  await expect(closeButton).toBeFocused();

  const dialogBox = await requireBoundingBox(dialog, 'PWA install dialog');
  const closeBox = await requireBoundingBox(closeButton, 'PWA install close button');
  const viewport = page.viewportSize()
    || await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

  expect(dialogBox.height).toBeLessThanOrEqual(viewport.height + 1);
  expect(closeBox.y).toBeGreaterThanOrEqual(0);
  expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(viewport.height + 1);

  const lastStep = page.getByTestId('pwa-install-ios-safari-steps').locator('li').nth(3);
  await lastStep.scrollIntoViewIfNeeded();
  await expect(lastStep).toBeVisible();

  await expect(dialog.getByRole('button')).toHaveCount(1);
  await expect(dialog.getByTestId('pwa-install-instructions-close')).toBeVisible();
  await expect(dialog.getByRole('button', { name: /立即安裝|安裝 App|加入$/ })).toHaveCount(0);

  await closeButton.click();
  await expect(dialogShell).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow))
    .not.toBe('hidden');
  await expect(page.getByTestId('app-settings-trigger')).toBeFocused();
});
