import { normalizeTicket } from '../tickets/ticketModel.js';

export const DEMO_TRIP_ID = 'demo-getting-started';
export const DEMO_TRIP_VERSION = 1;

const DEMO_MEMBERS = Object.freeze(['自己', '旅伴 A', '旅伴 B']);

function copyLocalDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (match) {
      const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      if (
        date.getFullYear() === Number(match[1])
        && date.getMonth() === Number(match[2]) - 1
        && date.getDate() === Number(match[3])
      ) {
        return date;
      }
    }
  }

  return null;
}

function resolveNow(value) {
  const candidate = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isNaN(candidate.getTime()) ? new Date() : candidate;
}

function addLocalDays(date, amount) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  result.setDate(result.getDate() + amount);
  return result;
}

function formatLocalDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createPlace({ id, dayId, name, time, address, notes, category }) {
  return {
    id,
    name,
    customName: '',
    place_id: '',
    time,
    stayTime: '60',
    address,
    notes,
    memo: notes,
    category,
    dayId,
    tags: ['示範資料'],
    nextLeg: { mode: 'DEMO', mins: 30 },
  };
}

function createChecklistItem({ id, text, scope, owner = '', assignee, category, completed, timestamp }) {
  return {
    id,
    text,
    scope,
    owner,
    assignee,
    category,
    important: category === 'document' || category === 'booking',
    completed,
    completedAt: completed ? timestamp : null,
    completedBy: completed ? (owner || '自己') : '',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createTokyoDemoTrip(options = {}) {
  const now = resolveNow(options.now);
  const providedStart = copyLocalDate(options.startDate);
  const dayOne = providedStart || addLocalDays(now, 1);
  const dayThree = addLocalDays(dayOne, 2);
  const startDate = formatLocalDate(dayOne);
  const endDate = formatLocalDate(dayThree);
  const timestamp = now.getTime();
  const members = [...DEMO_MEMBERS];

  const itinerary = {
    'Day 1': [
      createPlace({ id: 'demo-place-day1-arrival', dayId: 'Day 1', name: '抵達東京（示範）', time: '09:00', address: '東京市區抵達點（範例）', notes: '範例：抵達後先確認隨身物品；非即時交通建議。', category: 'transport' }),
      createPlace({ id: 'demo-place-day1-hotel', dayId: 'Day 1', name: '飯店寄放行李（示範）', time: '10:30', address: '東京住宿區域（範例）', notes: '範例：寄放規則請以實際住宿公告為準。', category: 'stay' }),
      createPlace({ id: 'demo-place-day1-asakusa', dayId: 'Day 1', name: '淺草寺（示範）', time: '13:30', address: '淺草地區（範例）', notes: '範例景點，開放資訊請出發前自行確認。', category: 'sightseeing' }),
      createPlace({ id: 'demo-place-day1-skytree', dayId: 'Day 1', name: '東京晴空塔（示範）', time: '17:00', address: '押上地區（範例）', notes: '範例夜景安排，不代表即時營運或售票資訊。', category: 'sightseeing' }),
    ],
    'Day 2': [
      createPlace({ id: 'demo-place-day2-meiji', dayId: 'Day 2', name: '明治神宮（示範）', time: '09:00', address: '代代木地區（範例）', notes: '範例景點，參訪規範請以現場公告為準。', category: 'sightseeing' }),
      createPlace({ id: 'demo-place-day2-harajuku', dayId: 'Day 2', name: '原宿散步（示範）', time: '11:30', address: '原宿地區（範例）', notes: '範例自由活動，不含即時店家推薦。', category: 'sightseeing' }),
      createPlace({ id: 'demo-place-day2-shibuya', dayId: 'Day 2', name: '澀谷（示範）', time: '15:00', address: '澀谷地區（範例）', notes: '範例市區行程，請依當日狀況調整。', category: 'sightseeing' }),
      createPlace({ id: 'demo-place-day2-tower', dayId: 'Day 2', name: '東京鐵塔夜景（示範）', time: '19:00', address: '芝公園地區（範例）', notes: '範例夜景行程，不代表精確營業時間。', category: 'sightseeing' }),
    ],
    'Day 3': [
      createPlace({ id: 'demo-place-day3-tsukiji', dayId: 'Day 3', name: '築地場外市場（示範）', time: '08:30', address: '築地地區（範例）', notes: '範例早餐安排，店家營業狀況請自行確認。', category: 'food' }),
      createPlace({ id: 'demo-place-day3-ginza', dayId: 'Day 3', name: '銀座散步（示範）', time: '11:30', address: '銀座地區（範例）', notes: '範例自由活動，不含即時購物資訊。', category: 'sightseeing' }),
      createPlace({ id: 'demo-place-day3-airport', dayId: 'Day 3', name: '機場返程（示範）', time: '16:00', address: '東京機場方向（範例）', notes: '範例：實際出發時間與交通方式請依航班確認。', category: 'transport' }),
    ],
  };

  const tickets = [
    normalizeTicket({
      id: 'demo-ticket-shared-app',
      title: '共同交通票券（示範）',
      ticketType: 'external-app',
      audienceType: 'all',
      presenterMember: '自己',
      dayId: 'Day 1',
      usageTime: '09:00',
      reminderMinutes: 15,
      appName: '交通票券 App（示範）',
      appUrl: '',
      fallbackUrl: '',
      orderNumber: 'DEMO-ORDER-001',
      requiresNetwork: true,
      requiresLogin: true,
      dynamicCode: true,
      instructions: '這是示範資料，請勿當作實際票券使用。',
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { members }),
    normalizeTicket({
      id: 'demo-ticket-personal-web',
      title: '個人網頁票券（功能範例）',
      ticketType: 'web-link',
      audienceType: 'members',
      assignedMembers: ['自己'],
      presenterMember: '自己',
      dayId: 'Day 2',
      url: 'https://example.com/demo-ticket',
      orderNumber: 'DEMO-ORDER-WEB-001',
      memo: '功能範例；Preview 不會開啟這個網址。',
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { members }),
    normalizeTicket({
      id: 'demo-ticket-multi-app',
      title: '雙人交通票券（示範）',
      ticketType: 'external-app',
      audienceType: 'members',
      assignedMembers: ['自己', '旅伴 A'],
      presenterMember: '旅伴 A',
      dayId: 'Day 3',
      appName: '多人交通票券（示範）',
      appUrl: '',
      fallbackUrl: '',
      orderNumber: 'DEMO-ORDER-002',
      instructions: '示範手動模式：由旅伴 A 出示；這不是實際票券。',
      createdAt: timestamp,
      updatedAt: timestamp,
    }, { members }),
  ];

  const expenses = [
    { id: 'demo-expense-hotel', dayId: 'Day 1', item: '飯店（示範金額）', cost: 12000, localCost: 12000, currency: 'TWD', exchangeRate: 1, category: 'stay', payer: '自己', split: { 自己: 4000, '旅伴 A': 4000, '旅伴 B': 4000 }, note: '以下金額為示範資料，不代表東京實際價格。', createdAt: timestamp, updatedAt: timestamp },
    { id: 'demo-expense-transport', dayId: 'Day 1', item: '交通（示範金額）', cost: 3000, localCost: 3000, currency: 'TWD', exchangeRate: 1, category: 'transport', payer: '旅伴 A', split: { 自己: 1000, '旅伴 A': 1000, '旅伴 B': 1000 }, note: '示範共同分帳。', createdAt: timestamp + 1, updatedAt: timestamp + 1 },
    { id: 'demo-expense-food', dayId: 'Day 2', item: '餐飲（示範金額）', cost: 1800, localCost: 1800, currency: 'TWD', exchangeRate: 1, category: 'food', payer: '旅伴 B', split: { 自己: 600, '旅伴 A': 600, '旅伴 B': 600 }, note: '示範共同分帳。', createdAt: timestamp + 2, updatedAt: timestamp + 2 },
    { id: 'demo-expense-ticket', dayId: 'Day 2', item: '景點門票（個人示範）', cost: 1500, localCost: 1500, currency: 'TWD', exchangeRate: 1, category: 'ticket', payer: '自己', split: { 自己: 1500, '旅伴 A': 0, '旅伴 B': 0 }, note: '示範個人費用。', createdAt: timestamp + 3, updatedAt: timestamp + 3 },
  ];

  const checklist = [
    createChecklistItem({ id: 'demo-checklist-passport', text: '護照（示範）', scope: 'personal', owner: '自己', assignee: '自己', category: 'document', completed: true, timestamp }),
    createChecklistItem({ id: 'demo-checklist-charger', text: '充電器（示範）', scope: 'shared', assignee: '旅伴 A', category: 'electronics', completed: false, timestamp: timestamp + 1 }),
    createChecklistItem({ id: 'demo-checklist-medicine', text: '常用藥品（示範）', scope: 'personal', owner: '旅伴 B', assignee: '旅伴 B', category: 'health', completed: false, timestamp: timestamp + 2 }),
    createChecklistItem({ id: 'demo-checklist-network', text: '確認網路方案（示範）', scope: 'shared', assignee: '所有人', category: 'connectivity', completed: true, timestamp: timestamp + 3 }),
    createChecklistItem({ id: 'demo-checklist-dynamic-ticket', text: '提前開啟動態票券（示範）', scope: 'personal', owner: '自己', assignee: '自己', category: 'todo', completed: false, timestamp: timestamp + 4 }),
    createChecklistItem({ id: 'demo-checklist-return', text: '確認回程交通（示範）', scope: 'shared', assignee: '旅伴 B', category: 'booking', completed: false, timestamp: timestamp + 5 }),
  ];

  return {
    roomId: DEMO_TRIP_ID,
    isDemo: true,
    readOnly: true,
    source: 'built-in',
    version: DEMO_TRIP_VERSION,
    meta: {
      title: '東京三日示範旅程',
      destination: '日本東京都',
      destLat: 35.6762,
      destLng: 139.6503,
      startDate,
      endDate,
      members,
      memberBudgets: { 自己: 20000, '旅伴 A': 20000, '旅伴 B': 20000 },
      transport: '大眾運輸（示範）',
      themeColor: '#2563eb',
      dayThemes: {
        'Day 1': '抵達與東京東側（示範）',
        'Day 2': '經典市區散步（示範）',
        'Day 3': '市場、銀座與返程（示範）',
      },
    },
    itinerary,
    tickets,
    expenses,
    checklist,
    guidance: {
      chapters: [
        { id: 'overview', title: '旅程總覽', description: '認識日期、成員與唯讀示範摘要。', targetTestId: 'demo-overview-trip-summary' },
        { id: 'itinerary', title: '安排每日行程', description: '查看三天的時間、景點與範例備註。', targetTestId: 'demo-itinerary' },
        { id: 'collaboration', title: '多人協作概念', description: '了解成員、分工與共同資料的概念。', targetTestId: 'demo-overview-collaboration' },
        { id: 'tickets', title: '管理票券', description: '查看共同、個人與多人票券的差異。', targetTestId: 'demo-tickets' },
        { id: 'expenses', title: '共同記帳', description: '查看示範付款、分帳與簡化結算。', targetTestId: 'demo-expenses' },
        { id: 'checklist', title: '行前清單', description: '查看共同與個人待辦的完成狀態。', targetTestId: 'demo-checklist' },
        { id: 'offline-pwa', title: '離線與主畫面', description: '認識正式旅程可使用的離線與 PWA 功能。', targetTestId: 'demo-overview-offline-pwa' },
      ],
    },
  };
}

export function isBuiltInDemoTrip(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.roomId === DEMO_TRIP_ID
    && value.isDemo === true
    && value.readOnly === true
    && value.source === 'built-in'
    && value.version === DEMO_TRIP_VERSION
  );
}
