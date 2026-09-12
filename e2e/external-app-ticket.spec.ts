import { expect, test, type Browser, type Page } from '@playwright/test';

import { writeEmulatorData } from './support/emulator';
import {
  MEMBER_A,
  MEMBER_B,
  TEST_MEMBERS,
  contextOptionsForProject,
  createExternalTicket,
  createWebTicket,
  markReleaseSeen,
  openCreateTicket,
  openEditTicket,
  openTicketPanel,
  prepareTicketRoom,
  readTicket,
  readTickets,
  safeMemberTestId,
  submitTicket,
  ticketCard,
  type TicketRecord,
} from './support/tickets';

const ROOM_ID = 'e2eexternalapptickets001';
const ACTIVE_MEMBER_KEY = `travel-companion-v1:${JSON.stringify(['firebase', 'e2e-owner', ROOM_ID])}`;
const confirmedRecord = (member: string) => JSON.stringify({ version: 1, confirmed: true, member });
const CANONICAL_KEYS = [
  'appName', 'appUrl', 'assignedMembers', 'attachmentKind', 'audienceType',
  'createdAt', 'dayId', 'dynamicCode', 'fallbackUrl', 'id', 'instructions',
  'memo', 'orderNumber', 'owner', 'presenterMember', 'reminderMinutes',
  'requiresLogin', 'requiresNetwork', 'storagePath', 'ticketType', 'title',
  'type', 'updatedAt', 'url', 'usageDetails', 'usageTime',
].sort();

async function expectSafeAnchor(anchor: ReturnType<Page['getByRole']>, href: string) {
  await expect(anchor).toHaveAttribute('href', href);
  await expect(anchor).toHaveAttribute('target', '_blank');
  await expect(anchor).toHaveAttribute('rel', /\bnoopener\b/);
  await expect(anchor).toHaveAttribute('rel', /\bnoreferrer\b/);
}

async function chooseIdentity(page: Page, member: string): Promise<void> {
  await page.getByRole('button', { name: '選擇旅伴', exact: true }).click();
  await page.getByTestId('companion-member')
    .filter({ hasText: member })
    .click();
}

async function expectTitles(page: Page, expected: string[]): Promise<void> {
  await expect(page.getByTestId('ticket-card')).toHaveCount(expected.length);
  for (const title of expected) await expect(ticketCard(page, title)).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await prepareTicketRoom(ROOM_ID);
  await markReleaseSeen(page);
});

test('creates a canonical web-link ticket and survives reload', async ({ page }) => {
  await openTicketPanel(page, ROOM_ID);
  await createWebTicket(page, {
    title: 'Official rail web ticket',
    url: 'tickets.example.test/booking/123',
  });

  const card = ticketCard(page, 'Official rail web ticket');
  await expect(card).toContainText('網頁票券');
  await expectSafeAnchor(
    card.getByRole('link', { name: '開啟票券網站' }),
    'https://tickets.example.test/booking/123',
  );

  const saved = await readTicket(ROOM_ID, 'Official rail web ticket');
  expect(Object.keys(saved).sort()).toEqual(
    CANONICAL_KEYS.filter((key) => key !== 'assignedMembers'),
  );
  expect(saved).toMatchObject({
    ticketType: 'web-link',
    dayId: 'Day 1',
    url: 'https://tickets.example.test/booking/123',
    audienceType: 'all',
  });
  expect(JSON.stringify(saved)).not.toMatch(/File|token|cookie|temporary/i);

  await page.reload();
  await openTicketPanel(page, ROOM_ID);
  await expect(ticketCard(page, 'Official rail web ticket')).toBeVisible();
});

