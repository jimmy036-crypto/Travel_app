import React from 'react';

export function OfflineTripPreview({ summary, onBack, onClearCache, onOpenOnline, isOnline }) {
  if (!summary) return null;

  const { meta, days, summary: tripSummary, cachedAt } = summary;
  
  const formattedTime = new Date(cachedAt).toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <div className="fixed inset-0 bg-gray-50 overflow-auto" data-testid="offline-trip-preview">
      <div className="max-w-md mx-auto bg-white min-h-screen shadow-lg pb-24">
        {/* Header */}
        <div className="bg-yellow-100 p-4 sticky top-0 z-10 border-b border-yellow-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-yellow-800 font-bold text-lg flex items-center gap-2" data-testid="offline-preview-readonly-status">
                <span>⚠️</span> 離線唯讀模式
              </h2>
              <p className="text-sm text-yellow-700 mt-1" data-testid="offline-preview-cache-time">
                快取時間：{formattedTime}
              </p>
              <p className="text-xs text-yellow-600 mt-1">資料可能不是最新版本，且無法修改。</p>
            </div>
            <button
              onClick={onBack}
              className="px-3 py-1 bg-white rounded-lg text-sm font-medium border border-yellow-300 hover:bg-yellow-50"
              data-testid="offline-preview-back"
            >
              返回
            </button>
          </div>
        </div>

        {/* Action Bar (when online) */}
        {isOnline && (
          <div className="p-4 bg-blue-50 border-b border-blue-100 flex justify-between items-center">
            <span className="text-sm text-blue-800 font-medium">目前已恢復連線</span>
            <button
              onClick={onOpenOnline}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-700"
              data-testid="offline-preview-open-online"
            >
              開啟最新旅程
            </button>
          </div>
        )}

        {/* Trip Meta */}
        <div className="p-6 border-b" style={{ borderTop: `4px solid ${meta.themeColor || '#ccc'}` }}>
          <h1 className="text-3xl font-black mb-2">{meta.title}</h1>
          <p className="text-lg text-gray-600 mb-4">{meta.destination}</p>
          <div className="text-sm text-gray-500 space-y-1">
            <p>📅 {meta.startDate} ~ {meta.endDate}</p>
            <p>👥 {meta.members.join(', ')}</p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="p-6 border-b bg-gray-50 grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <p className="text-xs text-gray-500 mb-1">總花費 ({tripSummary.expenseCount} 筆)</p>
            <p className="text-xl font-bold text-red-600">${tripSummary.expenseTotal}</p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border">
            <p className="text-xs text-gray-500 mb-1">清單進度</p>
            <p className="text-xl font-bold text-green-600">
              {tripSummary.checklistCompleted} / {tripSummary.checklistTotal}
            </p>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border col-span-2">
            <p className="text-xs text-gray-500 mb-1">票券數量</p>
            <p className="text-xl font-bold text-blue-600">{tripSummary.ticketCount} 張</p>
          </div>
        </div>

        {/* Itinerary */}
        <div className="p-6">
          <h3 className="text-xl font-bold mb-6">行程預覽</h3>
          {days.map(day => (
            <div key={day.id} className="mb-8" data-testid="offline-preview-day">
              <h4 className="font-bold text-lg mb-4 text-gray-800">{day.label}</h4>
              {day.items.length === 0 ? (
                <p className="text-sm text-gray-400 italic bg-gray-50 p-4 rounded-xl">此日尚無景點</p>
              ) : (
                <div className="space-y-4">
                  {day.items.map(item => (
                    <div key={item.id} className="bg-white border rounded-xl p-4 shadow-sm" data-testid="offline-preview-place">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">{item.time || '未定時'}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{item.category}</span>
                      </div>
                      <h5 className="font-bold text-lg mb-1">{item.name}</h5>
                      {item.address && (
                        <p className="text-xs text-gray-500 mb-2">📍 {item.address}</p>
                      )}
                      {item.note && (
                        <p className="text-sm text-gray-700 bg-yellow-50 p-2 rounded mt-2">{item.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Danger Zone */}
        <div className="p-6 border-t mt-8 text-center">
          <button
            onClick={onClearCache}
            className="text-red-500 hover:text-red-700 text-sm font-medium px-4 py-2"
            data-testid="offline-preview-clear-cache"
          >
            清除此裝置快取
          </button>
        </div>
      </div>
    </div>
  );
}
