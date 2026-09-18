import { skipCompanionIntroduction } from './support/companion';
import { expect, test, type Dialog, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
} from './support/emulator';

const ROOM_ID = 'e2eplacecrudroom0001';
const ORIGINAL_NAME = 'E2E 測試餐廳';
const EDITED_NAME = 'E2E 已編輯餐廳';
const EDITED_NOTE = 'E2E 編輯後筆記';

type PlaceItem = {
  id?: string;
  name?: string;
  customName?: string;
  time?: string;
  stayTime?: string | number;
  memo?: string;
};

function placeCardByName(page: Page, dayId: string, name: string) {
  return page
    .locator(`[data-testid="itinerary-day-card"][data-day-id="${dayId}"]`)
    .getByTestId('place-card')
    .filter({ hasText: name })
    .first();
}

async function expectMenuWithinViewport(page: Page) {
  const menu = page.getByTestId('place-action-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  const viewport = page.viewportSize();

  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.y).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width - 12 + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height - 12 + 1);
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

async function addPlaceWithEmulatorHook(page: Page) {
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            typeof (
              window as Window & {
                __TRAVEL_E2E__?: {
                  addTestPlace?: () => void;
                };
              }
            ).__TRAVEL_E2E__?.addTestPlace === 'function',
        ),
      {
        timeout: 10_000,
        message: 'TripDetail should expose the Emulator add-place hook',
      },
    )
    .toBe(true);

  await page.evaluate(() => {
    const e2eWindow = window as Window & {
      __TRAVEL_E2E__?: {
        addTestPlace?: () => void;
      };
    };

    e2eWindow.__TRAVEL_E2E__?.addTestPlace?.();
  });
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID);
});

// Non-contiguous times are intentional: accidental recalculation must be visible.
const timeControlItinerary = {
  'Day 1': ['09:00', '13:00', '18:00'].map((time, index) => ({
    id: `time-control-${index}`, name: `合成預約景點${index + 1}`, customName: '',
    time, stayTime: '30', memo: '原始內容', lat: 25.03 + index * 0.01, lng: 121.56,
    nextLeg: { mode: 'WALK', mins: 10 },
  })),
  'Day 2': [{ id: 'time-control-other', name: '另一日', time: '08:00', stayTime: '20' }],
};

async function openTimeControlTrip(page: Page, themeColor = '#d9f3fb') {
  await seedTestTrip(ROOM_ID, { itinerary: timeControlItinerary, themeColor });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await skipCompanionIntroduction(page);
}

async function openTimeControlEditor(page: Page) {
  const card = placeCardByName(page, 'Day 1', '合成預約景點1');
  const trigger = card.getByTestId('place-details-trigger');
  if (await trigger.isVisible()) await trigger.click();
  else await card.click();
  await page.getByTestId('place-detail-edit-button').click();
  return page.getByRole('dialog', { name: '編輯景點' });
}

