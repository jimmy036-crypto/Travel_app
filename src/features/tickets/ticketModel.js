import { getDayNumber, parseDateOnlyLocal } from '../../helpers.js';

export const TICKET_TYPES = Object.freeze({
  ATTACHMENT: 'attachment',
  WEB_LINK: 'web-link',
  EXTERNAL_APP: 'external-app',
});

export const TICKET_AUDIENCE_TYPES = Object.freeze({
  ALL: 'all',
  MEMBERS: 'members',
});

const VALID_TICKET_TYPES = new Set(Object.values(TICKET_TYPES));
const VALID_REMINDER_MINUTES = new Set([0, 5, 15, 30, 60]);
const VALID_ATTACHMENT_KINDS = new Set(['image', 'pdf']);

const trimText = (value) => String(value ?? '').trim();

const trimMetadataValue = (value) => (
  typeof value === 'string' ? value.trim() : value ?? null
);

const normalizeMemberList = (members) => {
  const normalized = [];
  const source = Array.isArray(members) ? members : [];

  source.forEach((member) => {
    const name = trimText(member);
    if (name && !normalized.includes(name)) normalized.push(name);
  });

  return normalized;
};

export const normalizeTicketType = (ticket) => {
  const source = ticket && typeof ticket === 'object' ? ticket : {};
  const ticketType = trimText(source.ticketType);
  if (VALID_TICKET_TYPES.has(ticketType)) return ticketType;

  const legacyType = trimText(source.type).toLowerCase();
  if (legacyType === 'image' || legacyType === 'pdf') {
    return TICKET_TYPES.ATTACHMENT;
  }
  if (trimText(source.storagePath)) return TICKET_TYPES.ATTACHMENT;

  return TICKET_TYPES.WEB_LINK;
};

export const normalizeTicketAudience = (ticket, members) => {
  const source = ticket && typeof ticket === 'object' ? ticket : {};
  const availableMembers = normalizeMemberList(members);
  const availableMemberSet = new Set(availableMembers);

  if (source.audienceType === TICKET_AUDIENCE_TYPES.ALL) {
    return {
      audienceType: TICKET_AUDIENCE_TYPES.ALL,
      assignedMembers: [],
    };
  }

  if (source.audienceType === TICKET_AUDIENCE_TYPES.MEMBERS) {
    const assignedMembers = normalizeMemberList(source.assignedMembers)
      .filter((member) => availableMemberSet.has(member));

    return {
      audienceType: TICKET_AUDIENCE_TYPES.MEMBERS,
      assignedMembers,
    };
  }

  const owner = trimText(source.owner);
  if (owner && owner !== '所有人' && availableMemberSet.has(owner)) {
    return {
      audienceType: TICKET_AUDIENCE_TYPES.MEMBERS,
      assignedMembers: [owner],
    };
  }

  return {
    audienceType: TICKET_AUDIENCE_TYPES.ALL,
    assignedMembers: [],
  };
};

export const normalizeTicketHttpUrl = (value) => {
  const raw = trimText(value);
  if (!raw) return '';

  try {
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw)
      ? raw
      : `https://${raw}`;
    const url = new URL(candidate);

    if (!['http:', 'https:'].includes(url.protocol)) return '';
    if (url.username || url.password) return '';

    return url.toString();
  } catch {
    return '';
  }
};

const normalizeAttachmentKind = (ticket, ticketType) => {
  if (ticketType !== TICKET_TYPES.ATTACHMENT) return '';

  const attachmentKind = trimText(ticket?.attachmentKind).toLowerCase();
  if (VALID_ATTACHMENT_KINDS.has(attachmentKind)) return attachmentKind;

  const legacyType = trimText(ticket?.type).toLowerCase();
  return VALID_ATTACHMENT_KINDS.has(legacyType) ? legacyType : '';
};

const normalizeReminderMinutes = (value) => {
  const reminderMinutes = Number(value);
  return VALID_REMINDER_MINUTES.has(reminderMinutes) ? reminderMinutes : 0;
};

const normalizeUsageTime = (value) => {
  const usageTime = trimText(value);
  const match = /^(\d{2}):([0-5]\d)$/.exec(usageTime);
  if (!match || Number(match[1]) > 23) return '';
  return usageTime;
};

