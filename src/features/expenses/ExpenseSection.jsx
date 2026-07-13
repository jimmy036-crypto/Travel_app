import React, { useState, useMemo } from 'react';
import { CATEGORIES } from '../../constants';
import { getDayDisplay } from '../../helpers';
import { calculateCategoryStats, calculateMemberCategoryStats } from './expenseCalculations';

const ExpensePieCard = ({ title, subtitle, total, stats, t }) => {
  const safeTotal = Number(total) || 0;
  const safeStats = Array.isArray(stats) ? stats : [];

  return (
    <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h3 className={`text-sm font-bold flex items-center gap-2 ${t.mainText}`}>{title}</h3>
          {subtitle ? <p className={`text-[10px] mt-1 ${t.subText}`}>{subtitle}</p> : null}
        </div>
        <span className={`text-[10px] font-mono font-bold whitespace-nowrap ${t.subText}`}>
          NT$ {Math.round(safeTotal).toLocaleString()}
        </span>
      </div>

      {safeTotal > 0 && safeStats.length > 0 ? (
        <div className="flex flex-col items-center">
          <div className="relative w-44 h-44 mb-7">
            <svg viewBox="0 0 40 40" className="w-full h-full -rotate-90 drop-shadow-xl" role="img" aria-label={`${title}分類圓餅圖`}>
              <circle
                cx="20"
                cy="20"
                r="15.5"
                fill="transparent"
                strokeWidth="7"
                className="text-slate-500/15 stroke-current"
              />
              {(() => {
                let offset = 0;
                return safeStats.map(category => {
                  const percent = (Number(category.amount) / safeTotal) * 100;
                  if (!Number.isFinite(percent) || percent <= 0) return null;
                  const dashOffset = -offset;
                  offset += percent;

                  return (
                    <circle
                      key={`pie-${title}-${category.id}`}
                      cx="20"
                      cy="20"
                      r="15.5"
                      pathLength="100"
                      fill="transparent"
                      strokeWidth="7"
                      strokeDasharray={`${percent} ${100 - percent}`}
                      strokeDashoffset={dashOffset}
                      strokeLinecap="butt"
                      className={`${category.text || category.color.replace('bg-', 'text-')} stroke-current transition-all duration-700 ease-out`}
                    />
                  );
                });
              })()}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`text-[10px] font-bold ${t.subText}`}>總計</span>
              <span className={`text-base font-black font-mono ${t.mainText}`}>
                NT${Math.round(safeTotal).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
            {safeStats.map(category => {
              const percent = ((Number(category.amount) / safeTotal) * 100).toFixed(1);
              return (
                <div key={`legend-${title}-${category.id}`} className={`p-2.5 rounded-xl border ${t.itemBg} ${t.cardBorder} flex items-center gap-3`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-inner ${category.color} text-white`}>
                    {category.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[10px] font-bold truncate ${t.subText}`}>{category.label} {percent}%</p>
                    <p className={`text-xs font-mono font-black truncate ${category.text || category.color.replace('bg-', 'text-')}`}>
                      NT${Math.round(Number(category.amount) || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="py-10 text-center opacity-50">
          <span className="text-4xl">📊</span>
          <p className={`text-xs font-bold mt-3 ${t.mainText}`}>尚無花費資料</p>
        </div>
      )}
    </div>
  );
};

export const ExpenseSection = ({
  t,
  isActive,
  expenses = [],
  settlements = [],
  membersList = [],
  meta = {},
  expenseStats,
  onCreateExpense,
  onEditExpense,
  onOpenSettlement,
  onDeleteSettlement,
  onUpdateBudget,
  preTripId = "PRE_TRIP",
}) => {
  const [expenseView, setExpenseView] = useState('list');
  const [expenseChartOwner, setExpenseChartOwner] = useState('ALL');

  const categoryStats = useMemo(
    () => calculateCategoryStats(expenses, CATEGORIES),
    [expenses]
  );

  const memberCategoryStats = useMemo(
    () => calculateMemberCategoryStats(expenses, membersList, CATEGORIES),
    [expenses, membersList]
  );

  const safeExpenseChartOwner =
    expenseChartOwner === 'ALL' || membersList.includes(expenseChartOwner)
      ? expenseChartOwner
      : 'ALL';

  const activeExpenseChart = safeExpenseChartOwner === 'ALL'
    ? {
        title: '📊 全團花費圓餅圖分析',
        subtitle: '依所有記帳項目的完整金額統計',
        total: expenseStats?.totalExpense || 0,
        categories: categoryStats,
      }
    : {
        title: `👤 ${safeExpenseChartOwner} 的個人花費`,
        subtitle: '依每筆帳款實際分攤到此成員的金額統計',
        total: memberCategoryStats[safeExpenseChartOwner]?.total || 0,
        categories: memberCategoryStats[safeExpenseChartOwner]?.categories || [],
      };

  return (
    <div
      data-testid="expense-panel"
      className={`scrollbar-hide flex-1 flex-col overflow-y-auto overscroll-y-contain backdrop-blur-xl ${t.sidebarBg} ${isActive ? 'flex' : 'hidden'}`}
    >
      <div className={`p-6 border-b shrink-0 shadow-sm ${t.headerBg} ${t.cardBorder}`}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className={`text-xs font-bold uppercase tracking-widest ${t.subText}`}>全團花費總計</p>
            <h2
              data-testid="expense-total"
              className={`text-3xl font-black mt-1 ${t.mainText}`}
            >
              NT$ {(expenseStats?.totalExpense || 0).toLocaleString()}
            </h2>
          </div>
          <button
            type="button"
            data-testid="add-expense-button"
            onClick={onCreateExpense}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-lg shadow-emerald-500/30 active:scale-95 transition-all"
          >
            ➕ 新增記帳
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${t.subText}`}>個人預算與消費額度</p>
          {membersList.map(m => {
            const pBudget = meta.memberBudgets?.[m] ?? 10000;
            const pSpent = expenseStats?.personalSpent?.[m] || 0;
            const pOver = pSpent > pBudget;
            const pPercent = pBudget > 0 ? Math.min((pSpent / pBudget) * 100, 100) : 100;
            return (
              <div
                key={`budget-${m}`}
                data-testid="member-budget-row"
                data-member={String(m)}
                className={`p-3 rounded-xl border bg-black/5 dark:bg-white/5 ${t.cardBorder}`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className={`text-xs font-bold ${t.mainText}`}>{String(m)}</span>
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="member-spent"
                      data-member={String(m)}
                      className={`text-[10px] font-bold ${pOver ? 'text-red-500' : 'text-emerald-500'}`}
                    >
                      已花 NT${Math.round(pSpent).toLocaleString()}
                    </span>
                    <span className={`text-[10px] opacity-40 ${t.mainText}`}>/</span>
                    <input type="number" value={String(pBudget)} onChange={e => onUpdateBudget(m, e.target.value)} className={`bg-transparent outline-none w-14 text-right text-[10px] font-bold border-b border-dashed focus:border-blue-500 ${t.mainText}`} title="點擊修改預算" />
                  </div>
                </div>
                <div className={`flex w-full h-1.5 rounded-full overflow-hidden border ${t.cardBg} ${t.cardBorder}`}>
                  <div style={{ width: `${pPercent}%` }} className={`h-full transition-all duration-500 ${pOver ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={`flex p-1.5 rounded-xl border mt-6 shadow-inner ${t.cardBg} ${t.cardBorder}`}>
          <button
            type="button"
            data-testid="expense-list-view-button"
            onClick={() => setExpenseView('list')}
            className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${expenseView === 'list' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}
          >
            📜 歷史明細
          </button>
          <button
            type="button"
            data-testid="expense-settlement-view-button"
            onClick={() => setExpenseView('settle')}
            className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${expenseView === 'settle' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}
          >
            ⚖️ 結算表
          </button>
          <button
            type="button"
            data-testid="expense-chart-view-button"
            onClick={() => setExpenseView('chart')}
            className={`flex-1 py-2 text-[10px] md:text-xs font-bold rounded-lg transition-all ${expenseView === 'chart' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}
          >
            📊 圓餅圖
          </button>
        </div>
      </div>

      <div className="p-4 pb-24">
        {expenseView === 'chart' ? (
          <div className="space-y-6 animate-in fade-in">
            <div className={`rounded-2xl border p-2 ${t.cardBg} ${t.cardBorder}`}>
              <p className={`px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest ${t.subText}`}>
                選擇統計對象
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  onClick={() => setExpenseChartOwner('ALL')}
                  className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                    safeExpenseChartOwner === 'ALL'
                      ? 'bg-slate-600 border-slate-600 text-white shadow-md'
                      : `${t.itemBg} ${t.cardBorder} ${t.mainText} hover:border-slate-400`
                  }`}
                >
                  👥 全團
                </button>
                {membersList.map(member => (
                  <button
                    key={`chart-owner-${member}`}
                    onClick={() => setExpenseChartOwner(String(member))}
                    className={`shrink-0 px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                      safeExpenseChartOwner === String(member)
                        ? 'bg-blue-600 border-blue-600 text-white shadow-md'
                        : `${t.itemBg} ${t.cardBorder} ${t.mainText} hover:border-blue-400`
                    }`}
                  >
                    👤 {String(member)}
                  </button>
                ))}
              </div>
            </div>

            <ExpensePieCard
              title={activeExpenseChart.title}
              subtitle={activeExpenseChart.subtitle}
              total={activeExpenseChart.total}
              stats={activeExpenseChart.categories}
              t={t}
            />

            <p className={`text-[10px] leading-relaxed px-2 ${t.subText}`}>
              個人圓餅圖依「分帳金額」計算，而不是依「代墊人」計算；因此共同花費會按照每位成員實際分攤的金額歸類。
            </p>
          </div>
        ) : expenseView === 'list' ? (
          <div className="space-y-6">
            {(/** @type {any[]} */ (expenseStats?.groupedExpenses || [])).map(({ day, items }) => {
              if (!Array.isArray(items) || items.length === 0) return null;
              const { title, dateStr } = day === preTripId ? { title: "行前支出", dateStr: "出發前共同採購與預付款" } : getDayDisplay(day, meta.startDate);
              return (
                <div key={String(day)} className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className={`font-bold ${t.mainText}`}>{String(title)} <span className={`text-xs font-normal ml-1 ${t.subText}`}>{String(dateStr)}</span></h3>
                    <span className="text-xs text-emerald-500 font-mono font-bold">NT${items.reduce((a,b)=>a+(Number(b.cost)||0),0).toLocaleString()}</span>
                  </div>
                  <div className="space-y-2.5">
                    {(/** @type {any[]} */ (items)).map(e => {
                      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES[5];
                      return (
                        <button
                          type="button"
                          key={String(e.id)}
                          data-testid="expense-record"
                          data-expense-id={String(e.id)}
                          onClick={() => onEditExpense(e)}
                          className={`w-full flex justify-between items-center gap-3 p-3 rounded-2xl border transition-all text-left ${t.itemBg} ${t.cardBorder} hover:border-emerald-500/50 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]`}
                          aria-label={`編輯帳目 ${String(e.item)}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-10 h-10 ${cat.color} text-white rounded-full flex items-center justify-center text-sm shadow-inner shrink-0`}>{cat.icon}</span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <p
                                  data-testid="expense-record-title"
                                  className={`text-sm font-bold truncate ${t.mainText}`}
                                >
                                  {String(e.item)}
                                </p>
                                {Number(e.updatedAt) > Number(e.createdAt || e.updatedAt) ? (
                                  <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-bold">已編輯</span>
                                ) : null}
                              </div>
                              <p className={`text-[10px] font-bold mt-0.5 ${t.subText}`}>
                                {cat.label} • <span className="text-blue-500">{String(e.payer)}</span> 先付 • {Object.values(e.split || {}).filter(amount => Number(amount) > 0).length || membersList.length} 人分攤
                              </p>
                              {e.note ? <p className={`text-[10px] mt-1 truncate ${t.subText}`}>📝 {String(e.note)}</p> : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex flex-col items-end">
                              <span
                                data-testid="expense-record-cost"
                                className={`font-mono font-bold ${t.mainText}`}
                              >
                                NT${(Number(e.cost)||0).toLocaleString()}
                              </span>
                              {e.currency && e.currency !== 'TWD' ? <span className={`text-[9px] font-mono opacity-60 ${t.subText}`}>{e.currency} {(Number(e.localCost) || 0).toLocaleString()}</span> : null}
                            </div>
                            <span className={`text-[11px] font-bold ${t.subText}`}>✏️ <span className="hidden sm:inline">編輯</span></span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {(!Array.isArray(expenses) || expenses.length === 0) ? <p className={`text-center mt-10 font-bold ${t.subText}`}>尚無記帳紀錄</p> : null}
          </div>
        ) : (
          <div className="space-y-6">
            <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className={`text-sm font-bold flex items-center gap-2 ${t.mainText}`}>🧳 行前結算</h3>
                  <p className={`text-[10px] mt-1 ${t.subText}`}>結算只記錄成員間的實際轉帳，不會刪除支出，因此總額、預算和圖表仍保留完整資料。</p>
                </div>
                <button type="button" onClick={onOpenSettlement} disabled={!expenseStats?.preTripTransfers?.length} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-md active:scale-95">
                  💸 記錄行前結算
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><p className={`text-[9px] font-bold ${t.subText}`}>行前支出</p><p className={`font-mono font-black mt-1 ${t.mainText}`}>NT${Math.round(expenseStats?.preTripTotal || 0).toLocaleString()}</p></div>
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><p className={`text-[9px] font-bold ${t.subText}`}>已記錄轉帳</p><p className="font-mono font-black mt-1 text-indigo-500">NT${Math.round(expenseStats?.preTripSettlementTotal || 0).toLocaleString()}</p></div>
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><p className={`text-[9px] font-bold ${t.subText}`}>行前剩餘應收</p><p className="font-mono font-black mt-1 text-emerald-500">NT${Math.round(expenseStats?.preTripSettlementSummary?.receivableTotal || 0).toLocaleString()}</p></div>
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><p className={`text-[9px] font-bold ${t.subText}`}>行前建議轉帳筆數</p><p className={`font-mono font-black mt-1 ${t.mainText}`}>{expenseStats?.preTripSettlementSummary?.transferCount || 0} 筆</p></div>
              </div>
              {expenseStats?.preTripTransfers?.length > 0 ? (
                <div className="space-y-2">
                  {expenseStats.preTripTransfers.map((item, index) => <div key={`pretrip-${index}`} className={`flex justify-between items-center p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><span className={`text-xs ${t.mainText}`}><b className="text-red-500">{item.from}</b> → <b className="text-emerald-500">{item.to}</b></span><b className={`font-mono ${t.mainText}`}>NT${Math.round(item.amount).toLocaleString()}</b></div>)}
                </div>
              ) : <p className={`text-center py-3 text-xs font-bold ${t.subText}`}>{expenseStats?.preTripTotal > 0 ? "行前款項已結清 🎉" : "尚未新增行前支出"}</p>}
              {settlements.filter(item => item.scope === "pretrip").length > 0 ? <details className="mt-4"><summary className={`cursor-pointer text-xs font-bold ${t.subText}`}>查看結算紀錄（{settlements.filter(item => item.scope === "pretrip").length}）</summary><div className="space-y-2 mt-3">{settlements.filter(item => item.scope === "pretrip").slice().sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map(item => <div key={item.id} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}><div><p className={`text-xs font-bold ${t.mainText}`}>{item.from} → {item.to} NT${Number(item.amount||0).toLocaleString()}</p><p className={`text-[9px] mt-1 ${t.subText}`}>{item.note || "行前結算"} · {new Date(item.createdAt).toLocaleDateString("zh-TW")}</p></div><button type="button" onClick={() => onDeleteSettlement(item.id)} className="text-red-500 text-xs font-bold">刪除</button></div>)}</div></details> : null}
            </div>

            <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
              <h3 className={`text-sm font-bold mb-4 flex items-center gap-2 ${t.mainText}`}>👤 各自收支總覽</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                  <p className={`text-[9px] font-bold ${t.subText}`}>全程應收</p>
                  <p className="font-mono font-black mt-1 text-emerald-500">NT${Math.round(expenseStats?.settlementSummary?.receivableTotal || 0).toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                  <p className={`text-[9px] font-bold ${t.subText}`}>全程應付</p>
                  <p className="font-mono font-black mt-1 text-red-500">NT${Math.round(expenseStats?.settlementSummary?.payableTotal || 0).toLocaleString()}</p>
                </div>
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                  <p className={`text-[9px] font-bold ${t.subText}`}>最少轉帳筆數</p>
                  <p className={`font-mono font-black mt-1 ${t.mainText}`}>{expenseStats?.settlementSummary?.transferCount || 0} 筆</p>
                </div>
                <div className={`p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                  <p className={`text-[9px] font-bold ${t.subText}`}>已結清人數</p>
                  <p className={`font-mono font-black mt-1 ${t.mainText}`}>{expenseStats?.settlementSummary?.balancedMemberCount || 0} 人</p>
                </div>
              </div>
              <div className="space-y-3">
                {Object.entries(expenseStats?.balances || {}).map(([member, balance]) => {
                  const isPositive = balance > 0.01;
                  const isNegative = balance < -0.01;
                  return (
                    <div key={String(member)} className={`flex justify-between items-center p-3 rounded-xl border ${t.itemBg} ${t.cardBorder}`}>
                      <span className={`font-bold ${t.mainText}`}>{String(member)}</span>
                      {isPositive ? (
                        <span className="text-emerald-500 font-mono font-bold">應收回 +NT${balance.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
                      ) : isNegative ? (
                        <span className="text-red-500 font-mono font-bold">須支付 -NT${Math.abs(balance).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 1})}</span>
                      ) : (
                        <span className={`font-mono font-bold ${t.subText}`}>已結清 $0</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
              <h3 className="text-sm font-bold text-blue-500 mb-4 flex items-center gap-2">🤖 AI 建議轉帳方案</h3>
              {Array.isArray(expenseStats?.transfers) && expenseStats.transfers.length > 0 ? (
                <div className="space-y-3">
                  {(/** @type {any[]} */ (expenseStats.transfers)).map((tItem, idx) => (
                    <div key={`transfer-${idx}`} className={`flex justify-between items-center p-4 rounded-xl border ${t.isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/20 border-blue-500/30'}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-red-500">{String(tItem.from)}</span>
                        <span className={`text-xs ${t.subText}`}>➡️ 轉給 ➡️</span>
                        <span className="font-bold text-emerald-500">{String(tItem.to)}</span>
                      </div>
                      <span className={`font-mono font-black text-lg ${t.mainText}`}>NT${Math.round(Number(tItem.amount)).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={`text-center py-4 font-bold ${t.subText}`}>目前沒有需要結算的款項 🎉</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
