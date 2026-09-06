import React from 'react';
import { Play, CalendarDays } from 'lucide-react';
import { tmdb, FALLBACK_BACKDROP } from '../services/tmdb';

/**
 * UpcomingRail — 16:9 backdrop shelf for unreleased/airing titles.
 * Green "Coming Soon" badge, hover reveals play + title + date.
 * Items lack media_type, so the caller pins it (movie vs tv).
 */
export default function UpcomingRail({
  title,
  items = [],
  onSelect,
  mediaType = 'movie',
  badge = 'Coming Soon',
  dateKey = 'release_date',
}) {
  if (!items || items.length === 0) return null;

  const dateOf = (m) => (m?.[dateKey] || '').split('-').slice(0, 2).join(' / ') || null;
  const yearOf = (m) => (m?.[dateKey] || '').split('-')[0] || null;

  return (
    <section className="space-y-3">
      <div className="cine-section-head">
        <h2 className="cine-section-title">{title}</h2>
        <span className="text-xs text-white/60">{items.length} titles</span>
      </div>

      <div className="cine-rail no-scrollbar -mx-1 px-1">
        {items.map((media) => {
          const name = media.title || media.name || 'Untitled';
          const date = dateOf(media);
          return (
            <button
              key={`${title}_${media.id}`}
              onClick={() => onSelect?.({ ...media, media_type: media.media_type || mediaType })}
              className="cine-soon-card group"
              title={name}
              aria-label={`View ${name}`}
            >
              <img
                src={tmdb.getImageUrl(media.backdrop_path, 'w780')}
                alt=""
                loading="lazy"
                decoding="async"
                className="cine-soon-img"
                onError={(e) => {
                  e.target.src = FALLBACK_BACKDROP;
                }}
              />
              <span className="cine-soon-scrim" aria-hidden="true" />
              <span className="cine-soon-badge">{badge}</span>
              {yearOf(media) && (
                <span className="cine-soon-year">{yearOf(media)}</span>
              )}
              <span className="cine-soon-hover" aria-hidden="true">
                <span className="cine-soon-play">
                  <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                </span>
                <span className="cine-soon-name">{name}</span>
                {date && (
                  <span className="cine-soon-date">
                    <CalendarDays className="w-3 h-3" />
                    {date}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
