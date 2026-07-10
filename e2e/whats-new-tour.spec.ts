import { expect, test, type Locator, type Page } from '@playwright/test';

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
const SECOND_TOUR_ROOM_ID = 'e2ewhatsnewtourroom0002';

type LobbyTrip = {
  roomId: string;
  title: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  members?: string[];
  transport?: string;
  themeColor?: string;
};

function createLobbyTrip(roomId: string, title: string): LobbyTrip {
  return {
    roomId,
    title,
    destination: 'E2E Tour destination',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    members: ['E2E Alice'],
    transport: 'E2E Transport',
    themeColor: '#3b82f6',
  };
}

async function seedLobbyTrips(page: Page, trips: LobbyTrip[]): Promise<void> {
  await page.addInitScript((nextTrips) => {
    window.localStorage.setItem(
      'google-travel-my-trips',
      JSON.stringify(nextTrips),
    );
  }, trips);
}

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

async function seedTwoTourTrips(): Promise<void> {
  await seedTourTrip();
  await seedTestTrip(SECOND_TOUR_ROOM_ID, {
    title: 'E2E second feature tour trip',
    startDate: '2026-10-05',
    endDate: '2026-10-06',
    itinerary: {
      'Day 1': [
        {
          id: 'tour-place-b',
          name: 'E2E Second museum',
          place_id: 'tour-place-b-id',
          customName: '',
          lat: 25.034,
          lng: 121.564,
          address: 'E2E Second address',
          time: '10:00',
          stayTime: '45',
          memo: 'E2E Second memo',
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

async function requireBoundingBox(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should have a bounding box`).not.toBeNull();
  if (!box) throw new Error(`${label} should have a bounding box`);
  return box;
}

function getOverlapArea(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

async function expectTargetInsideSpotlight(page: Page, targetTestId: string) {
  const target = page.getByTestId(targetTestId).first();
  const tour = page.getByTestId('feature-tour');
  const overlay = page.getByTestId('feature-tour-overlay');
  const spotlight = page.getByTestId('feature-tour-spotlight');
  const card = page.getByTestId('feature-tour-card');

  await expect(target).toBeVisible();
  await expect(tour).toBeVisible();
  await expect(overlay).toBeVisible();
  await expect(spotlight).toBeVisible();
  await expect(card).toBeVisible();

  const targetBox = await requireBoundingBox(target, targetTestId);
  const spotlightBox = await requireBoundingBox(spotlight, 'feature tour spotlight');
  const cardBox = await requireBoundingBox(card, 'feature tour card');
  const viewport = page.viewportSize()
    || await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));

  expect(spotlightBox.x).toBeGreaterThanOrEqual(0);
  expect(spotlightBox.y).toBeGreaterThanOrEqual(0);
  expect(spotlightBox.x + spotlightBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(spotlightBox.y + spotlightBox.height).toBeLessThanOrEqual(viewport.height + 1);

  expect(spotlightBox.x).toBeLessThanOrEqual(targetBox.x + 1);
  expect(spotlightBox.y).toBeLessThanOrEqual(targetBox.y + 1);
  expect(spotlightBox.x + spotlightBox.width).toBeGreaterThanOrEqual(
    targetBox.x + targetBox.width - 1,
  );
  expect(spotlightBox.y + spotlightBox.height).toBeGreaterThanOrEqual(
    targetBox.y + targetBox.height - 1,
  );

  const targetFilters = await target.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      filter: style.filter,
    };
  });
  expect(targetFilters.filter).not.toContain('blur(');

  for (const locator of [tour, overlay, spotlight]) {
    const filters = await locator.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        filter: style.filter,
        backdropFilter:
          style.getPropertyValue('backdrop-filter')
          || style.getPropertyValue('-webkit-backdrop-filter'),
      };
    });
    expect(filters.filter).not.toContain('blur(');
    expect(filters.backdropFilter).not.toContain('blur(');
  }

  const overlapRatio = getOverlapArea(cardBox, targetBox)
    / Math.max(1, targetBox.width * targetBox.height);
  expect(overlapRatio).toBeLessThan(0.35);

  return spotlightBox;
}

test('shows release notes for an unseen version', async ({ page }) => {
  await clearCurrentReleaseSeen(page);

  await page.goto('/');

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  await expect(page.locator('#whats-new-title')).toBeVisible();
  await expect(page.getByTestId('whats-new-start-tour')).toHaveCount(0);
  await expect(page.getByTestId('whats-new-create-trip')).toBeVisible();
  await expect(page.locator('[data-testid="whats-new-dialog"] article')).toHaveCount(5);
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

test('routes from the lobby into a trip before starting the tour', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedLobbyTrips(page, [
    createLobbyTrip(TOUR_ROOM_ID, 'E2E feature tour trip'),
  ]);
  await seedTourTrip();

  await page.goto('/');

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  await page.getByTestId('whats-new-choose-trip-tour').click();

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('feature-tour')).toBeVisible();
  await expect(page.getByTestId('feature-tour-step')).toBeVisible();
  await expect(page.getByTestId('feature-tour-empty-place-fallback')).toHaveCount(0);
});

test('asks the user to choose a trip when multiple trips exist', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedLobbyTrips(page, [
    createLobbyTrip(TOUR_ROOM_ID, 'E2E feature tour trip'),
    createLobbyTrip(SECOND_TOUR_ROOM_ID, 'E2E second feature tour trip'),
  ]);
  await seedTwoTourTrips();

  await page.goto('/');

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  await page.getByTestId('whats-new-choose-trip-tour').click();

  await expect(page.getByTestId('trip-tour-selection')).toBeVisible();
  await expect(page.getByTestId('pending-tour-message')).toBeVisible();
  await expect(page.getByTestId('feature-tour')).toHaveCount(0);

  await page
    .locator(
      `[data-testid="trip-tour-selection-option"][data-room-id="${SECOND_TOUR_ROOM_ID}"]`,
    )
    .click();

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('feature-tour')).toBeVisible();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-room-id',
    SECOND_TOUR_ROOM_ID,
  );
});

test('offers trip creation instead of starting the tour when no trips exist', async ({
  page,
}) => {
  await clearCurrentReleaseSeen(page);
  await page.goto('/');

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  await expect(page.getByTestId('whats-new-create-trip')).toBeVisible();
  await expect(page.getByText('建立旅程後，即可體驗天數切換、景點操作與多人同步導覽。')).toBeVisible();

  await page.getByTestId('whats-new-create-trip').click();

  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
  await expect(page.getByTestId('trip-modal')).toBeVisible();
  await expect(page.getByTestId('trip-modal-title')).toBeVisible();
});

test('cancels a pending tour without starting it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedLobbyTrips(page, [
    createLobbyTrip(TOUR_ROOM_ID, 'E2E feature tour trip'),
    createLobbyTrip(SECOND_TOUR_ROOM_ID, 'E2E second feature tour trip'),
  ]);
  await seedTwoTourTrips();

  await page.goto('/');
  await page.getByTestId('whats-new-choose-trip-tour').click();
  await expect(page.getByTestId('trip-tour-selection')).toBeVisible();

  await page.getByTestId('pending-tour-cancel').click();
  await expect(page.getByTestId('trip-tour-selection')).toHaveCount(0);

  await page
    .locator(`[data-testid="trip-card"][data-room-id="${TOUR_ROOM_ID}"]`)
    .click();

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
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
  await expect(page.getByTestId('feature-tour-step')).toBeVisible();

  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByTestId('feature-tour-step')).toBeVisible();

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

test('keeps the active tour target clear and inside the spotlight', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedTourTrip();

  await page.goto(`/?room=${TOUR_ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByTestId('whats-new-start-tour').click();

  await expect(page.getByTestId('feature-tour')).toBeVisible();
  const firstSpotlight = await expectTargetInsideSpotlight(
    page,
    'sync-status-indicator',
  );

  await page.getByTestId('feature-tour-next').click();
  const secondSpotlight = await expectTargetInsideSpotlight(
    page,
    'mobile-day-switcher',
  );
  const movement = Math.abs(secondSpotlight.x - firstSpotlight.x)
    + Math.abs(secondSpotlight.y - firstSpotlight.y);
  expect(movement).toBeGreaterThan(4);

  await page.getByTestId('feature-tour-next').click();
  await expectTargetInsideSpotlight(page, 'place-action-menu-trigger');
});

test('ends the tour when navigating away from the trip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearCurrentReleaseSeen(page);
  await seedLobbyTrips(page, [
    createLobbyTrip(TOUR_ROOM_ID, 'E2E feature tour trip'),
  ]);
  await seedTourTrip();

  await page.goto('/');
  await page.getByTestId('whats-new-choose-trip-tour').click();

  await expect(page.getByTestId('feature-tour')).toBeVisible({
    timeout: 20_000,
  });

  await page.goBack();

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
});

test('can reopen release notes from the permanent entry', async ({ page }) => {
  await markCurrentReleaseSeen(page);

  await page.goto('/');

  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);
  await page.getByTestId('release-notes-trigger').click();

  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
});

test('combines missing place targets into one helpful fallback step', async ({ page }) => {
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

  await expect(page.getByTestId('feature-tour-empty-place-fallback')).toBeVisible();
  await expect(page.getByTestId('feature-tour-step')).toContainText('新增景點後解鎖更多功能');

  await page.getByTestId('feature-tour-next').click();
  await expect(page.getByTestId('feature-tour-finish')).toBeVisible();
  await page.getByTestId('feature-tour-finish').click();

  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
});
