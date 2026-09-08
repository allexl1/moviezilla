import React, { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import Card from './ui/Card';

/**
 * RowRail — horizontal poster rail for the home page.
 * Cinejoy-style: section title, edge-to-edge scroll, poster-only cards.
 * `action`: { label, onClick } rendered right (e.g. View All).
 * `expandable`: adds a "Show all N" toggle that swaps the rail for a full
 * grid — caps become progressive disclosure instead of a hard wall.
 */
export default function RowRail({ title, titleNode, items = [], onSelect, mediaType, action, showRating = false, expandable = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!items || items.length === 0) return null;

  const cards = (size) =>
    items.map((media) => (
      <Card
        key={`${title}_${media.id}`}
        media={media}
        onClick={(m) => onSelect?.({ ...m, media_type: m.media_type || mediaType || 'movie' })}
        showRating={showRating}
        posterOnly
        size={size}
      />
    ));

  return (
    <section className="space-y-3">
      <div className="cine-section-head">
        {titleNode || <h2 className="cine-section-title">{title}</h2>}
        {expandable && items.length > 8 ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={expanded}
            className="group flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white transition cursor-pointer"
          >
            {expanded ? 'Show less' : `Show all ${items.length}`}
            <ArrowRight className={`w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 ${expanded ? '-rotate-90' : ''}`} />
          </button>
        ) : action ? (
          <button
            onClick={action.onClick}
            className="group flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white transition cursor-pointer"
          >
            {action.label}
            <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
          </button>
        ) : (
          <span className="text-xs text-white/60">{items.length} titles</span>
        )}
      </div>

      {expanded ? (
        <div className="cine-grid">{cards('fluid')}</div>
      ) : (
        <div className="cine-rail no-scrollbar -mx-1 px-1">{cards('default')}</div>
      )}
    </section>
  );
}
