import React from 'react';

/**
 * Shared Select component — replaces all ad-hoc dropdown implementations.
 * Styled to match the glass aesthetic with a custom chevron.
 */
export default function Select({
  value,
  onChange,
  options = [],
  className = '',
}) {
  return (
    <div className="relative flex-shrink-0">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`cine-select ${className}`}
      >
        {options.map((opt) => (
          <option key={opt.id ?? opt.value} value={opt.id ?? opt.value}>
            {opt.name ?? opt.label ?? opt.value}
          </option>
        ))}
      </select>
    </div>
  );
}