export const normalizeTicket = (ticket, options = {}) => {
  const source = ticket && typeof ticket === 'object' ? ticket : {};
  const members = normalizeMemberList(options?.members);
  const ticketType = normalizeTicketType(source);
  const attachmentKind = normalizeAttachmentKind(source, ticketType);
  const audience = normalizeTicketAudience(source, members);
  const requestedPresenter = trimText(source.presenterMember);
  const validPresenters = audience.audienceType === TICKET_AUDIENCE_TYPES.ALL
    ? members
    : audience.assignedMembers;
  const presenterMember = validPresenters.includes(requestedPresenter)
    ? requestedPresenter
    : '';

  return {
    id: trimText(source.id),
    title: trimText(source.title),

    ticketType,
    attachmentKind,
    type: ticketType === TICKET_TYPES.ATTACHMENT ? attachmentKind : trimText(source.type),
    url: normalizeTicketHttpUrl(source.url),
    storagePath: trimText(source.storagePath),

    audienceType: audience.audienceType,
    assignedMembers: audience.assignedMembers,
    presenterMember,

    dayId: trimText(source.dayId),
    usageTime: normalizeUsageTime(source.usageTime),
    reminderMinutes: normalizeReminderMinutes(source.reminderMinutes),

    appName: trimText(source.appName),
    appUrl: normalizeTicketHttpUrl(source.appUrl),
    fallbackUrl: normalizeTicketHttpUrl(source.fallbackUrl),
    orderNumber: trimText(source.orderNumber),

    requiresNetwork: source.requiresNetwork === true,
    requiresLogin: source.requiresLogin === true,
    dynamicCode: source.dynamicCode === true,

    usageDetails: trimText(source.usageDetails),
    memo: trimText(source.memo),
    instructions: trimText(source.instructions),

    owner: trimText(source.owner),
    createdAt: trimMetadataValue(source.createdAt),
    updatedAt: trimMetadataValue(source.updatedAt),
  };
};

export const getTicketLaunchAction = (ticket) => {
  const source = ticket && typeof ticket === 'object' ? ticket : {};
  const ticketType = normalizeTicketType(source);

  if (ticketType === TICKET_TYPES.EXTERNAL_APP) {
    const appUrl = normalizeTicketHttpUrl(source.appUrl);
    if (appUrl) {
      return {
        mode: 'app-link',
        url: appUrl,
        label: '在 App 中開啟票券',
      };
    }

    const fallbackUrl = normalizeTicketHttpUrl(source.fallbackUrl);
    if (fallbackUrl) {
      return {
        mode: 'web',
        url: fallbackUrl,
        label: '開啟票券網站',
      };
    }

    return {
      mode: 'manual',
      url: '',
      label: '查看開啟方式',
    };
  }

  const url = normalizeTicketHttpUrl(source.url);
  if (ticketType === TICKET_TYPES.WEB_LINK) {
    return url
      ? { mode: 'web', url, label: '開啟票券網站' }
      : { mode: 'invalid', url: '', label: '票券連結無效' };
  }

  const attachmentKind = normalizeAttachmentKind(source, ticketType);
  if (!url || !attachmentKind) {
    return { mode: 'invalid', url: '', label: '票券附件無效' };
  }

  return attachmentKind === 'image'
    ? { mode: 'fullscreen-image', url, label: '全螢幕查看票券' }
    : { mode: 'pdf', url, label: '開啟 PDF 票券' };
};

export const filterTicketsForView = (tickets, view) => {
  const source = Array.isArray(tickets) ? tickets : [];
  const viewType = trimText(view?.type);

  if (viewType === 'all') return [...source];
  if (viewType === 'common') {
    return source.filter((ticket) => ticket?.audienceType === TICKET_AUDIENCE_TYPES.ALL);
  }
  if (viewType !== 'member') return [];

  const member = trimText(view?.member);
  if (!member) return [];

  return source.filter((ticket) => (
    ticket?.audienceType === TICKET_AUDIENCE_TYPES.ALL
    || (
      ticket?.audienceType === TICKET_AUDIENCE_TYPES.MEMBERS
      && normalizeMemberList(ticket.assignedMembers).includes(member)
    )
  ));
};

export const deriveTicketUsageDate = ({ dayId, startDate } = {}) => {
  const start = startDate instanceof Date
    ? new Date(startDate.getTime())
    : parseDateOnlyLocal(startDate);
  if (!(start instanceof Date) || Number.isNaN(start.getTime())) return '';

  const usageDate = new Date(start.getTime());
  usageDate.setDate(usageDate.getDate() + getDayNumber(dayId) - 1);
  if (Number.isNaN(usageDate.getTime())) return '';

  const year = usageDate.getFullYear();
  const month = String(usageDate.getMonth() + 1).padStart(2, '0');
  const day = String(usageDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
