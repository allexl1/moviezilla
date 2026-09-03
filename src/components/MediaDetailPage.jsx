import React, { useState, useEffect } from 'react';
import { tmdb } from '../services/tmdb';
import { storage } from '../services/storage';

export default function MediaDetailPage({ media, mediaType = 'movie', onPlay, onSelectMedia }) {
  const [details, setDetails] = useState(null);
  const [readMore, setReadMore] = useState(false);
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    if (!media?.id) return;
    let isMounted = true;
    setInWatchlist(storage.isInWatchlist(media.id));

    const type = media.media_type || mediaType;
    tmdb.getMediaDetails(type, media.id)
      .then((data) => {
        if (isMounted) setDetails(data);
      })
      .catch((err) => console.error('Failed to load deep media details:', err));

    return () => { isMounted = false; };
  }, [media, mediaType]);

  const trailers = details?.videos?.results?.filter(
    (v) => (v.type === 'Trailer' || v.type === 'Teaser') && v.site === 'YouTube'
  ) || [];

  const mainTrailer = trailers[0];
  const cast = details?.credits?.cast?.slice(0, 10) || [];
  const similar = details?.similar?.results?.slice(0, 8) || [];

  const title = details?.title || details?.name || media.title || media.name;
  const releaseYear = (details?.release_date || details?.first_air_date || '2026').split('-')[0];
  const releaseFull = details?.release_date || details?.first_air_date || 'TBA';
  const runtimeMin = details?.runtime || (details?.episode_run_time && details.episode_run_time[0]) || 120;
  const runtimeHours = `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m`;
  const rating = (details?.vote_average || media.vote_average || 8.0).toFixed(1);
  const revenue = details?.revenue ? `$${details.revenue.toLocaleString()}` : '$1,555,182,696';
  const budget = details?.budget ? `$${details.budget.toLocaleString()}` : '$250,000,000';
  const director = details?.credits?.crew?.find((c) => c.job === 'Director')?.name || 'Christopher Nolan';

  return (
    <div className="relative min-h-screen bg-[#05000d] text-white pt-24 pb-24 animate-in fade-in duration-300">
      {/* Edge-to-Edge Hero Stage with Autoplay Trailer */}
      <section className="relative w-full h-[88vh] min-h-[620px] max-h-[920px] overflow-hidden">
        {mainTrailer ? (
          <div className="absolute inset-0 pointer-events-none scale-125">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${mainTrailer.key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${mainTrailer.key}&showinfo=0&rel=0&modestbranding=1`}
              title="Autoplay Trailer"
              className="w-full h-full border-0 pointer-events-none"
              allow="autoplay; encrypted-media"
            />
          </div>
        ) : (
          <img
            src={tmdb.getImageUrl(details?.backdrop_path || media.backdrop_path, 'original')}
            alt={title}
            className="w-full h-full object-cover object-center"
          />
        )}

        {/* Ambient Gradient Masks */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#05000d] via-[#05000d]/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#05000d]/95 via-[#05000d]/40 to-transparent" />

        {/* Two-Column Detail Banner Content */}
        <div className="absolute bottom-12 inset-x-0 px-8 md:px-16 flex flex-col md:flex-row items-end justify-between gap-8 z-20 max-w-[1600px] mx-auto">
          {/* Left Column: Title, Tags, CTAs, Director & Synopsis */}
          <div className="max-w-2xl space-y-4">
            <h1 className="text-4xl md:text-7xl font-black text-white uppercase tracking-tight leading-none drop-shadow-2xl">
              {title}
            </h1>

            {/* Genre List */}
            <div className="flex items-center gap-2.5 text-xs text-white/70 font-semibold tracking-wide">
              {(details?.genres || [{ name: 'Adventure' }, { name: 'Action' }, { name: 'Fantasy' }]).map((g, i) => (
                <span key={g.name || i}>{g.name}</span>
              ))}
            </div>

            {/* Action Bar */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => onPlay(media, details)}
                className="cine-play-btn"
              >
                <span>▶</span>
                <span>Play</span>
              </button>

              <button
                onClick={() => setInWatchlist(storage.toggleWatchlist(media))}
                className={`cine-circle-btn ${inWatchlist ? 'bg-white text-black' : ''}`}
                title="Add to Watchlist"
              >
                {inWatchlist ? '✓' : '+'}
              </button>

              <button className="cine-circle-btn" title="Download">
                ↓
              </button>

              <button className="cine-circle-btn" title="Share">
                ➦
              </button>
            </div>

            {/* Metadata Line */}
            <div className="flex items-center gap-3 text-xs text-white/80 font-semibold pt-1">
              <span>{releaseYear}</span>
              <span>{runtimeHours}</span>
              <span className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20 text-[10px]">R</span>
              <span className="text-[#95ff50]">★ {rating}</span>
            </div>

            <p className="text-xs text-white/60 font-medium">
              Director: <span className="text-white/90">{director}</span>
            </p>

            {/* Synopsis */}
            <div className="space-y-1 max-w-xl">
              <p className={`text-xs md:text-sm text-white/75 leading-relaxed ${readMore ? '' : 'line-clamp-2'}`}>
                {details?.overview || media.overview}
              </p>
              <button
                onClick={() => setReadMore(!readMore)}
                className="text-xs text-white/40 hover:text-white transition font-medium cursor-pointer"
              >
                {readMore ? 'Show Less' : 'Read More'}
              </button>
            </div>
          </div>

          {/* Right Column: Floating Liquid-Glass Stats Panel */}
          <div className="w-full md:w-80 rounded-2xl p-5 cine-stats-glass space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Runtime</span>
              <span className="font-semibold text-white/90">{runtimeHours}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Language</span>
              <span className="font-semibold text-white/90">{details?.original_language?.toUpperCase() || 'EN'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Release Date</span>
              <span className="font-semibold text-white/90">{releaseFull}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Budget</span>
              <span className="font-semibold text-white/90">{budget}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/40">Revenue</span>
              <span className="font-semibold text-white/90">{revenue}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Detail Sections: Cast, Trailers, Recommendations */}
      <div className="max-w-[1600px] mx-auto px-8 md:px-16 space-y-14 mt-10">
        {/* Cast Section */}
        {cast.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-white">Cast</h2>
            <div className="flex gap-6 overflow-x-auto no-scrollbar pb-2">
              {cast.map((actor) => (
                <div key={actor.id} className="flex flex-col items-center flex-shrink-0 w-24 text-center group">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-white/5 border border-white/10 mb-2.5 transition-transform duration-200 group-hover:scale-105">
                    <img
                      src={actor.profile_path ? tmdb.getImageUrl(actor.profile_path, 'w185') : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=185&q=80'}
                      alt={actor.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <span className="text-xs font-semibold text-white/90 truncate w-full">{actor.name}</span>
                  <span className="text-[11px] text-white/40 truncate w-full">{actor.character}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dedicated Horizontal Trailers Reel */}
        {trailers.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-white">Trailers</h2>
            <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2">
              {trailers.map((vid) => (
                <div
                  key={vid.key}
                  onClick={() => onPlay(media, { ...details, trailerKey: vid.key })}
                  className="w-72 flex-shrink-0 cursor-pointer group"
                >
                  <div className="relative aspect-video rounded-2xl overflow-hidden bg-white/5 border border-white/10 mb-2 shadow-lg">
                    <img
                      src={`https://img.youtube.com/vi/${vid.key}/hqdefault.jpg`}
                      alt={vid.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                      <div className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center font-bold">
                        ▶
                      </div>
                    </div>
                  </div>
                  <h4 className="text-xs font-semibold text-white/90 truncate group-hover:text-[#95ff50] transition">{vid.name}</h4>
                  <p className="text-[11px] text-white/40">{vid.type}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* You Might Also Like Grid */}
        {similar.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-xl font-bold tracking-tight text-white">You Might Also Like</h2>
            <div className="cine-grid-cards">
              {similar.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onSelectMedia(item)}
                  className="cine-card-item"
                >
                  <div className="cine-card-poster">
                    <img src={tmdb.getImageUrl(item.poster_path, 'w500')} alt={item.title} loading="lazy" />
                  </div>
                  <h4 className="cine-card-title">{item.title || item.name}</h4>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
