import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const OWNER_UID = 'e2e-owner';
const PROJECT_ID = 'demo-travel-e2e';
const DATABASE_NAMESPACE = 'demo-travel-e2e-default-rtdb';
const DATABASE_ORIGIN = 'http://127.0.0.1:9000';
const FIRESTORE_ORIGIN = 'http://127.0.0.1:8080';
const SAMPLE_COUNT = 5;
const WARMUP_COUNT = 1;
const VIEWPORT = { width: 390, height: 844 };
const RELEASE_SEEN_KEY = 'travel-app-seen-release-2026.07-trip-management-redesign';

function readArgument(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : String(process.argv[index + 1] || fallback);
}

const baseUrl = new URL(readArgument('--base-url', 'http://127.0.0.1:4175'));
if (!['127.0.0.1', 'localhost', '::1'].includes(baseUrl.hostname)) {
  throw new Error('T5B 量測只允許 localhost 目標。');
}
const outputFile = resolve(readArgument('--output', '.tmp/t5b-performance-baseline/results.json'));

function roomId(size) {
  return `t5b-${size}-synthetic-room`;
}

function membersFor(count) {
  return Array.from({ length: count }, (_, index) => `合成旅伴 ${index + 1}`);
}

function makeItinerary(days, placesPerDay) {
  return Object.fromEntries(Array.from({ length: days }, (_, dayIndex) => {
    const dayId = `Day ${dayIndex + 1}`;
    return [dayId, Array.from({ length: placesPerDay }, (_, placeIndex) => ({
      id: `t5b-place-${dayIndex + 1}-${placeIndex + 1}`,
      name: `合成景點 ${dayIndex + 1}-${placeIndex + 1}`,
      place_id: `t5b-place-id-${dayIndex + 1}-${placeIndex + 1}`,
      lat: 25.03 + dayIndex * 0.001 + placeIndex * 0.0001,
      lng: 121.56 + dayIndex * 0.001 + placeIndex * 0.0001,
      address: '合成測試地址',
      time: `${String(8 + (placeIndex % 10)).padStart(2, '0')}:00`,
      stayTime: '30',
      memo: 'T5B 合成行程資料',
      tags: [],
      nextLeg: { mode: 'AUTO', mins: 20 },
    }))];
  }));
}

function makeExpenses(count, days, members) {
  return Array.from({ length: count }, (_, index) => {
    const payer = members[index % members.length];
    const amount = 100 + (index % 37) * 31;
    return {
      id: `t5b-expense-${index + 1}`,
      dayId: `Day ${(index % days) + 1}`,
      item: `合成帳目 ${index + 1}`,
      cost: amount,
      localCost: amount,
      currency: 'TWD',
      exchangeRate: 1,
      category: ['food', 'transport', 'accommodation', 'shopping'][index % 4],
      payer,
      split: Object.fromEntries(members.map((member) => [member, amount / members.length])),
      note: 'T5B synthetic expense',
      createdAt: 1_760_000_000_000 + index,
      updatedAt: 1_760_000_000_000 + index,
    };
  });
}

function makeTickets(count, members) {
  return Array.from({ length: count }, (_, index) => ({
    id: `t5b-ticket-${index + 1}`,
    title: `合成票券 ${index + 1}`,
    ticketType: 'web',
    url: 'https://example.com/synthetic-ticket',
    assignedMembers: index % 3 === 0 ? [] : [members[index % members.length]],
    presenterMember: members[index % members.length],
    dayId: `Day ${(index % 14) + 1}`,
    time: '10:00',
    orderNumber: `T5B-${String(index + 1).padStart(4, '0')}`,
    createdAt: 1_760_000_000_000 + index,
    updatedAt: 1_760_000_000_000 + index,
  }));
}

function makeRoom(size) {
  const definition = size === 'large'
    ? { days: 14, placesPerDay: 10, members: 10, tickets: 60, expenses: 300 }
    : { days: 5, placesPerDay: 5, members: 6, tickets: 12, expenses: 40 };
  const members = membersFor(definition.members);
  const id = roomId(size);
  const now = 1_760_000_000_000;
  return {
    id,
    definition: { ...definition, places: definition.days * definition.placesPerDay },
    data: {
      meta: {
        title: `T5B ${size === 'large' ? '較大' : '一般'}合成旅程`,
        destination: '合成目的地',
        destLat: 25.033,
        destLng: 121.565,
        startDate: '2026-09-20',
        endDate: definition.days === 5 ? '2026-09-24' : '2026-10-03',
        members,
        memberBudgets: Object.fromEntries(members.map((member) => [member, 100000])),
        transport: '汽車 🚗',
        themeColor: '#3b82f6',
        dayThemes: {},
        createdAt: now,
        updatedAt: now,
        ownerUid: OWNER_UID,
      },
      itinerary: makeItinerary(definition.days, definition.placesPerDay),
      expenses: makeExpenses(definition.expenses, definition.days, members),
      settlements: [],
      tickets: makeTickets(definition.tickets, members),
      checklist: {},
    },
  };
}

