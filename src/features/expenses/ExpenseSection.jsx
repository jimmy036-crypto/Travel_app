import React, { useState, useMemo } from 'react';
import { CATEGORIES } from '../../constants';
import { getDayDisplay } from '../../helpers';
import { calculateCategoryStats, calculateMemberCategoryStats } from './expenseCalculations';
import { EXPENSE_CURRENCIES, getSuggestedExpenseCurrency } from './expenseDefaults.js';
import { SettlementPanel } from './SettlementPanel.jsx';

const categoryTextClass = (category, t) => category.id === 'entertainment'
  ? (t.isLight ? 'text-rose-700' : 'text-rose-400')
  : (category.text || category.color.replace('bg-', 'text-'));

const ExpensePieCard = ({ title, subtitle, total, stats, t }) => {
  const safeTotal = Number(total) || 0;
  const safeStats = Array.isArray(stats) ? stats : [];

  return (
    <div className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h3 className={`text-sm font-bold flex items-center gap-2 ${t.mainText}`}>{title}</h3>
          {subtitle ? <p className={`text-sm mt-1 ${t.subText}`}>{subtitle}</p> : null}
        </div>
        <span className={`text-xs font-mono font-bold whitespace-nowrap ${t.subText}`}>
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
                      className={`${categoryTextClass(category, t)} stroke-current transition-all duration-700 ease-out`}
                    />
                  );
                });
              })()}
            </svg>

            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className={`text-xs font-bold ${t.subText}`}>總計</span>
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
                    <p className={`text-sm font-bold break-words [overflow-wrap:anywhere] ${t.subText}`}>{category.label} {percent}%</p>
                    <p className={`text-xs font-mono font-black break-all ${categoryTextClass(category, t)}`}>
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
  membersList = [],
  meta = {},
  expenseStats,
  settlementModel,
  onCreateExpense,
  onEditExpense,
  onMarkTransferPaid,
  onCancelTransferPaid,
  settlementMutationId = '',
  onUpdateBudget,
  onUpdateDefaultCurrency,
  preTripId = "PRE_TRIP",
}) => {
  const [expenseView, setExpenseView] = useState('list');
  const [expenseChartOwner, setExpenseChartOwner] = useState('ALL');
  const [budgetExpanded, setBudgetExpanded] = useState(false);
  const [expandedExpenseDays, setExpandedExpenseDays] = useState({});
  const [visibleExpenseCounts, setVisibleExpenseCounts] = useState({});
  const groupedExpenses = expenseStats?.groupedExpenses || [];
  const collapseManyExpenses = expenses.length > 20;
  const latestExpenseDay = [...groupedExpenses].reverse().find(({ items }) => items?.length)?.day;
  const suggestedCurrency = getSuggestedExpenseCurrency(meta);
  const selectedDefaultCurrency = EXPENSE_CURRENCIES.some(({ code }) => code === meta.expenseCurrency)
    ? meta.expenseCurrency : 'AUTO';

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
        title: '📊 全團花費分布',
        subtitle: '依所有記帳項目的完整金額統計',
        total: expenseStats?.totalExpense || 0,
        categories: categoryStats,
      }
    : {
        title: `👤 ${safeExpenseChartOwner} 的個人花費分布`,
        subtitle: '依實際分攤金額計算，不是代墊金額。',
        total: memberCategoryStats[safeExpenseChartOwner]?.total || 0,
        categories: memberCategoryStats[safeExpenseChartOwner]?.categories || [],
      };

  return (
    <div
      data-testid="expense-panel"
      className={`scrollbar-hide flex-1 flex-col overflow-y-auto overscroll-y-contain backdrop-blur-xl ${t.sidebarBg} ${isActive ? 'flex' : 'hidden'}`}
    >
      <div className={`flex flex-col p-6 border-b shrink-0 shadow-sm ${t.headerBg} ${t.cardBorder}`}>
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
            className="min-h-11 rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-700/25 transition-all hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 active:scale-95"
          >
            ➕ 新增記帳
          </button>
        </div>

        <div className={`flex p-1.5 rounded-xl border mt-6 shadow-inner ${t.cardBg} ${t.cardBorder}`}>
          <button
            type="button"
            data-testid="expense-list-view-button"
            onClick={() => setExpenseView('list')}
            aria-pressed={expenseView === 'list'}
            className={`min-h-11 flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:outline-2 focus-visible:outline-blue-500 ${expenseView === 'list' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}
          >
            📜 歷史明細
          </button>
          <button
            type="button"
            data-testid="expense-settlement-view-button"
            onClick={() => setExpenseView('settle')}
            aria-pressed={expenseView === 'settle'}
            className={`min-h-11 flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:outline-2 focus-visible:outline-blue-500 ${expenseView === 'settle' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}
          >
            ⚖️ 結算表
          </button>
          <button
            type="button"
            data-testid="expense-chart-view-button"
            onClick={() => setExpenseView('chart')}
            aria-pressed={expenseView === 'chart'}
            className={`min-h-11 flex-1 py-2 text-xs md:text-sm font-bold rounded-lg transition-all focus-visible:outline-2 focus-visible:outline-blue-500 ${expenseView === 'chart' ? `bg-slate-500 text-white shadow-md` : `hover:opacity-70 ${t.subText}`}`}
          >
            📊 圓餅圖
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <button
            type="button"
            data-testid="budget-toggle"
            aria-expanded={budgetExpanded}
            aria-controls="member-budget-list"
            onClick={() => setBudgetExpanded(value => !value)}
            className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-4 text-left text-sm font-bold focus-visible:outline-2 focus-visible:outline-blue-500 ${t.expenseBlockBg} ${t.cardBorder} ${t.mainText}`}
          >
            <span>個人預算與消費額度</span>
            <span className={`text-xs ${t.subText}`}>{membersList.length} 人 · {budgetExpanded ? '收合' : '查看'}</span>
          </button>
          {budgetExpanded ? <div id="member-budget-list" className="space-y-3">{membersList.map(m => {
            const pBudget = meta.memberBudgets?.[m] ?? 10000;
            const pSpent = expenseStats?.personalSpent?.[m] || 0;
            const pOver = pSpent > pBudget;
            const pPercent = pBudget > 0 ? Math.min((pSpent / pBudget) * 100, 100) : 100;
            return (
              <div
                key={`budget-${m}`}
                data-testid="member-budget-row"
                data-member={String(m)}
                className={`rounded-xl border p-3 ${t.expenseBlockBg} ${t.cardBorder}`}
              >
                <div className="flex justify-between items-center gap-2 mb-2">
                  <span className={`min-w-0 break-words [overflow-wrap:anywhere] text-xs font-bold ${t.mainText}`}>{String(m)}</span>
                  <div className="flex items-center gap-2">
                    <span
                      data-testid="member-spent"
                      data-member={String(m)}
                      className={`text-sm font-bold ${pOver ? 'text-red-500' : 'text-emerald-500'}`}
                    >
                      已花 NT${Math.round(pSpent).toLocaleString()}
                    </span>
                    <span className={`text-xs opacity-40 ${t.mainText}`}>/</span>
                    <input type="number" value={String(pBudget)} onChange={e => onUpdateBudget(m, e.target.value)} aria-label={`${String(m)} 個人預算（新台幣）`} className={`min-h-11 w-24 rounded-lg bg-transparent px-2 text-right text-sm font-bold outline-none border border-dashed focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 ${t.mainText}`} title="點擊修改預算" />
                  </div>
                </div>
                <div className={`flex w-full h-1.5 rounded-full overflow-hidden border ${t.cardBg} ${t.cardBorder}`}>
                  <div style={{ width: `${pPercent}%` }} className={`h-full transition-all duration-500 ${pOver ? 'bg-red-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                </div>
              </div>
            );
          })}</div> : null}
        </div>

        <details className={`mt-2 rounded-xl border ${t.cardBorder}`}>
          <summary className={`flex min-h-11 cursor-pointer items-center px-4 text-sm font-bold focus-visible:outline-2 focus-visible:outline-blue-500 ${t.mainText}`}>
            新帳目預設幣別：{suggestedCurrency}
          </summary>
          <div className="px-4 pb-3">
            <label htmlFor="trip-expense-currency" className={`mb-1 block text-sm ${t.subText}`}>新帳目預設幣別</label>
            <select
              id="trip-expense-currency"
              value={selectedDefaultCurrency}
              onChange={(event) => onUpdateDefaultCurrency?.(event.target.value === 'AUTO' ? '' : event.target.value)}
              style={{ colorScheme: t.isLight ? 'light' : 'dark' }}
              className={`min-h-11 w-full rounded-lg border px-3 text-sm ${t.inputBg} ${t.cardBorder} ${t.mainText}`}
            >
              <option value="AUTO">依目的地（{getSuggestedExpenseCurrency({ destination: meta.destination })}）</option>
              {EXPENSE_CURRENCIES.map(({ code, label }) => <option key={code} value={code}>{label}</option>)}
            </select>
            <p className={`mt-1 text-sm ${t.subText}`}>只影響之後新增的帳目；匯率仍可在每筆記帳中調整。</p>
          </div>
        </details>

      </div>

      <div className="p-4 pb-24">
        {expenseView === 'chart' ? (
          <div className="space-y-6 animate-in fade-in">
            <div className={`rounded-2xl border p-2 ${t.cardBg} ${t.cardBorder}`}>
              <p className={`px-2 pt-1 pb-2 text-xs font-bold uppercase tracking-widest ${t.subText}`}>
                選擇統計對象
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                <button
                  type="button"
                  aria-pressed={safeExpenseChartOwner === 'ALL'}
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
                    type="button"
                    aria-pressed={safeExpenseChartOwner === String(member)}
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
          </div>
        ) : expenseView === 'list' ? (
          <div className="space-y-6">
            {(/** @type {any[]} */ (groupedExpenses)).map(({ day, items }) => {
              if (!Array.isArray(items) || items.length === 0) return null;
              const { title, dateStr } = day === preTripId ? { title: "行前支出", dateStr: "出發前共同採購與預付款" } : getDayDisplay(day, meta.startDate);
              const isOpen = expandedExpenseDays[day] ?? (!collapseManyExpenses || day === latestExpenseDay);
              const visibleCount = visibleExpenseCounts[day] || 10;
              return (
                <details key={String(day)} data-testid={`expense-day-${day}`} open={isOpen} className={`rounded-3xl p-5 border shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}>
                  <summary
                    onClick={(event) => { event.preventDefault(); setExpandedExpenseDays((previous) => ({ ...previous, [day]: !isOpen })); }}
                    className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-blue-500 ${t.mainText}`}
                  >
                    <span className="min-w-0 break-words font-bold">{String(title)} · {items.length} 筆 <span className={`text-sm font-normal ${t.subText}`}>{String(dateStr)}</span></span>
                    <span className={`shrink-0 text-sm font-mono font-bold ${t.mainText}`}>NT${items.reduce((a,b)=>a+(Number(b.cost)||0),0).toLocaleString()}</span>
                  </summary>
                  {isOpen ? <div className="mt-3 space-y-2.5">
                    {(/** @type {any[]} */ (items)).slice(-visibleCount).map(e => {
                      const cat = CATEGORIES.find(c => c.id === e.category) || CATEGORIES.find(c => c.id === 'other');
                      const payerNames = e.payments && typeof e.payments === 'object'
                        ? Object.entries(e.payments).filter(([, amount]) => Number(amount) > 0).map(([member]) => member)
                        : [String(e.payer)];
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
                                  className={`text-sm font-bold break-words [overflow-wrap:anywhere] ${t.mainText}`}
                                >
                                  {String(e.item)}
                                </p>
                                {Number(e.updatedAt) > Number(e.createdAt || e.updatedAt) ? (
                                  <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-500 font-bold">已編輯</span>
                                ) : null}
                              </div>
                              <p className={`text-sm font-bold mt-0.5 ${t.subText}`}>
                                {cat.label} • <span className="text-blue-500">{payerNames.join('、')}</span> 先付 • {Object.values(e.split || {}).filter(amount => Number(amount) > 0).length || membersList.length} 人分攤
                              </p>
                              {e.note ? <p className={`text-sm mt-1 break-words ${t.subText}`}>📝 {String(e.note)}</p> : null}
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
                    {items.length > visibleCount ? (
                      <button
                        type="button"
                        onClick={() => setVisibleExpenseCounts((previous) => ({ ...previous, [day]: items.length }))}
                        className={`min-h-11 w-full rounded-xl border text-sm font-bold focus-visible:outline-2 focus-visible:outline-blue-500 ${t.cardBorder} ${t.mainText}`}
                      >
                        顯示較早的 {items.length - visibleCount} 筆
                      </button>
                    ) : null}
                  </div> : null}
                </details>
              );
            })}
            {(!Array.isArray(expenses) || expenses.length === 0) ? <p className={`text-center mt-10 font-bold ${t.subText}`}>尚無記帳紀錄</p> : null}
          </div>
        ) : settlementModel ? (
          <SettlementPanel
            model={settlementModel}
            t={t}
            settlementMutationId={settlementMutationId}
            onMarkTransferPaid={onMarkTransferPaid}
            onCancelTransferPaid={onCancelTransferPaid}
          />
        ) : null}
      </div>
    </div>
  );
};
