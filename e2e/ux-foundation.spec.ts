import { expect, test, type Page } from '@playwright/test';

async function openDemo(page: Page): Promise<void> {
  await page.goto('/?uxFoundation=demo');
  await expect(page.getByTestId('ux-foundation-demo')).toBeVisible();
}

test('shows capped toast notifications and supports dismiss', async ({ page }) => {
  await openDemo(page);

  await page.getByTestId('demo-toast-success').click();
  await page.getByTestId('demo-toast-info').click();
  await page.getByTestId('demo-toast-warning').click();
  await page.getByTestId('demo-toast-error').click();

  await expect(page.getByTestId('toast')).toHaveCount(3);
  await expect(page.getByTestId('toast').filter({ hasText: 'error toast' })).toBeVisible();

  await page.getByTestId('toast-dismiss').first().click();
  await expect(page.getByTestId('toast')).toHaveCount(2);
});

test('resolves confirm dialog through the promise API', async ({ page }) => {
  await openDemo(page);

  await page.getByTestId('demo-confirm').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-accept').click();

  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('toast').filter({ hasText: 'Confirm resolved: true' })).toBeVisible();
});

test('shows and hides the loading overlay with progress', async ({ page }) => {
  await openDemo(page);

  await page.getByTestId('demo-loading').click();
  await expect(page.getByTestId('loading-overlay')).toBeVisible();
  await expect(page.getByTestId('loading-spinner')).toBeVisible();
  await expect(page.getByTestId('loading-progress')).toBeVisible();
  await expect(page.getByTestId('loading-overlay')).toHaveCount(0, {
    timeout: 3_000,
  });
});

test('renders empty state and skeleton primitives', async ({ page }) => {
  await openDemo(page);

  await expect(page.getByTestId('empty-state')).toBeVisible();
  await expect(page.getByTestId('empty-state-primary')).toBeVisible();
  await expect(page.getByTestId('empty-state-secondary')).toBeVisible();
  await expect(page.getByTestId('skeleton-text')).toHaveCount(4);
  await expect(page.getByTestId('skeleton-text').first()).toBeVisible();
  await expect(page.getByTestId('skeleton-card')).toHaveCount(3);
  await expect(page.getByTestId('skeleton-avatar')).toBeVisible();
  await expect(page.getByTestId('skeleton-button')).toBeVisible();
});

test('opens only one global modal slot', async ({ page }) => {
  await openDemo(page);

  await page.getByTestId('demo-global-modal').click();
  await expect(page.getByTestId('global-modal')).toHaveCount(1);
  await page.getByTestId('demo-global-modal-close').click();
  await expect(page.getByTestId('global-modal')).toHaveCount(0);
});
