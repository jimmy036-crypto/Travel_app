import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CURRENT_RELEASE_NOTES,
  CURRENT_RELEASE_PENDING_TOUR_KEY,
  CURRENT_RELEASE_SEEN_KEY,
  CURRENT_RELEASE_VERSION,
  clearCurrentReleaseSeen,
  clearCurrentReleaseTourPending,
  hasPendingCurrentReleaseTour,
  hasSeenCurrentRelease,
  markCurrentReleaseSeen,
  markCurrentReleaseTourPending,
} from './releaseNotes.js';

const EXPECTED_HIGHLIGHT_IDS = [
  'responsive-planner',
  'map-itinerary',
  'settlement-transfer',
  'place-details',
  'appearance-tools',
  'guided-example',
];

describe('release identity', () => {
  it('publishes the 2026.07 trip management redesign version and title', () => {
    expect(CURRENT_RELEASE_VERSION).toBe('2026.07-trip-management-redesign');
    expect(CURRENT_RELEASE_NOTES.version).toBe(CURRENT_RELEASE_VERSION);
    expect(CURRENT_RELEASE_NOTES.title).toBe('行程規劃、地圖與記帳全面升級');
    expect(CURRENT_RELEASE_NOTES.publishedAt).toBe('2026-07-30');
  });

  it('derives seen and pending storage keys from the current version', () => {
    expect(CURRENT_RELEASE_SEEN_KEY).toBe(
      `travel-app-seen-release-${CURRENT_RELEASE_VERSION}`,
    );
    expect(CURRENT_RELEASE_PENDING_TOUR_KEY).toBe(
      `travel-app-pending-feature-tour-${CURRENT_RELEASE_VERSION}`,
    );
    expect(CURRENT_RELEASE_SEEN_KEY).not.toContain('mobile-collaboration');
    expect(CURRENT_RELEASE_PENDING_TOUR_KEY).not.toContain('mobile-collaboration');
  });
});

describe('release highlights', () => {
  it('lists the six user-facing highlights in order', () => {
    expect(CURRENT_RELEASE_NOTES.highlights).toHaveLength(6);
    expect(CURRENT_RELEASE_NOTES.highlights.map((item) => item.id))
      .toEqual(EXPECTED_HIGHLIGHT_IDS);
  });

  it('gives every highlight a unique id, simple icon, title and description', () => {
    const ids = new Set();
    for (const highlight of CURRENT_RELEASE_NOTES.highlights) {
      expect(ids.has(highlight.id)).toBe(false);
      ids.add(highlight.id);
      expect(typeof highlight.icon).toBe('string');
      expect(highlight.icon.length).toBeGreaterThan(0);
      expect(highlight.icon.length).toBeLessThanOrEqual(2);
      expect(highlight.title.length).toBeGreaterThan(0);
      expect(highlight.description.length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['responsive-planner', '手機與桌面規劃介面重整', '單日時間軸'],
    ['map-itinerary', '地圖與行程保持同步', '當日順序'],
    ['settlement-transfer', '記錄旅伴是否已完成轉帳', '已轉帳'],
    ['place-details', '景點資料集中管理', '景點資訊'],
    ['appearance-tools', '外觀與旅程工具整合', '外觀設定'],
    ['guided-example', '可編輯範例旅程與新版指引', '本機範例'],
  ])('describes %s accurately', (id, title, descriptionFragment) => {
    const highlight = CURRENT_RELEASE_NOTES.highlights.find((item) => item.id === id);
    expect(highlight?.title).toBe(title);
    expect(highlight?.description).toContain(descriptionFragment);
  });

  it('does not overclaim offline editing or flawless iOS behaviour', () => {
    const copy = CURRENT_RELEASE_NOTES.highlights
      .map((item) => `${item.title}${item.description}`)
      .join('');
    expect(copy).not.toContain('離線編輯');
    expect(copy).not.toContain('完全離線');
    expect(copy).not.toContain('完美');
    expect(copy).not.toContain('iOS');
  });

  it('keeps the local example promise explicit', () => {
    const guidedExample = CURRENT_RELEASE_NOTES.highlights
      .find((item) => item.id === 'guided-example');
    expect(guidedExample?.description).toContain('不寫入正式雲端旅程');
  });
});

describe('release storage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('marks, reads and clears the seen flag on the versioned key', () => {
    expect(hasSeenCurrentRelease()).toBe(false);
    expect(markCurrentReleaseSeen()).toBe(true);
    expect(localStorage.getItem(CURRENT_RELEASE_SEEN_KEY)).toBe('true');
    expect(hasSeenCurrentRelease()).toBe(true);
    expect(clearCurrentReleaseSeen()).toBe(true);
    expect(hasSeenCurrentRelease()).toBe(false);
  });

  it('does not read or remove keys from older releases', () => {
    const legacyKey = 'travel-app-seen-release-2026.07-mobile-collaboration';
    localStorage.setItem(legacyKey, 'true');

    expect(hasSeenCurrentRelease()).toBe(false);
    markCurrentReleaseSeen();
    clearCurrentReleaseSeen();

    expect(localStorage.getItem(legacyKey)).toBe('true');
  });

  it('tracks the pending tour flag in sessionStorage', () => {
    expect(hasPendingCurrentReleaseTour()).toBe(false);
    expect(markCurrentReleaseTourPending()).toBe(true);
    expect(sessionStorage.getItem(CURRENT_RELEASE_PENDING_TOUR_KEY)).toBe('true');
    expect(hasPendingCurrentReleaseTour()).toBe(true);
    expect(clearCurrentReleaseTourPending()).toBe(true);
    expect(hasPendingCurrentReleaseTour()).toBe(false);
  });

  it('degrades gracefully when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    expect(hasSeenCurrentRelease()).toBe(false);
    expect(markCurrentReleaseSeen()).toBe(false);
    expect(clearCurrentReleaseSeen()).toBe(false);
    expect(hasPendingCurrentReleaseTour()).toBe(false);
    expect(markCurrentReleaseTourPending()).toBe(false);
    expect(clearCurrentReleaseTourPending()).toBe(false);
  });
});
