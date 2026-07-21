import { describe, expect, it } from 'vitest';

import {
  TICKET_AUDIENCE_TYPES,
  TICKET_TYPES,
  deriveTicketUsageDate,
  filterTicketsForView,
  getTicketLaunchAction,
  normalizeTicket,
  normalizeTicketAudience,
  normalizeTicketHttpUrl,
  normalizeTicketType,
} from './ticketModel.js';

const members = ['王泓文', '陳小美', '林大同'];

describe('ticket type normalization', () => {
  it.each(Object.values(TICKET_TYPES))('keeps the new ticket type %s', (ticketType) => {
    expect(normalizeTicketType({ ticketType })).toBe(ticketType);
  });

  it.each(['image', 'pdf'])('maps legacy %s tickets to attachments', (type) => {
    expect(normalizeTicketType({ type })).toBe(TICKET_TYPES.ATTACHMENT);
  });

  it('maps legacy link tickets to web links', () => {
    expect(normalizeTicketType({ type: 'link' })).toBe(TICKET_TYPES.WEB_LINK);
  });

  it('uses storagePath as an attachment fallback', () => {
    expect(normalizeTicketType({ type: 'unknown', storagePath: ' rooms/a/tickets/1 ' }))
      .toBe(TICKET_TYPES.ATTACHMENT);
  });
});

describe('ticket audience normalization', () => {
  it('keeps all-audience tickets common and clears assignments', () => {
    expect(normalizeTicketAudience({
      audienceType: 'all',
      assignedMembers: ['王泓文'],
    }, members)).toEqual({
      audienceType: TICKET_AUDIENCE_TYPES.ALL,
      assignedMembers: [],
    });
  });

  it('maps the legacy 所有人 owner to all', () => {
    expect(normalizeTicketAudience({ owner: '所有人' }, members)).toEqual({
      audienceType: TICKET_AUDIENCE_TYPES.ALL,
      assignedMembers: [],
    });
  });

  it('maps a valid legacy owner to one assigned member', () => {
    expect(normalizeTicketAudience({ owner: ' 王泓文 ' }, members)).toEqual({
      audienceType: TICKET_AUDIENCE_TYPES.MEMBERS,
      assignedMembers: ['王泓文'],
    });
  });

  it('deduplicates assigned members and removes blanks', () => {
    expect(normalizeTicketAudience({
      audienceType: 'members',
      assignedMembers: ['王泓文', ' 王泓文 ', '', '陳小美'],
    }, members).assignedMembers).toEqual(['王泓文', '陳小美']);
  });

  it('excludes assigned members who no longer exist', () => {
    expect(normalizeTicketAudience({
      audienceType: 'members',
      assignedMembers: ['王泓文', '已離開成員'],
    }, members).assignedMembers).toEqual(['王泓文']);
  });

  it('falls back to all when a legacy owner is absent or invalid', () => {
    expect(normalizeTicketAudience({ owner: '已離開成員' }, members).audienceType)
      .toBe(TICKET_AUDIENCE_TYPES.ALL);
    expect(normalizeTicketAudience({}, members).audienceType)
      .toBe(TICKET_AUDIENCE_TYPES.ALL);
  });
});

describe('canonical ticket normalization', () => {
  it('trims strings, keeps attachment compatibility, and validates a member presenter', () => {
    const ticket = normalizeTicket({
      id: ' ticket-1 ',
      title: ' 高鐵票 ',
      type: 'image',
      url: ' tickets.example/image ',
      storagePath: ' rooms/one/tickets/one ',
      audienceType: 'members',
      assignedMembers: [' 王泓文 ', '王泓文', '陳小美'],
      presenterMember: ' 王泓文 ',
      memo: ' 提前取票 ',
    }, { members });

    expect(ticket).toMatchObject({
      id: 'ticket-1',
      title: '高鐵票',
      ticketType: 'attachment',
      attachmentKind: 'image',
      type: 'image',
      url: 'https://tickets.example/image',
      storagePath: 'rooms/one/tickets/one',
      audienceType: 'members',
      assignedMembers: ['王泓文', '陳小美'],
      presenterMember: '王泓文',
      memo: '提前取票',
    });
  });

  it('removes a presenter who is not assigned', () => {
    expect(normalizeTicket({
      audienceType: 'members',
      assignedMembers: ['王泓文'],
      presenterMember: '陳小美',
    }, { members }).presenterMember).toBe('');
  });

  it('allows an all-audience presenter who is a trip member', () => {
    expect(normalizeTicket({
      audienceType: 'all',
      presenterMember: '林大同',
    }, { members }).presenterMember).toBe('林大同');
  });

  it.each([0, 5, 15, 30, 60])('accepts reminderMinutes %s', (reminderMinutes) => {
    expect(normalizeTicket({ reminderMinutes }, { members }).reminderMinutes)
      .toBe(reminderMinutes);
  });

  it('falls back to zero for reminders outside the allowlist', () => {
    expect(normalizeTicket({ reminderMinutes: 10 }, { members }).reminderMinutes).toBe(0);
  });

  it('accepts valid HH:mm usageTime and clears invalid values', () => {
    expect(normalizeTicket({ usageTime: ' 09:05 ' }).usageTime).toBe('09:05');
    expect(normalizeTicket({ usageTime: '24:00' }).usageTime).toBe('');
    expect(normalizeTicket({ usageTime: '9:05' }).usageTime).toBe('');
  });

  it('does not require an external-app appUrl', () => {
    expect(normalizeTicket({
      ticketType: 'external-app',
      appName: ' Rail App ',
    })).toMatchObject({
      ticketType: 'external-app',
      appName: 'Rail App',
      appUrl: '',
    });
  });

  it('does not copy credential or dynamic-code content fields', () => {
    const ticket = normalizeTicket({
      password: 'secret',
      token: 'token',
      cookie: 'cookie',
      verificationCode: '123456',
      dynamicQrContent: 'private-code',
    });

    expect(ticket).not.toHaveProperty('password');
    expect(ticket).not.toHaveProperty('token');
    expect(ticket).not.toHaveProperty('cookie');
    expect(ticket).not.toHaveProperty('verificationCode');
    expect(ticket).not.toHaveProperty('dynamicQrContent');
  });
});

