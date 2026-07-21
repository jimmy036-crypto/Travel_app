import { describe, expect, it } from 'vitest';

import { normalizeTicket } from '../tickets/ticketModel.js';
import {
  DEMO_TRIP_ID,
  DEMO_TRIP_VERSION,
  createTokyoDemoTrip,
  isBuiltInDemoTrip,
} from './demoTripData.js';

const FIXED_NOW = new Date(2026, 6, 21, 15, 30, 0);

function createDemo(startDate = '2026-07-22') {
  return createTokyoDemoTrip({ startDate, now: FIXED_NOW });
}

function flattenPlaces(demo) {
  return Object.values(demo.itinerary).flat();
}

describe('createTokyoDemoTrip identity and dates', () => {
  it('exports the fixed demo identity and version', () => {
    expect(DEMO_TRIP_ID).toBe('demo-getting-started');
    expect(DEMO_TRIP_VERSION).toBe(1);
  });

  it('marks the root as a built-in read-only demo', () => {
    expect(createDemo()).toMatchObject({
      roomId: DEMO_TRIP_ID,
      isDemo: true,
      readOnly: true,
      source: 'built-in',
      version: DEMO_TRIP_VERSION,
    });
  });

  it('uses local tomorrow when startDate is omitted', () => {
    const demo = createTokyoDemoTrip({ now: new Date(2026, 6, 21, 23, 55) });
    expect(demo.meta.startDate).toBe('2026-07-22');
    expect(demo.meta.endDate).toBe('2026-07-24');
  });

  it('creates three consecutive local calendar dates', () => {
    const demo = createDemo('2026-07-22');
    expect(demo.meta).toMatchObject({ startDate: '2026-07-22', endDate: '2026-07-24' });
    expect(Object.keys(demo.itinerary)).toEqual(['Day 1', 'Day 2', 'Day 3']);
  });

  it('handles a cross-month range', () => {
    const demo = createDemo('2026-01-30');
    expect(demo.meta.endDate).toBe('2026-02-01');
  });

  it('handles a cross-year range', () => {
    const demo = createDemo('2026-12-31');
    expect(demo.meta.endDate).toBe('2027-01-02');
  });

  it('formats the local date without a UTC conversion', () => {
    const localStart = new Date(2026, 9, 5, 23, 45);
    const demo = createTokyoDemoTrip({ startDate: localStart, now: FIXED_NOW });
    expect(demo.meta.startDate).toBe('2026-10-05');
  });

  it('does not modify the input Date objects', () => {
    const startDate = new Date(2026, 11, 31, 23, 45);
    const now = new Date(2026, 6, 21, 12, 15);
    const startTime = startDate.getTime();
    const nowTime = now.getTime();
    createTokyoDemoTrip({ startDate, now });
    expect(startDate.getTime()).toBe(startTime);
    expect(now.getTime()).toBe(nowTime);
  });
});

