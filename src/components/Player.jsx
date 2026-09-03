import React, { useState, useEffect, useRef } from 'react';
import { storage } from '../services/storage';
import EpisodeDrawer from './EpisodeDrawer';
import ServerSwitcher from './ServerSwitcher';

export default function Player({ media, details, onClose }) {
  const isTv = (media?.media_type || media?.type) === 'tv' || Boolean(details?.number_of_seasons);
  const mediaId = media?.id;

  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);
  const [server, setServer] = useState(() => storage.getPreferredServer('vidlink'));
  const [key, setKey] = useState(0);

  const containerRef = useRef(null);
  const playbackRef = useRef({ currentTime: 0, duration: 0 });

  // 1. Restore saved playback position
  useEffect(() => {
    if (!mediaId) return;
    const saved = storage.getProgress(isTv ? 'tv' : 'movie', mediaId);
    if (saved) {
      if (isTv && saved.season && saved.episode) {
        setCurrentSeason(saved.season);
        setCurrentEpisode(saved.episode);
      }
      if (saved.currentTime) {
        playbackRef.current.currentTime = saved.currentTime;
      }
    }
  }, [mediaId, isTv]);

  // 2. Keyboard shortcuts (Escape to exit, F for Fullscreen)
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) {
          containerRef.current?.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // 3. PostMessage listener to track real-time playback
  useEffect(() => {
    function handlePlayerMessage(event) {
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!payload) return;

        if (payload.event === 'timeupdate' || payload.type === 'PLAYER_EVENT') {
          const time = payload.currentTime || payload.data?.currentTime || 0;
          const dur = payload.duration || payload.data?.duration || 0;

          if (time > 0) {
            playbackRef.current = { currentTime: time, duration: dur };

            storage.saveProgress({
              mediaId,
              type: isTv ? 'tv' : 'movie',
              season: currentSeason,
              episode: currentEpisode,
              currentTime: time,
              duration: dur,
              title: details?.title || details?.name || media?.title || media?.name || 'Media',
              poster: media?.poster_path || details?.poster_path,
            });
          }
        }
      } catch {}
    }

    window.addEventListener('message', handlePlayerMessage);
    return () => {
      window.removeEventListener('message', handlePlayerMessage);
      if (playbackRef.current.currentTime > 0) {
        storage.saveProgress({
          mediaId,
          type: isTv ? 'tv' : 'movie',
          season: currentSeason,
          episode: currentEpisode,
          currentTime: playbackRef.current.currentTime,
          duration: playbackRef.current.duration,
          title: details?.title || details?.name || media?.title || media?.name || 'Media',
          poster: media?.poster_path || details?.poster_path,
        });
      }
    };
  }, [mediaId, isTv, currentSeason, currentEpisode, details, media]);

  const getEmbedUrl = () => {
    const resumeTime = Math.floor(playbackRef.current.currentTime || 0);

    if (server === 'vidlink') {
      const base = isTv
        ? `https://vidlink.pro/tv/${mediaId}/${currentSeason}/${currentEpisode}`
        : `https://vidlink.pro/movie/${mediaId}`;
      return `${base}?primaryColor=95ff50&secondaryColor=101014&start=${resumeTime}`;
    }

    if (server === 'vidy') {
      return isTv
        ? `https://vidy.to/embed/tv/${mediaId}/${currentSeason}/${currentEpisode}?start=${resumeTime}`
        : `https://vidy.to/embed/movie/${mediaId}?start=${resumeTime}`;
    }

    if (server === 'vidsrc') {
      return isTv
        ? `https://vidsrc.to/embed/tv/${mediaId}/${currentSeason}/${currentEpisode}`
        : `https://vidsrc.to/embed/movie/${mediaId}`;
    }

    return isTv
      ? `https://vidsrc.me/embed/tv?tmdb=${mediaId}&season=${currentSeason}&episode=${currentEpisode}`
      : `https://vidsrc.me/embed/movie?tmdb=${mediaId}`;
  };

  const handleSelectEpisode = (seasonNum, episodeNum) => {
    setCurrentSeason(seasonNum);
    setCurrentEpisode(episodeNum);
    playbackRef.current = { currentTime: 0, duration: 0 };
    setKey((prev) => prev + 1);

    storage.saveProgress({
      mediaId,
      type: 'tv',
      season: seasonNum,
      episode: episodeNum,
      currentTime: 0,
      duration: 1,
      title: details?.name || media?.name || 'Series',
      poster: media?.poster_path,
    });
  };

  const handleServerChange = (newServer) => {
    setServer(newServer);
    setKey((prev) => prev + 1);
  };

  const title = details?.title || details?.name || media?.title || media?.name || 'Now Playing';
  const totalSeasons = details?.number_of_seasons || media?.number_of_seasons || 1;

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 bg-[#05000d] flex flex-col animate-in fade-in duration-200">
      {/* Top Floating Chrome */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 md:px-8 bg-gradient-to-b from-black/95 via-black/50 to-transparent pointer-events-none">
        <div className="flex items-center gap-3 pointer-events-auto">
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 backdrop-blur-xl text-white flex items-center justify-center cursor-pointer transition shadow-lg"
            title="Exit (Esc)"
          >
            ←
          </button>
          <div>
            <h2 className="text-sm md:text-base font-bold text-white truncate max-w-xs md:max-w-md">
              {title}
            </h2>
            {isTv && (
              <p className="text-[11px] font-semibold text-[#95ff50]">
                Season {currentSeason} • Episode {currentEpisode}
              </p>
            )}
          </div>
        </div>

        {/* Right Actions: Episode Trigger, Server Switcher, and Fullscreen toggle */}
        <div className="flex items-center gap-2.5 pointer-events-auto">
          {isTv && (
            <button
              onClick={() => setIsEpisodeOpen(!isEpisodeOpen)}
              className="h-9 px-4 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-xl text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition shadow-md"
            >
              <svg className="w-3.5 h-3.5 text-[#95ff50]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Episodes</span>
            </button>
          )}

          <ServerSwitcher currentServer={server} onSelectServer={handleServerChange} />

          <button
            onClick={() => {
              if (!document.fullscreenElement) {
                containerRef.current?.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 backdrop-blur-xl text-white flex items-center justify-center cursor-pointer transition"
            title="Fullscreen (F)"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video Viewport */}
      <div className="relative w-full h-full flex-1 bg-black flex items-center justify-center">
        <iframe
          key={`${server}-${key}-${currentSeason}-${currentEpisode}`}
          src={getEmbedUrl()}
          title={title}
          className="w-full h-full border-0"
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      </div>

      {/* Anchored Episodes Drawer */}
      {isTv && (
        <EpisodeDrawer
          isOpen={isEpisodeOpen}
          onClose={() => setIsEpisodeOpen(false)}
          tvId={mediaId}
          totalSeasons={totalSeasons}
          currentSeason={currentSeason}
          currentEpisode={currentEpisode}
          onSelectEpisode={handleSelectEpisode}
        />
      )}
    </div>
  );
}
