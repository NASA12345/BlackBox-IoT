import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { ToastViewport } from '../lib/components/Toast';

const ToastContext = createContext();

const DEFAULT_DURATION = 3000;

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(({ title, description = '', variant = 'default', duration = DEFAULT_DURATION }) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    setToasts((prev) => [
      ...prev,
      {
        id,
        title,
        description,
        variant,
      },
    ]);

    if (duration > 0) {
      window.setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }, [dismissToast]);

  const value = useMemo(() => ({ toast, dismissToast }), [toast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};
