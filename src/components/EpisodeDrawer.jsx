import React, { useState, useEffect } from 'react';
import { X, Check, ListVideo } from 'lucide-react';
import { tmdb, FALLBACK_POSTER } from '../services/tmdb';

export default function EpisodeDrawer({
  isOpen,
  onClose,
  tvId,
  totalSeasons = 1,
  currentSeason = 1,
  currentEpisode = 1,
  onSelectEpisode,
}) {
  const [activeSeason, setActiveSeason] = useState(currentSeason);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [seasonError, setSeasonError] = useState('');
  const [seasonRetry, setSeasonRetry] = useState(0);

  useEffect(() => {
    setActiveSeason(currentSeason);
  }, [currentSeason]);

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
        className="absolute left-5 md:left-10 top-full mt-3 z-40 w-80 max-w-[calc(100vw-2.5rem)] max-h-[54vh] md:max-h-[60vh] rounded-3xl cine-glass-panel pointer-events-auto flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
      >
        {/* Popover Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--cine-glass-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[var(--cine-glass-tint)] border border-[var(--cine-glass-border)] flex items-center justify-center text-[var(--cine-accent)]">
              <ListVideo className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Episodes</h3>
              <p className="text-[11px] text-white/60">Season {activeSeason} • {episodes.length} episodes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="cine-icon-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Season Selector Pills */}
        <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto no-scrollbar border-b border-[var(--cine-glass-border)]">
          {seasons.map((sNum) => (
            <button
              key={sNum}
              onClick={() => setActiveSeason(sNum)}
              aria-pressed={activeSeason === sNum}
              className={`h-9 px-4 inline-flex items-center flex-shrink-0 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer border ${
                activeSeason === sNum
                  ? 'bg-white text-black border-white shadow-sm'
                  : 'bg-[var(--cine-glass-tint)] text-white/60 hover:text-white hover:bg-[var(--cine-glass-tint-hover)] border-[var(--cine-glass-border)]'
              }`}
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
              const thumb = ep.still_path
                ? tmdb.getImageUrl(ep.still_path, 'w300')
                : FALLBACK_POSTER;

              return (
                <div
                  key={ep.id || ep.episode_number}
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
                  </div>

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
