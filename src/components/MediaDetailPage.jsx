import { useState, useEffect } from 'react';
import { Play, Plus, Check, Star, X, Users, Trophy, ChevronRight } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE } from '../services/tmdb';
import { getImdbRating, imdbIdOf } from '../services/ratings';
import { getAwardsByImdb } from '../services/wikidata';
import { storage } from '../services/storage';
import RowRail from './RowRail';

// RT lookups cache a day (edge caches hits a day too; misses an hour).
// Module scope: survives detail open/close.
const rtCache = new Map();
const RT_TTL = 24 * 60 * 60 * 1000;
// Misses (flaky backends, quota blips) re-try soon — a transient 404 must
// not hide the score for a day.
const RT_MISS_TTL = 10 * 60 * 1000;
const RT_CACHE_MAX = 120;
function rtCacheSet(key, value) {
  if (rtCache.has(key)) rtCache.delete(key);
  rtCache.set(key, value);
  while (rtCache.size > RT_CACHE_MAX) rtCache.delete(rtCache.keys().next().value);
}

function formatMoney(value) {
  if (!value) return null;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

function formatRuntime(mins) {
  if (!mins) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatEndsAt(mins) {
  if (!mins) return null;
  const end = new Date(Date.now() + mins * 60000);
  return `Ends ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function certificationOf(details, mediaType) {
  try {
    if (mediaType === 'tv') {
      const us = (details?.content_ratings?.results || []).find((r) => r.iso_3166_1 === 'US');
      return us?.rating || null;
    }
    const us = (details?.release_dates?.results || []).find((r) => r.iso_3166_1 === 'US');
    const rated = (us?.release_dates || []).find((r) => r.certification);
    return rated?.certification || null;
  } catch {
    return null;
  }
}

// US certification → plain-English explainer for the hover tip.
const CERT_TIPS = {
  G: 'Rated G — all ages admitted',
  PG: 'Rated PG — parental guidance suggested',
  'PG-13': 'Rated PG-13 — 13 and older recommended',
  R: 'Rated R — 17 and older without a parent or guardian',
  'NC-17': 'Rated NC-17 — adults only',
  'TV-Y': 'TV-Y — all children',
  'TV-Y7': 'TV-Y7 — 7 and older',
  'TV-G': 'TV-G — all audiences',
  'TV-PG': 'TV-PG — parental guidance suggested',
  'TV-14': 'TV-14 — 14 and older',
  'TV-MA': 'TV-MA — mature audiences',
  NR: 'Not rated',
  UR: 'Unrated',
};

export default function MediaDetailPage({ media, mediaType, onPlay, onSelectMedia, onToast, onWatchTogether, onSelectPerson }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailsError, setDetailsError] = useState('');
  const [detailsRetry, setDetailsRetry] = useState(0);
  // User-picked trailer key — hero is a still backdrop until the user
  // chooses to play (no autoplay embeds, no chrome, no mute dance).
  const [heroVideo, setHeroVideo] = useState(null);
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [logo, setLogo] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [imdb, setImdb] = useState(null);
  const [rt, setRt] = useState(null);
  const [awards, setAwards] = useState([]);
  const [honoursExpanded, setHonoursExpanded] = useState(false);

  const mediaId = media?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      setLoading(true);
      setDetailsError('');
      setHeroVideo(null);
      setLogo(null);
      setExpanded(false);
      setHonoursExpanded(false);
      try {
        const [data, titleLogo] = await Promise.all([
          tmdb.getMediaDetails(mediaType, mediaId),
          tmdb.getLogos(mediaType, mediaId),
        ]);
        if (isMounted) {
          setDetails(data);
          setIsWatchlist(storage.isInWatchlist(mediaId));
          if (titleLogo?.file_path) setLogo(titleLogo.file_path);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load media details:', err);
        if (isMounted) {
          setDetailsError("Couldn't load full details. Showing basic info.");
          setLoading(false);
        }
      }
    }
    fetchDetails();
    return () => { isMounted = false; };
  }, [mediaId, mediaType, detailsRetry]);

  // Stay in sync when the watchlist changes elsewhere (no reload needed).
  useEffect(() => {
    if (!mediaId) return;
    return storage.subscribeWatchlist(() => {
      setIsWatchlist(storage.isInWatchlist(mediaId));
    });
  }, [mediaId]);

  // IMDb rating via keyless Cinemeta lookup on the TMDB IMDb ID.
  useEffect(() => {
    let isMounted = true;
    setImdb(null);
    const imdbId = imdbIdOf(details, mediaType);
    if (!imdbId) return;
    getImdbRating(mediaType, imdbId).then((r) => {
      if (isMounted) setImdb(r);
    });
    return () => {
      isMounted = false;
    };
  }, [details, mediaType]);

  // Awards via Wikidata on the IMDb id (cached, silent on miss).
  useEffect(() => {
    let isMounted = true;
    setAwards([]);
    const imdbId = imdbIdOf(details, mediaType);
    if (!imdbId) return;
    getAwardsByImdb(imdbId).then((list) => {
      if (isMounted) setAwards(list);
    });
    return () => {
      isMounted = false;
    };
  }, [details, mediaType]);

  // Rotten Tomatoes via our /api/rt proxy (free keyless backend by
  // default; RapidAPI backend if RAPIDAPI_KEY is set server-side).
  // Module cache (hits AND misses): the effect keys on title/year strings,
  // but parent re-renders mint fresh details/media objects — without this
  // every chrome poke refired the flaky free backend (6x on one visit).
  useEffect(() => {
    let isMounted = true;
    const t = details?.title || details?.name || media?.title || media?.name;
    const y = (details?.release_date || details?.first_air_date || '').slice(0, 4);
    // Exact match when TMDB carried the IMDb ID (OMDb primary backend).
    const imdbId = imdbIdOf(details, mediaType);
    if (!t && !imdbId) return;
    const ck = `${t}|${y}|${imdbId || ''}`;
    const hit = rtCache.get(ck);
    if (hit && Date.now() - hit.at < (hit.ttl || RT_TTL)) {
      if (hit.data) setRt(hit.data);
      else setRt(null);
      return;
    }
    setRt(null);
    const qs = new URLSearchParams({ title: t || '', year: y || '' });
    if (imdbId) qs.set('imdb', imdbId);
    fetch(`/api/rt?${qs.toString()}`, {
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const good = d && (d.critic != null || d.audience != null) ? d : null;
        rtCacheSet(ck, { at: Date.now(), data: good, ttl: good ? RT_TTL : RT_MISS_TTL });
        if (isMounted && good) setRt(good);
      })
      .catch(() => {
        rtCacheSet(ck, { at: Date.now(), data: null, ttl: RT_MISS_TTL });
      });
    return () => {
      isMounted = false;
    };
  }, [details?.title, details?.name, media?.title, media?.name, details?.release_date, details?.first_air_date]);

  const title = details?.title || details?.name || media?.title || media?.name;
  const backdrop = tmdb.getImageUrl(details?.backdrop_path || media?.backdrop_path, 'w1280');
  const rating = (details?.vote_average || media?.vote_average || 0).toFixed(1);
  const voteCount = details?.vote_count || media?.vote_count || null;
  const releaseYear = (details?.release_date || details?.first_air_date || media?.release_date || media?.first_air_date || '').split('-')[0];
  const runtimeMins = details?.runtime || (details?.episode_run_time && details.episode_run_time[0]) || null;
  const runtime = formatRuntime(runtimeMins);
  const cert = certificationOf(details, mediaType);
  const revenue = formatMoney(details?.revenue);
  const budget = formatMoney(details?.budget);
  const genres = details?.genres || [];
  const cast = details?.credits?.cast?.slice(0, 12) || [];
  const directors = (details?.credits?.crew || []).filter((c) => c.job === 'Director');
  const creators = (details?.created_by || []).slice(0, 3);
  const studios = (details?.production_companies || []).slice(0, 3);
  const language = (details?.original_language || '').toUpperCase() || null;
  const status = details?.status || null;
  const seasonsCount = details?.number_of_seasons || null;
  const episodesCount = details?.number_of_episodes || null;
  const releaseDate = formatDate(details?.release_date || details?.first_air_date);
  // Sensible "You Might Also Like": TMDB similar as candidates, but scored
  // by shared genres with THIS title and stripped of unrated junk. Topped
  // up from same-genre top-rated when TMDB returns thin air.
  const [similar, setSimilar] = useState([]);
  useEffect(() => {
    let alive = true;
    const genreIds = new Set((details?.genres || []).map((g) => g.id));
    const score = (x) => (x.genre_ids || []).filter((g) => genreIds.has(g)).length;
    const clean = (list) =>
      (list || [])
        .filter((x) => !x.adult && x.poster_path && (x.vote_average || 0) > 0 && (x.vote_count || 0) >= 10)
        .sort(
          (a, b) =>
            score(b) - score(a) ||
            (b.vote_average || 0) - (a.vote_average || 0) ||
            (b.popularity || 0) - (a.popularity || 0)
        );
    const base = clean(details?.similar?.results);
    if (base.length >= 8 || genreIds.size === 0) {
      setSimilar(base);
      return () => {
        alive = false;
      };
    }
    const have = new Set(base.map((x) => x.id));
    const genre = [...genreIds][0];
    const fetcher =
      mediaType === 'tv'
        ? tmdb.getSeries({ genre, sort: 'vote_average.desc' })
        : tmdb.getMovies({ genre, sort: 'vote_average.desc' });
    fetcher
      .then((res) => {
        if (!alive) return;
        const extra = clean(res?.results).filter((x) => !have.has(x.id));
        setSimilar([...base, ...extra]);
      })
      .catch(() => {
        if (alive) setSimilar(base);
      });
    return () => {
      alive = false;
    };
  }, [details, mediaType]);
  const trailers = (details?.videos?.results || []).filter(
    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  ).slice(0, 6);
  const overview = details?.overview || media?.overview || 'No storyline available.';

  return (
    <div className="relative min-h-screen text-white pb-24 animate-in fade-in duration-300">
      {/* Blurred continuation: below the hero the same backdrop lives on as
          a dim frozen ghost, so the page melts instead of hard-cutting. */}
      <div className="cine-detail-bg" aria-hidden="true">
        <img src={backdrop} alt="" className="cine-detail-bg-img" />
        <div className="cine-detail-bg-shade" />
      </div>
      {/* Hero: still backdrop. Trailers play here only when the user picks
          one below — never autoplayed, so no player chrome or mute dance.
          No bg fill (home parity): the melt-base + ghost own the tone. */}
      <div className="relative w-full h-[86vh] min-h-[600px] overflow-hidden">
        {/* Melt base: the SAME backdrop, blurred, living under the sharp
            image. The sharp layer dissolves into it (mask), and the page
            ghost below is the same blur — so there is no boundary line,
            only a continuous melt like the reference. */}
        {!heroVideo && (
          <img src={backdrop} alt="" aria-hidden="true" className="cine-detail-melt-base" />
        )}
        {heroVideo ? (
          <iframe
            key={heroVideo}
            src={`https://www.youtube-nocookie.com/embed/${heroVideo}?autoplay=1&rel=0&modestbranding=1&controls=1&playsinline=1&iv_load_policy=3`}
            
            className="cine-trailer-cover border-0"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <img src={backdrop} alt={title} className="w-full h-full object-cover object-center cine-detail-melt-img" />
        )}
        <div className="absolute inset-0 cine-detail-hero-scrim pointer-events-none" />

        {/* Back to the still backdrop */}
        {heroVideo && (
          <button
            onClick={() => setHeroVideo(null)}
            className="cine-icon-btn absolute top-24 right-8 md:right-14 z-20"
            
            aria-label="Close trailer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Content Overlay */}
        <div className="absolute bottom-10 left-8 md:left-14 right-8 max-w-4xl z-10 space-y-4">
          {logo ? (
            <img
              src={tmdb.getImageUrl(logo, 'w500')}
              alt={title}
              className="max-h-36 max-w-md w-auto object-contain object-left-bottom drop-shadow-2xl"
            />
          ) : (
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black uppercase tracking-tight text-white drop-shadow-2xl">
              {title}
            </h1>
          )}

          {genres.length > 0 && (
            <p className="text-sm font-medium text-white/85">
              {genres.map((g) => g.name).join('  •  ')}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={() => onPlay(media, details)}
              className="cine-btn cine-btn-white cine-cta"
              aria-label="Play"
            >
              <Play className="w-[18px] h-[18px]" fill="currentColor" />
              <span>Play</span>
            </button>

            <button
              onClick={() => {
                const added = storage.toggleWatchlist(media);
                setIsWatchlist(!isWatchlist);
                onToast?.(added ? 'Added to Watchlist' : 'Removed from Watchlist');
              }}
              className="cine-btn-circle cine-has-tip"

              aria-label={isWatchlist ? 'Remove from List' : 'Add to Watchlist'}
            >
              {isWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              <span className="cine-tip" aria-hidden="true">
                {isWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
              </span>
            </button>

            {onWatchTogether && (
              <button
                onClick={() => onWatchTogether(media, details)}
                className="cine-btn-circle cine-has-tip"

                aria-label="Watch together in a room"
              >
                <Users className="w-5 h-5" />
                <span className="cine-tip" aria-hidden="true">Watch together</span>
              </button>
            )}

          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-white/90 pt-1">
            {releaseYear && <span>{releaseYear}</span>}
            {runtime && <span className="text-white/70">{runtime}</span>}
            {cert && (
              <span className="cine-chip cine-chip--solid text-xs font-bold text-white/85 cine-has-tip">
                {cert}
                <span className="cine-tip" aria-hidden="true">
                  {CERT_TIPS[cert] || `Rated ${cert}`}
                </span>
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[var(--cine-accent)] font-bold cine-has-tip">
              <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
              {rating}
              <span className="cine-tip" aria-hidden="true">
                TMDB score {rating}{voteCount ? ` from ${voteCount.toLocaleString()} votes` : ''}
              </span>
            </span>
            {imdb != null && (
              <span className="cine-imdb-tag cine-has-tip" >
                <span className="cine-imdb-logo">IMDb</span>
                {imdb.toFixed(1)}
                <span className="cine-tip" aria-hidden="true">
                  IMDb {imdb.toFixed(1)} — matched by IMDb ID
                </span>
              </span>
            )}
            {rt?.critic != null && (
              <span className="cine-chip cine-chip--accent cine-has-tip" >
                🍅 {rt.critic}%
                <span className="cine-tip" aria-hidden="true">
                  Rotten Tomatoes Tomatometer — critics
                </span>
              </span>
            )}
            {rt?.audience != null && (
              <span className="cine-chip cine-chip--neutral cine-has-tip" >
                🍿 {rt.audience}%
                <span className="cine-tip" aria-hidden="true">
                  Rotten Tomatoes Popcornmeter — audience
                </span>
              </span>
            )}
          </div>

          {directors.length > 0 && (
            <p className="text-sm text-white/50">
              Director{directors.length > 1 ? 's' : ''}:{' '}
              {directors.map((d, i) => (
                <span key={d.id || d.name}>
                  {i > 0 && ', '}
                  <button
                    onClick={() => onSelectPerson?.(d.id)}
                    className="inline-flex items-center gap-0.5 text-white/85 font-medium hover:text-white hover:underline transition cursor-pointer"
                    aria-label={`Open ${d.name}'s profile`}
                  >
                    {d.name}
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </span>
              ))}
            </p>
          )}

          {creators.length > 0 && (
            <p className="text-sm text-white/50">
              Created by:{' '}
              {creators.map((c, i) => (
                <span key={c.id || c.name}>
                  {i > 0 && ', '}
                  <button
                    onClick={() => onSelectPerson?.(c.id)}
                    className="inline-flex items-center gap-0.5 text-white/85 font-medium hover:text-white hover:underline transition cursor-pointer"
                    aria-label={`Open ${c.name}'s profile`}
                  >
                    {c.name}
                    <ChevronRight className="w-3.5 h-3.5 text-white/40" />
                  </button>
                </span>
              ))}
            </p>
          )}

          <div className="max-w-2xl">
            <p className={`text-sm leading-relaxed text-white/70 ${expanded ? '' : 'line-clamp-3'}`}>
              {overview}
            </p>
            {overview.length > 180 && (
              <button
                onClick={() => setExpanded((e) => !e)}
                className="text-xs font-semibold text-white/50 hover:text-white mt-1 transition cursor-pointer"
              >
                {expanded ? 'Show Less' : 'Read More'}
              </button>
            )}
          </div>
        </div>

        {/* Facts column (xl screens only): table up a touch, studios ride
            directly beneath it on the right like the reference. */}
        {(runtime || language || releaseDate || status || seasonsCount || revenue || budget) && (
          <div className="hidden xl:block absolute right-14 bottom-14 z-10 w-72 space-y-4">
          <div className="rounded-2xl cine-glass-panel overflow-hidden">
            {seasonsCount && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-[var(--cine-glass-border)]">
                <span className="text-white/60 font-medium">Season{seasonsCount > 1 ? 's' : ''}</span>
                <span className="text-white/90 font-semibold">
                  {seasonsCount}
                  {episodesCount && (
                    <span className="text-white/60 font-normal"> · {episodesCount} episode{episodesCount === 1 ? '' : 's'}</span>
                  )}
                </span>
              </div>
            )}
            {status && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-[var(--cine-glass-border)]">
                <span className="text-white/60 font-medium">Status</span>
                <span className="text-white/90 font-semibold">{status}</span>
              </div>
            )}
            {runtime && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Runtime</span>
                <span className="text-white/90 font-semibold">
                  {runtime}
                  <span className="text-white/60 font-normal"> · {formatEndsAt(runtimeMins)}</span>
                </span>
              </div>
            )}
            {language && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Language</span>
                <span className="text-white/90 font-semibold">{language}</span>
              </div>
            )}
            {releaseDate && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Release Date</span>
                <span className="text-white/90 font-semibold">{releaseDate}</span>
              </div>
            )}
            {revenue && budget ? (
              <div className={`flex items-center justify-between px-4 py-3 text-xs ${studios.length > 0 ? 'border-b border-white/[0.07]' : ''}`}>
                <span className="text-white/45 font-medium">Box Office / Budget</span>
                <span className="text-white/90 font-semibold">{revenue} / {budget}</span>
              </div>
            ) : revenue ? (
              <div className={`flex items-center justify-between px-4 py-3 text-xs ${studios.length > 0 ? 'border-b border-white/[0.07]' : ''}`}>
                <span className="text-white/45 font-medium">Box Office</span>
                <span className="text-white/90 font-semibold">{revenue}</span>
              </div>
            ) : budget ? (
              <div className={`flex items-center justify-between px-4 py-3 text-xs ${studios.length > 0 ? 'border-b border-white/[0.07]' : ''}`}>
                <span className="text-white/45 font-medium">Budget</span>
                <span className="text-white/90 font-semibold">{budget}</span>
              </div>
            ) : null}
            {studios.length > 0 && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
                <span className="text-white/45 font-medium flex-shrink-0">
                  Studio{studios.length > 1 ? 's' : ''}
                </span>
                <span className="text-white/90 font-semibold text-right leading-snug">
                  {studios.map((s) => s.name).join(' · ')}
                </span>
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Melt tail: laps 40px over the hero bottom and crossfades down
          over 260px, transparent-capped both ends. Hidden while a trailer
          plays. */}
      {!heroVideo && (
        <div className="cine-melt-tail" aria-hidden="true">
          <img src={backdrop} alt="" />
        </div>
      )}

      {/* Main Details Body (above the melt tail: content crisp, haze behind) */}
      <div className="relative z-20 max-w-[1560px] mx-auto px-6 md:px-14 mt-8 space-y-10">
        {detailsError && (
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span>{detailsError}</span>
            <button
              onClick={() => setDetailsRetry((r) => r + 1)}
              className="cine-control-btn"
            >
              Retry
            </button>
          </div>
        )}
        {/* Mobile facts (cert already shows in the meta row above) */}
        <section className="xl:hidden flex flex-wrap items-center gap-2 text-xs">
          {runtime && <span className="cine-chip cine-chip--neutral">{runtime} · {formatEndsAt(runtimeMins)}</span>}
          {language && <span className="cine-chip cine-chip--neutral">{language}</span>}
          {releaseDate && <span className="cine-chip cine-chip--neutral">{releaseDate}</span>}
        </section>

        {studios.length > 0 && (
          <p className="xl:hidden text-[11px] font-bold uppercase tracking-[0.2em] text-white/50">
            {studios.map((s) => s.name).join(' · ')}
          </p>
        )}

        {(revenue || budget) && (
          <section className="xl:hidden flex flex-wrap items-center gap-2 text-xs">
            <span className="cine-chip cine-chip--neutral">
              {revenue && budget ? `Box Office: ${revenue} / ${budget}` : revenue ? `Box Office: ${revenue}` : `Budget: ${budget}`}
            </span>
          </section>
        )}

        {/* Honours — gold strip, progressive disclosure (same as person
            pages), silent when the title has none indexed. */}
        {awards.length > 0 && (
          <section className="space-y-3">
            <div className="cine-section-head">
              <h3 className="cine-section-title inline-flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#f5c518]" />
                Honours
              </h3>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {(honoursExpanded ? awards : awards.slice(0, 6)).map((a, i) => (
                <div key={`${a.label}_${a.year}_${i}`} className="cine-award" >
                  <Trophy className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white">{a.label}</span>
                    <span className="block text-[10px] text-white/60">
                      {[a.year, a.work].filter(Boolean).join(' • ')}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {awards.length > 6 && (
              <button
                onClick={() => setHonoursExpanded((e) => !e)}
                aria-expanded={honoursExpanded}
                className="text-xs font-semibold text-white/50 hover:text-white transition cursor-pointer"
              >
                {honoursExpanded ? 'Show less' : `Show all ${awards.length}`}
              </button>
            )}
          </section>
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h3 className="cine-section-title">Cast</h3>
            <div className="cine-cast-rail flex gap-5 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <div
                  key={actor.id}
                  onClick={() => onSelectPerson?.(actor.id)}
                  
                  className="cine-cast-card flex-shrink-0 w-32 text-center space-y-2 cursor-pointer group"
                >
                  <div className="cine-cast-avatar w-28 h-28 mx-auto rounded-full overflow-hidden bg-[var(--cine-glass-tint)] border border-[var(--cine-glass-border)] shadow-lg">
                    <img
                      src={tmdb.getImageUrl(actor.profile_path, 'w185', FALLBACK_PROFILE)}
                      alt={actor.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.src = FALLBACK_PROFILE;
                      }}
                    />
                  </div>
                  <div>
                    <h4 className="text-[13px] font-bold text-white truncate">{actor.name}</h4>
                    <p className="text-[11px] text-white/70 truncate">{actor.character}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trailers */}
        {trailers.length > 0 && (
          <section className="space-y-4">
            <h3 className="cine-section-title">Trailers</h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {trailers.map((t) => (
                <div
                  key={t.key}
                  onClick={() => {
                    setHeroVideo(t.key);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                   className={`group relative flex-shrink-0 w-72 md:w-80 aspect-video rounded-2xl overflow-hidden cursor-pointer border transition ${
                     heroVideo === t.key
                       ? 'border-[var(--cine-accent)]/60'
                       : 'border-[var(--cine-glass-border)] hover:border-white/25'
                   }`}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${t.key}/hqdefault.jpg`}
                    alt={t.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition duration-300 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3">
                    <p className="cine-trailer-cap text-[11px] font-semibold text-white/90 truncate">{t.name}</p>
                    <p className="cine-trailer-cap text-[11px] text-white/60">{t.type}</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="cine-card-play" style={{ width: 44, height: 44 }}>
                      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Similar */}
        {similar.length > 0 && (
          <RowRail
            title="You Might Also Like"
            items={similar}
            showRating
            expandable
            onSelect={(item) => {
              onSelectMedia(item);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            mediaType={mediaType}
          />
        )}

        {loading && (
          <p className="text-center py-8 text-xs text-white/60">Loading details...</p>
        )}
      </div>
    </div>
  );
}
