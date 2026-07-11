import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import { LoadingOverlay } from './LoadingOverlay.jsx';
import { GlobalModalContext } from './globalModalContext.js';

export const GlobalModalProvider = ({ children }) => {
  const [loadingState, setLoadingState] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [modalState, setModalState] = useState(null);
  const confirmResolverRef = useRef(null);

  const closeModal = useCallback(() => {
    setModalState(null);
  }, []);

  const openModal = useCallback((modal) => {
    setModalState(modal || null);
    return closeModal;
  }, [closeModal]);

  const showLoading = useCallback((options = {}) => {
    setLoadingState({
      message: options.message || '載入中...',
      progress: options.progress ?? null,
    });
  }, []);

  const hideLoading = useCallback(() => {
    setLoadingState(null);
  }, []);

  const confirm = useCallback((options = {}) => new Promise((resolve) => {
    confirmResolverRef.current?.(false);
    confirmResolverRef.current = resolve;
    setModalState(null);
    setConfirmState({
      title: options.title || '確認操作',
      description: options.description || '',
      confirmLabel: options.confirmLabel || options.confirm || '確認',
      cancelLabel: options.cancelLabel || options.cancel || '取消',
      danger: Boolean(options.danger),
    });
  }), []);

  const resolveConfirm = useCallback((value) => {
    const resolver = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmState(null);
    resolver?.(Boolean(value));
  }, []);

  const api = useMemo(() => ({
    openModal,
    closeModal,
    showLoading,
    hideLoading,
    confirm,
  }), [closeModal, confirm, hideLoading, openModal, showLoading]);

  return (
    <GlobalModalContext.Provider value={api}>
      {children}
      {modalState?.content ? (
        <div
          data-testid="global-modal"
          className="fixed inset-0 z-[10075] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={closeModal}
        >
          <section
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-slate-950 shadow-2xl dark:border-white/10 dark:bg-slate-950 dark:text-white"
            onClick={(event) => event.stopPropagation()}
          >
            {modalState.content}
          </section>
        </div>
      ) : null}
      <ConfirmDialog
        open={Boolean(confirmState)}
        {...(confirmState || {})}
        onConfirm={() => resolveConfirm(true)}
        onCancel={() => resolveConfirm(false)}
      />
      <LoadingOverlay
        visible={Boolean(loadingState)}
        message={loadingState?.message}
        progress={loadingState?.progress}
      />
    </GlobalModalContext.Provider>
  );
};
