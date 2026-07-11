import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
  writeEmulatorData,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const LOBBY_TRIP = {
  roomId: 'e2eskeletonlobbyroom0001',
  title: 'E2E skeleton lobby trip',
  destination: '台北',
  startDate: '2026-09-20',
  endDate: '2026-09-21',
  members: ['自己'],
  transport: '汽車',
  themeColor: '#3b82f6',
};

const ROOM_ID = 'e2eskeletontriproom0001';

function createPlace(id: string, name: string) {
  return {
    id,
    name,
    place_id: `${id}-place-id`,
    customName: '',
    lat: 25.033,
    lng: 121.5654,
    address: `${name} address`,
    time: '09:00',
    stayTime: '60',
    memo: '',
    tags: [],
  };
}

test('renders stored lobby trips without a skeleton flash', async ({
  page,
}) => {
  await markCurrentReleaseSeen(page);
  await page.addInitScript((trip) => {
    window.localStorage.setItem('google-travel-my-trips', JSON.stringify([trip]));
  }, LOBBY_TRIP);

  await page.goto('/');

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('app-settings-trigger')).toBeVisible();
  await expect(page.getByTestId('lobby-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('lobby-empty-state')).toHaveCount(0);
  await expect(page.getByTestId('trip-card-title').filter({
    hasText: LOBBY_TRIP.title,
  })).toBeVisible();
});

test('renders the lobby empty state without a skeleton flash when stored trips are empty', async ({
  page,
}) => {
  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('google-travel-my-trips', '[]');
  });

  await page.goto('/');

  await expect(page.getByTestId('lobby-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('lobby-empty-state')).toBeVisible();
});

test('does not restore full-page skeletons during realtime itinerary updates', async ({
  page,
}) => {
  const initialPlace = createPlace('initial-place', 'E2E skeleton initial place');
  const updatedPlace = createPlace('updated-place', 'E2E skeleton realtime place');
  await markCurrentReleaseSeen(page);
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E skeleton realtime trip',
    itinerary: {
      'Day 1': [initialPlace],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('trip-detail-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('place-card').filter({
    hasText: initialPlace.name,
  })).toBeVisible();

  await writeEmulatorData(`rooms/${ROOM_ID}/itinerary`, {
    'Day 1': [initialPlace, updatedPlace],
  });

  await expect(page.getByTestId('trip-detail-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('place-card').filter({
    hasText: updatedPlace.name,
  })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('trip-detail-skeleton')).toHaveCount(0);
});
