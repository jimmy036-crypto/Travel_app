import React, { useMemo, useState } from 'react';

import {
  TICKET_AUDIENCE_TYPES,
  TICKET_TYPES,
  deriveTicketUsageDate,
  filterTicketsForView,
  getTicketLaunchAction,
  normalizeTicket,
  normalizeTicketHttpUrl,
} from './ticketModel.js';

const trimText = (value) => String(value ?? '').trim();

const normalizeMembers = (members) => {
  const result = [];
  (Array.isArray(members) ? members : []).forEach((member) => {
    const name = trimText(member);
    if (name && !result.includes(name)) result.push(name);
  });
  return result;
};

const sourceLabel = (ticket) => {
  if (ticket.ticketType === TICKET_TYPES.ATTACHMENT) {
    return ticket.attachmentKind === 'pdf' ? 'PDF 票券' : '圖片票券';
  }
  return ticket.ticketType === TICKET_TYPES.EXTERNAL_APP ? '外部 App 票券' : '網頁票券';
};

const dayNumber = (dayId) => {
  const match = /^Day\s+(\d+)$/i.exec(trimText(dayId));
  return match ? Number(match[1]) : null;
};

const formatUsageDate = (ticket, startDate) => {
  if (!trimText(ticket.dayId)) return '日期未指定';
  const date = deriveTicketUsageDate({ dayId: ticket.dayId, startDate });
  const number = dayNumber(ticket.dayId);
  if (!date || !number) return '日期未指定';
  return `第 ${number} 天・${date.replaceAll('-', '/')}${ticket.usageTime ? ` ${ticket.usageTime}` : ''}`;
};

const formatAudience = (ticket) => {
  if (ticket.audienceType === TICKET_AUDIENCE_TYPES.ALL) return '共同票券';
  const members = ticket.assignedMembers;
  if (members.length <= 2) return members.join('、');
  return `${members.slice(0, 2).join('、')}等 ${members.length} 人`;
};

const reminderText = (minutes) => {
  if (minutes === 60) return '建議提前 1 小時開啟';
  return minutes > 0 ? `建議提前 ${minutes} 分鐘開啟` : '';
};

