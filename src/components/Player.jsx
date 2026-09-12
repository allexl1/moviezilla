import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ListVideo, Maximize, MessageCircle, X } from 'lucide-react';
import { storage } from '../services/storage';
import { tmdb, FALLBACK_BACKDROP } from '../services/tmdb';
import { imdbIdOf } from '../services/ratings';
import EpisodeDrawer from './EpisodeDrawer';
import ServerSwitcher from './ServerSwitcher';
import { ChatList, ChatInput } from './chat';

// Only accept playback progress messages from our own embed servers.
// Anything else (other tabs, ads, nested third-party frames) is ignored.
// NOTE: Vidy emits from https://www.vidy.st (with www) — the bare
// domain never appears as an event origin. Same guard for the rest.
const TRUSTED_PLAYER_ORIGINS = [
  'https://vidy.st',
  'https://www.vidy.st',
  'https://vidlink.pro',
  'https://www.vidlink.pro',
  'https://vidsrc.to',
  'https://www.vidsrc.to',
  'https://vidsrc.cc',
  'https://www.vidsrc.cc',
  'https://embed.su',
  'https://www.embed.su',
  'https://player.smashystream.com',
  'https://player.autoembed.cc',
  'https://vidfast.pro',
  'https://vidfast.net',
  'https://voidboost.tv',
  'https://www.voidboost.tv',
];

