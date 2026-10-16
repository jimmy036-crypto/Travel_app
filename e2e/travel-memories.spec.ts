import { expect, test, type Page } from '@playwright/test';
import { clearEmulatorDatabase, readEmulatorData, seedTestTrip, writeEmulatorData } from './support/emulator';

const ROOM = 'e2e-memory-trip';
const PRIVATE = `personalTravel/e2e-owner/memories/${ROOM}`;
const itinerary = { 'Day 1': [
  { id: 'museum', name: '旅行美術館', lat: 35.01, lng: 135.76, time: '09:00', nextLeg: { mode: 'WALK', mins: 12 } },
  { id: 'cafe', name: '下次的咖啡店', lat: 35.02, lng: 135.77 },
] };
type Memory = { archived?: boolean; revision?: number; visits?: Record<string, { status: string; city: string }>; note?: string };
const tripCard = (page: Page, id = ROOM) => page.getByTestId('trip-card').filter({ has: page.getByTestId('trip-card-title').filter({ hasText: id === ROOM ? '京都舊日' : '京都再訪' }) });
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '旅行紀錄' }).getByRole('button', { name, exact: true });
async function archive(page: Page, withVisits = false, id = ROOM) {
  await tripCard(page, id).getByRole('button', { name: '完成並收進回憶' }).click();
  const editor = page.getByTestId('memory-editor');
  if (withVisits) {
    await editor.getByLabel('旅行美術館的到訪狀態').selectOption('visited');
    await editor.getByLabel('旅行美術館的城市／地區').fill('日本・京都');
    await editor.getByLabel('旅行美術館的回憶').fill('不同年份的展覽');
    await editor.getByLabel('下次的咖啡店的到訪狀態').selectOption('wishlist');
    await editor.getByLabel('第一次看雪').check();
  }
  await editor.getByLabel('這趟旅行的感想').fill('只留給自己的旅行片刻');
  await editor.getByRole('button', { name: '完成並收進回憶' }).click();
  await expect(editor).toBeHidden();
  await expect(tripCard(page, id)).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await page.addInitScript(() => localStorage.setItem('travel-app-seen-onboarding-v1', 'true'));
  await seedTestTrip(ROOM, { title: '京都舊日', startDate: '2024-01-01', endDate: '2024-01-02', destination: '京都', itinerary });
});
test.afterEach(async () => { await clearEmulatorDatabase(); });

test('completion is personal, persists across reload, and restores without changing shared itinerary', async ({ page, request }) => {
  const before = await readEmulatorData(`rooms/${ROOM}`);
  const accessBefore = await readEmulatorData(`roomAccess/${ROOM}`);
  await page.goto('/');
  await archive(page);
  await expect.poll(async () => (await readEmulatorData<Memory>(PRIVATE))?.archived).toBe(true);
  expect((await readEmulatorData<Memory>(PRIVATE))?.visits).toBeUndefined();
  expect(await readEmulatorData(`rooms/${ROOM}`)).toEqual(before);
  expect(await readEmulatorData(`roomAccess/${ROOM}`)).toEqual(accessBefore);
  await page.reload();
  await nav(page, '旅行回憶').click();
  await expect(page.getByTestId('memory-card')).toContainText('京都舊日');
  await page.getByLabel('搜尋旅行回憶').fill('找不到這個地方');
  await expect(page.getByTestId('memory-card')).toHaveCount(0);
  await page.getByLabel('搜尋旅行回憶').fill('京都');
  await page.getByRole('button', { name: '還原到首頁' }).click();
  await expect.poll(async () => (await readEmulatorData<Memory>(PRIVATE))?.archived).toBe(false);
  await nav(page, '我的旅程').click();
  await expect(tripCard(page)).toBeVisible();
  await archive(page);

  const uid = 'e2e-memory-companion';
  const created = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-travel-e2e/accounts:batchCreate?key=emulator-api-key', {
    headers: { authorization: 'Bearer owner' }, data: { allowOverwrite: true, users: [{ localId: uid, email: `${uid}@example.test`, emailVerified: true, providerUserInfo: [{ providerId: 'google.com', rawId: uid, email: `${uid}@example.test` }] }] },
  });
  expect(created.ok()).toBe(true);
  await writeEmulatorData(`roomAccess/${ROOM}/members/${uid}`, { uid, role: 'editor', status: 'active', aclVersion: 1, joinedAt: 1, updatedAt: 1 });
  await writeEmulatorData(`userTrips/${uid}/${ROOM}`, { role: 'editor', status: 'active', aclVersion: 1, updatedAt: 1 });
  await page.evaluate(async (nextUid) => {
    const firebasePath = '/src/firebase.js'; const sdkPath = '/node_modules/.vite/deps/firebase_auth.js';
    const { auth } = await import(firebasePath);
    if (auth.emulatorConfig?.host !== '127.0.0.1' || auth.emulatorConfig?.port !== 9099) throw Error('Auth Emulator required');
    const { signInWithCredential, GoogleAuthProvider } = await import(sdkPath);
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: nextUid, email: `${nextUid}@example.test`, email_verified: true, name: '旅伴' })));
    if (auth.currentUser?.uid !== nextUid) throw Error('Wrong account');
  }, uid);
  await expect(tripCard(page)).toBeVisible();
  await nav(page, '旅行回憶').click();
  await expect(page.getByTestId('memory-card')).toHaveCount(0);
  await expect(page.getByText('只留給自己的旅行片刻')).toHaveCount(0);
});

