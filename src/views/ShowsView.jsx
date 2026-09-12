import React, { useState, useEffect } from 'react';
import { TV_GENRES, TV_SORTS, tmdb } from '../services/tmdb';
import { pickUpcoming, pickAiring, DATA_TTL } from '../services/catalog';
import { useDiscovery } from '../hooks/useDiscovery';
import FilterBar from '../components/FilterBar';
import UpcomingRail from '../components/UpcomingRail';
import Card from '../components/ui/Card';
import { SkelGrid } from '../components/ui';

// Non-empty payloads cache briefly so detail-close remounts hydrate
// instantly. Module scope: survives unmounts.
let seriesCache = { at: 0, items: [] };
let airCache = { at: 0, items: [] };

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

  const [upcomingSeries, setUpcomingSeries] = useState([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);
  // On Air mini-toggle: swaps the Released grid for what's airing right
  // now. Fetched lazily on first toggle, then cached like everything else.
  const [showAiring, setShowAiring] = useState(false);
  const [onAirToday, setOnAirToday] = useState([]);
  const [onAirLoading, setOnAirLoading] = useState(false);
  useEffect(() => {
    if (!showAiring) return;
    let on = true;
    if (Date.now() - airCache.at < DATA_TTL && airCache.items.length > 0) {
      setOnAirToday(airCache.items);
      return () => {
        on = false;
      };
    }
    setOnAirLoading(true);
    tmdb
      .getOnTheAir()
      .then((res) => {
        if (!on) return;
        const picked = pickAiring(res?.results);
        setOnAirToday(picked);
        if (picked.length > 0) airCache = { at: Date.now(), items: picked };
      })
      .catch((err) => console.error('Failed to load on-air:', err))
      .finally(() => {
        if (on) setOnAirLoading(false);
      });
    return () => {
      on = false;
    };
  }, [showAiring]);
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

  // Coming Soon for shows: future premieres (discover/tv), soonest first —
  // mirrors the Movies shelf instead of the old On The Air row.
  useEffect(() => {
    let isMounted = true;
    setUpcomingLoading(true);
    if (Date.now() - seriesCache.at < DATA_TTL && seriesCache.items.length > 0) {
      setUpcomingSeries(seriesCache.items);
      setUpcomingLoading(false);
      return () => {
        isMounted = false;
      };
    }
    tmdb
      .getUpcomingSeries()
      .then((res) => {
        if (!isMounted) return;
        const picked = pickUpcoming(res?.results, 'first_air_date');
        setUpcomingSeries(picked);
        if (picked.length > 0) seriesCache = { at: Date.now(), items: picked };
      })
      .catch((err) => console.error('Failed to load upcoming series:', err))
      .finally(() => {
        if (isMounted) setUpcomingLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <>
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
                className={`h-9 px-4 inline-flex items-center gap-2 rounded-full text-xs font-semibold border backdrop-blur-xl transition cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  showAiring
                    ? 'bg-white text-black border-white shadow-md'
                    : 'bg-[var(--cine-glass-tint)] border-[var(--cine-glass-border)] text-white/60 hover:text-white/90'
                }`}
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
      {!showAiring && page < totalPages && totalCount > 0 && (
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
