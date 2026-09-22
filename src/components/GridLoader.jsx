import { useEffect, useRef } from 'react';

// Infinity loading mark — the infinite-scroll signature (user asked for
// "a horizontal 8 that is active"). Accent stroke, marching dash; idle it
// rests dim as a "more below" affordance.
export function InfinityMark({ label = 'Loading more', idle = false }) {
  return (
    <span
      className={`cine-infinity${idle ? ' cine-infinity--idle' : ''}`}
      role={idle ? undefined : 'status'}
      aria-label={idle ? undefined : label}
      aria-hidden={idle || undefined}
    >
      <svg viewBox="0 0 24 12" aria-hidden="true">
        <path d="M12 6C10.8 4 9.2 2.5 7.3 2.5 4.9 2.5 3 4.2 3 6s1.9 3.5 4.3 3.5c1.9 0 3.5-1.5 4.7-3.5Zm0 0c1.2 2 2.8 3.5 4.7 3.5 2.4 0 4.3-1.7 4.3-3.5S19.1 2.5 16.7 2.5c-1.9 0-3.5 1.5-4.7 3.5Z" />
      </svg>
    </span>
  );
}

// Bottom sentinel: fires onMore as it nears the viewport, with a cooldown
// so appended pages (which keep it visible) load steadily instead of
// stampeding. Renders the infinity mark while a page is in flight.
export default function GridLoader({ hasMore, loading = false, onMore = null }) {
  const ref = useRef(null);
  // Mirrors for the observer closure — assigned in an effect (never during
  // render) so the sentinel always sees fresh props without re-subscribing.
  const loadingRef = useRef(loading);
  const onMoreRef = useRef(onMore);
  useEffect(() => {
    loadingRef.current = loading;
    onMoreRef.current = onMore;
  });

  useEffect(() => {
    if (!hasMore) return undefined;
    const el = ref.current;
    if (!el) return undefined;
    let cooling = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingRef.current && !cooling) {
          cooling = true;
          onMoreRef.current?.();
          setTimeout(() => {
            cooling = false;
          }, 1500);
        }
      },
      { rootMargin: '0px 0px 900px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  if (!hasMore) return null;
  return (
    <div ref={ref} className="flex justify-center py-8">
      <InfinityMark idle={!loading} />
    </div>
  );
}