async function localFetch(url, init) {
  const target = new URL(url);
  if (!['127.0.0.1', 'localhost', '::1'].includes(target.hostname)) {
    throw new Error(`拒絕非本機量測請求：${target.origin}`);
  }
  const response = await fetch(target, init);
  if (!response.ok) throw new Error(`本機 Emulator 回應 ${response.status}：${target.pathname}`);
  return response;
}

async function seedRoom(room) {
  // This is derived from VITE_FIREBASE_DATABASE_URL in the existing E2E
  // configuration. The RTDB namespace is not identical to the project ID.
  const databasePath = (path) => `${DATABASE_ORIGIN}/${path}.json?ns=${DATABASE_NAMESPACE}`;
  const writeDatabase = (path, value) => localFetch(databasePath(path), {
    method: 'PUT',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  await writeDatabase(`rooms/${room.id}`, room.data);
  await writeDatabase(`userTrips/${OWNER_UID}/${room.id}`, {
    role: 'owner', status: 'active', aclVersion: 1, updatedAt: 1_760_000_000_000,
  });
  // Keep the same ordering as the existing E2E seed helper: Functions may
  // observe roomAccess writes, so the authoritative Firestore member record
  // must be ready before that trigger can reconcile the RTDB mirror.
  await localFetch(`${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents/tripAccess/${room.id}/members/${OWNER_UID}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer owner', 'content-type': 'application/json' },
    body: JSON.stringify({ fields: {
      uid: { stringValue: OWNER_UID },
      role: { stringValue: 'owner' },
      status: { stringValue: 'active' },
      aclVersion: { integerValue: '1' },
      updatedAt: { timestampValue: '2026-09-15T00:00:00.000Z' },
    } }),
  });
  await writeDatabase(`roomAccess/${room.id}`, {
    ownerUid: OWNER_UID,
    state: 'ready',
    createdAt: 1_760_000_000_000,
    members: {
      [OWNER_UID]: {
        uid: OWNER_UID,
        displayName: 'E2E Owner',
        role: 'owner',
        status: 'active',
        aclVersion: 1,
        joinedAt: 1_760_000_000_000,
        updatedAt: 1_760_000_000_000,
      },
    },
  });
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(values) {
  return {
    rawMs: values.map((value) => Number(value.toFixed(1))),
    medianMs: Number(median(values).toFixed(1)),
    rangeMs: [Number(Math.min(...values).toFixed(1)), Number(Math.max(...values).toFixed(1))],
  };
}

async function dismissCompanionIntroduction(page) {
  const introduction = page.getByRole('dialog', { name: '你是這趟旅程中的哪位旅伴？', exact: true });
  if (await introduction.isVisible().catch(() => false)) {
    await introduction.getByRole('button', { name: '先看看', exact: true }).click();
  }
}

async function measureAction(page, action, ready) {
  const started = await page.evaluate(() => performance.now());
  await action();
  await ready();
  return await page.evaluate((start) => performance.now() - start, started);
}

async function createMeasurementContext(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, serviceWorkers: 'block' });
  // The production-build timing profile represents a returning user. This
  // leaves onboarding intact while preventing a release-note dialog from
  // randomly intercepting a later warm sample.
  await context.addInitScript((key) => localStorage.setItem(key, 'true'), RELEASE_SEEN_KEY);
  return context;
}

async function openRoom(page, id) {
  // Let the Emulator-only credential settle on the lobby first. A direct room
  // URL before Firebase Auth finishes is intentionally rejected by App.jsx;
  // that authorization wait is not a trip-rendering measurement.
  await page.goto(baseUrl.toString(), { waitUntil: 'domcontentloaded' });
  await page.getByText('E2E Owner', { exact: false }).first().waitFor({ state: 'visible' });
  const lobbyReadyMs = await page.evaluate(() => performance.now());
  const navigationStart = await page.evaluate(() => performance.now());
  await page.goto(new URL(`/?room=${encodeURIComponent(id)}`, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.getByTestId('active-trip-view').waitFor({ state: 'visible' });
  const roomOpenMs = await page.evaluate((start) => performance.now() - start, navigationStart);
  await dismissCompanionIntroduction(page);
  return {
    lobbyReadyMs,
    roomOpenMs,
  };
}

async function runScenario(browser, room, cold, sharedContext = null) {
  const context = sharedContext || await createMeasurementContext(browser);
  const page = await context.newPage();
  const { lobbyReadyMs, roomOpenMs } = await openRoom(page, room.id);
  const mobilePlan = page.getByTestId('mobile-nav-plan');
  const mobileMap = page.getByTestId('mobile-nav-map');
  const ticketTab = page.locator('[data-testid="ticket-tab-button"]:visible');
  const expenseTab = page.locator('[data-testid="expense-tab-button"]:visible');
  const results = { lobbyReadyMs, roomOpenMs };
  results.mapTabMs = await measureAction(page, () => mobileMap.click(), () => page.getByTestId('map-panel').waitFor({ state: 'visible' }));
  results.planTabMs = await measureAction(page, () => mobilePlan.click(), () => page.getByTestId('itinerary-horizontal-scroll').waitFor({ state: 'visible' }));
  results.ticketTabMs = await measureAction(page, () => ticketTab.click(), () => page.getByTestId('ticket-panel').waitFor({ state: 'visible' }));
  results.expenseTabMs = await measureAction(page, () => expenseTab.click(), () => page.getByTestId('expense-panel').waitFor({ state: 'visible' }));
  const budget = page.getByTestId('budget-toggle');
  results.budgetOpenMs = await measureAction(page, () => budget.click(), () => budget.getAttribute('aria-expanded').then((value) => {
    if (value !== 'true') throw new Error('預算未展開');
  }));
  results.budgetCloseMs = await measureAction(page, () => budget.click(), () => budget.getAttribute('aria-expanded').then((value) => {
    if (value !== 'false') throw new Error('預算未收合');
  }));
  const chart = page.getByTestId('expense-chart-view-button');
  results.chartTabMs = await measureAction(page, () => chart.click(), () => page.getByRole('img', { name: /分類圓餅圖/ }).waitFor({ state: 'visible' }));
  await page.getByTestId('expense-list-view-button').click();
  results.modalOpenMs = await measureAction(page, () => page.getByTestId('add-expense-button').click(), () => page.getByTestId('expense-modal').waitFor({ state: 'visible' }));
  await page.keyboard.press('Escape');
  const dom = await page.evaluate(() => ({
    elements: document.getElementsByTagName('*').length,
    resources: performance.getEntriesByType('resource').length,
    longTasks: performance.getEntriesByType('longtask').length,
  }));
  if (!sharedContext) await context.close();
  return { cold, ...results, dom };
}

async function runMeasurements(browser, room, cold) {
  const sharedContext = cold
    ? null
    : await createMeasurementContext(browser);
  try {
    for (let index = 0; index < WARMUP_COUNT; index += 1) {
      await runScenario(browser, room, cold, sharedContext);
    }
    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      samples.push(await runScenario(browser, room, cold, sharedContext));
    }
    const metrics = Object.keys(samples[0]).filter((key) => key.endsWith('Ms'));
    return {
      samples,
      summary: Object.fromEntries(metrics.map((metric) => [metric, summarize(samples.map((sample) => sample[metric]))])),
      dom: samples.map((sample) => sample.dom),
    };
  } finally {
    if (sharedContext) await sharedContext.close();
  }
}

async function runRepeatedUsage(browser, room) {
  const context = await createMeasurementContext(browser);
  try {
    const page = await context.newPage();
    await openRoom(page, room.id);
    const domBefore = await page.evaluate(() => ({
      elements: document.getElementsByTagName('*').length,
      resources: performance.getEntriesByType('resource').length,
    }));
    const cycleMs = [];
    const resourcesPerCycle = [];
    for (let cycle = 0; cycle < 10; cycle += 1) {
      await page.evaluate(() => performance.clearResourceTimings());
      const started = await page.evaluate(() => performance.now());
      await page.getByTestId('mobile-nav-map').click();
      await page.getByTestId('map-panel').waitFor({ state: 'visible' });
      await page.getByTestId('mobile-nav-plan').click();
      await page.getByTestId('itinerary-horizontal-scroll').waitFor({ state: 'visible' });
      await page.locator('[data-testid="ticket-tab-button"]:visible').click();
      await page.getByTestId('ticket-panel').waitFor({ state: 'visible' });
      await page.locator('[data-testid="expense-tab-button"]:visible').click();
      await page.getByTestId('expense-panel').waitFor({ state: 'visible' });
      cycleMs.push(await page.evaluate((start) => performance.now() - start, started));
      resourcesPerCycle.push(await page.evaluate(() => performance.getEntriesByType('resource').length));
    }
    const domAfter = await page.evaluate(() => ({
      elements: document.getElementsByTagName('*').length,
      resources: performance.getEntriesByType('resource').length,
      longTasks: performance.getEntriesByType('longtask').length,
    }));
    return { cycles: summarize(cycleMs), resourcesPerCycle, domBefore, domAfter };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless: true });
try {
  const rooms = [makeRoom('general'), makeRoom('large')];
  await Promise.all(rooms.map(seedRoom));
  const output = {
    generatedAt: new Date().toISOString(),
    sourceCommit: process.env.GIT_COMMIT || 'unknown',
    baseUrl: baseUrl.toString(),
    environment: {
      node: process.version,
      browser: browser.version(),
      viewport: VIEWPORT,
      sampleCount: SAMPLE_COUNT,
      warmupCount: WARMUP_COUNT,
      serviceWorkers: 'blocked for measurement isolation',
      cpuThrottle: 'none',
      networkThrottle: 'none',
    },
    rooms: {},
  };
  for (const room of rooms) {
    output.rooms[room.id] = {
      data: room.definition,
      cold: await runMeasurements(browser, room, true),
      warm: await runMeasurements(browser, room, false),
      repeatedUsage: await runRepeatedUsage(browser, room),
    };
  }
  await mkdir(resolve(outputFile, '..'), { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(output, null, 2));
} finally {
  await browser.close();
}
