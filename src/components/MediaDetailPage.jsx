import React, { useState, useEffect } from 'react';
import { Play, Plus, Check, Star } from 'lucide-react';
import { tmdb } from '../services/tmdb';
import { storage } from '../services/storage';

function formatMoney(value) {
  if (!value) return null;
  return `$${(value / 1_000_000).toFixed(1)}M`;
}

export default function MediaDetailPage({ media, mediaType, onPlay, onSelectMedia }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isWatchlist, setIsWatchlist] = useState(false);
  const [showTrailer, setShowTrailer] = useState(false);

  const mediaId = media?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      setLoading(true);
      setShowTrailer(false);
      try {
        const data = await tmdb.getMediaDetails(mediaType, mediaId);
        if (isMounted) {
          setDetails(data);
          setIsWatchlist(storage.isInWatchlist(mediaId));
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
  const backdrop = tmdb.getImageUrl(details?.backdrop_path || media?.backdrop_path, 'original');
  const rating = (details?.vote_average || media?.vote_average || 0).toFixed(1);
  const releaseYear = (details?.release_date || details?.first_air_date || media?.release_date || media?.first_air_date || '').split('-')[0];
  const runtime = details?.runtime || (details?.episode_run_time && details.episode_run_time[0]) || null;
  const revenue = formatMoney(details?.revenue);
  const budget = formatMoney(details?.budget);
  const genres = details?.genres || [];
  const cast = details?.credits?.cast?.slice(0, 12) || [];
  const similar = details?.similar?.results?.filter((x) => x.poster_path) || [];
  const trailer = details?.videos?.results?.find(
    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  );

  return (
    <div className="relative min-h-screen bg-[#050505] text-white pb-24 animate-in fade-in duration-300">
      {/* Edge-to-Edge Hero Backdrop / Trailer */}
      <div className="relative w-full h-[65vh] min-h-[480px] overflow-hidden bg-black">
        {showTrailer && trailer ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1`}
            title="Trailer"
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
          />
        ) : (
          <>
            <img src={backdrop} alt={title} className="w-full h-full object-cover object-center" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent" />
          </>
        )}

        {/* Content Overlay */}
        <div className="absolute bottom-10 left-8 md:left-14 right-8 max-w-4xl z-10 space-y-4">
          <div className="flex items-center gap-3 text-xs font-semibold text-white/80">
            <span className="cine-chip cine-chip--accent">
              <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
              {rating}
            </span>
            {releaseYear && <span>{releaseYear}</span>}
            {runtime && (
              <>
                <span>•</span>
                <span>{runtime}m</span>
              </>
            )}
            <span>•</span>
            <span className="uppercase text-[11px] tracking-wider text-white/60">{mediaType}</span>
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white drop-shadow-2xl">
            {title}
          </h1>

          {details?.tagline && (
            <p className="text-xs md:text-sm text-[var(--cine-accent)] font-medium drop-shadow-sm">
              "{details.tagline}"
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            {genres.map((g) => (
              <span key={g.id} className="cine-chip cine-chip--neutral">
                {g.name}
              </span>
            ))}
          </div>

          <p className="text-xs md:text-sm leading-relaxed text-white/75 max-w-2xl line-clamp-3">
            {details?.overview || media?.overview}
          </p>

          <div className="flex items-center gap-3 pt-3">
            <button
              onClick={() => onPlay(media, details)}
              className="cine-btn cine-btn-primary cine-btn-shimmer cine-cta"
            >
              <Play className="w-[18px] h-[18px]" fill="currentColor" />
              <span>Play Now</span>
            </button>

            {trailer && !showTrailer && (
              <button
                onClick={() => setShowTrailer(true)}
                className="cine-control-btn"
              >
                <Play className="w-3.5 h-3.5 text-[var(--cine-accent)]" fill="currentColor" />
                <span>Trailer</span>
              </button>
            )}

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
        </div>
      </div>

      {/* Main Details Body */}
      <div className="max-w-[1560px] mx-auto px-6 md:px-14 mt-8 space-y-12">
        {/* Facts */}
        {(revenue || budget || runtime) && (
          <section className="flex flex-wrap items-center gap-2 text-xs">
            {revenue && (
              <span className="cine-chip cine-chip--neutral">
                Box Office: {revenue}
              </span>
            )}
            {budget && (
              <span className="cine-chip cine-chip--neutral">
                Budget: {budget}
              </span>
            )}
            {details?.status && (
              <span className="cine-chip cine-chip--neutral">
                {details.status}
              </span>
            )}
          </section>
        )}

        {/* Storyline */}
        <section className="space-y-1.5">
          <h3 className="text-xs uppercase font-bold tracking-wider text-white/40">Storyline</h3>
          <p className="text-sm text-white/70 leading-relaxed max-w-3xl">
            {details?.overview || media?.overview || 'No storyline available.'}
          </p>
        </section>

        {/* Cast Section */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white/80 tracking-wide">Top Cast</h3>
            <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <div key={actor.id} className="flex-shrink-0 w-28 text-center space-y-2">
                  <div className="w-24 h-24 mx-auto rounded-full overflow-hidden bg-white/5 border border-white/10 shadow-lg">
                    <img
                      src={tmdb.getImageUrl(actor.profile_path, 'w185', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80')}
                      alt={actor.name}
                      className="w-full h-full object-cover"
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

        {/* Similar Titles Grid */}
        {similar.length > 0 && (
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-white/80 tracking-wide">More Like This</h3>
            <div className="cine-grid">
              {similar.slice(0, 12).map((item) => {
                const itemTitle = item.title || item.name;
                const itemPoster = tmdb.getImageUrl(item.poster_path, 'w500');
                const itemRating = item.vote_average ? item.vote_average.toFixed(1) : null;
                const itemYear = (item.release_date || item.first_air_date || '').split('-')[0];

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectMedia({ ...item, media_type: item.media_type || mediaType });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="cine-card cine-card-in"
                    title={itemTitle}
                  >
                    <div className="cine-card-poster">
                      <img src={itemPoster} alt={itemTitle} loading="lazy" />
                      {itemRating && (
                        <span className="cine-rating-badge">
                          <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                          {itemRating}
                        </span>
                      )}
                    </div>
                    <h4 className="cine-card-title">{itemTitle}</h4>
                    <p className="cine-card-year">{itemYear}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {loading && (
          <p className="text-center py-8 text-xs text-white/40">Loading details...</p>
        )}
      </div>
    </div>
  );
}
