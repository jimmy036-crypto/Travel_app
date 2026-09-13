import { expect, test, type Locator, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  readEmulatorData,
  seedTestTrip,
  seedTestTripInvite,
} from './support/emulator';
import { markCurrentReleaseSeen } from './support/releaseNotes';
import { skipCompanionIntroduction } from './support/companion';

const SHELL_ROOM_ID = 'e2eappshelluxroom0001';
const COLLABORATION_ROOM_ID = 'e2eappshellcollaboration';
const LONG_CHINESE_TITLE = '台北與京都協作旅行規劃長中文旅程名稱';
const LONG_ENGLISH_TITLE = 'AnExtraordinarilyLongUnbrokenSyntheticTripNameForResponsiveVerification';

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectNoPageOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBeLessThanOrEqual(1);
}

// Compute contrast against each selected element's actual composited ancestor
// surfaces, not just the page background. The sampled elements have no gradients
// or group opacity; those require a separate visual calculation.
async function expectReadableContrast(locator: Locator): Promise<number> {
  const ratio = await locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const value = [...context.getImageData(0, 0, 1, 1).data];
      return [value[0], value[1], value[2], value[3] / 255];
    };
    const composite = (front: number[], back: number[]) => [
      ...front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3])),
      1,
    ];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
    let background = [255, 255, 255, 1];
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) {
        throw new Error('Contrast sample needs manual gradient/group-opacity analysis');
      }
      background = composite(rgba(style.backgroundColor), background);
    }
    const foreground = composite(rgba(getComputedStyle(element).color), background);
    const luminance = (channels: number[]) => channels.slice(0, 3).reduce((sum, channel, index) => {
      const value = channel / 255;
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const values = [luminance(foreground), luminance(background)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  return ratio;
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
  await skipCompanionIntroduction(page);
}

test('mobile lobby actions use a consistent responsive layout', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await markCurrentReleaseSeen(page);
  await seedShellTrip();

  await page.goto('/');

  const createButton = page.getByTestId('create-trip-button');
  const importButton = page.getByTestId('import-trip-button');

  await expect(page.getByTestId('travel-lobby')).toBeVisible();
  await expect(page.getByRole('heading', { name: '你的旅程', exact: true })).toBeVisible();
  await expect(page.getByText('Travel workspace', { exact: true })).toHaveCount(0);
  await expect(page.getByText('集中規劃行程、地圖、票券與旅費', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('app-settings-trigger')).toBeVisible();
  await expect(createButton).toBeVisible();
  await expect(importButton).toBeVisible();
  await expect(page.getByTestId('lobby-appearance-button')).toHaveCount(0);
  await expect(page.getByTestId('release-notes-trigger')).toHaveCount(0);

  const createBox = await createButton.boundingBox();
  const importBox = await importButton.boundingBox();
  const summaryBox = await page.getByTestId('lobby-next-trip-summary').boundingBox();
  const infoBox = await page.getByTestId('lobby-next-trip-summary-info').boundingBox();
  const visualBox = await page.getByTestId('lobby-next-trip-summary-visual-region').boundingBox();
  const headerBox = await page.locator('header').first().boundingBox();

  expect(createBox?.height).toBeGreaterThanOrEqual(44);
  expect(importBox?.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs((createBox?.width || 0) - (importBox?.width || 0))).toBeLessThanOrEqual(4);
  expect(summaryBox?.height).toBeGreaterThanOrEqual(168);
  expect(visualBox?.height).toBeGreaterThanOrEqual(84);
  expect((infoBox?.y || 0) + (infoBox?.height || 0)).toBeLessThanOrEqual((visualBox?.y || 0) + 1);
  expect(headerBox?.height || Number.POSITIVE_INFINITY).toBeLessThan(430);
  await testInfo.attach('after-copy-lobby-390', {
    body: await page.screenshot({
      path: `.tmp/copy-evidence/app-shell-${testInfo.project.name.replace(/[^a-z0-9-]/giu, '-')}-lobby-390.png`,
      animations: 'disabled',
    }),
    contentType: 'image/png',
  });

  await page.getByTestId('app-settings-trigger').click();
  await expect(page.getByTestId('app-settings-feature-introduction')).toBeVisible();
  await expect(page.getByTestId('app-settings-feature-introduction')).toHaveText('認識 Travel');
  await expect(page.getByTestId('app-settings-feature-introduction')).toHaveAccessibleName('認識 Travel');
  await expect(page.getByTestId('app-settings-feature-tour')).toHaveText('操作導覽');
  await expect(page.getByTestId('app-settings-feature-tour')).toHaveAccessibleName('開啟操作導覽');
  await expect(page.getByTestId('app-settings-appearance')).toBeVisible();
});

test('opens release notes and feature tour from the settings menu', async ({
  page,
}) => {
  await markCurrentReleaseSeen(page);
  await seedShellTrip();

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
  await expect(page.getByRole('dialog', { name: '你是這趟旅程中的哪位旅伴？', exact: true })).toBeVisible();
  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
  await skipCompanionIntroduction(page);
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

test('T3 lobby long names, native trip controls and theme surfaces remain usable across widths', async ({ page }, testInfo) => {
  await clearEmulatorDatabase();
  await markCurrentReleaseSeen(page);
  await seedTestTrip(SHELL_ROOM_ID, {
    title: LONG_CHINESE_TITLE,
    destination: '台北京都與沿途城鎮旅遊目的地長名稱',
    members: ['合成旅伴甲', 'SyntheticCompanionWithALongDisplayName'],
    themeColor: '#172b4d',
  });
  await seedTestTrip(COLLABORATION_ROOM_ID, {
    title: LONG_ENGLISH_TITLE,
    destination: 'AnExtraordinarilyLongUnbrokenSyntheticDestinationName',
    themeColor: '#d9f3fb',
  });
  await page.goto('/');
  const cards = [SHELL_ROOM_ID, COLLABORATION_ROOM_ID].map((roomId) => page.locator(`[data-testid="trip-card"][data-room-id="${roomId}"]`));
  const contrast: Record<string, number> = {};
  for (const width of [320, 375, 390, 768, 1024, 1440]) {
    await test.step(`${width}px lobby`, async () => {
      await page.setViewportSize({ width, height: 844 });
      for (const [index, card] of cards.entries()) {
        await expect(card).toBeVisible();
        await card.scrollIntoViewIfNeeded();
        const open = card.getByRole('button', { name: /^開啟旅程：/ });
        const tools = card.getByRole('button').filter({ hasNot: page.getByTestId('trip-card-title') });
        await expect(tools).toHaveCount(2);
        await expect(card.locator('button button, button a, button input')).toHaveCount(0);
        await expectTouchTarget(open);
        const toolBoxes = [];
        for (const tool of await tools.all()) {
          await expectTouchTarget(tool);
          toolBoxes.push((await tool.boundingBox())!);
        }
        const gap = toolBoxes[1].y > toolBoxes[0].y + 1
          ? toolBoxes[1].y - toolBoxes[0].y - toolBoxes[0].height
          : toolBoxes[1].x - toolBoxes[0].x - toolBoxes[0].width;
        expect(gap).toBeGreaterThanOrEqual(8);
        const titleBox = (await card.getByTestId('trip-card-title').boundingBox())!;
        expect(titleBox.y).toBeGreaterThanOrEqual(Math.max(...toolBoxes.map((box) => box.y + box.height)));
        const date = card.getByText('2026/09/20', { exact: false });
        expect(await date.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(14);
        if (width === 390) {
          contrast[`${index === 0 ? 'dark' : 'light'}-title`] = await expectReadableContrast(card.getByTestId('trip-card-title'));
          contrast[`${index === 0 ? 'dark' : 'light'}-date`] = await expectReadableContrast(date);
          await testInfo.attach(`after-${index === 0 ? 'dark' : 'light'}-trip-card-390`, { body: await card.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
        }
      }
      await expectNoPageOverflow(page);
      if (width === 320 || width === 1440) {
        await page.getByTestId('create-trip-button').scrollIntoViewIfNeeded();
        await testInfo.attach(`after-lobby-${width}`, { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
      }
    });
  }
  await testInfo.attach('sampled-composited-contrast', { body: JSON.stringify(contrast), contentType: 'application/json' });

  await page.setViewportSize({ width: 390, height: 844 });
  await cards[0].getByRole('button', { name: `編輯 ${LONG_CHINESE_TITLE}`, exact: true }).click();
  await expect(page.getByTestId('trip-modal')).toBeVisible();
  await expect(page.getByTestId('active-trip-view')).toHaveCount(0);
  await page.getByTestId('trip-modal').getByRole('button', { name: '取消', exact: true }).click();
  await cards[0].getByRole('button', { name: /^開啟旅程：/ }).press('Enter');
  await expect(page.getByTestId('trip-detail-title')).toHaveText(LONG_CHINESE_TITLE);
  await skipCompanionIntroduction(page);
  await page.getByTestId('back-to-lobby').click();
  await cards[1].getByRole('button', { name: /^開啟旅程：/ }).press('Space');
  await expect(page.getByTestId('trip-detail-title')).toHaveText(LONG_ENGLISH_TITLE);
  await skipCompanionIntroduction(page);
  await expect(page.getByTestId('mobile-bottom-navigation').getByRole('button')).toHaveText(['行程', '地圖', '票券', '記帳']);
});

test('T3 owner sharing loading, retry, clipboard fallback and confirmation remain truthful', async ({ page }, testInfo) => {
  await seedShellTrip();
  await markCurrentReleaseSeen(page);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem('google-travel-custom-bg', '#172b4d');
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('Synthetic clipboard denial'); } },
    });
  });
  await page.goto(`/?room=${SHELL_ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await skipCompanionIntroduction(page);
  let releaseInitialLoad!: () => void;
  const heldLoad = new Promise<void>((resolve) => { releaseInitialLoad = resolve; });
  let inviteLoads = 0;
  let mutations = 0;
  await page.route('**/getOrCreateTripInvite', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    inviteLoads += 1;
    if (inviteLoads !== 1) return route.continue();
    await heldLoad;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { status: 'UNAVAILABLE', message: 'Synthetic sharing load failure' } }) });
  });
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/(rotateTripInvite|revokeTripInvite|removeTripMember)$/.test(request.url())) mutations += 1;
  });
  const trigger = page.getByTestId('app-settings-trigger');
  await trigger.click();
  await page.getByTestId('app-settings-trip-share').click();
  const sharing = page.getByTestId('trip-sharing-dialog');
  await expect(sharing.getByRole('status')).toHaveText('正在載入分享設定…');
  await expect(sharing).not.toContainText('尚未啟用');
  await expect(sharing).not.toContainText('目前未啟用');
  await expect(page.getByTestId('trip-sharing-close')).toBeFocused();
  await testInfo.attach('after-sharing-loading-320', { body: await page.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  releaseInitialLoad();
  const loadError = sharing.getByRole('alert');
  await expect(loadError).toHaveCount(1);
  await expect(loadError).toBeVisible();
  await expect(loadError).toHaveText('服務目前無法連線，請稍後再試。');
  await expect(sharing.getByText('分享設定載入失敗，請重新載入。', { exact: true })).toHaveCount(0);
  await expect(sharing).not.toContainText('目前未啟用');
  const retryLoad = sharing.getByRole('button', { name: '重新載入分享設定', exact: true });
  await expect(retryLoad).toBeEnabled();
  await expectTouchTarget(retryLoad);
  await expectReadableContrast(loadError);
  await testInfo.attach('after-copy-sharing-error-320', {
    body: await page.screenshot({
      path: `.tmp/copy-evidence/app-shell-${testInfo.project.name.replace(/[^a-z0-9-]/giu, '-')}-sharing-error-320.png`,
      animations: 'disabled',
    }),
    contentType: 'image/png',
  });
  await retryLoad.click();
  const inviteInput = sharing.getByRole('textbox', { name: '旅程邀請連結' });
  await expect(inviteInput).toBeVisible();
  expect(inviteLoads).toBe(2);
  await expect(sharing.getByRole('alert')).toHaveCount(0);
  await page.getByTestId('copy-trip-invite').click();
  await expect(sharing.getByRole('alert')).toContainText('無法自動複製');
  await expect(inviteInput).toBeFocused();
  expect(await inviteInput.evaluate((element: HTMLInputElement) => element.selectionEnd! - element.selectionStart!)).toBeGreaterThan(43);
  await expect(page.getByTestId('toast').filter({ hasText: '邀請連結已複製' })).toHaveCount(0);
  await expectTouchTarget(page.getByTestId('trip-sharing-close'));
  for (const id of ['copy-trip-invite', 'rotate-trip-invite', 'revoke-trip-invite']) await expectTouchTarget(page.getByTestId(id));
  await expectNoPageOverflow(page);
  await expectReadableContrast(sharing.getByText('受邀者需以 Google 登入並透過有效連結加入。請勿公開張貼。', { exact: true }));
  await expect(sharing.getByText('安全共編', { exact: true })).toHaveCount(0);
  const inviteBefore = await readEmulatorData(`roomAccess/${SHELL_ROOM_ID}/invite`);
  for (const id of ['rotate-trip-invite', 'revoke-trip-invite']) {
    await page.getByTestId(id).click();
    const confirmation = page.getByTestId('confirm-dialog');
    await expect(confirmation).toBeVisible();
    await page.keyboard.press('Tab');
    expect(await confirmation.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.getByTestId('confirm-cancel').click();
    await expect(confirmation).toHaveCount(0);
    await expect(sharing).toBeVisible();
  }
  await page.getByTestId('rotate-trip-invite').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(sharing).toBeVisible();
  expect(mutations).toBe(0);
  expect(await readEmulatorData(`roomAccess/${SHELL_ROOM_ID}/invite`)).toEqual(inviteBefore);
  await testInfo.attach('after-sharing-dark-320', { body: await page.screenshot({ animations: 'disabled', mask: [inviteInput] }), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  await expect(sharing).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('T3 returning between owner and editor trips keeps permissions and sharing scoped', async ({ page }) => {
  await seedShellTrip();
  await seedTestTrip(COLLABORATION_ROOM_ID, { title: 'E2E editor collaboration trip', ownerUid: 'e2e-invite-owner' });
  const token = await seedTestTripInvite(COLLABORATION_ROOM_ID, { createdByUid: 'e2e-invite-owner' });
  await markCurrentReleaseSeen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('import-trip-button').click();
  await page.getByRole('textbox', { name: '旅程邀請連結' }).fill(`https://example.test/#invite=${token}`);
  await page.getByRole('button', { name: '驗證並加入' }).click();
  await expect(page.getByTestId('trip-detail-title')).toHaveText('E2E editor collaboration trip');
  await skipCompanionIntroduction(page);
  await page.getByTestId('app-settings-trigger').click();
  await expect(page.getByTestId('app-settings-trip-share')).toHaveCount(0);
  await expect(page.getByTestId('app-settings-menu')).toContainText('共同編輯');
  await expect(page.getByTestId('app-settings-menu')).toContainText('只有擁有者可以邀請或管理成員');
  await page.keyboard.press('Escape');
  await page.getByTestId('back-to-lobby').click();
  const ownerCard = page.locator(`[data-testid="trip-card"][data-room-id="${SHELL_ROOM_ID}"]`);
  const editorCard = page.locator(`[data-testid="trip-card"][data-room-id="${COLLABORATION_ROOM_ID}"]`);
  await expect(editorCard.getByTestId('trip-role-badge')).toHaveText('共同編輯');
  await expect(editorCard.getByTestId('delete-trip-action')).toHaveCount(0);
  await ownerCard.getByRole('button', { name: /^開啟旅程：/ }).press('Enter');
  await skipCompanionIntroduction(page);
  await page.getByTestId('app-settings-trigger').click();
  await page.getByTestId('app-settings-trip-share').click();
  await expect(page.getByTestId('trip-sharing-dialog').getByRole('textbox', { name: '旅程邀請連結' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByTestId('back-to-lobby').click();
  await editorCard.getByRole('button', { name: /^開啟旅程：/ }).press('Space');
  await expect(page.getByTestId('trip-detail-title')).toHaveText('E2E editor collaboration trip');
  await expect(page.getByTestId('trip-sharing-dialog')).toHaveCount(0);
  await page.getByTestId('app-settings-trigger').click();
  await expect(page.getByTestId('app-settings-trip-share')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '旅程邀請連結' })).toHaveCount(0);
});

test('T3 lobby and sharing controls reflow at html font-size equivalent 200%', async ({ page }, testInfo) => {
  await seedShellTrip();
  await markCurrentReleaseSeen(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => { localStorage.setItem('google-travel-custom-bg', '#d9f3fb'); });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  const card = page.locator(`[data-testid="trip-card"][data-room-id="${SHELL_ROOM_ID}"]`);
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: /^開啟旅程：/ })).toBeVisible();
  await expect(card.getByRole('button')).toHaveCount(3);
  await card.scrollIntoViewIfNeeded();
  await expectNoPageOverflow(page);
  for (const button of await card.getByRole('button').all()) await expectTouchTarget(button);
  const cardBox = (await card.boundingBox())!;
  for (const tool of await card.getByRole('button').filter({ hasNot: page.getByTestId('trip-card-title') }).all()) {
    const box = (await tool.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    await tool.scrollIntoViewIfNeeded();
    expect(await tool.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
    })).toBe(true);
  }
  await expectReadableContrast(card.getByText('2026/09/20', { exact: false }));
  await testInfo.attach('after-card-200-percent-html-font-size', { body: await card.screenshot({ animations: 'disabled' }), contentType: 'image/png' });
  await card.getByRole('button', { name: /^開啟旅程：/ }).click();
  await skipCompanionIntroduction(page);
  await page.getByTestId('app-settings-trigger').click();
  await page.getByTestId('app-settings-trip-share').click();
  const sharing = page.getByTestId('trip-sharing-dialog');
  const inviteInput = sharing.getByRole('textbox', { name: '旅程邀請連結' });
  await expect(inviteInput).toBeVisible();
  await expectNoPageOverflow(page);
  await expectTouchTarget(page.getByTestId('trip-sharing-close'));
  for (const id of ['copy-trip-invite', 'rotate-trip-invite', 'revoke-trip-invite']) {
    const control = page.getByTestId(id);
    await control.scrollIntoViewIfNeeded();
    await expectTouchTarget(control);
    const overflow = await control.evaluate((element) => ({ x: element.scrollWidth - element.clientWidth, y: element.scrollHeight - element.clientHeight }));
    expect(overflow.x).toBeLessThanOrEqual(1);
    expect(overflow.y).toBeLessThanOrEqual(1);
  }
  await expectReadableContrast(sharing.getByText('受邀者需以 Google 登入並透過有效連結加入。請勿公開張貼。', { exact: true }));
  await testInfo.attach('after-sharing-light-200-percent-html-font-size', { body: await page.screenshot({ animations: 'disabled', mask: [inviteInput] }), contentType: 'image/png' });
  await page.getByTestId('trip-sharing-close').click();
  await expect(sharing).toHaveCount(0);
  await expect(page.getByTestId('app-settings-trigger')).toBeFocused();
});
