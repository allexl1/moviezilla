import React, { useState, useEffect } from 'react';
import { MOVIE_GENRES, SORTS, tmdb } from '../services/tmdb';
import { pickUpcoming, DATA_TTL } from '../services/catalog';
import { useDiscovery } from '../hooks/useDiscovery';
import FilterBar from '../components/FilterBar';
import UpcomingRail from '../components/UpcomingRail';
import Card from '../components/ui/Card';
import { SkelGrid } from '../components/ui';

// Non-empty payloads cache briefly so detail-close remounts hydrate
// instantly instead of popping the shelf in late. Module scope: survives
// unmounts, unlike component state.
let upcomingCache = { at: 0, items: [] };

// Movies route view: Coming Soon shelf + released grid + paging.
// Owns its catalog (useDiscovery) and upcoming shelf; filters come from
// the shell so tab switches reset them exactly like before.
export default function MoviesView({ filters, onFilters, letterboxdUser, onSelectMedia }) {
  const {
    totalCount,
    releasedItems,
    page,
    totalPages,
    loadingMore,
    catalogLoading,
    catalogError,
    retry,
    nextPage,
    pickRandom,
  } = useDiscovery({ tab: 'movie', ...filters, letterboxdUser });

  const [upcomingMovies, setUpcomingMovies] = useState([]);
  const [upcomingError, setUpcomingError] = useState(false);
  const [upcomingTick, setUpcomingTick] = useState(0);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  // Same catalog as the home wall: a service tapped on Home must exist
  // in this filter (falls back to the short list until it resolves).
  const [providerOptions, setProviderOptions] = useState([]);
  useEffect(() => {
    let on = true;
    tmdb
      .getProviders()
      .then((list) => {
        if (on) setProviderOptions(list.map(({ id, name }) => ({ id, name })));
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);

  // Movies keeps its own Upcoming shelf fresh. A failed fetch surfaces a
  // retry instead of silently vanishing (UpcomingRail returns null on
  // empty — without this the user just sees nothing).
  useEffect(() => {
    let isMounted = true;
    setUpcomingError(false);
    setUpcomingLoading(true);
    if (Date.now() - upcomingCache.at < DATA_TTL && upcomingCache.items.length > 0) {
      setUpcomingMovies(upcomingCache.items);
      setUpcomingLoading(false);
      return () => {
        isMounted = false;
      };
    }
    tmdb
      .getUpcoming()
      .then((res) => {
        if (!isMounted) return;
        const picked = pickUpcoming(res?.results);
        setUpcomingMovies(picked);
        if (picked.length > 0) upcomingCache = { at: Date.now(), items: picked };
      })
      .catch((err) => {
        console.error('Failed to load upcoming rail:', err);
        if (isMounted) setUpcomingError(true);
      })
      .finally(() => {
        if (isMounted) setUpcomingLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [upcomingTick]);

  return (
    <>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex-shrink-0">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight">
            Movies
          </h1>

          <p className="text-sm text-white/60 mt-1">
            Discover new movies to watch
          </p>
        </div>

        <FilterBar
          genres={MOVIE_GENRES}
          sorts={SORTS}
          providers={providerOptions.length > 0 ? providerOptions : undefined}
          selectedGenre={filters.genre}
          onSelectGenre={(v) => onFilters({ genre: v })}
          selectedYear={filters.year}
          onSelectYear={(v) => onFilters({ year: v })}
          selectedSort={filters.sort}
          onSelectSort={(v) => onFilters({ sort: v })}
          selectedProvider={filters.provider}
          onSelectProvider={(v) => onFilters({ provider: v })}
          selectedCountry={filters.country}
          onSelectCountry={(v) => onFilters({ country: v })}
          selectedLanguage={filters.language}
          onSelectLanguage={(v) => onFilters({ language: v })}
          onRandom={() => pickRandom(onSelectMedia)}
        />
      </div>

      <UpcomingRail
        title="Coming Soon"
        items={upcomingMovies}
        onSelect={onSelectMedia}
        mediaType="movie"
        badge="Coming Soon"
        dateKey="release_date"
        loading={upcomingLoading}
      />
      {upcomingMovies.length === 0 && upcomingError && (
        <div className="flex items-center justify-center gap-3 py-6 text-xs text-white/60">
          <span>Couldn't load Coming Soon. Check your connection or API key.</span>
          <button
            onClick={() => setUpcomingTick((t) => t + 1)}
            className="cine-control-btn"
          >
            Retry
          </button>
        </div>
      )}
      <>
        <div className="cine-section-head">
          <h2 className="cine-section-title">Released Movies</h2>
          <span className="text-xs text-white/60">
            {releasedItems.length} titles • available now
          </span>
        </div>
        {catalogLoading && releasedItems.length === 0 ? (
          <SkelGrid count={12} />
        ) : (
          <>
            <div className="cine-grid">
              {releasedItems.map((media) => (
                <Card
                  key={`${media.id}_${media.title || media.name}`}
                  media={media}
                  onClick={onSelectMedia}
                  size="fluid"
                  posterOnly
                />
              ))}
            </div>
            {releasedItems.length === 0 && (
              <p className="text-center py-16 text-xs text-white/60">
                No titles found. Try clearing filters.
              </p>
            )}
          </>
        )}
      </>
      {page < totalPages && totalCount > 0 && (
        <div className="flex justify-center py-10">
          <button
            onClick={nextPage}
            disabled={loadingMore}
            className="cine-control-btn disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
      {catalogError && (
        <div className="flex items-center justify-center gap-3 py-6 text-xs text-white/60">
          <span>{catalogError}</span>
          <button
            onClick={retry}
            className="cine-control-btn"
          >
            Retry
          </button>
        </div>
      )}
    </>
  );
}
