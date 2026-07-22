import { expect, type Page } from '@playwright/test';

export const CURRENT_RELEASE_VERSION = '2026.07-mobile-collaboration';
export const CURRENT_RELEASE_SEEN_KEY =
  `travel-app-seen-release-${CURRENT_RELEASE_VERSION}`;
export const CURRENT_RELEASE_PENDING_TOUR_KEY =
  `travel-app-pending-feature-tour-${CURRENT_RELEASE_VERSION}`;
const FIRST_RUN_ONBOARDING_SEEN_KEY = 'travel-app-seen-onboarding-v1';

export async function clearCurrentReleaseSeen(page: Page): Promise<void> {
  await page.addInitScript(({ releaseKey, onboardingKey }) => {
    const markerKey = `${releaseKey}:cleared-once`;
    if (window.sessionStorage.getItem(markerKey) === 'true') return;
    window.localStorage.removeItem(releaseKey);
    window.localStorage.setItem(onboardingKey, 'true');
    window.sessionStorage.setItem(markerKey, 'true');
  }, {
    releaseKey: CURRENT_RELEASE_SEEN_KEY,
    onboardingKey: FIRST_RUN_ONBOARDING_SEEN_KEY,
  });
}

export async function markCurrentReleaseSeen(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'true');
  }, CURRENT_RELEASE_SEEN_KEY);
}

export async function clearPendingFeatureTour(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.sessionStorage.removeItem(key);
  }, CURRENT_RELEASE_PENDING_TOUR_KEY);
}

export async function dismissCurrentReleaseNotes(page: Page): Promise<void> {
  const dialog = page.getByTestId('whats-new-dialog');
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByTestId('whats-new-dismiss-version').click();
    await expect(dialog).toHaveCount(0);
  }
}
