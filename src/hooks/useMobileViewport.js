import { useSyncExternalStore } from 'react';

export const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)';

const readMobileViewport = () => (
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia(MOBILE_VIEWPORT_QUERY).matches
);

const subscribeToMobileViewport = (onStoreChange) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY);
  mediaQuery.addEventListener?.('change', onStoreChange);
  return () => mediaQuery.removeEventListener?.('change', onStoreChange);
};

export function useMobileViewport() {
  return useSyncExternalStore(
    subscribeToMobileViewport,
    readMobileViewport,
    () => false,
  );
}
