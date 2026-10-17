import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { clearEmulatorDatabase, clearEmulatorStorage, listEmulatorStorageObjects, readEmulatorData, readEmulatorStorageObjectMetadata, seedTestTrip, uploadEmulatorStorageObject, writeEmulatorData } from './support/emulator';
import { PNG_1X1 } from './support/tickets';

const OWNER = 'e2e-owner';
const COMPANION = 'e2e-memory-companion';
const ROOM = 'e2e-memory-trip';
const RETURN_ROOM = 'e2e-memory-return';
const PHOTO_ROOM = 'e2e-memory-seven-days';
const PRIVATE = `personalTravel/${OWNER}/memories/${ROOM}`;
const BUCKET = 'demo-travel-e2e.appspot.com';
const FUNCTION_ORIGIN = 'http://127.0.0.1:5001/demo-travel-e2e/us-central1';
const itinerary = { 'Day 1': [
  { id: 'museum', name: '旅行美術館', lat: 35.01, lng: 135.76, time: '09:00', nextLeg: { mode: 'WALK', mins: 12 } },
  { id: 'cafe', name: '下次的咖啡店', lat: 35.02, lng: 135.77 },
] };
const CITIES = [
  { cityId: 'e2e-city-kyoto', city: '京都', country: '日本', cityLat: 35.0116, cityLng: 135.7681 },
  { cityId: 'e2e-city-osaka', city: '大阪', country: '日本', cityLat: 34.6937, cityLng: 135.5023 },
  { cityId: 'e2e-city-nara', city: '奈良', country: '日本', cityLat: 34.6851, cityLng: 135.8048 },
];
type Memory = { archived?: boolean; revision?: number; visits?: Record<string, { status: string; city: string; cityId?: string }>; firsts?: Record<string, string>; note?: string };
type Archive = { summary: { state: string; saved: number; total: number }; itinerary?: Record<string, unknown[]>; photos?: Record<string, { storagePath: string; name: string }> };
type Collection = { id: string; title: string; items?: Record<string, { roomId?: string; visitId?: string; sourceRoomId?: string }> };
const roomCard = (page: Page, id = ROOM) => page.locator(`[data-testid="trip-card"][data-room-id="${id}"]`);
const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '旅行紀錄' }).getByRole('button', { name, exact: true });
const personalArchive = (uid: string, roomId: string) => `travelMemoryArchives/${uid}/${roomId}`;

async function prepareCities(page: Page) {
  // Exercise the real city picker and canonical Place details contract without
  // making Google network calls. Free text never becomes a confirmed city.
  await page.addInitScript((cities) => {
    localStorage.setItem('travel-app-seen-onboarding-v1', 'true');
    (window as Window & { __TRAVEL_E2E_DESTINATION_PLACES__?: unknown }).__TRAVEL_E2E_DESTINATION_PLACES__ = {
      AutocompleteSessionToken: class {},
      AutocompleteSuggestion: {
        async fetchAutocompleteSuggestions({ input }: { input: string }) {
          return { suggestions: cities.filter((city) => `${city.city} ${city.country}`.includes(input)).map((city) => ({
            placePrediction: {
              placeId: city.cityId, text: { toString: () => `${city.city}・${city.country}` },
              toPlace: () => ({ displayName: city.city, location: { lat: () => city.cityLat, lng: () => city.cityLng }, addressComponents: [{ types: ['country'], longText: city.country }], fetchFields: async () => {} }),
            },
          })) };
        },
      },
    };
  }, CITIES);
}

async function quickArchive(page: Page, id = ROOM) {
  await roomCard(page, id).getByRole('button', { name: '完成並收進回憶' }).click();
  const dialog = page.getByTestId('archive-trip-dialog');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  const [response] = await Promise.all([
    page.waitForResponse((entry) => entry.url() === `${FUNCTION_ORIGIN}/requestTravelMemoryPreservation` && entry.request().method() === 'POST'),
    dialog.getByRole('button', { name: '收好這趟旅行' }).click(),
  ]);
  expect(response.status()).toBe(200);
  await expect(dialog.getByRole('heading', { name: '回憶已收好' })).toBeVisible();
  await expect(roomCard(page, id)).toHaveCount(0);
  return dialog;
}

