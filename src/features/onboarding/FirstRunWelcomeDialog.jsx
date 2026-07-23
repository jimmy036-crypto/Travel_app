import { useEffect, useRef, useState } from 'react';

const STEPS = [
  {
    title: '歡迎使用智能旅行管理',
    description: '把每日行程、景點、旅伴、票券、記帳與清單集中在同一個旅程中。',
  },
  {
    title: '先用東京範例快速了解',
    description: '內建三日示範為唯讀資料，不會同步、不會建立雲端旅程，也不會修改你的資料。',
  },
  {
    title: '建立自己的旅程',
    description: '設定日期與旅伴後，就能安排每天行程並共同管理旅遊資訊。',
  },
  {
    title: '多人協作與離線查看',
    description: '正式旅程支援即時同步；最近開啟的旅程可使用唯讀離線預覽，也能在瀏覽器支援時將網站加入主畫面。',
  },
];

const getInitialStep = (value) => (
  Number.isInteger(value) && value >= 0 && value < STEPS.length ? value : 0
);

export default function FirstRunWelcomeDialog({
  t,
  initialStep = 0,
  mode = 'first-run',
  onOpenDemo,
  onCreateTrip,
  onSkip,
  onClose,
}) {
  const isReplay = mode === 'replay';
  const [step, setStep] = useState(() => getInitialStep(initialStep));
  const dialogRef = useRef(null);
  const completedRef = useRef(false);
  const closeCallback = isReplay ? (onClose || onSkip) : onSkip;
  const callbacksRef = useRef({ onOpenDemo, onCreateTrip, onClose: closeCallback });

  useEffect(() => {
    callbacksRef.current = { onOpenDemo, onCreateTrip, onClose: closeCallback };
  }, [closeCallback, onCreateTrip, onOpenDemo]);

  const finishOnce = (callback) => {
    if (completedRef.current) return;
    completedRef.current = true;
    callback?.();
  };

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = dialogRef.current?.querySelector(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finishOnce(callbacksRef.current.onClose);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableItems = Array.from(dialogRef.current?.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) || []);
      if (!focusableItems.length) return;
      const first = focusableItems[0];
      const last = focusableItems[focusableItems.length - 1];
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
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const current = STEPS[step];
  const finalStep = step === STEPS.length - 1;
  const translate = typeof t === 'function' ? t : (value) => value;
  const testIdPrefix = isReplay ? 'feature-introduction' : 'first-run';
  const titleId = `${testIdPrefix}-title`;
  const descriptionId = `${testIdPrefix}-description`;

  return (
    <div
      className="fixed inset-0 z-[10070] flex items-center justify-center overflow-x-hidden bg-slate-950/60 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-6"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      data-testid={isReplay ? 'feature-introduction-dialog' : 'first-run-welcome-dialog'}
      data-mode={isReplay ? 'replay' : 'first-run'}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <section
        ref={dialogRef}
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-3xl border border-white/20 bg-white text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-slate-100"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-6" data-testid={`${testIdPrefix}-progress`}>
            <p className="mb-2 text-sm font-semibold text-violet-700 dark:text-violet-300">
              第 {step + 1} / {STEPS.length} 步
            </p>
            <div
              className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
              role="progressbar"
              aria-label={`第 ${step + 1} / ${STEPS.length} 步`}
              aria-valuemin={1}
              aria-valuemax={STEPS.length}
              aria-valuenow={step + 1}
            >
              <div
                className="h-full rounded-full bg-violet-600 transition-[width]"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="min-w-0 break-words" data-testid={`${testIdPrefix}-step`}>
            <p className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300">
              {translate('首次使用介紹')}
            </p>
            <h2 id={titleId} className="break-words text-2xl font-black sm:text-3xl">
              {translate(current.title)}
            </h2>
            <p id={descriptionId} className="mt-4 break-words text-base leading-7 text-slate-600 dark:text-slate-300">
              {translate(current.description)}
            </p>
          </div>
        </div>

        <footer
          className="grid shrink-0 grid-cols-1 gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:grid-cols-2 sm:px-8 dark:border-slate-700 dark:bg-slate-950/40"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          {step > 0 ? (
            <button
              type="button"
              data-testid={`${testIdPrefix}-back`}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 font-bold dark:border-slate-600"
            >
              {translate('返回')}
            </button>
          ) : null}

          {!finalStep ? (
            <button
              type="button"
              data-testid={`${testIdPrefix}-next`}
              onClick={() => setStep((value) => Math.min(STEPS.length - 1, value + 1))}
              className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 font-bold text-white hover:bg-violet-700"
            >
              {translate('下一步')}
            </button>
          ) : (
            <>
              <button
                type="button"
                data-testid={`${testIdPrefix}-open-demo`}
                onClick={() => finishOnce(onOpenDemo)}
                className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 font-bold text-white hover:bg-violet-700"
              >
                {translate('查看東京示範')}
              </button>
              <button
                type="button"
                data-testid={`${testIdPrefix}-create-trip`}
                onClick={() => finishOnce(onCreateTrip)}
                className="min-h-11 rounded-xl border border-violet-300 px-4 py-2 font-bold text-violet-800 dark:border-violet-700 dark:text-violet-200"
              >
                {translate('建立我的第一個旅程')}
              </button>
            </>
          )}

          <button
            type="button"
            data-testid={isReplay ? 'feature-introduction-close' : 'first-run-skip'}
            aria-label={isReplay ? '關閉功能介紹' : undefined}
            onClick={() => finishOnce(closeCallback)}
            className="min-h-11 rounded-xl px-4 py-2 font-bold text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {translate('略過介紹')}
          </button>
        </footer>
      </section>
    </div>
  );
}
