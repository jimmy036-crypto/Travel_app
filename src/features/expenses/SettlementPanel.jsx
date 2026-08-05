import React, { useMemo, useState } from 'react';

import { settlementTransferKey } from './settlementTransferRecords.js';
import { SETTLEMENT_SCOPES } from './settlementBalanceModel.js';

const SCOPE_LABELS = Object.freeze({
  all: '全部',
  pretrip: '行前',
  intrip: '旅途中',
});

const money = (value) => `NT$${Math.round(Number(value) || 0).toLocaleString()}`;

function SummaryCards({ expenseTotal, summary, t, aggregate = false }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="settlement-summary">
      <div className={`rounded-xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
        <p className={`text-[9px] font-bold ${t.subText}`}>範圍支出</p>
        <p className={`mt-1 font-mono font-black ${t.mainText}`}>{money(expenseTotal)}</p>
      </div>
      <div className={`rounded-xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
        <p className={`text-[9px] font-bold ${t.subText}`}>剩餘應收／應付</p>
        <p className="mt-1 font-mono font-black text-emerald-500">
          {money(summary.receivableTotal)}
          <span className="text-red-500">／{money(summary.payableTotal)}</span>
        </p>
      </div>
      <div className={`rounded-xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
        <p className={`text-[9px] font-bold ${t.subText}`}>剩餘轉帳筆數</p>
        <p className={`mt-1 font-mono font-black ${t.mainText}`}>{summary.transferCount} 筆</p>
      </div>
      <div className={`rounded-xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
        <p className={`text-[9px] font-bold ${t.subText}`}>
          {aggregate ? '已結清人數（各範圍）' : '已結清人數'}
        </p>
        <p className={`mt-1 font-mono font-black ${t.mainText}`}>{summary.balancedMemberCount} 人</p>
      </div>
    </div>
  );
}
function BalanceRows({ balances, t, testId = 'remaining-balance-list' }) {
  return (
    <div className="mt-3 space-y-2" data-testid={testId}>
      {Object.entries(balances || {}).map(([member, rawBalance]) => {
        const balance = Number(rawBalance) || 0;
        return (
          <div key={member} className={`flex items-center justify-between rounded-xl border p-3 ${t.itemBg} ${t.cardBorder}`}>
            <span className={`font-bold ${t.mainText}`}>{member}</span>
            {balance > 0.01 ? (
              <span className="font-mono font-bold text-emerald-500">剩餘應收 +{money(balance)}</span>
            ) : balance < -0.01 ? (
              <span className="font-mono font-bold text-red-500">剩餘應付 -{money(Math.abs(balance))}</span>
            ) : (
              <span className={`font-mono font-bold ${t.subText}`}>已結清 $0</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScopeSection({
  model,
  t,
  showBadge,
  settlementMutationId,
  onMarkTransferPaid,
  onCancelTransferPaid,
}) {
  const label = SCOPE_LABELS[model.scope];
  return (
    <section
      className={`rounded-3xl border p-5 shadow-sm ${t.expenseBlockBg} ${t.cardBorder}`}
      data-testid={`settlement-scope-${model.scope}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`text-sm font-black ${t.mainText}`}>{label}結算</h3>
          <p className={`mt-1 text-[10px] font-bold ${t.subText}`}>
            付款紀錄只抵銷本範圍，與其他範圍分開核對。
          </p>
        </div>
        {showBadge ? (
          <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-[10px] font-black text-blue-500">
            {label}
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <SummaryCards expenseTotal={model.expenseTotal} summary={model.remainingSummary} t={t} />
      </div>

      <h4 className={`mt-5 text-xs font-black ${t.mainText}`}>各自收支總覽</h4>
      <BalanceRows balances={model.remainingBalances} t={t} />
      {model.remainingSummary.isSettled && model.expenseTotal > 0 ? (
        <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-3 text-center text-sm font-black text-emerald-500" data-testid="settlement-all-paid">
          已全部結清
        </p>
      ) : null}

      <section className="mt-5" aria-label={`${label}待轉帳`}>
        <h4 className={`text-xs font-black ${t.mainText}`}>待轉帳</h4>
        {model.remainingTransfers.length > 0 ? (
          <div className="mt-3 space-y-3" data-testid="pending-settlement-list">
            {model.remainingTransfers.map((transfer) => {
              const key = settlementTransferKey(transfer);
              const isSaving = settlementMutationId === key;
              return (
                <div
                  key={key}
                  data-testid="pending-settlement-transfer"
                  data-scope={transfer.scope}
                  className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-4 ${t.isLight ? 'border-blue-200 bg-blue-50' : 'border-blue-500/30 bg-blue-900/20'}`}
                >
                  <div className="min-w-0">
                    {showBadge ? <span className="text-[10px] font-black text-blue-500">{label}</span> : null}
                    <p className={`truncate text-sm font-black ${t.mainText}`}>
                      {transfer.fromParticipantId} → {transfer.toParticipantId}
                    </p>
                    <p className={`mt-1 font-mono text-lg font-black ${t.mainText}`}>{money(transfer.amount)}</p>
                  </div>
                  <button
                    type="button"
                    data-testid="mark-settlement-paid"
                    disabled={isSaving}
                    onClick={() => onMarkTransferPaid?.(transfer)}
                    className="min-h-11 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white shadow-md disabled:cursor-wait disabled:opacity-60"
                  >
                    {isSaving ? '儲存中…' : '標記為已轉帳'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={`py-4 text-center text-xs font-bold ${t.subText}`}>目前沒有待完成的轉帳</p>
        )}
      </section>

      <section className={`mt-5 border-t pt-5 ${t.cardBorder}`} aria-label={`${label}已完成`}>
        <h4 className={`text-xs font-black ${t.mainText}`}>已完成</h4>
        {model.completedRecords.length > 0 ? (
          <div className="mt-3 space-y-3" data-testid="completed-settlement-list">
            {model.completedRecords.map((record) => {
              const isSaving = settlementMutationId === record.id;
              return (
                <div key={record.id} data-testid="completed-settlement-transfer" data-scope={model.scope} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-4 ${t.itemBg} ${t.cardBorder}`}>
                  <div className="min-w-0">
                    {showBadge ? <span className="text-[10px] font-black text-blue-500">{label}</span> : null}
                    <p className={`truncate text-sm font-black ${t.mainText}`}>
                      {record.fromParticipantId} → {record.toParticipantId}
                    </p>
                    <p className={`mt-1 font-mono text-base font-black ${t.mainText}`}>{money(record.amount)}</p>
                    <p className={`mt-1 text-[10px] font-bold ${t.subText}`}>
                      已轉帳 · {new Date(record.paidAt).toLocaleString('zh-TW')}
                    </p>
                    {!record.matchesCurrent ? (
                      <p className="mt-1 text-[10px] font-bold text-amber-500">
                        此紀錄已不符合目前分帳金額，未抵銷剩餘款項
                      </p>
                    ) : null}
                    {record.inferredScope ? (
                      <p className={`mt-1 text-[10px] font-bold ${t.subText}`}>依目前唯一相符項目判定範圍</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    data-testid="cancel-settlement-paid"
                    disabled={isSaving}
                    onClick={() => onCancelTransferPaid?.(record.id)}
                    className={`min-h-11 rounded-xl border px-3 py-2 text-xs font-bold disabled:cursor-wait disabled:opacity-60 ${t.cardBorder} ${t.subText}`}
                  >
                    {isSaving ? '儲存中…' : '取消已轉帳'}
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className={`py-4 text-center text-xs font-bold ${t.subText}`}>尚無已轉帳紀錄</p>
        )}
      </section>

      <details className={`mt-5 rounded-2xl border p-4 ${t.itemBg} ${t.cardBorder}`}>
        <summary className={`cursor-pointer text-xs font-black ${t.mainText}`}>原始分帳結果</summary>
        <p className={`mt-2 text-[10px] font-bold ${t.subText}`}>只依原始支出計算，不扣除付款紀錄。</p>
        <BalanceRows balances={model.rawBalances} t={t} testId="raw-balance-list" />
      </details>
    </section>
  );
}

export function SettlementPanel({
  model,
  t,
  settlementMutationId,
  onMarkTransferPaid,
  onCancelTransferPaid,
}) {
  const [activeScope, setActiveScope] = useState(SETTLEMENT_SCOPES.ALL);
  const visibleScopes = useMemo(
    () => (
      activeScope === SETTLEMENT_SCOPES.ALL
        ? [SETTLEMENT_SCOPES.PRETRIP, SETTLEMENT_SCOPES.INTRIP]
        : [activeScope]
    ),
    [activeScope],
  );

  return (
    <div className="space-y-5" data-testid="settlement-panel">
      <div
        role="tablist"
        aria-label="結算範圍"
        className={`sticky top-0 z-10 grid grid-cols-3 gap-1 rounded-2xl border p-1.5 ${t.headerBg} ${t.cardBorder}`}
      >
        {Object.values(SETTLEMENT_SCOPES).map((scope) => (
          <button
            key={scope}
            type="button"
            role="tab"
            aria-selected={activeScope === scope}
            data-testid={`settlement-scope-tab-${scope}`}
            onClick={() => setActiveScope(scope)}
            className={`min-h-11 rounded-xl px-3 text-xs font-black ${
              activeScope === scope ? 'bg-blue-600 text-white shadow-md' : t.mainText
            }`}
          >
            {SCOPE_LABELS[scope]}
          </button>
        ))}
      </div>

      {activeScope === SETTLEMENT_SCOPES.ALL ? (
        <section className={`rounded-3xl border p-5 ${t.expenseBlockBg} ${t.cardBorder}`}>
          <h3 className={`text-sm font-black ${t.mainText}`}>全部範圍總覽</h3>
          <p className={`mt-1 text-[10px] font-bold ${t.subText}`}>
            行前與旅途中分開結算，不會跨範圍互相抵銷。
          </p>
          <div className="mt-4">
            <SummaryCards
              expenseTotal={model.aggregate.expenseTotal}
              summary={model.aggregate.remainingSummary}
              t={t}
              aggregate
            />
          </div>
        </section>
      ) : null}

      {model.unresolvedLegacyRecords.length > 0 ? (
        <aside className={`rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-bold ${t.mainText}`} data-testid="legacy-settlement-note">
          舊版紀錄未標示範圍，已保留供核對
          <span className={`mt-1 block text-[10px] ${t.subText}`}>
            {model.unresolvedLegacyRecords.length} 筆紀錄未唯一對應目前的行前或旅途中建議，因此不會扣除剩餘款項。
          </span>
        </aside>
      ) : null}

      {visibleScopes.map((scope) => (
        <ScopeSection
          key={scope}
          model={model.scopes[scope]}
          t={t}
          showBadge={activeScope === SETTLEMENT_SCOPES.ALL}
          settlementMutationId={settlementMutationId}
          onMarkTransferPaid={onMarkTransferPaid}
          onCancelTransferPaid={onCancelTransferPaid}
        />
      ))}
    </div>
  );
}
