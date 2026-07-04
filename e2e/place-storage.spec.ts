import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  readEmulatorData,
  readEmulatorStorageObjectMetadata,
  seedTestTrip,
  storageObjectExists,
} from './support/emulator';

const ROOM_ID = 'e2eplacestorageroom0001';
const STORAGE_PREFIX = `rooms/${ROOM_ID}/places`;
const PLACE_NAME = 'E2E 測試餐廳';
const PHOTO_FILE_NAME = 'phase-4-place-cover.png';

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

type PlacePhoto = {
  url?: string;
  storagePath?: string;
  fileName?: string;
  contentType?: string;
  uploadedAt?: number;
};

type PlaceItem = {
  id?: string;
  name?: string;
  customName?: string;
  placePhoto?: PlacePhoto | null;
};

async function readDayOnePlaces(): Promise<PlaceItem[]> {
  const value = await readEmulatorData<
    PlaceItem[] | Record<string, PlaceItem>
  >(`rooms/${ROOM_ID}/itinerary/Day 1`);

  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function placeCard(page: Page) {
  return page
    .getByTestId('place-card')
    .filter({ hasText: PLACE_NAME })
    .first();
}

async function addTestPlace(page: Page): Promise<void> {
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });

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

  await expect(placeCard(page)).toBeVisible({ timeout: 15_000 });
}

async function openPlaceEditor(page: Page): Promise<void> {
  await placeCard(page).click();
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
  await page.getByTestId('place-detail-edit-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeVisible();
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await clearEmulatorStorage(STORAGE_PREFIX);
  await seedTestTrip(ROOM_ID, {
    title: 'E2E 景點 Storage 測試旅程',
    members: ['自己', '朋友'],
  });
});

test.afterEach(async () => {
  await clearEmulatorStorage(STORAGE_PREFIX);
});

test('景點封面圖片會上傳、持久化並從 Database 與 Storage 一併刪除', async ({
  page,
}) => {
  await page.goto(`/?room=${ROOM_ID}`);
  await addTestPlace(page);

  let placeId = '';
  await expect
    .poll(
      async () => {
        const place = (await readDayOnePlaces()).find(
          (item) => item.name === PLACE_NAME,
        );
        placeId = String(place?.id || '');
        return placeId;
      },
      {
        timeout: 15_000,
        message: '測試景點應寫入 Database Emulator',
      },
    )
    .not.toBe('');

  await openPlaceEditor(page);
  await page.getByTestId('place-resources-toggle').click();
  await page.getByTestId('place-photo-input').setInputFiles({
    name: PHOTO_FILE_NAME,
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await expect(page.getByTestId('place-photo-preview')).toBeVisible();
  await page.getByTestId('save-place-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeHidden({
    timeout: 45_000,
  });

  let savedPhoto: PlacePhoto | null | undefined;

  await expect
    .poll(
      async () => {
        const place = (await readDayOnePlaces()).find(
          (item) => String(item.id) === placeId,
        );
        savedPhoto = place?.placePhoto;

        return savedPhoto
          ? {
              hasDownloadUrl: Boolean(savedPhoto.url),
              correctPrefix: String(savedPhoto.storagePath || '').startsWith(
                `${STORAGE_PREFIX}/${placeId}/`,
              ),
              correctFileName: String(savedPhoto.storagePath || '').endsWith(
                `_${PHOTO_FILE_NAME}`,
              ),
              fileName: savedPhoto.fileName,
              contentType: savedPhoto.contentType,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '景點封面資料應寫入 Database Emulator',
      },
    )
    .toEqual({
      hasDownloadUrl: true,
      correctPrefix: true,
      correctFileName: true,
      fileName: PHOTO_FILE_NAME,
      contentType: 'image/png',
    });

  const storagePath = String(savedPhoto?.storagePath || '');
  expect(storagePath).not.toBe('');

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(true);

  const metadata = await readEmulatorStorageObjectMetadata(storagePath);
  expect(metadata?.contentType).toBe('image/png');
  expect(Number(metadata?.size)).toBe(PNG_1X1.byteLength);
  expect(metadata?.metadata?.roomId).toBe(ROOM_ID);
  expect(metadata?.metadata?.itemId).toBe(placeId);

  await page.reload();
  await expect(placeCard(page)).toBeVisible({ timeout: 20_000 });
  await openPlaceEditor(page);
  await expect(page.getByTestId('place-photo-preview')).toBeVisible();

  await page.getByTestId('place-photo-remove-button').click();
  await expect(page.getByTestId('place-photo-preview')).toBeHidden();
  await page.getByTestId('save-place-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeHidden({
    timeout: 20_000,
  });

  await expect
    .poll(
      async () => {
        const place = (await readDayOnePlaces()).find(
          (item) => String(item.id) === placeId,
        );
        return Boolean(place?.placePhoto);
      },
      {
        timeout: 15_000,
        message: '移除後 Database Emulator 不應保留景點封面資料',
      },
    )
    .toBe(false);

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(false);
});
