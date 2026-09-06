import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ListVideo, Maximize } from 'lucide-react';
import { storage } from '../services/storage';
import EpisodeDrawer from './EpisodeDrawer';
import ServerSwitcher from './ServerSwitcher';

// Only accept playback progress messages from our own embed servers.
// Anything else (other tabs, ads, nested third-party frames) is ignored.
const TRUSTED_PLAYER_ORIGINS = [
  'https://vidy.st',
  'https://vidlink.pro',
  'https://vidsrc.to',
];

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

  // Best-known playback state, written on a heartbeat + on close.
  // Embed iframes are cross-origin and almost never post playback time,
  // so without this nothing would ever reach History (the old code only
  // saved when currentTime > 0, which postMessage alone could provide).
  const saveNowRef = useRef(() => {});
  saveNowRef.current = () => {
    if (!mediaId) return;
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
  };

  // Log the visit immediately, refresh it every 10s, and stamp it on
  // close — so every opened title lands in History even when the embed
  // reports no playback time. Entries are deduped per title.
  useEffect(() => {
    saveNowRef.current();
    const beat = setInterval(() => saveNowRef.current(), 10000);
    return () => {
      clearInterval(beat);
      saveNowRef.current();
    };
  }, [mediaId]);

  // Auto-hide chrome after 4s idle (basic player behavior).
  const poke = () => {
    setShowChrome(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowChrome(false), 4000);
  };

  useEffect(() => {
    poke();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Keep the chrome up while the episode list is open — browsing episodes
  // happens over the panel, which would otherwise let the chrome time out.
  useEffect(() => {
    if (isEpisodeOpen) {
      setShowChrome(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      poke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEpisodeOpen]);

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

  // 2. Keyboard shortcuts (Escape to exit, F for Fullscreen).
  // Any key also wakes the chrome — pointer events over the embed iframe
  // never reach this container, so keys are a guaranteed recovery path.
  useEffect(() => {
    function handleKeyDown(e) {
      poke();
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
      if (!TRUSTED_PLAYER_ORIGINS.includes(event.origin)) return;
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

    if (server === 'vidsrccc') {
      return isTv
        ? `https://vidsrc.cc/v2/embed/tv/${mediaId}/${currentSeason}/${currentEpisode}`
        : `https://vidsrc.cc/v2/embed/movie/${mediaId}`;
    }

    if (server === 'embedsu') {
      return isTv
        ? `https://embed.su/embed/tv/${mediaId}/${currentSeason}/${currentEpisode}`
        : `https://embed.su/embed/movie/${mediaId}`;
    }

    if (server === 'smashy') {
      return isTv
        ? `https://player.smashystream.com/tv/${mediaId}?s=${currentSeason}&e=${currentEpisode}`
        : `https://player.smashystream.com/movie/${mediaId}`;
    }

    if (server === 'autoembed') {
      return isTv
        ? `https://player.autoembed.cc/embed/tv/${mediaId}/${currentSeason}/${currentEpisode}`
        : `https://player.autoembed.cc/embed/movie/${mediaId}`;
    }

    // Unknown/stale server ids fall back to the default (Vidy).
    return isTv
      ? `https://vidy.st/tv/${mediaId}/${currentSeason}/${currentEpisode}`
      : `https://vidy.st/movie/${mediaId}`;
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
    saveNowRef.current();
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
      {/* Top Floating Chrome — all controls stacked top-left: Vidy opens
          its own quality/server menus top-right, so our bar stays clear.
          Solid gradient (not translucent) so Back/Episodes stay readable
          over bright video frames. */}
      <div className={`absolute top-0 inset-x-0 z-30 flex flex-col items-start gap-3 p-5 md:px-10 pb-16 bg-gradient-to-b from-black via-black/70 to-transparent transition-opacity duration-300 pointer-events-none ${showChrome ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`flex items-center gap-3 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <button
            onClick={onClose}
            className="cine-icon-btn"
            title="Exit (Esc)"
            aria-label="Exit player"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base md:text-lg font-bold text-white truncate max-w-xs md:max-w-md">
              {title}
            </h2>
            {isTv && (
              <p className="text-[11px] font-semibold text-[var(--cine-accent)]">
                Season {currentSeason} • Episode {currentEpisode}
              </p>
            )}
          </div>
        </div>

        {/* Controls row: Episodes, Server Switcher, Fullscreen */}
        <div className={`flex flex-wrap items-center gap-2.5 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {isTv && (
            <button
              onClick={() => setIsEpisodeOpen(!isEpisodeOpen)}
              className="cine-control-btn"
              aria-label="Toggle episode list"
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
            aria-label="Toggle fullscreen"
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
          // NOTE: no sandbox attribute on purpose — every provider (Vidy,
          // VidLink, VidSrc, VidSrc.cc, Embed.su) refuses sandboxed frames
          // or fails to load in one (verified per server). Popup/ad pressure
          // is handled by offering multiple servers, not containment.
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

      {/* Wake zone: the embed iframe swallows all pointer events, so once
          the chrome hides there is no hover path back. This transparent
          zone sits above the video — top-LEFT only (providers open their
          own menus top-right, so we never steal that corner). */}
      {!showChrome && (
        <div
          onMouseEnter={poke}
          onTouchStart={poke}
          className="absolute left-0 top-0 h-32 w-1/3 max-w-md z-20 cursor-default"
        />
      )}
    </div>
  );
}
