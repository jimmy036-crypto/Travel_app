export const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || '';

export const APP_VERSION = 'v3.0.0';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  date: '2026/06/26',
  features: [
    '新增景點菜單圖片放置',
    '修復改變排序時間顯示問題',
    '更新好看的icon,需重新在safari點加入主畫面，才會顯示新icon'
  ],
};

export const CATEGORIES = Object.freeze([
  { id: 'food', icon: '🍔', label: '飲食', color: 'bg-orange-500', text: 'text-orange-500' },
  { id: 'transport', icon: '🚗', label: '交通', color: 'bg-blue-500', text: 'text-blue-500' },
  { id: 'stay', icon: '🏠', label: '住宿', color: 'bg-indigo-500', text: 'text-indigo-500' },
  { id: 'ticket', icon: '🎫', label: '門票', color: 'bg-pink-500', text: 'text-pink-500' },
  { id: 'shop', icon: '🛍️', label: '購物', color: 'bg-purple-500', text: 'text-purple-500' },
  { id: 'other', icon: '💡', label: '其他', color: 'bg-slate-500', text: 'text-slate-400' },
]);

export const TAG_OPTIONS = Object.freeze(['需預約', '必吃', '必買', '不可刷卡', '排隊名店', '拍照點']);
