import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ListVideo, Maximize, RotateCcw, RotateCw } from 'lucide-react';
import { storage, formatClock } from '../services/storage';
import EpisodeDrawer from './EpisodeDrawer';
import ServerSwitcher from './ServerSwitcher';

// Only accept playback progress messages from our own embed servers.
// Anything else (other tabs, ads, nested third-party frames) is ignored.
const TRUSTED_PLAYER_ORIGINS = [
  'https://vidy.st',
  'https://vidlink.pro',
  'https://vidsrc.to',
  'https://vidsrc.cc',
  'https://embed.su',
  'https://player.smashystream.com',
  'https://player.autoembed.cc',
  'https://vidfast.pro',
  'https://vidfast.net',
];

function buildEmbedUrl({ server, mediaId, isTv, season, episode, resumeTime }) {
  const t = Math.max(0, Math.floor(resumeTime || 0));
  if (server === 'vidlink') {
    const base = isTv
      ? `https://vidlink.pro/tv/${mediaId}/${season}/${episode}`
      : `https://vidlink.pro/movie/${mediaId}`;
    return `${base}?primaryColor=95ff50&secondaryColor=101014&start=${t}`;
  }
  if (server === 'vidy') {
    const base = isTv
      ? `https://vidy.st/tv/${mediaId}/${season}/${episode}`
      : `https://vidy.st/movie/${mediaId}`;
    const params = new URLSearchParams({ color: '95FF50', progress: String(t) });
    if (isTv) {
      params.set('nextEpisode', 'true');
      params.set('episodeSelector', 'true');
      params.set('autoplayNextEpisode', 'true');
    }
    return `${base}?${params.toString()}`;
  }
  if (server === 'vidsrc') {
    return isTv
      ? `https://vidsrc.to/embed/tv/${mediaId}/${season}/${episode}`
      : `https://vidsrc.to/embed/movie/${mediaId}`;
  }
  if (server === 'vidsrccc') {
    return isTv
      ? `https://vidsrc.cc/v2/embed/tv/${mediaId}/${season}/${episode}`
      : `https://vidsrc.cc/v2/embed/movie/${mediaId}`;
  }
  if (server === 'embedsu') {
    return isTv
      ? `https://embed.su/embed/tv/${mediaId}/${season}/${episode}`
      : `https://embed.su/embed/movie/${mediaId}`;
  }
  if (server === 'smashy') {
    return isTv
      ? `https://player.smashystream.com/tv/${mediaId}?s=${season}&e=${episode}`
      : `https://player.smashystream.com/movie/${mediaId}`;
  }
  if (server === 'autoembed') {
    return isTv
      ? `https://player.autoembed.cc/embed/tv/${mediaId}/${season}/${episode}`
      : `https://player.autoembed.cc/embed/movie/${mediaId}`;
  }
  return isTv
    ? `https://vidy.st/tv/${mediaId}/${season}/${episode}`
    : `https://vidy.st/movie/${mediaId}`;
}