function buildEmbedUrl({ server, mediaId, isTv, season, episode, resumeTime, imdb }) {
  const t = Math.max(0, Math.floor(resumeTime || 0));
  // Russian RU-dub source (Voidboost, keyless, IMDb-addressed). No resume
  // param or time events documented — wall-clock tracking applies.
  if (server === 'russian') {
    if (imdb) return `https://voidboost.tv/embed/tt${String(imdb).replace(/^tt/, '')}`;
    return isTv
      ? `https://vidy.st/tv/${mediaId}/${season}/${episode}`
      : `https://vidy.st/movie/${mediaId}`;
  }
  // NOTE: VidLink's resume param is `startAt` — `start` does nothing.
  if (server === 'vidlink') {
    const base = isTv
      ? `https://vidlink.pro/tv/${mediaId}/${season}/${episode}`
      : `https://vidlink.pro/movie/${mediaId}`;
    return `${base}?primaryColor=95ff50&secondaryColor=101014&startAt=${t}`;
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
  // vidsrc.cc supports startAt resume + time events every ~5s.
  if (server === 'vidsrccc') {
    const base = isTv
      ? `https://vidsrc.cc/v2/embed/tv/${mediaId}/${season}/${episode}`
      : `https://vidsrc.cc/v2/embed/movie/${mediaId}`;
    return t > 0 ? `${base}?startAt=${t}` : base;
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

export default function Player({ media, details, onClose, onPosition = null, roomTarget = null, roomOverlay = null, roomLocked = false, framed = false, suspended = false, chat = null, onProviderPause = null, onProviderPlay = null }) {
  const isTv = (media?.media_type || media?.type) === 'tv' || Boolean(details?.number_of_seasons);
  const mediaId = media?.id;

  // Read the saved season/episode/time SYNCHRONOUSLY at mount (lazy
  // initializer). The old restore-in-effect ran AFTER the heartbeat's first
  // save, so opening History S4E4 instantly overwrote storage with S1E1 and
  // then "restored" S1E1 — every series reopened at Season 1 Episode 1.
  // There is no restore effect anymore by design: state starts correct, so
  // no save can ever clobber it.
  // Preferred server first: resume reads THIS server's slot (Vidy and
  // VidLink keep separate clocks — one shared timestamp corrupts both).
  const preferredServer = storage.getPreferredServer('vidy');
  const getInitialPlayback = () => {
    const saved = mediaId ? storage.getProgress(isTv ? 'tv' : 'movie', mediaId) : null;
    const slot = mediaId ? storage.getServerProgress(isTv ? 'tv' : 'movie', mediaId, preferredServer) : null;
    return {
      season: saved?.season || 1,
      episode: saved?.episode || 1,
      // Strict slot only: another server's seconds (or legacy top-level
      // once slots exist) must never leak in here.
      time: slot?.currentTime ?? 0,
    };
  };

  const [initialPlayback] = useState(getInitialPlayback);
  const [currentSeason, setCurrentSeason] = useState(initialPlayback.season);
  const [currentEpisode, setCurrentEpisode] = useState(initialPlayback.episode);
  const [isEpisodeOpen, setIsEpisodeOpen] = useState(false);
  const [server, setServer] = useState(preferredServer);
  const [key, setKey] = useState(0);
  const [showChrome, setShowChrome] = useState(true);
  // Bumped to force the server dropdown shut (only one popover at a time).
  const [serverSignal, setServerSignal] = useState(0);

  const containerRef = useRef(null);
  const floatEndRef = useRef(null);
  // Room auto-pause callbacks (stable mirrors — props change identity).
  const onProviderPauseRef = useRef(null);
  const onProviderPlayRef = useRef(null);
  onProviderPauseRef.current = onProviderPause;
  onProviderPlayRef.current = onProviderPlay;
  // Debounce for provider 'pause' → room lock: buffer/seek blips resolve
  // with a 'play' inside ~1.5s and cancel; a held pause locks the room.
  const pauseEventTimer = useRef(null);

  // Floating chat follows new messages while open.
  useEffect(() => {
    if (chat?.open) floatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [chat?.messages?.length, chat?.open]);
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
  // Provider-declared pause: freeze the wall clock (it otherwise accrues
  // minutes while the video sits paused, corrupting History).
  const pausedProvRef = useRef(false);
  // Last real provider report: if the provider goes silent afterwards
  // (paused without an event, buffered, tab throttled), the wall clock
  // must not invent minutes on top of it — freeze after 20s of silence.
  // (This was the 14:xx → 16:xx inflation.)
  const lastPmRef = useRef({ time: 0, at: 0 });
  // Resume-convergence guard: providers emit ~0s ticks right after load,
  // before applying the resume second. While unconverged, a reading far
  // below the restored base is the player booting — not a rewind. Trust
  // resumes (explicit seeked), readings near/ahead of base, or anything
  // still low after 10s (failed resume: the provider IS at zero, adopt it).
  const convergedRef = useRef(false);
  const convergeUntilRef = useRef(Date.now() + 10000);
  const rearmConvergence = () => {
    convergedRef.current = false;
    convergeUntilRef.current = Date.now() + 10000;
  };
  // The message handler used to stringify all of localStorage every ~1s.
  const saveThrottleRef = useRef({ sec: -1, at: 0 });

  const accumulateWallClock = () => {
    const now = Date.now();
    if (pausedProvRef.current) {
      lastTickRef.current = now;
      return;
    }
    // Provider went quiet after reporting real time: accrue at most ~20s
    // past its last word, then hold. A silent player is a stuck player.
    if (pmSeenRef.current && now - lastPmRef.current.at > 20000) {
      lastTickRef.current = now;
      return;
    }
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
    // Peek rule: a brand-new title needs 5 real seconds (or provider
    // playback evidence) before it earns a history row at all.
    if (!prev && pos.time < 5 && !pmSeenRef.current) return;
    storage.saveProgress({
      mediaId,
      type: isTv ? 'tv' : 'movie',
      season: currentSeason,
      episode: currentEpisode,
      currentTime: pos.time,
      duration: pos.duration,
      server,
      ...buildMeta(),
    });
  };

  // Never resume past the known end: a stale second beyond a shorter
  // cut makes some providers error-loop instead of playing. 20s margin
  // keeps us out of the credits wall.
  const clampResume = (t) => {
    const mins = details?.runtime || details?.episode_run_time?.[0] || null;
    if (!mins) return Math.max(0, t);
    return Math.min(Math.max(0, t), Math.max(0, mins * 60 - 20));
  };

  // The embed URL is built ONCE per server/episode change — never per
  // render. The old code called getEmbedUrl() inline in src={}, so every
  // chrome poke (mouse move) produced a new ?progress=N URL and the
  // iframe reloaded constantly, resetting playback and wall-clock.
  const [embedUrl, setEmbedUrl] = useState(() =>
    buildEmbedUrl({
      server,
      mediaId,
      isTv,
      season: initialPlayback.season,
      episode: initialPlayback.episode,
      resumeTime: clampResume(initialPlayback.time),
      imdb: imdbIdOf(details, isTv ? 'tv' : 'movie'),
    })
  );

  const rebuildEmbed = (srv, season, episode, resumeTime) => {
    setEmbedUrl(
      buildEmbedUrl({
        server: srv,
        mediaId,
        isTv,
        season,
        episode,
        resumeTime: clampResume(resumeTime),
        imdb: imdbIdOf(details, isTv ? 'tv' : 'movie'),
      })
    );
  };

  // Room sync tap: throttled position reports for the watch-party
  // engine (absent in solo mode — zero behavior change there).
  const lastSentRef = useRef({ at: 0, second: -1 });
  const reportRef = useRef(() => {});
  reportRef.current = () => {
    if (!onPosition) return;
    const pos = estimatedPosition();
    const now = Date.now();
    const last = lastSentRef.current;
    if (now - last.at < 4000 && Math.abs(pos.time - last.second) < 10) return;
    lastSentRef.current = { at: now, second: pos.time };
    onPosition({
      second: pos.time,
      duration: pos.duration,
      season: currentSeason,
      episode: currentEpisode,
      server,
    });
  };

  // Room follow: host (or granted driver) moved — rebuild the embed at
  // their second. Same code path as a local episode/server switch.
  useEffect(() => {
    if (!roomTarget || roomTarget.key == null) return;
    const second = Math.max(0, roomTarget.second || 0);
    const season = roomTarget.season || currentSeason;
    const episode = roomTarget.episode || currentEpisode;
    const srv = roomTarget.server || server;
    if (srv !== server) setServer(srv);
    if (season !== currentSeason) setCurrentSeason(season);
    if (episode !== currentEpisode) setCurrentEpisode(episode);
    playbackRef.current = { currentTime: second, duration: playbackRef.current.duration };
    wallBaseRef.current = second;
    activeMsRef.current = 0;
    lastTickRef.current = Date.now();
    pmSeenRef.current = false;
    pausedProvRef.current = false;
    rearmConvergence();
    rebuildEmbed(srv, season, episode, second);
    setKey((p) => p + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomTarget?.key]);

  // Log the visit on a 5s heartbeat + on hide/close — so tapping History
  // always reopens the exact episode + second. Entries deduped per title.
  useEffect(() => {
    const beat = setInterval(() => {
      accumulateWallClock();
      saveNowRef.current();
      reportRef.current();
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
        // Accepted names across providers: VidLink (play/pause/seeked/
        // ended/timeupdate), Vidy (timeupdate/play/pause/ended as JSON
        // strings), vidsrc.cc (play/pause/time/complete every ~5s).
        if (
          type === 'PLAYER_EVENT' ||
          type === 'MEDIA_DATA' ||
          type === 'timeupdate' ||
          type === 'time' ||
          type === 'play' ||
          type === 'pause' ||
          type === 'seeked' ||
          type === 'ended' ||
          type === 'complete' ||
          payload.currentTime != null ||
          inner.currentTime != null ||
          payload.timestamp != null ||
          inner.timestamp != null
        ) {
          // Ignore events for a different title (stale iframe after a
          // quick episode/server switch). IDs are TMDB ids, unique here.
          const evtId = inner.id ?? inner.mtmdbId ?? inner.tmdbId ?? payload.id;
          if (evtId != null && String(evtId) !== String(mediaId)) return;
          // Vidy sends position as `timestamp` in half its timeupdates
          // (the other half uses `currentTime`); VidLink/vidsrc.cc use
          // currentTime. `progress` is a percent — never seconds.
          const time =
            payload.currentTime ??
            inner.currentTime ??
            payload.timestamp ??
            inner.timestamp ??
            payload.time ??
            inner.time ??
            0;
          const dur = payload.duration ?? inner.duration ?? playbackRef.current.duration ?? 0;
          // Track provider pause/play for the wall clock. (No-ops for
          // providers that never emit them — the clock just keeps running.)
          // Room auto-pause rides the same events: a held provider pause
          // (past the buffer-blip window) locks the room for everyone, so
          // pausing inside the video retires the manual Pause button on
          // event-capable servers. The matching 'play' only resumes when
          // this device was the pauser (guarded room-side).
          if (type === 'pause') {
            pausedProvRef.current = true;
            if (pauseEventTimer.current) clearTimeout(pauseEventTimer.current);
            pauseEventTimer.current = setTimeout(() => {
              if (pausedProvRef.current) onProviderPauseRef.current?.();
            }, 1500);
          }
          if (type === 'play') {
            pausedProvRef.current = false;
            lastTickRef.current = Date.now();
            activeMsRef.current = 0;
            if (pauseEventTimer.current) {
              clearTimeout(pauseEventTimer.current);
              pauseEventTimer.current = null;
            }
            onProviderPlayRef.current?.();
          }
          const t = Number(time);
          if (t > 0) {
            const est = estimatedPosition().time;
            if (!convergedRef.current) {
              if (type === 'seeked' || t >= est - 30 || Date.now() > convergeUntilRef.current) {
                convergedRef.current = true;
              } else {
                return;
              }
            }
            pmSeenRef.current = true;
            lastPmRef.current = { time: t, at: Date.now() };
            // Ended: snap to the end (marks Watched via percent) and hold —
            // there is no more video to accrue.
            if (type === 'ended' || type === 'complete') {
              const end = Number(dur) > 0 ? Number(dur) : t;
              playbackRef.current = { currentTime: end, duration: Number(dur) || 0 };
              wallBaseRef.current = end;
              pausedProvRef.current = true;
            } else {
              playbackRef.current = { currentTime: t, duration: Number(dur) || 0 };
              // Keep the wall estimate in sync so a later fallback save
              // doesn't jump backwards.
              wallBaseRef.current = t;
            }
            activeMsRef.current = 0;
            lastTickRef.current = Date.now();
            reportRef.current();
            // Throttled persist: same second or <8s since last write skips
            // the full-map stringify (was: every provider tick, ~1/sec).
            const now = Date.now();
            const ls = saveThrottleRef.current;
            if (Math.abs(t - ls.sec) >= 3 || now - ls.at >= 8000) {
              saveThrottleRef.current = { sec: t, at: now };
              storage.saveProgress({
                mediaId,
                type: isTv ? 'tv' : 'movie',
                season: currentSeason,
                episode: currentEpisode,
                currentTime: t,
                duration: Number(dur) || 0,
                server,
                ...buildMeta(),
              });
            }
          }
        }
      } catch {}
    }

    window.addEventListener('message', handlePlayerMessage);
    return () => {
      window.removeEventListener('message', handlePlayerMessage);
      // A pending auto-pause must never fire for a stale episode/server.
      if (pauseEventTimer.current) {
        clearTimeout(pauseEventTimer.current);
        pauseEventTimer.current = null;
      }
    };
  }, [mediaId, isTv, currentSeason, currentEpisode, details, media]);

  const handleSelectEpisode = (seasonNum, episodeNum) => {
    // Stamp the old episode's position before switching.
    saveNowRef.current();
    setCurrentSeason(seasonNum);
    setCurrentEpisode(episodeNum);
    // Resume the target episode where IT stopped (per-episode memory) —
    // a fresh episode starts at 0, a visited one picks up its own time
    // on THIS server.
    const epSaved = storage.getEpisodeProgress('tv', mediaId, seasonNum, episodeNum, server);
    const epStart = epSaved?.currentTime || 0;
    playbackRef.current = { currentTime: epStart, duration: epSaved?.duration || 0 };
    if (epStart > 0) pmSeenRef.current = true;
    else pmSeenRef.current = false;
    wallBaseRef.current = epStart;
    activeMsRef.current = 0;
    lastTickRef.current = Date.now();
    pausedProvRef.current = false;
    rearmConvergence();
    rebuildEmbed(server, seasonNum, episodeNum, epStart);
    setKey((prev) => prev + 1);
  };

  const handleServerChange = (newServer) => {
    saveNowRef.current();
    const pos = estimatedPosition().time;
    setServer(newServer);
    pausedProvRef.current = false;
    rearmConvergence();
    rebuildEmbed(newServer, currentSeason, currentEpisode, pos);
    setKey((prev) => prev + 1);
  };

  const title = details?.title || details?.name || media?.title || media?.name || 'Now Playing';
  const totalSeasons = details?.number_of_seasons || media?.number_of_seasons || 1;

  // framed: embedded in the room screen layout (relative fill) instead
  // of a fullscreen overlay. All chrome/positioning inside stays absolute.
  const rootClass = framed
    ? `relative w-full h-full min-h-0 bg-[var(--cine-bg-deep)] flex flex-col ${showChrome ? '' : 'cursor-none'}`
    : `fixed inset-0 z-50 bg-[var(--cine-bg-deep)] flex flex-col animate-in fade-in duration-200 ${showChrome ? '' : 'cursor-none'}`;

  return (
    <div
      ref={containerRef}
      onMouseMove={poke}
      onTouchStart={poke}
      onClick={poke}
      className={rootClass}
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

        {/* Controls row: Episodes, Server Switcher, Fullscreen. The row is
            the positioning context for the episode popover, so it opens
            flush under the buttons exactly like the server dropdown does. */}
        <div className={`relative flex flex-wrap items-center gap-2.5 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {isTv && !roomLocked && (
            <button
              onClick={() => {
                setIsEpisodeOpen(!isEpisodeOpen);
                setServerSignal((s) => s + 1);
              }}
              className="cine-control-btn"
              aria-label="Toggle episode list"
            >
              <ListVideo className="w-4 h-4 text-[var(--cine-accent)]" />
              <span>Episodes</span>
            </button>
          )}

          <ServerSwitcher
            currentServer={server}
            onSelectServer={handleServerChange}
            closeSignal={serverSignal}
            onOpenChange={(open) => {
              if (open) setIsEpisodeOpen(false);
            }}
            unavailable={imdbIdOf(details, isTv ? 'tv' : 'movie') ? [] : ['russian']}
          />

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

          {/* Room chat lives in the chrome row (next to fullscreen) and the
              panel below lives inside this container — so both survive the
              jump to fullscreen, where only this element is shown. */}
          {chat && (
            <button
              onClick={chat.onToggle}
              className="cine-icon-btn relative"
              title="Room chat"
              aria-label="Toggle room chat"
            >
              <MessageCircle className="w-4 h-4" />
              {chat.unread > 0 && !chat.open && (
                <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                  {chat.unread > 9 ? '9+' : chat.unread}
                </span>
              )}
            </button>
          )}

          {/* Episodes popover — lives inside the row so top-full means
              "right under the buttons". Rendered only while the chrome is
              up so no invisible-but-clickable ghost remains after fade-out. */}
          {isTv && !roomLocked && (
            <EpisodeDrawer
              isOpen={isEpisodeOpen && showChrome}
              onClose={() => setIsEpisodeOpen(false)}
              tvId={mediaId}
              totalSeasons={totalSeasons}
              currentSeason={currentSeason}
              currentEpisode={currentEpisode}
              onSelectEpisode={handleSelectEpisode}
              anchorClassName="left-0 top-full mt-2"
            />
          )}
        </div>
      </div>

      {/* Floating room chat: sibling of chrome/video (NOT gated on
          showChrome), so it stays open and interactive while chrome fades
          and inside fullscreen (this container is the fullscreen element).
          Above iframe (auto), wake zone (z-20) and chrome (z-30). */}
      {chat?.open && (
        <div className="absolute right-3 top-24 bottom-24 z-40 w-[320px] max-w-[80vw] rounded-2xl cine-glass-panel flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--cine-glass-border)] flex-shrink-0">
            <p className="text-xs font-bold text-white">Room chat</p>
            <button
              onClick={chat.onToggle}
              className="w-7 h-7 rounded-full inline-flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close chat"
              aria-label="Close room chat"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <ChatList
            messages={chat.messages}
            reactions={chat.reactions}
            myDevice={chat.myDevice}
            onToggleReact={chat.onToggleReact}
            endRef={floatEndRef}
          />
          <ChatInput
            nickname={chat.nickname}
            muted={chat.muted}
            input={chat.input}
            setInput={chat.setInput}
            onSend={chat.onSend}
            onSendGif={chat.onSendGif}
          />
        </div>
      )}

      {/* Video Viewport — src is memoised state: chrome pokes and clock
          ticks re-render without ever reloading the stream. */}
      <div className="relative w-full h-full flex-1 bg-black flex items-center justify-center">
        {/* Suspended (room hard pause): the iframe is GONE, not covered —
            no video, no audio, nothing to diverge. Resume remounts it at
            the room's second via roomTarget. */}
        {suspended ? (
          <div className="absolute inset-0 overflow-hidden" aria-hidden={!roomOverlay}>
            <img
              src={tmdb.getImageUrl(media?.backdrop_path || details?.backdrop_path, 'w780', FALLBACK_BACKDROP)}
              alt=""
              className="w-full h-full object-cover opacity-40 blur-md scale-105"
            />
            <div className="absolute inset-0 bg-black/55" />
          </div>
        ) : (
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
        )}
        {/* Room overlay (host paused / waiting) sits above either state. */}
        {roomOverlay && (
          <div className={`absolute inset-0 z-10 flex items-center justify-center p-6 ${suspended ? '' : 'bg-black/60 backdrop-blur-sm'}`}>
            {roomOverlay}
          </div>
        )}
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
