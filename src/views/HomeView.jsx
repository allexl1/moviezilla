import React, { useState, useEffect, useRef } from 'react';
import { Play, Plus, Info, Star, CalendarDays, Clapperboard } from 'lucide-react';
import { tmdb } from '../services/tmdb';
import { storage, progressLabel } from '../services/storage';
import { GENRE_NAME, GENRE_ICON, resolveMediaType, hasRating, PROVIDERS, DATA_TTL } from '../services/catalog';
import RowRail from '../components/RowRail';
import Select from '../components/ui/Select';
import { SkelRail } from '../components/ui';

// Home snapshot: remounts (detail closed, tab revisited) hydrate instantly
// instead of refetching + flashing skeletons. Only successes cache.
let homeSnap = { at: 0, data: null };
function saveHome(part) {
  homeSnap = { at: Date.now(), data: { ...(homeSnap.data || {}), ...part } };
}
function readHome() {
  if (homeSnap.data && Date.now() - homeSnap.at < DATA_TTL) return homeSnap.data;
  return null;
}

// Home route view: hero spotlight + continue watching + provider wall +
// rails. Owns all home data (trending, rails, providers, hero rotation).
// Mounted only on the home tab; unmounts on detail/person/rooms/player,
// so overlay guards reduce to the `overlaid` prop (search/settings/player).
export default function HomeView({ onSelectMedia, onPlay, onToast, onOpenProvider, onOpenTopRated, onOpenTab, overlaid, playerSignal }) {
  const [items, setItems] = useState([]);
  const [featuredItem, setFeaturedItem] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [animeSpotlight, setAnimeSpotlight] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  // Day-fresh trending pool for the hero (trending/week moves too slowly
  // for "new movies" — day endpoints catch a Moana-level surge same-day).
  const [trendingDay, setTrendingDay] = useState([]);
  const [homeProvider, setHomeProvider] = useState('8');
  const [providerMovies, setProviderMovies] = useState([]);
  const [providers, setProviders] = useState([]);

  const [continueWatching, setContinueWatching] = useState([]);

  useEffect(() => {
    setContinueWatching(storage.getAllContinueWatching());
  }, [playerSignal]);

  // Trending catalog (hero source + Trending Now rail).
  useEffect(() => {
    let isMounted = true;
    const hit = readHome();
    if (hit?.items) {
      setItems(hit.items);
      setFeaturedItem(hit.items.length > 0 ? hit.items[0] : null);
      setCatalogError('');
      setCatalogLoading(false);
      return () => {
        isMounted = false;
      };
    }
    setCatalogLoading(true);
    async function load() {
      try {
        const res = await tmdb.getTrending();
        if (!isMounted) return;
        const list = (res?.results || []).filter((x) => x.poster_path);
        setItems(list);
        setFeaturedItem(list.length > 0 ? list[0] : null);
        saveHome({ items: list });
        setCatalogError('');
      } catch (err) {
        console.error('Failed to load catalog:', err);
        if (isMounted) setCatalogError("Couldn't load titles. Check your connection.");
      } finally {
        if (isMounted) setCatalogLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogRetry]);

  // Home rails load on mount and refresh every 10 minutes while Home stays
  // open and visible — new theatrical/streaming titles appear without reload.
  useEffect(() => {
    let isMounted = true;
    const hit = readHome();
    if (hit?.rails) {
      const r = hit.rails;
      setPopularMovies(r.movies);
      setPopularTV(r.series);
      setTopRated(r.rated);
      setAnimeSpotlight(r.anime);
      setNowPlaying(r.now);
      setTrendingDay(r.day);
    } else {
      loadRails();
    }

    async function loadRails() {
      try {
        const [movies, series, rated, anime, now, dayM, dayT] = await Promise.all([
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getAnime(),
          tmdb.getNowPlaying(),
          tmdb.getTrendingToday('movie'),
          tmdb.getTrendingToday('tv'),
        ]);

        if (!isMounted) return;

        const clean = (res) =>
          (res?.results || []).filter((x) => x.poster_path && hasRating(x)).slice(0, 14);

        const rails = {
          movies: clean(movies),
          series: clean(series),
          rated: clean(rated),
          anime: clean(anime),
          now: clean(now),
          // Day pool: both endpoints merged, deduped — this is what puts a
          // same-day surge (Moana) on hero slide 1 instead of last week's order.
          day: [...(dayM?.results || []), ...(dayT?.results || [])]
            .filter((x) => x.poster_path && hasRating(x))
            .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
            .slice(0, 14),
        };
        setPopularMovies(rails.movies);
        setPopularTV(rails.series);
        setTopRated(rails.rated);
        setAnimeSpotlight(rails.anime);
        setNowPlaying(rails.now);
        setTrendingDay(rails.day);
        saveHome({ rails });
      } catch (err) {
        console.error('Failed to load home rails:', err);
      }
    }

    loadRails();
    const refresh = setInterval(() => {
      if (!document.hidden) loadRails();
    }, 10 * 60 * 1000);

    return () => {
      isMounted = false;
      clearInterval(refresh);
    };
  }, []);

  // Full provider catalog for the icon wall (sorted by TMDB priority).
  useEffect(() => {
    let isMounted = true;
    const hit = readHome();
    if (hit?.providers) {
      setProviders(hit.providers);
      return () => {
        isMounted = false;
      };
    }
    tmdb
      .getProviders()
      .then((list) => {
        if (!isMounted) return;
        const slim = list.slice(0, 24);
        setProviders(slim);
        saveHome({ providers: slim });
      })
      .catch((err) => console.error('Failed to load providers:', err));
    return () => {
      isMounted = false;
    };
  }, []);

  // "Movies on {provider}" rail follows the home provider picker.
  useEffect(() => {
    let isMounted = true;
    const hit = readHome();
    if (homeProvider === '8' && hit?.providerMovies) {
      setProviderMovies(hit.providerMovies);
      return () => {
        isMounted = false;
      };
    }

    tmdb
      .getMovies({ provider: homeProvider })
      .then((res) => {
        if (!isMounted) return;
        const list = (res?.results || []).filter((x) => x.poster_path && hasRating(x)).slice(0, 14);
        setProviderMovies(list);
        if (homeProvider === '8') saveHome({ providerMovies: list });
      })
      .catch((err) => console.error('Failed to load provider rail:', err));

    return () => {
      isMounted = false;
    };
  }, [homeProvider]);

  // Home hero carousel (cinejoy spotlight parity). Day-fresh trending
  // leads so a same-day surge (Moana) is slide 1; weekly trending fills,
  // theatrical now_playing rounds out the rotation. Deduplicated, 6 max.
  // NOTE: [...nowPlaying, ...items] buried trending past the slice —
  // order matters, freshest first.
  const heroItems = [...trendingDay, ...items, ...nowPlaying]
    .filter((x, i, a) => x && a.findIndex((y) => y.id === x.id) === i)
    .slice(0, 6);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroLogo, setHeroLogo] = useState(null);

  useEffect(() => {
    setHeroIndex(0);
    setHeroLogo(null);
  }, [items.length > 0 ? items[0].id : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const heroItem = heroItems[heroIndex] || featuredItem || items[0] || null;
  const heroMediaType = heroItem ? resolveMediaType(heroItem) : 'movie';

  // Rotate spotlight; pause while an overlay covers Home.
  useEffect(() => {
    if (overlaid || heroItems.length < 2) return;
    const timer = setTimeout(() => {
      setHeroIndex((i) => (i + 1) % heroItems.length);
    }, 8000);
    return () => clearTimeout(timer);
  }, [overlaid, heroIndex, heroItems.length]);

  // Title logo for the spotlight treatment.
  useEffect(() => {
    if (!heroItem?.id) return;
    let isMounted = true;
    setHeroLogo(null);
    tmdb.getLogos(heroMediaType, heroItem.id).then((logo) => {
      if (isMounted && logo?.file_path) setHeroLogo(logo.file_path);
    });
    return () => {
      isMounted = false;
    };
  }, [heroItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {heroItem && (
        <div className="cine-home-bg" aria-hidden="true">
          <img
            key={heroItem.id}
            src={tmdb.getImageUrl(
              heroItem.backdrop_path,
              'w1280',
              heroItem.backdrop_fallback
            )}
            alt=""
            className="cine-home-bg-img cine-ghost-fade"
          />
          <div className="cine-home-bg-shade" />
        </div>
      )}

      {heroItem && (
        <section className="cine-hero">
          <div className="cine-hero-media" aria-hidden="true">
            <img
              key={heroItem.id}
              src={tmdb.getImageUrl(
                heroItem.backdrop_path,
                'w1280',
                heroItem.backdrop_fallback
              )}
              alt=""
              fetchPriority="high"
              className="cine-hero-fade"
            />
            <div className="cine-hero-scrim" />
          </div>

          <div className="cine-hero-content">
            {heroLogo ? (
              <img
                src={tmdb.getImageUrl(heroLogo, 'w500')}
                alt={heroItem.title || heroItem.name}
                className="cine-hero-logo"
              />
            ) : (
              <h1 className="cine-hero-title">
                {heroItem.title || heroItem.name}
              </h1>
            )}

            <div className="cine-hero-meta">
              <span className="cine-star-tag">
                <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                {(heroItem.vote_average || 8.4).toFixed(1)}/10
              </span>

              <span className="cine-hero-meta-item">
                <CalendarDays className="w-3.5 h-3.5" />
                {(
                  heroItem.release_date ||
                  heroItem.first_air_date ||
                  '2026'
                ).split('-')[0]}
              </span>

              {(heroItem.genre_ids || []).slice(0, 1).map((gid) => {
                const gname = GENRE_NAME[String(gid)] || GENRE_NAME[gid] || 'Featured';
                const GIcon = GENRE_ICON[gname] || Clapperboard;
                return (
                  <span key={gid} className="cine-hero-meta-item">
                    <GIcon className="w-3.5 h-3.5" />
                    {gname}
                  </span>
                );
              })}
            </div>

            <p className="cine-hero-desc">
              {heroItem.overview}
            </p>

            <div className="cine-actions">
              <button
                onClick={() => onPlay(heroItem, heroItem)}
                className="cine-btn cine-btn-primary cine-btn-shimmer cine-cta"
              >
                <Play className="w-[18px] h-[18px]" fill="currentColor" />
                <span>Play</span>
              </button>

              <div className="cine-duo-btn">
                <button
                  onClick={() => {
                    const added = storage.toggleWatchlist(heroItem);
                    onToast(added ? 'Added to Watchlist' : 'Removed from Watchlist');
                  }}
                  title="Add to Watchlist"
                  aria-label="Add to Watchlist"
                >
                  <Plus className="w-5 h-5" />
                </button>
                <span className="cine-duo-divider" />
                <button
                  onClick={() => onSelectMedia(heroItem)}
                  title="Details"
                  aria-label="Details"
                >
                  <Info className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {heroItems.length > 1 && (
            <div className="cine-hero-dots">
              {heroItems.map((item, i) => (
                <button
                  key={item.id}
                  onClick={() => setHeroIndex(i)}
                  title={item.title || item.name}
                  aria-label={`Show ${item.title || item.name}`}
                  aria-current={i === heroIndex}
                  className={`cine-hero-dot ${i === heroIndex ? 'is-active' : ''}`}
                />
              ))}
            </div>
          )}
        </section>
      )}
      {!heroItem && !catalogError && (
        <p className="text-center py-16 text-xs text-white/60">
          Loading catalog…
        </p>
      )}

      {/* Main Container */}
      <main className="cine-container">
        {continueWatching.length > 0 && (
          <section className="space-y-3">
            <div className="cine-section-head">
              <h2 className="cine-section-title">Continue Watching</h2>
            </div>

            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {continueWatching.map((item) => (
                <div
                  key={`${item.type}_${item.mediaId}`}
                  onClick={() =>
                    onPlay(
                      {
                        id: item.mediaId,
                        media_type: item.type,
                        name: item.title,
                        title: item.title,
                        poster_path: item.poster,
                      },
                      {
                        title: item.title,
                        name: item.title,
                        poster_path: item.poster,
                        media_type: item.type,
                      }
                    )
                  }
                  className="cine-cw-card group"
                >
                  <div className="cine-cw-thumb">
                    <img
                      src={tmdb.getImageUrl(item.poster, 'w300')}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />

                    <div className="cine-cw-play">
                      <div className="cine-cw-play-btn">
                        <Play className="w-3 h-3" fill="currentColor" />
                      </div>
                    </div>
                  </div>

                  <h4 className="cine-cw-title">
                    {item.title}
                  </h4>

                  <p className="cine-cw-meta">
                    {item.type === 'tv'
                      ? `Season ${item.season} • Episode ${item.episode}`
                      : 'Movie'}{' '}
                    • {progressLabel(item)}
                  </p>

                  <div className="cine-cw-progress">
                    <div
                      className="cine-cw-progress-fill"
                      style={{ width: `${item.percent > 0 ? item.percent : item.currentTime > 0 ? 4 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {providers.length > 0 && (
          <section className="space-y-3">
            <div className="cine-section-head">
              <h2 className="cine-section-title">Where to Watch</h2>
            </div>

            <div className="flex gap-4 overflow-x-auto no-scrollbar py-1">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenProvider(p.id)}
                  className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer group"
                  title={p.name}
                  aria-label={`Browse ${p.name} movies`}
                >
                  <span className="cine-provider-icon">
                    <img
                      src={tmdb.getImageUrl(p.logo, 'w185')}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="text-[11px] font-medium text-white/60 group-hover:text-white/80 transition max-w-20 truncate">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          {catalogError && (
            <div className="flex items-center justify-center gap-3 py-6 text-xs text-white/60">
              <span>{catalogError}</span>
              <button
                onClick={() => setCatalogRetry((c) => c + 1)}
                className="cine-control-btn"
              >
                Retry
              </button>
            </div>
          )}
          <div className="flex flex-col gap-10">
            {items.length === 0 && popularMovies.length === 0 && !catalogError ? (
              <>
                <SkelRail title />
                <SkelRail title />
              </>
            ) : (
              <RowRail title="Trending Now" items={items.filter(hasRating)} onSelect={onSelectMedia} />
            )}
            <RowRail
              title="Now Playing in Theaters"
              items={nowPlaying}
              onSelect={onSelectMedia}
              mediaType="movie"
              action={{ label: 'View All', onClick: () => onOpenTab('movie') }}
            />
            <RowRail
              title="Popular Movies"
              items={popularMovies}
              onSelect={onSelectMedia}
              mediaType="movie"
              action={{ label: 'View All', onClick: () => onOpenTab('movie') }}
            />
            <RowRail
              title="Popular Shows"
              items={popularTV}
              onSelect={onSelectMedia}
              mediaType="tv"
              action={{ label: 'View All', onClick: () => onOpenTab('tv') }}
            />
            <RowRail
              title="Top Rated Movies"
              items={topRated}
              onSelect={onSelectMedia}
              mediaType="movie"
              action={{
                label: 'View All',
                onClick: () => onOpenTopRated(),
              }}
            />
            <RowRail
              titleNode={
                <div className="flex items-center gap-2">
                  <h2 className="cine-section-title">Movies on</h2>
                  <div className="w-44">
                    <Select
                      value={homeProvider}
                      onChange={setHomeProvider}
                      label="Provider"
                      options={PROVIDERS.filter((p) => p.id !== '').map((p) => ({
                        value: p.id,
                        label: p.name,
                      }))}
                    />
                  </div>
                </div>
              }
              title="Movies on provider"
              items={providerMovies}
              onSelect={onSelectMedia}
              mediaType="movie"
            />
            <RowRail title="Anime Spotlight" items={animeSpotlight} onSelect={onSelectMedia} mediaType="tv" />
          </div>
        </section>
      </main>
    </>
  );
}