const ActionAnchor = ({ href, children, secondary = false }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-center text-xs font-black ${secondary ? 'border border-blue-500/30 text-blue-600 dark:text-blue-300' : 'bg-blue-600 text-white'}`}
  >
    {children}
  </a>
);

function TicketCard({
  ticket,
  startDate,
  t,
  deleting,
  onEdit,
  onDelete,
  onOpenImage,
  onCopyOrderNumber,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const action = getTicketLaunchAction(ticket);
  const fallbackUrl = normalizeTicketHttpUrl(ticket.fallbackUrl);
  const showFallback = ticket.ticketType === TICKET_TYPES.EXTERNAL_APP
    && action.mode === 'app-link'
    && fallbackUrl
    && fallbackUrl !== action.url;
  const audience = formatAudience(ticket);
  const usageDate = formatUsageDate(ticket, startDate);
  const reminder = reminderText(ticket.reminderMinutes);
  const manual = action.mode === 'manual';
  const hasInstructions = Boolean(ticket.instructions);
  const showDetailToggle = manual || hasInstructions;

  return (
    <article
      data-testid="ticket-card"
      data-ticket-id={ticket.id}
      className={`min-w-0 overflow-hidden rounded-3xl border p-4 shadow-sm ${t?.itemBg || 'bg-white dark:bg-slate-900'} ${t?.cardBorder || 'border-slate-200 dark:border-white/10'}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-black text-amber-700 dark:text-amber-300">
            {sourceLabel(ticket)}
          </span>
          <h3 className={`mt-2 break-words text-base font-black ${t?.mainText || 'text-slate-950 dark:text-white'}`}>
            {ticket.title || '未命名票券'}
          </h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <button type="button" data-testid="ticket-edit-button" onClick={() => onEdit(ticket)} className="min-h-9 rounded-lg px-2 text-xs font-bold text-blue-600">編輯</button>
          <button type="button" data-testid="ticket-delete-button" onClick={() => onDelete(ticket.id)} disabled={deleting} className="min-h-9 rounded-lg px-2 text-xs font-bold text-red-600 disabled:opacity-50">
            {deleting ? '刪除中…' : '刪除'}
          </button>
        </div>
      </div>

      <dl className={`mt-3 min-w-0 space-y-1.5 text-xs ${t?.subText || 'text-slate-600 dark:text-slate-300'}`}>
        <div><dt className="sr-only">使用成員</dt><dd title={ticket.assignedMembers.join('、')}>{audience}</dd></div>
        <div><dt className="sr-only">使用日期</dt><dd>{usageDate}</dd></div>
        {ticket.appName ? <div><dt className="sr-only">外部 App</dt><dd>外部 App：{ticket.appName}</dd></div> : null}
        {ticket.presenterMember ? <div><dt className="sr-only">主要出示人</dt><dd>由{ticket.presenterMember}負責出示</dd></div> : null}
        {reminder ? <div><dt className="sr-only">建議提前時間</dt><dd>{reminder}</dd></div> : null}
        {ticket.memo ? <div><dt className="sr-only">備註</dt><dd className="break-words">備註：{ticket.memo}</dd></div> : null}
      </dl>

      {ticket.ticketType === TICKET_TYPES.EXTERNAL_APP ? (
        <div className="mt-3 min-w-0 space-y-2 text-xs">
          {ticket.orderNumber ? <p className="break-all">訂單編號：{ticket.orderNumber}</p> : null}
          {ticket.usageDetails ? <p className="break-words">座位／車次／班次：{ticket.usageDetails}</p> : null}
          {ticket.dynamicCode || ticket.requiresNetwork || ticket.requiresLogin ? (
            <div className="space-y-1 rounded-xl bg-amber-500/10 p-3 text-amber-800 dark:text-amber-200">
              {ticket.dynamicCode ? <p>⚠️ 動態條碼，請勿依賴截圖</p> : null}
              {ticket.requiresNetwork ? <p>使用時需要網路</p> : null}
              {ticket.requiresLogin ? <p>請提前確認已登入原 App</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        {action.mode === 'fullscreen-image' ? (
          <button type="button" onClick={() => onOpenImage(ticket)} className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white">全螢幕查看票券</button>
        ) : null}
        {action.mode === 'pdf' ? <ActionAnchor href={action.url}>開啟 PDF 票券</ActionAnchor> : null}
        {action.mode === 'web' ? <ActionAnchor href={action.url}>開啟票券網站</ActionAnchor> : null}
        {action.mode === 'app-link' ? <ActionAnchor href={action.url}>在 App 中開啟票券</ActionAnchor> : null}
        {manual ? (
          <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-xs font-black text-white">查看開啟方式</button>
        ) : null}
        {action.mode === 'invalid' ? <button type="button" disabled className="min-h-11 rounded-xl bg-slate-300 px-4 py-2 text-xs font-black text-slate-600">{ticket.ticketType === TICKET_TYPES.ATTACHMENT ? '票券附件無法開啟' : '票券網址無法開啟'}</button> : null}
        {showFallback ? <ActionAnchor href={fallbackUrl} secondary>開啟備用網頁</ActionAnchor> : null}
        {ticket.orderNumber ? <button type="button" onClick={() => onCopyOrderNumber(ticket.orderNumber)} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black">複製訂單編號</button> : null}
        {showDetailToggle && !manual ? <button type="button" onClick={() => setDetailsOpen((open) => !open)} className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black">查看使用說明</button> : null}
      </div>

      {detailsOpen ? (
        <div className="mt-3 rounded-2xl bg-slate-500/10 p-3 text-sm" aria-live="polite">
          {manual ? <p className="font-black">請手動開啟 {ticket.appName || '原 App'}</p> : null}
          {ticket.instructions ? <p className="mt-2 whitespace-pre-wrap break-words">{ticket.instructions}</p> : manual ? (
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>開啟原 App</li>
              <li>登入原訂購帳號</li>
              <li>進入訂單或票券頁面</li>
              <li>找到這張票券</li>
            </ol>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

export function TicketWalletSection({
  tickets = [],
  members = [],
  activeMember = '',
  startDate = '',
  t = {},
  isActive = true,
  isSavingTicket = false,
  deletingTicketId = '',
  onSelectActiveMember,
  onCreateTicket,
  onEditTicket,
  onDeleteTicket,
  onOpenImage,
  onCopyOrderNumber,
}) {
  const validMembers = useMemo(() => normalizeMembers(members), [members]);
  const normalizedActiveMember = validMembers.includes(trimText(activeMember)) ? trimText(activeMember) : '';
  const normalizedTickets = useMemo(() => (
    (Array.isArray(tickets) ? tickets : []).map((ticket) => normalizeTicket(ticket, { members: validMembers }))
  ), [tickets, validMembers]);
  const [view, setView] = useState({ type: 'identity' });
  const effectiveView = view.type === 'identity'
    ? normalizedActiveMember
      ? { type: 'member', member: normalizedActiveMember }
      : { type: 'all' }
    : view.type === 'member' && !validMembers.includes(view.member)
      ? { type: 'all' }
      : view;
  const filteredTickets = filterTicketsForView(normalizedTickets, effectiveView);
  const pickIdentity = (member) => {
    onSelectActiveMember(member);
    setView({ type: 'member', member });
  };

  const emptyTitle = normalizedTickets.length === 0
    ? '尚未加入票券'
    : effectiveView.type === 'common'
      ? '尚未加入共同票券'
      : effectiveView.type === 'member'
        ? '目前沒有指定給這位成員的個人票券'
        : '這個分類目前沒有票券';

  return (
    <section
      data-testid="ticket-panel"
      hidden={!isActive}
      className={`min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto overscroll-y-contain backdrop-blur-xl ${isActive ? 'flex' : 'hidden'} ${t?.sidebarBg || ''}`}
    >
      <header className={`sticky top-0 z-10 shrink-0 border-b p-4 shadow-lg backdrop-blur-2xl sm:p-6 ${t?.headerBg || ''} ${t?.cardBorder || ''}`}>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0">
            <p className={`text-xs font-bold uppercase tracking-widest ${t?.subText || ''}`}>隨身協作大廳</p>
            <h2 className={`mt-1 truncate text-xl font-black sm:text-2xl ${t?.mainText || ''}`}>共同票券夾 🎟️</h2>
          </div>
          <button type="button" data-testid="add-ticket-button" onClick={onCreateTicket} disabled={isSavingTicket} className="shrink-0 rounded-2xl bg-amber-600 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:px-5">新增票券</button>
        </div>

        {!normalizedActiveMember && validMembers.length > 0 ? (
          <div data-testid="ticket-active-member-picker" className="mt-4 rounded-2xl bg-blue-500/10 p-3">
            <p className={`text-sm font-black ${t?.mainText || ''}`}>你是這趟旅程中的哪一位？</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {validMembers.map((member) => (
                <button key={member} type="button" data-testid="ticket-active-member-button" data-member={member} onClick={() => pickIdentity(member)} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white">{member}</button>
              ))}
            </div>
            <p className={`mt-2 text-[11px] ${t?.subText || ''}`}>只保存在此裝置，不代表登入或存取權限。</p>
          </div>
        ) : null}

        {normalizedActiveMember ? (
          <div className="mt-3 flex items-center justify-between gap-3 text-xs">
            <span className={t?.subText || ''}>此裝置身分：{normalizedActiveMember}</span>
            <button type="button" onClick={() => onSelectActiveMember('')} className="font-black text-blue-600">切換身分</button>
          </div>
        ) : null}

        <div className="scrollbar-hide mt-4 flex max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-1" aria-label="票券篩選">
          <button type="button" data-testid="ticket-filter-all" aria-pressed={effectiveView.type === 'all'} onClick={() => setView({ type: 'all' })} className="shrink-0 rounded-full border px-3 py-2 text-xs font-black">全部</button>
          <button type="button" data-testid="ticket-filter-common" aria-pressed={effectiveView.type === 'common'} onClick={() => setView({ type: 'common' })} className="shrink-0 rounded-full border px-3 py-2 text-xs font-black">共同</button>
          {validMembers.map((member) => (
            <button key={member} type="button" data-testid="ticket-filter-member" data-member={member} aria-pressed={effectiveView.type === 'member' && effectiveView.member === member} onClick={() => setView({ type: 'member', member })} className="shrink-0 rounded-full border px-3 py-2 text-xs font-black">
              {member === normalizedActiveMember ? `我的・${member}` : member}
            </button>
          ))}
        </div>
      </header>

      <div className="min-w-0 p-4 pb-24">
        {filteredTickets.length === 0 ? (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center text-center">
            <span className="text-5xl" aria-hidden="true">🎟️</span>
            <h3 className={`mt-4 font-black ${t?.mainText || ''}`}>{emptyTitle}</h3>
            <p className={`mt-2 text-sm ${t?.subText || ''}`}>
              {normalizedTickets.length === 0 ? '可加入圖片、PDF、網頁票券，或只保存外部 App 的開啟方式。' : '可以查看全部票券，或新增一張適合這個分類的票券。'}
            </p>
            <div className="mt-4 flex gap-2">
              {normalizedTickets.length > 0 ? <button type="button" onClick={() => setView({ type: 'all' })} className="rounded-xl border px-3 py-2 text-xs font-black">查看全部票券</button> : null}
              <button type="button" onClick={onCreateTicket} disabled={isSavingTicket} className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50">新增票券</button>
            </div>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            {filteredTickets.map((ticket, index) => (
              <TicketCard
                key={ticket.id || `ticket-${index}`}
                ticket={ticket}
                startDate={startDate}
                t={t}
                deleting={deletingTicketId === ticket.id}
                onEdit={onEditTicket}
                onDelete={onDeleteTicket}
                onOpenImage={onOpenImage}
                onCopyOrderNumber={onCopyOrderNumber}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
