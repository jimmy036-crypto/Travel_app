import React from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';

const control = 'min-h-11 min-w-11 rounded-xl border px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500';

export function CompanionNotice({ identity, onChoose, t }) {
  return (
    <div data-testid="companion-notice" className={`mt-3 min-w-0 text-sm leading-6 ${t.mainText}`}>
      {identity.member ? (
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">本趟旅伴：{identity.member}</span>
          <button type="button" onClick={onChoose} className={`${control} shrink-0 ${t.cardBorder}`}>更正旅伴</button>
        </div>
      ) : identity.skipped ? (
        <button type="button" onClick={onChoose} className={`${control} ${t.cardBorder}`} disabled={!identity.ready}>選擇旅伴</button>
      ) : (
        <>
          <p className="font-bold">設定你在這趟旅程中的名字</p>
          <p>選一次，清單與票券會共用；新增記帳也可預填付款人。</p>
          <div className="my-2 flex flex-wrap gap-2">
            <button type="button" onClick={onChoose} disabled={!identity.ready} className={`${control} ${t.cardBorder}`}>選擇旅伴</button>
            <button type="button" onClick={identity.skip} className={`${control} ${t.cardBorder}`}>先看全部</button>
          </div>
          <p>此設定只記住在這個瀏覽器，不會更改帳號或旅程權限。</p>
        </>
      )}
      {identity.invalidated && !identity.member ? <p role="status">原旅伴已不在名單中，請重新選擇。</p> : null}
      {identity.storageError ? <p role="status">無法記住到下次；本次選擇仍可使用。重新進入後請再次確認。</p> : null}
    </div>
  );
}

export function CompanionPicker({ identity, members, onClose, t }) {
  const choose = member => { if (identity.confirm(member)) onClose(); };
  return createPortal(
    <div className="relative z-[10060]">
      <ResponsiveBottomSheet testId="companion-picker" labelledBy="companion-picker-title" onClose={onClose} panelClassName={`${t.modalBg} ${t.cardBorder}`}>
        <header className={`flex items-start justify-between gap-2 border-b p-4 ${t.cardBorder}`}>
          <h2 id="companion-picker-title" className={`min-w-0 text-lg font-bold ${t.mainText}`}>選擇本趟旅伴</h2>
          <button type="button" onClick={onClose} className={`${control} shrink-0 whitespace-nowrap ${t.mainText} ${t.cardBorder}`}>取消</button>
        </header>
        <div className={`min-h-0 overflow-y-auto p-4 text-sm leading-6 ${t.mainText}`}>
          <p>這是本機操作偏好，不是帳號或權限認證。更正不會改寫已有的記帳、票券或清單。</p>
          {identity.conflict ? <p>票券與清單的舊選擇不同，請重新確認。</p> : null}
          {identity.candidate ? <button type="button" onClick={() => choose(identity.candidate)} className={`${control} mt-3 w-full [overflow-wrap:anywhere] ${t.cardBorder}`}>你是「{identity.candidate}」嗎？確認</button> : null}
          <div className="mt-3 flex flex-col gap-2">
            {members.map(member => <button key={member} type="button" data-testid="companion-member" data-member={member} aria-pressed={identity.member === member} onClick={() => choose(member)} className={`${control} text-left [overflow-wrap:anywhere] aria-pressed:bg-blue-600 aria-pressed:text-white ${t.cardBorder}`}>{member}</button>)}
          </div>
          {!members.length ? <p>目前沒有可選擇的旅伴，請先確認旅程名單。</p> : null}
        </div>
        <footer className={`border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${t.cardBorder}`}>
          <button type="button" onClick={() => choose('')} className={`${control} w-full ${t.mainText} ${t.cardBorder}`}>清除本趟旅伴設定</button>
        </footer>
      </ResponsiveBottomSheet>
    </div>, document.body,
  );
}
