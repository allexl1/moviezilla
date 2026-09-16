
/**
 * SegmentedControl — labeled group of exclusive options.
 * Two visual weights (Apple HIG prominence = importance):
 * - `lg`: primary View switcher (larger, bolder — one per screen).
 * - `sm`: subordinate inline filters (compact, clearly secondary).
 */
export default function SegmentedControl({ label, options = [], value, onChange, size = 'sm' }) {
  const sizing = size === 'lg' ? 'cine-pill cine-pill--lg' : 'cine-pill';
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {label && (
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/50 flex-shrink-0">
          {label}
        </span>
      )}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {options.map((opt) => {
          const active = value === (opt.id ?? opt.value);
          return (
            <button
              key={opt.id ?? opt.value}
              onClick={() => onChange(opt.id ?? opt.value)}
              aria-pressed={active}
              className={`${sizing}${active ? ' cine-pill--active' : ''}`}
            >
              {opt.name ?? opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
