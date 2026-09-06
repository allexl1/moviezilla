import React from 'react';

/**
 * SegmentedControl — labeled group of exclusive options.
 * Two visual weights (Apple HIG prominence = importance):
 * - `lg`: primary View switcher (larger, bolder — one per screen).
 * - `sm`: subordinate inline filters (compact, clearly secondary).
 */
export default function SegmentedControl({ label, options = [], value, onChange, size = 'sm' }) {
  const sizing = size === 'lg'
    ? 'h-11 px-6 text-sm font-bold'
    : 'h-9 px-4 text-xs font-semibold';
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
            className={`${sizing} rounded-full whitespace-nowrap flex-shrink-0 transition cursor-pointer border backdrop-blur-xl ${
              active
                ? 'bg-white text-black border-white shadow-md'
                : 'bg-[var(--cine-glass-tint)] hover:bg-[var(--cine-glass-tint-hover)] border-[var(--cine-glass-border)] text-white/60 hover:text-white/90'
            }`}
            >
              {opt.name ?? opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
