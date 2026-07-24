import React, { useMemo, useState } from 'react';

const TABS = Object.freeze([
  { id: 'overview', label: '總覽' },
  { id: 'itinerary', label: '行程' },
  { id: 'tickets', label: '票券' },
  { id: 'expenses', label: '記帳' },
  { id: 'checklist', label: '清單' },
]);

const TAB_IDS = new Set(TABS.map((tab) => tab.id));
const PACKING_CATEGORIES = new Set(['document', 'electronics', 'health', 'clothing', 'other']);
const EXPENSE_CATEGORY_LABELS = Object.freeze({
  stay: '住宿',
  transport: '交通',
  food: '餐飲',
  ticket: '景點／門票',
  shop: '購物',
  other: '其他',
});

function normalizeInitialTab(value) {
  const candidate = String(value || 'overview');
  return TAB_IDS.has(candidate) ? candidate : 'overview';
}

function formatMoney(value) {
  return `NT$ ${Math.round(Number(value) || 0).toLocaleString('zh-TW')}`;
}

function getAudienceLabel(ticket) {
  if (ticket?.audienceType === 'all') return '共同票券';
  const members = Array.isArray(ticket?.assignedMembers) ? ticket.assignedMembers : [];
  return members.length > 1 ? `多人票券：${members.join('、')}` : `個人票券：${members[0] || '未指定'}`;
}

function calculateBalances(expenses, members) {
  const balances = Object.fromEntries(members.map((member) => [member, 0]));
  expenses.forEach((expense) => {
    const payer = String(expense?.payer || '');
    if (Object.hasOwn(balances, payer)) balances[payer] += Number(expense.cost) || 0;
    members.forEach((member) => {
      balances[member] -= Number(expense?.split?.[member]) || 0;
    });
  });
  return balances;
}