test('runs external App Link create, edit, clipboard and delete CRUD safely', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const state = { writes: [] as string[] };
    Object.defineProperty(window, '__ticketClipboard', { value: state });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (value: string) => { state.writes.push(value); } },
    });
  });
  await openTicketPanel(page, ROOM_ID);

  await createExternalTicket(page, {
    title: 'Rail pass in partner App',
    appName: 'Rail Partner',
    appUrl: 'https://app.example.test/pass/123',
    fallbackUrl: 'https://web.example.test/pass/123',
    orderNumber: 'ORDER-7A4-001',
    usageTime: '09:15',
    reminderMinutes: '30',
    usageDetails: 'Car 3 / Seat 12A',
    instructions: 'Open My Trips and present the live code.',
    flags: ['network', 'login', 'dynamic'],
  });

  const card = ticketCard(page, 'Rail pass in partner App');
  await expect(card).toContainText('外部 App：Rail Partner');
  await expect(card).toContainText('訂單編號：ORDER-7A4-001');
  await expect(card).toContainText('2026/09/20 09:15');
  await expect(card).toContainText('建議提前 30 分鐘開啟');
  await expect(card).toContainText('使用時需要網路');
  await expect(card).toContainText('請提前確認已登入原 App');
  await expect(card).toContainText('動態條碼，請勿依賴截圖');
  await expectSafeAnchor(
    card.getByRole('link', { name: '在 App 中開啟票券' }),
    'https://app.example.test/pass/123',
  );
  await expectSafeAnchor(
    card.getByRole('link', { name: '開啟備用網頁' }),
    'https://web.example.test/pass/123',
  );
  expect(context.pages()).toHaveLength(1);

  await page.evaluate(() => {
    document.addEventListener('click', (event) => {
      const anchor = (event.target as Element | null)?.closest('a');
      if (anchor?.textContent?.includes('在 App 中開啟票券')) {
        event.preventDefault();
        (window as typeof window & { __clickedTicketHref?: string })
          .__clickedTicketHref = anchor.href;
      }
    }, { capture: true, once: true });
  });
  await card.getByRole('link', { name: '在 App 中開啟票券' }).click();
  expect(await page.evaluate(() => (
    window as typeof window & { __clickedTicketHref?: string }
  ).__clickedTicketHref)).toBe('https://app.example.test/pass/123');
  expect(context.pages()).toHaveLength(1);

  await card.getByRole('button', { name: '複製訂單編號' }).click();
  expect(await page.evaluate(() => (
    window as typeof window & { __ticketClipboard: { writes: string[] } }
  ).__ticketClipboard.writes)).toEqual(['ORDER-7A4-001']);
  await expect(page.getByTestId('toast').filter({ hasText: '訂單編號已複製' }))
    .toBeVisible();

  const original = await readTicket(ROOM_ID, 'Rail pass in partner App');
  await openEditTicket(page, 'Rail pass in partner App');
  await expect(page.getByTestId('ticket-app-name-input')).toHaveValue('Rail Partner');
  await expect(page.getByTestId('ticket-app-url-input'))
    .toHaveValue('https://app.example.test/pass/123');
  await page.getByTestId('ticket-title-input').fill('Updated rail pass');
  await page.getByTestId('ticket-app-name-input').fill('Rail Partner Plus');
  await page.getByTestId('ticket-more-settings-toggle').click();
  await expect(page.getByTestId('ticket-order-number-input')).toHaveValue('ORDER-7A4-001');
  await page.getByTestId('ticket-order-number-input').fill('ORDER-7A4-EDIT');
  await page.getByTestId('ticket-usage-time-input').fill('10:45');
  await page.getByTestId('ticket-reminder-select').selectOption('60');
  await page.getByTestId('ticket-requires-network').uncheck();
  await submitTicket(page);

  const updated = await readTicket(ROOM_ID, 'Updated rail pass');
  expect(updated.id).toBe(original.id);
  expect(updated.createdAt).toBe(original.createdAt);
  expect(Number(updated.updatedAt)).toBeGreaterThan(Number(original.updatedAt));
  expect((await readTickets(ROOM_ID)).filter((item) => item.id === original.id))
    .toHaveLength(1);
  await expect(ticketCard(page, 'Updated rail pass')).toContainText('Rail Partner Plus');

  await page.reload();
  await openTicketPanel(page, ROOM_ID);
  await expect(ticketCard(page, 'Updated rail pass')).toContainText('ORDER-7A4-EDIT');
  await createWebTicket(page, {
    title: 'Unaffected delete sentinel',
    url: 'https://sentinel.example.test/ticket',
  });

  let storageDeletes = 0;
  page.on('request', (request) => {
    if (request.method() === 'DELETE' && request.url().includes(':9199/')) storageDeletes += 1;
  });
  await ticketCard(page, 'Updated rail pass').getByTestId('ticket-delete-button').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-cancel').click();
  await expect(ticketCard(page, 'Updated rail pass')).toBeVisible();
  await ticketCard(page, 'Updated rail pass').getByTestId('ticket-delete-button').click();
  await page.getByTestId('confirm-accept').click();
  await expect(ticketCard(page, 'Updated rail pass')).toBeHidden();
  await expect(ticketCard(page, 'Unaffected delete sentinel')).toBeVisible();
  await expect.poll(async () => (await readTickets(ROOM_ID)).map((ticket) => ticket.title))
    .toEqual(['Unaffected delete sentinel']);
  expect(storageDeletes).toBe(0);
});

