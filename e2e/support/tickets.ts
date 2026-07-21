import { devices, expect, type BrowserContextOptions, type Page } from '@playwright/test';

import {
  clearEmulatorDatabase,
  clearEmulatorStorage,
  readEmulatorData,
  seedTestTrip,
} from './emulator';

export type TicketRecord = Record<string, unknown> & {
  id?: string;
  title?: string;
  ticketType?: string;
  attachmentKind?: string;
  url?: string;
  storagePath?: string;
  createdAt?: number;
  updatedAt?: number;
};

export const MEMBER_A = '成員 A';
export const MEMBER_B = '成員 B';
export const TEST_MEMBERS = [MEMBER_A, MEMBER_B];
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC'
  + 'AAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
export const PDF_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF',
  'utf8',
);

const RELEASE_SEEN_KEY = 'travel-app-seen-release-2026.07-mobile-collaboration';

export function toList<T>(value: T[] | Record<string, T> | null): T[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

export function contextOptionsForProject(projectName: string): BrowserContextOptions {
  const device = projectName === 'Mobile Safari'
    ? devices['iPhone 13']
    : devices['Desktop Chrome'];
  return { ...device, baseURL: 'http://127.0.0.1:4174', serviceWorkers: 'block' };
}

export async function markReleaseSeen(page: Page): Promise<void> {
  await page.addInitScript((key) => localStorage.setItem(key, 'true'), RELEASE_SEEN_KEY);
}

export async function prepareTicketRoom(
  roomId: string,
  options: {
    title?: string;
    members?: string[];
    tickets?: TicketRecord[];
  } = {},
): Promise<void> {
  await clearEmulatorDatabase();
  await clearEmulatorStorage(`rooms/${roomId}/tickets`);
  await seedTestTrip(roomId, {
    title: options.title || 'External App Ticket E2E',
    members: options.members || TEST_MEMBERS,
  });
  if (options.tickets) {
    const { writeEmulatorData } = await import('./emulator');
    await writeEmulatorData(`rooms/${roomId}/tickets`, options.tickets);
  }
}

export async function readTickets(roomId: string): Promise<TicketRecord[]> {
  return toList(await readEmulatorData<TicketRecord[] | Record<string, TicketRecord>>(
    `rooms/${roomId}/tickets`,
  ));
}

export async function readTicket(roomId: string, title: string): Promise<TicketRecord> {
  let found: TicketRecord | undefined;
  await expect.poll(async () => {
    found = (await readTickets(roomId)).find((ticket) => ticket.title === title);
    return Boolean(found);
  }, { message: `ticket "${title}" is persisted to the emulator` }).toBe(true);
  return found as TicketRecord;
}

export async function openTicketPanel(page: Page, roomId: string): Promise<void> {
  await page.goto(`/?room=${roomId}`);
  await expect(page.getByTestId('active-trip-view')).toBeVisible({ timeout: 20_000 });
  const tab = page.locator('[data-testid="ticket-tab-button"]:visible');
  await expect(tab).toHaveCount(1);
  await tab.click();
  await expect(page.getByTestId('ticket-panel')).toBeVisible();
}

export function ticketCard(page: Page, title: string) {
  return page.getByTestId('ticket-card').filter({ hasText: title }).first();
}

export async function openCreateTicket(page: Page): Promise<void> {
  await page.getByTestId('add-ticket-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeVisible();
}

export async function openEditTicket(page: Page, title: string): Promise<void> {
  await ticketCard(page, title).getByTestId('ticket-edit-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeVisible();
}

export async function submitTicket(page: Page): Promise<void> {
  await page.getByTestId('ticket-submit-button').click();
  await expect(page.getByTestId('ticket-editor-modal')).toBeHidden({ timeout: 35_000 });
}

export async function createWebTicket(
  page: Page,
  { title, url, audience = 'all' }: { title: string; url: string; audience?: 'all' | 'members' },
): Promise<void> {
  await openCreateTicket(page);
  await page.getByTestId('ticket-type-web-link').click();
  await page.getByTestId('ticket-title-input').fill(title);
  await page.getByTestId('ticket-day-select').selectOption('Day 1');
  await page.getByTestId('ticket-url-input').fill(url);
  await page.getByTestId(`ticket-audience-${audience}`).check();
  await submitTicket(page);
}

export async function createExternalTicket(
  page: Page,
  values: {
    title: string;
    appName: string;
    appUrl?: string;
    fallbackUrl?: string;
    orderNumber?: string;
    usageTime?: string;
    reminderMinutes?: string;
    usageDetails?: string;
    memo?: string;
    instructions?: string;
    audience?: 'all' | 'members';
    members?: string[];
    presenter?: string;
    flags?: Array<'network' | 'login' | 'dynamic'>;
  },
): Promise<void> {
  await openCreateTicket(page);
  await page.getByTestId('ticket-type-external-app').click();
  await page.getByTestId('ticket-title-input').fill(values.title);
  await page.getByTestId('ticket-day-select').selectOption('Day 1');
  await page.getByTestId('ticket-app-name-input').fill(values.appName);
  if (values.appUrl) await page.getByTestId('ticket-app-url-input').fill(values.appUrl);
  const audience = values.audience || 'all';
  await page.getByTestId(`ticket-audience-${audience}`).check();
  if (audience === 'members') {
    for (const member of values.members || []) {
      await page.getByTestId(`ticket-member-${safeMemberTestId(member)}`).check();
    }
  }
  const needsMore = values.fallbackUrl !== undefined
    || values.orderNumber !== undefined
    || values.usageTime !== undefined
    || values.reminderMinutes !== undefined
    || values.usageDetails !== undefined
    || values.memo !== undefined
    || values.instructions !== undefined
    || Boolean(values.presenter)
    || Boolean(values.flags?.length);
  if (needsMore) {
    await page.getByTestId('ticket-more-settings-toggle').click();
    if (values.usageTime) await page.getByTestId('ticket-usage-time-input').fill(values.usageTime);
    if (values.reminderMinutes) await page.getByTestId('ticket-reminder-select').selectOption(values.reminderMinutes);
    if (values.presenter) await page.getByTestId('ticket-presenter-select').selectOption(values.presenter);
    if (values.memo) await page.getByTestId('ticket-memo-input').fill(values.memo);
    if (values.fallbackUrl) await page.getByTestId('ticket-fallback-url-input').fill(values.fallbackUrl);
    if (values.orderNumber) await page.getByTestId('ticket-order-number-input').fill(values.orderNumber);
    if (values.usageDetails) await page.getByTestId('ticket-usage-details-input').fill(values.usageDetails);
    if (values.instructions) await page.getByTestId('ticket-instructions-input').fill(values.instructions);
    for (const flag of values.flags || []) await page.getByTestId(`ticket-${flag === 'network' ? 'requires-network' : flag === 'login' ? 'requires-login' : 'dynamic-code'}`).check();
  }
  await submitTicket(page);
}

export async function createAttachmentTicket(
  page: Page,
  values: { title: string; name: string; mimeType: string; buffer: Buffer; memo?: string },
): Promise<void> {
  await openCreateTicket(page);
  await page.getByTestId('ticket-title-input').fill(values.title);
  if (values.memo) {
    await page.getByTestId('ticket-more-settings-toggle').click();
    await page.getByTestId('ticket-memo-input').fill(values.memo);
  }
  await page.getByTestId('ticket-file-input').setInputFiles({
    name: values.name,
    mimeType: values.mimeType,
    buffer: values.buffer,
  });
  await submitTicket(page);
}

export function safeMemberTestId(member: string): string {
  return Array.from(member.trim())
    .map((character) => (/^[a-z\d_-]$/i.test(character)
      ? character.toLowerCase()
      : `u${character.codePointAt(0)?.toString(16)}`))
    .join('-');
}

export function storageObjectPath(requestUrl: string): string {
  const url = new URL(requestUrl);
  const queryPath = url.searchParams.get('name');
  if (queryPath) return decodeURIComponent(queryPath);
  const marker = '/o/';
  const index = url.pathname.indexOf(marker);
  return index >= 0 ? decodeURIComponent(url.pathname.slice(index + marker.length)) : '';
}
