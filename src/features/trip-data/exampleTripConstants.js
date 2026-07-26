export const LOCAL_EXAMPLE_TRIP_ID = 'local-example-trip';
export const LOCAL_EXAMPLE_DATABASE_NAME = 'travel-app-local-example-trip';
export const LOCAL_EXAMPLE_DATABASE_VERSION = 1;
export const LOCAL_EXAMPLE_TRIP_STORE = 'tripRecords';
export const LOCAL_EXAMPLE_ATTACHMENT_STORE = 'attachments';
export const LOCAL_EXAMPLE_SCHEMA_VERSION = '1.0.0';
export const LOCAL_EXAMPLE_TEMPLATE_VERSION = '1.0.0';
export const LOCAL_EXAMPLE_TITLE_SUFFIX = '（範例）';

export const LOCAL_EXAMPLE_SAVE_ERROR_MESSAGE = '無法保存目前的修改，請稍後再試。';
export const CLOUD_FEATURE_UNAVAILABLE_MESSAGE = '建立自己的旅程後即可使用此功能';

const FORBIDDEN_VISIBLE_PHRASES = Object.freeze([
  ['示範旅程', '自由行'],
  ['本機示範副本', '本機內容'],
  ['本機示範', '本機內容'],
  ['僅供預覽', '參考內容'],
  ['範例模式', '參考內容'],
  ['示範資料', '參考內容'],
  ['Demo Preview', '參考內容'],
]);

export function withExampleTitleSuffix(value) {
  const withoutRepeatedSuffix = String(value || '東京自由行')
    .replace(new RegExp(`(?:${LOCAL_EXAMPLE_TITLE_SUFFIX})+$`, 'u'), '')
    .replaceAll('示範旅程', '自由行')
    .replaceAll('參考旅程', '自由行')
    .trim();
  return `${withoutRepeatedSuffix || '東京自由行'}${LOCAL_EXAMPLE_TITLE_SUFFIX}`;
}

export function sanitizeExampleVisibleText(value) {
  const withoutMarkers = String(value)
    .replace(/（示範[^）]*）/gu, '')
    .replaceAll('示範', '參考')
    .replaceAll('範例', '參考');
  return FORBIDDEN_VISIBLE_PHRASES.reduce(
    (result, [phrase, replacement]) => result.replaceAll(phrase, replacement),
    withoutMarkers,
  );
}
