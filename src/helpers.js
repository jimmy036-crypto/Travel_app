export const getDayDisplay = (dayId, startDateStr) => {
  const safeDayId = String(dayId || "");
  const dayNum = parseInt(safeDayId.replace('Day ', ''), 10) || 1;
  const chineseNum = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十"];
  const dayLabel = `第${chineseNum[dayNum] || dayNum}天`;
  if (!startDateStr) return { title: dayLabel, dateStr: "" };
  const dateObj = new Date(String(startDateStr));
  if (isNaN(dateObj.getTime())) return { title: dayLabel, dateStr: "" };
  dateObj.setDate(dateObj.getDate() + dayNum - 1);
  return { title: dayLabel, dateStr: `${dateObj.getMonth() + 1}/${dateObj.getDate()} (${['日', '一', '二', '三', '四', '五', '六'][dateObj.getDay()]})` };
};

export const generateId = () => `id_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

export const getBrightness = (hex) => {
  const c = String(hex || '#000000').replace('#', '');
  const r = parseInt(c.substring(0, 2), 16) || 0;
  const g = parseInt(c.substring(2, 4), 16) || 0;
  const b = parseInt(c.substring(4, 6), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000;
};

export const getThemeClasses = (hex) => {
  const isLight = getBrightness(hex) > 150;
  return {
    isLight,
    mainText: isLight ? 'text-slate-900' : 'text-slate-100',
    subText: isLight ? 'text-slate-600' : 'text-slate-300',
    cardBg: isLight ? 'bg-white/60' : 'bg-black/40',
    cardBorder: isLight ? 'border-black/10' : 'border-white/10',
    cardHover: isLight ? 'hover:bg-white/80 hover:border-blue-400' : 'hover:bg-black/60 hover:border-blue-500',
    cardMetaBg: isLight ? 'bg-black/5' : 'bg-white/5',
    inputBg: isLight ? 'bg-white/80' : 'bg-black/50',
    modalBg: isLight ? 'bg-white/95' : 'bg-black/90',
    sidebarBg: isLight ? 'bg-white/50' : 'bg-black/50',
    headerBg: isLight ? 'bg-white/70' : 'bg-black/70',
    itemBg: isLight ? 'bg-white/80' : 'bg-black/40',
    itemHover: isLight ? 'hover:border-black/30' : 'hover:border-white/30',
    expenseBlockBg: isLight ? 'bg-black/5' : 'bg-black/20',
  };
};

export const getExploreIcon = (query) => {
  const q = String(query || "").toLowerCase();
  if (q.includes("停車") || q.includes("parking")) return { text: "🅿️", bg: "#64748b", border: "#475569" };
  if (q.includes("咖啡") || q.includes("cafe") || q.includes("coffee")) return { text: "☕", bg: "#78350f", border: "#451a03" };
  if (q.includes("超市") || q.includes("便利") || q.includes("mart") || q.includes("market")) return { text: "🛒", bg: "#16a34a", border: "#14532d" };
  if (q.includes("景點") || q.includes("公園") || q.includes("park")) return { text: "📸", bg: "#db2777", border: "#9d174d" };
  if (q.includes("住宿") || q.includes("飯店") || q.includes("hotel")) return { text: "🏨", bg: "#4f46e5", border: "#312e81" };
  return { text: "📍", bg: "#f97316", border: "#c2410c" };
};

export const timeToMins = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = String(timeStr).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const minsToTime = (mins) => {
  const safeMins = Number(mins);
  if (isNaN(safeMins)) return "";
  const h = Math.floor(safeMins / 60) % 24;
  const m = safeMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

export const formatStayTime = (mins) => {
  const m = Number(mins);
  if (isNaN(m) || m <= 0) return "🚶‍♂️ 僅經過";
  if (m < 60) return `${m} 分鐘`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm === 0 ? `${h} 小時` : `${h} 小時 ${rm} 分鐘`;
};

export const safeUrlFormatter = (urlStr) => {
  const s = String(urlStr || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return `https://${s}`;
  return s;
};