test('supports fallback-only and manual modes while rejecting unsafe navigation', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const calls = { notification: 0, installedApps: 0, open: 0 };
    Object.defineProperty(window, '__externalSecurityCalls', { value: calls });
    try {
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: { requestPermission: () => { calls.notification += 1; } },
      });
      Object.defineProperty(navigator, 'getInstalledRelatedApps', {
        configurable: true,
        value: () => { calls.installedApps += 1; return Promise.resolve([]); },
      });
    } catch { /* unsupported browser surface is already safe */ }
    window.open = () => { calls.open += 1; return null; };
  });
  await openTicketPanel(page, ROOM_ID);

  await createExternalTicket(page, {
    title: 'Fallback only pass',
    appName: 'Fallback Rail',
    fallbackUrl: 'fallback.example.test/ticket',
  });
  const fallbackCard = ticketCard(page, 'Fallback only pass');
  await expectSafeAnchor(
    fallbackCard.getByRole('link', { name: '開啟票券網站' }),
    'https://fallback.example.test/ticket',
  );
  await expect(fallbackCard.getByRole('link', { name: '在 App 中開啟票券' }))
    .toHaveCount(0);
  expect(await readTicket(ROOM_ID, 'Fallback only pass')).toMatchObject({
    appUrl: '',
    fallbackUrl: 'https://fallback.example.test/ticket',
  });

  await createExternalTicket(page, {
    title: 'Manual pass with steps',
    appName: 'Manual Rail',
    instructions: 'Open Orders, choose Taipei, then present the ticket.',
  });
  await createExternalTicket(page, {
    title: 'Manual pass default steps',
    appName: 'Manual Default',
    instructions: '',
  });
  const manual = ticketCard(page, 'Manual pass with steps');
  await expect(manual.getByRole('link')).toHaveCount(0);
  await manual.getByRole('button', { name: '查看開啟方式' }).click();
  await expect(manual).toContainText('請手動開啟 Manual Rail');
  await expect(manual).toContainText('Open Orders, choose Taipei');
  const defaultManual = ticketCard(page, 'Manual pass default steps');
  await defaultManual.getByRole('button', { name: '查看開啟方式' }).click();
  await expect(defaultManual).toContainText('登入原訂購帳號');

  const current = await readTickets(ROOM_ID);
  await writeEmulatorData(`rooms/${ROOM_ID}/tickets`, [...current, {
    id: 'unsafe-external-record',
    title: 'Unsafe raw external pass',
    ticketType: 'external-app',
    appName: 'Unsafe App',
    appUrl: 'javascript:alert(1)',
    fallbackUrl: 'intent://ticket/123',
    audienceType: 'all',
    dayId: 'Day 1',
  }]);
  const unsafe = ticketCard(page, 'Unsafe raw external pass');
  await expect(unsafe).toBeVisible();
  await expect(unsafe.getByRole('link')).toHaveCount(0);
  await expect(unsafe.getByRole('button', { name: '查看開啟方式' })).toBeVisible();
  await expect(page.locator('[data-testid="ticket-card"] iframe')).toHaveCount(0);
  await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(page.locator('a[href^="intent:"]')).toHaveCount(0);
  const hrefs = await page.locator('[data-testid="ticket-card"] a').evaluateAll(
    (anchors) => anchors.map((anchor) => (anchor as HTMLAnchorElement).href),
  );
  expect(hrefs.every((href) => /^https?:\/\//.test(href))).toBe(true);
  expect(await page.evaluate(() => (
    window as typeof window & {
      __externalSecurityCalls: { notification: number; installedApps: number; open: number };
    }
  ).__externalSecurityCalls)).toEqual({ notification: 0, installedApps: 0, open: 0 });

  await page.reload();
  await openTicketPanel(page, ROOM_ID);
  await expect(ticketCard(page, 'Manual pass default steps')
    .getByRole('button', { name: '查看開啟方式' })).toBeVisible();
});

