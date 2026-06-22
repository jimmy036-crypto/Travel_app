export const API_KEY = 'AIzaSyAieyVaZA3vohEdf07yrk_9OYgsqXLfUmg';

export const APP_VERSION = "v2.8.0";

export const RELEASE_NOTES = {
  version: APP_VERSION,
  date: "2026/06/22",
  features: [
    "✅ 新增共用票券夾：與隊友共享機票、車票、門票或飯店確認單，重要附件不再零散。",
    "📸 支援檔案上傳：可直接上傳票券圖片或 PDF 檔（如電子機票），方便隨時開啟查驗。",
    "🔗 支援網址連結：可貼上第三方訂房網站或活動頁面的超連結，一鍵跳轉。",
    "📜 筆記滾動解鎖：修復長篇筆記無法上下滑動的 Bug，導入原生級滾動體驗。",
    "📱 手機版深度優化：行程表中點擊景點可以顯示詳情(如官網、照片、評論等)。",
    "修復了各種BUG"
  ]
};

export const CATEGORIES = [
  { id: 'food', icon: '🍔', label: '飲食', color: 'bg-orange-500', text: 'text-orange-500' },
  { id: 'transport', icon: '🚗', label: '交通', color: 'bg-blue-500', text: 'text-blue-500' },
  { id: 'stay', icon: '🏠', label: '住宿', color: 'bg-indigo-500', text: 'text-indigo-500' },
  { id: 'ticket', icon: '🎫', label: '門票', color: 'bg-pink-500', text: 'text-pink-500' },
  { id: 'shop', icon: '🛍️', label: '購物', color: 'bg-purple-500', text: 'text-purple-500' },
  { id: 'other', icon: '💡', label: '其他', color: 'bg-slate-500', text: 'text-slate-400' }
];

export const TAG_OPTIONS = ["需預約", "必吃", "必買", "不可刷卡", "排隊名店", "拍照點"];