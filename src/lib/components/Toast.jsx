import React from 'react';
import { cn } from '../utils';

const toastVariants = {
  default: 'border-slate-200 bg-white text-slate-900',
  success: 'border-green-200 bg-green-50 text-green-900',
  destructive: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-yellow-200 bg-yellow-50 text-yellow-900',
};

const ToastItem = ({ toast, onDismiss }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto w-full rounded-lg border shadow-lg backdrop-blur px-4 py-3',
        'transition-all duration-200 ease-out',
        toastVariants[toast.variant] || toastVariants.default
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          {toast.title && <p className="text-sm font-semibold leading-5">{toast.title}</p>}
          {toast.description && <p className="mt-1 text-sm opacity-90">{toast.description}</p>}
        </div>
        <button
          type="button"
          onClick={() => onDismiss(toast.id)}
          className="text-xs font-medium opacity-70 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export const ToastViewport = ({ toasts, onDismiss }) => {
  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
