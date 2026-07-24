export const CLONE_PLACE_VERIFICATION = 'unverified-text';
export const CLONE_SCHEMA_VERSION = '1.0.0';
export const CLONE_OWNER_FALLBACK = '自己';

export const CLONE_FORBIDDEN_KEYS = Object.freeze([
  'expenses',
  'settlements',
  'tickets',
  'attachments',
  'storagePath',
  'guidance',
  'sandboxId',
  'place_id',
  'destLat',
  'destLng',
  'nextLeg',
  'orderNumber',
  'audit',
]);
