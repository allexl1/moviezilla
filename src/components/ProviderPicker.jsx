import { useState, useEffect, useRef, useId } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { tmdb } from '../services/tmdb';
import { PROVIDERS } from '../services/catalog';

// Provider pop-up button (Apple HIG: one exclusive choice from a small
// well-defined set = pop-up button, not segments, not a native select).
// One component everywhere a provider is picked (Home rail, Movies/Shows
// filters): glass pill shows the current value + chevron, the menu is the
// same panel + checked-row language as ServerSwitcher, rows carry the real
// service logos (color dot fallback while they load).
// The panel is position:fixed anchored to the button so it escapes
// overflow-x scrollers (FilterBar) instead of clipping inside them.
let logoMapPromise = null;
function getLogoMap() {
  if (!logoMapPromise) {
    logoMapPromise = tmdb
      .getProviders()
      .then((list) => {
        const map = {};
        for (const p of list || []) {
          if (p.id && p.logo) map[String(p.id)] = p.logo;
        }
        return map;
      })
      .catch(() => ({}));
  }
  return logoMapPromise;
}

export default function ProviderPicker({ value, onChange, options = PROVIDERS, placeholder = 'Provider' }) {
  const [open, setOpen] = useState(false);
  const [logos, setLogos] = useState({});
  const [pos, setPos] = useState(null);
  const boxRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  useEffect(() => {
    let alive = true;
    getLogoMap().then((map) => {
      if (alive) setLogos(map);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = boxRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - 232)) });
    };
    place();
    const close = () => setOpen(false);
    // Page scrolls move the anchor, so the fixed panel must close — but
    // scrolls INSIDE the menu list itself must never close it.
    const onScroll = (e) => {
      const panel = menuRef.current;
      if (panel && (panel === e.target || panel.contains(e.target))) return;
      setOpen(false);
    };
    const onDown = (e) => {
      if (boxRef.current && boxRef.current.contains(e.target)) return;
      const panel = menuRef.current;
      if (panel && panel.contains(e.target)) return;
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

  const current = options.find((p) => String(p.id) === String(value));
  // Menus must stay scannable (HIG: balance length with ease of use).
  // Catalogs arrive priority-sorted — keep the clear-all row + top 12.
  const blank = options.filter((p) => String(p.id) === '');
  const rest = options.filter((p) => String(p.id) !== '').slice(0, 12);
  const rows = [...blank, ...rest];

  return (
    <div className="relative inline-block flex-shrink-0" ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Choose streaming provider"
        className={`cine-pill ${current ? 'cine-pill--value' : ''}`}
      >
        {current ? current.name : placeholder}
        <ChevronDown className={`w-3.5 h-3.5 text-white/50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && pos && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label="Streaming providers"
          className="p-2 rounded-3xl cine-glass-panel"
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 224, zIndex: 70 }}
        >
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {rows.map((p) => {
              const active = String(p.id) === String(value);
              const logo = logos[String(p.id)];
              return (
                <button
                  key={String(p.id) || 'all'}
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => {
                    onChange(p.id);
                    setOpen(false);
                  }}
                  className="mat-row w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left cursor-pointer"
                >
                  {logo ? (
                    <img
                      src={tmdb.getImageUrl(logo, 'w185')}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                      className="w-6 h-6 rounded-md object-cover flex-shrink-0"
                    />
                  ) : p.color ? (
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: p.color }}
                      aria-hidden="true"
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full flex-shrink-0 bg-white/25" aria-hidden="true" />
                  )}
                  <span className={`flex-1 text-[13px] font-semibold truncate ${active ? 'text-white' : 'text-white/75'}`}>
                    {p.name}
                  </span>
                  {active && <Check className="w-3.5 h-3.5 text-[var(--cine-accent)] flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
