import { expect, test, type Page, type Locator } from '@playwright/test';
import { markReleaseSeen, openTicketPanel, prepareTicketRoom, MEMBER_A, MEMBER_B } from './support/tickets';
import { readEmulatorData, seedTestTrip, seedTestTripInvite, writeEmulatorData } from './support/emulator';

const ROOM = 'e2ecompanionidentity001';
const storageKey = (uid = 'e2e-owner', room = ROOM) => `travel-companion-v1:${JSON.stringify(['firebase', uid, room])}`;
const checklist = { c1: { id: 'c1', scope: 'shared', text: '合成行前項目', category: 'todo', completed: false, completedBy: '', createdAt: 1 } };
async function choose(page: Page, member: string) {
  await page.getByRole('button', { name: /^(選擇旅伴|更正旅伴)$/ }).click();
  await page.getByTestId('companion-member').filter({ hasText: member }).click();
  await expect(page.getByTestId('companion-picker')).toHaveCount(0);
}
async function openChecklist(page: Page) {
  await page.getByTestId('app-settings-trigger').click();
  await page.getByTestId('app-settings-trip-checklist').click();
  await expect(page.getByRole('dialog', { name: '行前清單', exact: true })).toBeVisible();
}
async function openExpense(page: Page) {
  await page.locator('[data-testid="expense-tab-button"]:visible').click();
  await page.getByTestId('add-expense-button').click();
  await expect(page.getByTestId('expense-modal')).toBeVisible();
}
async function target(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await control.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}
test.beforeEach(async ({ page }) => {
  await prepareTicketRoom(ROOM);
  await writeEmulatorData(`rooms/${ROOM}/checklist`, checklist);
  await markReleaseSeen(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

test('B0-01/05/06: confirm once, browse another member, share with checklist and new payer, restore', async ({ page }, testInfo) => {
  let businessWrites = 0;
  page.on('websocket', socket => socket.on('framesent', frame => {
    try {
      const request = JSON.parse(String(frame.payload))?.d;
      if (['p', 'm'].includes(request?.a) && String(request?.b?.p).startsWith('/rooms/')) businessWrites += 1;
    } catch { /* Firebase framing/control packets are not JSON writes. */ }
  }));
  await openTicketPanel(page, ROOM);
  const writesBefore = businessWrites;
  const before = await readEmulatorData(`rooms/${ROOM}`);
  await choose(page, MEMBER_A);
  await page.getByTestId('ticket-filter-member').filter({ hasText: MEMBER_B }).click();
  await expect(page.getByTestId('companion-notice')).toContainText(`本趟旅伴：${MEMBER_A}`);
  await page.screenshot({ path: `.tmp/b0-evidence/after-wallet-390-${testInfo.project.name}.png` });
  expect(await readEmulatorData(`rooms/${ROOM}`)).toEqual(before);
  expect(businessWrites).toBe(writesBefore);
  await openChecklist(page);
  const dialog = page.getByRole('dialog', { name: '行前清單', exact: true });
  await expect(dialog).toContainText(`本趟旅伴：${MEMBER_A}`);
  await dialog.getByRole('button', { name: '標記為已完成' }).click();
  await expect.poll(async () => (await readEmulatorData<{ completedBy: string }>(`rooms/${ROOM}/checklist/c1`))?.completedBy).toBe(MEMBER_A);
  await dialog.getByRole('button', { name: '關閉行前清單' }).click();
  await openExpense(page);
  await expect(page.getByTestId('expense-payer-select')).toHaveValue(MEMBER_A);
  await page.screenshot({ path: `.tmp/b0-evidence/after-payer-390-${testInfo.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.reload();
  await openTicketPanel(page, ROOM);
  await expect(page.getByTestId('companion-notice')).toContainText(`本趟旅伴：${MEMBER_A}`);
  await expect(page.getByText('設定你在這趟旅程中的名字')).toHaveCount(0);
});

test('B0-06: cancel confirmation writes nothing; confirming does not complete until another explicit click', async ({ page }) => {
  await openTicketPanel(page, ROOM);
  await page.getByRole('button', { name: '先看全部' }).click();
  await openChecklist(page);
  const dialog = page.getByRole('dialog', { name: '行前清單', exact: true });
  await expect(dialog.getByText('設定你在這趟旅程中的名字')).toHaveCount(0);
  await dialog.getByRole('button', { name: '標記為已完成' }).click();
  await page.getByTestId('companion-picker').getByRole('button', { name: '取消' }).click();
  expect(await readEmulatorData(`rooms/${ROOM}/checklist`)).toEqual(checklist);
  await expect(dialog.getByRole('button', { name: '標記為已完成' })).toBeFocused();
  await dialog.getByRole('button', { name: '標記為已完成' }).click();
  await page.getByTestId('companion-member').filter({ hasText: MEMBER_B }).press('Space');
  expect(await readEmulatorData(`rooms/${ROOM}/checklist`)).toEqual(checklist);
  await dialog.getByRole('button', { name: '標記為已完成' }).click();
  await expect.poll(async () => (await readEmulatorData<{ completedBy: string }>(`rooms/${ROOM}/checklist/c1`))?.completedBy).toBe(MEMBER_B);
});

test('B0-07: unconfirmed payer blocks save, explicit payer saves exact split without confirming identity', async ({ page }) => {
  await openTicketPanel(page, ROOM);
  await openExpense(page);
  await expect(page.getByTestId('expense-payer-select')).toHaveValue('');
  await page.getByTestId('expense-item-input').fill('合成晚餐');
  await page.getByTestId('expense-local-cost-input').fill('1000');
  await Promise.all([
    page.waitForEvent('dialog').then(async prompt => {
      expect(prompt.message()).toBe('請選擇付款人。');
      await prompt.accept();
    }),
    page.getByTestId('expense-save-button').click(),
  ]);
  expect(await readEmulatorData(`rooms/${ROOM}/expenses`)).toBeNull();
  await page.getByTestId('expense-payer-select').selectOption(MEMBER_B);
  await page.getByTestId('expense-save-button').click();
  await expect(page.getByTestId('expense-modal')).toHaveCount(0);
  const saved = Object.values((await readEmulatorData<Record<string, unknown>>(`rooms/${ROOM}/expenses`)) || {});
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ payer: MEMBER_B, cost: 1000, split: { [MEMBER_A]: 500, [MEMBER_B]: 500 } });
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey())).toBeNull();
});

test('B0-11: long names, keyboard and targets at 320/375/390/768/1024 plus html font-size 200%', async ({ page }, testInfo) => {
  const longNames = ['合成旅伴很長的中文名字用來驗證換行', 'SyntheticCompanionWithAnUnbrokenLongEnglishName'];
  await writeEmulatorData(`rooms/${ROOM}/meta/members`, longNames);
  await openTicketPanel(page, ROOM);
  for (const width of [320, 375, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 });
    const entry = page.getByRole('button', { name: '選擇旅伴', exact: true });
    await target(entry);
    await entry.press('Enter');
    const picker = page.getByTestId('companion-picker');
    await expect(picker.getByRole('button', { name: '取消' })).toBeFocused();
    for (const control of await picker.getByRole('button').all()) await target(control);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    if (width === 320 || width === 390) await page.screenshot({ path: `.tmp/b0-evidence/after-picker-${width}-${testInfo.project.name}.png` });
    await page.keyboard.press('Escape');
    await expect(entry).toBeFocused();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await page.getByRole('button', { name: '選擇旅伴', exact: true }).click();
  for (const control of await page.getByTestId('companion-picker').getByRole('button').all()) await target(control);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `.tmp/b0-evidence/after-picker-200pct-${testInfo.project.name}.png` });
  await page.keyboard.press('Escape');
});

test('B0-02: same account trip switch isolates and restores local preference', async ({ page }) => {
  const otherRoom = `${ROOM}y`;
  await seedTestTrip(otherRoom, { members: [MEMBER_A, MEMBER_B] });
  await openTicketPanel(page, ROOM);
  await choose(page, MEMBER_A);
  await openTicketPanel(page, otherRoom);
  await expect(page.getByText('設定你在這趟旅程中的名字')).toBeVisible();
  await choose(page, MEMBER_B);
  await openTicketPanel(page, ROOM);
  await expect(page.getByTestId('companion-notice')).toContainText(`本趟旅伴：${MEMBER_A}`);
});

test('B0-08: correcting companion inside an open draft preserves payer, amount and split', async ({ page }) => {
  await openTicketPanel(page, ROOM);
  await choose(page, MEMBER_A);
  await openExpense(page);
  const expense = page.getByTestId('expense-modal');
  await page.getByTestId('expense-item-input').fill('保留中的草稿');
  await page.getByTestId('expense-local-cost-input').fill('1000');
  await expense.getByRole('button', { name: '更正旅伴', exact: true }).click();
  await page.getByTestId('companion-member').filter({ hasText: MEMBER_B }).click();
  await expect(page.getByTestId('expense-payer-select')).toHaveValue(MEMBER_A);
  await expect(page.getByTestId('expense-local-cost-input')).toHaveValue('1000');
  await expect(expense.getByTestId('companion-notice')).toContainText(`本趟旅伴：${MEMBER_B}`);
  await page.getByTestId('expense-save-button').click();
  await expect(expense).toHaveCount(0);
  const records = Object.values((await readEmulatorData<Record<string, unknown>>(`rooms/${ROOM}/expenses`)) || {});
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ payer: MEMBER_A, cost: 1000, split: { [MEMBER_A]: 500, [MEMBER_B]: 500 } });
  await page.getByTestId('add-expense-button').click();
  await expect(page.getByTestId('expense-payer-select')).toHaveValue(MEMBER_B);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '編輯帳目 保留中的草稿', exact: true }).click();
  await expect(page.getByTestId('expense-payer-select')).toHaveValue(MEMBER_A);
  await expense.getByRole('button', { name: '更正旅伴', exact: true }).click();
  await page.getByTestId('companion-member').filter({ hasText: MEMBER_A }).click();
  await expect(page.getByTestId('expense-payer-select')).toHaveValue(MEMBER_A);
  await page.keyboard.press('Escape');
  expect(Object.values((await readEmulatorData<Record<string, unknown>>(`rooms/${ROOM}/expenses`)) || {})).toEqual(records);
});

// Same ancestor-alpha compositing approach as the existing T3 shell suite.
async function readableContrast(locator: Locator) {
  const ratio = await locator.evaluate(element => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string) => {
      ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
      const channels = [...ctx.getImageData(0, 0, 1, 1).data];
      return [...channels.slice(0, 3), channels[3] / 255];
    };
    const composite = (front: number[], back: number[]) => [...front.slice(0, 3).map((value, i) => value * front[3] + back[i] * (1 - front[3])), 1];
    const ancestors: Element[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) ancestors.unshift(node);
    let background = [255, 255, 255, 1];
    for (const node of ancestors) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) throw Error('Unsupported compositing surface');
      background = composite(rgba(style.backgroundColor), background);
    }
    const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, value, i) => {
      const c = value / 255;
      return sum + (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][i];
    }, 0);
    const values = [luminance(composite(rgba(getComputedStyle(element).color), background)), luminance(background)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  return ratio;
}

test('B0-11: light/dark companion text uses actual surface contrast, keyboard trap and readable native selection', async ({ page }, testInfo) => {
  const contrasts: Record<string, number> = {};
  for (const [name, color] of [['dark', '#172b4d'], ['light', '#d9f3fb']]) {
    await writeEmulatorData(`rooms/${ROOM}/meta/themeColor`, color);
    await openTicketPanel(page, ROOM);
    contrasts[`${name}-notice`] = await readableContrast(page.getByText('設定你在這趟旅程中的名字'));
    const entry = page.getByRole('button', { name: '選擇旅伴', exact: true });
    await entry.press('Enter');
    const picker = page.getByTestId('companion-picker');
    await picker.getByRole('dialog').evaluate(async el => { await Promise.all(el.getAnimations().map(animation => animation.finished)); });
    contrasts[`${name}-picker`] = await readableContrast(picker.getByText('這是本機操作偏好，不是帳號或權限認證。更正不會改寫已有的記帳、票券或清單。'));
    await expect(picker.getByRole('button', { name: '取消' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(picker.getByRole('button', { name: '清除本趟旅伴設定' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(picker.getByRole('button', { name: '取消' })).toBeFocused();
    await page.screenshot({ path: `.tmp/b0-evidence/after-picker-${name}-${testInfo.project.name}.png` });
    await page.keyboard.press('Escape');
    await openChecklist(page);
    await expect(page.getByLabel('查看個人清單')).toHaveCSS('color-scheme', name);
    await page.screenshot({ path: `.tmp/b0-evidence/after-checklist-${name}-${testInfo.project.name}.png` });
    await page.getByRole('button', { name: '關閉行前清單' }).click();
  }
  await testInfo.attach('companion-contrast-ratios', { body: JSON.stringify(contrasts), contentType: 'application/json' });
});

test('B0-10: blocked preference storage retains session selection across tools and trip reopening', async ({ page }) => {
  await page.addInitScript(() => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('travel-companion-v1:')) throw new DOMException('Preference storage blocked', 'QuotaExceededError');
      return write.call(this, key, value);
    };
  });
  await openTicketPanel(page, ROOM);
  const before = await readEmulatorData(`rooms/${ROOM}`);
  await choose(page, MEMBER_B);
  await expect(page.getByTestId('companion-notice')).toContainText('無法記住到下次');
  await page.getByTestId('back-to-lobby').click();
  await page.locator(`[data-testid="trip-card"][data-room-id="${ROOM}"]`).getByRole('button', { name: /^開啟旅程：/ }).click();
  await openExpense(page);
  await expect(page.getByTestId('expense-payer-select')).toHaveValue(MEMBER_B);
  expect(await readEmulatorData(`rooms/${ROOM}`)).toEqual(before);
});

test('B0-10: signed-out example uses its own namespace and requires explicit confirmation', async ({ page }) => {
  await openTicketPanel(page, ROOM);
  await choose(page, MEMBER_A);
  await page.getByTestId('app-settings-trigger').click();
  await page.getByTestId('google-sign-out').click();
  const example = page.getByTestId('demo-trip-entry-card');
  await example.getByRole('button', { name: /^開啟旅程：/ }).click();
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute('data-trip-source', 'example');
  await page.locator('[data-testid="ticket-tab-button"]:visible').click();
  await expect(page.getByText('設定你在這趟旅程中的名字')).toBeVisible();
  await page.getByRole('button', { name: '選擇旅伴', exact: true }).click();
  await page.getByTestId('companion-member').filter({ hasText: '旅伴 A' }).click();
  const demoKey = `travel-companion-v1:${JSON.stringify(['example', '', 'local-example-trip'])}`;
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').member, demoKey)).toBe('旅伴 A');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').member, storageKey())).toBe(MEMBER_A);
});

test('B0-02/09: same browser switches synthetic Auth Emulator accounts A/B/A without sharing identity', async ({ page, request }) => {
  const uidB = 'e2e-companion-b';
  const response = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-travel-e2e/accounts:batchCreate?key=emulator-api-key', {
    headers: { authorization: 'Bearer owner' },
    data: { allowOverwrite: true, users: [{ localId: uidB, email: `${uidB}@example.test`, emailVerified: true, displayName: 'Synthetic B', providerUserInfo: [{ providerId: 'google.com', rawId: uidB, email: `${uidB}@example.test`, displayName: 'Synthetic B' }] }] },
  });
  expect(response.ok()).toBe(true);
  const invite = await seedTestTripInvite(ROOM, { createdByUid: 'e2e-owner' });
  const switchAccount = async (uid: string) => {
    await page.evaluate(async nextUid => {
      const firebasePath = '/src/firebase.js';
      const sdkPath = '/node_modules/.vite/deps/firebase_auth.js';
      const { auth } = await import(firebasePath);
      if (auth.emulatorConfig?.host !== '127.0.0.1' || auth.emulatorConfig?.port !== 9099) throw Error('Auth Emulator required');
      const { GoogleAuthProvider, signInWithCredential } = await import(sdkPath);
      await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: nextUid, email: `${nextUid}@example.test`, email_verified: true, name: nextUid === 'e2e-owner' ? 'E2E Owner' : 'Synthetic B' })));
      if (auth.currentUser?.uid !== nextUid) throw Error('Unexpected synthetic account');
    }, uid);
    await expect(page.getByRole('button', { name: '加入旅程', exact: true })).toBeVisible();
    await expect(page.getByTestId('companion-notice')).toHaveCount(0);
  };
  const openFromLobby = async () => {
    // Do not cold-load the E2E bootstrap: it deliberately signs in e2e-owner.
    // This flow exercises actual same-page account switching and trip routing.
    const card = page.locator(`[data-testid="trip-card"][data-room-id="${ROOM}"]`);
    await card.getByRole('button', { name: /^開啟旅程：/ }).click();
    await expect(page.getByTestId('active-trip-view')).toBeVisible();
    await page.locator('[data-testid="ticket-tab-button"]:visible').click();
  };
  await openTicketPanel(page, ROOM);
  await choose(page, MEMBER_A);
  await switchAccount(uidB);
  // Existing invitation redemption grants B access; no fixture authorization bypass.
  await page.getByRole('button', { name: '加入旅程', exact: true }).click();
  await page.getByRole('textbox', { name: '旅程邀請連結' }).fill(`https://example.test/#invite=${invite}`);
  await page.getByRole('button', { name: '驗證並加入' }).click();
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await page.locator('[data-testid="ticket-tab-button"]:visible').click();
  await expect(page.getByText('設定你在這趟旅程中的名字')).toBeVisible();
  await choose(page, MEMBER_B);
  await switchAccount('e2e-owner');
  await openFromLobby();
  await expect(page.getByTestId('companion-notice')).toContainText(`本趟旅伴：${MEMBER_A}`);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').member, storageKey(uidB))).toBe(MEMBER_B);
  await switchAccount(uidB);
  await openFromLobby();
  await expect(page.getByTestId('companion-notice')).toContainText(`本趟旅伴：${MEMBER_B}`);
});
