import React, { useState, useEffect } from 'react';
import { tmdb } from '../services/tmdb';
import { storage } from '../services/storage';

export default function MediaDetailPage({ media, mediaType, onPlay, onSelectMedia }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isWatchlist, setIsWatchlist] = useState(false);

  const mediaId = media?.id;

  useEffect(() => {
    let isMounted = true;
    async function fetchDetails() {
      setLoading(true);
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
  const poster = tmdb.getImageUrl(details?.poster_path || media?.poster_path, 'w500');
  const rating = (details?.vote_average || media?.vote_average || 7.8).toFixed(1);
  const releaseYear = (details?.release_date || details?.first_air_date || media?.release_date || media?.first_air_date || '2026').split('-')[0];
  const genres = details?.genres || [];
  const cast = details?.credits?.cast?.slice(0, 10) || [];
  const similar = details?.similar?.results?.filter((x) => x.poster_path) || [];

  return (
    <div className="relative min-h-screen bg-[#05000d] text-white pb-24 animate-in fade-in duration-300">
      {/* Edge-to-Edge Hero Backdrop */}
      <div className="relative w-full h-[65vh] min-h-[480px] overflow-hidden">
        <img src={backdrop} alt={title} className="w-full h-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05000d] via-[#05000d]/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#05000d] via-transparent to-transparent" />

        {/* Content Overlay */}
        <div className="absolute bottom-10 left-8 md:left-14 right-8 max-w-4xl z-10 space-y-4">
          <div className="flex items-center gap-3 text-xs font-semibold text-white/80">
            <span className="px-2.5 py-0.5 rounded-full bg-[#95ff50]/15 text-[#95ff50] border border-[#95ff50]/30 font-bold">
              ★ {rating}
            </span>
            <span>{releaseYear}</span>
            <span>•</span>
            <span className="uppercase text-[11px] tracking-wider text-white/60">{mediaType}</span>
          </div>

          <h1 className="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-tight text-white drop-shadow-2xl">
            {title}
          </h1>

          <div className="flex flex-wrap gap-2 pt-1">
            {genres.map((g) => (
              <span key={g.id} className="px-3 py-1 rounded-full bg-white/[0.06] border border-white/10 text-xs font-medium text-white/80 backdrop-blur-xl">
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
              className="cine-play-btn"
            >
              <span>▶</span>
              <span>Play Now</span>
            </button>

            <button
              onClick={() => {
                storage.toggleWatchlist(media);
                setIsWatchlist(!isWatchlist);
              }}
              className="cine-circle-btn"
              title={isWatchlist ? 'Remove from List' : 'Add to Watchlist'}
            >
              {isWatchlist ? '✓' : '+'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Details Body */}
      <div className="max-w-[1560px] mx-auto px-6 md:px-14 mt-8 space-y-12">
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
            <div className="cine-grid-cards">
              {similar.slice(0, 6).map((item) => {
                const itemTitle = item.title || item.name;
                const itemPoster = tmdb.getImageUrl(item.poster_path, 'w500');
                const itemRating = item.vote_average ? item.vote_average.toFixed(1) : null;
                const itemYear = (item.release_date || item.first_air_date || '').split('-')[0];

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      onSelectMedia(item);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="cine-card-item"
                  >
                    <div className="cine-card-poster">
                      <img src={itemPoster} alt={itemTitle} loading="lazy" />
                      {itemRating && <span className="cine-card-badge">★ {itemRating}</span>}
                    </div>
                    <h4 className="cine-card-title">{itemTitle}</h4>
                    <p className="cine-card-year">{itemYear}</p>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
