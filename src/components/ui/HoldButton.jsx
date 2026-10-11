import { useEffect, useRef, useState } from 'react';

// Hold-to-confirm (UI Phase 3, motion only): press and hold ~900ms to
// fire, release early to cancel. Replaces native confirm() dialogs and
// the delete-confirm modal branch — a deliberate sustained press can't
// happen by stray tap, and unlike a modal it never yanks context.
// Keyboard holds Enter/Space the same way (auto-repeat ignored, key-up
// cancels). No onClick: the hold is the only path, so a quick click
// can never confirm by accident. Styling rides the caller's classes;
// the fill is a neutral wash, the label keeps its own color.
const DEFAULT_HOLD_MS = 900;

export default function HoldButton({ onConfirm, holdMs = DEFAULT_HOLD_MS, className = '', children, ...rest }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const cancel = () => {
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  const start = (e) => {
    if (e.repeat) return;
    if ('button' in e && e.button !== 0) return;
    if (timer.current) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      onConfirm?.();
    }, holdMs);
  };
  return (
    <button
      type="button"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          start(e);
        }
      }}
      onKeyUp={cancel}
      onBlur={cancel}
      className={`${className} mz-hold`}
      {...rest}
    >
      <span
        aria-hidden="true"
        className="mz-hold-fill"
        data-on={holding}
        style={{ transitionDuration: `${holdMs}ms` }}
      />
      <span className="mz-hold-label">{children}</span>
    </button>
  );
}
