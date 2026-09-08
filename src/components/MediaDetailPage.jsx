import React, { useState, useEffect } from 'react';
import { Play, Plus, Check, Star, X, Users, Trophy, ChevronRight } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE } from '../services/tmdb';
import { getImdbRating, imdbIdOf } from '../services/ratings';
import { getAwardsByImdb } from '../services/wikidata';
import { storage, formatClock } from '../services/storage';
import RowRail from './RowRail';

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

  const mediaId = media?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      setLoading(true);
      setDetailsError('');
      setHeroVideo(null);
      setLogo(null);
      setExpanded(false);
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
  useEffect(() => {
    let isMounted = true;
    setRt(null);
    const t = details?.title || details?.name || media?.title || media?.name;
    const y = (details?.release_date || details?.first_air_date || '').slice(0, 4);
    if (!t) return;
    fetch(`/api/rt?title=${encodeURIComponent(t)}&year=${encodeURIComponent(y)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (isMounted && d && (d.critic != null || d.audience != null)) setRt(d);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [details, media]);

  const title = details?.title || details?.name || media?.title || media?.name;
  const backdrop = tmdb.getImageUrl(details?.backdrop_path || media?.backdrop_path, 'w1280');
  const rating = (details?.vote_average || media?.vote_average || 0).toFixed(1);
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
        .filter((x) => x.poster_path && (x.vote_average || 0) > 0 && (x.vote_count || 0) >= 10)
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
  // Solo episode entry for shows: jump straight back to the saved
  // episode + second. Player restores S/E from storage at mount, so a
  // plain onPlay lands exactly where history left off.
  const resume = mediaType === 'tv' ? storage.getProgress('tv', mediaId) : null;
  const resumeReady = resume && (resume.currentTime || 0) >= 30;

  return (
    <div className="relative min-h-screen text-white pb-24 animate-in fade-in duration-300">
      {/* Blurred continuation: below the hero the same backdrop lives on as
          a dim frozen ghost, so the page melts instead of hard-cutting. */}
      <div className="cine-detail-bg" aria-hidden="true">
        <img src={backdrop} alt="" className="cine-detail-bg-img" />
        <div className="cine-detail-bg-shade" />
      </div>
      {/* Hero: still backdrop. Trailers play here only when the user picks
          one below — never autoplayed, so no player chrome or mute dance. */}
      <div className="relative w-full h-[86vh] min-h-[600px] overflow-hidden bg-black">
        {heroVideo ? (
          <iframe
            key={heroVideo}
            src={`https://www.youtube-nocookie.com/embed/${heroVideo}?autoplay=1&rel=0&modestbranding=1&controls=1&playsinline=1&iv_load_policy=3`}
            title="Trailer"
            className="cine-trailer-cover border-0"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <img src={backdrop} alt={title} className="w-full h-full object-cover object-center" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505]/90 via-[#050505]/30 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-transparent to-transparent pointer-events-none" />

        {/* Back to the still backdrop */}
        {heroVideo && (
          <button
            onClick={() => setHeroVideo(null)}
            className="cine-icon-btn absolute top-24 right-8 md:right-14 z-20"
            title="Close trailer"
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
              className="cine-btn cine-btn-primary cine-btn-shimmer cine-cta"
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
              className="cine-btn-circle"
              title={isWatchlist ? 'Remove from List' : 'Add to Watchlist'}
              aria-label={isWatchlist ? 'Remove from List' : 'Add to Watchlist'}
            >
              {isWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </button>

            {onWatchTogether && (
              <button
                onClick={() => onWatchTogether(media, details)}
                className="cine-btn-circle"
                title="Watch together (create room)"
                aria-label="Watch together in a room"
              >
                <Users className="w-5 h-5" />
              </button>
            )}

            {resumeReady && (
              <button
                onClick={() => onPlay(media, details)}
                className="cine-control-btn"
                title={`Continue Season ${resume.season} Episode ${resume.episode}`}
              >
                <Play className="w-4 h-4" fill="currentColor" />
                <span>{`S${resume.season} E${resume.episode} • ${formatClock(resume.currentTime)}`}</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm font-semibold text-white/90 pt-1">
            {releaseYear && <span>{releaseYear}</span>}
            {runtime && <span className="text-white/70">{runtime}</span>}
            {cert && (
              <span className="px-2 py-0.5 rounded-md bg-white/10 border border-white/20 text-xs font-bold text-white/85">
                {cert}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[var(--cine-accent)] font-bold">
              <Star className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
              {rating}
            </span>
            {imdb != null && (
              <span className="cine-imdb-tag" title="IMDb rating">
                <span className="cine-imdb-logo">IMDb</span>
                {imdb.toFixed(1)}
              </span>
            )}
            {rt?.critic != null && (
              <span className="cine-chip cine-chip--accent" title="Rotten Tomatoes critics">
                🍅 {rt.critic}%
              </span>
            )}
            {rt?.audience != null && (
              <span className="cine-chip cine-chip--neutral" title="Rotten Tomatoes audience">
                🍿 {rt.audience}%
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
                    title={`Open ${d.name}'s profile`}
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
                    title={`Open ${c.name}'s profile`}
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
                <span className="text-white/60 font-medium">Seasons</span>
                <span className="text-white/90 font-semibold">
                  {seasonsCount}
                  {episodesCount && (
                    <span className="text-white/60 font-normal"> · {episodesCount} episodes</span>
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
            {revenue && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Box Office</span>
                <span className="text-white/90 font-semibold">{revenue}</span>
              </div>
            )}
            {budget && (
              <div className="flex items-center justify-between px-4 py-3 text-xs">
                <span className="text-white/45 font-medium">Budget</span>
                <span className="text-white/90 font-semibold">{budget}</span>
              </div>
            )}
          </div>
          {studios.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2 px-1">
              {studios.map((s) => (
                s.logo_path ? (
                  <img
                    key={s.id || s.name}
                    src={tmdb.getImageUrl(s.logo_path, 'w300')}
                    alt={s.name}
                    title={s.name}
                    loading="lazy"
                    className="h-7 w-auto max-w-32 object-contain opacity-70 grayscale hover:opacity-100 hover:grayscale-0 transition"
                  />
                ) : (
                  <span
                    key={s.id || s.name}
                    className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/50"
                  >
                    {s.name}
                  </span>
                )
              ))}
            </div>
          )}
          </div>
        )}
      </div>

      {/* Main Details Body */}
      <div className="relative z-10 max-w-[1560px] mx-auto px-6 md:px-14 mt-8 space-y-10">
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
            {revenue && <span className="cine-chip cine-chip--neutral">Box Office: {revenue}</span>}
            {budget && <span className="cine-chip cine-chip--neutral">Budget: {budget}</span>}
          </section>
        )}

        {/* Honours — gold strip, silent when the title has none indexed. */}
        {awards.length > 0 && (
          <section className="space-y-3">
            <div className="cine-section-head">
              <h3 className="cine-section-title inline-flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#f5c518]" />
                Honours
              </h3>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {awards.map((a, i) => (
                <div key={`${a.label}_${a.year}_${i}`} className="cine-award" title={a.work || a.label}>
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
          </section>
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h3 className="cine-section-title">Cast</h3>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <div
                  key={actor.id}
                  onClick={() => onSelectPerson?.(actor.id)}
                  title={actor.name}
                  className="flex-shrink-0 w-32 text-center space-y-2 cursor-pointer group"
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
                    <p className="text-xs font-bold text-white truncate">{t.name}</p>
                    <p className="text-[10px] text-white/50">{t.type}</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <div className="w-11 h-11 rounded-full bg-white text-black flex items-center justify-center">
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
