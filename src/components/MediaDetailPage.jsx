import React, { useState, useEffect } from 'react';
import { Play, Plus, Check, Star, Volume2, VolumeX, CalendarDays } from 'lucide-react';
import { tmdb, FALLBACK_PROFILE } from '../services/tmdb';
import { storage } from '../services/storage';
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

export default function MediaDetailPage({ media, mediaType, onPlay, onSelectMedia }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [logo, setLogo] = useState(null);
  const [trailerKey, setTrailerKey] = useState(null);
  const [muted, setMuted] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const mediaId = media?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      setLoading(true);
      setTrailerKey(null);
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
          const first = (data?.videos?.results || []).find(
            (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
          );
          if (first) setTrailerKey(first.key);
          setLoading(false);
        }
      } catch (err) {
        console.error('Failed to load media details:', err);
        if (isMounted) setLoading(false);
      }
    }
    fetchDetails();
    return () => { isMounted = false; };
  }, [mediaId, mediaType]);

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
  const director = (details?.credits?.crew || []).find((c) => c.job === 'Director')?.name || null;
  const studios = (details?.production_companies || []).slice(0, 2).map((c) => c.name);
  const language = (details?.original_language || '').toUpperCase() || null;
  const releaseDate = formatDate(details?.release_date || details?.first_air_date);
  const similar = details?.similar?.results?.filter((x) => x.poster_path) || [];
  const trailers = (details?.videos?.results || []).filter(
    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  ).slice(0, 6);
  const overview = details?.overview || media?.overview || 'No storyline available.';

  return (
    <div className="relative min-h-screen bg-[var(--cine-bg)] text-white pb-24 animate-in fade-in duration-300">
      {/* Hero: trailer running (cinejoy parity), still backdrop fallback */}
      <div className="relative w-full h-[68vh] min-h-[500px] overflow-hidden bg-black">
        {trailerKey ? (
          <iframe
            key={`${trailerKey}_${muted ? 'muted' : 'loud'}`}
            src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${muted ? 1 : 0}&loop=1&playlist=${trailerKey}&rel=0&modestbranding=1&controls=0&playsinline=1`}
            title="Trailer"
            className="w-full h-full border-0 scale-[1.02] pointer-events-none"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <img src={backdrop} alt={title} className="w-full h-full object-cover object-center" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/45 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505]/80 via-transparent to-transparent pointer-events-none" />

        {/* Mute toggle */}
        {trailerKey && (
          <button
            onClick={() => setMuted((m) => !m)}
            className="cine-icon-btn absolute bottom-8 right-8 md:right-14 z-20"
            title={muted ? 'Unmute trailer' : 'Mute trailer'}
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        )}

        {/* Content Overlay */}
        <div className="absolute bottom-10 left-8 md:left-14 right-8 max-w-4xl z-10 space-y-3">
          {logo ? (
            <img
              src={tmdb.getImageUrl(logo, 'w500')}
              alt={title}
              className="max-h-28 max-w-md w-auto object-contain object-left-bottom drop-shadow-2xl"
            />
          ) : (
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white drop-shadow-2xl">
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
                storage.toggleWatchlist(media);
                setIsWatchlist(!isWatchlist);
              }}
              className="cine-btn-circle"
              title={isWatchlist ? 'Remove from List' : 'Add to Watchlist'}
            >
              {isWatchlist ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
            </button>
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
          </div>

          {director && (
            <p className="text-sm text-white/50">
              Director: <span className="text-white/85 font-medium">{director}</span>
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

        {/* Facts panel (desktop) */}
        {(runtime || language || releaseDate) && (
          <div className="hidden lg:block absolute right-14 bottom-10 z-10 w-72 rounded-2xl cine-glass-panel overflow-hidden">
            {runtime && (
              <div className="flex items-center justify-between px-4 py-3 text-xs border-b border-white/[0.07]">
                <span className="text-white/45 font-medium">Runtime</span>
                <span className="text-white/90 font-semibold">
                  {runtime}
                  <span className="text-white/40 font-normal"> · {formatEndsAt(runtimeMins)}</span>
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
              <div className="flex items-center justify-between px-4 py-3 text-xs">
                <span className="text-white/45 font-medium">Release Date</span>
                <span className="text-white/90 font-semibold">{releaseDate}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Details Body */}
      <div className="max-w-[1560px] mx-auto px-6 md:px-14 mt-8 space-y-12">
        {/* Mobile facts */}
        <section className="lg:hidden flex flex-wrap items-center gap-2 text-xs">
          {runtime && <span className="cine-chip cine-chip--neutral">{runtime} · {formatEndsAt(runtimeMins)}</span>}
          {language && <span className="cine-chip cine-chip--neutral">{language}</span>}
          {releaseDate && <span className="cine-chip cine-chip--neutral">{releaseDate}</span>}
          {cert && <span className="cine-chip cine-chip--neutral">{cert}</span>}
        </section>

        {studios.length > 0 && (
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">
            {studios.join(' · ')}
          </p>
        )}

        {(revenue || budget) && (
          <section className="flex flex-wrap items-center gap-2 text-xs">
            {revenue && <span className="cine-chip cine-chip--neutral">Box Office: {revenue}</span>}
            {budget && <span className="cine-chip cine-chip--neutral">Budget: {budget}</span>}
          </section>
        )}

        {/* Cast */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h3 className="cine-section-title">Cast</h3>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <div key={actor.id} className="flex-shrink-0 w-32 text-center space-y-2">
                  <div className="w-28 h-28 mx-auto rounded-full overflow-hidden bg-white/5 border border-white/10 shadow-lg">
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
                    <h4 className="text-xs font-semibold text-white truncate">{actor.name}</h4>
                    <p className="text-[10px] text-white/40 truncate">{actor.character}</p>
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
                    setTrailerKey(t.key);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`group relative flex-shrink-0 w-72 aspect-video rounded-2xl overflow-hidden cursor-pointer border transition ${
                    trailerKey === t.key
                      ? 'border-[var(--cine-accent)]/60'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${t.key}/hqdefault.jpg`}
                    alt={t.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
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
            items={similar.slice(0, 14)}
            onSelect={(item) => {
              onSelectMedia(item);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            mediaType={mediaType}
          />
        )}

        {loading && (
          <p className="text-center py-8 text-xs text-white/40">Loading details...</p>
        )}
      </div>
    </div>
  );
}
