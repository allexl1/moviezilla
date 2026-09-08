import React from 'react';

/**
 * Skeleton shimmer blocks — loading states that look like the content
 * coming, instead of "Loading…" text. The .skel animation is killed
 * automatically by body.mz-max-power (thermal) and reduced-motion CSS.
 */
export function SkelPoster({ className = '' }) {
  return <div className={`skel aspect-[2/3] w-full rounded-[var(--cine-radius-2xl)] ${className}`} />;
}

export function SkelRail({ title = '', count = 6 }) {
  return (
    <section className="space-y-3" aria-hidden="true">
      {title ? <div className="skel h-5 w-40 rounded-full" /> : null}
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="w-40 md:w-44 flex-shrink-0">
            <SkelPoster />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SkelGrid({ count = 10 }) {
  return (
    <div className="cine-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <SkelPoster key={i} />
      ))}
    </div>
  );
}

export function SkelRow() {
  return (
    <div className="mat-row flex items-center gap-4 p-2.5" aria-hidden="true">
      <div className="skel w-12 h-16 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="skel h-3.5 w-2/3 rounded-full" />
        <div className="skel h-3 w-1/3 rounded-full" />
      </div>
    </div>
  );
}
