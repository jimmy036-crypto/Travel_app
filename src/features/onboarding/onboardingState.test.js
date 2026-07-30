import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FIRST_RUN_ONBOARDING_SEEN_KEY,
  FIRST_RUN_ONBOARDING_VERSION,
  clearFirstRunOnboardingSeen,
  hasSeenFirstRunOnboarding,
  markFirstRunOnboardingSeen,
  readFirstRunEligibilitySnapshot,
  shouldShowFirstRunOnboarding,
} from './onboardingState.js';

const freshSnapshot = () => readFirstRunEligibilitySnapshot();

describe('onboarding marker', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('uses the versioned key and marker value', () => {
    expect(FIRST_RUN_ONBOARDING_VERSION).toBe(1);
    expect(FIRST_RUN_ONBOARDING_SEEN_KEY).toBe('travel-app-seen-onboarding-v1');
    expect(hasSeenFirstRunOnboarding()).toBe(false);
    expect(markFirstRunOnboardingSeen()).toBe(true);
    expect(localStorage.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY)).toBe('true');
    expect(hasSeenFirstRunOnboarding()).toBe(true);
    expect(clearFirstRunOnboardingSeen()).toBe(true);
    expect(hasSeenFirstRunOnboarding()).toBe(false);
  });

  it('returns false safely for get, set, and remove failures', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('get'); });
    expect(hasSeenFirstRunOnboarding()).toBe(false);
    get.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('set'); });
    expect(markFirstRunOnboardingSeen()).toBe(false);
    set.mockRestore();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('remove'); });
    expect(clearFirstRunOnboardingSeen()).toBe(false);
    remove.mockRestore();
  });

  it('does not remove unrelated storage keys', () => {
    localStorage.setItem('other-app-key', 'keep');
    markFirstRunOnboardingSeen();
    clearFirstRunOnboardingSeen();
    expect(localStorage.getItem('other-app-key')).toBe('keep');
  });
});

describe('first-run eligibility', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('shows on a fresh device and ignores an empty trips key', () => {
    expect(shouldShowFirstRunOnboarding(freshSnapshot())).toBe(true);
    localStorage.setItem('google-travel-my-trips', '[]');
    expect(freshSnapshot().hasNonEmptyTrips).toBe(false);
    expect(shouldShowFirstRunOnboarding(freshSnapshot())).toBe(true);
  });

  it('treats non-empty trips as returning use and malformed trips safely', () => {
    localStorage.setItem('google-travel-my-trips', JSON.stringify([{ roomId: 'room-1' }]));
    expect(freshSnapshot().hasNonEmptyTrips).toBe(true);
    expect(shouldShowFirstRunOnboarding(freshSnapshot())).toBe(false);
    localStorage.setItem('google-travel-my-trips', 'not-json');
    expect(freshSnapshot().hasNonEmptyTrips).toBe(false);
  });

  it('detects current and old release history', () => {
    localStorage.setItem('travel-app-seen-release-current', 'true');
    expect(freshSnapshot().hasReleaseHistory).toBe(true);
    localStorage.clear();
    localStorage.setItem('travel-app-seen-release-old', 'true');
    expect(freshSnapshot().hasReleaseHistory).toBe(true);
  });

  it('ignores default appearance and detects a custom preference', () => {
    localStorage.setItem('google-travel-custom-bg', '#d8b4e2');
    expect(freshSnapshot().hasMeaningfulAppearancePreference).toBe(false);
    localStorage.setItem('google-travel-custom-bg', '#123456');
    expect(freshSnapshot().hasMeaningfulAppearancePreference).toBe(true);
  });

  it('detects only non-empty valid offline cache', () => {
    localStorage.setItem('google-travel-offline-trip-cache-v1', '{}');
    expect(freshSnapshot().hasOfflineTripData).toBe(false);
    localStorage.setItem('google-travel-offline-trip-cache-v1', JSON.stringify({
      room1: {
        version: 1,
        roomId: 'room1',
        cachedAt: 1,
        meta: { title: 'Trip' },
        days: [],
        summary: {},
      },
    }));
    expect(freshSnapshot().hasOfflineTripData).toBe(true);
  });

  it('detects active-member and checklist-actor history', () => {
    localStorage.setItem('travel-active-member-room1', 'A');
    expect(freshSnapshot().hasMemberIdentityHistory).toBe(true);
    localStorage.clear();
    localStorage.setItem('travel-checklist-actor-room1', 'A');
    expect(freshSnapshot().hasMemberIdentityHistory).toBe(true);
  });

  it('records a room deep link but does not permanently change eligibility', () => {
    window.history.pushState({}, '', '/?room=shared-room');
    const snapshot = freshSnapshot();
    expect(snapshot.hasRoomDeepLink).toBe(true);
    expect(shouldShowFirstRunOnboarding(snapshot)).toBe(true);
  });

  it('rejects onboarding seen and each existing-use signal', () => {
    const base = freshSnapshot();
    for (const signal of [
      'onboardingSeen',
      'hasNonEmptyTrips',
      'hasReleaseHistory',
      'hasMeaningfulAppearancePreference',
      'hasOfflineTripData',
      'hasMemberIdentityHistory',
    ]) {
      expect(shouldShowFirstRunOnboarding({ ...base, [signal]: true })).toBe(false);
    }
  });

  it('uses a safe fresh fallback when storage is completely unavailable', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    const snapshot = readFirstRunEligibilitySnapshot();
    expect(snapshot).toMatchObject({
      onboardingSeen: false,
      hasNonEmptyTrips: false,
      hasReleaseHistory: false,
      hasMeaningfulAppearancePreference: false,
      hasOfflineTripData: false,
      hasMemberIdentityHistory: false,
    });
    expect(shouldShowFirstRunOnboarding(snapshot)).toBe(true);
    get.mockRestore();
  });
});
