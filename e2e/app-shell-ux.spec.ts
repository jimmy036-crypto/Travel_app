import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const SHELL_ROOM_ID = 'e2eappshelluxroom0001';

type LobbyTrip = {
  roomId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  members: string[];
  transport: string;
  themeColor: string;
};

function createLobbyTrip(): LobbyTrip {
  return {
    roomId: SHELL_ROOM_ID,
    title: 'E2E app shell trip',
    destination: 'E2E Shell destination',
    startDate: '2026-09-20',
    endDate: '2026-09-26',
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

async function seedShellTrip(): Promise<void> {
  await clearEmulatorDatabase();
  await seedTestTrip(SHELL_ROOM_ID, {
    title: 'E2E app shell trip',
    startDate: '2026-09-20',
    endDate: '2026-09-26',
    itinerary: {
      'Day 1': [
        {
          id: 'shell-place-a',
          name: 'E2E shell museum',
          place_id: 'shell-place-a-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Shell address',
          time: '09:00',
          stayTime: '60',
          memo: 'E2E Shell memo',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
      ],
      'Day 2': [],
      'Day 3': [],
      'Day 4': [],
      'Day 5': [],
      'Day 6': [],
      'Day 7': [],
    },
  });
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('app-settings-trigger').click();
  await expect(page.getByTestId('app-settings-menu')).toBeVisible();
}

async function openShellTrip(page: Page): Promise<void> {
  await seedShellTrip();
  await page.goto(`/?room=${SHELL_ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('itinerary-horizontal-scroll')).toBeVisible();
}

test('mobile lobby actions use a consistent responsive layout', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await markCurrentReleaseSeen(page);
  await seedLobbyTrips(page, [createLobbyTrip()]);

  await page.goto('/');

  const createButton = page.getByTestId('create-trip-button');
  const importButton = page.getByTestId('import-trip-button');
  const appearanceButton = page.getByTestId('lobby-appearance-button');

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('app-settings-trigger')).toBeVisible();
  await expect(createButton).toBeVisible();
  await expect(importButton).toBeVisible();
  await expect(appearanceButton).toBeVisible();
  await expect(page.getByTestId('release-notes-trigger')).toHaveCount(0);

  const createBox = await createButton.boundingBox();
  const importBox = await importButton.boundingBox();
  const appearanceBox = await appearanceButton.boundingBox();

  expect(createBox?.height).toBeGreaterThanOrEqual(48);
  expect(importBox?.height).toBeGreaterThanOrEqual(44);
  expect(appearanceBox?.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs((importBox?.width || 0) - (appearanceBox?.width || 0))).toBeLessThanOrEqual(4);
  expect(createBox?.width || 0).toBeGreaterThan(importBox?.width || 0);
});

test('opens release notes and feature tour from the settings menu', async ({
  page,
}) => {
  await markCurrentReleaseSeen(page);
  await seedShellTrip();
  await seedLobbyTrips(page, [createLobbyTrip()]);

  await page.goto('/');

  await openSettings(page);
  await page.getByTestId('app-settings-release-notes').click();
  await expect(page.getByTestId('whats-new-dialog')).toBeVisible();
  await page.getByTestId('whats-new-remind-later').click();
  await expect(page.getByTestId('whats-new-dialog')).toHaveCount(0);

  await openSettings(page);
  await page.getByTestId('app-settings-feature-tour').click();
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('feature-tour')).toBeVisible({
    timeout: 20_000,
  });
  await page.getByTestId('feature-tour-skip').click();
  await expect(page.getByTestId('feature-tour')).toHaveCount(0);

  await openSettings(page);
  await page.getByTestId('app-settings-feature-tour').click();
  await expect(page.getByTestId('feature-tour')).toBeVisible();
});

test('vertical mouse wheel does not horizontally scroll the itinerary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openShellTrip(page);

  const scroller = page.getByTestId('itinerary-horizontal-scroll');
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });

  const initialScrollLeft = await scroller.evaluate((element) => element.scrollLeft);
  await scroller.dispatchEvent('wheel', {
    deltaX: 0,
    deltaY: 600,
    bubbles: true,
    cancelable: true,
  });

  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft), {
      timeout: 3_000,
      message: 'vertical wheel should not move the itinerary horizontally',
    })
    .toBe(initialScrollLeft);
});

test('horizontal trackpad input can still scroll the itinerary', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openShellTrip(page);

  const scroller = page.getByTestId('itinerary-horizontal-scroll');
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });

  await scroller.dispatchEvent('wheel', {
    deltaX: 500,
    deltaY: 0,
    bubbles: true,
    cancelable: true,
  });

  await expect
    .poll(() => scroller.evaluate((element) => element.scrollLeft), {
      timeout: 3_000,
      message: 'dominant horizontal wheel input should move the itinerary',
    })
    .toBeGreaterThan(0);
});