describe('ticket URL security and launch actions', () => {
  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/ticket.pdf',
    'blob:https://example.com/id',
    'intent://ticket',
    'travelapp://ticket/1',
  ])('rejects unsafe URL %s', (value) => {
    expect(normalizeTicketHttpUrl(value)).toBe('');
  });

  it('accepts explicit HTTP and HTTPS URLs', () => {
    expect(normalizeTicketHttpUrl('http://example.com/ticket'))
      .toBe('http://example.com/ticket');
    expect(normalizeTicketHttpUrl('https://example.com/ticket'))
      .toBe('https://example.com/ticket');
  });

  it('adds HTTPS when a scheme is missing', () => {
    expect(normalizeTicketHttpUrl('example.com/ticket'))
      .toBe('https://example.com/ticket');
  });

  it('uses a valid external-app appUrl first', () => {
    expect(getTicketLaunchAction({
      ticketType: 'external-app',
      appUrl: 'https://app.example/ticket',
      fallbackUrl: 'https://web.example/ticket',
    })).toEqual({
      mode: 'app-link',
      url: 'https://app.example/ticket',
      label: '在 App 中開啟票券',
    });
  });

  it('uses the fallback URL when an external app has no valid appUrl', () => {
    expect(getTicketLaunchAction({
      ticketType: 'external-app',
      appUrl: 'travelapp://ticket',
      fallbackUrl: 'web.example/ticket',
    })).toEqual({
      mode: 'web',
      url: 'https://web.example/ticket',
      label: '開啟票券網站',
    });
  });

  it('uses manual mode when an external app has no URL', () => {
    expect(getTicketLaunchAction({ ticketType: 'external-app' })).toEqual({
      mode: 'manual',
      url: '',
      label: '查看開啟方式',
    });
  });

  it('returns web or invalid actions for web-link tickets', () => {
    expect(getTicketLaunchAction({ ticketType: 'web-link', url: 'example.com' }).mode)
      .toBe('web');
    expect(getTicketLaunchAction({ ticketType: 'web-link', url: 'javascript:bad()' }).mode)
      .toBe('invalid');
  });

  it('returns image, PDF, and invalid attachment actions', () => {
    expect(getTicketLaunchAction({
      ticketType: 'attachment',
      attachmentKind: 'image',
      url: 'https://example.com/ticket.png',
    }).mode).toBe('fullscreen-image');
    expect(getTicketLaunchAction({
      type: 'pdf',
      url: 'https://example.com/ticket.pdf',
    }).mode).toBe('pdf');
    expect(getTicketLaunchAction({ type: 'image', url: '' }).mode).toBe('invalid');
  });
});

describe('ticket audience views', () => {
  const tickets = [
    { id: 'common-1', audienceType: 'all', assignedMembers: [] },
    { id: 'member-1', audienceType: 'members', assignedMembers: ['王泓文'] },
    { id: 'member-2', audienceType: 'members', assignedMembers: ['陳小美'] },
    { id: 'common-2', audienceType: 'all', assignedMembers: [] },
  ];

  it('shows common and assigned tickets in a member view without duplicates', () => {
    expect(filterTicketsForView(tickets, { type: 'member', member: '王泓文' })
      .map((ticket) => ticket.id)).toEqual(['common-1', 'member-1', 'common-2']);
  });

  it('shows only all-audience tickets in common view', () => {
    expect(filterTicketsForView(tickets, { type: 'common' }).map((ticket) => ticket.id))
      .toEqual(['common-1', 'common-2']);
  });

  it('shows every ticket in all view and keeps order', () => {
    expect(filterTicketsForView(tickets, { type: 'all' }).map((ticket) => ticket.id))
      .toEqual(['common-1', 'member-1', 'member-2', 'common-2']);
  });
});

describe('ticket usage date derivation', () => {
  it('derives Day 1 from the trip start date', () => {
    expect(deriveTicketUsageDate({ dayId: 'Day 1', startDate: '2026-09-20' }))
      .toBe('2026-09-20');
  });

  it('derives Day 2 using local calendar arithmetic', () => {
    expect(deriveTicketUsageDate({ dayId: 'Day 2', startDate: '2026-09-20' }))
      .toBe('2026-09-21');
  });

  it('handles month boundaries', () => {
    expect(deriveTicketUsageDate({ dayId: 'Day 2', startDate: '2026-09-30' }))
      .toBe('2026-10-01');
  });

  it('handles year boundaries', () => {
    expect(deriveTicketUsageDate({ dayId: 'Day 2', startDate: '2026-12-31' }))
      .toBe('2027-01-01');
  });

  it('returns an empty string for an invalid start date', () => {
    expect(deriveTicketUsageDate({ dayId: 'Day 1', startDate: '2026-02-30' })).toBe('');
  });

  it('uses Day 1 for an invalid dayId', () => {
    expect(deriveTicketUsageDate({ dayId: 'invalid', startDate: '2026-09-20' }))
      .toBe('2026-09-20');
  });

  it('does not modify a Date input', () => {
    const startDate = new Date(2026, 8, 20, 12, 30);
    const originalTime = startDate.getTime();

    expect(deriveTicketUsageDate({ dayId: 'Day 2', startDate })).toBe('2026-09-21');
    expect(startDate.getTime()).toBe(originalTime);
  });
});