test('persists device identity and applies common, member and presenter filters', async ({
  page,
}) => {
  const seeded: TicketRecord[] = [
    { id: 'common', title: 'Common seeded', ticketType: 'web-link', url: 'https://example.test/common', audienceType: 'all', assignedMembers: [], dayId: 'Day 1' },
    { id: 'a-only', title: 'A only seeded', ticketType: 'web-link', url: 'https://example.test/a', audienceType: 'members', assignedMembers: [MEMBER_A], dayId: 'Day 1' },
    { id: 'b-only', title: 'B only seeded', ticketType: 'web-link', url: 'https://example.test/b', audienceType: 'members', assignedMembers: [MEMBER_B], dayId: 'Day 1' },
    { id: 'a-b', title: 'A B seeded', ticketType: 'web-link', url: 'https://example.test/ab', audienceType: 'members', assignedMembers: TEST_MEMBERS, dayId: 'Day 1' },
  ];
  await writeEmulatorData(`rooms/${ROOM_ID}/tickets`, seeded);
  await openTicketPanel(page, ROOM_ID);

  await expect(page.getByText('設定你在這趟旅程中的名字')).toBeVisible();
  await page.getByTestId('ticket-filter-common').click();
  await expectTitles(page, ['Common seeded']);
  await page.getByTestId('ticket-filter-all').click();
  await expectTitles(page, seeded.map((ticket) => String(ticket.title)));

  await chooseIdentity(page, MEMBER_A);
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_MEMBER_KEY))
    .toBe(confirmedRecord(MEMBER_A));
  // Confirmation preserves an explicitly chosen "all" view. Mine is separate.
  await expect(page.getByTestId('ticket-filter-all')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('ticket-filter-mine').click();
  await expect(page.getByTestId('ticket-filter-mine'))
    .toHaveAttribute('aria-pressed', 'true');
  await expectTitles(page, ['Common seeded', 'A only seeded', 'A B seeded']);
  await expect(ticketCard(page, 'B only seeded')).toHaveCount(0);

  await page.getByTestId('ticket-filter-member').filter({ hasText: MEMBER_B }).click();
  await expectTitles(page, ['Common seeded', 'B only seeded', 'A B seeded']);
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_MEMBER_KEY))
    .toBe(confirmedRecord(MEMBER_A));

  await page.getByTestId('ticket-filter-all').click();
  await createExternalTicket(page, {
    title: 'Editor multi-member ticket',
    appName: 'Group App',
    audience: 'members',
    members: TEST_MEMBERS,
    presenter: MEMBER_A,
  });
  await createExternalTicket(page, {
    title: 'Editor common ticket',
    appName: 'Shared App',
    presenter: MEMBER_B,
  });
  await expect(ticketCard(page, 'Editor multi-member ticket'))
    .toContainText(`${MEMBER_A}、${MEMBER_B}`);
  await expect(ticketCard(page, 'Editor multi-member ticket'))
    .toContainText(`由${MEMBER_A}負責出示`);
  await expect(ticketCard(page, 'Editor common ticket'))
    .toContainText(`由${MEMBER_B}負責出示`);

  await page.getByTestId('ticket-filter-common').click();
  await expect(ticketCard(page, 'Editor common ticket')).toHaveCount(1);
  await expect(ticketCard(page, 'Editor multi-member ticket')).toHaveCount(0);
  for (const member of TEST_MEMBERS) {
    await page.getByTestId('ticket-filter-member').filter({ hasText: member }).click();
    await expect(ticketCard(page, 'Editor multi-member ticket')).toHaveCount(1);
    await expect(ticketCard(page, 'Editor common ticket')).toHaveCount(1);
  }
  await page.getByTestId('ticket-filter-all').click();
  await expect(ticketCard(page, 'Editor multi-member ticket')).toHaveCount(1);
  await expect(ticketCard(page, 'Editor common ticket')).toHaveCount(1);

  await page.reload();
  await openTicketPanel(page, ROOM_ID);
  await expect(page.getByTestId('ticket-filter-mine'))
    .toHaveAttribute('aria-pressed', 'true');

  const ticketsBeforeMemberRemoval = await readTickets(ROOM_ID);
  await writeEmulatorData(`rooms/${ROOM_ID}/meta/members`, [MEMBER_B]);
  await page.reload();
  await openTicketPanel(page, ROOM_ID);
  await expect(page.getByText('設定你在這趟旅程中的名字')).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_MEMBER_KEY))
    .toBe(JSON.stringify({ version: 1, confirmed: false, member: '' }));
  expect(await readTickets(ROOM_ID)).toEqual(ticketsBeforeMemberRemoval);
});

