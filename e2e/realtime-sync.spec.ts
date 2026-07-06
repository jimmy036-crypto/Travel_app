import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
  writeEmulatorData,
} from './support/emulator';

const ROOM_ID = 'e2erealtimesyncroom0001';
const INITIAL_TITLE = 'E2E realtime sync initial trip';
const FIRST_UPDATED_TITLE = 'E2E realtime sync first update';
const SECOND_UPDATED_TITLE = 'E2E realtime sync second update';
const LOCAL_STORAGE_KEY = 'e2e-realtime-sync-context-marker';

function contextOptionsForProject(projectName: string): BrowserContextOptions {
  const deviceOptions = projectName === 'Mobile Safari'
    ? devices['iPhone 13']
    : devices['Desktop Chrome'];

  return {
    ...deviceOptions,
    baseURL: 'http://127.0.0.1:4174',
    serviceWorkers: 'block',
  };
}

async function openRoom(
  browser: Browser,
  projectName: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext(
    contextOptionsForProject(projectName),
  );
  const page = await context.newPage();

  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('trip-route-context')).toHaveAttribute(
    'data-room-id',
    ROOM_ID,
    { timeout: 20_000 },
  );
  await expect(page.getByTestId('active-trip-view')).toBeVisible({
    timeout: 20_000,
  });
  await expectTripTitle(page, INITIAL_TITLE);

  return { context, page };
}

async function expectTripTitle(page: Page, title: string): Promise<void> {
  await expect(
    page.getByTestId('active-trip-view').getByRole('heading', {
      exact: true,
      name: title,
    }),
  ).toBeVisible({ timeout: 20_000 });
}

async function setLocalStorageMarker(
  page: Page,
  value: string,
): Promise<void> {
  await page.evaluate(
    ([key, marker]) => {
      localStorage.setItem(key, marker);
    },
    [LOCAL_STORAGE_KEY, value],
  );
}

async function getLocalStorageMarker(page: Page): Promise<string | null> {
  return await page.evaluate(
    (key) => localStorage.getItem(key),
    LOCAL_STORAGE_KEY,
  );
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, { title: INITIAL_TITLE });
});

test('keeps isolated contexts synced through Firebase realtime listener', async ({
  browser,
}, testInfo) => {
  const contextA = await openRoom(browser, testInfo.project.name);
  const contextB = await openRoom(browser, testInfo.project.name);

  try {
    await setLocalStorageMarker(contextA.page, 'context-a');
    await setLocalStorageMarker(contextB.page, 'context-b');

    await expect.poll(async () => await getLocalStorageMarker(contextA.page))
      .toBe('context-a');
    await expect.poll(async () => await getLocalStorageMarker(contextB.page))
      .toBe('context-b');

    await writeEmulatorData(
      `rooms/${ROOM_ID}/meta/title`,
      FIRST_UPDATED_TITLE,
    );

    await expectTripTitle(contextA.page, FIRST_UPDATED_TITLE);
    await expectTripTitle(contextB.page, FIRST_UPDATED_TITLE);

    await contextA.context.close();

    await writeEmulatorData(
      `rooms/${ROOM_ID}/meta/title`,
      SECOND_UPDATED_TITLE,
    );

    await expectTripTitle(contextB.page, SECOND_UPDATED_TITLE);
  } finally {
    if (!contextA.context.pages().every((page) => page.isClosed())) {
      await contextA.context.close();
    }
    await contextB.context.close();
  }
});
