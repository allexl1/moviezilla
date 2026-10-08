import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ListVideo, Maximize, MessageCircle, RotateCcw } from 'lucide-react';
import { storage, WATCHED_PCT } from '../services/storage';
import { tmdb, FALLBACK_BACKDROP } from '../services/tmdb';
import EpisodeDrawer from './EpisodeDrawer';
import ServerSwitcher from './ServerSwitcher';
import { FloatingRoomChat } from './chat';

// Only accept playback progress messages from our own embed servers.
// Anything else (other tabs, ads, nested third-party frames) is ignored.
// NOTE: Vidy emits from https://www.vidy.st (with www) — the bare
// domain never appears as an event origin. Same guard for the rest.
const TRUSTED_PLAYER_ORIGINS = [
  'https://vidy.st',
  'https://www.vidy.st',
  'https://vidlink.pro',
  'https://www.vidlink.pro',
  // vaplayer.ru: trusted for future progress events; tracking is
  // wall-clock until its protocol is verified.
  'https://vaplayer.ru',
  'https://www.vaplayer.ru',
];

// Late sandbox (popup guard): applied to OUR iframe element only after
// the provider has booted AND enough time passed — never upfront and never
// on timer alone. History:
//  - sandbox UPFRONT: Vidy shows "Iframe Sandbox Detected", VidLink shows
//    "Please Disable Sandbox" — both refuse to play. Dead end.
//  - timer-only +2.5s + immediate telemetry arm: worked for a while, then
//    regressed on VidLink and tripped Vidy 1/1000 on slow boots (arming
//    landed inside init detection).
// P0-2-A: gate on BOTH — elapsed >=4s since frame load AND boot proof
// (provider telemetry OR chrome interaction post-load). Telemetry alone no
// longer arms early; chrome taps (Episodes/Server/Fullscreen/Reload/chat)
// retry the arm. Neither Vidy nor VidLink is assumed ad-free anymore.
// No allow-popups, no allow-top-navigation — when armed, popups and page
// hijacks die in the frame (VidLink console: "Blocked opening
// 'about:blank' ... 'allow-popups' permission is not set").
// allow-presentation dropped: not a recognized Safari token (console
// error noise) and no provider path uses the presentation API.
const SBX_TOKENS = 'allow-scripts allow-same-origin allow-forms';
const SBX_MIN_MS = 4000;
const SBX_FALLBACK_MS = 6000;

