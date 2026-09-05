import React from 'react';

/**
 * Row — glass list row (search results, history, menus).
 * Thumb + title + meta + right slot. One recipe everywhere.
 */
export default function Row({
  poster,
  title,
  meta,
  right,
  onClick,
  thumbClassName = 'w-12 h-16',
}) {
  return (
    <div
      onClick={onClick}
      className="mat-row flex items-center gap-4 p-2.5 transition cursor-pointer group"
    >
      <div className={`${thumbClassName} rounded-xl overflow-hidden bg-black/50 flex-shrink-0`}>
        <img
          src={poster}
          alt={title}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition"
          onError={(e) => {
            e.target.src =
              'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=500&q=80';
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-xs md:text-sm font-semibold text-white/90 truncate">{title}</h4>
        {meta && <p className="text-[11px] text-white/40 mt-0.5 truncate">{meta}</p>}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