test('keeps legacy records unchanged until one ticket is edited', async ({ page }) => {
  const legacyTickets: TicketRecord[] = [
    { id: 'legacy-image', title: 'Legacy image', type: 'image', owner: '所有人', url: 'https://legacy.example.test/image.png' },
    { id: 'legacy-pdf', title: 'Legacy PDF', type: 'pdf', owner: MEMBER_A, url: 'https://legacy.example.test/ticket.pdf' },
    { id: 'legacy-link', title: 'Legacy link', type: 'link', owner: MEMBER_B, url: 'legacy.example.test/link' },
  ];
  await writeEmulatorData(`rooms/${ROOM_ID}/tickets`, legacyTickets);
  await openTicketPanel(page, ROOM_ID);

  await expect(ticketCard(page, 'Legacy image')).toBeVisible();
  await expect(ticketCard(page, 'Legacy PDF')).toBeVisible();
  await expect(ticketCard(page, 'Legacy link')).toBeVisible();
  expect(await readTickets(ROOM_ID)).toEqual(legacyTickets);

  await openEditTicket(page, 'Legacy link');
  await page.getByTestId('ticket-title-input').fill('Legacy link edited');
  await submitTicket(page);
  const after = await readTickets(ROOM_ID);
  expect(after[0]).toEqual(legacyTickets[0]);
  expect(after[1]).toEqual(legacyTickets[1]);
  expect(Object.keys(after[2]).sort()).toEqual(
    CANONICAL_KEYS.filter((key) => key !== 'createdAt'),
  );
  expect(after[2]).toMatchObject({
    id: 'legacy-link',
    title: 'Legacy link edited',
    ticketType: 'web-link',
    audienceType: 'members',
    assignedMembers: [MEMBER_B],
  });
});