export default function Player({ media, details, onClose }) {
  const isTv = (media?.media_type || media?.type) === 'tv' || Boolean(details?.number_of_seasons);
  const mediaId = media?.id;

  // Read the saved season/episode/time SYNCHRONOUSLY at mount (lazy
  // initializer). The old restore-in-effect ran AFTER the heartbeat's first
  // save, so opening History S4E4 instantly overwrote storage with S1E1 and
  // then "restored" S1E1 — every series reopened at Season 1 Episode 1.
  // There is no restore effect anymore by design: state starts correct, so
  // no save can ever clobber it.
  const getInitialPlayback = () => {
    const saved = mediaId ? storage.getProgress(isTv ? 'tv' : 'movie', mediaId) : null;
    return {
      season: saved?.season || 1,
      episode: saved?.episode || 1,
      time: saved?.currentTime || 0,
    };
  };

  const [initialPlayback] = useState(getInitialPlayback);
  const [currentSeason, setCurrentSeason] = useState(initialPlayback.season);
  const [currentEpisode, setCurrentEpisode] = useState(initialPlayback.episode);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);
  const [server, setServer] = useState(() => storage.getPreferredServer('vidy'));
  const [key, setKey] = useState(0);
  const [showChrome, setShowChrome] = useState(true);
  // Display-only resume clock (state, not a ref read in render).
  const [displayTime, setDisplayTime] = useState(initialPlayback.time);

  const containerRef = useRef(null);
  const playbackRef = useRef({ currentTime: initialPlayback.time, duration: 0 });
  const hideTimer = useRef(null);

  // Wall-clock fallback: embeds never report real time, so measure it
  // ourselves. Position = saved start + actively watched seconds (capped per
  // tick so laptop sleep can't teleport you forward). Real postMessage data,
  // when a provider actually sends it, always wins over the estimate.
  const wallBaseRef = useRef(initialPlayback.time);
  const activeMsRef = useRef(0);
  const lastTickRef = useRef(Date.now());
  const pmSeenRef = useRef(false);

  const accumulateWallClock = () => {
    const now = Date.now();
    const dt = Math.min(now - lastTickRef.current, 15000);
    lastTickRef.current = now;
    if (!document.hidden) activeMsRef.current += dt;
  };

  const estimatedPosition = () => {
    const pm = playbackRef.current;
    if (pmSeenRef.current && pm.currentTime > 0) {
      return { time: Math.floor(pm.currentTime), duration: Math.floor(pm.duration) };
    }
    return {
      time: wallBaseRef.current + Math.floor(activeMsRef.current / 1000),
      duration: Math.floor(pm.duration),
    };
  };

  const buildMeta = () => ({
    title: details?.title || details?.name || media?.title || media?.name || 'Media',
    poster: media?.poster_path || details?.poster_path,
    genres: (details?.genres || []).map((g) => g.id),
  });

  // Best-known playback state, written on a heartbeat + on close.
  // Source priority: real provider postMessage > wall-clock estimate.
  // Never overwrite a real timestamp with 0 (mount/unmount races).
  const saveNowRef = useRef(() => {});
  saveNowRef.current = () => {
    if (!mediaId) return;
    const pos = estimatedPosition();
    const prev = storage.getProgress(isTv ? 'tv' : 'movie', mediaId);
    if (pos.time <= 0 && (prev?.currentTime || 0) > 0) return;
    // Don't spam History with 0s opens: first meaningful save happens
    // after ~5s of actual watching (see heartbeat below).
    if (pos.time <= 0 && !pmSeenRef.current && activeMsRef.current < 4000) return;
    storage.saveProgress({
      mediaId,
      type: isTv ? 'tv' : 'movie',
      season: currentSeason,
      episode: currentEpisode,
      currentTime: pos.time,
      duration: pos.duration,
      ...buildMeta(),
    });
  };

  // The embed URL is built ONCE per server/episode change — never per
  // render. The old code called getEmbedUrl() inline in src={}, so every
  // chrome poke (mouse move) produced a new ?progress=N URL and the
  // iframe reloaded constantly, resetting playback and wall-clock.
  const [embedUrl, setEmbedUrl] = useState(() =>
    buildEmbedUrl({
      server: storage.getPreferredServer('vidy'),
      mediaId,
      isTv,
      season: initialPlayback.season,
      episode: initialPlayback.episode,
      resumeTime: initialPlayback.time,
    })
  );

  const rebuildEmbed = (srv, season, episode, resumeTime) => {
    setEmbedUrl(
      buildEmbedUrl({ server: srv, mediaId, isTv, season, episode, resumeTime })
    );
  };

  // Log the visit on a 5s heartbeat + on hide/close — so tapping History
  // always reopens the exact episode + second. Entries deduped per title.
  useEffect(() => {
    const beat = setInterval(() => {
      accumulateWallClock();
      saveNowRef.current();
      setDisplayTime(estimatedPosition().time);
    }, 5000);
    const onHide = () => {
      if (document.hidden) {
        accumulateWallClock();
        saveNowRef.current();
      } else {
        lastTickRef.current = Date.now();
      }
    };
    const onPageHide = () => {
      accumulateWallClock();
      saveNowRef.current();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      clearInterval(beat);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
      accumulateWallClock();
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

  // 1. Keyboard shortcuts (Escape closes the episode list first, then the
  // player; F toggles fullscreen). Any key also wakes the chrome — pointer
  // events over the embed iframe never reach this container, so keys are a
  // guaranteed recovery path.
  useEffect(() => {
    function handleKeyDown(e) {
      poke();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isEpisodeOpen) {
          setIsEpisodeOpen(false);
          return;
        }
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
  }, [onClose, isEpisodeOpen]);

  // 2. PostMessage listener: real provider time always wins over the
  // wall-clock estimate (play/pause/seek/timeupdate across Vidy, VidLink,
  // VidFast-style PLAYER_EVENT / MEDIA_DATA shapes).
  useEffect(() => {
    function handlePlayerMessage(event) {
      if (!TRUSTED_PLAYER_ORIGINS.includes(event.origin)) return;
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!payload) return;
        const inner = payload.data || {};
        const type = payload.type || inner.type || payload.event || inner.event || '';
        if (
          type === 'PLAYER_EVENT' ||
          type === 'MEDIA_DATA' ||
          type === 'timeupdate' ||
          type === 'play' ||
          type === 'pause' ||
          type === 'seeked' ||
          payload.currentTime != null ||
          inner.currentTime != null
        ) {
          const time = payload.currentTime ?? inner.currentTime ?? payload.time ?? inner.time ?? 0;
          const dur = payload.duration ?? inner.duration ?? playbackRef.current.duration ?? 0;
          if (Number(time) > 0) {
            pmSeenRef.current = true;
            playbackRef.current = { currentTime: Number(time), duration: Number(dur) || 0 };
            // Keep the wall estimate in sync so a later fallback save
            // doesn't jump backwards.
            wallBaseRef.current = Number(time);
            activeMsRef.current = 0;
            lastTickRef.current = Date.now();
            setDisplayTime(Math.floor(Number(time)));
            storage.saveProgress({
              mediaId,
              type: isTv ? 'tv' : 'movie',
              season: currentSeason,
              episode: currentEpisode,
              currentTime: Number(time),
              duration: Number(dur) || 0,
              ...buildMeta(),
            });
          }
        }
      } catch {}
    }

    window.addEventListener('message', handlePlayerMessage);
    return () => window.removeEventListener('message', handlePlayerMessage);
  }, [mediaId, isTv, currentSeason, currentEpisode, details, media]);

  // Manual position correction (Apple HIG: explicit user control next to
  // the status). Cross-origin iframes hide seeks, so +/-15s lets the user
  // align our resume clock with the in-player position; it rebuilds the
  // embed URL once (no per-render reloads).
  const nudgeResume = (delta) => {
    const cur = estimatedPosition().time;
    const next = Math.max(0, cur + delta);
    wallBaseRef.current = next;
    activeMsRef.current = 0;
    lastTickRef.current = Date.now();
    pmSeenRef.current = false;
    playbackRef.current = { currentTime: next, duration: playbackRef.current.duration };
    setDisplayTime(next);
    saveNowRef.current();
    rebuildEmbed(server, currentSeason, currentEpisode, next);
    setKey((p) => p + 1);
  };

  const handleSelectEpisode = (seasonNum, episodeNum) => {
    // Stamp the old episode's position before switching.
    saveNowRef.current();
    setCurrentSeason(seasonNum);
    setCurrentEpisode(episodeNum);
    // New episode starts at 0 — reset every clock, not just the ref.
    playbackRef.current = { currentTime: 0, duration: 0 };
    wallBaseRef.current = 0;
    activeMsRef.current = 0;
    lastTickRef.current = Date.now();
    pmSeenRef.current = false;
    rebuildEmbed(server, seasonNum, episodeNum, 0);
    setKey((prev) => prev + 1);
  };

  const handleServerChange = (newServer) => {
    saveNowRef.current();
    const pos = estimatedPosition().time;
    setServer(newServer);
    rebuildEmbed(newServer, currentSeason, currentEpisode, pos);
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

        {/* Controls row: Episodes, Server Switcher, Resume adjust, Fullscreen */}
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

          {/* Resume clock (Apple HIG: status + stepper). The iframe is
              cross-origin so in-player seeks are invisible to us — these
              steppers let the user align the saved position exactly. */}
          <div className="cine-control-btn" role="group" aria-label="Resume position">
            <button
              onClick={() => nudgeResume(-15)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/10 transition"
              title="Back 15 seconds (also moves saved position)"
              aria-label="Back 15 seconds"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold tabular-nums min-w-12 text-center" title="Saved resume position — reopening starts here">
              {formatClock(displayTime)}
            </span>
            <button
              onClick={() => nudgeResume(15)}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-white/10 transition"
              title="Forward 15 seconds (also moves saved position)"
              aria-label="Forward 15 seconds"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>

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

        {/* Episodes panel — anchored directly under this chrome (top-full
            tracks its height on every screen), same as the server dropdown
            anchors under its button. Rendered only while the chrome is up
            so no invisible-but-clickable ghost remains after fade-out. */}
        {isTv && (
          <EpisodeDrawer
            isOpen={isEpisodeOpen && showChrome}
            onClose={() => setIsEpisodeOpen(false)}
            tvId={mediaId}
            totalSeasons={totalSeasons}
            currentSeason={currentSeason}
            currentEpisode={currentEpisode}
            onSelectEpisode={handleSelectEpisode}
          />
        )}
      </div>

      {/* Video Viewport — src is memoised state: chrome pokes and clock
          ticks re-render without ever reloading the stream. */}
      <div className="relative w-full h-full flex-1 bg-black flex items-center justify-center">
        <iframe
          key={`${server}-${key}-${currentSeason}-${currentEpisode}`}
          src={embedUrl}
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