test('confirmed footprints, revisits, city collection, stamps, annual review and selected share form one story', async ({ page }, testInfo) => {
  await seedTestTrip('e2e-memory-return', { title: '京都再訪', startDate: '2025-01-01', endDate: '2025-01-02', destination: '京都', itinerary });
  await page.goto('/');
  await archive(page, true);
  await archive(page, true, 'e2e-memory-return');
  await nav(page, '我的足跡').click();
  await expect(page.getByTestId('footprints-map')).toBeVisible();
  await expect(page.getByRole('button', { name: '日本・京都 · 2 次', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '日本・京都的旅行紀錄' })).toContainText('2025、2024');
  await page.getByRole('button', { name: '收藏這座城市' }).click();
  await page.getByRole('button', { name: '儲存收藏' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('已去過 2 / 2 · 下次想去 0')).toBeVisible();
  await expect(page.getByRole('region', { name: '旅行中留待下次的地方' })).toContainText('下次的咖啡店');
  await nav(page, '旅行回憶').click();
  await expect(page.getByRole('button', { name: /重遊 日本・京都/ })).toBeVisible();
  await page.getByLabel('回顧年份').selectOption('2024');
  await expect(page.getByRole('region', { name: '旅行護照與年度回顧' })).toContainText('1 趟旅行');
  await page.getByRole('button', { name: '選擇回憶來分享' }).click();
  await expect(page.getByRole('button', { name: '複製選取的回憶' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '京都舊日' }).check();
  await expect(page.getByLabel('分享內容預覽')).toHaveValue(/京都舊日/);
  await expect(page.getByLabel('分享內容預覽')).not.toHaveValue(/京都再訪/);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await testInfo.attach('travel-memories', { body: await page.screenshot(), contentType: 'image/png' });
});

test('clone preserves planning while source loss preserves only personal memory', async ({ page }) => {
  await page.goto('/'); await archive(page, true);
  await nav(page, '旅行回憶').click();
  await page.getByRole('button', { name: '複製成新旅程' }).click();
  await page.getByLabel('新出發日期').fill('2027-01-01');
  await page.getByLabel('新回程日期').fill('2027-01-02');
  await page.getByRole('button', { name: '建立新的旅行' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const cards = page.getByTestId('trip-card').filter({ hasText: '京都舊日・再出發' });
  await expect(cards).toBeVisible();
  const newId = await cards.getAttribute('data-room-id');
  const clone = await readEmulatorData<{ itinerary: typeof itinerary; expenses?: unknown; tickets?: unknown }>(`rooms/${newId}`);
  if (!clone) throw new Error('Cloned room was not published');
  expect(clone.itinerary['Day 1'][0].nextLeg).toEqual({ mode: 'WALK', mins: 12 });
  expect(clone.expenses).toBeUndefined(); expect(clone.tickets).toBeUndefined();
  await writeEmulatorData(`rooms/${ROOM}`, null);
  await writeEmulatorData(`roomAccess/${ROOM}`, null);
  await writeEmulatorData(`userTrips/e2e-owner/${ROOM}`, null);
  await nav(page, '旅行回憶').click();
  await expect(page.getByRole('button', { name: '開啟原行程與照片' })).toBeDisabled();
  await page.getByRole('button', { name: '補充回憶與到訪' }).click();
  await page.getByLabel('這趟旅行的感想').fill('原旅程離開了，感想仍在');
  await page.getByRole('button', { name: '儲存回憶' }).click();
  await expect.poll(async () => (await readEmulatorData<Memory>(PRIVATE))?.note).toBe('原旅程離開了，感想仍在');
});