test('syncs external App CRUD and isolated identities across browser contexts', async ({
  browser,
}, testInfo) => {
  await prepareTicketRoom(ROOM_ID);
  const contextA = await browser.newContext(contextOptionsForProject(testInfo.project.name));
  const contextB = await browser.newContext(contextOptionsForProject(testInfo.project.name));
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  await markReleaseSeen(pageA);
  await markReleaseSeen(pageB);

  try {
    await openTicketPanel(pageA, ROOM_ID);
    await openTicketPanel(pageB, ROOM_ID);
    await chooseIdentity(pageA, MEMBER_A);
    await chooseIdentity(pageB, MEMBER_B);

    await createExternalTicket(pageA, {
      title: 'Realtime external pass',
      appName: 'Realtime App',
      appUrl: 'https://realtime.example.test/pass',
      audience: 'all',
    });
    await expect(ticketCard(pageB, 'Realtime external pass')).toBeVisible({ timeout: 20_000 });

    await openEditTicket(pageA, 'Realtime external pass');
    await pageA.getByTestId('ticket-title-input').fill('Realtime external pass edited');
    await pageA.getByTestId('ticket-app-name-input').fill('Realtime App Plus');
    await submitTicket(pageA);
    await expect(ticketCard(pageB, 'Realtime external pass edited'))
      .toContainText('Realtime App Plus', { timeout: 20_000 });
    await pageB.getByTestId('ticket-filter-member').filter({ hasText: MEMBER_B }).click();
    await expect(ticketCard(pageB, 'Realtime external pass edited')).toHaveCount(1);
    await expect(pageB.getByTestId('ticket-card')).toHaveCount(1);

    expect(await pageA.evaluate((key) => localStorage.getItem(key), ACTIVE_MEMBER_KEY))
      .toBe(confirmedRecord(MEMBER_A));
    expect(await pageB.evaluate((key) => localStorage.getItem(key), ACTIVE_MEMBER_KEY))
      .toBe(confirmedRecord(MEMBER_B));

    await ticketCard(pageA, 'Realtime external pass edited')
      .getByTestId('ticket-delete-button').click();
    await pageA.getByTestId('confirm-accept').click();
    await expect(ticketCard(pageB, 'Realtime external pass edited')).toHaveCount(0);
    for (const syncedPage of [pageA, pageB]) {
      await expect(syncedPage.getByTestId('sync-status-indicator'))
        .toContainText(/已同步|遠端已更新/);
      await expect(syncedPage.getByTestId('ticket-card')).toHaveCount(0);
    }
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('keeps ticket controls usable without overflow or interception on mobile', async ({
  page,
}, testInfo) => {
  const manyMembers = [MEMBER_A, MEMBER_B, '成員 C 很長名字', '成員 D 很長名字'];
  await prepareTicketRoom(ROOM_ID, {
    members: manyMembers,
    tickets: [{
      id: 'mobile-manual',
      title: 'Mobile manual pass',
      ticketType: 'external-app',
      appName: 'Mobile Rail',
      audienceType: 'all',
      assignedMembers: [],
      dayId: 'Day 1',
    }],
  });
  await openTicketPanel(page, ROOM_ID);
  await chooseIdentity(page, MEMBER_A);

  // Capture the same synthetic wallet at both mobile widths for UX review.
  const originalViewport = page.viewportSize();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    const metrics = await page.getByTestId('ticket-panel').evaluate((panel) => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth,
      controls: [...panel.querySelectorAll('button')].map((button) => ({
        name: button.textContent?.trim(),
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
        fontSize: getComputedStyle(button).fontSize,
        background: getComputedStyle(button).backgroundColor,
      })),
      bodyFont: getComputedStyle(panel.querySelector('dl')!).fontSize,
    }));
    expect(metrics.overflow).toBe(false);
    expect(parseFloat(metrics.bodyFont)).toBeGreaterThanOrEqual(14);
    for (const control of metrics.controls) {
      expect(control.width, control.name).toBeGreaterThanOrEqual(44);
      expect(control.height, control.name).toBeGreaterThanOrEqual(44);
    }
    await testInfo.attach(`ticket-wallet-${width}-metrics`, {
      body: JSON.stringify(metrics, null, 2), contentType: 'application/json',
    });
    await testInfo.attach(`ticket-wallet-${width}`, {
      body: await page.screenshot(), contentType: 'image/png',
    });
  }
  if (originalViewport) await page.setViewportSize(originalViewport);

  const filterRow = page.getByLabel('票券篩選');
  if (testInfo.project.name === 'Mobile Safari') {
    expect(await filterRow.evaluate((element) => element.scrollWidth > element.clientWidth))
      .toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  const manualCard = ticketCard(page, 'Mobile manual pass');
  expect(await manualCard.evaluate((element) => (
    element.getBoundingClientRect().right <= window.innerWidth + 1
  ))).toBe(true);
  await manualCard.getByRole('button', { name: '查看開啟方式' }).click();
  await expect(manualCard).toContainText('開啟原 App');
  await manualCard.getByRole('button', { name: '查看開啟方式' }).click();
  await expect(manualCard.getByText('開啟原 App', { exact: true })).toHaveCount(0);

  await openCreateTicket(page);
  await page.getByTestId('ticket-type-external-app').click();
  await page.getByTestId('ticket-title-input').fill('Mobile created pass');
  await page.getByTestId('ticket-app-name-input').fill('Mobile App');
  await page.getByTestId('ticket-audience-all').check();
  await page.getByTestId('ticket-more-settings-toggle').click();
  await page.getByTestId('ticket-instructions-input').fill('Mobile instructions');
  const modalScroller = page.getByTestId('ticket-editor-modal').locator('form > div').first();
  expect(await modalScroller.evaluate((element) => element.scrollHeight > element.clientHeight))
    .toBe(true);
  await modalScroller.evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(page.getByTestId('ticket-submit-button')).toBeVisible();
  await submitTicket(page);
  await expect(ticketCard(page, 'Mobile created pass')).toBeVisible();

  await ticketCard(page, 'Mobile created pass').getByTestId('ticket-delete-button').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-cancel').click();
  await expect(ticketCard(page, 'Mobile created pass')).toBeVisible();
  await expect(page.locator('text=/Firebase Emulator warning/i')).toHaveCount(0);
});

// Compute contrast against each selected element's actual composited ancestor
// surfaces, not just the page background. The sampled elements have no gradients
// or group opacity; those require a separate visual calculation.
async function expectReadableContrast(locator: ReturnType<Page['getByRole']>): Promise<number> {
  const ratio = await locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    const rgba = (color: string): number[] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const value = [...context.getImageData(0, 0, 1, 1).data];
      return [value[0], value[1], value[2], value[3] / 255];
    };
    const composite = (front: number[], back: number[]) => [
      ...front.slice(0, 3).map((channel, index) => channel * front[3] + back[index] * (1 - front[3])),
      1,
    ];
    const ancestors: Element[] = [];
    for (let current: Element | null = element; current; current = current.parentElement) ancestors.unshift(current);
    let background = [255, 255, 255, 1];
    for (const ancestor of ancestors) {
      const style = getComputedStyle(ancestor);
      if (style.backgroundImage !== 'none' || Number(style.opacity) !== 1) {
        throw new Error('Contrast sample needs manual gradient/group-opacity analysis');
      }
      background = composite(rgba(style.backgroundColor), background);
    }
    const foreground = composite(rgba(getComputedStyle(element).color), background);
    const luminance = (channels: number[]) => channels.slice(0, 3).reduce((sum, channel, index) => {
      const value = channel / 255;
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][index];
    }, 0);
    const values = [luminance(foreground), luminance(background)];
    return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  return ratio;
}