async function archive(page: Page, withVisits = false, id = ROOM) {
  const dialog = await quickArchive(page, id);
  await dialog.getByRole('button', { name: '補上足跡' }).click();
  const editor = page.getByTestId('memory-editor');
  if (withVisits) {
    await editor.getByLabel('旅行美術館的到訪狀態').selectOption('visited');
    await editor.getByRole('combobox', { name: '旅行美術館的城市／地區' }).fill('京都');
    await editor.getByRole('option', { name: '京都・日本', exact: true }).click();
    await editor.getByLabel('旅行美術館的回憶').fill('不同年份的展覽');
    await editor.getByLabel('下次的咖啡店的到訪狀態').selectOption('wishlist');
    if (id === ROOM) await editor.getByLabel('第一次看雪', { exact: true }).check();
  }
  await editor.getByLabel('這趟旅行的感想').fill('只留給自己的旅行片刻');
  await editor.getByRole('button', { name: '儲存回憶' }).click();
  await expect(editor).toBeHidden();
  await page.getByTestId('memory-detail').getByRole('button', { name: '關閉回憶' }).click();
  await nav(page, '我的旅程').click();
}

async function openMemory(page: Page, id = ROOM) {
  await nav(page, '旅行回憶').click();
  await page.locator(`[data-testid="memory-card"][data-room-id="${id}"]`).getByRole('button', { name: '重溫這趟旅行' }).click();
  const detail = page.getByTestId('memory-detail');
  await expect(detail).toBeVisible();
  return detail;
}

async function createCompanion(request: APIRequestContext, roomId: string) {
  const created = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-travel-e2e/accounts:batchCreate?key=emulator-api-key', {
    headers: { authorization: 'Bearer owner' }, data: { allowOverwrite: true, users: [{ localId: COMPANION, email: `${COMPANION}@example.test`, emailVerified: true, providerUserInfo: [{ providerId: 'google.com', rawId: COMPANION, email: `${COMPANION}@example.test` }] }] },
  });
  expect(created.ok()).toBe(true);
  await writeEmulatorData(`roomAccess/${roomId}/members/${COMPANION}`, { uid: COMPANION, role: 'editor', status: 'active', aclVersion: 1, joinedAt: 1, updatedAt: 1 });
  await writeEmulatorData(`userTrips/${COMPANION}/${roomId}`, { role: 'editor', status: 'active', aclVersion: 1, updatedAt: 1 });
}

async function signInAs(page: Page, uid: string) {
  await page.evaluate(async (nextUid) => {
    const firebasePath = '/src/firebase.js'; const sdkPath = '/node_modules/.vite/deps/firebase_auth.js';
    const { auth } = await import(firebasePath);
    if (auth.emulatorConfig?.host !== '127.0.0.1' || auth.emulatorConfig?.port !== 9099) throw Error('Auth Emulator required');
    const { signInWithCredential, GoogleAuthProvider } = await import(sdkPath);
    await signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub: nextUid, email: `${nextUid}@example.test`, email_verified: true, name: nextUid === 'e2e-owner' ? 'E2E Owner' : '旅伴' })));
    if (auth.currentUser?.uid !== nextUid) throw Error('Wrong account');
  }, uid);
}

async function invokeEmulator(page: Page, name: string, data: Record<string, unknown>) {
  return page.evaluate(async ({ functionName, payload }) => {
    const firebasePath = '/src/firebase.js'; const sdkPath = '/node_modules/.vite/deps/firebase_functions.js';
    const { auth, functions } = await import(firebasePath);
    if (auth.emulatorConfig?.host !== '127.0.0.1' || auth.emulatorConfig?.port !== 9099 || auth.app.options.projectId !== 'demo-travel-e2e') throw Error('Demo Auth Emulator required');
    const { httpsCallable } = await import(sdkPath);
    return (await httpsCallable(functions, functionName)(payload)).data;
  }, { functionName: name, payload: data });
}

