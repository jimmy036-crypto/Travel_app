import { expect, test, type Locator, type Page } from '@playwright/test';
import { clearEmulatorDatabase, seedTestTrip, writeEmulatorData } from './support/emulator';

const ROOM = 'journal-contrast';
const itinerary = { 'Day 1': [{ id: 'museum', name: '宜蘭美術館', time: '13:00', address: '宜蘭市的旅行風景' }] };

// Use the existing browser contrast calculation, including translucent ancestor
// surfaces. Sample enabled controls without gradients or group opacity.
async function readable(locator: Locator) {
  await expect(locator).toBeVisible();
  await locator.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const ratio = await locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = [...context.getImageData(0, 0, 1, 1).data];
      return [channels[0], channels[1], channels[2], channels[3] / 255];
    };
    const over = (front: number[], back: number[]) => [
      ...front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3])), 1,
    ];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
    let background = [255, 255, 255, 1];
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) throw Error('Unsupported contrast sample');
      background = over(rgba(style.backgroundColor), background);
    }
    const luminance = (color: number[]) => color.slice(0, 3).reduce((sum, channel, index) => {
      const value = channel / 255;
      return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const values = [luminance(background), luminance(over(rgba(getComputedStyle(element).color), background))];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  });
  expect(ratio, `Contrast for ${await locator.innerText()}`).toBeGreaterThanOrEqual(4.5);
  return ratio;
}

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: '旅行紀錄' }).getByRole('button', { name, exact: true });

test.beforeEach(async ({ page }) => {
  await clearEmulatorDatabase();
  await seedTestTrip(ROOM, { title: '宜蘭一日遊', startDate: '2026-09-01', endDate: '2026-09-02', destination: '宜蘭', itinerary });
  await writeEmulatorData(`personalTravel/e2e-owner/memories/${ROOM}`, {
    roomId: ROOM, title: '宜蘭一日遊', startDate: '2026-09-01', endDate: '2026-09-02', destination: '宜蘭',
    revision: 1, archived: true, note: '留住這次旅行的風景。',
    visits: {
      'manual~museum': { source: 'manual', name: '美術館', city: '宜蘭', date: '2026-09-01', status: 'visited' },
      'manual~cafe': { source: 'manual', name: '咖啡店', city: '台北', date: '2026-09-02', status: 'visited' },
    },
  });
  await writeEmulatorData(`travelMemoryArchives/e2e-owner/${ROOM}`, {
    summary: { state: 'complete', saved: 0, total: 0, completedAt: 1 }, itinerary,
  });
  await writeEmulatorData('personalTravel/e2e-owner/collections/museums', {
    id: 'museums', title: '美術館收藏', revision: 1, items: { first: { name: '下一間美術館', city: '宜蘭' } },
  });
  await page.addInitScript(() => localStorage.setItem('travel-app-seen-onboarding-v1', 'true'));
});
test.afterEach(async () => { await clearEmulatorDatabase(); });

for (const theme of [{ name: 'light', color: '#27bdf2' }, { name: 'dark', color: '#123456' }, { name: 'medium', color: '#808080' }]) {
  test(`memory and related controls follow ${theme.name} surfaces in both OS color schemes`, async ({ page }, testInfo) => {
    await page.addInitScript((color) => localStorage.setItem('google-travel-custom-bg', color), theme.color);
    const ratios: Record<string, number> = {};
    for (const os of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: os });
      await page.goto(`/?view=memories&memory=${ROOM}`);
      const detail = page.getByTestId('memory-detail');
      const close = detail.getByRole('button', { name: '關閉回憶' });
      ratios[`${os}-close`] = await readable(close);
      ratios[`${os}-edit`] = await readable(detail.getByRole('button', { name: '補充回憶與到訪' }));
      if (os === 'dark') await testInfo.attach(`${theme.name}-memory-detail`, { body: await page.screenshot(), contentType: 'image/png' });
      await detail.getByRole('button', { name: '補充回憶與到訪' }).click();
      const editor = page.getByTestId('memory-editor');
      ratios[`${os}-light-footer`] = await readable(editor.getByRole('button', { name: '取消', exact: true }));
      ratios[`${os}-save`] = await readable(editor.getByRole('button', { name: '儲存回憶' }));
      await editor.getByRole('button', { name: '關閉', exact: true }).click();
      await detail.getByText('整理這份回憶', { exact: true }).click();
      ratios[`${os}-danger`] = await readable(detail.getByRole('button', { name: '刪除這份個人回憶' }));
      await detail.getByRole('button', { name: '複製成新旅程' }).click();
      const clone = page.getByRole('dialog', { name: '帶著回憶，再出發' });
      ratios[`${os}-clone-cancel`] = await readable(clone.getByRole('button', { name: '取消', exact: true }));
      await clone.getByRole('button', { name: '取消', exact: true }).click();
      await close.click();
      const footprintsNav = nav(page, '我的足跡');
      ratios[`${os}-navigation`] = await readable(footprintsNav);
      await footprintsNav.hover();
      ratios[`${os}-navigation-hover`] = await readable(footprintsNav);
      await page.mouse.move(0, 0);
      await footprintsNav.focus();
      ratios[`${os}-navigation-focus`] = await readable(footprintsNav);
      ratios[`${os}-share-entry`] = await readable(page.getByRole('button', { name: '選擇回憶來分享' }));
      await page.getByRole('button', { name: '選擇回憶來分享' }).click();
      const share = page.getByRole('dialog', { name: '分享你選的回憶' });
      ratios[`${os}-share-close`] = await readable(share.getByRole('button', { name: '關閉', exact: true }));
      await share.getByRole('button', { name: '關閉', exact: true }).click();
      await nav(page, '我的足跡').click();
      ratios[`${os}-unselected-city`] = await readable(page.getByRole('button', { name: /次/, pressed: false }));
      ratios[`${os}-city-collection`] = await readable(page.getByRole('button', { name: '收藏這座城市' }));
      await nav(page, '我的收藏').click();
      ratios[`${os}-collection-entry`] = await readable(page.getByRole('button', { name: '查看收藏' }));
      await page.getByRole('button', { name: '編輯收藏' }).click();
      const collection = page.getByRole('dialog', { name: '收藏下一趟的靈感' });
      ratios[`${os}-collection-close`] = await readable(collection.getByRole('button', { name: '關閉', exact: true }));
      await collection.getByRole('button', { name: '關閉', exact: true }).click();
      await page.getByRole('button', { name: '刪除收藏', exact: true }).click();
      const deletion = page.getByRole('dialog', { name: '刪除「美術館收藏」？' });
      ratios[`${os}-delete-confirm`] = await readable(deletion.getByRole('button', { name: '確認刪除收藏' }));
      await deletion.getByRole('button', { name: '取消', exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    }
    await testInfo.attach('actual-surface-contrast', { body: JSON.stringify(ratios), contentType: 'application/json' });
  });
}
