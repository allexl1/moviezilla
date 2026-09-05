import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Shared Modal component — replaces all ad-hoc modal implementations.
 * Provides a consistent glass sheet with backdrop, close button, and escape handling.
 */
export default function Modal({
  isOpen,
  onClose,
  maxWidth = 'max-w-2xl',
  children,
  closeOnBackdrop = true,
  showCloseButton = true,
  maxHeight = 'max-h-[92vh]',
  align = 'center',
  panelClassName = '',
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const alignClass = align === 'top' ? 'cine-modal-backdrop--top' : '';

  return (
    <div className={`cine-modal-backdrop ${alignClass}`}>
      {closeOnBackdrop && (
        <div className="absolute inset-0" onClick={onClose} />
      )}

      <div
        className={`relative z-10 w-full ${maxWidth} ${maxHeight} rounded-3xl cine-glass-panel flex flex-col overflow-y-auto no-scrollbar animate-in fade-in duration-200 ${panelClassName}`}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="cine-icon-btn absolute top-4 right-4 z-30"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
