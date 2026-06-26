export const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '';
export const MAP_ID = import.meta.env.VITE_GOOGLE_MAP_ID || '';

export const APP_VERSION = 'v2.9.6';

export const RELEASE_NOTES = {
  version: APP_VERSION,
  date: '2026/06/26',
  features: [
    '新增一鍵匯出美美行程單，方便分享給其他朋友',
    '新增一鍵智慧行程排序，自動計算最優路徑，大大節省時間',
    '新增記帳圓餅圖，可視化統計數據，一看就知道錢都跑哪去',
    '新增共用行前清單，也有個人行前清單，不需要開備忘綠紀錄',
    '記帳系統新增多幣別與即時匯率計算',
    '新增目的地天氣預報顯示，但要行程出發前幾天才會顯示出來，目前科技無法預測兩個月後的天氣',
    '各種優化和debug'
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
