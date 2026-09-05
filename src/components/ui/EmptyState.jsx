import React from 'react';

/**
 * EmptyState — centered glass empty state (lists, results, history).
 */
export default function EmptyState({ icon, title, description, action }) {
  return (
    <div className="rounded-3xl cine-glass-panel p-10 text-center space-y-3">
      {icon && (
        <div className="w-12 h-12 mx-auto rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
          {icon}
        </div>
      )}
      <p className="text-sm font-bold text-white">{title}</p>
      {description && <p className="text-xs text-white/40 max-w-sm mx-auto">{description}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
