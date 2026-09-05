import React from 'react';

/**
 * Input — labeled glass text input. One recipe for all forms.
 */
export default function Input({
  label,
  hint,
  ...props
}) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="text-xs font-semibold text-white/80">{label}</label>
      )}
      <input className="cine-input" {...props} />
      {hint && <p className="text-[11px] text-white/40">{hint}</p>}
    </div>
  );
}
