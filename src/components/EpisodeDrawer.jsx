import React, { useState, useEffect, useRef } from 'react';
import { tmdb } from '../services/tmdb';

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
  const popoverRef = useRef(null);

  useEffect(() => {
    setActiveSeason(currentSeason);
  }, [currentSeason]);

  useEffect(() => {
    if (!isOpen || !tvId) return;
    let isMounted = true;
    setLoading(true);

    tmdb.getSeasonDetails(tvId, activeSeason)
      .then((data) => {
        if (isMounted) {
          setEpisodes(data?.episodes || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load season episodes:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [tvId, activeSeason, isOpen]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const seasons = Array.from({ length: Math.max(1, totalSeasons) }, (_, i) => i + 1);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-start justify-end p-4 md:p-6 md:pt-20">
      <div 
        ref={popoverRef}
        className="pointer-events-auto w-full max-w-sm max-h-[82vh] rounded-3xl bg-[#0c0c12]/95 border border-white/15 backdrop-blur-3xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-4 duration-200"
      >
        {/* Popover Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Episodes</h3>
            <p className="text-[11px] text-white/40">Season {activeSeason} • {episodes.length} episodes</p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white/80 flex items-center justify-center text-xs transition cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Season Selector Pills */}
        <div className="flex gap-1.5 p-3 overflow-x-auto no-scrollbar border-b border-white/5">
          {seasons.map((sNum) => (
            <button
              key={sNum}
              onClick={() => setActiveSeason(sNum)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                activeSeason === sNum
                  ? 'bg-white text-black shadow-sm'
                  : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
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
              <div className="w-6 h-6 border-2 border-[#95ff50] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : episodes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-white/40">
              No episodes available for this season.
            </div>
          ) : (
            episodes.map((ep) => {
              const isCurrent = activeSeason === currentSeason && ep.episode_number === currentEpisode;
              const thumb = ep.still_path
                ? tmdb.getImageUrl(ep.still_path, 'w300')
                : 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=300&q=80';

              return (
                <div
                  key={ep.id || ep.episode_number}
                  onClick={() => {
                    onSelectEpisode(activeSeason, ep.episode_number);
                    onClose();
                  }}
                  className={`group flex items-center gap-3 p-2 rounded-2xl border cursor-pointer transition ${
                    isCurrent
                      ? 'bg-white/15 border-[#95ff50]/60 shadow-md'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.07] hover:border-white/10'
                  }`}
                >
                  <div className="relative w-20 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                    <img src={thumb} alt={ep.name} className="w-full h-full object-cover" loading="lazy" />
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/75 backdrop-blur-xs text-[9px] font-bold text-white">
                      E{ep.episode_number}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-semibold truncate ${isCurrent ? 'text-[#95ff50]' : 'text-white/90 group-hover:text-white'}`}>
                      {ep.episode_number}. {ep.name || `Episode ${ep.episode_number}`}
                    </h4>
                    <p className="text-[11px] text-white/40 line-clamp-1 mt-0.5">
                      {ep.overview || 'Play episode'}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
