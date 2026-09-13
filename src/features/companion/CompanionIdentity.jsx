import React from 'react';
import { createPortal } from 'react-dom';
import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';

const control = 'min-h-11 min-w-11 rounded-xl border px-3 py-2 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60';

export function CompanionPicker({ identity, members, onClose, t, introduction = false, returnFocusTarget }) {
  const choose = member => { if (identity.ready && identity.confirm(member)) onClose(); };
  const close = () => {
    if (introduction) identity.skip();
    onClose();
  };
  return createPortal(
    <div className="relative z-[10060]">
      <ResponsiveBottomSheet
        testId="companion-picker"
        labelledBy="companion-picker-title"
        onClose={close}
        initialFocusSelector='[data-testid="companion-picker-close"]'
        returnFocusTarget={returnFocusTarget}
        panelClassName={`${t.modalBg} ${t.cardBorder}`}
      >
        <header className={`flex items-start justify-between gap-2 border-b p-4 ${t.cardBorder}`}>
          <h2 id="companion-picker-title" className={`min-w-0 text-lg font-bold ${t.mainText}`}>{introduction ? '你是這趟旅程中的哪位旅伴？' : '選擇本趟旅伴'}</h2>
          <button type="button" data-testid="companion-picker-close" onClick={close} className={`${control} shrink-0 whitespace-nowrap ${t.mainText} ${t.cardBorder}`}>{introduction ? '先看看' : '取消'}</button>
        </header>
        <div className={`min-h-0 min-w-0 overflow-y-auto p-4 text-sm leading-6 ${introduction ? 'pb-[max(1rem,env(safe-area-inset-bottom))]' : ''} ${t.mainText}`}>
          {introduction ? (
            <>
              <p>選一次，票券、清單與新增記帳會共用。</p>
              <p>只記住在這個瀏覽器，不會更改帳號或旅程權限。</p>
            </>
          ) : <p>這是本機操作偏好，不是帳號或權限認證。更正不會改寫已有的記帳、票券或清單。</p>}
          {identity.invalidated && !identity.member ? <p role="status">原旅伴已不在名單中，請重新選擇。</p> : null}
          {identity.storageError ? (
            <p role="status">{identity.member
              ? '無法記住到下次；本次選擇仍可使用。重新載入後請再次確認。'
              : '無法確認瀏覽器已記住的旅伴；重新載入後請再次檢查設定。'}</p>
          ) : null}
          {identity.conflict ? <p>票券與清單的舊選擇不同，請重新確認。</p> : null}
          {identity.candidate ? <button type="button" disabled={!identity.ready} onClick={() => choose(identity.candidate)} className={`${control} mt-3 w-full [overflow-wrap:anywhere] ${t.cardBorder}`}>你是「{identity.candidate}」嗎？確認</button> : null}
          <div className="mt-3 flex flex-col gap-2">
            {members.map(member => <button key={member} type="button" data-testid="companion-member" data-member={member} disabled={!identity.ready} aria-pressed={identity.member === member} onClick={() => choose(member)} className={`${control} text-left [overflow-wrap:anywhere] aria-pressed:bg-blue-600 aria-pressed:text-white ${t.cardBorder}`}>{member}</button>)}
          </div>
          {!members.length ? <p>目前沒有可選擇的旅伴，請先確認旅程名單。</p> : null}
        </div>
        {!introduction ? (
          <footer className={`border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] ${t.cardBorder}`}>
            <button type="button" disabled={!identity.ready} onClick={() => choose('')} className={`${control} w-full ${t.mainText} ${t.cardBorder}`}>清除本趟旅伴設定</button>
          </footer>
        ) : null}
      </ResponsiveBottomSheet>
    </div>, document.body,
  );
}
