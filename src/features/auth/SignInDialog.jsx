import React from 'react';

import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';

export function SignInDialog({ open, reason = 'cloud', busy, error, onSignIn, onClose, t = {} }) {
  if (!open) return null;
  const description = reason === 'invite'
    ? '請先用 Google 登入，登入完成後會自動驗證邀請並加入旅程。'
    : '雲端旅程會綁定 Google 帳號，只有受邀成員可以讀取與共同編輯。';

  return (
    <ResponsiveBottomSheet
      onClose={onClose}
      labelledBy="sign-in-dialog-title"
      testId="sign-in-dialog"
      dataMode="auth"
      initialFocusSelector="[data-testid='sign-in-dialog-google']"
      panelClassName={`${t.modalBg || 'bg-white'} ${t.cardBorder || 'border-slate-200'}`}
    >
      <div className="p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-blue-600">私人旅程</p>
            <h2 id="sign-in-dialog-title" className={`mt-1 text-xl font-black ${t.mainText || ''}`}>使用 Google 帳號繼續</h2>
          </div>
          <button type="button" aria-label="關閉登入視窗" onClick={onClose} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${t.mainText || ''}`}>×</button>
        </div>
        <p className={`mt-4 text-sm font-semibold leading-6 ${t.subText || ''}`}>{description}</p>
        <Button data-testid="sign-in-dialog-google" onClick={onSignIn} loading={busy} variant="primary" className="mt-6 w-full">
          使用 Google 登入
        </Button>
        {error ? <p role="alert" className="mt-3 text-sm font-bold text-red-600">{error}</p> : null}
        <p className={`mt-4 text-xs leading-5 ${t.subText || ''}`}>登入只用於識別旅程權限；共編名單不會公開你的 Email。</p>
      </div>
    </ResponsiveBottomSheet>
  );
}
