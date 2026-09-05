import React from 'react';
import { ArrowRight } from 'lucide-react';
import Card from './ui/Card';

/**
 * RowRail — horizontal poster rail for the home page.
 * Cinejoy-style: section title, edge-to-edge scroll, poster-only cards.
 * `action`: { label, onClick } rendered right (e.g. View All).
 */
export default function RowRail({ title, titleNode, items = [], onSelect, mediaType, action }) {
  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="cine-section-head">
        {titleNode || <h2 className="cine-section-title">{title}</h2>}
        {action ? (
          <button
            onClick={action.onClick}
            className="flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white transition cursor-pointer"
          >
            {action.label}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="text-xs text-white/40">{items.length} titles</span>
        )}
      </div>

      <div className="cine-rail no-scrollbar -mx-1 px-1">
        {items.map((media) => (
          <Card
            key={`${title}_${media.id}`}
            media={media}
            onClick={(m) => onSelect?.({ ...m, media_type: m.media_type || mediaType || 'movie' })}
            showRating={false}
            posterOnly
          />
        ))}
      </div>
    </section>
  );
}
