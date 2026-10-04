import { useState, useEffect, useRef } from 'react';
import { Play, Plus, Check, Info, Star, CalendarDays, Clapperboard, ChevronLeft, ChevronRight, History } from 'lucide-react';
import { tmdb } from '../services/tmdb';
import { storage, progressLabel, formatClock, WATCHED_PCT } from '../services/storage';
import { GENRE_NAME, GENRE_ICON, resolveMediaType, hasRating, PROVIDERS, DATA_TTL, pickAiring } from '../services/catalog';
import RowRail from '../components/RowRail';
import ProviderPicker from '../components/ProviderPicker';
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
export default function HomeView({ onSelectMedia, onPlay, onToast, onOpenTopRated, onOpenTab, overlaid, playerSignal }) {
  const [items, setItems] = useState([]);
  const [featuredItem, setFeaturedItem] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [catalogRetry, setCatalogRetry] = useState(0);
  const [, setCatalogLoading] = useState(true);

  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [topRatedTV, setTopRatedTV] = useState([]);
  const [onAir, setOnAir] = useState([]);
  const [classics, setClassics] = useState([]);
  const [acclaimed, setAcclaimed] = useState([]);
  const [animeSpotlight, setAnimeSpotlight] = useState([]);
  const [nowPlaying, setNowPlaying] = useState([]);
  // Day-fresh trending pool for the hero (trending/week moves too slowly
  // for "new movies" — day endpoints catch a Moana-level surge same-day).
  const [trendingDay, setTrendingDay] = useState([]);
  const [homeProvider, setHomeProvider] = useState('8');
  const [providerMovies, setProviderMovies] = useState([]);
  // Hero waits for the first FRESH rails flight: cached trending would
  // flash last session's #1 (stale spotlight) before the newest takes
  // over. Rows below still hydrate instantly; only the hero skeletons.
  const [heroReady, setHeroReady] = useState(false);

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
        const list = (res?.results || []).filter((x) => !x.adult && x.poster_path);
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
      setTopRatedTV(r.ratedTV || []);
      setOnAir(r.onAir || []);
      setClassics(r.classics || []);
      setAcclaimed(r.acclaimed || []);
      setAnimeSpotlight(r.anime);
      setNowPlaying(r.now);
      setTrendingDay(r.day);
    } else {
      loadRails();
    }

    async function loadRails() {
      try {
        const [movies, series, rated, ratedTV, onAirRes, classicsRes, anime, now, dayM, dayT] = await Promise.all([
          tmdb.getPopularMovies(),
          tmdb.getPopularTV(),
          tmdb.getTopRatedMovies(),
          tmdb.getTopRatedTV(),
          tmdb.getOnTheAir(),
          tmdb.getMovies({ year: '1990s', sort: 'vote_average.desc' }),
          tmdb.getAnime(),
          tmdb.getNowPlaying(),
          tmdb.getTrendingToday('movie'),
          tmdb.getTrendingToday('tv'),
        ]);

        if (!isMounted) return;

        const clean = (res) =>
          (res?.results || []).filter((x) => !x.adult && x.poster_path && hasRating(x)).slice(0, 14);

        const topMovies = clean(rated);
        const topShows = clean(ratedTV).map((x) => ({ ...x, media_type: 'tv' }));
        // Critically Acclaimed: best-rated movies + shows, capped per type
        // so TV scores (which run higher) can't crowd movies out entirely.
        // Honest award-correlate — a true Oscar shelf needs curated IDs
        // (TMDB has no awards field) plus the detail-page awards fix.
        const acclaimedList = [...topMovies.slice(0, 7).map((x) => ({ ...x, media_type: 'movie' })), ...topShows.slice(0, 7)]
          .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
          .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))
          .slice(0, 14);

        const rails = {
          movies: clean(movies),
          series: clean(series),
          rated: topMovies,
          ratedTV: topShows,
          // Airing rails are unrated by nature — no hasRating gate.
          onAir: pickAiring(onAirRes?.results),
          classics: clean(classicsRes),
          acclaimed: acclaimedList,
          anime: clean(anime),
          now: clean(now),
          // Day pool: both endpoints merged, deduped — this is what puts a
          // same-day surge (Moana) on hero slide 1 instead of last week's order.
          day: [...(dayM?.results || []), ...(dayT?.results || [])]
            .filter((x) => !x.adult && x.poster_path && hasRating(x))
            .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i)
            .slice(0, 14),
        };
        setPopularMovies(rails.movies);
        setPopularTV(rails.series);
        setTopRated(rails.rated);
        setTopRatedTV(rails.ratedTV);
        setOnAir(rails.onAir);
        setClassics(rails.classics);
        setAcclaimed(rails.acclaimed);
        setAnimeSpotlight(rails.anime);
        setNowPlaying(rails.now);
        setTrendingDay(rails.day);
        saveHome({ rails });
        setHeroReady(true);
      } catch (err) {
        console.error('Failed to load home rails:', err);
        // Offline/failed: fall back to whatever cache painted instead of
        // skeleton-locking the hero forever.
        setHeroReady(true);
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
        const list = (res?.results || []).filter((x) => !x.adult && x.poster_path && hasRating(x)).slice(0, 14);
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
  // Crossfade: hold the previous spotlight one beat so the new backdrop
  // dissolves OVER it instead of hard-cutting (2026 motion parity).
  // Cleared ~950ms after every slide change; reduced-motion kills both
  // layers' animations via the shared guard in index.css.
  const [prevHeroItem, setPrevHeroItem] = useState(null);
  const lastHeroRef = useRef(null);

  useEffect(() => {
    setHeroIndex(0);
    setHeroLogo(null);
  }, [items.length > 0 ? items[0].id : null]); // eslint-disable-line react-hooks/exhaustive-deps

  const heroItem = heroItems[heroIndex] || featuredItem || items[0] || null;
  const heroMediaType = heroItem ? resolveMediaType(heroItem) : 'movie';

  // Track slide identity: a new id parks the old item underneath until
  // the dissolve finishes. Same-id data refreshes (silent 10-min
  // refetch) must NOT retrigger — only a real slide change holds.
  useEffect(() => {
    if (!heroItem) return;
    if (lastHeroRef.current && lastHeroRef.current.id !== heroItem.id) {
      setPrevHeroItem(lastHeroRef.current);
      const t = setTimeout(() => setPrevHeroItem(null), 950);
      lastHeroRef.current = heroItem;
      return () => clearTimeout(t);
    }
    lastHeroRef.current = heroItem;
  }, [heroItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hero resume: one dominant Play language. If this title has a real
  // position (30s+, not watched), the CTA reads "Resume • 12:34" —
  // same recipe, same size, just honest about where Play lands.
  const heroSaved = heroItem?.id ? storage.getProgress(heroMediaType, heroItem.id) : null;
  const heroResumeSec = heroSaved && (heroSaved.percent || 0) < WATCHED_PCT && (heroSaved.currentTime || 0) >= 30
    ? Math.floor(heroSaved.currentTime)
    : 0;

  // Hero watchlist toggle: icon + labels follow the real state, live across
  // tabs. Derived during render (never set in an effect) + a version bump
  // on watchlist events to re-render — same pattern as WatchlistView.
  const [, setWlVersion] = useState(0);
  useEffect(() => storage.subscribeWatchlist(() => setWlVersion((v) => v + 1)), []);
  const heroInWL = heroItem?.id ? storage.isInWatchlist(heroItem.id) : false;

  // Rotate spotlight; pause while an overlay covers Home. Gated on
  // heroReady: the mount timer must not fire during the skeleton and
  // pile a rotation onto the fresh hero (double-change flash).
  useEffect(() => {
    if (overlaid || !heroReady || heroItems.length < 2) return;
    const timer = setTimeout(() => {
      setHeroIndex((i) => (i + 1) % heroItems.length);
    }, 8000);
    return () => clearTimeout(timer);
  }, [overlaid, heroReady, heroIndex, heroItems.length]);

  // Title logo for the spotlight treatment. Stamped with the item id:
  // the copy remounts per slide while the logo fetch lags one flight,
  // and without the stamp a pre-effect paint would flash the OLD
  // slide's logo over the NEW slide's title and overview.
  useEffect(() => {
    if (!heroItem?.id) return;
    let isMounted = true;
    setHeroLogo(null);
    tmdb.getLogos(heroMediaType, heroItem.id).then((logo) => {
      if (isMounted && logo?.file_path) setHeroLogo({ id: heroItem.id, path: logo.file_path });
    });
    return () => {
      isMounted = false;
    };
  }, [heroItem?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Poster tint: the artwork's palette at 30% across the whole page. */}
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

      {!heroReady && (
        <section className="cine-hero" aria-hidden="true">
          <div className="skel absolute inset-x-6 md:inset-x-14 top-24 bottom-16 rounded-3xl" />
        </section>
      )}

      {heroItem && heroReady && (
        <>
        <section className="cine-hero">
          <div className="cine-hero-media" aria-hidden="true">
            {/* Previous slide crossfade (cheap opacity layer, part of the
                8s rotation — not a blur, no melt role). */}
            {prevHeroItem && (
              <img
                key={`prev-${prevHeroItem.id}`}
                src={tmdb.getImageUrl(
                  prevHeroItem.backdrop_path,
                  'w1280',
                  prevHeroItem.backdrop_fallback
                )}
                alt=""
                aria-hidden="true"
                className="cine-hero-prev"
              />
            )}
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

          <div key={`copy-${heroItem.id}`} className="cine-hero-content cine-hero-copy">
            {heroLogo && heroLogo.id === heroItem.id && heroLogo.path ? (
              <img
                src={tmdb.getImageUrl(heroLogo.path, 'w500')}
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
                className="cine-btn cine-btn-white cine-cta"
                aria-label={heroResumeSec > 0 ? `Resume from ${formatClock(heroResumeSec)}` : 'Play'}
              >
                <Play className="w-[18px] h-[18px]" fill="currentColor" />
                <span>{heroResumeSec > 0 ? `Resume • ${formatClock(heroResumeSec)}` : 'Play'}</span>
              </button>

              {/* Hero duo: old joined track with divider, new solid material.
                  No glass gradient, hairline edge. */}
              <div className="cine-hero-duo">
                <button
                  onClick={() => {
                    const added = storage.toggleWatchlist(heroItem);
                    onToast(added ? 'Added to Watch Later' : 'Removed from Watch Later');
                  }}
                  aria-label={heroInWL ? 'Remove from Watch Later' : 'Add to Watch Later'}
                  className="cine-hero-duo-btn cine-has-tip"
                >
                  {heroInWL ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  <span className="cine-tip" aria-hidden="true">
                    {heroInWL ? 'Remove from Watch Later' : 'Add to Watch Later'}
                  </span>
                </button>
                <span className="cine-hero-duo-divider" aria-hidden="true" />
                <button
                  onClick={() => onSelectMedia(heroItem)}
                  aria-label="Details"
                  className="cine-hero-duo-btn cine-has-tip"
                >
                  <Info className="w-5 h-5" />
                  <span className="cine-tip" aria-hidden="true">Details</span>
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

                  aria-label={`Show ${item.title || item.name}`}
                  aria-current={i === heroIndex}
                  className={`cine-hero-dot ${i === heroIndex ? 'is-active' : ''}`}
                >
                  {/* 8s progress sweep on the live dot: the rotation made
                      visible. Remounts per slide; unmounted while an overlay
                      pauses the timer, so the two agree. */}
                  {i === heroIndex && !overlaid && (
                    <span key={heroItems[heroIndex]?.id} className="cine-dot-fill" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Edge steppers: thin white chevrons, vertically centered at
              the screen edges (manual poster switching — taps restart
              the 8s rotation via the heroIndex dep, same as dots). */}
          {heroItems.length > 1 && (
            <>
              <button
                onClick={() => setHeroIndex((i) => (i - 1 + heroItems.length) % heroItems.length)}
                className="cine-hero-step cine-hero-step--prev"
                aria-label="Previous spotlight"
              >
                <ChevronLeft className="w-10 h-10" strokeWidth={1} />
              </button>
              <button
                onClick={() => setHeroIndex((i) => (i + 1) % heroItems.length)}
                className="cine-hero-step cine-hero-step--next"
                aria-label="Next spotlight"
              >
                <ChevronRight className="w-10 h-10" strokeWidth={1} />
              </button>
            </>
          )}
        </section>
        </>
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
              <h2 className="cine-section-title inline-flex items-center gap-2">
                <History className="w-4 h-4 text-white/60" /> Continue Watching
              </h2>
            </div>

            {/* Full-bleed rail (Trending language): the row breaks out of
                the container padding to the viewport edges, so the last
                card always peeks instead of landing flush. */}
            <div className="cine-rail-wrap">
              <div
                className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-4 px-4 md:-mx-14 md:px-14"
              >
              {continueWatching.map((item) => {
                const pct = item.percent > 0 ? item.percent : item.currentTime > 0 ? 4 : 0;
                // Uniform time phrase: remaining when the duration is known,
                // position otherwise. Never mixed bare numbers.
                const time =
                  item.duration > item.currentTime && item.currentTime > 0
                    ? `${formatClock(item.duration - item.currentTime)} left`
                    : item.currentTime > 0
                      ? `at ${formatClock(item.currentTime)}`
                      : progressLabel(item);
                return (
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
                  className="cine-cw-portrait group"
                  role="button"
                  tabIndex={0}
                  aria-label={`Resume ${item.title}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.currentTarget.click();
                    }
                  }}
                >
                  <div className="cine-cw-portrait-art">
                    <img
                      src={tmdb.getImageUrl(item.poster, 'w342')}
                      alt={item.title}
                      loading="lazy"
                      className="group-hover:scale-[1.03] transition duration-300"
                    />
                    <div className="cine-cw-portrait-play" aria-hidden="true">
                      <span className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
                        <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                      </span>
                    </div>
                    <div className="cine-cw-portrait-timer" aria-hidden="true">
                      <span style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <h4 className="cine-cw-portrait-title">{item.title}</h4>
                  <p className="cine-cw-portrait-meta">
                    {item.type === 'tv' ? `S${item.season} E${item.episode} · ` : ''}{time}
                  </p>
                </div>
                );
              })}
              </div>
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
              title="Now Playing in Theaters"
              items={nowPlaying}
              onSelect={onSelectMedia}
              mediaType="movie"
              action={{ label: 'View All', onClick: () => onOpenTab('movie') }}
            />
            <RowRail
              title="On The Air"
              items={onAir}
              onSelect={onSelectMedia}
              mediaType="tv"
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
              title="Top Rated Shows"
              items={topRatedTV}
              onSelect={onSelectMedia}
              mediaType="tv"
              action={{ label: 'View All', onClick: () => onOpenTab('tv') }}
            />
            <RowRail
              title="Critically Acclaimed"
              items={acclaimed}
              onSelect={onSelectMedia}
            />
            <RowRail
              title="90s Classics"
              items={classics}
              onSelect={onSelectMedia}
              mediaType="movie"
            />
            <RowRail
              title={`Movies on ${PROVIDERS.find((p) => p.id === homeProvider)?.name || ''}`}
              items={providerMovies}
              onSelect={onSelectMedia}
              mediaType="movie"
              titleNode={
                <div className="flex items-center gap-2">
                  <h2 className="cine-section-title">Movies on</h2>
                  <ProviderPicker value={homeProvider} onChange={setHomeProvider} />
                </div>
              }
            />
            <RowRail title="Anime Spotlight" items={animeSpotlight} onSelect={onSelectMedia} mediaType="tv" />
          </div>
        </section>
      </main>
    </>
  );
}
