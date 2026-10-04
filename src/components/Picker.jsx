import { useState, useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

// Generic pop-up button (Apple HIG: one exclusive choice from a defined
// set — genre, year, sort, country, language). Glass value pill + fixed
// menu panel with checked rows. The panel portals to document.body so no
// ancestor (modal backdrop-filter, overflow scrollers) can trap, clip or
// re-anchor it. Page scrolls / resizes move the anchor, so the menu
// closes on those — scrolls INSIDE the menu list itself never close it.
export default function Picker({
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  ariaLabel = 'Choose an option',
  menuLabel = 'Options',
  renderLeft = null,
  maxOptions = 0,
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  // Unique per instance: two pickers can be open at once (FilterBar has
  // six), so a shared menu id would collide in the outside-click guards.
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) {
        // Flip above the button when the menu would run off the viewport
        // bottom (short screens, low rows like settings on phones).
        let top = r.bottom + 8;
        if (top + 320 > window.innerHeight) top = Math.max(8, r.top - 320);
        setPos({ top, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
      }
    };
    place();
    const close = () => setOpen(false);
    const onDown = (e) => {
      if (boxRef.current && boxRef.current.contains(e.target)) return;
      const panel = menuRef.current;
      if (panel && panel.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      const panel = menuRef.current;
      if (panel && (panel === e.target || panel.contains(e.target))) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open ]);

  const norm = (options || []).map((o) => ({
    value: o.value ?? o.id,
    label: o.label ?? o.name ?? String(o.value ?? o.id),
    raw: o,
  }));
  const list = maxOptions > 0 ? norm.slice(0, maxOptions) : norm;
  const current = norm.find((o) => String(o.value) === String(value));

  return (
    <div className="relative inline-block flex-shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`cine-pill ${current ? 'cine-pill--value' : ''}`}
      >
        <span className="truncate">{current ? current.label : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && createPortal(
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={menuLabel}
          className="p-2 rounded-3xl cine-glass-panel"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 224, zIndex: 100 }}
        >
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {list.map((o) => {
              const active = String(o.value) === String(value);
              return (
                <button
                  key={String(o.value) || 'all'}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className="mat-row w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer"
                >
                  {renderLeft ? renderLeft(o.raw, active) : null}
                  <span className={`flex-1 text-[13px] font-semibold truncate ${active ? 'text-white' : 'text-white/75'}`}>
                    {o.label}
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-[var(--cine-accent)] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
