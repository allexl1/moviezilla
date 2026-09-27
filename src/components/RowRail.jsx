import { useState, useRef, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import Card from './ui/Card';

/**
 * RowRail — horizontal poster rail for the home page.
 * Cinejoy-style: section title, edge-to-edge scroll, poster-only cards.
 * `action`: { label, onClick } rendered right (e.g. View All).
 * `filterNode`: center filter (career slice) — pinned to the exact middle
 *   by the three-zone header, whether or not an action button exists.
 * `expandable`: adds a "Show all N" toggle that swaps the rail for a full
 * grid — caps become progressive disclosure instead of a hard wall.
 */
export default function RowRail({ title, titleNode, filterNode, items = [], onSelect, mediaType, action, showRating = false, showRole = false, captioned = false, expandable = false, cardSize = 'default' }) {
  const [expanded, setExpanded] = useState(false);
  // TMDB combined credits repeat ids (same title, multiple characters).
  // Dedupe first: duplicate sibling keys mis-associate component state
  // (84 key warnings on one person page) and render ghost cards.
  const seen = new Set();
  const unique = (items || []).filter((m) => {
    const k = `${m.media_type || mediaType || 'movie'}_${m.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Filter switches keep the old scrollLeft: a short list then opens
  // shifted right into empty space. Re-anchor left whenever the row
  // identity changes (filter taps, new title, expand toggle).
  const railRef = useRef(null);
  const rowSig = `${unique.length}|${unique[0]?.id ?? ''}|${unique[unique.length - 1]?.id ?? ''}`;
  useEffect(() => {
    if (railRef.current) railRef.current.scrollLeft = 0;
  }, [rowSig, expanded]);
  // An empty slice must NOT unmount the section header: the Career
  // filter (titleNode) vanishes with it and the thumb loses position.
  // Header + honest empty note instead; plain rails keep old behaviour.
  const head = (button) => (
    <div className="cine-section-head cine-section-head--zones">
      <div className="cine-sh-zone cine-sh-zone--left">{titleNode || <h2 className="cine-section-title">{title}</h2>}</div>
      <div className="cine-sh-zone cine-sh-zone--center">{filterNode}</div>
      <div className="cine-sh-zone cine-sh-zone--right">{button}</div>
    </div>
  );
  const actionBtn = expandable && unique.length > 8 ? (
    <button
      onClick={() => setExpanded((e) => !e)}
      aria-expanded={expanded}
      className="group flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white transition cursor-pointer"
    >
      {expanded ? 'Show less' : `Show all ${unique.length}`}
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
  ) : null;
  if (unique.length === 0) {
    if (!titleNode && !filterNode) return null;
    return (
      <section className="space-y-3">
        {head(null)}
        <p className="text-xs text-white/50 py-4">Nothing indexed in this view yet.</p>
      </section>
    );
  }

  const cards = (size) =>
    unique.map((media) => (
      <Card
        key={`${title}_${media.media_type || mediaType || 'movie'}_${media.id}`}
        media={media}
        onClick={(m) => onSelect?.({ ...m, media_type: m.media_type || mediaType || 'movie' })}
        showRating={showRating}
        showRole={showRole}
        posterOnly={!captioned}
        size={size}
      />
    ));

  return (
    <section className="space-y-3">
      {head(actionBtn)}

      {expanded ? (
        <div className="cine-grid">{cards('fluid')}</div>
      ) : (
        <div ref={railRef} className="cine-rail no-scrollbar -mx-1 px-1">{cards(cardSize)}</div>
      )}
    </section>
  );
}
