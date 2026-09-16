import { useState, useEffect, useCallback, useRef } from 'react';
import { DATA_TTL } from '../services/catalog';

// Module-scope cache: survives unmounts so detail-close remounts hydrate
// instantly (same pattern as the old per-view caches, now shared).
// LRU-capped: keys are per-filter rails, bounded so filter-hopping can't
// grow it without limit (insertion-order Map = cheapest LRU available).
const RAIL_CACHE_MAX = 24;
const railCache = new Map(); // key -> { at, items, page, hasMore }
function railCacheSet(key, value) {
  if (railCache.has(key)) railCache.delete(key);
  railCache.set(key, value);
  while (railCache.size > RAIL_CACHE_MAX) {
    railCache.delete(railCache.keys().next().value);
  }
}

// Paged shelf state machine for Coming Soon / On Air rails.
// - load(1) on mount (or restores a fresh cache)
// - loadMore() appends the next API page, deduplicated by id
// - fetchers must be stable references (module scope or useCallback);
//   pick is one of the catalog pickers (stable module functions).
// Stops when the API runs out of pages or a page yields nothing new
// (API order shifts between calls, so pure page counting isn't enough).
export function usePagedRail(key, fetcher, pick, active = true) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const [tick, setTick] = useState(0);
  const liveRef = useRef({ items: [], page: 1 });
  liveRef.current = { items, page };
  // Stale-response guard: Load-more taps fire overlapping pages; only the
  // latest may commit (unmount flags alone can't catch this).
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (p, append) => {
      const seq = ++seqRef.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(false);
      }
      try {
        const res = await fetcher(p);
        if (!mountedRef.current || seq !== seqRef.current) return;
        const picked = pick(res?.results || []);
        const prev = append ? liveRef.current.items : [];
        const fresh = picked.filter((x) => !prev.some((y) => y.id === x.id));
        const merged = [...prev, ...fresh];
        const more = p < (res?.total_pages || 1) && fresh.length > 0;
        setItems(merged);
        setPage(p);
        setHasMore(more);
        if (merged.length > 0) {
          railCacheSet(key, { at: Date.now(), items: merged, page: p, hasMore: more });
        }
      } catch (err) {
        console.error(`Failed to load rail ${key}:`, err);
        if (!mountedRef.current || seq !== seqRef.current) return;
        if (!append) setError(true);
      }
      if (!mountedRef.current || seq !== seqRef.current) return;
      if (append) setLoadingMore(false);
      else setLoading(false);
    },
    [key, fetcher, pick]
  );

  useEffect(() => {
    if (!active) return;
    if (tick === 0) {
      const hit = railCache.get(key);
      if (hit && Date.now() - hit.at < DATA_TTL && hit.items.length > 0) {
        setItems(hit.items);
        setPage(hit.page);
        setHasMore(hit.hasMore);
        setLoading(false);
        return;
      }
    } else {
      setItems([]);
      setPage(1);
      setHasMore(true);
    }
    load(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, active]);

  // hasMore/loadingMore as refs for the guard below (state in deps would
  // re-create loadMore every page, which re-triggers the rail observer).
  // The guard also lives in the rail — belt and suspenders against a
  // stuck observer double-firing past the end.
  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const loadMore = useCallback(() => {
    if (loadingMoreRef.current || !hasMoreRef.current) return;
    const cur = liveRef.current;
    load(cur.page + 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const retry = useCallback(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setTick((t) => t + 1);
  }, []);

  return { items, page, hasMore, loading, loadingMore, error, loadMore, retry };
}
