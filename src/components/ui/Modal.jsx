import React, { useEffect, useRef } from 'react';
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
  label = 'Dialog',
}) {
  const panelRef = useRef(null);
  const restoreRef = useRef(null);

  const focusableIn = (root) =>
    [...(root?.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) || [])].filter((el) => !el.disabled && el.offsetParent !== null);

  useEffect(() => {
    if (!isOpen) return;

    // Restore focus to the opener on close.
    restoreRef.current = document.activeElement;
    const panel = panelRef.current;

    // Initial focus: first focusable control, else the panel itself.
    const initial = focusableIn(panel);
    (initial[0] || panel)?.focus?.();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      // Trap Tab inside the dialog.
      if (e.key !== 'Tab' || !panel) return;
      const items = focusableIn(panel);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      restoreRef.current?.focus?.();
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
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`relative z-10 w-full ${maxWidth} ${maxHeight} rounded-3xl cine-glass-panel flex flex-col overflow-y-auto no-scrollbar animate-in fade-in duration-200 ${panelClassName}`}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="cine-icon-btn absolute top-4 right-4 z-30"
            title="Close"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {children}
      </div>
    </div>
  );
}
