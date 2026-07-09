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
const RESOURCE_IMAGE_FILE_NAME = 'phase-4-place-menu.png';
const RESOURCE_IMAGE_TITLE = 'E2E 菜單圖片';
const RESOURCE_PDF_FILE_NAME = 'phase-4-place-menu.pdf';
const RESOURCE_PDF_TITLE = 'E2E 菜單 PDF';

const PDF_DOCUMENT = Buffer.from(
  '%PDF-1.4\n% E2E place attachment\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n',
  'utf8',
);

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

type PlaceResource = {
  id?: string;
  kind?: string;
  type?: string;
  title?: string;
  url?: string;
  storagePath?: string;
  fileName?: string;
  contentType?: string;
  size?: number;
  uploadedAt?: number | null;
};

type PlaceItem = {
  id?: string;
  name?: string;
  customName?: string;
  placePhoto?: PlacePhoto | null;
  resources?: PlaceResource[];
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


test('景點資料圖片會上傳、持久化並從 Database 與 Storage 一併刪除', async ({
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
  await page.getByTestId('place-resource-mode-image-button').click();
  await page.getByTestId('place-resource-image-input').setInputFiles({
    name: RESOURCE_IMAGE_FILE_NAME,
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page
    .getByTestId('place-resource-image-title-input')
    .fill(RESOURCE_IMAGE_TITLE);
  await page.getByTestId('place-resource-image-add-button').click();

  const pendingResourceRow = page
    .getByTestId('place-resource-row')
    .filter({ hasText: RESOURCE_IMAGE_TITLE })
    .first();
  await expect(pendingResourceRow).toBeVisible();
  await expect(pendingResourceRow).toContainText('待儲存上傳');

  await page.getByTestId('save-place-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeHidden({
    timeout: 45_000,
  });

  let savedResource: PlaceResource | undefined;

  await expect
    .poll(
      async () => {
        const place = (await readDayOnePlaces()).find(
          (item) => String(item.id) === placeId,
        );
        savedResource = place?.resources?.find(
          (resource) => resource.title === RESOURCE_IMAGE_TITLE,
        );

        return savedResource
          ? {
              hasId: Boolean(savedResource.id),
              hasDownloadUrl: Boolean(savedResource.url),
              correctPrefix: String(savedResource.storagePath || '').startsWith(
                `${STORAGE_PREFIX}/${placeId}/`,
              ),
              correctFileName: String(savedResource.storagePath || '').endsWith(
                `_${RESOURCE_IMAGE_FILE_NAME}`,
              ),
              kind: savedResource.kind,
              type: savedResource.type,
              fileName: savedResource.fileName,
              contentType: savedResource.contentType,
              size: savedResource.size,
              hasUploadedAt: Number(savedResource.uploadedAt || 0) > 0,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '景點資料圖片應寫入 Database Emulator',
      },
    )
    .toEqual({
      hasId: true,
      hasDownloadUrl: true,
      correctPrefix: true,
      correctFileName: true,
      kind: 'file',
      type: 'menu',
      fileName: RESOURCE_IMAGE_FILE_NAME,
      contentType: 'image/png',
      size: PNG_1X1.byteLength,
      hasUploadedAt: true,
    });

  const resourceId = String(savedResource?.id || '');
  const storagePath = String(savedResource?.storagePath || '');
  expect(resourceId).not.toBe('');
  expect(storagePath).not.toBe('');

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(true);

  const metadata = await readEmulatorStorageObjectMetadata(storagePath);
  expect(metadata?.contentType).toBe('image/png');
  expect(Number(metadata?.size)).toBe(PNG_1X1.byteLength);
  expect(metadata?.metadata?.roomId).toBe(ROOM_ID);
  expect(metadata?.metadata?.itemId).toBe(placeId);
  expect(metadata?.metadata?.resourceId).toBe(resourceId);
  expect(metadata?.metadata?.resourceType).toBe('menu');

  await page.reload();
  await expect(placeCard(page)).toBeVisible({ timeout: 20_000 });
  await openPlaceEditor(page);

  const persistedResourceRow = page
    .getByTestId('place-resource-row')
    .filter({ hasText: RESOURCE_IMAGE_TITLE })
    .first();
  await expect(persistedResourceRow).toBeVisible();
  await expect(persistedResourceRow).toContainText(RESOURCE_IMAGE_FILE_NAME);

  await persistedResourceRow
    .getByTestId('place-resource-remove-button')
    .click();
  await expect(persistedResourceRow).toBeHidden();
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
        return Boolean(
          place?.resources?.some((resource) => resource.id === resourceId),
        );
      },
      {
        timeout: 15_000,
        message: '移除後 Database Emulator 不應保留景點資料圖片',
      },
    )
    .toBe(false);

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(false);
});


test('景點 PDF 附件會上傳、持久化並從 Database 與 Storage 一併刪除', async ({
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
  await page.getByTestId('place-resource-mode-pdf-button').click();
  await page.getByTestId('place-resource-pdf-input').setInputFiles({
    name: RESOURCE_PDF_FILE_NAME,
    mimeType: 'application/pdf',
    buffer: PDF_DOCUMENT,
  });
  await page
    .getByTestId('place-resource-pdf-title-input')
    .fill(RESOURCE_PDF_TITLE);
  await page.getByTestId('place-resource-pdf-add-button').click();

  const pendingResourceRow = page
    .getByTestId('place-resource-row')
    .filter({ hasText: RESOURCE_PDF_TITLE })
    .first();
  await expect(pendingResourceRow).toBeVisible();
  await expect(pendingResourceRow).toContainText('待儲存上傳');

  await page.getByTestId('save-place-button').click();
  await expect(page.getByTestId('edit-place-modal')).toBeHidden({
    timeout: 45_000,
  });

  let savedResource: PlaceResource | undefined;

  await expect
    .poll(
      async () => {
        const place = (await readDayOnePlaces()).find(
          (item) => String(item.id) === placeId,
        );
        savedResource = place?.resources?.find(
          (resource) => resource.title === RESOURCE_PDF_TITLE,
        );

        return savedResource
          ? {
              hasId: Boolean(savedResource.id),
              hasDownloadUrl: Boolean(savedResource.url),
              correctPrefix: String(savedResource.storagePath || '').startsWith(
                `${STORAGE_PREFIX}/${placeId}/`,
              ),
              correctFileName: String(savedResource.storagePath || '').endsWith(
                `_${RESOURCE_PDF_FILE_NAME}`,
              ),
              kind: savedResource.kind,
              type: savedResource.type,
              fileName: savedResource.fileName,
              contentType: savedResource.contentType,
              size: savedResource.size,
              hasUploadedAt: Number(savedResource.uploadedAt || 0) > 0,
            }
          : null;
      },
      {
        timeout: 15_000,
        message: '景點 PDF 附件應寫入 Database Emulator',
      },
    )
    .toEqual({
      hasId: true,
      hasDownloadUrl: true,
      correctPrefix: true,
      correctFileName: true,
      kind: 'file',
      type: 'menu',
      fileName: RESOURCE_PDF_FILE_NAME,
      contentType: 'application/pdf',
      size: PDF_DOCUMENT.byteLength,
      hasUploadedAt: true,
    });

  const resourceId = String(savedResource?.id || '');
  const storagePath = String(savedResource?.storagePath || '');
  expect(resourceId).not.toBe('');
  expect(storagePath).not.toBe('');

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(true);

  const metadata = await readEmulatorStorageObjectMetadata(storagePath);
  expect(metadata?.contentType).toBe('application/pdf');
  expect(Number(metadata?.size)).toBe(PDF_DOCUMENT.byteLength);
  expect(metadata?.metadata?.roomId).toBe(ROOM_ID);
  expect(metadata?.metadata?.itemId).toBe(placeId);
  expect(metadata?.metadata?.resourceId).toBe(resourceId);
  expect(metadata?.metadata?.resourceType).toBe('menu');

  await page.reload();
  await expect(placeCard(page)).toBeVisible({ timeout: 20_000 });
  await openPlaceEditor(page);

  const persistedResourceRow = page
    .getByTestId('place-resource-row')
    .filter({ hasText: RESOURCE_PDF_TITLE })
    .first();
  await expect(persistedResourceRow).toBeVisible();
  await expect(persistedResourceRow).toContainText(RESOURCE_PDF_FILE_NAME);

  await persistedResourceRow
    .getByTestId('place-resource-remove-button')
    .click();
  await expect(persistedResourceRow).toBeHidden();
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
        return Boolean(
          place?.resources?.some((resource) => resource.id === resourceId),
        );
      },
      {
        timeout: 15_000,
        message: '移除後 Database Emulator 不應保留景點 PDF 附件',
      },
    )
    .toBe(false);

  await expect.poll(async () => {
    return await storageObjectExists(storagePath);
  }).toBe(false);
});
