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

async function holdAnimationFrames(page: Page) {
  await page.addInitScript(() => {
    const globalWindow = window as typeof window & {
      __TRAVEL_E2E_RAF_QUEUE__?: Array<FrameRequestCallback | null>;
    };
    const queue: Array<FrameRequestCallback | null> = [];
    globalWindow.__TRAVEL_E2E_RAF_QUEUE__ = queue;
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      queue.push(callback);
      return queue.length;
    };
    window.cancelAnimationFrame = (id: number) => {
      queue[id - 1] = null;
    };
  });
}

async function releaseAnimationFrames(page: Page) {
  await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      __TRAVEL_E2E_RAF_QUEUE__?: Array<FrameRequestCallback | null>;
    };
    const queue = globalWindow.__TRAVEL_E2E_RAF_QUEUE__ || [];
    while (queue.length > 0) {
      const callback = queue.shift();
      if (callback) callback(performance.now());
    }
  });
}

test('shows lobby skeletons before the first trip list hydration resolves', async ({
  page,
}) => {
  await markCurrentReleaseSeen(page);
  await holdAnimationFrames(page);
  await page.addInitScript((trip) => {
    window.localStorage.setItem('google-travel-my-trips', JSON.stringify([trip]));
  }, LOBBY_TRIP);

  await page.goto('/');

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByTestId('app-settings-trigger')).toBeVisible();
  await expect(page.getByTestId('lobby-skeleton')).toBeVisible();
  await expect(page.getByTestId('lobby-skeleton-card')).toHaveCount(3);
  await expect(page.getByTestId('lobby-empty-state')).toHaveCount(0);
  await expect(page.getByTestId('trip-card')).toHaveCount(0);

  await releaseAnimationFrames(page);

  await expect(page.getByTestId('lobby-skeleton')).toHaveCount(0);
  await expect(page.getByTestId('trip-card-title').filter({
    hasText: LOBBY_TRIP.title,
  })).toBeVisible();
});

test('replaces lobby skeletons with the empty state after an empty hydration', async ({
  page,
}) => {
  await markCurrentReleaseSeen(page);
  await holdAnimationFrames(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('google-travel-my-trips', '[]');
  });

  await page.goto('/');

  await expect(page.getByTestId('lobby-skeleton')).toBeVisible();
  await expect(page.getByTestId('lobby-empty-state')).toHaveCount(0);

  await releaseAnimationFrames(page);

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