for (const scenario of [
  { name: 'content only', time: '09:00', cascade: false, expected: ['09:00', '13:00', '18:00'] },
  { name: 'time changed without consent', time: '10:00', cascade: false, expected: ['10:00', '13:00', '18:00'] },
  { name: 'explicit recalculation', time: '10:00', cascade: true, expected: ['10:00', '10:40', '11:20'] },
]) {
  test(`time control: ${scenario.name} persists exact times through reload`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTimeControlTrip(page);
    const baseline = await readEmulatorData<Record<string, PlaceItem[]>>(`rooms/${ROOM_ID}/itinerary`);
    const editor = await openTimeControlEditor(page);
    const choice = editor.getByRole('checkbox', { name: '重新計算後續時間' });
    await expect(choice).toHaveCount(0);
    await editor.getByLabel('筆記／備註').fill('只改本次草稿');
    await editor.getByLabel('抵達時間').fill(scenario.time);
    if (scenario.time !== '09:00') {
      await expect(choice).not.toBeChecked();
      if (scenario.cascade) await choice.check();
    } else await expect(choice).toHaveCount(0);
    await editor.getByRole('button', { name: '儲存變更' }).click();
    await expect(editor).toHaveCount(0);
    await expect.poll(async () => {
      const data = await readEmulatorData<Record<string, PlaceItem[]>>(`rooms/${ROOM_ID}/itinerary`);
      return data?.['Day 1'].map((item) => item.time);
    }).toEqual(scenario.expected);
    const saved = await readEmulatorData<Record<string, PlaceItem[]>>(`rooms/${ROOM_ID}/itinerary`);
    expect(saved!['Day 2']).toEqual(baseline!['Day 2']);
    expect(saved!['Day 1'].map((item) => item.id)).toEqual(baseline!['Day 1'].map((item) => item.id));
    expect(saved!['Day 1'][0].memo).toBe('只改本次草稿');
    if (!scenario.cascade) expect(saved!['Day 1'].slice(1)).toEqual(baseline!['Day 1'].slice(1));
    await page.reload();
    await expect(page.getByTestId('active-trip-view')).toBeVisible();
    await skipCompanionIntroduction(page);
    for (let index = 0; index < 3; index += 1) {
      await expect(placeCardByName(page, 'Day 1', `合成預約景點${index + 1}`).getByTestId('place-card-time')).toHaveText(scenario.expected[index]);
    }
    expect(await readEmulatorData(`rooms/${ROOM_ID}/itinerary`)).toEqual(saved);
  });
}

test('time control: adding from the existing search hook preserves booked times and the other day', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTimeControlTrip(page);
  const baseline = await readEmulatorData<Record<string, PlaceItem[]>>(`rooms/${ROOM_ID}/itinerary`);
  await addPlaceWithEmulatorHook(page);
  await expect.poll(async () => (await readEmulatorData<PlaceItem[]>(`rooms/${ROOM_ID}/itinerary/Day 1`))?.length).toBe(4);
  const saved = await readEmulatorData<Record<string, PlaceItem[]>>(`rooms/${ROOM_ID}/itinerary`);
  expect(saved!['Day 1'].slice(0, 3)).toEqual(baseline!['Day 1']);
  expect(saved!['Day 2']).toEqual(baseline!['Day 2']);
  await page.reload();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await skipCompanionIntroduction(page);
  await expect(placeCardByName(page, 'Day 1', ORIGINAL_NAME)).toBeVisible();
  expect(await readEmulatorData(`rooms/${ROOM_ID}/itinerary`)).toEqual(saved);
});

