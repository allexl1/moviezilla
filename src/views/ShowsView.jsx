import { useState, useEffect } from 'react';
import { TV_GENRES, TV_SORTS, tmdb } from '../services/tmdb';
import { pickUpcoming, pickAiring, getProviderOptions } from '../services/catalog';
import { useDiscovery } from '../hooks/useDiscovery';
import { usePagedRail } from '../hooks/usePagedRail';
import FilterBar from '../components/FilterBar';
import UpcomingRail from '../components/UpcomingRail';
import Card from '../components/ui/Card';
import { SkelGrid } from '../components/ui';

// Stable references for the paged rails (must not change identity across
// renders or the rails refetch in a loop).
const fetchUpcomingSeriesPage = (page) => tmdb.getUpcomingSeries({ page });
const pickUpcomingSeries = (results) => pickUpcoming(results, 'first_air_date');
const fetchOnAirPage = (page) => tmdb.getOnTheAir({ page });

// Shows route view: Coming Soon shelf (upcoming premieres) + released
// grid + paging. Owns its catalog (useDiscovery) and shelf; filters come
// from the shell so tab switches reset them exactly like before.
export default function ShowsView({ filters, onFilters, letterboxdUser, onSelectMedia }) {
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
  } = useDiscovery({ tab: 'tv', ...filters, letterboxdUser });

  // Coming Soon shelf: paged + infinite scroll (sentinel in the rail loads
  // the next discover page). On Air grid: same paging behind Load more.
  const {
    items: upcomingSeries,
    hasMore: upcomingHasMore,
    loading: upcomingLoading,
    loadingMore: upcomingLoadingMore,
    loadMore: loadMoreUpcoming,
  } = usePagedRail('shows-upcoming', fetchUpcomingSeriesPage, pickUpcomingSeries);
  // On Air mini-toggle: swaps the Released grid for what's airing right
  // now. Fetched lazily on first toggle, then cached like everything else.
  const [showAiring, setShowAiring] = useState(false);
  const {
    items: onAirToday,
    hasMore: onAirHasMore,
    loading: onAirLoading,
    loadingMore: onAirLoadingMore,
    loadMore: loadMoreOnAir,
  } = usePagedRail('shows-onair', fetchOnAirPage, pickAiring, showAiring);

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
            Shows
          </h1>

          <p className="text-sm text-white/60 mt-1">
            Explore hit series and episodic dramas
          </p>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-3">
        <FilterBar
          genres={TV_GENRES}
          sorts={TV_SORTS}
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
            extra={
              <button
                onClick={() => setShowAiring((v) => !v)}
                aria-pressed={showAiring}
                title="Show only series airing right now"
                className={`cine-pill${showAiring ? ' cine-pill--active' : ''}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${showAiring ? 'bg-black' : 'bg-[var(--cine-accent)]'}`} />
                On Air
              </button>
            }
          />
        </div>
      </div>

      <UpcomingRail
        title="Coming Soon"
        items={upcomingSeries}
        onSelect={onSelectMedia}
        mediaType="tv"
        badge="Coming Soon"
        dateKey="first_air_date"
        loading={upcomingLoading}
        onLoadMore={loadMoreUpcoming}
        loadingMore={upcomingLoadingMore}
        hasMore={upcomingHasMore}
      />
      <>
        <div className="cine-section-head">
          <h2 className="cine-section-title">{showAiring ? 'On The Air' : 'Released Series'}</h2>
          <span className="text-xs text-white/60">
            {showAiring
              ? `${onAirToday.length} titles • airing now`
              : `${releasedItems.length} titles • available now`}
          </span>
        </div>
        {(showAiring ? onAirLoading && onAirToday.length === 0 : catalogLoading && releasedItems.length === 0) ? (
          <SkelGrid count={12} />
        ) : (
          <>
            <div className="cine-grid">
              {(showAiring ? onAirToday : releasedItems).map((media) => (
                <Card
                  key={`${media.id}_${media.title || media.name}`}
                  media={showAiring ? { ...media, media_type: 'tv' } : media}
                  onClick={onSelectMedia}
                  size="fluid"
                  posterOnly
                />
              ))}
            </div>
            {(showAiring ? onAirToday : releasedItems).length === 0 && (
              <p className="text-center py-16 text-xs text-white/60">
                {showAiring ? 'Nothing on the air right now. Check back later.' : 'No titles found. Try clearing filters.'}
              </p>
            )}
          </>
        )}
      </>
      {(showAiring ? onAirHasMore : !showAiring && page < totalPages) && (showAiring ? onAirToday.length > 0 : totalCount > 0) && (
        <div className="flex justify-center py-10">
          <button
            onClick={showAiring ? loadMoreOnAir : nextPage}
            disabled={showAiring ? onAirLoadingMore : loadingMore}
            className="cine-control-btn disabled:opacity-50"
          >
            {(showAiring ? onAirLoadingMore : loadingMore) ? 'Loading…' : 'Load more'}
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
    </div>
  );
}
