import { expect, test } from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
} from './support/emulator';
import {
  clearCurrentReleaseSeen,
  markCurrentReleaseSeen,
} from './support/releaseNotes';

const TOUR_ROOM_ID = 'e2ewhatsnewtourroom0001';
const EMPTY_TOUR_ROOM_ID = 'e2ewhatsnewemptyroom0001';

async function seedTourTrip(): Promise<void> {
  await clearEmulatorDatabase();
  await seedTestTrip(TOUR_ROOM_ID, {
    title: 'E2E feature tour trip',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [
        {
          id: 'tour-place-a',
          name: 'E2E Tour museum',
          place_id: 'tour-place-a-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Tour address',
          time: '09:00',
          stayTime: '60',
          memo: 'E2E Tour memo',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
      ],
      'Day 2': [],
    },
  });
}

async function seedEmptyTourTrip(): Promise<void> {
  await clearEmulatorDatabase();
  await seedTestTrip(EMPTY_TOUR_ROOM_ID, {
    title: 'E2E empty feature tour trip',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [],
      'Day 2': [],
    },
  });
}

test('shows release notes for an unseen version', async ({ page }) => {
  await clearCurrentReleaseSeen(page);

  await page.goto('/');

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: '本次更新' })).toBeVisible();
  await expect(page.getByText('旅行協作體驗全面升級')).toBeVisible();
  await expect(page.getByText('即時同步狀態')).toBeVisible();
  await expect(page.getByText('手機快速切換天數')).toBeVisible();
  await expect(page.getByText('景點操作選單')).toBeVisible();
  await expect(page.getByText('多人即時協作改善')).toBeVisible();
});

test('does not automatically reopen a release marked as seen', async ({
  page,
}) => {
  await clearCurrentReleaseSeen(page);

  await page.goto('/');
  await page.getByTestId('whats-new-dismiss-version').click();
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);

  await page.reload();

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
});

test('remind later shows the release again in a new session', async ({
  page,
}) => {
  await clearCurrentReleaseSeen(page);

  await page.goto('/');
  await page.getByTestId('whats-new-remind-later').click();
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);

  await page.reload();

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
});

test('completes the mobile feature tour', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedTourTrip();

  await page.goto(`/?room=${TOUR_ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();

  await page.getByTestId('whats-new-start-tour').click();

  await expect(page.getByTestId('feature-tour')).toBeVisible();
  await expect(page.getByTestId('feature-tour-step')).toContainText('掌握同步狀態');

  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByTestId('feature-tour-step')).toContainText('快速切換每天行程');

  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByTestId('feature-tour-step')).toContainText('更多景點操作');

  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByTestId('feature-tour-step')).toContainText('查看完整景點資料');

  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByTestId('feature-tour-step')).toContainText('開始規劃旅程');

  await page.getByTestId('feature-tour-finish').click();

  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
});

test('can reopen release notes from the permanent entry', async ({ page }) => {
  await markCurrentReleaseSeen(page);

  await page.goto('/');

  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  await page.getByTestId('release-notes-trigger').click();

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
});

test('missing tour target does not crash the app', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedEmptyTourTrip();

  await page.goto(`/?room=${EMPTY_TOUR_ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByTestId('whats-new-start-tour').click();

  await expect(page.getByTestId('feature-tour')).toBeVisible();
  await page.getByTestId('feature-tour-next').click();
  await page.getByTestId('feature-tour-next').click();

  await expect(page.getByText('這個項目目前不在畫面上')).toBeVisible();
  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByText('這個項目目前不在畫面上')).toBeVisible();
  await page.getByTestId('feature-tour-next').click();
  await page.getByTestId('feature-tour-finish').click();

  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
});