for (const layout of [
  { width: 320, color: '#d9f3fb', os: 'dark' as const },
  { width: 390, color: '#172b4d', os: 'light' as const },
  { width: 1024, color: '#d9f3fb', os: 'light' as const },
]) {
  test(`time control: ${layout.width}px keyboard, touch target and theme`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: layout.width, height: 844 });
    await page.emulateMedia({ colorScheme: layout.os });
    await openTimeControlTrip(page, layout.color);
    const baseline = await readEmulatorData(`rooms/${ROOM_ID}/itinerary`);
    const editor = await openTimeControlEditor(page);
    await expect(editor.getByRole('heading', { name: '編輯景點' })).toBeFocused();
    await editor.getByLabel('自訂地標名稱（選填）').fill('合成長中文景點名稱LongUnbrokenPlaceNameWithoutSpaces');
    await editor.getByLabel('抵達時間').fill('10:00');
    const choice = editor.getByRole('checkbox', { name: '重新計算後續時間' });
    const minutes = editor.getByRole('spinbutton', { name: '前往下一站所需分鐘' });
    const transport = editor.getByRole('combobox', { name: '前往下一站的交通方式' });
    await expect(transport).toHaveCSS('color-scheme', layout.color === '#172b4d' ? 'dark' : 'light');
    await expect(transport).toHaveValue('WALK');
    await minutes.focus();
    await page.keyboard.press('Tab');
    await expect(choice).toBeFocused();
    await page.keyboard.press('Space');
    await expect(choice).toBeChecked();
    await page.keyboard.press('Shift+Tab');
    await expect(minutes).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(choice).toBeFocused();
    const label = choice.locator('..');
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(await label.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
    await label.click();
    await expect(choice).not.toBeChecked();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const contrast = await label.getByText('重新計算後續時間', { exact: true }).evaluate((element) => {
      const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
      const rgba = (color: string) => {
        context.clearRect(0, 0, 1, 1);
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const value = [...context.getImageData(0, 0, 1, 1).data];
        return [value[0], value[1], value[2], value[3] / 255];
      };
      const over = (front: number[], back: number[]) => [
        ...front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3])), 1,
      ];
      const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, channel, i) => {
        const value = channel / 255;
        return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
      }, 0);
      const ancestors: Element[] = [];
      for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
      // Both extremes bound the unseen backdrop behind the translucent modal.
      const backgrounds = [[0, 0, 0, 1], [255, 255, 255, 1]].map((base) => ancestors.reduce((background, node) => {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) throw new Error('Unsupported gradient/group opacity');
        return over(rgba(style.backgroundColor), background);
      }, base));
      const ratios = backgrounds.map((background) => {
        const values = [luminance(background), luminance(over(rgba(getComputedStyle(element).color), background))];
        return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
      });
      return { ratios, fontSize: parseFloat(getComputedStyle(element).fontSize) };
    });
    expect(contrast.fontSize).toBeGreaterThanOrEqual(14);
    for (const ratio of contrast.ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
    await testInfo.attach('time-control-measurements', { body: JSON.stringify({ target: box, contrast }), contentType: 'application/json' });
    await testInfo.attach(`time-control-${layout.width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(editor).toHaveCount(0);
    const card = placeCardByName(page, 'Day 1', '合成預約景點1');
    await expect(card).toContainText('09:00');
    expect(await readEmulatorData(`rooms/${ROOM_ID}/itinerary`)).toEqual(baseline);
    await openTimeControlEditor(page);
    await page.getByLabel('抵達時間').fill('10:00');
    await expect(page.getByRole('checkbox', { name: '重新計算後續時間' })).not.toBeChecked();
  });
}

test('time control: 200% text keeps the choice and save controls reachable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTimeControlTrip(page);
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  const editor = await openTimeControlEditor(page);
  await editor.getByLabel('抵達時間').fill('10:00');
  const choice = editor.getByRole('checkbox', { name: '重新計算後續時間' });
  const choiceLabel = choice.locator('..');
  const save = editor.getByRole('button', { name: '儲存變更' });
  const cancel = editor.getByRole('button', { name: '取消' });

  await expect(choice).toBeVisible();
  await choiceLabel.scrollIntoViewIfNeeded();
  const choiceBox = await choiceLabel.boundingBox();
  expect(choiceBox).not.toBeNull();
  expect(choiceBox!.height).toBeGreaterThanOrEqual(44);
  expect(await choiceLabel.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  await choice.focus();
  await page.keyboard.press('Space');
  await expect(choice).toBeChecked();

  await save.scrollIntoViewIfNeeded();
  for (const control of [save, cancel]) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    })).toBe(true);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await testInfo.attach('time-control-200-percent', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await save.click();
  await expect(editor).toHaveCount(0);
  await expect.poll(async () => {
    const data = await readEmulatorData<Record<string, PlaceItem[]>>(`rooms/${ROOM_ID}/itinerary`);
    return data?.['Day 1'].map((item) => item.time);
  }).toEqual(['10:00', '10:40', '11:20']);
});

test('time control: rejected save keeps the draft and choice; retry writes once', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let rejected = 0;
  let forwardedWrites = 0;
  // Deny only this test's first itinerary update at the transport boundary.
  // Auth, Rules and the shared fixture remain unchanged; nothing is written by the rejected request.
  await page.routeWebSocket(/ws:\/\/127\.0\.0\.1:9000\//, (socket) => {
    const server = socket.connectToServer();
    socket.onMessage((message) => {
      const payload = JSON.parse(String(message));
      const request = payload?.d;
      if (payload.t === 'd' && request?.a === 'm'
        && String(request.b?.p).replace(/^\//, '') === `rooms/${ROOM_ID}`
        && request.b?.d?.itinerary) {
        if (rejected === 0) {
          rejected += 1;
          socket.send(JSON.stringify({ t: 'd', d: { r: request.r, b: { s: 'permission_denied', d: 'Synthetic test rejection' } } }));
          return;
        }
        forwardedWrites += 1;
      }
      server.send(message);
    });
  });
  await openTimeControlTrip(page);
  const baseline = await readEmulatorData(`rooms/${ROOM_ID}/itinerary`);
  const editor = await openTimeControlEditor(page);
  await editor.getByLabel('抵達時間').fill('10:00');
  await editor.getByRole('checkbox', { name: '重新計算後續時間' }).check();
  await editor.getByRole('button', { name: '儲存變更' }).click();
  await expect(page.getByTestId('toast').filter({ hasText: '無法更新景點' })).toBeVisible();
  expect(rejected).toBe(1);
  expect(forwardedWrites).toBe(0);
  expect(await readEmulatorData(`rooms/${ROOM_ID}/itinerary`)).toEqual(baseline);
  await expect(editor.getByLabel('抵達時間')).toHaveValue('10:00');
  await expect(editor.getByRole('checkbox', { name: '重新計算後續時間' })).toBeChecked();
  await editor.getByRole('button', { name: '儲存變更' }).click();
  await expect(editor).toHaveCount(0);
  expect(forwardedWrites).toBe(1);
  await expect.poll(async () => (await readEmulatorData<PlaceItem[]>(`rooms/${ROOM_ID}/itinerary/Day 1`))?.map((item) => item.time))
    .toEqual(['10:00', '10:40', '11:20']);
});

test('shows a success toast after creating a place', async ({ page }) => {
  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  await addPlaceWithEmulatorHook(page);

  await expect(placeCardByName(page, 'Day 1', ORIGINAL_NAME)).toBeVisible({
    timeout: 15_000,
  });

  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '景點已加入行程' });
  await expect(successToast).toHaveCount(1);
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('行程與協作者畫面已更新。');
});

test('adds once to the selected day when the add action is triggered twice', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedTestTrip(ROOM_ID, {
    title: 'E2E selected day add trip',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [{
        id: 'selected-day-baseline',
        name: 'Day 1 原有景點',
        customName: '',
        lat: 25.0324,
        lng: 121.5645,
        time: '09:00',
        stayTime: '30',
        tags: [],
      }],
      'Day 2': [],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({ timeout: 20_000 });
  await skipCompanionIntroduction(page);
  await page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]',
  ).click();

  await expect
    .poll(() => page.evaluate(() => {
      const hook = (window as Window & {
        __TRAVEL_E2E__?: {
          addTestPlace?: () => void;
          addTestPlaceDayId?: string;
        };
      }).__TRAVEL_E2E__;
      return typeof hook?.addTestPlace === 'function'
        && hook.addTestPlaceDayId === 'Day 2';
    }))
    .toBe(true);

  await page.evaluate(() => {
    const addTestPlace = (window as Window & {
      __TRAVEL_E2E__?: { addTestPlace?: () => void };
    }).__TRAVEL_E2E__?.addTestPlace;
    addTestPlace?.();
    addTestPlace?.();
  });

  await expect(placeCardByName(page, 'Day 2', ORIGINAL_NAME)).toBeVisible({ timeout: 15_000 });
  const successToast = page.getByTestId('toast').filter({ hasText: '景點已加入行程' });
  await expect(successToast).toHaveCount(1);
  await expect(successToast).toContainText('景點已加入 Day 2');

  await expect.poll(async () => {
    const [dayOne, dayTwo] = await Promise.all([
      readEmulatorData<PlaceItem[]>(`rooms/${ROOM_ID}/itinerary/Day 1`),
      readEmulatorData<PlaceItem[]>(`rooms/${ROOM_ID}/itinerary/Day 2`),
    ]);
    return {
      dayOneAddedCount: Array.isArray(dayOne)
        ? dayOne.filter((item) => item.name === ORIGINAL_NAME).length
        : 0,
      dayTwoAddedCount: Array.isArray(dayTwo)
        ? dayTwo.filter((item) => item.name === ORIGINAL_NAME).length
        : 0,
    };
  }).toEqual({ dayOneAddedCount: 0, dayTwoAddedCount: 1 });
});

test('shows a success toast after editing a place', async ({ page }) => {
  const seededPlaceName = 'E2E Toast Edit Place';
  await seedTestTrip(ROOM_ID, {
    title: 'E2E place edit toast trip',
    itinerary: {
      'Day 1': [
        {
          id: 'edit-toast-place',
          name: seededPlaceName,
          place_id: 'edit-toast-place-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Toast Edit address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
        },
      ],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  const placeCard = placeCardByName(page, 'Day 1', seededPlaceName);
  await expect(placeCard).toBeVisible();
  await placeCard.click();
  await page.getByTestId('place-detail-edit-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeVisible();

  await page.getByTestId('place-name-input').fill(EDITED_NAME);
  await page.getByTestId('place-arrival-time-input').fill('12:30');
  await page.getByTestId('place-stay-duration-input').fill('75');
  await page.getByTestId('place-note-input').fill(EDITED_NOTE);
  await page.getByTestId('save-place-button').click();

  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(placeCardByName(page, 'Day 1', EDITED_NAME)).toBeVisible({
    timeout: 15_000,
  });

  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '景點已更新' });
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('最新內容已同步給協作者。');
});

test('cancelling an edit keeps the original place in UI, Database, and reload', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const seededPlaceName = 'E2E Cancel Edit Place';
  await seedTestTrip(ROOM_ID, {
    title: 'E2E cancel edit trip',
    itinerary: {
      'Day 1': [{
        id: 'cancel-edit-place',
        name: seededPlaceName,
        place_id: 'cancel-edit-place-id',
        customName: '',
        lat: 25.033,
        lng: 121.5654,
        address: 'E2E Cancel Edit address',
        time: '09:00',
        stayTime: '60',
        memo: '原始筆記',
        tags: [],
      }],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({ timeout: 20_000 });
  await skipCompanionIntroduction(page);
  const detailTrigger = placeCardByName(page, 'Day 1', seededPlaceName)
    .getByTestId('place-details-trigger');
  await detailTrigger.click();
  await page.getByTestId('place-detail-edit-button').click();

  const editor = page.getByRole('dialog', { name: '編輯景點' });
  await expect(editor).toBeVisible();
  await page.getByTestId('place-name-input').fill('不應儲存的名稱');
  await page.getByTestId('place-note-input').fill('不應儲存的筆記');
  await editor.getByRole('button', { name: '取消' }).click();

  await expect(editor).toHaveCount(0);
  await expect(detailTrigger).toBeFocused();
  await expect(placeCardByName(page, 'Day 1', seededPlaceName)).toBeVisible();
  await expect(placeCardByName(page, 'Day 1', '不應儲存的名稱')).toHaveCount(0);

  await expect.poll(async () => {
    const dayItems = await readEmulatorData<PlaceItem[]>(
      `rooms/${ROOM_ID}/itinerary/Day 1`,
    );
    const item = Array.isArray(dayItems)
      ? dayItems.find((candidate) => candidate.id === 'cancel-edit-place')
      : null;
    return item ? { customName: item.customName, memo: item.memo } : null;
  }).toEqual({ customName: '', memo: '原始筆記' });

  await page.reload();
  await expect(page.getByTestId('active-trip-view')).toBeVisible({ timeout: 20_000 });
  await skipCompanionIntroduction(page);
  await expect(placeCardByName(page, 'Day 1', seededPlaceName)).toBeVisible();
  await expect(placeCardByName(page, 'Day 1', '不應儲存的名稱')).toHaveCount(0);
});

test('新增、編輯景點與詳細資訊會保存到 Firebase Emulator', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            typeof (
              window as Window & {
                __TRAVEL_E2E__?: {
                  addTestPlace?: () => void;
                };
              }
            ).__TRAVEL_E2E__?.addTestPlace === 'function',
        ),
      {
        timeout: 10_000,
        message: 'TripDetail 應註冊 Emulator E2E 景點新增 hook',
      },
    )
    .toBe(true);

  await page.evaluate(() => {
    const e2eWindow = window as Window & {
      __TRAVEL_E2E__?: {
        addTestPlace?: () => void;
      };
    };

    e2eWindow.__TRAVEL_E2E__?.addTestPlace?.();
  });

  let placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: ORIGINAL_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 15_000,
  });

  await expect
    .poll(
      async () => {
        const dayItems = await readEmulatorData<PlaceItem[]>(
          `rooms/${ROOM_ID}/itinerary/Day 1`,
        );

        return Array.isArray(dayItems)
          ? dayItems.some((item) => item.name === ORIGINAL_NAME)
          : false;
      },
      {
        timeout: 15_000,
        message: '新增景點後應寫入 Database Emulator',
      },
    )
    .toBe(true);

  await page.reload();

  placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: ORIGINAL_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  await placeCard.click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await expect(page.getByTestId('place-detail-title')).toHaveText(
    ORIGINAL_NAME,
  );

  await page.getByTestId('place-detail-edit-button').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();

  await page.getByTestId('place-name-input').fill(EDITED_NAME);
  await page.getByTestId('place-arrival-time-input').fill('12:30');
  await page.getByTestId('place-stay-duration-input').fill('75');
  await page.getByTestId('place-note-input').fill(EDITED_NOTE);
  await page.getByTestId('save-place-button').click();

  placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: EDITED_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 15_000,
  });

  await expect
    .poll(
      async () => {
        const dayItems = await readEmulatorData<PlaceItem[]>(
          `rooms/${ROOM_ID}/itinerary/Day 1`,
        );

        const editedPlace = Array.isArray(dayItems)
          ? dayItems.find((item) => item.customName === EDITED_NAME)
          : null;

        return editedPlace
          ? {
              customName: editedPlace.customName,
              time: editedPlace.time,
              stayTime: String(editedPlace.stayTime),
              memo: editedPlace.memo,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '編輯後的景點資料應寫入 Database Emulator',
      },
    )
    .toEqual({
      customName: EDITED_NAME,
      time: '12:30',
      stayTime: '75',
      memo: EDITED_NOTE,
    });

  await page.reload();

  placeCard = page
    .getByTestId('place-card')
    .filter({ hasText: EDITED_NAME })
    .first();

  await expect(placeCard).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  await placeCard.click();

  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await expect(page.getByTestId('place-detail-title')).toHaveText(
    EDITED_NAME,
  );
  await expect(page.getByTestId('place-detail-note')).toHaveText(
    EDITED_NOTE,
  );
});

test('uses the shared confirmation dialog before deleting a place', async ({
  page,
}) => {
  const placeName = 'E2E Shared Confirm Place';
  await seedTestTrip(ROOM_ID, {
    title: 'E2E shared delete confirmation trip',
    itinerary: {
      'Day 1': [
        {
          id: 'shared-confirm-delete-place',
          name: placeName,
          place_id: 'shared-confirm-delete-place-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Shared Confirm address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
        },
      ],
    },
  });

  let nativeDialogSeen = false;
  const nativeDialogHandler = async (dialog: Dialog) => {
    nativeDialogSeen = true;
    await dialog.dismiss();
  };
  page.on('dialog', nativeDialogHandler);

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);
  await expect(placeCardByName(page, 'Day 1', placeName)).toBeVisible();

  await openDeleteConfirmationForPlace(page, 'Day 1', placeName);
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await expect(page.getByTestId('confirm-dialog')).toContainText('刪除這個景點？');
  await expect(page.getByTestId('confirm-dialog')).toContainText(
    '刪除後，這個景點會從所有協作者的行程中移除。',
  );
  await expect(page.getByTestId('confirm-cancel')).toHaveText('保留景點');
  await expect(page.getByTestId('confirm-accept')).toHaveText('刪除景點');

  await page.getByTestId('confirm-cancel').click();
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(placeCardByName(page, 'Day 1', placeName)).toBeVisible();
  expect(nativeDialogSeen).toBe(false);

  await openDeleteConfirmationForPlace(page, 'Day 1', placeName);
  await page.getByTestId('confirm-accept').click();

  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(placeCardByName(page, 'Day 1', placeName)).toBeHidden({
    timeout: 20_000,
  });
  const successToast = page
    .getByTestId('toast')
    .filter({ hasText: '景點已刪除' });
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('data-toast-type', 'success');
  await expect(successToast).toContainText('行程與協作者畫面已更新。');

  await expect
    .poll(
      async () => {
        const dayItems = await readEmulatorData<PlaceItem[]>(
          `rooms/${ROOM_ID}/itinerary/Day 1`,
        );

        return Array.isArray(dayItems)
          ? dayItems.some((item) => item.id === 'shared-confirm-delete-place')
          : false;
      },
      {
        timeout: 15_000,
        message: 'deleted place should be removed from Database Emulator',
      },
    )
    .toBe(false);

  page.off('dialog', nativeDialogHandler);
});

test('mobile day switching does not accidentally trigger place editing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 414, height: 896 });
  await seedTestTrip(ROOM_ID, {
    title: 'E2E mobile day switch trip',
    startDate: '2026-09-20',
    endDate: '2026-09-22',
    itinerary: {
      'Day 1': [
        {
          id: 'mobile-day1-place',
          name: 'E2E Day1 museum',
          place_id: 'mobile-day1-place-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Day1 address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
      ],
      'Day 2': [
        {
          id: 'mobile-day2-place',
          name: 'E2E Day2 coffee',
          place_id: 'mobile-day2-place-id',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: 'E2E Day2 address',
          time: '10:00',
          stayTime: '45',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 5,
          },
        },
      ],
      'Day 3': [
        {
          id: 'mobile-day3-place',
          name: 'E2E Day3 bakery',
          place_id: 'mobile-day3-place-id',
          customName: '',
          lat: 25.035,
          lng: 121.5674,
          address: 'E2E Day3 address',
          time: '11:00',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 6,
          },
        },
      ],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  const day1Switch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 1"]',
  );
  const day2Switch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]',
  );
  const day3Switch = page.locator(
    '[data-testid="itinerary-day-switch-button"][data-day-id="Day 3"]',
  );

  await expect(day1Switch).toBeVisible();
  await expect(day2Switch).toBeVisible();
  await expect(day3Switch).toBeVisible();
  await expect(day1Switch).toHaveAttribute('aria-pressed', 'true');

  const day1Place = placeCardByName(page, 'Day 1', 'E2E Day1 museum');
  const day1ActionTrigger = day1Place.getByTestId('place-action-menu-trigger');

  await expect(day1Place).toBeVisible();
  await expect(day1ActionTrigger).toBeVisible();
  await expect(day1ActionTrigger).toHaveAttribute('aria-haspopup', 'menu');
  await expect(day1ActionTrigger).toHaveAttribute('aria-expanded', 'false');
  await expect(day1Place.getByTestId('desktop-place-actions')).toBeHidden();
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await day2Switch.click();

  await expect(day2Switch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await day3Switch.click();

  await expect(day3Switch).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('edit-place-modal')).toHaveCount(0);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);

  const day3Place = placeCardByName(page, 'Day 3', 'E2E Day3 bakery');
  const day3ActionTrigger = day3Place.getByTestId('place-action-menu-trigger');

  await expect(day3Place).toBeVisible();
  await expect(day3Place.getByTestId('desktop-place-actions')).toBeHidden();
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await day3ActionTrigger.click();
  await expect(page.getByTestId('place-action-edit')).toBeVisible();
  await expect(page.getByTestId('place-action-delete')).toBeVisible();
  await page.getByTestId('place-action-edit').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
});

test('mobile place action menu stays visible and closes on outside interaction', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedTestTrip(ROOM_ID, {
    title: 'E2E mobile action menu trip',
    startDate: '2026-09-20',
    endDate: '2026-09-21',
    itinerary: {
      'Day 1': [
        {
          id: 'mobile-menu-place-a',
          name: 'E2E Action first',
          place_id: 'mobile-menu-place-a-id',
          customName: '',
          lat: 25.033,
          lng: 121.5654,
          address: 'E2E Action first address',
          time: '09:00',
          stayTime: '60',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 10,
          },
        },
        {
          id: 'mobile-menu-place-b',
          name: 'E2E Action second',
          place_id: 'mobile-menu-place-b-id',
          customName: '',
          lat: 25.034,
          lng: 121.5664,
          address: 'E2E Action second address',
          time: '10:10',
          stayTime: '45',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 5,
          },
        },
      ],
      'Day 2': [
        {
          id: 'mobile-menu-place-c',
          name: 'E2E Action third',
          place_id: 'mobile-menu-place-c-id',
          customName: '',
          lat: 25.035,
          lng: 121.5674,
          address: 'E2E Action third address',
          time: '11:00',
          stayTime: '30',
          memo: '',
          tags: [],
          nextLeg: {
            mode: 'WALK',
            mins: 6,
          },
        },
      ],
    },
  });

  await page.goto(`/?room=${ROOM_ID}`);

  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  const firstPlace = placeCardByName(page, 'Day 1', 'E2E Action first');
  const secondPlace = placeCardByName(page, 'Day 1', 'E2E Action second');
  const firstTrigger = firstPlace.getByTestId('place-action-menu-trigger');
  const secondTrigger = secondPlace.getByTestId('place-action-menu-trigger');

  await expect(firstPlace).toBeVisible();
  await expect(secondPlace).toBeVisible();
  await firstTrigger.click();

  await expect(page.getByTestId('place-action-menu')).toHaveCount(1);
  await expect(page.getByTestId('place-action-menu')).toHaveAttribute(
    'data-place-id',
    'mobile-menu-place-a',
  );
  await expectMenuWithinViewport(page);

  await secondTrigger.click();

  await expect(page.getByTestId('place-action-menu')).toHaveCount(1);
  await expect(page.getByTestId('place-action-menu')).toHaveAttribute(
    'data-place-id',
    'mobile-menu-place-b',
  );
  await expectMenuWithinViewport(page);

  await page.getByTestId('mobile-day-switcher').click({ position: { x: 4, y: 4 } });
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await firstTrigger.click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await expect(firstTrigger).toBeFocused();

  await firstTrigger.click();
  await expect(page.getByTestId('place-action-menu')).toBeVisible();
  await page
    .locator('[data-testid="itinerary-day-switch-button"][data-day-id="Day 2"]')
    .click();
  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);

  await page
    .locator('[data-testid="itinerary-day-switch-button"][data-day-id="Day 1"]')
    .click();
  await firstTrigger.click();
  await page.getByTestId('place-action-nearby').click();

  await expect(page.getByTestId('place-action-menu')).toHaveCount(0);
  await expect(page.getByTestId('map-panel')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  const reloadedFirstPlace = placeCardByName(page, 'Day 1', 'E2E Action first');
  await reloadedFirstPlace.getByTestId('place-action-menu-trigger').click();
  await page.getByTestId('place-action-edit').click();

  await expect(page.getByTestId('edit-place-modal')).toBeVisible();

  await page.reload();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await skipCompanionIntroduction(page);

  const desktopPlace = placeCardByName(page, 'Day 1', 'E2E Action first');
  await expect(desktopPlace.getByTestId('place-action-menu-trigger')).toBeHidden();
  // Desktop cards no longer expose a hover action row; navigate/edit/nearby/
  // copy/delete all live in Place Details, opened by clicking the card.
  await expect(desktopPlace.getByTestId('desktop-place-actions')).toHaveCount(0);
  await desktopPlace.click();
  const sheet = page.getByTestId('place-detail-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('place-detail-navigate-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-nearby-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-copy-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-delete-button')).toBeVisible();
  await expect(sheet.getByTestId('place-detail-edit-button')).toBeVisible();
});
