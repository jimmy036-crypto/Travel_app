import { expect, test } from '@playwright/test';
import {
  clearEmulatorStorage,
  deleteEmulatorStorageObject,
  listEmulatorStorageObjects,
  readEmulatorStorageObjectMetadata,
  storageObjectExists,
  uploadEmulatorStorageObject,
} from './support/emulator';

const STORAGE_PREFIX = 'e2e/storage-emulator-smoke';
const STORAGE_PATH = `${STORAGE_PREFIX}/hello.txt`;
const FILE_CONTENTS = 'Phase 4 Storage Emulator smoke test';

test.describe('Storage Emulator 測試工具', () => {
  test.beforeEach(async () => {
    await clearEmulatorStorage(STORAGE_PREFIX);
  });

  test.afterEach(async () => {
    await clearEmulatorStorage(STORAGE_PREFIX);
  });

  test('可上傳、查詢、列出並刪除 Storage object', async () => {
    await expect.poll(async () => {
      return await listEmulatorStorageObjects(STORAGE_PREFIX);
    }).toEqual([]);

    const uploaded = await uploadEmulatorStorageObject(
      STORAGE_PATH,
      FILE_CONTENTS,
      'text/plain; charset=utf-8',
    );

    expect(uploaded.name).toBe(STORAGE_PATH);

    await expect.poll(async () => {
      return await storageObjectExists(STORAGE_PATH);
    }).toBe(true);

    const metadata = await readEmulatorStorageObjectMetadata(STORAGE_PATH);
    expect(metadata).not.toBeNull();
    expect(metadata?.name).toBe(STORAGE_PATH);
    expect(metadata?.contentType).toContain('text/plain');
    expect(Number(metadata?.size)).toBe(Buffer.byteLength(FILE_CONTENTS));

    const objects = await listEmulatorStorageObjects(STORAGE_PREFIX);
    expect(objects.map((object) => object.name)).toContain(STORAGE_PATH);

    await deleteEmulatorStorageObject(STORAGE_PATH);

    await expect.poll(async () => {
      return await storageObjectExists(STORAGE_PATH);
    }).toBe(false);

    // 404 視為已刪除，重複清理不應造成測試失敗。
    await deleteEmulatorStorageObject(STORAGE_PATH);
  });
});
