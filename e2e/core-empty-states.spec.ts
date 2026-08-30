import { expect, test, type Page } from '@playwright/test';

import {
  E2E_AUTH_UID,
  clearEmulatorDatabase,
  readEmulatorData,
  readEmulatorFirestoreDocument,
  seedTestTrip,
  seedTestTripInvite,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';

const ROOM_ID = 'e2ecoreemptystatesroom0001';

type SeedPlace = {
  id: string;
  name: string;
  place_id: string;
  customName: string;
  lat: number;
  lng: number;
  address: string;
  time: string;
  stayTime: string;
  memo: string;
  tags: string[];
};

function createPlace(id: string, name: string): SeedPlace {
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

function dayCard(page: Page, dayId: string) {
  return page.locator(
    `[data-testid="itinerary-day-card"][data-day-id="${dayId}"]`,
  );
}

function placeCardByName(page: Page, dayId: string, name: string) {
  return dayCard(page, dayId)
    .getByTestId('place-card')
    .filter({ hasText: name })
    .first();
}

async function openDeleteConfirmationForPlace(
  page: Page,
  dayId: string,
  name: string,
) {
  const placeCard = placeCardByName(page, dayId, name);
  await expect(placeCard).toBeVisible({ timeout: 20_000 });

  const mobileActionTrigger = placeCard.getByTestId('place-action-menu-trigger');
  if (await mobileActionTrigger.isVisible().catch(() => false)) {
    await mobileActionTrigger.click();
    await page.getByTestId('place-action-delete').click();
    return;
  }

  // Desktop: navigate/edit/nearby/copy/delete all live in Place Details now.
  await placeCard.click();
  await page.getByTestId('place-detail-delete-button').click();
}

async function openTrip(page: Page, itinerary: Record<string, SeedPlace[]>) {
  await markCurrentReleaseSeen(page);
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E empty state trip',
    startDate: '2026-09-20',
    endDate: Object.keys(itinerary).length > 1 ? '2026-09-21' : '2026-09-20',
    itinerary,
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
}

test('shows a useful lobby empty state when there are no trips', async ({
  page,
}) => {
  await clearEmulatorDatabase();
  await markCurrentReleaseSeen(page);

  await page.goto('/');

  await expect(page.getByTestId('lobby-empty-state')).toBeVisible();
  await expect(page.getByTestId('lobby-empty-state')).toContainText(
    '建立你的第一個旅程',
  );
  await expect(page.getByTestId('lobby-empty-state')).toContainText(
    '集中管理每日行程、景點、費用與旅伴協作，從第一個旅程開始規劃。',
  );
  await expect(page.getByTestId('create-trip-button')).toHaveCount(0);
  await expect(page.getByTestId('import-trip-button')).toHaveCount(0);

  await page.getByTestId('lobby-empty-create-trip').click();
  await expect(page.getByTestId('trip-modal')).toBeVisible();
  await expect(page.getByTestId('trip-modal-title')).toContainText('建立新旅程');

  await page.reload();
  await expect(page.getByTestId('lobby-empty-state')).toBeVisible();
  await page.getByTestId('lobby-empty-import-trip').click();
  await expect(page.getByRole('heading', { name: '加入朋友的旅程' })).toBeVisible();
  await expect(page.getByText('房間 ID 本身不會授予權限。')).toBeVisible();
});

test('joins a trip only after redeeming a secure invite link', async ({ page }) => {
  const inviteOwnerUid = 'e2e-invite-owner';
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E secure invite trip',
    ownerUid: inviteOwnerUid,
  });
  const token = await seedTestTripInvite(ROOM_ID, {
    createdByUid: inviteOwnerUid,
  });

  await markCurrentReleaseSeen(page);
  await page.addInitScript(() => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
  });
  await page.goto('/');
  await expect(page.getByTestId('lobby-empty-state')).toBeVisible();

  await page.getByTestId('lobby-empty-import-trip').click();
  await page.getByRole('textbox', { name: '旅程邀請連結' })
    .fill(`https://example.test/#invite=${token}`);
  await page.getByRole('button', { name: '驗證並加入' }).click();

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('trip-detail-title')).toContainText(
    'E2E secure invite trip',
  );
  await expect(page.getByTestId('toast').filter({ hasText: '已加入旅程' }))
    .toBeVisible();
  expect(await readEmulatorData(
    `roomAccess/${ROOM_ID}/members/${E2E_AUTH_UID}/role`,
  )).toBe('editor');
  expect(await readEmulatorData(`userTrips/${E2E_AUTH_UID}/${ROOM_ID}`))
    .toEqual(expect.objectContaining({ role: 'editor', status: 'active' }));
  const acl = await readEmulatorFirestoreDocument(
    `tripAccess/${ROOM_ID}/members/${E2E_AUTH_UID}`,
  );
  expect(acl?.fields).toEqual(expect.objectContaining({
    role: { stringValue: 'editor' },
    status: { stringValue: 'active' },
  }));
});

test('shows an itinerary empty state for a day without places', async ({
  page,
}) => {
  await openTrip(page, { 'Day 1': [] });

  const day1 = dayCard(page, 'Day 1');
  await expect(day1.getByTestId('itinerary-empty-state')).toBeVisible();
  await expect(day1.getByTestId('itinerary-empty-state')).toContainText(
    '這一天還沒有行程',
  );

  await day1.getByTestId('itinerary-empty-add-place').click();
  await expect(day1.getByTestId('place-search-input')).toBeFocused();
  await day1.getByTestId('add-emulator-place-button').click();

  await expect(day1.getByTestId('itinerary-empty-state')).toHaveCount(0);
  await expect(
    day1.getByTestId('place-card').filter({ hasText: 'E2E 測試餐廳' }),
  ).toBeVisible({ timeout: 15_000 });
});

test('restores the itinerary empty state after deleting the last place', async ({
  page,
}) => {
  await openTrip(page, {
    'Day 1': [createPlace('last-place', 'E2E final place')],
  });

  await openDeleteConfirmationForPlace(page, 'Day 1', 'E2E final place');
  await expect(page.getByTestId('confirm-dialog')).toContainText('刪除這個景點？');
  await page.getByTestId('confirm-accept').click();
  await expect(
    page.getByTestId('toast').filter({ hasText: '景點已刪除' }),
  ).toBeVisible();

  const day1 = dayCard(page, 'Day 1');
  await expect(placeCardByName(page, 'Day 1', 'E2E final place')).toHaveCount(0);
  await expect(day1.getByTestId('itinerary-empty-state')).toBeVisible();
});

test('only shows the empty state on empty itinerary days', async ({ page }) => {
  await openTrip(page, {
    'Day 1': [createPlace('occupied-place', 'E2E occupied place')],
    'Day 2': [],
  });

  await expect(placeCardByName(page, 'Day 1', 'E2E occupied place')).toBeVisible();
  await expect(dayCard(page, 'Day 1').getByTestId('itinerary-empty-state')).toHaveCount(0);
  const mobileDayTwoSwitch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]',
  );
  if (await mobileDayTwoSwitch.count()) {
    await mobileDayTwoSwitch.click();
  }
  await expect(dayCard(page, 'Day 2').getByTestId('itinerary-empty-state')).toBeVisible();
});
