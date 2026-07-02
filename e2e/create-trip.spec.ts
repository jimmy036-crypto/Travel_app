import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

async function closeUpdateNoticeIfVisible(page: Page) {
  const closeButton = page.getByRole("button", {
    name: "太棒了，開始使用！",
  });

  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click();
  }
}

type TripMeta = {
  title?: string;
};

async function readTripMeta(
  request: APIRequestContext,
  roomId: string,
  databaseNamespace: string,
): Promise<TripMeta | null> {
  const response = await request.get(
    `http://127.0.0.1:9000/rooms/${encodeURIComponent(
      roomId,
    )}/meta.json?ns=${encodeURIComponent(databaseNamespace)}`,
  );

  expect(response.ok()).toBe(true);
  return (await response.json()) as TripMeta | null;
}

test("建立旅程後，重新整理仍保留 Firebase Emulator 資料", async ({
  page,
  request,
}) => {
  const uniqueName = `E2E 測試旅程 ${Date.now()}`;

  await page.goto("/");
  await closeUpdateNoticeIfVisible(page);

  await expect(page.getByTestId("travel-lobby")).toBeVisible();

  await page.getByTestId("create-trip-button").click();
  await expect(page.getByTestId("trip-modal")).toBeVisible();
  await expect(page.getByTestId("trip-modal-title")).toContainText(
    "建立新旅程",
  );

  await page.getByTestId("trip-name-input").fill(uniqueName);

  // Emulator 模式使用固定座標與相對日期，避免依賴 Google Places 網路結果。
  await page.getByTestId("fill-emulator-required-fields").click();

  await expect(
    page.getByTestId("trip-destination-field").locator("input"),
  ).toHaveValue("台北市（Emulator 測試）");
  await expect(page.getByTestId("trip-date-range")).toContainText("至");

  await page.getByTestId("create-trip-submit").click();

  const activeTrip = page.getByTestId("active-trip-view");
  await expect(activeTrip).toBeAttached({ timeout: 15_000 });

  const tripUrl = page.url();
  expect(tripUrl).toContain("?room=");

  const roomId = await activeTrip.getAttribute("data-room-id");
  const databaseNamespace = await activeTrip.getAttribute(
    "data-database-namespace",
  );

  expect(roomId).toBeTruthy();
  expect(databaseNamespace).toBeTruthy();

  const firstMeta = await readTripMeta(
    request,
    String(roomId),
    String(databaseNamespace),
  );
  expect(firstMeta?.title).toBe(uniqueName);

  // 重新整理只驗證這條測試的核心責任：
  // URL 仍指向同一旅程，而且 Emulator 中的資料沒有消失。
  // TripDetail 的視覺載入會另外建立 UI smoke test，避免與 Google Maps 載入耦合。
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(page).toHaveURL(tripUrl);
  await expect(page.getByTestId("active-trip-view")).toBeAttached({
    timeout: 15_000,
  });

  const reloadedMeta = await readTripMeta(
    request,
    String(roomId),
    String(databaseNamespace),
  );
  expect(reloadedMeta?.title).toBe(uniqueName);

  // 回到首頁後，本機捷徑也應保留這趟旅程。
  await page.goto("/");
  await closeUpdateNoticeIfVisible(page);

  await expect(
    page.getByTestId("trip-card-title").filter({ hasText: uniqueName }),
  ).toBeVisible();
});
