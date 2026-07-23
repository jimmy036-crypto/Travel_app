import { useEffect, useRef } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CloneDemoDialog({
  open,
  status = 'idle',
  errorMessage = '',
  onConfirm,
  onCancel,
  onRepair,
  onOpenTrip,
}) {
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const confirmStartedRef = useRef(false);
  const callbacksRef = useRef({ onCancel });
  const loading = status === 'loading';

  useEffect(() => {
    callbacksRef.current = { onCancel };
  }, [onCancel]);

  useEffect(() => {
    if (!open) {
      confirmStartedRef.current = false;
      return undefined;
    }
    returnFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector(FOCUSABLE)?.focus());
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !loading) {
        event.preventDefault();
        callbacksRef.current.onCancel?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = Array.from(panelRef.current?.querySelectorAll(FOCUSABLE) || []);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => returnFocusRef.current?.focus?.());
    };
  }, [loading, open]);

  if (!open) return null;

  const confirm = () => {
    if (loading || confirmStartedRef.current) return;
    confirmStartedRef.current = true;
    onConfirm?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clone-demo-title"
      aria-describedby="clone-demo-description"
      data-testid="clone-demo-dialog"
      className="fixed inset-0 z-[10080] flex items-center justify-center overflow-y-auto bg-slate-950/65 p-4"
    >
      <section ref={panelRef} className="my-auto w-full max-w-xl rounded-3xl bg-white p-5 text-slate-950 shadow-2xl dark:bg-slate-900 dark:text-slate-50 sm:p-7">
        <p className="text-sm font-black text-emerald-700 dark:text-emerald-300">目前示範副本</p>
        <h2 id="clone-demo-title" className="mt-1 text-2xl font-black">複製成我的旅程</h2>
        <p id="clone-demo-description" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
          Clone 與「重設示範資料」是不同操作。Clone 不會改變或清除目前示範副本。
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-950/30">
            <h3 className="font-black">會複製</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>目前編輯後的三日行程</li>
              <li>重設為未完成的 Checklist</li>
              <li>Owner-only 成員模型</li>
              <li>明確標示未驗證的文字景點</li>
            </ul>
          </section>
          <section className="rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/30">
            <h3 className="font-black">不會複製</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              <li>虛構成員、費用與結算</li>
              <li>票券、附件與 Storage 路徑</li>
              <li>Demo/Sandbox ID 與範例訂單</li>
              <li>舊時間戳與 audit 狀態</li>
            </ul>
          </section>
        </div>

        <p className="mt-4 rounded-2xl border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-100">
          本機 Journal 只提供同一裝置與瀏覽器的 retry/reload recovery，不是跨裝置 idempotency 或授權簽章。
        </p>

        <div aria-live="polite" className="mt-4 min-h-12">
          {loading ? <p role="status">正在建立並驗證旅程，請勿關閉視窗…</p> : null}
          {status === 'success' ? <p role="status" className="text-emerald-700">旅程與 myTrips 已驗證完成。</p> : null}
          {status === 'ambiguous' ? <p role="alert" className="text-amber-700">寫入結果不明，正在等待 read-back 驗證；不會自動刪除房間。</p> : null}
          {status === 'error' ? <p role="alert" className="text-rose-700">{errorMessage || '建立失敗，請稍後重試。'}</p> : null}
          {status === 'repair-required' ? <p role="alert" className="text-amber-700">房間已驗證，但 myTrips 連結需要修復。</p> : null}
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {status === 'repair-required' ? (
            <>
              <button type="button" data-testid="clone-demo-repair" onClick={onRepair} className="min-h-11 rounded-xl bg-amber-600 px-4 font-black text-white">
                修復 myTrips
              </button>
              <button type="button" data-testid="clone-demo-open-trip" onClick={onOpenTrip} className="min-h-11 rounded-xl border border-slate-300 px-4 font-black dark:border-slate-700">
                開啟已建立旅程
              </button>
            </>
          ) : null}
          {status === 'success' ? (
            <button type="button" data-testid="clone-demo-open-trip" onClick={onOpenTrip} className="min-h-11 rounded-xl bg-emerald-600 px-4 font-black text-white sm:col-span-2">
              開啟旅程
            </button>
          ) : null}
          {['idle', 'error', 'ambiguous'].includes(status) ? (
            <button
              type="button"
              data-testid="clone-demo-confirm"
              onClick={confirm}
              disabled={status === 'ambiguous'}
              className="min-h-11 rounded-xl bg-emerald-600 px-4 font-black text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              確認 Clone
            </button>
          ) : null}
          {status !== 'success' ? (
            <button
              type="button"
              data-testid="clone-demo-cancel"
              onClick={onCancel}
              disabled={loading}
              className="min-h-11 rounded-xl border border-slate-300 px-4 font-black disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700"
            >
              取消
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default CloneDemoDialog;
