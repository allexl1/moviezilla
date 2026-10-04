import { useState, useEffect } from 'react';
import { Play, ChevronRight, ChevronLeft, Star, Plus, Check, Info, CalendarDays, Clapperboard, ArrowUp } from 'lucide-react';
import { tmdb } from '../services/tmdb';
import { storage, progressLabel, formatClock, WATCHED_PCT } from '../services/storage';
import { GENRE_NAME, GENRE_ICON, hasRating, resolveMediaType } from '../services/catalog';
import RowRail from '../components/RowRail';
import { SkelRail } from '../components/ui';

// CleanHomeView — isolated cinematic remake of Home (DESIGN.md direction).
// Test-only route at /clean, no nav entry. Delete this file + the /clean
// hooks in routing.js and App.jsx to remove the experiment.
// Dial ENERGY 3 / RHYTHM 1 / MOTION 2: living artwork-derived ambient wash,
// picturesque full-bleed hero with title logos, 8s rotation with steppers,
// white primary CTA, quiet watchlist + details duo.
export default function CleanHomeView({ onSelectMedia, onPlay, onToast, overlaid, heroId }) {
  const [trending, setTrending] = useState([]);
  const [popularMovies, setPopularMovies] = useState([]);
  const [popularTV, setPopularTV] = useState([]);
  const [topRated, setTopRated] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroLogo, setHeroLogo] = useState(null);
  // Test-only override: ?hero=<tmdbId> spotlights any title's artwork.
  // The id arrives via routing state (App initializer runs before the
  // URL mirror; a lazy view reading location.search would lose the race).
  const heroOverrideId = heroId && Number.isInteger(heroId) ? heroId : null;
  const [heroOverride, setHeroOverride] = useState(null);

  useEffect(() => {
    if (!heroOverrideId) return;
    let alive = true;
    // Unknown type: try movie, fall back to tv.
    tmdb
      .getMediaDetails('movie', heroOverrideId)
      .catch(() => tmdb.getMediaDetails('tv', heroOverrideId))
      .then((details) => {
        if (alive && details?.backdrop_path) {
          setHeroOverride({
            ...details,
            id: heroOverrideId,
            media_type: details?.number_of_seasons || details?.first_air_date ? 'tv' : 'movie',
          });
          setHeroIndex(0);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [heroOverrideId]);

  useEffect(() => {
    setContinueWatching(storage.getAllContinueWatching());
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    Promise.all([
      tmdb.getTrending(),
      tmdb.getPopularMovies(),
      tmdb.getPopularTV(),
      tmdb.getTopRatedMovies(),
    ])
      .then(([trend, movies, series, rated]) => {
        if (!alive) return;
        const clean = (list) => (list?.results || []).filter((x) => !x.adult && x.poster_path);
        setTrending(clean(trend));
        setPopularMovies(clean(movies));
        setPopularTV(clean(series));
        setTopRated(clean(rated));
        setHeroIndex(0);
        setLoading(false);
      })
      .catch(() => {
        if (alive) {
          setFailed(true);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [retry]);

  // Spotlight pool: trending titles with a backdrop to stand on.
  // A ?hero= override leads the pool so any artwork can be previewed.
  const heroItems = [
    ...(heroOverride?.backdrop_path ? [heroOverride] : []),
    ...trending.filter((x) => x.backdrop_path && x.id !== heroOverride?.id),
  ].slice(0, 6);
  const hero = heroItems[heroIndex] || heroItems[0] || null;
  const heroYear = (hero?.release_date || hero?.first_air_date || '').split('-')[0];
  const heroGenre = hero ? GENRE_NAME[String(hero.genre_ids?.[0])] || GENRE_NAME[hero.genre_ids?.[0]] : null;
  const HeroGenreIcon = heroGenre ? GENRE_ICON[heroGenre] || Clapperboard : null;
  const heroMediaType = hero ? resolveMediaType(hero) : 'movie';

  // Official title logo, stamped with the item id so a lagging fetch can
  // never paint the previous slide's logo over the new slide.
  useEffect(() => {
    if (!hero?.id) return;
    let alive = true;
    setHeroLogo(null);
    tmdb.getLogos(heroMediaType, hero.id).then((logo) => {
      if (alive && logo?.file_path) setHeroLogo({ id: hero.id, path: logo.file_path });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hero?.id]);

  // Resume-aware Play: honest label when a real position exists.
  const heroSaved = hero?.id ? storage.getProgress(heroMediaType, hero.id) : null;
  const heroResumeSec =
    heroSaved && (heroSaved.percent || 0) < WATCHED_PCT && (heroSaved.currentTime || 0) >= 30
      ? Math.floor(heroSaved.currentTime)
      : 0;

  // Watchlist state follows the real store, live across tabs.
  const [, setWlVersion] = useState(0);
  useEffect(() => storage.subscribeWatchlist(() => setWlVersion((v) => v + 1)), []);
  const heroInWL = hero?.id ? storage.isInWatchlist(hero.id) : false;

  // 8s rotation; manual steps and dots restart it via the heroIndex dep.
  // Paused while search/settings/account/player cover the page.
  useEffect(() => {
    if (overlaid || heroItems.length < 2) return;
    const timer = setTimeout(() => {
      setHeroIndex((i) => (i + 1) % heroItems.length);
    }, 8000);
    return () => clearTimeout(timer);
  }, [overlaid, heroIndex, heroItems.length]);

  // Back-to-top: long page, appears past the hero fold.
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const scrollTop = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  };

  // Resume a continue-watching entry on the player with its stored art.
  const playContinue = (item) =>
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
    );

  return (
    <div className="relative min-h-screen clean-home">
      {loading && (
        <main className="cine-container cine-container--page relative">
          <div className="skel w-full h-[52vh] rounded-3xl" aria-hidden="true" />
          <SkelRail title />
          <SkelRail title />
        </main>
      )}

      {!loading && failed && (
        <main className="cine-container cine-container--page relative">
          <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center space-y-3">
            <p className="text-sm text-white/70">Could not load the catalog. Check your connection.</p>
            <button onClick={() => setRetry((c) => c + 1)} className="cine-btn cine-btn-white h-10 px-6 text-sm">
              Retry
            </button>
          </div>
        </main>
      )}

      {!loading && !failed && (
        <>
          {hero && (
            <section className="relative w-full h-[76vh] min-h-[440px] md:h-[88vh] md:min-h-[560px] overflow-hidden" aria-label="Featured titles">
              <img
                key={hero.id}
                src={tmdb.getImageUrl(hero.backdrop_path, 'w1280', hero.backdrop_fallback)}
                alt=""
                aria-hidden="true"
                fetchPriority="high"
                className="clean-hero-fade clean-hero-img absolute inset-0 w-full h-full object-cover"
              />
              {/* Melt: the artwork itself dissolves into the page background
                  (mask fade) while slate fades in underneath it. A crossfade,
                  not an overlay band, so no seam line can exist. */}
              <div aria-hidden="true" className="clean-hero-melt" />
              <div className="absolute inset-x-0 bottom-0">
                <div key={`copy-${hero.id}`} className="clean-rise max-w-[1560px] mx-auto px-6 md:px-14 pb-12 space-y-4">
                  {heroLogo && heroLogo.id === hero.id && heroLogo.path ? (
                    <img
                      key={`logo-${hero.id}`}
                      src={tmdb.getImageUrl(heroLogo.path, 'w500')}
                      alt={hero.title || hero.name}
                      className="clean-hero-fade max-h-28 md:max-h-36 w-auto max-w-[420px] object-contain object-left"
                    />
                  ) : (
                    <h1 key={`title-${hero.id}`} className="clean-hero-fade text-4xl md:text-6xl font-black tracking-tight text-white max-w-3xl">
                      {hero.title || hero.name}
                    </h1>
                  )}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/80">
                    <span className="inline-flex items-center gap-1 font-semibold text-white">
                      <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                      {(hero.vote_average || 0).toFixed(1)}
                    </span>
                    {heroYear && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {heroYear}
                      </span>
                    )}
                    {heroGenre && HeroGenreIcon && (
                      <span className="inline-flex items-center gap-1.5">
                        <HeroGenreIcon className="w-3.5 h-3.5" />
                        {heroGenre}
                      </span>
                    )}
                  </p>
                  {hero.overview && (
                    <p className="text-sm md:text-[15px] leading-relaxed text-white/80 max-w-2xl line-clamp-2">
                      {hero.overview}
                    </p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={() => onPlay(hero, hero)}
                      className="cine-btn cine-btn-white h-12 px-8 text-[15px]"
                      aria-label={heroResumeSec > 0 ? `Resume from ${formatClock(heroResumeSec)}` : `Play ${hero.title || hero.name}`}
                    >
                      <Play className="w-[18px] h-[18px]" fill="currentColor" />
                      {heroResumeSec > 0 ? `Resume • ${formatClock(heroResumeSec)}` : 'Play'}
                    </button>
                    <div className="cine-duo-btn">
                      <button
                        onClick={() => {
                          const added = storage.toggleWatchlist(hero);
                          onToast?.(added ? 'Added to Watch Later' : 'Removed from Watch Later');
                        }}
                        aria-label={heroInWL ? 'Remove from Watch Later' : 'Add to Watch Later'}
                      >
                        {heroInWL ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                        <span className="cine-duo-tip" aria-hidden="true">
                          {heroInWL ? 'Remove from Watch Later' : 'Add to Watch Later'}
                        </span>
                      </button>
                      <span className="cine-duo-divider" />
                      <button onClick={() => onSelectMedia(hero)} aria-label={`More about ${hero.title || hero.name}`}>
                        <Info className="w-5 h-5" />
                        <span className="cine-duo-tip" aria-hidden="true">Details</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {heroItems.length > 1 && (
                <>
                  <div className="cine-hero-dots">
                    {heroItems.map((item, i) => (
                      <button
                        key={item.id}
                        onClick={() => setHeroIndex(i)}
                        aria-label={`Show ${item.title || item.name}`}
                        aria-current={i === heroIndex}
                        className={`cine-hero-dot ${i === heroIndex ? 'is-active' : ''}`}
                      >
                        {/* 8s progress sweep on the live dot: the rotation
                            made visible. Remounts per slide; unmounted while
                            an overlay pauses the timer, so the two agree. */}
                        {i === heroIndex && !overlaid && (
                          <span key={hero.id} className="clean-dot-fill" aria-hidden="true" />
                        )}
                      </button>
                    ))}
                  </div>
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
          )}

          <main className="cine-container relative">
            {continueWatching.length > 0 && (
              <section className="space-y-3">
                <div className="cine-section-head">
                  <h2 className="cine-section-title">Continue watching</h2>
                </div>
                {/* Portrait resume cards: same 2:3 card system as the rails,
                    so posters are never cropped. Progress pins to the art. */}
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                  {continueWatching.map((item) => (
                    <div
                      key={`${item.type}_${item.mediaId}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => playContinue(item)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          playContinue(item);
                        }
                      }}
                      aria-label={`Resume ${item.title}`}
                      className="cine-card cine-card-in flex-shrink-0 w-48 md:w-56 group"
                    >
                      <div className="cine-card-poster">
                        <img
                          src={tmdb.getImageUrl(item.poster, 'w500')}
                          alt={item.title}
                          loading="lazy"
                          decoding="async"
                        />
                        <span className="cine-card-hover" aria-hidden="true">
                          <span className="cine-card-play">
                            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                          </span>
                          <span className="cine-card-hover-title">{item.title}</span>
                          <span className="cine-card-hover-meta">{progressLabel(item)}</span>
                        </span>
                        <div className="clean-cw-progress" aria-hidden="true">
                          <div
                            className="cine-cw-progress-fill"
                            style={{ width: `${item.percent > 0 ? item.percent : item.currentTime > 0 ? 4 : 0}%` }}
                          />
                        </div>
                      </div>
                      <h4 className="cine-card-title">{item.title}</h4>
                      <p className="cine-cw-meta">
                        {item.type === 'tv'
                          ? `Season ${item.season}, episode ${item.episode}`
                          : 'Movie'}{' '}
                        • {progressLabel(item)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="clean-rise space-y-16" style={{ animationDelay: '0.15s' }}>
            <RowRail title="Trending now" items={trending.filter(hasRating)} onSelect={onSelectMedia} cardSize="lg" captioned arrows />
            <RowRail title="Popular movies" items={popularMovies} onSelect={onSelectMedia} cardSize="lg" captioned arrows />
            <RowRail title="Popular shows" items={popularTV} onSelect={onSelectMedia} mediaType="tv" cardSize="lg" captioned arrows />
            <RowRail title="Top rated" items={topRated} onSelect={onSelectMedia} cardSize="lg" captioned arrows />
            </div>

            {trending.length === 0 && popularMovies.length === 0 && (
              <p className="text-center text-xs text-white/50 py-10">
                Nothing indexed right now. Pull to refresh or check back later.
              </p>
            )}
          </main>

          {showTop && (
            <button onClick={scrollTop} className="clean-top" aria-label="Back to top">
              <ArrowUp className="w-5 h-5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
