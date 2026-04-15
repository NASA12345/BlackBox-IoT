import React from 'react';
import { cn } from '../utils';

export const Modal = ({ isOpen, onClose, title, children, size = 'md', className }) => {
  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black bg-opacity-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className={cn(
            'bg-white rounded-lg shadow-lg w-full max-h-[90vh] flex flex-col overflow-hidden',
            sizeClasses[size],
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors"
              aria-label="Close modal"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto min-h-0">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

export const ModalHeader = ({ children }) => (
  <div className="mb-4">{children}</div>
);

export const ModalBody = ({ children }) => (
  <div>{children}</div>
);

export const ModalFooter = ({ children }) => (
  <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
    {children}
  </div>
);
