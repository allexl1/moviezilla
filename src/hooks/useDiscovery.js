import { useState, useEffect, useRef } from 'react';
import { tmdb } from '../services/tmdb';
import { hasRating, isReleased, DATA_TTL } from '../services/catalog';

// Page-1 snapshots by filter key: remounts (detail closed, tab revisited)
// hydrate instantly instead of flashing skeletons. Only successes cache;
// failures always hit the network so Retry never replays stale data.
const discoveryCache = new Map();

// Shared discovery-catalog state machine for the Movies/Shows views.
// Extracted 1:1 from App's catalog effect during the route split:
// new tab/filters restart at page 1, page 2+ appends deduplicated,
// Released grids exclude future-dated and unrated titles (raw `items`
// stay untouched for hero + random + paging).
export function useDiscovery({ tab, genre, year, sort, provider, country, language, letterboxdUser }) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const prevFilterKey = useRef('');

  useEffect(() => {
    let isMounted = true;
    const filterKey = [tab, genre, year, sort, provider, country, language, letterboxdUser].join('|');

    // New tab/filters always restart from page 1 instead of appending.
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
      if (page !== 1) {
        setPage(1);
        return;
      }
    }

    async function load() {
      if (page > 1) setLoadingMore(true);
      else setCatalogLoading(true);
      try {
        const base = { page, genre, year, sort, provider, country, language };
        // Instant-back: page 1 within TTL reuses the last good payload.
        if (page === 1) {
          const hit = discoveryCache.get(filterKey);
          if (hit && Date.now() - hit.at < DATA_TTL) {
            if (isMounted) {
              setItems(hit.items);
              setTotalPages(hit.totalPages);
              setCatalogError('');
            }
            return;
          }
        }
        const res = tab === 'tv' ? await tmdb.getSeries(base) : await tmdb.getMovies(base);

        if (isMounted) {
          const list = (res?.results || []).filter((x) => x.poster_path);

          if (page === 1) {
            setItems(list);
            discoveryCache.set(filterKey, { items: list, totalPages: res?.total_pages || 1, at: Date.now() });
          } else {
            setItems((prev) => {
              const seen = new Set(prev.map((x) => x.id));
              return [...prev, ...list.filter((x) => !seen.has(x.id))];
            });
          }
          setTotalPages(res?.total_pages || 1);
          setCatalogError('');
        }
      } catch (err) {
        console.error('Failed to load catalog:', err);
        if (isMounted) setCatalogError("Couldn't load titles. Check your connection.");
      } finally {
        if (isMounted) {
          setLoadingMore(false);
          setCatalogLoading(false);
        }
      }
    }

    load();

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, genre, year, sort, provider, country, language, letterboxdUser, catalogRetry, page]);

  // Picks a random visible title into the detail view (does not autoplay).
  const pickRandom = (onPick) => {
    if (items.length === 0 || !onPick) return;
    onPick(items[Math.floor(Math.random() * items.length)]);
  };

  const releasedItems = items.filter((x) => isReleased(x, tab) && hasRating(x));

  return {
    items,
    totalCount: items.length,
    releasedItems,
    page,
    totalPages,
    loadingMore,
    catalogLoading,
    catalogError,
    retry: () => setCatalogRetry((c) => c + 1),
    nextPage: () => setPage((p) => p + 1),
    pickRandom,
  };
}
