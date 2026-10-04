import { useState, useEffect } from 'react';
import { MOVIE_GENRES, SORTS, tmdb } from '../services/tmdb';
import { upgradeTopRatings } from '../services/ratings';
import { pickUpcoming, getProviderOptions } from '../services/catalog';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePagedRail } from '../hooks/usePagedRail';
import FilterBar from '../components/FilterBar';
import UpcomingRail from '../components/UpcomingRail';
import GridLoader from '../components/GridLoader';
import Card from '../components/ui/Card';
import { SkelGrid } from '../components/ui';

// Stable fetcher reference for the paged rail (must not change identity
// across renders or the rail refetches in a loop).
const fetchUpcomingMovies = (page) => tmdb.getUpcoming({ page });

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

  // Coming Soon shelf: paged + infinite scroll (sentinel in the rail loads
  // the next TMDB page). Shared hook owns items/page/cache/retry.
  const {
    items: upcomingMovies,
    hasMore: upcomingHasMore,
    loading: upcomingLoading,
    loadingMore: upcomingLoadingMore,
    error: upcomingError,
    loadMore: loadMoreUpcoming,
    retry: retryUpcoming,
  } = usePagedRail('movies-upcoming', fetchUpcomingMovies, pickUpcoming);
  // Top Rated IMDb upgrade: TMDB orders instantly, first visible cards
  // upgrade to exact-ID IMDb figures where they resolve (TMDB fallback).
  const [imdbMap, setImdbMap] = useState({});
  useEffect(() => {
    if (filters.sort !== 'vote_average.desc' || releasedItems.length === 0) return;
    let alive = true;
    upgradeTopRatings(releasedItems, 'movie', (t, id) => tmdb.getMediaDetails(t, id)).then((m) => {
      if (alive) setImdbMap(m);
    });
    return () => { alive = false; };
  }, [filters.sort, releasedItems, page]);
  // Display order: on Top Rated the badges may show upgraded IMDb
  // figures, so re-sort loaded items by the DISPLAYED number — otherwise
  // the grid reads unsorted (8.4, 8.2, 9.5). Other sorts keep API order.
  const ratingOf = (m) => imdbMap[m.id] ?? m.vote_average ?? 0;
  const displayItems =
    filters.sort === 'vote_average.desc'
      ? [...releasedItems].sort((a, b) => ratingOf(b) - ratingOf(a))
      : releasedItems;
  // Same catalog as the home wall: a service tapped on Home must exist
  // in this filter (falls back to the short list until it resolves).
  const [providerOptions, setProviderOptions] = useState([]);
  useEffect(() => {
    let on = true;
    getProviderOptions().then((list) => {
      if (on) setProviderOptions(list);
    });
    return () => {
      on = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-10">
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
        onLoadMore={loadMoreUpcoming}
        loadingMore={upcomingLoadingMore}
        hasMore={upcomingHasMore}
      />
      {upcomingMovies.length === 0 && upcomingError && (
        <div className="flex items-center justify-center gap-3 py-6 text-xs text-white/60">
          <span>Couldn't load Coming Soon. Check your connection or API key.</span>
          <button
            onClick={retryUpcoming}
            className="cine-control-btn"
          >
            Retry
          </button>
        </div>
      )}
      <>
        <section className="space-y-3">
        <div className="cine-section-head">
          <h2 className="cine-section-title cine-section-title--lg">Released Movies</h2>
        </div>
        {catalogLoading && releasedItems.length === 0 ? (
          <SkelGrid count={12} />
        ) : (
          <>
            <div className="cine-grid">
              {displayItems.map((media) => (
                <Card
                  key={`${media.id}_${media.title || media.name}`}
                  media={media}
                  onClick={onSelectMedia}
                  size="fluid"
                  posterOnly
                  imdb={imdbMap[media.id] ?? null}
                />
              ))}
            </div>
            {displayItems.length === 0 && (
              <p className="text-center py-16 text-xs text-white/60">
                No titles found. Try clearing filters.
              </p>
            )}
          </>
        )}
        </section>
      </>
      <GridLoader
        hasMore={page < totalPages && totalCount > 0}
        loading={loadingMore}
        onMore={nextPage}
      />
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
    </div>
  );
}
