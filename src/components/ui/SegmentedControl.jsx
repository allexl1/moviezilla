import React from 'react';

/**
 * SegmentedControl — labeled group of exclusive chips (day / type filters).
 * Gives filter groups the labels the Watchlist blob was missing.
 */
export default function SegmentedControl({ label, options = [], value, onChange }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {label && (
        <span className="text-[11px] font-bold uppercase tracking-wider text-white/35 flex-shrink-0">
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
            className={`h-11 px-6 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 transition cursor-pointer border backdrop-blur-xl ${
              active
                ? 'bg-white text-black border-white shadow-md'
                : 'bg-[var(--cine-glass-tint)] hover:bg-[var(--cine-glass-tint-hover)] border-[var(--cine-glass-border)] text-white'
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
