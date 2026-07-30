import { expect, test, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  seedTestTrip,
} from './support/emulator';
import { mouseDragHandle } from './support/touchDrag';

// WebKit does not reliably deliver synthetic `Touch`/`TouchEvent`s to
// @hello-pangea/dnd's touch sensor in headless mode (see
// docs/decisions/MOBILE_DND_RELEASE_BEHAVIOR.md), so these specs drive the
// same onDragEnd/click-suppression contract through the library's pointer
// (mouse) sensor on a real iPhone viewport. Firebase persistence of a
// reorder is already covered by the pre-existing keyboard-driven drag spec
// (e2e/mobile-itinerary-timeline.spec.ts), which this change does not touch.
// These specs are a stand-in for, not a replacement of, the physical
// iPhone Safari touch checklist.
const ROOM_ID = 'e2emobiletouchdrag0001';

async function visibleOrder(page: Page): Promise<string[]> {
  return (await page.getByTestId('place-card-title').allTextContents())
    .map((text) => text.trim());
}

function seedDay(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `touch-${index + 1}`,
    name: `觸控拖曳景點 ${index + 1}`,
    customName: '',
    time: `${String(9 + index).padStart(2, '0')}:00`,
    stayTime: 20,
    tags: [],
  }));
}

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E Touch Drag',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    itinerary: { 'Day 1': seedDay(4) },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
});

test('an adjacent drag release swaps order immediately without an extra tap or opening details', async ({ page }) => {
  const initialOrder = await visibleOrder(page);
  const clickCount = await page.evaluate(() => {
    const state = { count: 0 };
    (window as unknown as { __clickProbe: typeof state }).__clickProbe = state;
    document.addEventListener('click', () => { state.count += 1; }, true);
    return state.count;
  });
  expect(clickCount).toBe(0);

  const firstHandle = page.getByTestId('place-drag-handle').first();
  const cardHeight = (await page.getByTestId('place-card').first().boundingBox())?.height || 90;

  await mouseDragHandle(page, firstHandle, cardHeight * 1.5);

  // The reorder is committed on release alone; no synthetic click is
  // needed, and any click a touch release fires afterwards must be ignored.
  await expect.poll(() => visibleOrder(page)).toEqual([
    initialOrder[1],
    initialOrder[0],
    initialOrder[2],
    initialOrder[3],
  ]);
  await expect(page.getByTestId('place-detail-sheet')).toHaveCount(0);
  await expect(page.getByTestId('itinerary-drag-clone')).toHaveCount(0);

  const clicksFired = await page.evaluate(() => (
    (window as unknown as { __clickProbe?: { count: number } }).__clickProbe?.count ?? 0
  ));
  expect(clicksFired).toBe(0);
});

test('a cancelled drag clears drag state without reordering', async ({ page }) => {
  const initialOrder = await visibleOrder(page);
  const handle = page.getByTestId('place-drag-handle').first();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move((box?.x || 0) + (box?.width || 0) / 2, (box?.y || 0) + (box?.height || 0) / 2);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move((box?.x || 0) + (box?.width || 0) / 2, (box?.y || 0) + 60, { steps: 4 });
  await page.waitForTimeout(60);
  await page.keyboard.press('Escape');
  await page.mouse.up();

  await expect(page.getByTestId('itinerary-drag-clone')).toHaveCount(0);
  await expect.poll(() => visibleOrder(page)).toEqual(initialOrder);
});

test('a normal tap without dragging still opens place details', async ({ page }) => {
  const firstCard = page.getByTestId('place-card').first();
  await firstCard.getByTestId('timeline-place-card-surface').click();
  await expect(page.getByTestId('place-detail-sheet')).toBeVisible();
});
