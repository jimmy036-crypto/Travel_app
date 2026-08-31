import React, { useState } from 'react';

import { ResponsiveBottomSheet } from '../../components/ResponsiveBottomSheet.jsx';
import { Button } from '../../components/ui/Button.jsx';

const DELETE_SCOPE = [
  '所有雲端行程、地圖地點與共享清單',
  '所有雲端票券、票券附件與相關檔案',
  '所有雲端記帳、分帳、結算與預算資料',
  '所有成員的雲端存取權與邀請連結',
];

export function DeleteTripDialog(props) {
  const { open = false, tripTitle = '' } = props;
  if (!open) return null;

  return <DeleteTripDialogContent key={String(tripTitle || '')} {...props} />;
}

function DeleteTripDialogContent({
  tripTitle = '',
  isOnline = true,
  busy = false,
  error = '',
  onConfirm,
  onClose,
  t = {},
}) {
  const safeTitle = String(tripTitle || '');
  const [confirmationText, setConfirmationText] = useState('');
  const titleMatches = safeTitle.length > 0 && confirmationText === safeTitle;
  const canDelete = isOnline && !busy && titleMatches;
  const requestClose = () => {
    if (!busy) onClose?.();
  };
  const submit = (event) => {
    event.preventDefault();
    if (!canDelete) return;
    onConfirm?.();
  };

  const dangerText = t.isLight === false ? 'text-red-200' : 'text-red-700';
  const dangerSurface = t.isLight === false
    ? 'border-red-300/25 bg-red-950/55'
    : 'border-red-300/70 bg-red-50/90';
  const secondaryActionTone = `${t.cardBg || 'bg-white/75'} ${t.cardBorder || 'border-slate-300/70'} ${t.mainText || 'text-slate-800'}`;
  const destructiveActionTone = t.isLight === false
    ? 'border-red-300/30 bg-red-950/70 text-red-100 hover:bg-red-900/80'
    : 'border-red-300/60 bg-red-50/90 text-red-700 hover:bg-red-100';
  const offlineTone = t.isLight === false
    ? 'border-amber-300/25 bg-amber-950/55 text-amber-100'
    : 'border-amber-400/40 bg-amber-50/90 text-amber-900';

  return (
    <ResponsiveBottomSheet
      onClose={requestClose}
      labelledBy="delete-trip-dialog-title"
      describedBy="delete-trip-dialog-description"
      testId="delete-trip-dialog"
      dataMode="delete-trip"
      initialFocusSelector={busy
        ? "[data-testid='delete-trip-busy-status']"
        : "[data-testid='delete-trip-close']"}
      panelClassName={`${t.modalBg || 'bg-white'} ${t.cardBorder || 'border-slate-200'}`}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className={`flex shrink-0 items-start justify-between gap-4 border-b p-5 sm:p-6 ${t.cardBorder || 'border-slate-200'}`}>
          <div className="min-w-0">
            <p className={`text-xs font-black uppercase tracking-[0.14em] ${dangerText}`}>危險操作</p>
            <h2 id="delete-trip-dialog-title" className={`mt-1 break-words text-xl font-black ${t.mainText || 'text-slate-950'}`}>
              永久刪除整趟旅程
            </h2>
          </div>
          <button
            type="button"
            data-testid="delete-trip-close"
            aria-label="關閉永久刪除旅程視窗"
            onClick={requestClose}
            disabled={busy}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl disabled:cursor-not-allowed disabled:opacity-50 ${t.mainText || 'text-slate-950'}`}
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          <div className={`rounded-2xl border p-4 ${dangerSurface}`}>
            <p id="delete-trip-dialog-description" className={`text-sm font-black leading-6 ${dangerText}`}>
              此操作不可復原。刪除開始後，所有旅伴都會失去「{safeTitle || '這趟旅程'}」的雲端存取權。
            </p>
            <ul className={`mt-3 list-disc space-y-2 pl-5 text-sm font-semibold leading-5 ${t.subText || 'text-slate-600'}`}>
              {DELETE_SCOPE.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>

          <div className="mt-5">
            <label htmlFor="delete-trip-confirmation" className={`block text-sm font-black leading-6 ${t.mainText || 'text-slate-950'}`}>
              輸入完整旅程名稱「{safeTitle}」以確認
            </label>
            <input
              id="delete-trip-confirmation"
              data-testid="delete-trip-confirmation"
              type="text"
              value={confirmationText}
              onChange={(event) => setConfirmationText(event.target.value)}
              disabled={busy}
              autoComplete="off"
              spellCheck="false"
              aria-describedby="delete-trip-confirmation-hint"
              aria-invalid={confirmationText.length > 0 && !titleMatches ? 'true' : undefined}
              className={`mt-2 min-h-12 w-full rounded-xl border px-3 text-base outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 ${t.inputBg || 'bg-white'} ${t.cardBorder || 'border-slate-300'} ${t.mainText || 'text-slate-950'}`}
            />
            <p id="delete-trip-confirmation-hint" className={`mt-2 text-xs font-semibold leading-5 ${t.subText || 'text-slate-600'}`}>
              名稱必須完全相同，包含空格與符號。
            </p>
          </div>

          {!isOnline ? (
            <p role="status" className={`mt-4 rounded-xl border p-3 text-sm font-bold ${offlineTone}`}>
              目前離線，無法刪除雲端旅程。請恢復連線後再試。
            </p>
          ) : null}
          {error ? (
            <p role="alert" className={`mt-4 rounded-xl border p-3 text-sm font-bold ${dangerSurface} ${dangerText}`}>
              {error}
            </p>
          ) : null}
          {busy ? (
            <p
              data-testid="delete-trip-busy-status"
              role="status"
              tabIndex={-1}
              autoFocus
              className={`mt-4 rounded-xl border p-3 text-sm font-bold ${t.cardBg || 'bg-white/75'} ${t.cardBorder || 'border-slate-300/70'} ${t.mainText || 'text-slate-800'}`}
            >
              正在送出刪除要求，收到確認前請保持此視窗開啟。
            </p>
          ) : null}
        </div>

        <div className={`grid shrink-0 gap-2 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:grid-cols-2 sm:p-5 ${t.cardBorder || 'border-slate-200'}`}>
          <Button
            data-testid="delete-trip-cancel"
            onClick={requestClose}
            disabled={busy}
            variant="themed"
            className={`w-full ${secondaryActionTone}`}
          >
            保留旅程
          </Button>
          <Button
            data-testid="delete-trip-confirm"
            type="submit"
            disabled={!canDelete}
            loading={busy}
            variant="themed"
            className={`w-full ${destructiveActionTone}`}
          >
            {busy ? '正在永久刪除…' : '永久刪除整趟旅程'}
          </Button>
        </div>
      </form>
    </ResponsiveBottomSheet>
  );
}

export default DeleteTripDialog;