function buildEmbedUrl({ server, mediaId, isTv, season, episode, resumeTime }) {
  const t = Math.max(0, Math.floor(resumeTime || 0));
  // 'russian' retired 2026-09-14: Voidboost (voidboost.tv AND .cc) is dead
  // (verified: connection refused, error page in-frame). Old rooms carrying
  // server:'russian' fall through to Vidy below — they play, just not dubbed.
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
  if (server === 'vaplayer') {
    // Vaplayer (keyless, TMDB-addressed, TV+movie). Found Slovo Patsana
    // where apiplayer's extractor failed — but 404s some titles itself
    // (Kukhnya) and never rendered under automation, so it stays
    // wall-clock tracked until its event protocol is verified.
    return isTv
      ? `https://vaplayer.ru/embed/tv/${mediaId}/${season}/${episode}`
      : `https://vaplayer.ru/embed/movie/${mediaId}`;
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
    // Finished titles restart at 0: a stale per-server slot must never
    // resurrect and replay the credits (or un-mark Watched on heartbeat).
    // Season/episode stay where they finished — the picker owns those.
    const watched = (saved?.percent || 0) >= WATCHED_PCT;
    return {
      season: saved?.season || 1,
      episode: saved?.episode || 1,
      // Strict slot only: another server's seconds (or legacy top-level
      // once slots exist) must never leak in here.
      time: watched ? 0 : (slot?.currentTime ?? 0),
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
  const frameRef = useRef(null);
  // Embed URL this iframe element has been sandbox-armed for. Fresh
  // elements (episode/server switches remount the frame) re-arm from
  // scratch — the guard below compares against the CURRENT url.
  const sandboxArmed = useRef(null);
  // Pending arm timer: restarted on every frame load so arming always
  // lands after the LATEST load (rapid rebuilds can't arm early).
  const sandboxTimer = useRef(null);
  // P0-2-A gating: when this frame loaded + whether chrome was touched
  // since (Episodes/Server/Fullscreen/Reload/chat). Arming requires elapsed
  // >= SBX_MIN_MS AND (telemetry seen OR chrome touched) — timer alone
  // never arms, telemetry alone never arms early.
  const frameLoadAt = useRef(0);
  const chromeTouched = useRef(false);
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
    // Runtime-anchored completion: silent providers (wall-clock only, no
    // duration, no ended event) can otherwise NEVER reach Watched — the
    // title sits in Continue Watching forever. The TMDB runtime is the
    // honest yardstick: past 95% of it, the watch counts as finished.
    const runtimeSec = Math.round((details?.runtime || details?.episode_run_time?.[0] || 0) * 60);
    let saveTime = pos.time;
    let saveDur = pos.duration;
    if (runtimeSec > 60 && pos.time >= runtimeSec * 0.95) {
      saveTime = runtimeSec;
      saveDur = runtimeSec;
    }
    storage.saveProgress({
      mediaId,
      type: isTv ? 'tv' : 'movie',
      season: currentSeason,
      episode: currentEpisode,
      currentTime: saveTime,
      duration: saveDur,
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
    })
  );

  const rebuildEmbed = (srv, season, episode, resumeTime) => {
    // New frame identity: boot proof must come from the NEW frame.
    // Reset clock + touch + telemetry here (not just onLoad) so a stale
    // pmSeen/touch from the old frame can never arm the new one early
    // and trip init detection. onFrameLoad refreshes the clock on actual load.
    frameLoadAt.current = Date.now();
    chromeTouched.current = false;
    pmSeenRef.current = false;
    setEmbedUrl(
      buildEmbedUrl({
        server: srv,
        mediaId,
        isTv,
        season,
        episode,
        resumeTime: clampResume(resumeTime),
      })
    );
  };

  // Stall recovery: remount the embed at the last known second (or from
  // zero). Same code path as an episode switch, minus the episode change.
  const reloadStream = (fromZero = false) => {
    saveNowRef.current();
    const t = fromZero ? 0 : estimatedPosition().time;
    playbackRef.current = { currentTime: t, duration: playbackRef.current.duration };
    wallBaseRef.current = t;
    activeMsRef.current = 0;
    lastTickRef.current = Date.now();
    // Saved seconds are resume position, not boot proof (see rebuildEmbed).
    pmSeenRef.current = false;
    pausedProvRef.current = false;
    rearmConvergence();
    rebuildEmbed(server, currentSeason, currentEpisode, t);
    setKey((prev) => prev + 1);
    poke();
  };

  // Fullscreen helpers: plain enter/exit on our container. (There used
  // to be a "kicked out of fullscreen" detector + re-enter pill here —
  // removed by request. Popup-forced exits can't be distinguished from
  // intentional ones anyway, and the pill fired on plain Esc too.)
  // iOS Safari can't fullscreen arbitrary containers: there the provider
  // keeps its own fullscreen permission (see the iframe below).
  const isiOS =
    typeof navigator !== 'undefined' &&
    /iPad|iPhone|iPod/.test(navigator.userAgent || '');
  const enterFs = () => {
    containerRef.current?.requestFullscreen().catch(() => {});
  };
  const exitFs = () => {
    document.exitFullscreen().catch(() => {});
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
      // Real provider telemetry (not the wall estimate): the room trusts
      // this — and only this — as "someone is really watching".
      live: pmSeenRef.current === true,
    });
  };

  // Room follow: host (or granted driver) moved — rebuild the embed at
  // their second. Same code path as a local episode/server switch.
  // Parked followers (suspended) skip everything except an explicit
  // resume: rebuilding a held player is pure suffering with no playback.
  // `suspended` is a real dep (not key-only): toggling it re-runs the
  // effect, and the guard decides.
  //
  // Late-sandbox arming lives here (after embedUrl exists — TDZ).
  // P0-2-A: tryArmSandbox gates on elapsed + boot proof. Timer alone never
  // arms, telemetry alone never arms early. Refs + timeouts only, no state.
  const tryArmSandbox = () => {
    const el = frameRef.current;
    if (!el) return;
    // Read back the CURRENT src (never a stale closure): rebuilds swap
    // the element under us, and only verified hosts get armed.
    const url = el.getAttribute('src') || '';
    if (!url || sandboxArmed.current === url) return;
    if (!url.includes('vidy.st') && !url.includes('vidlink.pro')) return;
    const elapsed = Date.now() - (frameLoadAt.current || 0);
    if (elapsed < SBX_MIN_MS) {
      if (sandboxTimer.current) clearTimeout(sandboxTimer.current);
      sandboxTimer.current = setTimeout(() => tryArmSandbox(), SBX_MIN_MS - elapsed + 500);
      return;
    }
    // Boot proof required: provider spoke OR user touched chrome post-load.
    // Without it the provider likely hasn't cleared init detection — wait;
    // telemetry / interaction handlers will retry.
    if (!pmSeenRef.current && !chromeTouched.current) return;
    try {
      el.setAttribute('sandbox', SBX_TOKENS);
      sandboxArmed.current = url;
    } catch {
      // DOM unavailable — unarmed, playback unaffected.
    }
  };
  // Back-compat alias: telemetry path calls armSandbox().
  const armSandbox = () => tryArmSandbox();
  const markChromeTouched = () => {
    chromeTouched.current = true;
    tryArmSandbox();
  };
  const onFrameLoad = () => {
    // Fresh element (first mount or rebuild): previous arming belongs to
    // the old frame. Restart the clock — arming lands >=4s after the LATEST
    // load AND after boot proof, past init-time detection.
    sandboxArmed.current = null;
    frameLoadAt.current = Date.now();
    chromeTouched.current = false;
    if (sandboxTimer.current) clearTimeout(sandboxTimer.current);
    sandboxTimer.current = setTimeout(() => tryArmSandbox(), SBX_FALLBACK_MS);
  };
  useEffect(() => {
    if (!roomTarget || roomTarget.key == null) return;
    if (suspended && roomTarget.action !== 'play') return;
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
  }, [roomTarget?.key, suspended]);

  // Log the visit on a 5s heartbeat + on hide/close — so tapping History
  // always reopens the exact episode + second. Entries deduped per title.
  // Heartbeat: wall-clock accrue + persist + position reports.
  // Suspended followers sit out: the frame is gone, so accruing wall-clock
  // would inflate their history and poison the resume second. Position
  // reports stay live (cheap, keeps the room's picture of this device
  // fresh). `suspended` is a dep so the interval closure always sees the
  // current hold state.
  useEffect(() => {
    const beat = setInterval(() => {
      if (!suspended) {
        accumulateWallClock();
        saveNowRef.current();
      }
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
      // Always persist on the way out, even while suspended: leaving mid
      // pause used to drop the pause point from history. No accrue here —
      // the frozen estimate is saved as-is (saveNow guards 0s clobbers).
      saveNowRef.current();
    };
  }, [mediaId, suspended]);

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
      if (sandboxTimer.current) clearTimeout(sandboxTimer.current);
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
  // Guards: typing in chat/GIF/search inputs must never trigger player
  // shortcuts (typing "f" in room chat toggled fullscreen); Esc in native
  // fullscreen belongs to the browser (it exits fullscreen) — closing the
  // whole player there is what stranded users + spuriously raised the
  // re-enter pill.
  useEffect(() => {
    function handleKeyDown(e) {
      const t = e.target;
      const typing =
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable);
      if (typing) return;
      poke();
      if (e.key === 'Escape') {
        if (document.fullscreenElement) return;
        e.preventDefault();
        if (isEpisodeOpen) {
          setIsEpisodeOpen(false);
          return;
        }
        onClose();
      } else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) {
          enterFs();
        } else {
          exitFs();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isEpisodeOpen]);

  // 2. PostMessage listener: real provider time always wins over the
  // wall-clock estimate (play/pause/seek/timeupdate across Vidy, VidLink
  // PLAYER_EVENT / MEDIA_DATA shapes).
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
        // strings), generic PLAYER_EVENT / MEDIA_DATA.
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
          // (the other half uses `currentTime`); VidLink uses
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
          //
          // Guard: some providers emit 'pause' on load/buffer with nothing
          // actually playing. A pause only counts (for the clock AND the
          // room) once playback was real: a reported time, a non-zero
          // resume base, or accrued watch. Otherwise a load-time blip
          // freezes history at 0:00 and syncs followers there too.
          const hadPlayback =
            pmSeenRef.current ||
            Number(playbackRef.current.currentTime || 0) > 0 ||
            Number(wallBaseRef.current || 0) > 0;
          if (type === 'pause') {
            if (hadPlayback) {
              pausedProvRef.current = true;
              if (pauseEventTimer.current) clearTimeout(pauseEventTimer.current);
              pauseEventTimer.current = setTimeout(() => {
                if (pausedProvRef.current) onProviderPauseRef.current?.();
              }, 1500);
            }
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
          const isEnd = type === 'ended' || type === 'complete';
          if (t > 0 || isEnd) {
            const est = estimatedPosition().time;
            if (!convergedRef.current && !isEnd) {
              if (type === 'seeked' || t >= est - 30 || Date.now() > convergeUntilRef.current) {
                convergedRef.current = true;
              } else {
                return;
              }
            }
            pmSeenRef.current = true;
            lastPmRef.current = { time: t, at: Date.now() };
            // Boot proof for the popup guard: telemetry marks pmSeen, then
            // tryArm gates on elapsed>=4s (never arms early on slow boots).
            armSandbox();
            // Ended snaps to 100% even when the provider never sent a
            // duration (silent servers, wall-clock titles): the event IS
            // the evidence. Bare 'ended' with no time at all marks via
            // the known duration, the title runtime, or 1/1 — same as a
            // manual Mark-watched, never a 0/0 that misses completion.
            let saveT = t;
            let saveDur = Number(dur) || 0;
            if (isEnd) {
              const runtimeSec = Math.round((details?.runtime || details?.episode_run_time?.[0] || 0) * 60);
              const d = Number(dur) > 0
                ? Number(dur)
                : (playbackRef.current.duration > 0 ? playbackRef.current.duration : (runtimeSec > 0 ? runtimeSec : 1));
              const done = t > 0 ? (Number(dur) > 0 ? Number(dur) : t) : d;
              saveT = done;
              saveDur = t > 0 ? (Number(dur) > 0 ? Number(dur) : t) : d;
              playbackRef.current = { currentTime: done, duration: saveDur };
              wallBaseRef.current = done;
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
            if (Math.abs(saveT - ls.sec) >= 3 || now - ls.at >= 8000) {
              saveThrottleRef.current = { sec: saveT, at: now };
              storage.saveProgress({
                mediaId,
                type: isTv ? 'tv' : 'movie',
                season: currentSeason,
                episode: currentEpisode,
                currentTime: saveT,
                duration: saveDur,
                server,
                ...buildMeta(),
              });
            }
          }
        }
      } catch {
        // ignore malformed postMessage payloads (ads / third-party frames)
      }
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
    // The new episode takes over the top-level immediately: finishing
    // S1E1 (100%) must not shadow a started S1E2, and a quick peek must
    // not vanish behind the old row. Per-episode memory decides the
    // resume second below (fresh episode → 0, visited → its own time).
    // Same-episode re-picks skip the stamp (it would wipe a real position
    // with a 0).
    if (seasonNum !== currentSeason || episodeNum !== currentEpisode) {
      try {
        const meta = buildMeta();
        storage.switchEpisode({
          mediaId,
          type: 'tv',
          season: seasonNum,
          episode: episodeNum,
          title: meta.title,
          poster: meta.poster,
          genres: meta.genres,
        });
      } catch {
        // never block switching for a stamp
      }
    }
    setCurrentSeason(seasonNum);
    setCurrentEpisode(episodeNum);
    // Resume the target episode where IT stopped (per-episode memory) —
    // a fresh episode starts at 0, a visited one picks up its own time
    // on THIS server.
    const epSaved = storage.getEpisodeProgress('tv', mediaId, seasonNum, episodeNum, server);
    const epStart = epSaved?.currentTime || 0;
    playbackRef.current = { currentTime: epStart, duration: epSaved?.duration || 0 };
    // Boot proof comes only from the NEW frame's telemetry (rebuildEmbed
    // resets pmSeen) — a saved resume second is not proof of boot.
    pmSeenRef.current = false;
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
        {/* Room-framed mode hides Back + title: the room header above owns
            both (back, title, watch status) — showing them twice, stacked,
            was the duplicate. Controls row below stays. */}
        {!framed && (
        <div className={`flex items-center gap-3 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          <button
            onClick={onClose}
            className="cine-icon-btn"

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
        )}

        {/* Controls row: Episodes, Server Switcher, Fullscreen. The row is
            the positioning context for the episode popover, so it opens
            flush under the buttons exactly like the server dropdown does. */}
        <div className={`relative flex flex-wrap items-center gap-2.5 ${showChrome ? 'pointer-events-auto' : 'pointer-events-none'}`}>
          {isTv && !roomLocked && (
            <button
              onClick={() => {
                markChromeTouched();
                setIsEpisodeOpen(!isEpisodeOpen);
                setServerSignal((s) => s + 1);
              }}
              className="cine-control-btn"
              aria-label="Toggle episode list"
              aria-expanded={isEpisodeOpen}
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
              if (open) {
                markChromeTouched();
                setIsEpisodeOpen(false);
              }
            }}
          />

          <button
            onClick={() => {
              markChromeTouched();
              if (!document.fullscreenElement) {
                enterFs();
              } else {
                exitFs();
              }
            }}
            className="cine-icon-btn cine-has-tip"

            aria-label="Toggle fullscreen"
          >
            <Maximize className="w-4 h-4" />
            <span className="cine-tip cine-tip--below" aria-hidden="true">Fullscreen</span>
          </button>

          <button
            onClick={() => reloadStream(false)}
            className="cine-icon-btn cine-has-tip"

            aria-label="Reload stream"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="cine-tip cine-tip--below" aria-hidden="true">Reload stream</span>
          </button>

          {/* Room chat lives in the chrome row (next to fullscreen) and the
              panel below lives inside this container — so both survive the
              jump to fullscreen, where only this element is shown. */}
          {chat && (
            <button
              onClick={() => {
                markChromeTouched();
                chat.onToggle();
              }}
              className="cine-icon-btn relative cine-has-tip"

              aria-label="Toggle room chat"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="cine-tip cine-tip--below" aria-hidden="true">Room chat</span>
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
          Above iframe (auto), wake zone (z-20) and chrome (z-30). Shared
          component with the YouTube room player so both stay identical. */}
      {chat?.open && (
        <FloatingRoomChat
          open
          onToggle={chat.onToggle}
          messages={chat.messages}
          reactions={chat.reactions}
          myDevice={chat.myDevice}
          nickname={chat.nickname}
          input={chat.input}
          setInput={chat.setInput}
          muted={chat.muted}
          onSend={chat.onSend}
          onSendGif={chat.onSendGif}
          onToggleReact={chat.onToggleReact}
          endRef={floatEndRef}
          seenInfo={chat.seenInfo}
        />
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
            ref={frameRef}
            onLoad={onFrameLoad}
            src={embedUrl}

            className="w-full h-full border-0"
            // NOTE: no sandbox attribute — verified 2026-09-14 in headless
            // Chromium that Vidy and VidLink refuse sandboxed frames
            // (Vidy: "Iframe Sandbox Detected" page, VidLink: "Sandboxed
            // iframe detected" crash). Popup pressure is inherent to these
            // free providers (VidLink ships adsco.re + yandex, confirmed
            // via traffic; Vidy is ad-free). Both carry the RU domestic
            // library (Brother 2 verified playing on both).
            // Fullscreen belongs to OUR chrome (container-level): the
            // provider's own fullscreen button is denied the permission,
            // so going fullscreen costs zero clicks inside the ad-funded
            // iframe (play/seek/fullscreen taps in there are what spawn
            // popups). iOS Safari keeps the permission — it can't
            // fullscreen arbitrary containers, so blocking it there would
            // remove fullscreen entirely instead of moving it.
            allow={isiOS ? 'autoplay; fullscreen; encrypted-media; picture-in-picture' : 'autoplay; encrypted-media; picture-in-picture'}
            referrerPolicy="origin"
            allowFullScreen={isiOS || undefined}
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
