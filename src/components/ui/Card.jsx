import React from 'react';
import { Star, Play } from 'lucide-react';
import { tmdb, FALLBACK_POSTER } from '../../services/tmdb';

/**
 * Shared MediaCard component — replaces all ad-hoc card implementations.
 * Used in: home grid, discovery pages, search results, "More Like This", etc.
 */
export default function Card({ media, onClick, showRating = true, size = 'default', posterOnly = false }) {
  const title = media?.title || media?.name || 'Untitled';
  // Fluid grid cards render up to ~210px wide — w500 keeps them crisp on
  // retina; rails stay on lighter w342, lg keeps w780.
  const posterSize = size === 'lg' ? 'w780' : size === 'fluid' ? 'w500' : 'w342';
  const poster = tmdb.getImageUrl(media?.poster_path, posterSize);
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
          decoding="async"
          onError={(e) => {
            e.target.src = FALLBACK_POSTER;
          }}
        />
        {showRating && rating && (
          <span className="cine-rating-badge">
            <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
            {rating}
          </span>
        )}
        {/* Hover quick-view: play + title + year/rating. Hover-capable
            pointers only — touch users tap straight through to details. */}
        <span className="cine-card-hover" aria-hidden="true">
          <span className="cine-card-play">
            <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
          </span>
          <span className="cine-card-hover-title">{title}</span>
          {(year || rating) && (
            <span className="cine-card-hover-meta">
              {year}
              {year && rating ? '  •  ' : ''}
              {rating && (
                <>
                  <Star className="w-3 h-3" fill="currentColor" strokeWidth={0} />
                  {rating}
                </>
              )}
            </span>
          )}
        </span>
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