async function expectTicketTarget(control: ReturnType<Page['getByRole']>) {
  await control.scrollIntoViewIfNeeded();
  const box = await control.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
}

for (const theme of [{ name: 'light', color: '#f8fafc' }, { name: 'dark', color: '#0f172a' }]) {
  test(`ticket ${theme.name} contrast, copy recovery and 200% text`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareTicketRoom(ROOM_ID, { tickets: [{
      id: 'theme-ticket', title: '合成交通票券', ticketType: 'external-app', appName: '合成 App',
      audienceType: 'all', dayId: 'Day 1', usageTime: '09:15', presenterMember: MEMBER_A,
      requiresNetwork: true, requiresLogin: true, dynamicCode: true, orderNumber: 'SYNTHETIC-123',
    }] });
    await writeEmulatorData(`rooms/${ROOM_ID}/meta/themeColor`, theme.color);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async () => { throw new Error('synthetic clipboard denial'); },
      } });
    });
    await openTicketPanel(page, ROOM_ID);
    await chooseIdentity(page, MEMBER_A);
    const card = ticketCard(page, '合成交通票券');
    const contrast: Record<string, number> = {};
    for (const sample of [card.getByRole('heading'), card.locator('dd').first(), card.getByTestId('ticket-edit-button'), card.getByTestId('ticket-delete-button'), card.getByText('使用時需要網路')]) {
      contrast[await sample.innerText()] = await expectReadableContrast(sample);
    }
    const selected = page.getByTestId('ticket-filter-mine');
    await expect(selected).toHaveAttribute('aria-pressed', 'true');
    await expect(selected).toHaveText(`我的・${MEMBER_A}`);
    expect(await selected.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(await page.getByTestId('ticket-filter-all').evaluate((element) => getComputedStyle(element).backgroundColor));
    contrast.selected = await expectReadableContrast(selected);
    await card.getByRole('button', { name: '複製訂單編號' }).click();
    const manualCopy = card.getByLabel('手動複製訂單編號');
    await expect(manualCopy).toHaveValue('SYNTHETIC-123');
    await expect(page.getByTestId('toast').filter({ hasText: '訂單編號已複製' })).toHaveCount(0);
    await manualCopy.focus();
    expect(await manualCopy.evaluate((element: HTMLInputElement) => element.value.slice(element.selectionStart!, element.selectionEnd!))).toBe('SYNTHETIC-123');
    await page.getByTestId('toast').filter({ hasText: '無法複製訂單編號' }).getByTestId('toast-dismiss').click();
    await testInfo.attach(`contrast-${theme.name}`, { body: JSON.stringify(contrast), contentType: 'application/json' });

    // HTML root font-size equivalent only: not browser zoom or a real soft keyboard.
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    await expectTicketTarget(card.getByRole('button', { name: '查看開啟方式' }));
    await card.getByRole('button', { name: '查看開啟方式' }).click();
    await expect(card.getByText('找到這張票券')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await testInfo.attach(`ticket-${theme.name}-200-wallet`, { body: await page.screenshot(), contentType: 'image/png' });
    await card.getByTestId('ticket-edit-button').click();
    await expectTicketTarget(page.getByTestId('ticket-submit-button'));
    await expectTicketTarget(page.getByTestId('ticket-cancel-button'));
    expect(await page.getByTestId('ticket-submit-button').evaluate((element) => {
      const style = getComputedStyle(element);
      return element.getBoundingClientRect().height <= Math.max(parseFloat(style.minHeight), 2 * parseFloat(style.lineHeight)) + 2;
    })).toBe(true);
    await page.getByTestId('ticket-app-name-input').fill('合成 App 文字放大');
    await testInfo.attach(`ticket-${theme.name}-200-editor`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByTestId('ticket-cancel-button').click();
    const navigation = page.getByTestId('mobile-bottom-navigation');
    for (const button of await navigation.getByRole('button').all()) await expectTicketTarget(button);
  });
}

