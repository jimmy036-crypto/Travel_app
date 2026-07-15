import React from 'react';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const textValue = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const finiteNumber = (value) => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0);
const countValue = (value) => Math.floor(finiteNumber(value));

function normalizeItem(item, index) {
  const safeItem = isObject(item) ? item : {};
  return {
    id: textValue(safeItem.id, `item-${index}`),
    name: textValue(safeItem.name),
    time: textValue(safeItem.time),
    address: textValue(safeItem.address),
    note: textValue(safeItem.note),
    category: textValue(safeItem.category, '景點'),
  };
}

function normalizeDay(day, index) {
  const safeDay = isObject(day) ? day : {};
  const items = Array.isArray(safeDay.items)
    ? safeDay.items.map(normalizeItem)
    : [];

  return {
    id: textValue(safeDay.id, `day-${index}`),
    label: textValue(safeDay.label, `Day ${index + 1}`),
    items,
  };
}

export function OfflineTripPreview({ summary, onBack, onClearCache, onOpenOnline, isOnline }) {
  const safeSummary = isObject(summary) ? summary : {};
  const safeMeta = isObject(safeSummary.meta) ? safeSummary.meta : {};
  const safeSummaryStats = isObject(safeSummary.summary) ? safeSummary.summary : {};
  const safeDays = Array.isArray(safeSummary.days)
    ? safeSummary.days.map(normalizeDay)
    : [];
  const safeMembers = Array.isArray(safeMeta.members)
    ? safeMeta.members.filter(member => typeof member === 'string' && member.trim())
    : [];

  const cachedAt = safeSummary.cachedAt;
  const formattedTime = typeof cachedAt === 'number' && Number.isFinite(cachedAt) && cachedAt > 0
    ? new Date(cachedAt).toLocaleString(undefined, {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '快取時間未知';

  const expenseTotal = finiteNumber(safeSummaryStats.expenseTotal);
  const expenseCount = countValue(safeSummaryStats.expenseCount);
  const checklistCompleted = countValue(safeSummaryStats.checklistCompleted);
  const checklistTotal = countValue(safeSummaryStats.checklistTotal);
  const ticketCount = countValue(safeSummaryStats.ticketCount);

  return (
    <main
      className="fixed inset-0 z-50 overflow-y-auto bg-gray-50 pb-[calc(7rem+env(safe-area-inset-bottom))]"
      data-testid="offline-trip-preview"
      aria-labelledby="offline-preview-title"
    >
      <div className="mx-auto min-h-screen max-w-md bg-white shadow-lg">
        <header className="sticky top-0 z-10 border-b border-yellow-200 bg-yellow-100 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-yellow-800 font-bold text-lg" data-testid="offline-preview-readonly-status">
                離線唯讀預覽
              </p>
              <p className="mt-1 text-sm text-yellow-700" data-testid="offline-preview-cache-time">
                快取時間：{formattedTime}
              </p>
              <p className="mt-1 text-xs text-yellow-700" data-testid="offline-preview-stale-note">
                這是此裝置保存的離線資料，可能不是雲端最新內容。
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 rounded-lg border border-yellow-300 bg-white px-3 py-1 text-sm font-medium hover:bg-yellow-50"
              data-testid="offline-preview-back"
            >
              返回
            </button>
          </div>
        </header>

        {isOnline ? (
          <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50 p-4">
            <span className="text-sm font-medium text-blue-800">已恢復連線</span>
            <button
              type="button"
              onClick={onOpenOnline}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-blue-700"
              data-testid="offline-preview-open-online"
            >
              開啟最新旅程
            </button>
          </div>
        ) : null}

        <section className="border-b p-6" style={{ borderTop: `4px solid ${textValue(safeMeta.themeColor, '#ccc')}` }}>
          <h1 id="offline-preview-title" data-testid="offline-preview-title" className="mb-2 text-3xl font-black">
            {textValue(safeMeta.title, '未命名旅程')}
          </h1>
          <p className="mb-4 text-lg text-gray-600">{textValue(safeMeta.destination, '未設定目的地')}</p>
          <div className="space-y-1 text-sm text-gray-500">
            <p>{textValue(safeMeta.startDate)} ~ {textValue(safeMeta.endDate)}</p>
            <p>{safeMembers.length > 0 ? safeMembers.join(', ') : '自己'}</p>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 border-b bg-gray-50 p-6" aria-label="旅程摘要">
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs text-gray-500">支出總額（{expenseCount} 筆）</p>
            <p className="text-xl font-bold text-red-600">NT$ {expenseTotal.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs text-gray-500">清單完成</p>
            <p className="text-xl font-bold text-green-600">{checklistCompleted} / {checklistTotal}</p>
          </div>
          <div className="col-span-2 rounded-lg border bg-white p-4 shadow-sm">
            <p className="mb-1 text-xs text-gray-500">票券</p>
            <p className="text-xl font-bold text-blue-600">{ticketCount} 張</p>
          </div>
        </section>

        <section className="p-6">
          <h2 className="mb-6 text-xl font-bold">每日行程</h2>
          {safeDays.length === 0 ? (
            <p className="rounded-lg bg-gray-50 p-4 text-sm italic text-gray-500">尚無行程資料</p>
          ) : (
            safeDays.map(day => (
              <section key={day.id} className="mb-8" data-testid="offline-preview-day" aria-label={day.label}>
                <h3 className="mb-4 text-lg font-bold text-gray-800">{day.label}</h3>
                {day.items.length === 0 ? (
                  <p className="rounded-lg bg-gray-50 p-4 text-sm italic text-gray-500">此日尚無景點</p>
                ) : (
                  <div className="space-y-4">
                    {day.items.map(item => (
                      <article key={item.id} className="rounded-lg border bg-white p-4 shadow-sm" data-testid="offline-preview-place">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <span className="rounded bg-blue-50 px-2 py-1 text-sm font-bold text-blue-600">{item.time || '未定時間'}</span>
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{item.category}</span>
                        </div>
                        <h4 className="mb-1 text-lg font-bold">{item.name}</h4>
                        {item.address ? <p className="mb-2 text-xs text-gray-500">{item.address}</p> : null}
                        {item.note ? <p className="mt-2 rounded bg-yellow-50 p-2 text-sm text-gray-700">{item.note}</p> : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </section>

        <section className="mt-8 border-t p-6 text-center">
          <button
            type="button"
            onClick={onClearCache}
            className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700"
            data-testid="offline-preview-clear-cache"
          >
            清除此裝置的離線資料
          </button>
        </section>
      </div>
    </main>
  );
}
