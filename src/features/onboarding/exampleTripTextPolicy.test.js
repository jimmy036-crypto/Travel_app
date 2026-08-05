import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createLocalExampleTemplateSnapshot } from '../trip-data/localExampleTripRepository.js';

const FORBIDDEN_UI_TEXT = [
  '本機示範副本',
  '本機示範',
  '僅供預覽',
  '範例模式',
  '示範資料',
  'Demo Preview',
];
const FORBIDDEN_TEMPLATE_TEXT = ['示範旅程', ...FORBIDDEN_UI_TEXT];

const CURRENT_UI_FILES = [
  'src/App.jsx',
  'src/TripDetail.jsx',
  'src/components/TripCard.jsx',
  'src/features/onboarding/DemoTripEntryCard.jsx',
  'src/features/onboarding/FirstRunWelcomeDialog.jsx',
];

describe('example trip UI text policy', () => {
  it.each(CURRENT_UI_FILES)('keeps forbidden labels out of %s', (file) => {
    const source = readFileSync(resolve(file), 'utf8');
    FORBIDDEN_UI_TEXT.forEach((phrase) => expect(source).not.toContain(phrase));
  });

  it('sanitizes all visible template data and keeps one title suffix', () => {
    const snapshot = createLocalExampleTemplateSnapshot();
    const visibleData = JSON.stringify(snapshot);

    FORBIDDEN_TEMPLATE_TEXT.forEach((phrase) => expect(visibleData).not.toContain(phrase));
    expect(snapshot.meta.title.match(/（範例）/gu)).toHaveLength(1);
    expect(visibleData.match(/（範例）/gu)).toHaveLength(1);
  });

  it('uses the product-approved lifecycle labels for the example trip', () => {
    const appSource = readFileSync(resolve('src/App.jsx'), 'utf8');
    expect(appSource).toContain('從這台裝置的大廳移除示範旅程？');
    expect(appSource).toContain('恢復示範旅程');
    expect(appSource).toContain('查看示範旅程');
  });
});
