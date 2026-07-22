export const FIRST_RUN_ONBOARDING_VERSION = 1;
export const FIRST_RUN_ONBOARDING_SEEN_KEY = 'travel-app-seen-onboarding-v1';

const DEFAULT_APPEARANCE = '#d8b4e2';
const OFFLINE_CACHE_KEY = 'google-travel-offline-trip-cache-v1';

function getStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasSeenFirstRunOnboarding() {
  try {
    return getStorage()?.getItem(FIRST_RUN_ONBOARDING_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markFirstRunOnboardingSeen() {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(FIRST_RUN_ONBOARDING_SEEN_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

export function clearFirstRunOnboardingSeen() {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.removeItem(FIRST_RUN_ONBOARDING_SEEN_KEY);
    return true;
  } catch {
    return false;
  }
}

function hasValidOfflineContent(raw) {
  if (!String(raw || '').trim()) return false;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    return Object.entries(parsed).some(([roomId, value]) => (
      roomId
      && value
      && typeof value === 'object'
      && !Array.isArray(value)
      && value.version === 1
      && String(value.roomId || '') === roomId
      && typeof value.cachedAt === 'number'
      && Number.isFinite(value.cachedAt)
      && value.cachedAt > 0
      && value.meta
      && typeof value.meta === 'object'
      && Array.isArray(value.days)
      && value.summary
      && typeof value.summary === 'object'
    ));
  } catch {
    return false;
  }
}

function readRoomDeepLink() {
  try {
    if (typeof window === 'undefined') return false;
    return Boolean(new URLSearchParams(window.location.search).get('room')?.trim());
  } catch {
    return false;
  }
}

export function readFirstRunEligibilitySnapshot() {
  const snapshot = {
    onboardingSeen: hasSeenFirstRunOnboarding(),
    hasNonEmptyTrips: false,
    hasReleaseHistory: false,
    hasMeaningfulAppearancePreference: false,
    hasOfflineTripData: false,
    hasMemberIdentityHistory: false,
    hasRoomDeepLink: readRoomDeepLink(),
  };

  try {
    const storage = getStorage();
    if (!storage) return snapshot;

    const tripsRaw = storage.getItem('google-travel-my-trips');
    if (String(tripsRaw || '').trim()) {
      try {
        const trips = JSON.parse(tripsRaw);
        snapshot.hasNonEmptyTrips = Array.isArray(trips) && trips.length > 0;
      } catch {
        snapshot.hasNonEmptyTrips = false;
      }
    }

    const appearance = String(storage.getItem('google-travel-custom-bg') || '').trim().toLowerCase();
    snapshot.hasMeaningfulAppearancePreference = Boolean(appearance && appearance !== DEFAULT_APPEARANCE);
    snapshot.hasOfflineTripData = hasValidOfflineContent(storage.getItem(OFFLINE_CACHE_KEY));

    for (let index = 0; index < storage.length; index += 1) {
      const key = String(storage.key(index) || '');
      if (key.startsWith('travel-app-seen-release-')) snapshot.hasReleaseHistory = true;
      if (key.startsWith('travel-active-member-') || key.startsWith('travel-checklist-actor-')) {
        snapshot.hasMemberIdentityHistory = true;
      }
    }
  } catch {
    return snapshot;
  }

  return snapshot;
}

export function shouldShowFirstRunOnboarding(snapshot) {
  const value = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return value.onboardingSeen === false
    && value.hasNonEmptyTrips === false
    && value.hasReleaseHistory === false
    && value.hasMeaningfulAppearancePreference === false
    && value.hasOfflineTripData === false
    && value.hasMemberIdentityHistory === false;
}
