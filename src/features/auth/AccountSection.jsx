import React from 'react';

import { Button } from '../../components/ui/Button.jsx';

export function AccountSection({ user, loading, busy, error, onSignIn, onSignOut, menuItem = false, t = {} }) {
  if (loading) {
    return <p data-testid="account-loading" className={`px-3 py-2 text-sm font-semibold ${t.subText || ''}`}>正在確認登入狀態…</p>;
  }

  return (
    <section data-testid="account-section" aria-labelledby="account-section-title" className="grid gap-3">
      <h3 id="account-section-title" className={`px-3 text-[11px] font-black uppercase tracking-[0.14em] ${t.subText || ''}`}>
        Google 帳號
      </h3>
      {user ? (
        <div className={`rounded-2xl border p-3 ${t.cardBg || ''} ${t.cardBorder || ''}`}>
          <div className="flex min-w-0 items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-full object-cover" />
            ) : (
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 font-black text-white">
                {String(user.displayName || '旅').slice(0, 1)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className={`truncate text-sm font-black ${t.mainText || ''}`}>{user.displayName || 'Google 使用者'}</p>
              <p className={`truncate text-xs ${t.subText || ''}`}>{user.email || '已使用 Google 登入'}</p>
            </div>
          </div>
          <Button role={menuItem ? 'menuitem' : undefined} data-testid="google-sign-out" onClick={onSignOut} loading={busy} variant="ghost" className={`mt-3 w-full ${t.subText || ''}`}>
            登出
          </Button>
        </div>
      ) : (
        <div className="px-3">
          <p className={`mb-3 text-xs font-semibold leading-5 ${t.subText || ''}`}>
            登入後才能建立、加入及同步私人旅程；示範旅程仍可離線使用。
          </p>
          <Button role={menuItem ? 'menuitem' : undefined} data-testid="google-sign-in" onClick={onSignIn} loading={busy} variant="secondary" className="w-full">
            使用 Google 登入
          </Button>
        </div>
      )}
      {error ? <p role="alert" className="px-3 text-xs font-bold text-red-600">{error}</p> : null}
    </section>
  );
}
