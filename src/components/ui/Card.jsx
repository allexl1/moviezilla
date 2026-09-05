import React from 'react';
import { Star } from 'lucide-react';
import { tmdb } from '../../services/tmdb';

/**
 * Shared MediaCard component — replaces all ad-hoc card implementations.
 * Used in: home grid, discovery pages, search results, "More Like This", etc.
 */
export default function Card({ media, onClick, showRating = true, size = 'default', posterOnly = false }) {
  const title = media?.title || media?.name || 'Untitled';
  const poster = tmdb.getImageUrl(media?.poster_path, size === 'lg' ? 'w780' : 'w500');
  const rating = media?.vote_average ? media.vote_average.toFixed(1) : null;
  const year = (media?.release_date || media?.first_air_date || '').split('-')[0];

  const sizeClasses = {
    sm: 'w-32',
    default: 'w-40 md:w-44',
    lg: 'w-48 md:w-56',
    fluid: 'w-full',
  };

  return (
    <div
      onClick={() => onClick?.(media)}
      title={title}
      className={`cine-card cine-card-in flex-shrink-0 ${sizeClasses[size] || sizeClasses.default}`}
    >
      <div className="cine-card-poster">
        <img
          src={poster}
          alt={title}
          loading="lazy"
          onError={(e) => {
            e.target.src =
              'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=500&q=80';
          }}
        />
        {showRating && rating && (
          <span className="cine-rating-badge">
            <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
            {rating}
          </span>
        )}
      </div>

      {!posterOnly && (
        <>
          <h4 className="cine-card-title">{title}</h4>
          {year && <p className="cine-card-year">{year}</p>}
        </>
      )}
    </div>
  );
}
