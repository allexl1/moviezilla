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
  verb = 'coming',
  dateKey = 'release_date',
  loading = false,
}) {
  // Loading shimmer in exact card geometry: the shelf region must never
  // read as silently broken (a blank gap under a populated header is
  // indistinguishable from a bug — that confusion already happened once).
  if (loading && (!items || items.length === 0)) {
    return (
      <section className="space-y-3" aria-hidden="true">
        <div className="cine-section-head">
          <h2 className="cine-section-title">{title}</h2>
        </div>
        <div className="cine-rail no-scrollbar -mx-1 px-1 flex flex-nowrap overflow-x-auto">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="cine-soon-card flex-shrink-0">
              <div className="skel absolute inset-0" />
            </div>
          ))}
        </div>
      </section>
    );
  }
  if (!items || items.length === 0) return null;

  // "Sep 16" like the reference — falls back to the raw year.
  const dateOf = (m) => {
    const iso = m?.[dateKey] || '';
    const d = new Date(`${iso}T00:00:00`);
    if (iso && !Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    return null;
  };
  const yearOf = (m) => (m?.[dateKey] || '').split('-')[0] || null;

  return (
    <section className="space-y-3">
      <div className="cine-section-head">
        <h2 className="cine-section-title">{title}</h2>
        <span className="text-xs text-white/60">{items.length} titles • one line, scroll →</span>
      </div>

      {/* Single horizontal line only: no wrap, snap scroll, fixed 16:9 cards. */}
      <div className="cine-rail no-scrollbar -mx-1 px-1 flex flex-nowrap overflow-x-auto">
        {items.map((media) => {
          const name = media.title || media.name || 'Untitled';
          const date = dateOf(media);
          const year = yearOf(media);
          return (
            <button
              key={`${title}_${media.id}`}
              onClick={() => onSelect?.({ ...media, media_type: media.media_type || mediaType })}
              className="cine-soon-card group flex-shrink-0"
              title={year ? `${name} — ${verb} ${year}` : name}
              aria-label={year ? `View ${name}, ${verb} ${year}` : `View ${name}`}
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
              <span className="cine-soon-badge">{year ? `${badge} • ${year}` : badge}</span>
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
