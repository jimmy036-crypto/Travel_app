import React from 'react';
import { EmptyState } from './EmptyState.jsx';
import {
  SkeletonAvatar,
  SkeletonButton,
  SkeletonCard,
  SkeletonText,
} from './Skeleton.jsx';
import { useConfirm } from './useConfirm.js';
import { useGlobalModal } from './useGlobalModal.js';
import { useToast } from './useToast.js';

export default function UXFoundationDemo() {
  const toast = useToast();
  const confirm = useConfirm();
  const { showLoading, hideLoading, openModal, closeModal } = useGlobalModal();

  const runLoadingDemo = () => {
    showLoading({ message: '正在準備 UX Foundation...', progress: 64 });
    window.setTimeout(() => hideLoading(), 700);
  };

  const runConfirmDemo = async () => {
    const ok = await confirm({
      title: '確認套用 UX Foundation？',
      description: '這是 Promise API 範例，確認或取消都會回傳布林值。',
      confirmLabel: '套用',
      cancelLabel: '取消',
      danger: false,
    });

    toast.info({
      title: ok ? 'Confirm resolved: true' : 'Confirm resolved: false',
      description: 'Promise confirm 已完成。',
      duration: 2500,
    });
  };

  return (
    <main
      data-testid="ux-foundation-demo"
      className="min-h-dvh bg-slate-100 p-5 text-slate-950 md:p-8"
    >
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 border-b border-slate-300 pb-5">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600">
            Development only
          </p>
          <h1 className="text-3xl font-black">UX Foundation Demo</h1>
          <p className="max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            Toast, Loading, Confirm, Skeleton, Empty State, and Global Modal foundation components.
          </p>
        </header>

        <section className="grid gap-4 rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Toast</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            {['success', 'info', 'warning', 'error'].map((type) => (
              <button
                key={type}
                type="button"
                data-testid={`demo-toast-${type}`}
                onClick={() => toast[type]({
                  title: `${type} toast`,
                  description: '最多同時顯示三個通知。',
                  duration: 0,
                  action: type === 'info'
                    ? {
                        label: 'Action',
                        onClick: () => toast.success({ title: 'Action clicked', duration: 1500 }),
                      }
                    : null,
                })}
                className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white"
              >
                {type}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-300 bg-white p-5 shadow-sm md:grid-cols-2">
          <div>
            <h2 className="text-xl font-black">Loading and Confirm</h2>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="demo-loading"
                onClick={runLoadingDemo}
                className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
              >
                Show loading
              </button>
              <button
                type="button"
                data-testid="demo-confirm"
                onClick={() => void runConfirmDemo()}
                className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-black text-white"
              >
                Confirm
              </button>
              <button
                type="button"
                data-testid="demo-global-modal"
                onClick={() => openModal({
                  content: (
                    <div>
                      <h2 className="text-xl font-black">Global Modal</h2>
                      <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        ModalProvider keeps one global modal slot active.
                      </p>
                      <button
                        type="button"
                        data-testid="demo-global-modal-close"
                        onClick={closeModal}
                        className="mt-5 min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-black text-white"
                      >
                        Close
                      </button>
                    </div>
                  ),
                })}
                className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-black"
              >
                Global modal
              </button>
            </div>
          </div>

          <EmptyState
            icon="∅"
            title="目前沒有資料"
            description="這是共用 EmptyState，可放入主要與次要動作。"
            primaryAction={{
              label: '建立資料',
              onClick: () => toast.success({ title: 'Empty primary action', duration: 1500 }),
            }}
            secondaryAction={{
              label: '稍後再說',
              onClick: () => toast.info({ title: 'Empty secondary action', duration: 1500 }),
            }}
          />
        </section>

        <section className="grid gap-4 rounded-3xl border border-slate-300 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-black">Skeleton</h2>
          <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
            <SkeletonAvatar />
            <SkeletonText lines={3} />
            <SkeletonButton />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </section>
      </div>
    </main>
  );
}