describe('createTokyoDemoTrip content', () => {
  it('contains three fictional demo members and example budgets', () => {
    const demo = createDemo();
    expect(demo.meta.members).toEqual(['自己', '旅伴 A', '旅伴 B']);
    expect(demo.meta.memberBudgets).toEqual({ 自己: 20000, '旅伴 A': 20000, '旅伴 B': 20000 });
  });

  it('contains the required three-day Tokyo itinerary', () => {
    const demo = createDemo();
    expect(demo.itinerary['Day 1'].map((place) => place.name)).toEqual(expect.arrayContaining([
      '抵達東京（示範）', '飯店寄放行李（示範）', '淺草寺（示範）', '東京晴空塔（示範）',
    ]));
    expect(demo.itinerary['Day 2'].map((place) => place.name)).toEqual(expect.arrayContaining([
      '明治神宮（示範）', '原宿散步（示範）', '澀谷（示範）', '東京鐵塔夜景（示範）',
    ]));
    expect(demo.itinerary['Day 3'].map((place) => place.name)).toEqual(expect.arrayContaining([
      '築地場外市場（示範）', '銀座散步（示範）', '機場返程（示範）',
    ]));
  });

  it('gives every place a unique demo ID and display fields', () => {
    const places = flattenPlaces(createDemo());
    const ids = places.map((place) => place.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^demo-place-/));
    places.forEach((place) => expect(place).toMatchObject({
      time: expect.any(String),
      address: expect.any(String),
      notes: expect.stringContaining('範例'),
      category: expect.any(String),
      dayId: expect.stringMatching(/^Day [123]$/),
    }));
  });

  it('contains shared, personal, and multi-member canonical tickets', () => {
    const demo = createDemo();
    expect(demo.tickets.map((ticket) => ticket.audienceType)).toEqual(['all', 'members', 'members']);
    expect(demo.tickets[1].assignedMembers).toEqual(['自己']);
    expect(demo.tickets[2].assignedMembers).toEqual(['自己', '旅伴 A']);
    demo.tickets.forEach((ticket) => {
      expect(normalizeTicket(ticket, { members: demo.meta.members })).toEqual(ticket);
    });
  });

  it('uses manual external-app examples and DEMO order numbers', () => {
    const demo = createDemo();
    const externalTickets = demo.tickets.filter((ticket) => ticket.ticketType === 'external-app');
    expect(externalTickets).toHaveLength(2);
    externalTickets.forEach((ticket) => {
      expect(ticket.appUrl).toBe('');
      expect(ticket.fallbackUrl).toBe('');
      expect(ticket.orderNumber).toMatch(/^DEMO-/);
    });
  });

  it('uses only an inert HTTPS example URL and no Storage URL', () => {
    const serialized = JSON.stringify(createDemo());
    expect(serialized).toContain('https://example.com/demo-ticket');
    expect(serialized).not.toMatch(/firebasestorage|storage\.googleapis/i);
    expect(serialized).not.toMatch(/javascript:|data:|file:|intent:/i);
    expect(serialized).not.toContain('?');
  });

  it('does not contain password, token, cookie, or verification-code fields', () => {
    const serialized = JSON.stringify(createDemo()).toLowerCase();
    expect(serialized).not.toMatch(/password|token|cookie|verificationcode|otp|decodedqr/);
  });

  it('contains unique expense IDs and balanced canonical splits', () => {
    const expenses = createDemo().expenses;
    const ids = expenses.map((expense) => expense.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^demo-expense-/));
    expenses.forEach((expense) => {
      const splitTotal = Object.values(expense.split).reduce((sum, value) => sum + value, 0);
      expect(splitTotal).toBe(expense.cost);
      expect(expense.note).toContain('示範');
    });
    expect(expenses.map((expense) => expense.category)).toEqual(expect.arrayContaining(['stay', 'transport', 'food', 'ticket']));
  });

  it('contains unique canonical checklist IDs and mixed states/scopes', () => {
    const checklist = createDemo().checklist;
    const ids = checklist.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^demo-checklist-/));
    expect(checklist.some((item) => item.completed)).toBe(true);
    expect(checklist.some((item) => !item.completed)).toBe(true);
    expect(checklist.some((item) => item.scope === 'shared')).toBe(true);
    expect(checklist.some((item) => item.scope === 'personal')).toBe(true);
  });

  it('returns an independent object graph for every call', () => {
    const first = createDemo();
    const second = createDemo();
    expect(first).not.toBe(second);
    expect(first.meta).not.toBe(second.meta);
    expect(first.itinerary['Day 1']).not.toBe(second.itinerary['Day 1']);
    expect(first.tickets).not.toBe(second.tickets);
    expect(first.checklist).not.toBe(second.checklist);
  });

  it('does not leak mutations between calls', () => {
    const first = createDemo();
    first.meta.members.push('被修改');
    first.itinerary['Day 1'][0].name = '被修改';
    first.tickets[0].title = '被修改';
    const second = createDemo();
    expect(second.meta.members).toEqual(['自己', '旅伴 A', '旅伴 B']);
    expect(second.itinerary['Day 1'][0].name).toBe('抵達東京（示範）');
    expect(second.tickets[0].title).toBe('共同交通票券（示範）');
  });

  it('defines unique guidance chapters with non-empty real target IDs', () => {
    const chapters = createDemo().guidance.chapters;
    expect(chapters.map((chapter) => chapter.id)).toEqual([
      'overview', 'itinerary', 'collaboration', 'tickets', 'expenses', 'checklist', 'offline-pwa',
    ]);
    expect(new Set(chapters.map((chapter) => chapter.id)).size).toBe(chapters.length);
    chapters.forEach((chapter) => expect(chapter.targetTestId).toMatch(/^demo-/));
  });
});

describe('isBuiltInDemoTrip', () => {
  it('recognizes a generated built-in demo', () => {
    expect(isBuiltInDemoTrip(createDemo())).toBe(true);
  });

  it('rejects a forged room ID', () => {
    expect(isBuiltInDemoTrip({ ...createDemo(), roomId: 'demo-forged' })).toBe(false);
  });

  it('rejects an object with only isDemo true', () => {
    expect(isBuiltInDemoTrip({ roomId: 'real-room', isDemo: true })).toBe(false);
  });

  it('rejects missing or mismatched built-in markers', () => {
    expect(isBuiltInDemoTrip(null)).toBe(false);
    expect(isBuiltInDemoTrip({ ...createDemo(), readOnly: false })).toBe(false);
    expect(isBuiltInDemoTrip({ ...createDemo(), version: 2 })).toBe(false);
  });
});