for (const width of [320, 375, 390, 768, 1024, 1440]) {
  test(`ticket reading and editor remain operable at ${width}px with long content`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    const longMember = 'SyntheticMemberWithoutSpacesForTicketReadingVerification';
    const title = '合成票券長中文名稱與無空格英文SyntheticUnbrokenEnglishTicketNameForReading';
    await prepareTicketRoom(ROOM_ID, {
      members: [...TEST_MEMBERS, longMember],
      tickets: [{
        id: 'long-reading', title, ticketType: 'external-app', appName: '合成列車 App',
        audienceType: 'members', assignedMembers: [...TEST_MEMBERS, longMember],
        presenterMember: MEMBER_A, dayId: 'Day 1', usageTime: '09:15',
        orderNumber: 'SYNTHETIC-ORDER-NOT-A-VALID-TICKET-12345678901234567890',
        instructions: '僅供測試，請先登入原 App，再開啟票券。',
        requiresNetwork: true, requiresLogin: true, dynamicCode: true,
      }],
    });
    await openTicketPanel(page, ROOM_ID);
    await chooseIdentity(page, MEMBER_A);
    const card = ticketCard(page, title);
    const tools = card.getByTestId('ticket-tools');
    expect(await tools.getByRole('button').count()).toBe(2);
    const editBox = await card.getByTestId('ticket-edit-button').boundingBox();
    const deleteBox = await card.getByTestId('ticket-delete-button').boundingBox();
    expect(deleteBox!.x - editBox!.x - editBox!.width).toBeGreaterThanOrEqual(8);
    const titleBox = await card.getByRole('heading').boundingBox();
    expect(titleBox!.x + titleBox!.width).toBeLessThanOrEqual(editBox!.x);
    await expectTicketTarget(card.getByTestId('ticket-edit-button'));
    await expectTicketTarget(card.getByTestId('ticket-delete-button'));
    const details = card.getByRole('button', { name: '查看開啟方式' });
    await expectTicketTarget(details);
    await details.focus();
    await page.keyboard.press('Enter');
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    await expect(card.getByText(`使用成員：${[...TEST_MEMBERS, longMember].join('、')}`)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await testInfo.attach(`long-wallet-${width}`, { body: await page.screenshot(), contentType: 'image/png' });

    const before = await readTickets(ROOM_ID);
    await card.getByTestId('ticket-edit-button').click();
    await expect(page.getByTestId('ticket-title-input')).toBeFocused();
    await expectTicketTarget(page.getByTestId('ticket-submit-button'));
    await page.getByTestId('ticket-submit-button').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('ticket-type-attachment')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByTestId('ticket-submit-button')).toBeFocused();
    await page.getByTestId('ticket-title-input').fill('Cancelled synthetic edit');
    await testInfo.attach(`ticket-editor-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.keyboard.press('Escape');
    await expect(card.getByTestId('ticket-edit-button')).toBeFocused();
    expect(await readTickets(ROOM_ID)).toEqual(before);
    await expect(page.getByTestId('ticket-filter-mine')).toHaveAttribute('aria-pressed', 'true');
  });
}
