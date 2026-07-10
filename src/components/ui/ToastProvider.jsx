import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ToastViewport } from './ToastViewport.jsx';
import { ToastContext } from './toastContext.js';

const DEFAULT_DURATION = 4500;
const MAX_TOASTS = 3;

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((type, options = {}) => {
    const id = createToastId();
    const toast = {
      id,
      type,
      title: options.title || '',
      description: options.description || '',
      action: options.action || null,
    };

    setToasts((current) => [toast, ...current].slice(0, MAX_TOASTS));

    const duration = Number(options.duration ?? DEFAULT_DURATION);
    if (duration > 0) {
      const timer = window.setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    }

    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    show,
    dismiss,
    success: (options) => show('success', options),
    info: (options) => show('info', options),
    warning: (options) => show('warning', options),
    error: (options) => show('error', options),
  }), [dismiss, show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};
