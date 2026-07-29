import { expect, test } from '@playwright/test';

import { clearEmulatorDatabase, seedTestTrip } from './support/emulator';
import { mouseDragHandle } from './support/touchDrag';

// The panel is a diagnostic surface, not a replacement for a physical
// iPhone Safari session - see docs/decisions/MOBILE_DND_RELEASE_BEHAVIOR.md.
const ROOM_ID = 'e2ednddebugpanel0001';

function seedDay(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `debug-${index + 1}`,
    name: `除錯面板景點 ${index + 1}`,
    customName: '',
    time: `${String(9 + index).padStart(2, '0')}:00`,
    stayTime: 20,
    tags: [],
  }));
}

test.beforeEach(async () => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM_ID, {
    title: 'E2E dndDebug Panel',
    startDate: '2026-09-20',
    endDate: '2026-09-20',
    itinerary: { 'Day 1': seedDay(4) },
  });
});

test('the debug panel does not render without ?dndDebug=1', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();
  await expect(page.getByTestId('dnd-debug-panel')).toHaveCount(0);
});

test('?dndDebug=1 shows a non-PII lifecycle log with no extra tap or click', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?room=${ROOM_ID}&dndDebug=1`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible();

  const panel = page.getByTestId('dnd-debug-panel');
  await expect(panel).toBeVisible();
  await panel.getByTestId('dnd-debug-clear').click();

  const handle = page.getByTestId('place-drag-handle').first();
  await mouseDragHandle(page, handle, 160);

  await expect(panel).toContainText('onDragStart');
  await expect(panel).toContainText('onDragEnd');
  await expect(panel).toContainText('onDragEnd:commit');

  const panelText = (await panel.textContent()) || '';
  expect(panelText).not.toContain('除錯面板景點');
  expect(panelText).not.toMatch(/e2ednddebugpanel/i);

  // Collapse/copy controls exist and toggle without unmounting the panel.
  await panel.getByTestId('dnd-debug-toggle').click();
  await expect(panel.locator('table')).toHaveCount(0);
  await panel.getByTestId('dnd-debug-toggle').click();
  await expect(panel.locator('table')).toBeVisible();
});
