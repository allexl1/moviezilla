import React, { useState, useEffect } from 'react';
import { tmdb } from '../services/tmdb';
import { storage } from '../services/storage';

export default function MediaDetailModal({ media, mediaType = 'movie', isOpen, onClose, onPlay }) {
  const [details, setDetails] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    if (!isOpen || !media?.id) return;
    let isMounted = true;
    setLoading(true);
    setShowTrailer(false);
    setInWatchlist(storage.isInWatchlist(media.id));

    const type = media.media_type || mediaType;
    tmdb.getMediaDetails(type, media.id)
      .then((data) => {
        if (isMounted) {
          setDetails(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load deep details:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, media, mediaType]);

  if (!isOpen || !media) return null;

  const trailer = details?.videos?.results?.find(
    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  );

  const cast = details?.credits?.cast?.slice(0, 12) || [];
  const title = details?.title || details?.name || media.title || media.name;
  const releaseYear = (details?.release_date || details?.first_air_date || media.release_date || '').split('-')[0];
  const runtime = details?.runtime || (details?.episode_run_time && details.episode_run_time[0]) || null;
  const rating = (details?.vote_average || media.vote_average || 0).toFixed(1);
  const revenue = details?.revenue ? `$${(details.revenue / 1_000_000).toFixed(1)}M` : null;
  const budget = details?.budget ? `$${(details.budget / 1_000_000).toFixed(1)}M` : null;

  const handleToggleWatchlist = () => {
    const added = storage.toggleWatchlist(media);
    setInWatchlist(added);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
      {/* Click outside backdrop */}
      <div className="fixed inset-0" onClick={onClose} />

      {/* Main Glass Sheet */}
      <div className="relative z-10 w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-3xl bg-[#0e0e14]/90 border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.85)] flex flex-col no-scrollbar">
        {/* Floating Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 w-10 h-10 rounded-full bg-black/60 border border-white/15 text-white/80 hover:text-white backdrop-blur-md flex items-center justify-center cursor-pointer transition"
        >
          ✕
        </button>

        {/* Hero Banner / Trailer Area */}
        <div className="relative w-full aspect-[21/9] min-h-[320px] max-h-[460px] bg-black overflow-hidden">
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
              <img
                src={tmdb.getImageUrl(details?.backdrop_path || media.backdrop_path, 'original')}
                alt={title}
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e14] via-[#0e0e14]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0e0e14]/95 via-[#0e0e14]/30 to-transparent" />

              {/* Title & Play overlay */}
              <div className="absolute bottom-6 left-6 md:left-8 right-6 flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-xl space-y-2">
                  <h1 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tight drop-shadow-lg">
                    {title}
                  </h1>
                  {details?.tagline && (
                    <p className="text-xs md:text-sm text-[#95ff50] font-medium drop-shadow-sm">
                      "{details.tagline}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2.5">
                  {trailer && (
                    <button
                      onClick={() => setShowTrailer(true)}
                      className="px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-md text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer transition"
                    >
                      <svg className="w-3.5 h-3.5 text-[#95ff50]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Trailer
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onPlay(media, details);
                      onClose();
                    }}
                    className="px-6 py-2.5 rounded-full bg-[#95ff50] hover:bg-lime-400 text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-[0_0_20px_rgba(149,255,80,0.4)]"
                  >
                    <span>▶</span>
                    <span>Watch Now</span>
                  </button>
                  <button
                    onClick={handleToggleWatchlist}
                    className={`w-9 h-9 rounded-full border border-white/15 backdrop-blur-md flex items-center justify-center text-sm cursor-pointer transition ${
                      inWatchlist ? 'bg-[#95ff50] text-black font-bold' : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                    title={inWatchlist ? 'Remove from List' : 'Add to List'}
                  >
                    {inWatchlist ? '✓' : '+'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Content Details */}
        <div className="p-6 md:p-8 space-y-6">
          {/* Metadata Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {rating && (
              <span className="px-3 py-1 rounded-full bg-black/60 border border-white/10 text-[#95ff50] font-bold">
                ★ {rating}
              </span>
            )}
            {releaseYear && (
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80">
                {releaseYear}
              </span>
            )}
            {runtime && (
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/80">
                {runtime}m
              </span>
            )}
            {revenue && (
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                Box Office: {revenue}
              </span>
            )}
            {budget && (
              <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60">
                Budget: {budget}
              </span>
            )}
            {details?.genres?.map((g) => (
              <span key={g.id} className="px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/5 text-white/50 text-[11px]">
                {g.name}
              </span>
            ))}
          </div>

          {/* Synopsis */}
          <div className="space-y-1.5">
            <h3 className="text-xs uppercase font-bold tracking-wider text-white/40">Storyline</h3>
            <p className="text-sm text-white/70 leading-relaxed max-w-3xl">
              {details?.overview || media.overview || 'No storyline available.'}
            </p>
          </div>

          {/* Cast Carousels */}
          {cast.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs uppercase font-bold tracking-wider text-white/40">Top Cast</h3>
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {cast.map((actor) => (
                  <div key={actor.id} className="flex flex-col items-center flex-shrink-0 w-20 text-center">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-white/5 border border-white/10 mb-2">
                      <img
                        src={
                          actor.profile_path
                            ? tmdb.getImageUrl(actor.profile_path, 'w185')
                            : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=185&q=80'
                        }
                        alt={actor.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-white/90 truncate w-full">{actor.name}</span>
                    <span className="text-[10px] text-white/40 truncate w-full">{actor.character}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