function EditableItineraryControls({
  dayId,
  places,
  theme,
  onAddPlace,
  onUpdatePlace,
  onDeletePlace,
  onMovePlace,
}) {
  return (
    <section data-testid="demo-itinerary-editor" className={`rounded-3xl border p-4 sm:p-5 ${theme.card} ${theme.border}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={`font-black ${theme.main}`}>編輯目前行程</h3>
        <button
          type="button"
          data-testid="demo-add-place"
          onClick={() => onAddPlace?.(dayId)}
          className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
        >
          新增景點
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {places.map((place, index) => (
          <article
            key={place.id}
            data-testid="demo-editable-place"
            draggable
            onDragStart={(event) => event.dataTransfer?.setData('text/plain', place.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const sourceId = event.dataTransfer?.getData('text/plain');
              if (sourceId && sourceId !== place.id) onMovePlace?.(dayId, sourceId, { beforeId: place.id });
            }}
            className={`grid gap-3 rounded-2xl p-4 ${theme.soft}`}
          >
            <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
              <label className={`text-xs font-bold ${theme.sub}`}>
                抵達時間
                <input
                  type="time"
                  defaultValue={place.time || ''}
                  aria-label={`${place.name} 抵達時間`}
                  onChange={(event) => onUpdatePlace?.(dayId, place.id, { time: event.target.value })}
                  className={`mt-1 min-h-11 w-full rounded-lg border px-2 ${theme.card} ${theme.border} ${theme.main}`}
                />
              </label>
              <div className="space-y-2">
                <label className={`block text-xs font-bold ${theme.sub}`}>
                  景點名稱
                  <input
                    type="text"
                    defaultValue={place.name}
                    aria-label={`${place.name} 景點名稱`}
                    onChange={(event) => onUpdatePlace?.(dayId, place.id, { name: event.target.value })}
                    className={`mt-1 min-h-11 w-full rounded-lg border px-3 ${theme.card} ${theme.border} ${theme.main}`}
                  />
                </label>
                <label className={`block text-xs font-bold ${theme.sub}`}>
                  備註
                  <textarea
                    defaultValue={place.notes || ''}
                    aria-label={`${place.name} 備註`}
                    onChange={(event) => onUpdatePlace?.(dayId, place.id, {
                      notes: event.target.value,
                      memo: event.target.value,
                    })}
                    className={`mt-1 min-h-20 w-full rounded-lg border p-3 ${theme.card} ${theme.border} ${theme.main}`}
                  />
                </label>
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                aria-label={`向前移動 ${place.name}`}
                disabled={index === 0}
                onClick={() => onMovePlace?.(dayId, place.id, 'up')}
                className={`min-h-11 rounded-lg border px-3 text-sm font-bold disabled:opacity-40 ${theme.card} ${theme.border} ${theme.main}`}
              >
                向前
              </button>
              <button
                type="button"
                aria-label={`向後移動 ${place.name}`}
                disabled={index === places.length - 1}
                onClick={() => onMovePlace?.(dayId, place.id, 'down')}
                className={`min-h-11 rounded-lg border px-3 text-sm font-bold disabled:opacity-40 ${theme.card} ${theme.border} ${theme.main}`}
              >
                向後
              </button>
              <button
                type="button"
                aria-label={`刪除景點 ${place.name}`}
                onClick={() => onDeletePlace?.(dayId, place.id)}
                className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white"
              >
                刪除
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EditableChecklistControls({
  demo,
  theme,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
}) {
  const owner = demo.meta.members?.[0] || 'owner';
  return (
    <section data-testid="demo-checklist-editor" className={`rounded-3xl border p-4 sm:p-5 ${theme.card} ${theme.border}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={`font-black ${theme.main}`}>編輯 Checklist</h3>
        <button
          type="button"
          data-testid="demo-add-checklist-item"
          onClick={() => onAddChecklistItem?.()}
          className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
        >
          新增清單項目
        </button>
      </div>
      <div className="mt-4 space-y-3">
        {demo.checklist.map((item) => (
          <div key={item.id} data-testid="demo-editable-checklist-item" className={`grid gap-3 rounded-xl p-3 sm:grid-cols-[auto_1fr_auto] ${theme.soft}`}>
            <input
              type="checkbox"
              checked={Boolean(item.completed)}
              aria-label={`切換 ${item.text}`}
              onChange={(event) => onUpdateChecklistItem?.(item.id, {
                completed: event.target.checked,
                completedAt: event.target.checked ? Date.now() : null,
                completedBy: event.target.checked ? owner : '',
              })}
              className="mt-3 h-5 w-5"
            />
            <div className="space-y-2">
              <label className={`block text-xs font-bold ${theme.sub}`}>
                項目名稱
                <input
                  type="text"
                  defaultValue={item.text}
                  aria-label={`${item.text} 項目名稱`}
                  onChange={(event) => onUpdateChecklistItem?.(item.id, { text: event.target.value })}
                  className={`mt-1 min-h-11 w-full rounded-lg border px-3 ${theme.card} ${theme.border} ${theme.main}`}
                />
              </label>
              <label className={`block text-xs font-bold ${theme.sub}`}>
                負責人
                <select
                  value={item.assignee === owner ? owner : ''}
                  aria-label={`${item.text} 負責人`}
                  onChange={(event) => onUpdateChecklistItem?.(item.id, {
                    assignee: event.target.value,
                    owner: event.target.value,
                    scope: event.target.value ? 'personal' : 'shared',
                  })}
                  className={`mt-1 min-h-11 w-full rounded-lg border px-3 ${theme.card} ${theme.border} ${theme.main}`}
                >
                  <option value="">未指派</option>
                  <option value={owner}>{owner}</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              aria-label={`刪除清單項目 ${item.text}`}
              onClick={() => onDeleteChecklistItem?.(item.id)}
              className="min-h-11 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white"
            >
              刪除
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function OverviewPanel({ demo, hidden, theme }) {
  const places = Object.values(demo.itinerary || {}).flat();
  const completed = demo.checklist.filter((item) => item.completed).length;

  return (
    <section
      id="demo-panel-overview"
      role="tabpanel"
      aria-labelledby="demo-tab-overview-control"
      data-testid="demo-overview"
      hidden={hidden}
      className="space-y-4"
    >
      <div data-testid="demo-overview-trip-summary" className={`rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
        <h2 className={`text-xl font-black ${theme.main}`}>東京三日示範旅程</h2>
        <p className={`mt-2 break-words text-sm ${theme.sub}`}>{demo.meta.startDate} 至 {demo.meta.endDate}・{demo.meta.destination}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ['行程天數', `${Object.keys(demo.itinerary).length} 天`],
            ['景點數', `${places.length} 個`],
            ['票券數', `${demo.tickets.length} 張`],
            ['費用筆數', `${demo.expenses.length} 筆`],
          ].map(([label, value]) => (
            <div key={label} className={`min-w-0 rounded-2xl p-3 ${theme.soft}`}>
              <dt className={`text-xs font-bold ${theme.sub}`}>{label}</dt>
              <dd className={`mt-1 break-words text-lg font-black ${theme.main}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className={`mt-4 text-sm font-bold ${theme.main}`}>清單完成度：{completed}/{demo.checklist.length}</p>
      </div>

      <div data-testid="demo-overview-collaboration" className={`rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
        <h3 className={`font-black ${theme.main}`}>三位示範成員</h3>
        <ul className="mt-3 flex flex-wrap gap-2">
          {demo.meta.members.map((member) => (
            <li key={member} className="rounded-full bg-blue-600/10 px-3 py-2 text-sm font-bold text-blue-700 dark:text-blue-300">{member}</li>
          ))}
        </ul>
        <p className={`mt-3 break-words text-sm leading-6 ${theme.sub}`}>預算、共同票券與分帳都只是功能範例，不代表真實成員或費用。</p>
      </div>

      <div data-testid="demo-overview-offline-pwa" className={`rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
        <h3 className={`font-black ${theme.main}`}>離線與主畫面功能</h3>
        <ul className={`mt-3 list-disc space-y-2 pl-5 text-sm leading-6 ${theme.sub}`}>
          <li>正式旅程可離線查看最近開啟的旅程。</li>
          <li>可將網站加入主畫面，像 App 一樣快速開啟。</li>
          <li>這份內建示範不會寫入離線快取。</li>
        </ul>
      </div>
    </section>
  );
}

function ItineraryPanel({
  demo,
  hidden,
  theme,
  onAddPlace,
  onUpdatePlace,
  onDeletePlace,
  onMovePlace,
}) {
  const dayIds = Object.keys(demo.itinerary || {});
  const [activeDay, setActiveDay] = useState(dayIds[0] || 'Day 1');
  const places = demo.itinerary?.[activeDay] || [];

  return (
    <section
      id="demo-panel-itinerary"
      role="tabpanel"
      aria-labelledby="demo-tab-itinerary-control"
      data-testid="demo-itinerary"
      hidden={hidden}
      className="space-y-4"
    >
      <div data-testid="demo-day-selector" aria-label="選擇示範行程日期" className="flex max-w-full gap-2 overflow-x-auto pb-2">
        {dayIds.map((dayId, index) => (
          <button
            key={dayId}
            type="button"
            aria-pressed={activeDay === dayId}
            onClick={() => setActiveDay(dayId)}
            className={`min-h-11 shrink-0 rounded-xl px-4 text-sm font-black ${activeDay === dayId ? 'bg-blue-600 text-white' : `${theme.soft} ${theme.main}`}`}
          >
            第 {index + 1} 天・{demo.meta.dayThemes?.[dayId] || '示範行程'}
          </button>
        ))}
      </div>

      <EditableItineraryControls
        dayId={activeDay}
        places={places}
        theme={theme}
        onAddPlace={onAddPlace}
        onUpdatePlace={onUpdatePlace}
        onDeletePlace={onDeletePlace}
        onMovePlace={onMovePlace}
      />

      <div data-testid="demo-day-card" className={`rounded-3xl border p-4 sm:p-5 ${theme.card} ${theme.border}`}>
        <h2 className={`text-lg font-black ${theme.main}`}>{activeDay}・目前行程</h2>
        <div className="mt-4 space-y-3">
          {places.map((place) => (
            <article key={place.id} data-testid="demo-place-card" className={`min-w-0 rounded-2xl p-4 ${theme.soft}`}>
              <div className="flex min-w-0 items-start gap-3">
                <time className="shrink-0 rounded-lg bg-blue-600 px-2 py-1 text-xs font-black text-white">{place.time}</time>
                <div className="min-w-0">
                  <h3 className={`break-words font-black ${theme.main}`}>{place.name}</h3>
                  <p className={`mt-1 break-words text-sm ${theme.sub}`}>{place.address}</p>
                  <p className={`mt-2 break-words text-sm leading-6 ${theme.sub}`}>{place.notes}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TicketsPanel({ demo, hidden, theme }) {
  const [openManualId, setOpenManualId] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const handleManualToggle = (ticket) => {
    setOpenManualId((current) => current === ticket.id ? '' : ticket.id);
    setActionMessage('這是示範操作，不會開啟外部 App 或網站。');
  };

  return (
    <section
      id="demo-panel-tickets"
      role="tabpanel"
      aria-labelledby="demo-tab-tickets-control"
      data-testid="demo-tickets"
      hidden={hidden}
      className="space-y-4"
    >
      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-black text-amber-800 dark:text-amber-200">
        票券與附件僅供預覽，不能在示範副本中編輯，也不會上傳或寫入雲端。
      </p>
      <div data-testid="demo-ticket-identity-example" className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm leading-6 text-blue-800 dark:text-blue-200">
        <strong>「我是誰」功能範例：</strong>裝置身分可協助篩選個人票券，但不是權限驗證。
      </div>

      {demo.tickets.map((ticket) => {
        const isManual = ticket.ticketType === 'external-app' && !ticket.appUrl && !ticket.fallbackUrl;
        const isManualOpen = openManualId === ticket.id;
        return (
          <article key={ticket.id} data-testid="demo-ticket-card" className={`min-w-0 rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
            <p className="text-xs font-black text-blue-600 dark:text-blue-300">{getAudienceLabel(ticket)}</p>
            <h2 className={`mt-1 break-words text-lg font-black ${theme.main}`}>{ticket.title}</h2>
            {ticket.appName ? <p className={`mt-2 break-words text-sm ${theme.sub}`}>App：{ticket.appName}</p> : null}
            {ticket.presenterMember ? <p className={`mt-2 text-sm font-bold ${theme.main}`}>主要出示人：{ticket.presenterMember}</p> : null}
            {ticket.orderNumber ? <p className={`mt-2 break-all text-sm ${theme.sub}`}>示範訂單編號：{ticket.orderNumber}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
              {ticket.requiresNetwork ? <span className="rounded-full bg-amber-500/15 px-3 py-2 text-amber-700 dark:text-amber-300">需要網路</span> : null}
              {ticket.requiresLogin ? <span className="rounded-full bg-violet-500/15 px-3 py-2 text-violet-700 dark:text-violet-300">需要登入</span> : null}
              {ticket.dynamicCode ? <span className="rounded-full bg-rose-500/15 px-3 py-2 text-rose-700 dark:text-rose-300">動態條碼</span> : null}
            </div>

            {isManual ? (
              <div className="mt-4">
                <button
                  type="button"
                  data-testid="demo-ticket-manual-toggle"
                  aria-expanded={isManualOpen}
                  onClick={() => handleManualToggle(ticket)}
                  className="min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
                >
                  {isManualOpen ? '收合示範開啟方式' : '查看示範開啟方式'}
                </button>
                {isManualOpen ? (
                  <p className={`mt-3 break-words rounded-xl p-3 text-sm leading-6 ${theme.soft} ${theme.main}`}>{ticket.instructions || '這是示範資料，請勿當作實際票券使用。'}</p>
                ) : null}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setActionMessage('這是示範操作，不會開啟外部 App 或網站。')}
                className="mt-4 min-h-11 w-full rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
              >
                示範開啟票券
              </button>
            )}
          </article>
        );
      })}

      <p role="status" aria-live="polite" className={`min-h-6 text-center text-sm font-bold ${theme.sub}`}>{actionMessage}</p>
    </section>
  );
}

function ExpensesPanel({ demo, hidden, theme }) {
  const total = demo.expenses.reduce((sum, expense) => sum + (Number(expense.cost) || 0), 0);
  const categoryTotals = demo.expenses.reduce((totals, expense) => ({
    ...totals,
    [expense.category]: (totals[expense.category] || 0) + (Number(expense.cost) || 0),
  }), {});
  const balances = calculateBalances(demo.expenses, demo.meta.members);
  const receiver = demo.meta.members.find((member) => balances[member] > 0);

  return (
    <section
      id="demo-panel-expenses"
      role="tabpanel"
      aria-labelledby="demo-tab-expenses-control"
      data-testid="demo-expenses"
      hidden={hidden}
      className="space-y-4"
    >
      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-black text-amber-800 dark:text-amber-200">
        費用與結算僅供預覽，不能在示範副本中編輯，也不會寫入雲端。
      </p>
      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-black text-amber-800 dark:text-amber-200">以下金額為示範資料。</p>
      <div data-testid="demo-expense-summary" className={`rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
        <p className={`text-sm font-bold ${theme.sub}`}>總支出</p>
        <p className={`mt-1 text-3xl font-black ${theme.main}`}>{formatMoney(total)}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(categoryTotals).map(([category, amount]) => (
            <div key={category} className={`min-w-0 rounded-xl p-3 ${theme.soft}`}>
              <p className={`break-words text-xs font-bold ${theme.sub}`}>{EXPENSE_CATEGORY_LABELS[category] || '其他'}</p>
              <p className={`mt-1 break-words font-black ${theme.main}`}>{formatMoney(amount)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {demo.expenses.map((expense) => (
          <article key={expense.id} data-testid="demo-expense-card" className={`min-w-0 rounded-2xl border p-4 ${theme.card} ${theme.border}`}>
            <h3 className={`break-words font-black ${theme.main}`}>{expense.item}</h3>
            <p className={`mt-1 text-sm ${theme.sub}`}>{formatMoney(expense.cost)}・付款人：{expense.payer}</p>
            <p className={`mt-2 break-words text-xs leading-5 ${theme.sub}`}>分帳：{Object.entries(expense.split).filter(([, amount]) => amount > 0).map(([member, amount]) => `${member} ${formatMoney(amount)}`).join('、')}</p>
          </article>
        ))}
      </div>

      <div data-testid="demo-settlement-summary" className={`rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
        <h2 className={`font-black ${theme.main}`}>簡化結算結果（示範）</h2>
        <ul className={`mt-3 space-y-2 text-sm ${theme.sub}`}>
          {demo.meta.members.filter((member) => balances[member] < 0).map((member) => (
            <li key={member}>{member} → {receiver}：{formatMoney(Math.abs(balances[member]))}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ChecklistPanel({
  demo,
  hidden,
  theme,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
}) {
  const completed = demo.checklist.filter((item) => item.completed).length;
  const sections = [
    { id: 'packing', title: '行李', items: demo.checklist.filter((item) => PACKING_CATEGORIES.has(item.category)) },
    { id: 'todo', title: '待辦', items: demo.checklist.filter((item) => !PACKING_CATEGORIES.has(item.category)) },
  ];

  return (
    <section
      id="demo-panel-checklist"
      role="tabpanel"
      aria-labelledby="demo-tab-checklist-control"
      data-testid="demo-checklist"
      hidden={hidden}
      className="space-y-4"
    >
      <EditableChecklistControls
        demo={demo}
        theme={theme}
        onAddChecklistItem={onAddChecklistItem}
        onUpdateChecklistItem={onUpdateChecklistItem}
        onDeleteChecklistItem={onDeleteChecklistItem}
      />
      <div data-testid="demo-checklist-progress" className={`rounded-2xl border p-4 ${theme.card} ${theme.border}`}>
        <p className={`font-black ${theme.main}`}>完成度：{completed}/{demo.checklist.length}</p>
        <p className={`mt-1 text-sm ${theme.sub}`}>可在上方編輯；所有變更只屬於本機示範副本。</p>
      </div>
      {sections.map((section) => (
        <div key={section.id} data-testid="demo-checklist-section" className={`rounded-3xl border p-5 ${theme.card} ${theme.border}`}>
          <h2 className={`text-lg font-black ${theme.main}`}>{section.title}</h2>
          <div className="mt-3 space-y-2">
            {section.items.map((item) => (
              <label key={item.id} data-testid="demo-checklist-item" className={`flex min-w-0 items-start gap-3 rounded-xl p-3 ${theme.soft}`}>
                <span aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-center">{item.completed ? '✓' : '○'}</span>
                <span className="min-w-0">
                  <span className={`block break-words font-bold ${theme.main}`}>{item.text}</span>
                  <span className={`mt-1 block break-words text-xs ${theme.sub}`}>{item.scope === 'shared' ? `共同項目・負責：${item.assignee}` : `個人項目・${item.owner}`}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function DemoTripPreview({
  demo,
  t,
  initialTab = 'overview',
  onBack,
  onCreateTrip,
  onCloneDemo,
  onAddPlace,
  onUpdatePlace,
  onDeletePlace,
  onMovePlace,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onResetDemo,
  persistence = 'localStorage',
  saveError = '',
  isSaving = false,
  createActionLabel = '建立我的第一個旅程',
  showCloneAction = true,
}) {
  const [activeTab, setActiveTab] = useState(() => normalizeInitialTab(initialTab));
  const [showResetConfirmation, setShowResetConfirmation] = useState(false);
  const canShowCloneAction = showCloneAction === true && typeof onCloneDemo === 'function';
  const theme = useMemo(() => ({
    page: t?.pageBg || 'bg-slate-50 dark:bg-slate-950',
    card: t?.cardBg || 'bg-white dark:bg-slate-900',
    soft: t?.itemBg || 'bg-slate-100 dark:bg-slate-800',
    border: t?.cardBorder || 'border-slate-200 dark:border-slate-700',
    main: t?.mainText || 'text-slate-950 dark:text-slate-50',
    sub: t?.subText || 'text-slate-600 dark:text-slate-300',
  }), [t]);

  return (
    <div data-testid="demo-trip-preview" className={`min-h-dvh w-full max-w-full overflow-x-hidden overflow-y-auto ${theme.page}`}>
      <header className={`sticky top-0 z-20 border-b px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-sm ${theme.card} ${theme.border}`}>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          <div data-testid="demo-mode-banner" className="rounded-2xl border border-blue-500/30 bg-blue-500/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">示範模式</span>
              <span className="rounded-full bg-emerald-700 px-3 py-1 text-xs font-black text-white">本機可編輯副本</span>
              <strong className={`break-words ${theme.main}`}>範例資料・不會同步</strong>
            </div>
            <p className={`mt-2 break-words text-sm leading-6 ${theme.sub}`}>這是內建範例，不會同步到雲端，也不會修改你的旅程。</p>
          </div>
          <div
            data-testid="demo-sandbox-status"
            aria-live="polite"
            className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 ${theme.card} ${theme.border}`}
          >
            <div>
              <p className={`font-black ${theme.main}`}>本機可編輯示範副本</p>
              <p className={`text-sm ${saveError ? 'text-rose-700 dark:text-rose-300' : theme.sub}`}>
                {saveError || (persistence === 'memory'
                  ? '記憶體模式：重新整理後不會保留，目前變更不會寫入雲端。'
                  : isSaving ? '正在保存到本機裝置…' : '變更只保存在這個瀏覽器，不會寫入 Firebase。')}
              </p>
            </div>
            <button
              type="button"
              data-testid="demo-reset-button"
              onClick={() => setShowResetConfirmation(true)}
              className="min-h-11 rounded-xl border border-rose-300 px-4 text-sm font-black text-rose-700 dark:border-rose-700 dark:text-rose-300"
            >
              重設示範資料
            </button>
          </div>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className={`text-xs font-bold ${theme.sub}`}>本機內建・可編輯 Sandbox</p>
              <h1 data-testid="demo-trip-title" className={`break-words text-xl font-black sm:text-2xl ${theme.main}`}>{demo.meta.title}</h1>
            </div>
            <button type="button" data-testid="demo-back-button" onClick={() => onBack?.()} className={`min-h-11 rounded-xl border px-4 text-sm font-black ${theme.card} ${theme.border} ${theme.main}`}>返回首頁</button>
          </div>
        </div>
      </header>

      {showResetConfirmation ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="demo-reset-title"
          data-testid="demo-reset-confirmation"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
        >
          <section className={`w-full max-w-md rounded-3xl border p-5 shadow-2xl ${theme.card} ${theme.border}`}>
            <h2 id="demo-reset-title" className={`text-xl font-black ${theme.main}`}>重設示範資料？</h2>
            <p className={`mt-3 text-sm leading-6 ${theme.sub}`}>
              這只會清除本裝置的示範副本，並從最新版範本重建；不會影響真正旅程、myTrips 或離線快取。
            </p>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                data-testid="demo-reset-cancel"
                onClick={() => setShowResetConfirmation(false)}
                className={`min-h-11 rounded-xl border px-4 font-black ${theme.border} ${theme.main}`}
              >
                取消
              </button>
              <button
                type="button"
                data-testid="demo-reset-confirm"
                onClick={() => {
                  setShowResetConfirmation(false);
                  onResetDemo?.();
                }}
                className="min-h-11 rounded-xl bg-rose-600 px-4 font-black text-white"
              >
                確認重設
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-4 py-5">
        <div role="tablist" aria-label="示範旅程內容" className="mb-5 flex max-w-full gap-2 overflow-x-auto pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              id={`demo-tab-${tab.id}-control`}
              type="button"
              role="tab"
              data-testid={`demo-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`demo-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-11 shrink-0 rounded-xl px-5 text-sm font-black ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : `${theme.card} ${theme.main}`}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <OverviewPanel demo={demo} hidden={activeTab !== 'overview'} theme={theme} />
        <ItineraryPanel
          demo={demo}
          hidden={activeTab !== 'itinerary'}
          theme={theme}
          onAddPlace={onAddPlace}
          onUpdatePlace={onUpdatePlace}
          onDeletePlace={onDeletePlace}
          onMovePlace={onMovePlace}
        />
        <TicketsPanel demo={demo} hidden={activeTab !== 'tickets'} theme={theme} />
        <ExpensesPanel demo={demo} hidden={activeTab !== 'expenses'} theme={theme} />
        <ChecklistPanel
          demo={demo}
          hidden={activeTab !== 'checklist'}
          theme={theme}
          onAddChecklistItem={onAddChecklistItem}
          onUpdateChecklistItem={onUpdateChecklistItem}
          onDeleteChecklistItem={onDeleteChecklistItem}
        />
      </main>

      <footer className={`border-t px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 ${theme.card} ${theme.border}`}>
        <div className={`mx-auto grid w-full max-w-6xl gap-3 ${canShowCloneAction ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
          <button type="button" data-testid="demo-create-trip-button" onClick={() => onCreateTrip?.()} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white shadow-md shadow-blue-500/20">{createActionLabel}</button>
          {canShowCloneAction ? (
            <button type="button" data-testid="demo-clone-trip-button" onClick={() => onCloneDemo(demo)} className="min-h-11 rounded-xl bg-emerald-600 px-4 text-sm font-black text-white shadow-md shadow-emerald-500/20">複製這份範例開始修改</button>
          ) : null}
          <button type="button" onClick={() => onBack?.()} className={`min-h-11 rounded-xl border px-4 text-sm font-black ${theme.card} ${theme.border} ${theme.main}`}>返回首頁</button>
        </div>
        <p className={`mx-auto mt-3 max-w-6xl text-center text-xs leading-5 ${theme.sub}`}>只有在你明確選擇後才會呼叫{canShowCloneAction ? '建立或複製' : '建立'} callback；本 Preview 不會自行儲存。</p>
      </footer>
    </div>
  );
}

export default DemoTripPreview;
