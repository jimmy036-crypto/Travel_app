export const CURRENT_RELEASE_VERSION =
  '2026.07-trip-management-redesign';

export const CURRENT_RELEASE_SEEN_KEY =
  `travel-app-seen-release-${CURRENT_RELEASE_VERSION}`;

export const CURRENT_RELEASE_PENDING_TOUR_KEY =
  `travel-app-pending-feature-tour-${CURRENT_RELEASE_VERSION}`;

export const CURRENT_RELEASE_NOTES = {
  version: CURRENT_RELEASE_VERSION,
  title: '行程規劃、地圖與記帳全面升級',
  publishedAt: '2026-07-30',
  highlights: [
    {
      id: 'responsive-planner',
      icon: '▤',
      title: '手機與桌面規劃介面重整',
      description: '手機使用單日時間軸；桌面保留多日並排規劃，低頻操作集中到景點資訊。',
    },
    {
      id: 'map-itinerary',
      icon: '◎',
      title: '地圖與行程保持同步',
      description: '依當日順序顯示標記與路線，地圖景點卡、選取狀態與天數切換同步。',
    },
    {
      id: 'settlement-transfer',
      icon: '⇄',
      title: '記錄旅伴是否已完成轉帳',
      description: '結算建議可標記或取消已轉帳，重新整理後仍保留。',
    },
    {
      id: 'place-details',
      icon: 'i',
      title: '景點資料集中管理',
      description: '導航、編輯、周圍搜尋、附件、菜單與筆記集中在景點資訊。',
    },
    {
      id: 'appearance-tools',
      icon: '⚙',
      title: '外觀與旅程工具整合',
      description: '外觀設定改為明確介面，分享共編、共享清單與匯出集中到設定。',
    },
    {
      id: 'guided-example',
      icon: '★',
      title: '可編輯範例旅程與新版指引',
      description: '可先用本機範例了解行程、地圖、票券與記帳；範例不寫入正式雲端旅程。',
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
