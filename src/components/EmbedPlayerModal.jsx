import React, { useState, useEffect } from 'react';
import { X, Server, RotateCcw, Film, Tv, ListFilter } from 'lucide-react';
import { EMBED_SERVERS } from '../services/embedServers';
import { getMediaDetails, getTvSeason } from '../services/tmdb';
import { recordWatchHistory } from '../services/storage';

export default function EmbedPlayerModal({ media, onClose }) {
  const isTv = media?.media_type === 'tv' || Boolean(media?.first_air_date);

  const [selectedServerId, setSelectedServerId] = useState(EMBED_SERVERS[0].id);
  const [iframeKey, setIframeKey] = useState(0);

  // TV / Episode State
  const [tvDetails, setTvDetails] = useState(null);
  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [seasonData, setSeasonData] = useState(null);
  const [showSeasonPicker, setShowSeasonPicker] = useState(false);

  useEffect(() => {
    if (isTv && media?.id) {
      getMediaDetails('tv', media.id).then((data) => {
        setTvDetails(data);
        const validSeason = (data.seasons || []).find((s) => s.season_number > 0)?.season_number || 1;
        setCurrentSeason(validSeason);
      });
    }
  }, [media?.id, isTv]);

  useEffect(() => {
    if (isTv && media?.id && currentSeason) {
      getTvSeason(media.id, currentSeason).then((data) => {
        setSeasonData(data);
      });
    }
  }, [media?.id, currentSeason, isTv]);

  // Record into localStorage watch history
  useEffect(() => {
    if (media?.id) {
      recordWatchHistory(media, currentSeason, currentEpisode);
    }
  }, [media, currentSeason, currentEpisode]);

  if (!media) return null;

  const currentServer = EMBED_SERVERS.find((s) => s.id === selectedServerId) || EMBED_SERVERS[0];
  const streamUrl = isTv
    ? currentServer.getTvUrl(media.id, currentSeason, currentEpisode)
    : currentServer.getMovieUrl(media.id);

  const handleReload = () => setIframeKey((prev) => prev + 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/90 backdrop-blur-2xl">
      <div className="relative w-full max-w-6xl rounded-3xl overflow-hidden border border-white/10 bg-[#08090a] shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-2 truncate">
            {isTv ? (
              <Tv className="w-4 h-4 text-white/60 shrink-0" />
            ) : (
              <Film className="w-4 h-4 text-white/60 shrink-0" />
            )}
            <span className="text-sm font-semibold text-white/90 truncate">
              {media.title || media.name}
            </span>
            {isTv && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 text-white/70 border border-white/10 shrink-0">
                S{currentSeason} • E{currentEpisode}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isTv && tvDetails?.seasons && (
              <button
                onClick={() => setShowSeasonPicker(!showSeasonPicker)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <ListFilter className="w-3.5 h-3.5" />
                <span>Episodes</span>
              </button>
            )}
            <button
              onClick={handleReload}
              title="Reload Frame"
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Frame */}
        <div className="relative aspect-video w-full bg-black">
          <iframe
            key={iframeKey}
            src={streamUrl}
            className="w-full h-full border-0"
            allowFullScreen
            allow="autoplay; encrypted-media; picture-in-picture"
            title={media.title || media.name}
          />
        </div>

        {/* Season / Episode Picker */}
        {isTv && showSeasonPicker && seasonData && (
          <div className="p-4 border-t border-white/10 bg-[#0d0e12] overflow-y-auto max-h-56 no-scrollbar">
            <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar pb-1">
              {(tvDetails?.seasons || [])
                .filter((s) => s.season_number > 0)
                .map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      setCurrentSeason(s.season_number);
                      setCurrentEpisode(1);
                    }}
                    className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 cursor-pointer border ${
                      currentSeason === s.season_number
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/60 border-white/10 hover:text-white'
                    }`}
                  >
                    Season {s.season_number}
                  </button>
                ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {(seasonData.episodes || []).map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => {
                    setCurrentEpisode(ep.episode_number);
                    setShowSeasonPicker(false);
                  }}
                  className={`flex flex-col text-left p-2 rounded-xl transition border cursor-pointer ${
                    currentEpisode === ep.episode_number
                      ? 'bg-white/15 border-white/30 text-white'
                      : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="text-xs font-semibold truncate">
                    {ep.episode_number}. {ep.name || `Episode ${ep.episode_number}`}
                  </span>
                  <span className="text-[10px] text-white/40">{ep.air_date || 'TBA'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Multi-Server Drawer */}
        <div className="px-5 py-3 border-t border-white/10 bg-white/[0.02] flex items-center gap-2 overflow-x-auto no-scrollbar">
          <span className="flex items-center gap-1.5 text-xs text-white/40 uppercase font-bold tracking-wider mr-2 shrink-0">
            <Server className="w-3.5 h-3.5" /> Servers:
          </span>
          {EMBED_SERVERS.map((server) => {
            const isActive = server.id === selectedServerId;
            return (
              <button
                key={server.id}
                onClick={() => setSelectedServerId(server.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition shrink-0 cursor-pointer border ${
                  isActive
                    ? 'bg-white text-black border-white shadow-lg'
                    : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span>{server.name}</span>
                <span
                  className={`text-[9px] uppercase px-1.5 py-0.2 rounded ${
                    isActive ? 'bg-black/10 text-black font-bold' : 'bg-white/10 text-white/50'
                  }`}
                >
                  {server.badge}
                </span>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
