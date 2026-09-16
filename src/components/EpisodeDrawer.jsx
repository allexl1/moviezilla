import { useState, useEffect, useRef } from 'react';
import { X, Check, ListVideo, ChevronDown, Crosshair } from 'lucide-react';
import { tmdb, FALLBACK_POSTER } from '../services/tmdb';

export default function EpisodeDrawer({
  isOpen,
  onClose,
  tvId,
  totalSeasons = 1,
  currentSeason = 1,
  currentEpisode = 1,
  onSelectEpisode,
  anchorClassName = 'left-5 md:left-10 top-full mt-3',
}) {
  const [activeSeason, setActiveSeason] = useState(currentSeason);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seasonError, setSeasonError] = useState('');
  const [seasonRetry, setSeasonRetry] = useState(0);
  // Expanded episode detail (overview/runtime/air-date/rating). Row tap
  // still plays instantly — the chevron is the only thing that expands.
  const [expandedEp, setExpandedEp] = useState(null);
  const epRefs = useRef({});

  useEffect(() => {
    setActiveSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    setExpandedEp(null);
  }, [tvId, activeSeason]);

  // Land on the episode you're actually at: when the current season's
  // list arrives, bring the current episode into view — no manual scroll.
  useEffect(() => {
    if (activeSeason !== currentSeason || episodes.length === 0) return;
    const el = epRefs.current[currentEpisode];
    if (el && typeof el.scrollIntoView === 'function') {
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, activeSeason, tvId]);

  useEffect(() => {
    if (!isOpen || !tvId) return;
    let isMounted = true;
    setLoading(true);
    setSeasonError('');

    tmdb.getSeasonDetails(tvId, activeSeason)
      .then((data) => {
        if (isMounted) {
          setEpisodes(data?.episodes || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load season episodes:', err);
        if (isMounted) {
          setSeasonError("Couldn't load episodes. Check your connection.");
          setLoading(false);
        }
      });

    return () => { isMounted = false; };
  }, [tvId, activeSeason, isOpen, seasonRetry]);

  // NOTE: no click-outside-to-close on purpose. The video area is a
  // cross-origin iframe (never fires document mousedown), and on the chrome
  // the toggle button races it: mousedown closes, then click reopens, so the
  // panel could never be toggled shut. Close via the Episodes button, X, Esc.
  if (!isOpen) return null;

  const seasons = Array.from({ length: Math.max(1, totalSeasons) }, (_, i) => i + 1);

  return (
      <div
        role="dialog"
        aria-label="Episode list"
        className={`absolute ${anchorClassName} z-40 w-80 max-w-[calc(100vw-2.5rem)] max-h-[54vh] md:max-h-[60vh] rounded-3xl cine-glass-panel pointer-events-auto flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150`}
      >
        {/* Popover Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--cine-glass-border)]">
          <div className="flex items-center gap-3">
            <div className="cine-disc w-10 h-10">
              <ListVideo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Episodes</h3>
              <p className="text-[11px] text-white/60">Season {activeSeason} • {episodes.length} episodes</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {activeSeason !== currentSeason && (
              <button
                onClick={() => setActiveSeason(currentSeason)}
                className="cine-pill cine-pill--sm"
                title={`Jump to season ${currentSeason}, episode ${currentEpisode}`}
                aria-label="Jump to current episode"
              >
                <Crosshair className="w-3 h-3" />
                Current
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="cine-icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Season Selector Pills — single horizontal strip: vertical
            jiggle locked out, row height fixed. */}
        <div className="flex flex-shrink-0 items-center gap-1.5 px-3 py-2.5 overflow-x-auto overflow-y-hidden no-scrollbar border-b border-[var(--cine-glass-border)]">
          {seasons.map((sNum) => (
            <button
              key={sNum}
              onClick={() => setActiveSeason(sNum)}
              aria-pressed={activeSeason === sNum}
              className={`cine-pill${activeSeason === sNum ? ' cine-pill--active' : ''}`}
            >
              Season {sNum}
            </button>
          ))}
        </div>

        {/* Episode List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 no-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <div className="w-6 h-6 border-2 border-[var(--cine-accent)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : seasonError ? (
            <div className="flex flex-col items-center justify-center gap-3 h-32 text-xs text-white/60">
              <span>{seasonError}</span>
              <button
                onClick={() => setSeasonRetry((r) => r + 1)}
                className="cine-control-btn"
              >
                Retry
              </button>
            </div>
          ) : episodes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-white/60">
              No episodes available for this season.
            </div>
          ) : (
            episodes.map((ep) => {
              const isCurrent = activeSeason === currentSeason && ep.episode_number === currentEpisode;
              const expanded = expandedEp === ep.episode_number;
              const thumb = ep.still_path
                ? tmdb.getImageUrl(ep.still_path, 'w300')
                : FALLBACK_POSTER;

              return (
                <div
                  key={ep.id || ep.episode_number}
                  ref={(el) => {
                    if (el) epRefs.current[ep.episode_number] = el;
                    else delete epRefs.current[ep.episode_number];
                  }}
                  onClick={() => {
                    onSelectEpisode(activeSeason, ep.episode_number);
                    onClose();
                  }}
                  className={`mat-row group flex items-center gap-3 p-2 cursor-pointer ${
                    isCurrent ? 'border-[var(--cine-accent)]/50' : ''
                  }`}
                >
                  <div className="relative w-20 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                    <img src={thumb} alt={ep.name} className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.target.src = FALLBACK_POSTER; }} />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white">
                      E{ep.episode_number}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-semibold truncate ${isCurrent ? 'text-[var(--cine-accent)]' : 'text-white/90 group-hover:text-white'}`}>
                      {ep.episode_number}. {ep.name || `Episode ${ep.episode_number}`}
                    </h4>
                    <p className="text-[11px] text-white/60 line-clamp-1 mt-0.5">
                      {ep.overview || 'Play episode'}
                    </p>
                    {expanded && (
                      <div className="mt-1.5 space-y-1" onClick={(e) => e.stopPropagation()}>
                        {ep.overview && (
                          <p className="text-[11px] leading-relaxed text-white/70">{ep.overview}</p>
                        )}
                        <p className="text-[10px] text-white/50">
                          {[
                            ep.air_date || null,
                            ep.runtime ? `${ep.runtime}m` : null,
                            ep.vote_average ? `★ ${Number(ep.vote_average).toFixed(1)}` : null,
                          ]
                            .filter(Boolean)
                            .join(' • ') || 'No details'}
                        </p>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedEp(expanded ? null : ep.episode_number);
                    }}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Hide episode details' : 'Show episode details'}
                    className="cine-icon-btn cine-icon-btn--xs flex-shrink-0"
                  >
                    <ChevronDown className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isCurrent && (
                    <Check className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0 mr-1" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
  );
}