async function uploadPlacePhoto(request: APIRequestContext, roomId: string, itemId: string) {
  const storagePath = `rooms/${roomId}/places/${itemId}/memory-test.png`;
  await uploadEmulatorStorageObject(storagePath, PNG_1X1, 'image/png');
  const response = await request.patch(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(storagePath)}`, {
    headers: { authorization: 'Bearer owner' }, data: { metadata: { roomId, itemId } },
  });
  expect(response.ok()).toBe(true);
  const metadata = await readEmulatorStorageObjectMetadata(storagePath);
  expect(metadata?.metadata).toMatchObject({ roomId, itemId });
  return { storagePath, contentType: 'image/png', size: PNG_1X1.byteLength };
}

async function cleanupPhotos() {
  for (const prefix of [`rooms/${PHOTO_ROOM}`, `travelMemories/${OWNER}/${PHOTO_ROOM}`, `travelMemories/${COMPANION}/${PHOTO_ROOM}`]) await clearEmulatorStorage(prefix);
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await cleanupPhotos();
  await prepareCities(page);
  await seedTestTrip(ROOM, { title: '京都舊日', startDate: '2024-01-01', endDate: '2024-01-02', destination: '京都', itinerary });
});
test.afterEach(async () => { await clearEmulatorDatabase(); await cleanupPhotos(); });

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
  const detail = await openMemory(page);
  await detail.getByText('整理這份回憶', { exact: true }).click();
  await detail.getByRole('button', { name: '還原到首頁' }).click();
  await expect.poll(async () => (await readEmulatorData<Memory>(PRIVATE))?.archived).toBe(false);
  await nav(page, '我的旅程').click();
  await expect(roomCard(page)).toBeVisible();
  const archivedAgain = await quickArchive(page);
  await archivedAgain.getByRole('button', { name: '完成', exact: true }).click();

  await createCompanion(request, ROOM);
  await signInAs(page, COMPANION);
  await expect(roomCard(page)).toBeVisible();
  await nav(page, '旅行回憶').click();
  await expect(page.getByTestId('memory-card')).toHaveCount(0);
  await expect(page.getByText('只留給自己的旅行片刻')).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('q')).toBeNull();
});

test('confirmed footprints, revisits, city collection, stamps, annual review and selected share form one story', async ({ page }, testInfo) => {
  await seedTestTrip(RETURN_ROOM, { title: '京都再訪', startDate: '2025-01-01', endDate: '2025-01-02', destination: '京都', itinerary });
  await page.goto('/');
  await archive(page, true);
  await archive(page, true, RETURN_ROOM);
  await nav(page, '我的足跡').click();
  await expect(page.getByTestId('footprints-map')).toBeVisible();
  await expect(page.getByRole('button', { name: '京都 · 2 次', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: '京都的旅行紀錄' })).toContainText('2025、2024');
  await page.getByRole('button', { name: '收藏這座城市' }).click();
  await page.getByRole('button', { name: '加入選取地點' }).click();
  await page.getByRole('button', { name: '儲存收藏' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('已去過 0 / 2 · 下次想去 2')).toBeVisible();
  const collections = await readEmulatorData<Record<string, Collection>>(`personalTravel/${OWNER}/collections`);
  const collection = Object.values(collections || {})[0];
  expect(Object.values(collection.items || {}).every((item) => !item.roomId && item.sourceRoomId)).toBe(true);
  await page.getByRole('button', { name: '編輯收藏' }).click();
  const links = page.getByLabel('旅行美術館的收藏到訪');
  await links.nth(0).selectOption(JSON.stringify([RETURN_ROOM, 'Day%201~museum']));
  await links.nth(1).selectOption(JSON.stringify([ROOM, 'Day%201~museum']));
  await page.getByRole('button', { name: '儲存收藏' }).click();
  await expect(page.getByText('已去過 2 / 2 · 下次想去 0')).toBeVisible();
  await expect(page.getByRole('region', { name: '旅行中留待下次的地方' })).toContainText('下次的咖啡店');
  await nav(page, '旅行回憶').click();
  await page.getByRole('button', { name: /重遊 京都/ }).click();
  await expect(page.getByRole('region', { name: '京都的旅行紀錄' })).toContainText('2025、2024');
  expect(new URL(page.url()).searchParams.get('city')).toBe('e2e-city-kyoto');
  await nav(page, '旅行回憶').click();
  await page.getByRole('button', { name: /個人收藏.*京都・再訪清單/ }).click();
  await expect(page.getByRole('dialog', { name: '京都・再訪清單' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('collection')).toBe(collection.id);
  await page.getByRole('button', { name: '關閉收藏' }).click();
  await nav(page, '旅行回憶').click();
  await page.getByLabel('回顧年份').selectOption('2024');
  await page.getByLabel('年度代表回憶').selectOption(ROOM);
  await expect(page.getByRole('region', { name: '旅行護照與年度回顧' })).toContainText('1 趟旅行');
  await page.getByLabel('搜尋旅行回憶').fill('不同年份的展覽');
  await expect(page.getByTestId('memory-card')).toHaveCount(2);
  await page.reload();
  await expect(page.getByLabel('回顧年份')).toHaveValue('2024');
  await expect(page.getByLabel('年度代表回憶')).toHaveValue(ROOM);
  await expect(page.getByLabel('搜尋旅行回憶')).toHaveValue('不同年份的展覽');
  await page.getByRole('button', { name: '選擇回憶來分享' }).click();
  await expect(page.getByRole('button', { name: '複製選取的回憶' })).toBeDisabled();
  await page.getByRole('checkbox', { name: '京都舊日', exact: true }).check();
  await expect(page.getByLabel('分享內容預覽')).toHaveValue(/京都舊日/);
  await expect(page.getByLabel('分享內容預覽')).not.toHaveValue(/京都再訪|只留給自己的旅行片刻/);
  await expect(page.getByRole('checkbox', { name: '個人感想' })).not.toBeChecked();
  await page.getByRole('checkbox', { name: '個人感想' }).check();
  await expect(page.getByLabel('分享內容預覽')).toHaveValue(/只留給自己的旅行片刻/);
  await page.getByRole('button', { name: '關閉', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await testInfo.attach('travel-memories', { body: await page.screenshot(), contentType: 'image/png' });
});

test('clone preserves planning after source deletion while saved memory remains readable and editable', async ({ page }) => {
  await writeEmulatorData(`rooms/${ROOM}/meta/transport`, '火車');
  await writeEmulatorData(`rooms/${ROOM}/meta/themeColor`, '#15803d');
  await page.goto('/'); await archive(page, true);
  await expect.poll(async () => (await readEmulatorData<Archive>(personalArchive(OWNER, ROOM)))?.summary.state).toBe('complete');
  await writeEmulatorData(`rooms/${ROOM}`, null);
  await writeEmulatorData(`roomAccess/${ROOM}`, null);
  await writeEmulatorData(`userTrips/${OWNER}/${ROOM}`, null);
  await page.reload();
  const detail = await openMemory(page);
  await expect(detail.getByRole('region', { name: '保存的每日行程' })).toContainText('旅行美術館');
  await expect(detail).toContainText('只留給自己的旅行片刻');
  await detail.getByText('整理這份回憶', { exact: true }).click();
  await expect(detail.getByRole('button', { name: '開啟原行程', exact: true })).toBeDisabled();
  await expect(detail.getByRole('button', { name: '還原到首頁' })).toBeDisabled();
  await detail.getByRole('button', { name: '複製成新旅程' }).click();
  await page.getByLabel('新出發日期').fill('2027-01-01');
  await expect(page.getByLabel('新回程日期')).toHaveValue('2027-01-02');
  await page.getByRole('button', { name: '建立新的旅行' }).click();
  await expect(page.getByRole('heading', { name: '新的旅行已建立' })).toBeVisible();
  await page.getByRole('button', { name: '稍後再看' }).click();
  await page.getByTestId('memory-detail').getByRole('button', { name: '關閉回憶' }).click();
  await nav(page, '我的旅程').click();
  const cards = page.getByTestId('trip-card').filter({ hasText: '京都舊日・再出發' });
  await expect(cards).toBeVisible();
  const newId = await cards.getAttribute('data-room-id');
  const clone = await readEmulatorData<{ itinerary: typeof itinerary; meta: { destLat: number; destLng: number; transport: string; themeColor: string }; expenses?: unknown; tickets?: unknown }>(`rooms/${newId}`);
  if (!clone) throw new Error('Cloned room was not published');
  expect(clone.itinerary['Day 1'][0].nextLeg).toEqual({ mode: 'WALK', mins: 12 });
  expect(clone.meta).toMatchObject({ destLat: 25.033, destLng: 121.5654, transport: '火車', themeColor: '#15803d' });
  expect(clone.expenses).toBeUndefined(); expect(clone.tickets).toBeUndefined();
  await openMemory(page);
  await page.getByTestId('memory-detail').getByRole('button', { name: '補充回憶與到訪' }).click();
  await page.getByLabel('這趟旅行的感想').fill('原旅程離開了，感想仍在');
  await page.getByRole('button', { name: '儲存回憶' }).click();
  await expect.poll(async () => (await readEmulatorData<Memory>(PRIVATE))?.note).toBe('原旅程離開了，感想仍在');
});

test('unsaved memory survives closing and reload, then explicitly merges a conflicting cloud update', async ({ page }) => {
  await page.goto('/');
  const archived = await quickArchive(page);
  await archived.getByRole('button', { name: '查看回憶' }).click();
  await page.getByTestId('memory-detail').getByRole('button', { name: '補充回憶與到訪' }).click();
  const editor = page.getByTestId('memory-editor');
  await editor.getByLabel('這趟旅行的感想').fill('留在這台裝置的草稿');
  await editor.getByRole('button', { name: '關閉', exact: true }).click();
  await expect(page.getByRole('heading', { name: '離開編輯？' })).toBeVisible();
  await page.getByRole('button', { name: '保留草稿並離開' }).click();
  await expect(editor).toBeHidden();
  await page.reload();
  await page.getByTestId('memory-detail').getByRole('button', { name: '補充回憶與到訪' }).click();
  await expect(editor.getByLabel('這趟旅行的感想')).toHaveValue('留在這台裝置的草稿');
  const revision = (await readEmulatorData<Memory>(PRIVATE))?.revision;
  await invokeEmulator(page, 'saveTravelMemory', { roomId: ROOM, revision, archived: true, note: '另一個畫面的文字', visits: {}, firsts: { snow: '第一次看雪' } });
  await editor.getByRole('button', { name: '儲存回憶' }).click();
  const conflict = page.getByTestId('memory-conflict-dialog');
  await expect(conflict.getByText('另一個畫面的文字', { exact: true })).toBeVisible();
  await expect(conflict.getByRole('button', { name: '套用選擇並繼續編輯' })).toBeDisabled();
  await conflict.getByRole('radio', { name: '保留我的內容：旅行感想' }).check();
  await conflict.getByRole('button', { name: '套用選擇並繼續編輯' }).click();
  await expect(editor.getByLabel('第一次看雪', { exact: true })).toBeChecked();
  await editor.getByRole('button', { name: '儲存回憶' }).click();
  await expect(editor).toBeHidden();
  const saved = await readEmulatorData<Memory>(PRIVATE);
  expect(saved?.note).toBe('留在這台裝置的草稿');
  expect(saved?.firsts).toEqual({ snow: '第一次看雪' });
  expect(saved?.revision).toBe(Number(revision) + 2);
});

test('seven days, forty places and twelve private photos survive source deletion; personal deletion preserves the companion copy', async ({ page, request }, testInfo) => {
  type Place = { id: string; name: string; lat: number; lng: number; placePhoto?: Awaited<ReturnType<typeof uploadPlacePhoto>> };
  const days: Record<string, Place[]> = {};
  for (let index = 0; index < 40; index += 1) {
    const day = Math.floor(index / 6) + 1;
    const city = CITIES[Math.floor((day - 1) / 3)];
    const place: Place = { id: `place-${index + 1}`, name: `${city.city}景點 ${index + 1}`, lat: city.cityLat, lng: city.cityLng };
    (days[`Day ${day}`] ||= []).push(place);
  }
  await page.goto('/');
  await expect(roomCard(page)).toBeVisible();
  // Permanent source deletion also verifies its server-issued reservation and
  // creationId. Use the real creation flow instead of a display-only trip seed.
  await invokeEmulator(page, 'createTrip', { roomId: PHOTO_ROOM, meta: { title: '七天三城的旅行', startDate: '2025-03-01', endDate: '2025-03-07', destination: '關西', destLat: 35.0116, destLng: 135.7681, members: ['自己'] } });
  const photoPlaces = Object.values(days).flat().slice(0, 12);
  await Promise.all(photoPlaces.map(async (place) => { place.placePhoto = await uploadPlacePhoto(request, PHOTO_ROOM, place.id); }));
  await writeEmulatorData(`rooms/${PHOTO_ROOM}/itinerary`, days);
  await createCompanion(request, PHOTO_ROOM);
  const archived = await quickArchive(page, PHOTO_ROOM);
  const personalPath = `personalTravel/${OWNER}/memories/${PHOTO_ROOM}`;
  expect((await readEmulatorData<Memory>(personalPath))?.visits).toBeUndefined();
  expect((await readEmulatorData<Memory>(personalPath))?.note).toBe('');
  await expect.poll(async () => (await readEmulatorData<Archive>(personalArchive(OWNER, PHOTO_ROOM)))?.summary).toMatchObject({ state: 'complete', saved: 12, total: 12 });
  const ownerPhotos = await listEmulatorStorageObjects(`travelMemories/${OWNER}/${PHOTO_ROOM}`);
  expect(ownerPhotos).toHaveLength(12);
  // The Emulator's Firebase GET endpoint adds a download token on every first
  // read (including getBlob/metadata). Inspect GCS metadata before opening the
  // viewer to verify the actual copy without this Emulator-only mutation.
  for (const photo of ownerPhotos) {
    const metadataResponse = await request.get(`http://127.0.0.1:9199/storage/v1/b/${BUCKET}/o/${encodeURIComponent(photo.name)}`, { headers: { authorization: 'Bearer owner' } });
    expect(metadataResponse.ok()).toBe(true);
    const metadata = await metadataResponse.json();
    expect(metadata.metadata.uid).toBe(OWNER);
    expect(metadata.metadata).not.toHaveProperty('firebaseStorageDownloadTokens');
    expect(metadata).not.toHaveProperty('downloadTokens');
    const denied = await request.get(`http://127.0.0.1:9199/v0/b/${BUCKET}/o/${encodeURIComponent(photo.name)}?alt=media`);
    expect(denied.status()).toBe(403);
  }
  await archived.getByRole('button', { name: '查看回憶' }).click();
  const detail = page.getByTestId('memory-detail');
  await expect(detail.getByRole('button', { name: /^放大照片：/ })).toHaveCount(12);
  await expect(detail.getByText('尚未確認到訪', { exact: true })).toHaveCount(40);
  await expect(detail.getByRole('region', { name: '保存的每日行程' }).getByRole('heading', { level: 4 })).toHaveCount(7);
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await detail.getByRole('button', { name: '補充回憶與到訪' }).scrollIntoViewIfNeeded();
  await expect(detail.getByRole('button', { name: '補充回憶與到訪' })).toBeInViewport();
  await testInfo.attach('permanent-memory-200-percent', { body: await page.screenshot(), contentType: 'image/png' });
  await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
  await detail.getByRole('button', { name: '補充回憶與到訪' }).click();
  const editor = page.getByTestId('memory-editor');
  for (const [cityIndex, city] of CITIES.entries()) {
    const firstDay = cityIndex * 3 + 1;
    for (let day = firstDay; day <= Math.min(firstDay + 2, 7); day += 1) await editor.getByRole('checkbox', { name: `選取2025-03-${String(day).padStart(2, '0')}全部地點` }).check();
    await editor.getByLabel('批次到訪狀態', { exact: true }).selectOption('visited');
    await editor.getByRole('combobox', { name: '批次城市／地區', exact: true }).fill(city.city);
    await editor.getByRole('option', { name: `${city.city}・日本`, exact: true }).click();
    await editor.getByRole('button', { name: '套用到選取地點' }).click();
    await editor.getByRole('button', { name: '清除選取' }).click();
  }
  await editor.getByRole('button', { name: '儲存回憶' }).click();
  await expect(editor).toBeHidden();
  const confirmed = Object.values((await readEmulatorData<Memory>(personalPath))?.visits || {});
  expect(confirmed).toHaveLength(40);
  expect(new Set(confirmed.map((visit) => visit.cityId))).toEqual(new Set(CITIES.map((city) => city.cityId)));
  expect(confirmed.every((visit) => visit.status === 'visited')).toBe(true);
  await detail.getByRole('button', { name: '關閉回憶' }).click();

  // The companion requests a real independently owned archive of the same source.
  await signInAs(page, COMPANION);
  await invokeEmulator(page, 'saveTravelMemory', { roomId: PHOTO_ROOM, revision: 0, archived: true, note: '旅伴自己的回憶', visits: {}, firsts: {} });
  await invokeEmulator(page, 'requestTravelMemoryPreservation', { roomId: PHOTO_ROOM, operationId: 'e2e-companion-archive' });
  await expect.poll(async () => (await readEmulatorData<Archive>(personalArchive(COMPANION, PHOTO_ROOM)))?.summary).toMatchObject({ state: 'complete', saved: 12, total: 12 });
  const companionMemory = await readEmulatorData(`personalTravel/${COMPANION}/memories/${PHOTO_ROOM}`);
  const companionArchive = await readEmulatorData(personalArchive(COMPANION, PHOTO_ROOM));
  const companionPhotos = await listEmulatorStorageObjects(`travelMemories/${COMPANION}/${PHOTO_ROOM}`);
  expect(companionPhotos).toHaveLength(12);

  await signInAs(page, OWNER);
  await invokeEmulator(page, 'deleteTrip', { roomId: PHOTO_ROOM });
  // The existing trip-deletion worker deliberately performs a two-pass Storage
  // sweep with a settle window; use its established bounded completion check.
  await expect.poll(async () => (await readEmulatorData<{ state: string }>(`tripDeletions/${PHOTO_ROOM}`))?.state, { timeout: 30_000 }).toBe('deleted');
  expect(await readEmulatorData(`rooms/${PHOTO_ROOM}`)).toBeNull();
  expect(await readEmulatorData(`roomAccess/${PHOTO_ROOM}`)).toBeNull();
  expect(await listEmulatorStorageObjects(`rooms/${PHOTO_ROOM}`)).toEqual([]);
  await page.reload();
  await openMemory(page, PHOTO_ROOM);
  await expect(detail.getByRole('button', { name: /^放大照片：/ })).toHaveCount(12);
  const images = detail.getByRole('img');
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(async () => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    await expect(image).toHaveAttribute('src', /^blob:/);
  }
  await detail.getByRole('button', { name: /^放大照片：/ }).first().click();
  await expect(page.getByRole('button', { name: '關閉照片' })).toBeVisible();
  await page.getByRole('button', { name: '關閉照片' }).click();
  await detail.getByText('整理這份回憶', { exact: true }).click();
  await expect(detail.getByRole('button', { name: '開啟原行程', exact: true })).toBeDisabled();
  await detail.getByRole('button', { name: '刪除這份個人回憶' }).click();
  await page.getByRole('button', { name: '確認刪除個人回憶' }).click();
  await expect(page.getByRole('heading', { name: '個人回憶已刪除' })).toBeVisible();
  expect(await readEmulatorData(personalPath)).toBeNull();
  const deletedArchive = await readEmulatorData<Archive>(personalArchive(OWNER, PHOTO_ROOM));
  expect(deletedArchive?.summary.state).toBe('deleted');
  expect(deletedArchive?.photos).toBeUndefined();
  expect(deletedArchive?.itinerary).toBeUndefined();
  expect(await listEmulatorStorageObjects(`travelMemories/${OWNER}/${PHOTO_ROOM}`)).toEqual([]);
  expect(await readEmulatorData(`personalTravel/${COMPANION}/memories/${PHOTO_ROOM}`)).toEqual(companionMemory);
  expect(await readEmulatorData(personalArchive(COMPANION, PHOTO_ROOM))).toEqual(companionArchive);
  expect((await listEmulatorStorageObjects(`travelMemories/${COMPANION}/${PHOTO_ROOM}`)).map((photo) => photo.name).sort()).toEqual(companionPhotos.map((photo) => photo.name).sort());
});
