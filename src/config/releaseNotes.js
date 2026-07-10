export const CURRENT_RELEASE_VERSION = '2026.07-mobile-collaboration';

export const CURRENT_RELEASE_SEEN_KEY =
  `travel-app-seen-release-${CURRENT_RELEASE_VERSION}`;

export const CURRENT_RELEASE_PENDING_TOUR_KEY =
  `travel-app-pending-feature-tour-${CURRENT_RELEASE_VERSION}`;

export const CURRENT_RELEASE_NOTES = {
  version: CURRENT_RELEASE_VERSION,
  title: '旅行協作體驗全面升級',
  publishedAt: '2026-07',
  highlights: [
    {
      id: 'sync-status',
      icon: '●',
      title: '即時同步狀態',
      description: '旅程頁會顯示正在連線、正在同步、已同步與遠端更新狀態。',
    },
    {
      id: 'mobile-days',
      icon: '日',
      title: '手機快速切換天數',
      description: '新增更大的天數按鈕，降低切換每天行程時的誤觸。',
    },
    {
      id: 'place-actions',
      icon: '⋯',
      title: '景點操作選單',
      description: '手機版將編輯、查看周邊、複製與刪除收進「⋯」選單。',
    },
    {
      id: 'place-info',
      icon: 'i',
      title: '景點資訊入口更清楚',
      description: '景點資訊用來查看地址、定位、附件與備註；查看周邊會切到地圖探索附近地點。',
    },
    {
      id: 'collaboration',
      icon: '↻',
      title: '多人即時協作改善',
      description: '景點、行程排序、費用與票券附件能在其他裝置即時更新。',
    },
  ],
};

export function hasSeenCurrentRelease() {
  try {
    return localStorage.getItem(CURRENT_RELEASE_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markCurrentReleaseSeen() {
  try {
    localStorage.setItem(CURRENT_RELEASE_SEEN_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

export function clearCurrentReleaseSeen() {
  try {
    localStorage.removeItem(CURRENT_RELEASE_SEEN_KEY);
    return true;
  } catch {
    return false;
  }
}

export function hasPendingCurrentReleaseTour() {
  try {
    return sessionStorage.getItem(CURRENT_RELEASE_PENDING_TOUR_KEY) === 'true';
  } catch {
    return false;
  }
}

export function markCurrentReleaseTourPending() {
  try {
    sessionStorage.setItem(CURRENT_RELEASE_PENDING_TOUR_KEY, 'true');
    return true;
  } catch {
    return false;
  }
}

export function clearCurrentReleaseTourPending() {
  try {
    sessionStorage.removeItem(CURRENT_RELEASE_PENDING_TOUR_KEY);
    return true;
  } catch {
    return false;
  }
}
