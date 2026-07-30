import { validateDemoSandbox } from './demoSandboxStore.js';
import {
  CLONE_OWNER_FALLBACK,
  CLONE_PLACE_VERIFICATION,
  CLONE_SCHEMA_VERSION,
} from './cloneDemoConstants.js';

const SENSITIVE_TEXT = /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|authorization|bearer)\b/i;

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(7, '0');
}

export function createCloneStableId(prefix, operationId, sourceKey) {
  if (!/^[a-z][a-z0-9-]{1,31}$/i.test(prefix)) throw new Error('Invalid ID prefix.');
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/i.test(String(operationId || ''))) throw new Error('Invalid operationId.');
  if (!String(sourceKey || '').trim()) throw new Error('Missing source key.');
  return `${prefix}-${stableHash(`${operationId}:${sourceKey}`)}`;
}

function safeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || SENSITIVE_TEXT.test(text)) return fallback;
  return text;
}

function convertPlace(place, dayId, index, operationId) {
  const sourceKey = safeText(place?.id, `${dayId}-${index}`);
  const notes = safeText(place?.notes || place?.memo);
  return {
    id: createCloneStableId('place', operationId, sourceKey),
    name: safeText(place?.name, '未命名景點'),
    customName: safeText(place?.customName),
    time: safeText(place?.time),
    stayTime: safeText(place?.stayTime, '60'),
    address: safeText(place?.address),
    notes,
    memo: notes,
    category: safeText(place?.category, 'other'),
    dayId,
    locationVerification: CLONE_PLACE_VERIFICATION,
  };
}

function convertChecklistItem(item, index, operationId, owner) {
  const sourceKey = safeText(item?.id, `checklist-${index}`);
  const assignedToOwner = Boolean(safeText(item?.assignee || item?.owner));
  const assignee = assignedToOwner ? owner : '';
  return {
    id: createCloneStableId('check', operationId, sourceKey),
    text: safeText(item?.text, '未命名項目'),
    scope: assignee ? 'personal' : 'shared',
    owner: assignee,
    assignee,
    category: safeText(item?.category, 'todo'),
    important: Boolean(item?.important),
    completed: false,
    completedAt: null,
    completedBy: '',
  };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function fingerprintClonePayload(value) {
  return `fnv1a-${stableHash(stableJson(value))}`;
}

export function convertDemoSandboxToTrip(sandbox, options = {}) {
  const validation = validateDemoSandbox(sandbox);
  if (!validation.valid) {
    const error = new Error(`Invalid Demo Sandbox: ${validation.errors.join(' ')}`);
    error.code = 'INVALID_DEMO_SANDBOX';
    throw error;
  }
  const operationId = String(options.operationId || '');
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/i.test(operationId)) throw new Error('Invalid operationId.');
  const owner = safeText(options.owner, CLONE_OWNER_FALLBACK);
  const source = sandbox.trip;
  const roomId = options.roomId || createCloneStableId('trip', operationId, 'room');
  if (roomId === source.roomId || roomId === sandbox.sandboxId) throw new Error('Clone room ID collides with Demo identity.');

  const itinerary = Object.fromEntries(Object.entries(source.itinerary).map(([dayId, places]) => [
    dayId,
    places.map((place, index) => convertPlace(place, dayId, index, operationId)),
  ]));
  const checklist = source.checklist.map((item, index) => (
    convertChecklistItem(item, index, operationId, owner)
  ));
  const payload = {
    schemaVersion: CLONE_SCHEMA_VERSION,
    roomId,
    meta: {
      title: safeText(options.title || source.meta.title, '我的示範旅程副本'),
      destination: safeText(source.meta.destination),
      startDate: safeText(options.startDate || source.meta.startDate),
      endDate: safeText(source.meta.endDate),
      members: [owner],
      memberBudgets: { [owner]: 0 },
      transport: safeText(source.meta.transport),
      themeColor: safeText(source.meta.themeColor, '#2563eb'),
      dayThemes: Object.fromEntries(Object.entries(source.meta.dayThemes || {}).map(([dayId, value]) => [
        dayId,
        safeText(value),
      ])),
    },
    itinerary,
    checklist,
    cloneOperation: {
      operationId,
      templateVersion: sandbox.templateVersion,
    },
  };
  payload.cloneOperation.payloadFingerprint = fingerprintClonePayload(payload);
  return payload;
}
