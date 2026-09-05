import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ListVideo, Maximize } from 'lucide-react';
import { storage } from '../services/storage';
import EpisodeDrawer from './EpisodeDrawer';
import ServerSwitcher from './ServerSwitcher';

export default function Player({ media, details, onClose }) {
  const isTv = (media?.media_type || media?.type) === 'tv' || Boolean(details?.number_of_seasons);
  const mediaId = media?.id;

  const [currentSeason, setCurrentSeason] = useState(1);
  const [currentEpisode, setCurrentEpisode] = useState(1);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);
  const [server, setServer] = useState(() => storage.getPreferredServer('vidy'));
  const [key, setKey] = useState(0);
  const [showChrome, setShowChrome] = useState(true);

  const containerRef = useRef(null);
  const playbackRef = useRef({ currentTime: 0, duration: 0 });
  const hideTimer = useRef(null);

  // Auto-hide chrome after 3s idle (basic player behavior).
  const poke = () => {
    setShowChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowChrome(false), 3000);
  };

  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

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
              genres: (details?.genres || []).map((g) => g.id),
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
          genres: (details?.genres || []).map((g) => g.id),
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
      const base = isTv
        ? `https://vidy.st/tv/${mediaId}/${currentSeason}/${currentEpisode}`
        : `https://vidy.st/movie/${mediaId}`;
      const params = new URLSearchParams({
        color: '95FF50',
        progress: String(resumeTime),
      });
      if (isTv) {
        params.set('nextEpisode', 'true');
        params.set('episodeSelector', 'true');
        params.set('autoplayNextEpisode', 'true');
      }
      return `${base}?${params.toString()}`;
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
      genres: (details?.genres || []).map((g) => g.id),
    });
  };

  const handleServerChange = (newServer) => {
    setServer(newServer);
    setKey((prev) => prev + 1);
  };

  const title = details?.title || details?.name || media?.title || media?.name || 'Now Playing';
  const totalSeasons = details?.number_of_seasons || media?.number_of_seasons || 1;

  return (
    <div
      ref={containerRef}
      onMouseMove={poke}
      onTouchStart={poke}
      onClick={poke}
      className={`fixed inset-0 z-50 bg-[var(--cine-bg-deep)] flex flex-col animate-in fade-in duration-200 ${showChrome ? '' : 'cursor-none'}`}
    >
      {/* Top Floating Chrome */}
      <div className={`absolute top-0 inset-x-0 z-30 flex items-center justify-between p-4 md:px-8 bg-gradient-to-b from-black/95 via-black/50 to-transparent transition-opacity duration-300 pointer-events-none ${showChrome ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`flex items-center gap-3 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <button
            onClick={onClose}
            className="cine-icon-btn"
            title="Exit (Esc)"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm md:text-base font-bold text-white truncate max-w-xs md:max-w-md">
              {title}
            </h2>
            {isTv && (
              <p className="text-[11px] font-semibold text-[var(--cine-accent)]">
                Season {currentSeason} • Episode {currentEpisode}
              </p>
            )}
          </div>
        </div>

        {/* Right Actions: Episode Trigger, Server Switcher, and Fullscreen toggle */}
        <div className={`flex items-center gap-2.5 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {isTv && (
            <button
              onClick={() => setIsEpisodeOpen(!isEpisodeOpen)}
              className="cine-control-btn"
            >
              <ListVideo className="w-4 h-4 text-[var(--cine-accent)]" />
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
            className="cine-icon-btn"
            title="Fullscreen (F)"
          >
            <Maximize className="w-4 h-4" />
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
