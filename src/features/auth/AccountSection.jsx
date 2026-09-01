import React from 'react';

import { Button } from '../../components/ui/Button.jsx';

export function AccountSection({
  user,
  loading,
  busy,
  error,
  onSignIn,
  onSwitchAccount,
  onSignOut,
  contextLabel = '',
  roleLabel = '',
  menuItem = false,
  t = {},
}) {
  if (loading) {
    return <p data-testid="account-loading" className={`px-3 py-2 text-sm font-semibold ${t.subText || ''}`}>正在確認登入狀態…</p>;
  }
  const roleTone = t.isLight === false
    ? 'border-blue-300/25 bg-blue-950/55 text-blue-100'
    : 'border-blue-500/25 bg-blue-50/80 text-blue-800';
  const secondaryActionTone = `${t.cardBg || 'bg-white/75'} ${t.cardBorder || 'border-slate-300/70'} ${t.mainText || 'text-slate-800'}`;

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
              <p className={`break-words text-sm font-black leading-5 ${t.mainText || ''}`}>{user.displayName || 'Google 使用者'}</p>
              <p className={`break-all text-xs leading-5 ${t.subText || ''}`}>{user.email || '已使用 Google 登入'}</p>
            </div>
          </div>
          {contextLabel || roleLabel ? (
            <div
              data-testid="account-context"
              className={`mt-3 flex min-w-0 flex-wrap items-center gap-2 border-t pt-3 text-xs font-bold ${t.cardBorder || ''} ${t.subText || ''}`}
            >
              {contextLabel ? <span className="min-w-0 break-words">{contextLabel}</span> : null}
              {roleLabel ? (
                <span className={`inline-flex min-h-7 items-center whitespace-nowrap rounded-full border px-2.5 ${roleTone}`}>
                  {roleLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {typeof (onSwitchAccount || onSignIn) === 'function' ? (
              <Button
                role={menuItem ? 'menuitem' : undefined}
                data-testid="google-switch-account"
                onClick={onSwitchAccount || onSignIn}
                disabled={busy}
                variant="themed"
                className={`w-full ${secondaryActionTone}`}
              >
                切換帳號
              </Button>
            ) : null}
            <Button
              role={menuItem ? 'menuitem' : undefined}
              data-testid="google-sign-out"
              onClick={onSignOut}
              disabled={busy}
              variant="ghost"
              className={`w-full ${t.subText || ''}`}
            >
              登出
            </Button>
          </div>
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
