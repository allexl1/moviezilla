import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Copy,
  Users,
  MessageCircle,
  Pause,
  Play,
  Crown,
  LogOut,
  Trash2,
  RefreshCw,
  Maximize,
  Settings,
  Search,
  Link2,
  ListMusic,
  Plus,
  X,
  Check,
  MessageCircleOff,
} from 'lucide-react';
import {
  myDeviceId,
  myNickname,
  setNickname,
  fetchRoom,
  patchRoom,
  deleteRoom,
  openRoomChannel,
  clearLocalUnstarted,
  localRoomUnstarted,
  nameColor,
  roomLink,
} from '../services/rooms';
import { tmdb, FALLBACK_POSTER } from '../services/tmdb';
import { formatClock } from '../services/storage';
import Player from './Player';
import { ChatView, FloatingRoomChat } from './chat';
import {
  getNotifEnabled,
  setNotifEnabled,
  getInChat,
  setInChat,
  getVolume,
  setVolume,
  getSoundPref,
  setSoundPref,
  NOTIF_SOUNDS,
  playNotifyTone,
} from '../services/notify';
import { useAccount } from '../services/account';
import YouTubeRoomPlayer, { parseYouTubeId, fetchYouTubeMeta } from './YouTubeRoomPlayer';
import Input from './ui/Input';
import Modal from './ui/Modal';
import EmptyState from './ui/EmptyState';

function msgId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Playlist identity: stable key per title across TMDB/YouTube shapes.
function keyOfMedia(m) {
  if (!m) return '';
  if (m.kind === 'youtube') return `yt:${m.youtubeId || ''}`;
  return `tmdb:${m.type || m.media_type || 'movie'}:${m.id ?? ''}`;
}

// Normalized queue item from a TMDB search hit or YouTube meta.
// Module scope (not render scope) so the timestamp never trips purity.
function makeQueueItem(picked, by) {
  const base =
    picked.kind === 'youtube'
      ? { kind: 'youtube', youtubeId: picked.youtubeId, title: picked.title || 'YouTube video', poster: picked.thumb || '' }
      : {
          kind: 'tmdb',
          id: picked.id,
          type: picked.media_type || 'movie',
          title: picked.title || '',
          poster: picked.poster_path || '',
        };
  return { ...base, key: keyOfMedia(base.kind === 'youtube' ? base : { ...base, media_type: base.type }), by: by || '', at: Date.now() };
}

// Queue item back into the {kind,...} shape doSwap expects.
function pickedOfItem(item) {
  if (item.kind === 'youtube') {
    return { kind: 'youtube', youtubeId: item.youtubeId, title: item.title, thumb: item.poster };
  }
  return { kind: 'tmdb', id: item.id, media_type: item.type, title: item.title, poster_path: item.poster };
}

export default function RoomView({ code, onLeave, onToast }) {
  const device = myDeviceId();
  // Identity: account display name wins when signed in (device nickname
  // is the logged-out fallback). `name` below is the ONLY name sent or
  // displayed; deviceNick feeds it when logged out.
  const { displayName: acctName } = useAccount();
  const [deviceNick, setDeviceNick] = useState(() => myNickname());
  const name = acctName || deviceNick;
  // Fresh mirrors for long-lived channel/interval closures: after a
  // rename the channel effect must NOT tear down (that untrack was read
  // as leaving), so closures read refs instead of the mount-time values.
  const nameRef = useRef(name);
  nameRef.current = name;
  const membersRef = useRef([]);
  // Flap-proof roster: every device's last-seen timestamp. Syncs only
  // ADD/refresh — removals belong to the pruner below after 15s unseen
  // (one partial sync must never read as everyone leaving; broadcast
  // chat is independent of presence, which is exactly why the old code
  // showed "alone" while messages still flowed).
  const lastSeenRef = useRef(new Map());
  const PRUNE_AFTER_MS = 15000;
  const [room, setRoom] = useState(null);
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [members, setMembers] = useState([]);
  // Chat cache (T17, option A): per-room device copy — history survives
  // reloads and tab switches. Sys rows are session noise: never cached.
  // `mine` is recomputed for this device on load.
  const chatKey = `mz_chat_${code}`;
  const CHAT_KEEP = 120;
  const [messages, setMessages] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(chatKey) || '[]');
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((m) => m && m.id && !m.sys)
        .slice(-CHAT_KEEP)
        .map((m) => ({ ...m, mine: m.device === device }));
    } catch {
      return [];
    }
  });
  const [reactions, setReactions] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(`${chatKey}_reactions`) || '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(chatKey, JSON.stringify(messages.slice(-CHAT_KEEP)));
      localStorage.setItem(`${chatKey}_reactions`, JSON.stringify(reactions));
    } catch {
      // private mode — session-only
    }
  }, [messages, reactions, chatKey]);
  // Composer draft (T9): survives tab switches AND reloads, cleared on send.
  const draftKey = `mz_draft_${code}`;
  const [input, setInput] = useState(() => {
    try {
      return localStorage.getItem(draftKey) || '';
    } catch {
      return '';
    }
  });
  const setInputCached = (v) => {
    setInput(v);
    try {
      if (v) localStorage.setItem(draftKey, v);
      else localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  };
  const [tab, setTab] = useState('chat');
  // T16 hide-chat: the rail collapses, video goes near-fullscreen.
  const [chatHidden, setChatHidden] = useState(false);
  const chatHiddenRef = useRef(false);
  // T6 reply target, shared by rail + floating (one composer state).
  const [replyTo, setReplyTo] = useState(null);
  // T3 fullscreen mirror (fullscreenchange doesn't re-render on its own).
  const [fsActive, setFsActive] = useState(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  useEffect(() => {
    const onFs = () => setFsActive(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);
  // Notifications (B9): master + sound + in-chat + volume. Refs mirror
  // for the channel closure; taps preview at the current volume.
  const [notif, setNotif] = useState(() => ({
    on: getNotifEnabled(),
    sound: getSoundPref(),
    inChat: getInChat(),
    vol: getVolume(),
  }));
  const notifRef = useRef(notif);
  // Read receipts (X-style text, never checkmarks): device -> newest
  // message id it has loaded. Presence-bounded, broadcast-throttled.
  const [seenMap, setSeenMap] = useState({});
  const lastSeenSent = useRef({ at: 0, msgId: '' });
  // Follower's picture of the host clock (from ticks): shown in the
  // header so "where is the host" is always answerable. Display only —
  // nothing auto-follows anymore (manual Sync is the only mover).
  const [hostPos, setHostPos] = useState(null);
  // Room prefs (per-device): chat text size, shared with Settings.
  const [chatSize, setChatSize] = useState(() => {
    try {
      return Number(localStorage.getItem('mz_chat_size')) || 15;
    } catch {
      return 15;
    }
  });
  const changeChatSize = (n) => {
    setChatSize(n);
    try {
      document.body.style.setProperty('--mz-chat-size', `${n}px`);
      localStorage.setItem('mz_chat_size', String(n));
    } catch {
      // ignore
    }
  };
  // Host media swap (settings tab): TMDB search + YouTube link.
  const [swapQuery, setSwapQuery] = useState('');
  const [swapResults, setSwapResults] = useState([]);
  const [swapYt, setSwapYt] = useState('');
  const [swapYtMeta, setSwapYtMeta] = useState(null);
  const [swapBusy, setSwapBusy] = useState(false);
  // (Reactions live with the chat cache above: broadcast-only like chat
  // itself — same lifetime as messages, late joiners miss both equally.)
  // Floating chat (fullscreen overlay): open state + unread count. Unread
  // ticks only while neither surface shows the conversation.
  const [chatOpen, setChatOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  // YouTube fullscreen wrapper: our own chrome (fullscreen + chat) lives
  // in this element, so both survive the jump to fullscreen — YouTube's
  // in-iframe button would fullscreen only the video and hide our chat.
  const ytWrapRef = useRef(null);
  const toggleYtFs = () => {
    try {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else ytWrapRef.current?.requestFullscreen().catch(() => {});
    } catch {
      // ignore
    }
  };
  const chatOpenRef = useRef(false);
  const tabRef = useRef('chat');
  // Mirrors for channel closures (their bodies go stale): what the
  // conversation-visibility check (T3) and notifier (T7) read.
  const canSeeRef = useRef(true);
  useEffect(() => {
    tabRef.current = tab;
    if (tab === 'chat') setUnread(0);
  }, [tab]);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
    if (chatOpen) setUnread(0);
  }, [chatOpen]);

  // Per-render mirror: is the conversation actually visible right now?
  // Side rail counts only when its tab is up, we're not fullscreen (the
  // rail is hidden there), and the rail isn't collapsed (T16).
  canSeeRef.current =
    ((tab === 'chat' && !fsActive && !chatHidden) || chatOpen);
  chatHiddenRef.current = chatHidden;
  notifRef.current = notif;
  const [pausedBy, setPausedBy] = useState(null);
  const [syncNote, setSyncNote] = useState('In sync');
  const [roomTarget, setRoomTarget] = useState(null);
  // Room playlist queue (persisted on the row, broadcast live).
  const [queue, setQueue] = useState([]);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  // Invite copy menu (B5): hover/tap the code chip to choose.
  const [inviteOpen, setInviteOpen] = useState(false);
  // Delete confirm (B8): never vaporize on a single stray tap.
  const [pendingDelete, setPendingDelete] = useState(null);
  // Host confirms (B10): crowning and removing both ask first.
  const [pendingHost, setPendingHost] = useState(null);
  const [pendingKick, setPendingKick] = useState(null);

  const channelRef = useRef(null);
  const roomRef = useRef(null);
  // Just applied someone else's target — don't echo it back as my own seek.
  const followGraceRef = useRef(0);
  // Last follow applied (any source) — followers skip re-following inside
  // the convergence window so a reload can't chase its own tail.
  const followAppliedRef = useRef(0);
  // Pending pause re-sends — cancelled the moment a newer action (play /
  // seek) goes out, so a stale retry can never re-pause after a resume.
  const pauseRetryRef = useRef([]);
  const clearPauseRetries = () => {
    for (const t of pauseRetryRef.current) clearTimeout(t);
    pauseRetryRef.current = [];
  };
  // Mirrors pausedBy for channel callbacks (their closures go stale).
  const pausedByRef = useRef(null);
  // Which device froze the room (me vs someone else) — only the pauser's
  // own in-player resume re-opens it. Last pause sys-message key so the
  // triple-send retries can't spam the chat.
  const pausedByDeviceRef = useRef(null);
  const [pausedByDevice, setPausedByDevice] = useState(null);
  const pauseSysRef = useRef('');
  // When the paused overlay was last (re)asserted — guards the heal path
  // against clearing an overlay the host just set (patch lands async).
  const pausedAtRef = useRef(0);
  // A paused room's stamped position must not keep growing: the embed has
  // no remote-pause, so the wall clock would inflate the resume second.
  // Freeze at the pause moment; resume unfreezes.
  const frozenPosRef = useRef(null);
  const myPos = useRef({ second: 0, season: 1, episode: 1, server: 'vidy' });
  const lastSeekSent = useRef({ at: 0, second: -1, season: -1, episode: -1 });
  const canControlRef = useRef(false);
  const seenDevices = useRef(new Set([device]));
  // First presence sync announces nobody (baseline, not join-spam).
  const firstSyncRef = useRef(true);

  roomRef.current = room;
  membersRef.current = members;
  const isHost = room?.hostDevice === device;
  const myGrant = room?.grants?.[device] || {};
  const canControl = isHost || myGrant.control === true;
  const chatMuted = !isHost && myGrant.chat === false;
  canControlRef.current = canControl;
  const hostPresent = room ? members.some((m) => m.device === room.hostDevice) : true;
  // T18 debounced host absence: presence flaps must never unmount the
  // video. The pruner owns truth (drops after 15s unseen), this debounce
  // is render timing only — except on first sync, which reports immediately.
  const [hostGone, setHostGone] = useState(false);
  const hostGoneTimer = useRef(null);
  useEffect(() => {
    if (hostPresent) {
      if (hostGoneTimer.current) clearTimeout(hostGoneTimer.current);
      hostGoneTimer.current = null;
      setHostGone(false);
      return;
    }
    // Post-prune truth: members only drop after 15s unseen, so this
    // debounce is render timing only, not a second absence window.
    if (!hostGoneTimer.current) {
      hostGoneTimer.current = setTimeout(() => {
        hostGoneTimer.current = null;
        setHostGone(true);
      }, 3000);
    }
  }, [hostPresent]);
  useEffect(
    () => () => {
      if (hostGoneTimer.current) clearTimeout(hostGoneTimer.current);
    },
    []
  );
  const waitingForHost = hostGone && !canControl;

  const pushMsg = (m) =>
    setMessages((prev) => [...prev.slice(-119), m]);

  const pushSys = (text) => pushMsg({ id: msgId(), sys: true, text });

  // The room's picture of my clock (T2): a drift note is only honest when
  // this is fresh — adoptMedia resets it so a just-moved follower never
  // prints a phantom "Host +26s".
  const lastReportAt = useRef(0);

  const applyReaction = (msgId, emoji, dev, nm, on) =>
    setReactions((prev) => {
      const entry = { ...(prev[msgId] || {}) };
      const cur = entry[emoji] || { devices: [], names: [] };
      let devices = (cur.devices || []).filter((d) => d !== dev);
      let names = (cur.names || []).filter((n) => n !== nm);
      if (on) {
        devices = [...devices, dev];
        if (nm && !names.includes(nm)) names = [...names, nm];
      }
      if (devices.length === 0) delete entry[emoji];
      else entry[emoji] = { devices, names };
      const next = { ...prev, [msgId]: entry };
      const keys = Object.keys(next);
      if (keys.length > 200) {
        for (const k of keys.slice(0, keys.length - 200)) delete next[k];
      }
      return next;
    });

  const toggleReact = (msgId, emoji) => {
    const mine = ((reactions[msgId]?.[emoji]?.devices) || []).includes(device);
    channelRef.current?.send(mine ? 'unreact' : 'react', { msgId, emoji, device, name: name });
    applyReaction(msgId, emoji, device, name, !mine);
  };

  useEffect(() => {
    pausedByRef.current = pausedBy;
  }, [pausedBy]);

  // Room row + media details.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const row = await fetchRoom(code);
        if (!alive) return;
        if (!row) {
          setError('Room not found. It may have been deleted.');
          setLoading(false);
          return;
        }
        setRoom(row);
        // Followers and host alike start at the room's saved second.
        setQueue(Array.isArray(row.queue) ? row.queue : []);
        // Followers and host alike start at the room's saved second.
        setRoomTarget({
          key: `init:${row.updatedAt || Date.now()}`,
          second: row.position || 0,
          season: row.season,
          episode: row.episode,
          server: row.server,
        });
        if (row.media?.kind !== 'youtube' && row.media?.id && row.media?.type) {
          try {
            const d = await tmdb.getMediaDetails(row.media.type, row.media.id);
            if (alive) setDetails(d);
          } catch {
            // Details optional — Player falls back to room media.
          }
        }
      } catch (err) {
        if (alive) setError(err.message || 'Could not load room.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);

  // My presence playback meta (T14): re-tracked on discrete transitions
  // only (pause/play/seek/swap/start) — never per tick.
  const reportState = (patch) => {
    try {
      channelRef.current?.update?.({
        pos: Math.floor(myPos.current.second || 0),
        ...(patch || {}),
      });
    } catch {
      // presence unavailable — states just read stale
    }
  };

  // Explicit playback life (T1): null until the row loads, then the row's
  // flag. Nobody has pressed play in a fresh room — the host's clock must
  // not run and followers must see "not started", not a fake 0:00.
  const startedRef = useRef(null);
  // Pre-migration inference (no `started` column yet): a present host that
  // never reported watching + a ~0 row position means not started. The row
  // decides post-migration and this never fires. Paused-at-0 is excluded
  // (pause reports watching:true), as are old clients (no meta).
  const hostWatching = room
    ? members.find((m) => m.device === room.hostDevice)?.watching
    : undefined;
  const roomStarted = !room
    ? true
    : (room.started ??
      (localRoomUnstarted(code)
        ? false
        : !(hostWatching === false && (room.position ?? 0) < 5)));
  useEffect(() => {
    if (room) startedRef.current = roomStarted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code, roomStarted]);

  // Someone really pressed play: stamp the row (best effort pre-migration)
  // and tell the room. Guarded — runs once per title.
  const markStarted = (second, season, episode, server) => {
    if (startedRef.current) return;
    startedRef.current = true;
    clearLocalUnstarted(code);
    setRoom((prev) => (prev ? { ...prev, started: true } : prev));
    patchRoom(code, { started: true }).catch(() => {});
    channelRef.current?.send('started', {
      device,
      name: name,
      second: Math.floor(second || 0),
      season,
      episode,
      server,
      at: Date.now(),
    });
    reportState({ watching: true, paused: false, pos: Math.floor(second || 0) });
  };

  // Latest leave, always fresh for channel callbacks (kick handler).
  const leaveRef = useRef(() => {});

  // Host swapped what's playing (local host action or a remote 'media'
  // event): adopt wholesale, restart un-started at 0:00, clear every lock.
  // Player keys include the media id, so frames remount exactly once.
  function adoptMedia(mediaObj, server, title, sysName) {
    const m = mediaObj || {};
    setRoom((prev) =>
      prev
        ? { ...prev, media: m, title: title || m.title || prev.title, season: 1, episode: 1, server, position: 0, state: 'live', started: false }
        : prev
    );
    startedRef.current = false;
    setPausedBy(null);
    setPausedByDevice(null);
    pausedByDeviceRef.current = null;
    pausedAtRef.current = 0;
    frozenPosRef.current = null;
    myPos.current = { second: 0, season: 1, episode: 1, server };
    lastReportAt.current = 0;
    setHostPos(null);
    lastSeekSent.current = { at: 0, second: -1, season: -1, episode: -1 };
    reportState({ watching: false, paused: false, pos: 0 });
    if (m.kind === 'youtube') {
      setDetails(null);
    } else if (m.id && m.type) {
      tmdb.getMediaDetails(m.type, m.id).then((d) => setDetails(d)).catch(() => setDetails(null));
    } else {
      setDetails(null);
    }
    followGraceRef.current = Date.now();
    followAppliedRef.current = Date.now();
    setRoomTarget({ key: `media:${Date.now()}`, second: 0, season: 1, episode: 1, server });
    setSyncNote('In sync');
    if (sysName) pushSys(`${sysName} changed what's playing`);
  }

  // Session edit/delete (T13, option A): whoever is here now converges;
  // late joiners never saw the original anyway. Author-only edits; deletes
  // by the author or the current host. Deletes leave tombstones.
  const applyEdit = (msgId, text, byDevice) => {
    const clean = String(text || '').trim().slice(0, 500);
    if (!msgId || !clean) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || m.sys || m.del || m.kind === 'gif') return m;
        if (m.device !== byDevice) return m;
        if (clean === m.text) return m;
        return { ...m, text: clean, edited: true };
      })
    );
  };
  const applyDelete = (msgId, byDevice, byHost) => {
    if (!msgId) return;
    const hostDevice = roomRef.current?.hostDevice;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || m.sys || m.del) return m;
        if (m.device !== byDevice && !(byHost && byDevice === hostDevice)) return m;
        return { ...m, text: '', reply: null, del: true };
      })
    );
    setReactions((prev) => {
      if (!prev[msgId]) return prev;
      const next = { ...prev };
      delete next[msgId];
      return next;
    });
  };

  // Live channel: chat + playback actions + host/grants/state.
  useEffect(() => {
    if (!code || !nameRef.current) return;
    // Async open (drains stale channel instances first — see rooms.js).
    // A superseded open is closed on arrival instead of stored.
    let ch = null;
    let cancelled = false;
    openRoomChannel({
      code,
      name: nameRef.current,
      onEvent: ({ type, payload }) => {
        if (!payload || payload.device === device) return;
        const yt = roomRef.current?.media?.kind === 'youtube';
        if (type === 'chat') {
          pushMsg({
            id: payload.id,
            device: payload.device,
            name: payload.name,
            text: payload.text,
            reply: payload.reply || null,
            kind: payload.kind,
            url: payload.url,
            preview: payload.preview,
            title: payload.title,
            at: payload.at,
          });
          // Unread ticks while neither surface shows the conversation. Note
          // fullscreen hides the side rail entirely, so a message the rail
          // "shows" is still unseen — the floating-panel badge must tick.
          // A hidden rail (T16) counts as unseen too.
          if (!chatOpenRef.current && (tabRef.current !== 'chat' || document.fullscreenElement || chatHiddenRef.current)) {
            setUnread((u) => u + 1);
          }
          // Notification sound (B9): master on, and either not looking
          // or looking with in-chat notifications enabled. Own messages
          // never arrive here (broadcast excludes self).
          const n = notifRef.current;
          if (n.on && (!canSeeRef.current || n.inChat)) {
            playNotifyTone(n.sound, n.vol / 100);
          }
        } else if (type === 'edit') {
          applyEdit(payload.msgId, payload.text, payload.device, false);
        } else if (type === 'del') {
          applyDelete(payload.msgId, payload.device, payload.host === true);
        } else if (type === 'kick') {
          if (payload.target === device) {
            onToast?.('The host removed you from the room');
            leaveRef.current();
          } else if (payload.target) {
            pushSys(`${payload.name || 'Host'} removed someone from the room`);
          }
        } else if (type === 'started') {
          // The host really pressed play (T1): adopt the second and load.
          // Same landing as a forced sync — embeds remount once, YouTube
          // seeks in place via its command API.
          startedRef.current = true;
          setRoom((prev) => (prev ? { ...prev, started: true } : prev));
          setPausedBy(null);
          setPausedByDevice(null);
          pausedByDeviceRef.current = null;
          pausedAtRef.current = 0;
          frozenPosRef.current = null;
          pushSys(`${payload.name || 'Host'} started watching`);
          setSyncNote('Catching up…');
          followGraceRef.current = Date.now();
          followAppliedRef.current = Date.now();
          setRoomTarget({
            key: `started:${payload.at || Date.now()}`,
            action: yt ? 'play' : undefined,
            second: payload.second || 0,
            season: payload.season,
            episode: payload.episode,
            server: payload.server,
          });
          reportState({ watching: true, paused: false, pos: payload.second || 0 });
          setTimeout(() => setSyncNote('In sync'), 4000);
        } else if (type === 'react') {
          applyReaction(payload.msgId, payload.emoji, payload.device, payload.name, true);
        } else if (type === 'unreact') {
          applyReaction(payload.msgId, payload.emoji, payload.device, payload.name, false);
        } else if (type === 'tick') {
          // Host heartbeat over realtime (2.5s): followers use it ONLY as
          // a clock display ("Host 12:34"). Nothing auto-follows anymore —
          // the tick/drift auto-remounts were the reload-every-5s loop
          // (each rebuild reloaded the iframe, reset the wall clock, and
          // diverged again). Manual Sync is the only mover now.
          if (payload.device === device || !roomRef.current) return;
          if (!canControlRef.current) {
            const s = Math.floor(payload.second || 0);
            setHostPos((prev) =>
              prev && Math.abs(prev.second - s) < 2
                ? prev
                : { second: s, at: payload.at || Date.now(), season: payload.season, episode: payload.episode }
            );
          }
        } else if (type === 'seek' || type === 'play') {
          // P0-1 manual-sync only: embeds reload on every remount, so live
          // seeks never auto-move. Only resume-from-pause (followers are
          // parked) or an explicit host Sync-all (payload.force) remounts.
          // Everything else is display-only: host clock + "tap Sync" note.
          // YouTube has a real seek API (no reload) so it keeps auto-follow.
          if (!yt) {
            const isResume = Boolean(pausedByRef.current);
            const isForced = payload.force === true;
            if (!isResume && !isForced) {
              const s = Math.floor(payload.second || 0);
              setHostPos((prev) =>
                prev && Math.abs(prev.second - s) < 2
                  ? prev
                  : { second: s, at: payload.at || Date.now(), season: payload.season, episode: payload.episode }
              );
              // Drift note (T2): honest only with a fresh local clock. A
              // stale myPos (just moved, just loaded) printed phantom gaps
              // like "Host +26s" while 3s apart.
              const mine = myPos.current.second || 0;
              const fresh = Date.now() - lastReportAt.current < 15000;
              const behind = Math.floor(s - mine);
              if (!pausedByRef.current && fresh && s > 5 && behind > 15) {
                setSyncNote(`Host +${behind}s. Tap Sync`);
              }
              return;
            }
            // Resume / forced Sync-all: fall through to remount below.
          }
          setPausedBy(null);
          setPausedByDevice(null);
          pausedByDeviceRef.current = null;
          pausedAtRef.current = 0;
          frozenPosRef.current = null;
          // The blank-time complaint: a remounted frame shows 0:00 until
          // the provider ticks, so announce where playback continues.
          if (type === 'play' && (payload.second || 0) > 2) {
            onToast?.(`Resuming from ${formatClock(payload.second)}`);
          }
          setSyncNote('Catching up…');
          followGraceRef.current = Date.now();
          followAppliedRef.current = Date.now();
          setRoomTarget({
            key: `evt:${payload.at || Date.now()}`,
            action: type,
            second: payload.second || 0,
            season: payload.season,
            episode: payload.episode,
            server: payload.server,
          });
          setTimeout(() => setSyncNote('In sync'), 4000);
        } else if (type === 'pause') {
          pausedByDeviceRef.current = payload.device;
          setPausedByDevice(payload.device);
          const sysKey = `${payload.device}:${payload.second || 0}`;
          if (pauseSysRef.current !== sysKey) {
            pauseSysRef.current = sysKey;
            pushSys(`${payload.name || 'Host'} stopped the player`);
          }
          // N2: freeze the host clock at the pause second — the status
          // line and the Sync button read this exact time from now on.
          setHostPos({
            second: Math.floor(payload.second || 0),
            at: payload.at || Date.now(),
            season: undefined,
            episode: undefined,
          });
          // pausedBy drives the status line on BOTH media kinds (embed
          // overlay/suspend stay embed-only via their own gates). YouTube
          // used to skip this — followers then showed "In sync" for up to
          // 10s until the row poll healed it.
          setPausedBy(payload.name || 'Host');
          pausedAtRef.current = Date.now();
          if (yt) {
            // YouTube has a real command API — truly pause at the second.
            setRoomTarget({
              key: `evt:${payload.at || Date.now()}`,
              action: 'pause',
              second: payload.second || 0,
            });
          }
          // Embeds: no remote orders exist — the overlay + unmount in the
          // render path below IS the pause (see `suspended`).
        } else if (type === 'media') {
          // Host swapped what's playing: adopt wholesale and restart at
          // 0:00 for everyone. The Player/YouTube keys below include the
          // media id, so frames remount exactly once, on purpose.
          if (Array.isArray(payload.queue)) setQueue(payload.queue);
          adoptMedia(payload.media || {}, payload.server || 'vidy', payload.title || '', payload.name || 'Host');
        } else if (type === 'seen') {
          if (payload.device && payload.msgId) {
            setSeenMap((prev) => ({ ...prev, [payload.device]: { msgId: payload.msgId, name: payload.name || 'Someone' } }));
          }
        } else if (type === 'queue') {
          if (Array.isArray(payload.queue)) setQueue(payload.queue);
          if (payload.notice) pushSys(payload.notice);
        } else if (type === 'host' || type === 'grants' || type === 'state') {          fetchRoom(code).then((r) => {
            if (r) {
              setRoom(r);
              if (type === 'host') pushSys(`${payload.name || 'Someone'} is now hosting`);
            }
          });
        }
      },
      onPresence: (list) => {
        const now = Date.now();
        // Refresh clocks + last-seen; merge-add newcomers while keeping
        // existing order (never remove here — that's the pruner's job).
        const byDevice = new Map(membersRef.current.map((m) => [m.device, m]));
        for (const m of list) {
          lastSeenRef.current.set(m.device, now);
          byDevice.set(m.device, m);
        }
        const merged = [...byDevice.values()];
        setMembers(merged);
        // First sync is the baseline (no "X joined" spam for everyone
        // already here — including the host-absent truth, immediately).
        if (firstSyncRef.current) {
          firstSyncRef.current = false;
          for (const m of merged) seenDevices.current.add(m.device);
          if (roomRef.current && !merged.some((m) => m.device === roomRef.current.hostDevice)) {
            if (hostGoneTimer.current) clearTimeout(hostGoneTimer.current);
            hostGoneTimer.current = null;
            setHostGone(true);
          }
        } else {
          const newcomers = [];
          for (const m of merged) {
            if (!seenDevices.current.has(m.device)) {
              seenDevices.current.add(m.device);
              pushSys(`${m.name} joined`);
              if (m.device !== device) newcomers.push(m);
            }
          }
          // I paused the room: newcomers subscribed after the broadcast, so
          // hand them the paused state directly (else they play until the
          // next heartbeat/poll notices).
          if (newcomers.length > 0 && pausedByRef.current === nameRef.current) {
            const second = Math.floor((frozenPosRef.current || myPos.current).second || 0);
            channelRef.current?.send('pause', { device, name: nameRef.current, second, at: Date.now() });
          }
        }
      },
      onLeave: ({ key } = {}) => {
        // Server-sent untrack: fast-track collection (the pruner drops it
        // within ~5s). A missing key in a plain sync stays a flap.
        if (key && lastSeenRef.current.has(key)) {
          lastSeenRef.current.set(key, Date.now() - (PRUNE_AFTER_MS - 3000));
        }
      },
    })
      .then((opened) => {
        if (cancelled) {
          try {
            opened.close();
          } catch {
            // ignore
          }
          return;
        }
        ch = opened;
        channelRef.current = opened;
      })
      .catch((err) => {
        console.error('[rooms] channel open failed:', err);
      });
    return () => {
      cancelled = true;
      try {
        ch?.close?.();
      } catch {
        // ignore
      }
      channelRef.current = null;
    };
    // NOTE: deps are `code` only. Room/name arrive async — reopening on
    // `room?.code` tore the channel down on every load (untrack read as
    // leaving) and renames now propagate via update(), closures read refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Rename without teardown: merge the new name into the tracked
  // presence (single discrete re-track, same as pause/play/seek).
  useEffect(() => {
    if (!name) return;
    try {
      channelRef.current?.update?.({ name });
    } catch {
      // presence unavailable — next discrete update carries it
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Roster pruner: owns ALL removals. Drops devices unseen for 15s,
  // announces leaves, and unsticks the room when the pauser is truly
  // gone (moved here from onPresence — a pauser missing from one sync
  // is a flap, not a leave).
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      const cur = membersRef.current;
      if (cur.length === 0) return;
      const gone = cur.filter((m) => now - (lastSeenRef.current.get(m.device) ?? now) > PRUNE_AFTER_MS);
      if (gone.length === 0) return;
      for (const g of gone) {
        lastSeenRef.current.delete(g.device);
        pushSys(`${g.name} left`);
      }
      const next = cur.filter((m) => lastSeenRef.current.has(m.device));
      setMembers(next);
      if (pausedByDeviceRef.current && !next.some((m) => m.device === pausedByDeviceRef.current)) {
        pausedByDeviceRef.current = null;
        setPausedByDevice(null);
        setPausedBy(null);
        pushSys('The room resumed. The pauser left');
      }
    }, 5000);
    return () => clearInterval(t);
  }, []);

  // My position reports: broadcast jumps (seeks / episode changes) when
  // I'm allowed to drive. Normal playback (<12s steps) stays silent.
  const handlePosition = (pos) => {
    myPos.current = pos;
    lastReportAt.current = Date.now();
    // Someone really watching past 3s means started (T1) — providers that
    // never emit a play event. Gated on LIVE provider telemetry: the wall
    // estimate accrues from mount and must never open the room by itself.
    if (!startedRef.current && pos.live === true && (pos.second || 0) > 3 && canControlRef.current) {
      markStarted(pos.second, pos.season, pos.episode, pos.server);
    }
    if (!canControlRef.current) return;
    const last = lastSeekSent.current;
    const jumped =
      Math.abs(pos.second - last.second) > 12 ||
      pos.season !== last.season ||
      pos.episode !== last.episode;
    if (!jumped) return;
    lastSeekSent.current = { at: Date.now(), second: pos.second, season: pos.season, episode: pos.episode };
    // I just followed someone — sync silently, never echo. Grace covers
    // my own manual Sync (4s), applied covers a just-applied remote move
    // (6s convergence window) so a reload can't chase its own tail.
    if (Date.now() - followGraceRef.current < 4000) return;
    if (Date.now() - followAppliedRef.current < 6000) return;
    clearPauseRetries();
    // Discrete move: refresh my presence clock too (T14).
    reportState({ pos: Math.floor(pos.second || 0) });
    channelRef.current?.send('seek', {
      device,
      name: name,
      second: pos.second,
      season: pos.season,
      episode: pos.episode,
      server: pos.server,
      at: Date.now(),
    });
  };

  // Host heartbeat: stamp position + episode + server so rejoiners land
  // on the exact S/E/second even with no recent seek event. Frozen while
  // the room is paused (see above). Plus a 2.5s realtime tick so followers
  // trail by seconds instead of poll intervals.
  // Gated on started (T1): nobody's clock runs before the first real play
  // — the row position stays 0 and followers keep inferring "not started".
  useEffect(() => {
    if (!room || !isHost || !roomStarted) return;
    const beat = setInterval(() => {
      const p = frozenPosRef.current || myPos.current;
      // People-tab clock (B2): presence rides the same beat, so the host's
      // time ticks live instead of freezing at the start second.
      reportState({ pos: Math.floor(p.second || 0), paused: Boolean(pausedByRef.current) });
      patchRoom(code, {
        position: Math.floor(p.second || 0),
        season: p.season || roomRef.current?.season || 1,
        episode: p.episode || roomRef.current?.episode || 1,
        server: p.server || roomRef.current?.server || 'vidy',
      }).catch(() => {});
    }, 10000);
    const tick = setInterval(() => {
      if (pausedByRef.current) return;
      const p = myPos.current;
      channelRef.current?.send('tick', {
        device,
        name: nameRef.current,
        second: Math.floor(p.second || 0),
        season: p.season,
        episode: p.episode,
        server: p.server,
        at: Date.now(),
      });
    }, 2500);
    return () => {
      clearInterval(beat);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, isHost, roomStarted]);

  // Follower drift check against the host-stamped row: DISPLAY ONLY.
  // It heals missed pause/resume broadcasts off the stamped row state
  // (broadcasts are ephemeral — a late subscriber misses them) and shows
  // how far behind you are — but it never moves your player. Manual Sync
  // is the only mover (auto-follows were the reload loop).
  useEffect(() => {
    if (!room || canControl) return;
    const check = setInterval(async () => {
      try {
        const r = await fetchRoom(code);
        if (!r) return;
        setRoom((prev) => (prev ? { ...prev, position: r.position, state: r.state, grants: r.grants, hostDevice: r.hostDevice } : prev));
        // Follower clock (B2): report my own position on the same poll so
        // my row ticks for the host too.
        reportState({ pos: Math.floor(myPos.current.second || 0), paused: Boolean(pausedByRef.current) });
        // Heal missed pause/resume broadcasts off the stamped row state
        // (broadcasts are ephemeral — a late subscriber misses them). The
        // timestamp guard keeps us from clearing an overlay the host set
        // more recently than the row we just read.
        const rowTs = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
        if (r.state === 'paused') {
          if (!pausedBy) {
            setPausedBy('Host');
            pausedAtRef.current = rowTs || Date.now();
          }
          return;
        }
        if (pausedBy && rowTs > pausedAtRef.current) {
          setPausedBy(null);
          followAppliedRef.current = Date.now();
          setRoomTarget({
            key: `heal:${Date.now()}`,
            action: 'play',
            second: r.position || 0,
            season: r.season,
            episode: r.episode,
            server: r.server,
          });
          return;
        }
        if (pausedBy) return;
        if (Date.now() - followAppliedRef.current < 6000) return;
        const elapsed = r.updatedAt ? Math.max(0, (Date.now() - new Date(r.updatedAt).getTime()) / 1000) : 0;
        const expected = (r.position || 0) + Math.min(elapsed, 30);
        const mine = myPos.current.second || 0;
        // Same honesty rule as live ticks (T2): a stale local clock prints
        // no delta — "Host +26s" while 3s apart was this exact bug.
        const fresh = Date.now() - lastReportAt.current < 15000;
        const behind = Math.floor(expected - mine);
        if (fresh && expected > 5 && behind > 15) {
                setSyncNote(`Host +${behind}s. Tap Sync`);
        } else {
          setSyncNote((prev) => (prev.startsWith('Host +') ? 'In sync' : prev));
        }
      } catch {
        // Offline blip — next check retries.
      }
    }, 10000);
    return () => clearInterval(check);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, room?.code, canControl, pausedBy]);

  // (Removed: the old always-scroll effect was the scroll-yank — the
  // ChatView pane owns pin-aware scrolling now.)

  // Read receipts (T3/T5): report the newest loaded message ONLY while the
  // conversation is actually visible — side rail up, not fullscreen (the
  // rail is hidden there), rail not collapsed, or the floating panel open.
  // Fullscreen with a closed chat reports nothing (that was the phantom
  // "seen"). Own messages never count.
  useEffect(() => {
    if (!channelRef.current || !canSeeRef.current) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.sys || m.mine || m.del) continue;
      if (m.id === lastSeenSent.current.msgId || Date.now() - lastSeenSent.current.at < 3000) return;
      lastSeenSent.current = { at: Date.now(), msgId: m.id };
      channelRef.current?.send('seen', { device, name: name, msgId: m.id, at: Date.now() });
      return;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, chatOpen, tab, chatHidden, fsActive]);

  // Telegram receipts (T5): exactly one status lives in the thread. My
  // newest message carries Sent until someone loads it (Seen by …); when
  // my newest is still unseen but an older one was loaded, the Seen sits
  // on that last-seen one instead. Nothing per-message, no checkmarks.
  const receipts = (() => {
    const feed = messages.filter((m) => !m.sys && !m.del);
    const idxById = new Map(feed.map((m, i) => [m.id, i]));
    const seenByIdx = (idx) => {
      const names = [];
      for (const [dev, s] of Object.entries(seenMap)) {
        if (dev === device || !s?.msgId) continue;
        const si = idxById.get(s.msgId);
        if (si == null || si < idx) continue;
        const mem = members.find((mb) => mb.device === dev);
        const nm = s?.name || mem?.name || 'Someone';
        if (!names.includes(nm)) names.push(nm);
      }
      return names;
    };
    const mine = feed.filter((m) => m.mine);
    if (mine.length === 0) return {};
    const out = {};
    const latest = mine[mine.length - 1];
    const latestNames = seenByIdx(idxById.get(latest.id));
    if (latestNames.length > 0) {
      out[latest.id] = { kind: 'seen', names: latestNames };
    } else {
      out[latest.id] = { kind: 'sent' };
      for (let i = mine.length - 2; i >= 0; i--) {
        const names = seenByIdx(idxById.get(mine[i].id));
        if (names.length > 0) {
          out[mine[i].id] = { kind: 'seen', names };
          break;
        }
      }
    }
    return out;
  })();

  // Host media swap search (settings tab): debounced, poster-only.
  // Empty query clears in the input handler (not here) so the effect
  // body never sets state synchronously.
  useEffect(() => {
    const q = swapQuery.trim();
    if (!q) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const res = await tmdb.searchMulti(q);
        if (!alive) return;
        setSwapResults(
          (res?.results || [])
            .filter((x) => !x.adult && x.poster_path && (x.title || x.name) && (x.media_type === 'movie' || x.media_type === 'tv'))
            .slice(0, 6)
        );
      } catch {
        if (alive) setSwapResults([]);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [swapQuery]);

  // Host media swap YouTube preview.
  useEffect(() => {
    const url = swapYt.trim();
    if (!url || !parseYouTubeId(url)) return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const meta = await fetchYouTubeMeta(url);
        if (alive) setSwapYtMeta(meta);
      } catch {
        // ignore — preview only
      }
    }, 500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [swapYt]);

  // Host-only: swap what's playing mid-room. Resets to 0:00, live.
  // queueNext carries the playlist along so followers adopt both in one
  // round trip (media event carries the queue with it).
  const doSwap = async (picked, queueNext = null) => {
    if (!isHost || swapBusy) return;
    setSwapBusy(true);
    try {
      const media =
        picked.kind === 'youtube'
          ? { kind: 'youtube', youtubeId: picked.youtubeId, title: picked.title, poster: picked.thumb }
          : {
              kind: 'tmdb',
              id: picked.id,
              type: picked.media_type || 'movie',
              title: picked.title || '',
              poster: picked.poster_path || '',
            };
      const server = picked.kind === 'youtube' ? 'youtube' : 'vidy';
      const title = picked.title || 'Room';
      // Keep-what-plays: the outgoing title joins the queue front (if not
      // already queued), so switching never loses it — rewatch later.
      const curMedia = roomRef.current?.media;
      const curPicked =
        curMedia?.kind === 'youtube' && curMedia?.youtubeId
          ? { kind: 'youtube', youtubeId: curMedia.youtubeId, title: curMedia.title, thumb: curMedia.poster }
          : curMedia?.kind !== 'youtube' && curMedia?.id
            ? { kind: 'tmdb', id: curMedia.id, media_type: curMedia.type || 'movie', title: curMedia.title, poster_path: curMedia.poster }
            : null;
      const baseQueue = queueNext || queue;
      let nextQueue = baseQueue;
      if (curPicked) {
        const curItem = makeQueueItem(curPicked, name);
        const incomingKey = keyOfMedia(media);
        if (curItem.key && curItem.key !== incomingKey && !baseQueue.some((q) => q.key === curItem.key)) {
          nextQueue = [curItem, ...baseQueue];
        }
      }
      const patch = { media, title, season: 1, episode: 1, server, position: 0, state: 'live', started: false };
      patch.queue = nextQueue;
      const row = await patchRoom(code, patch);
      if (row) setRoom(row);
      // Fresh title on this device too (pre-migration reload honesty).
      try {
        localStorage.setItem(`mz_unstarted_${code}`, '1');
      } catch {
        // ignore
      }
      if (nextQueue !== queue) setQueue(nextQueue);
      channelRef.current?.send('media', {
        device,
        name: name,
        media,
        title,
        server,
        queue: nextQueue,
      });
      adoptMedia(media, server, title, null);
      setSwapQuery('');
      setSwapYt('');
      onToast?.('Changed what\'s playing. Restarted at 0:00');
    } catch {
      onToast?.('Swap failed. Retry.');
    } finally {
      setSwapBusy(false);
    }
  };

  // Playlist mutations (host-only). Optimistic local apply + row persist
  // + live broadcast; failures toast (needs the `queue` column — see the
  // migration note — otherwise followers won't receive them).
  const persistQueue = async (next, notice) => {
    setQueue(next);
    try {
      const row = await patchRoom(code, { queue: next });
      if (row) setRoom(row);
    } catch {
      onToast?.('Playlist save failed. Run the rooms migration.');
    }
    channelRef.current?.send('queue', { device, name: name, queue: next, notice });
  };

  const queueAdd = (picked, playNow = false) => {
    if (!isHost || !picked) return;
    const item = makeQueueItem(picked, name);
    const exists = queue.some((q) => q.key === item.key);
    const next = exists ? queue : [...queue, item];
    if (playNow) {
      doSwap(picked, next);
      if (!exists) pushSys(`${name} added ${item.title} to the playlist`);
    } else {
      if (exists) {
        onToast?.('Already in the playlist');
        return;
      }
      persistQueue(next, `${name} added ${item.title} to the playlist`);
    }
  };

  const queueRemove = (key) => {
    if (!isHost) return;
    persistQueue(queue.filter((q) => q.key !== key));
  };

  const queueClearWatched = () => {
    if (!isHost) return;
    const cur = keyOfMedia(roomRef.current?.media);
    const idx = queue.findIndex((q) => q.key === cur);
    if (idx <= 0) return;
    persistQueue(queue.slice(idx));
  };

  const queuePlay = (key) => {
    if (!isHost) return;
    const item = queue.find((q) => q.key === key);
    if (item) doSwap(pickedOfItem(item), queue);
  };

  // Opening presence report (T14): newcomers read everyone's state
  // instantly instead of waiting for a first pause/seek. Above the early
  // returns by design — hooks can't move.
  useEffect(() => {
    if (!room) return;
    reportState({ watching: roomStarted, paused: room.state === 'paused' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.code]);

  if (!name) {
    return <NickGate onSave={(n) => setDeviceNick(n)} onLeave={onLeave} />;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)]">
        <p className="text-xs text-white/60">Joining room {code}…</p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)] p-6">
        <EmptyState
          title="Couldn't open room"
          description={error || 'Unknown error.'}
          action={
            <button onClick={onLeave} className="cine-control-btn">
              Back to rooms
            </button>
          }
        />
      </div>
    );
  }

  const isYouTube = room.media?.kind === 'youtube';
  const media = {
    id: room.media?.id,
    media_type: room.media?.type || 'movie',
    title: room.media?.title || room.title,
    name: room.media?.title || room.title,
    poster_path: room.media?.poster,
  };

  // Composer sends already-trimmed text + the shared reply target (T6).
  const sendChat = (text, reply = null) => {
    const clean = String(text || '').trim().slice(0, 500);
    if (!clean || chatMuted) return;
    const msg = {
      id: msgId(),
      device,
      name: name,
      text: clean,
      at: Date.now(),
      reply: reply
        ? { id: reply.id, name: reply.name, text: (reply.text || '').slice(0, 140), kind: reply.kind || 'text' }
        : null,
    };
    channelRef.current?.send('chat', { ...msg });
    pushMsg({ ...msg, mine: true });
    setInputCached('');
  };

  const sendGif = (url, preview) => {
    if (!url || chatMuted) return;
    const msg = { id: msgId(), device, name: name, kind: 'gif', url, preview, at: Date.now() };
    channelRef.current?.send('chat', { ...msg });
    pushMsg({ ...msg, mine: true });
  };

  // T13 session edit/delete (option A): live members converge; the sender
  // must be the author (host flag covers moderation deletes).
  const editMessage = (editId, text) => {
    const clean = String(text || '').trim().slice(0, 500);
    if (!clean) return;
    channelRef.current?.send('edit', { msgId: editId, text: clean, device, name: name });
    applyEdit(editId, clean, device);
  };

  const deleteMessage = (delId) => {
    channelRef.current?.send('del', { msgId: delId, device, name: name, host: isHost });
    applyDelete(delId, device, isHost);
  };

  // T15 crown + remove (control/chat grant pills are gone — see below).
  // Remove is a directed broadcast: the target's own client leaves.
  const kickMember = (memberDevice, memberName) => {
    if (!memberDevice || memberDevice === device) return;
    channelRef.current?.send('kick', { device, name: name, target: memberDevice });
    onToast?.(`Removed ${memberName} from the room`);
  };

  const broadcastPause = async () => {
    const second = Math.floor(myPos.current.second || 0);
    // Pause is the one event that must not be lost: a follower who misses
    // it plays on. Triple-send (idempotent) + presence resend for late
    // joiners + row-state poll healing on the follower side. Retries die
    // the moment play/seek goes out — a stale retry must never re-pause
    // after a resume.
    clearPauseRetries();
    // pausedBy on the pauser too (all media kinds): it swaps Pause for
    // Resume in this header. Without it the host pauses the room and is
    // left staring at a Pause button with no way back.
    pausedByDeviceRef.current = device;
    setPausedByDevice(device);
    setPausedBy(name);
    pushSys(`${name} stopped the player`);
    // Own frozen clock too (N2): my status line reads the pause second,
    // not a stale tick.
    setHostPos({ second, at: Date.now(), season: undefined, episode: undefined });
    reportState({ paused: true, watching: true });
    const payload = { device, name: name, second, at: Date.now() };
    channelRef.current?.send('pause', payload);
    for (const delay of [700, 1400]) {
      pauseRetryRef.current.push(
        setTimeout(() => channelRef.current?.send('pause', { ...payload, at: Date.now() }), delay)
      );
    }
    frozenPosRef.current = { ...myPos.current, second };
    if (room?.media?.kind === 'youtube') {
      // True remote pause for our own frame as well.
      setRoomTarget({ key: `me:${Date.now()}`, action: 'pause', second });
    }
    try {
      await patchRoom(code, { state: 'paused', position: Math.floor(myPos.current.second || 0) });
    } catch {
      // broadcast already told the room
    }
  };

  // Follower's manual sync: jump to the host's stamped second RIGHT NOW
  // — always, even when the room is paused. Paused stays paused (the
  // overlay holds; embeds have no frame to move while parked, YouTube
  // seeks in place), live follows and plays on. This is the ONLY thing
  // that moves a follower's player, so it can never loop or surprise.
  const syncToHost = async () => {
    try {
      const r = await fetchRoom(code);
      if (!r) {
        onToast?.('Room not found.');
        return;
      }
      setRoom(r);
      const paused = r.state === 'paused';
      const targetSecond = Math.max(0, r.position || 0);
      setSyncNote('Catching up…');
      followGraceRef.current = Date.now();
      followAppliedRef.current = Date.now();
      if (!isYouTube && paused) {
        // Parked embed: no iframe to move — remember the host second so
        // the resume lands together. The overlay stays until resume.
        myPos.current = { ...myPos.current, second: targetSecond };
      }
      setRoomTarget({
        key: `manual:${Date.now()}`,
        second: targetSecond,
        season: r.season,
        episode: r.episode,
        server: r.server,
      });
      onToast?.(
        targetSecond > 2
          ? `Synced to ${formatClock(targetSecond)}${paused ? '. Resumes with host' : ''}`
          : 'Host is at the start. Synced to 0:00'
      );
      setTimeout(() => setSyncNote('In sync'), 3000);
    } catch {
          onToast?.('Sync failed. Retry.');
    }
  };

  const broadcastPlay = async () => {
    const second = Math.floor(myPos.current.second || 0);
    // Driving means started (T1) — Sync-all doubles as the opener.
    markStarted(second, myPos.current.season, myPos.current.episode, myPos.current.server);
    channelRef.current?.send('play', {
      device, name: name, second, at: Date.now(), force: true,
    });
    setPausedBy(null);
    setPausedByDevice(null);
    pausedByDeviceRef.current = null;
    reportState({ paused: false, watching: true, pos: second });
    // Resume remounts suspended followers at the frozen second — and resets
    // my clock so no phantom "seek" fires on the way back up. (My own frame
    // was never unmounted: the pauser keeps their player, so no reload and
    // no blank time on my side — embeds skip self roomTarget entirely.)
    const isYt = room?.media?.kind === 'youtube';
    if (isYt) {
      setRoomTarget({ key: `me:${Date.now()}`, action: 'play', second });
    }
    followGraceRef.current = Date.now();
    followAppliedRef.current = Date.now();
    frozenPosRef.current = null;
    clearPauseRetries();
    try {
      await patchRoom(code, { state: 'live', position: second });
    } catch {
      // ignore
    }
  };

  // Auto-pause from an unlocked local player: pausing inside the video
  // (embed pause event or YouTube state) locks the whole room — this is
  // what retires the manual Pause button on event-capable servers.
  // Idempotent via pausedByRef: double events can't double-lock.
  // Followers get one exemption: right after THEY were moved (manual
  // sync / host seek), YouTube blinks PAUSED on the way to the new
  // second — that blink is travel, not intent, and must never lock the
  // room ("paused" while everyone is watching). Hosts are unaffected.
  const handleProviderPause = () => {
    if (!canControlRef.current && Date.now() - followAppliedRef.current < 5000) return;
    if (!pausedByRef.current) broadcastPause();
  };
  // ...and only the pauser's own resume re-opens it (a load/seek 'play'
  // blip from anyone else must never unlock the room). A real play from
  // un-started also opens the room (T1).
  const handleProviderPlay = () => {
    if (!startedRef.current && canControlRef.current) {
      markStarted(myPos.current.second || 0, myPos.current.season, myPos.current.episode, myPos.current.server);
    }
    if (pausedByDeviceRef.current === device) broadcastPlay();
  };

  const transferHost = async (memberDevice, memberName) => {
    try {
      await patchRoom(code, { host_device: memberDevice, state: 'live' });
      channelRef.current?.send('host', { device, name: name, host_device: memberDevice });
      const r = await fetchRoom(code);
      if (r) setRoom(r);
      onToast?.(`${memberName} is now hosting`);
    } catch {
              onToast?.('Transfer failed. Retry.');
    }
  };

  const takeOver = async () => {
    try {
      await patchRoom(code, { host_device: device, state: 'live' });
      channelRef.current?.send('host', { device, name: name, host_device: device });
      const r = await fetchRoom(code);
      if (r) setRoom(r);
      pushSys('You took over hosting');
    } catch {
                onToast?.('Takeover failed. Retry.');
    }
  };

  const handleLeave = async (deleteIfHost = false) => {
    if (isHost && !deleteIfHost) {
      try {
        await patchRoom(code, { state: 'paused' });
      } catch {
        // best effort
      }
    }
    if (isHost && deleteIfHost) {
      try {
        await deleteRoom(code);
      } catch {
        // best effort
      }
    }
    try {
      await channelRef.current?.close();
    } catch {
      // ignore
    }
    onLeave();
  };
  leaveRef.current = () => handleLeave(false);

  // (waitingForHost is debounced above, next to hostPresent)
  // Single status line (T1/N2): not-started is explicit, and a pause
  // carries the frozen host second — "Paused by host • 0:38". The live
  // clock below only runs while playing (never alongside the pause time).
  const statusText = !roomStarted
    ? (canControl ? 'Press play to start' : 'Waiting to start')
    : pausedBy
      ? `Paused by ${pausedBy}${hostPos ? ` • ${formatClock(hostPos.second)}` : ''}`
      : waitingForHost && !canControl
        ? 'Waiting for host'
        : syncNote;
  const hostClock = !canControl && !pausedBy && hostPos && roomStarted ? ` • Host ${formatClock(hostPos.second)}` : '';

  // Playlist derivation: the room's current media splits the queue into
  // watched (before), now (match), up next (after). Titles played outside
  // the queue simply show no match — list still renders.
  const currentKey = keyOfMedia(room?.media);
  const curIdx = queue.findIndex((q) => q.key === currentKey);
  const watchedItems = curIdx > 0 ? queue.slice(0, curIdx) : [];
  const upNextItems = curIdx >= 0 ? queue.slice(curIdx + 1) : [...queue];
  const thumbFor = (item) =>
    item.kind === 'youtube'
      ? item.poster || FALLBACK_POSTER
      : item.poster
        ? tmdb.getImageUrl(item.poster, 'w185')
        : FALLBACK_POSTER;
  // Hard lock (embed rooms): while paused, everyone EXCEPT the pauser loses
  // the iframe — the pauser paused their own video, so their frame stays
  // exactly where it stopped: no reload, no blank time on resume for them.
  // Followers keep the old deal (unmount/remount — providers take no remote
  // orders, so there is no other way to stop them). A paused room shows
  // paused cards, not video; resume remounts held frames at the frozen
  // second. Unmounting is the only true pause these providers allow (they
  // take no remote orders). The pauser is held too — including the host:
  // pausing must stop your own player or you'll forget the room is held.
  // Not-started followers (T1) park the same way: no 0:00 black VidLink,
  // no phantom clock — their player loads when the host presses play.
  const suspended =
    !isYouTube && (!!pausedBy || waitingForHost || (!roomStarted && !canControl));
  // YouTube pauses for real via the command API — no overlay needed.
  // Explicit holds: the pauser sees "Paused by you", everyone else sees
  // who held them; waiting rooms and not-started followers see a card,
  // never a black 0:00.
  const iPausedIt = pausedBy && pausedByDevice && pausedByDevice === device;
  const overlay = !isYouTube && pausedBy && !canControl ? (
    <div className="text-center space-y-3 max-w-xs">
      <p className="text-sm font-bold text-white">Paused by {pausedBy}</p>
      <p className="text-xs text-white/60">Your player is held here. Press play when the room resumes and you'll re-sync automatically.</p>
    </div>
  ) : !isYouTube && iPausedIt ? (
    <div className="text-center space-y-3 max-w-xs">
      <p className="text-sm font-bold text-white">Paused by you</p>
      <p className="text-xs text-white/60">Everyone is held here, including you. Resume when ready and the room follows.</p>
    </div>
  ) : !isYouTube && !roomStarted && !canControl ? (
    <div className="text-center space-y-3 max-w-xs">
      <p className="text-sm font-bold text-white">The host hasn't started yet</p>
      <p className="text-xs text-white/60">Your player loads automatically the moment they press play.</p>
    </div>
  ) : waitingForHost ? (
    <div className="text-center space-y-3 max-w-xs">
      <p className="text-sm font-bold text-white">Waiting for host…</p>
      <p className="text-xs text-white/60">The room is paused until the host returns or hands over control.</p>
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-[var(--cine-bg-deep)] flex flex-col md:flex-row text-white">
      {/* Video column */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="flex items-center gap-2 px-4 md:px-6 py-3 border-b border-[var(--cine-glass-border)] flex-shrink-0 overflow-x-auto md:overflow-visible no-scrollbar">
          <button onClick={() => handleLeave(false)} className="cine-icon-btn cine-icon-btn--sm flex-shrink-0"  aria-label="Leave room">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold truncate">{room.title}</h2>
            <p className="text-[11px] text-white/60">
              {members.length} watching • {statusText}
              {hostClock}
              {room.state === 'paused' && !pausedBy ? ' • paused' : ''}
            </p>
          </div>
          {/* Invite (B5): hover/tap opens copy choices — full link or the
              code alone. The menu labels carry the meaning, so no tip here. */}
          <div
            className="relative"
            onMouseEnter={() => setInviteOpen(true)}
            onMouseLeave={() => setInviteOpen(false)}
          >
            <button
              onClick={() => {
                try {
                  navigator.clipboard?.writeText(roomLink(room.code));
                  onToast?.('Invite link copied. Anyone opening it joins directly');
                } catch {
                  // ignore
                }
              }}
              onFocus={() => setInviteOpen(true)}
              onBlur={() => setInviteOpen(false)}
              className="cine-chip cine-chip--accent cursor-pointer"
              aria-label="Copy invite link"
              aria-expanded={inviteOpen}
            >
              <Copy className="w-3 h-3" />
              {room.code}
            </button>
            {inviteOpen && (
              // Hover bridge (pt-2): the wrapper's padding carries the
              // cursor from chip to menu with no dead gap that would close
              // it mid-travel.
              <div className="absolute top-full right-0 z-50 w-52 pt-2">
              <div
                role="menu"
                aria-label="Copy invite"
                className="rounded-2xl cine-glass-panel p-1.5 space-y-0.5"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(roomLink(room.code));
                      onToast?.('Invite link copied. Anyone opening it joins directly');
                    } catch {
                      // ignore
                    }
                    setInviteOpen(false);
                  }}
                  className="mat-row w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white">Copy invite link</span>
                    <span className="block text-[10px] text-white/50 truncate">{roomLink(room.code)}</span>
                  </span>
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(room.code);
                      onToast?.(`Room code ${room.code} copied`);
                    } catch {
                      // ignore
                    }
                    setInviteOpen(false);
                  }}
                  className="mat-row w-full flex items-center gap-2.5 px-3 py-2 text-left cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5 text-white/60 flex-shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-white">Copy code only</span>
                    <span className="block text-[10px] text-white/50">{room.code}</span>
                  </span>
                </button>
              </div>
              </div>
            )}
          </div>
          {canControl && (
            <button
              onClick={() => setPlaylistOpen((o) => !o)}
              className="cine-control-btn h-9 px-4 text-xs relative flex-shrink-0 cine-has-tip"

              aria-label="Open room playlist"
              aria-expanded={playlistOpen}
            >
              <ListMusic className="w-3.5 h-3.5" /> Playlist
              <span className="cine-tip cine-tip--below cine-tip--top" aria-hidden="true">Room playlist</span>
              {queue.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                  {queue.length > 9 ? '9+' : queue.length}
                </span>
              )}
            </button>
          )}
          {!canControl && (
            <button
              onClick={() => setPlaylistOpen((o) => !o)}
              className="cine-icon-btn flex-shrink-0"

              aria-label="Open room playlist"
              aria-expanded={playlistOpen}
            >
              <ListMusic className="w-4 h-4" />
            </button>
          )}
          {canControl && (
            <button
              onClick={() => {
                broadcastPlay();
                onToast?.('Room synced to your position');
              }}
              className="cine-control-btn h-9 px-4 text-xs min-w-[132px] flex-shrink-0 cine-has-tip"
              aria-label="Pull everyone to your second right now"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync all
              <span className="cine-tip cine-tip--below cine-tip--top" aria-hidden="true">Pull everyone to your second</span>
            </button>
          )}
          {/* N2 manual hold (host only): provider pause events don't always
              arrive, so the host gets a deterministic Pause/Resume. Either
              path freezes the room instantly with the second attached.
              Followers never see this control. Always rendered (even
              pre-start — pausing then simply holds the room at 0:00), so
              the slot never sits empty. */}
          {canControl && !pausedBy && (
            <button
              onClick={() => broadcastPause()}
              className="cine-icon-btn flex-shrink-0 cine-has-tip"

              aria-label="Pause the room for everyone"
            >
              <Pause className="w-4 h-4" />
              <span className="cine-tip cine-tip--below cine-tip--top" aria-hidden="true">Pause for everyone</span>
            </button>
          )}
          {canControl && pausedBy && (
            <button
              onClick={() => broadcastPlay()}
              className="cine-icon-btn flex-shrink-0 cine-has-tip"

              aria-label="Resume the room for everyone"
            >
              <Play className="w-4 h-4" fill="currentColor" />
              <span className="cine-tip cine-tip--below cine-tip--top" aria-hidden="true">Resume for everyone</span>
            </button>
          )}
          {!canControl && (
            <button
              onClick={syncToHost}
              className="cine-control-btn h-9 px-4 text-xs min-w-[132px] flex-shrink-0 cine-has-tip"
              aria-label={hostPos ? `Jump to the host's ${formatClock(hostPos.second)} right now` : "Jump to the host's second right now"}
            >
              <RefreshCw className="w-3.5 h-3.5" /> Sync{hostPos ? ` ${formatClock(hostPos.second)}` : ''}
              <span className="cine-tip cine-tip--below cine-tip--top" aria-hidden="true">Jump to the host's second</span>
            </button>
          )}
          {/* T16 hide-chat sits absolute last: invite, playlist, sync, hold,
              then this. Speech balloon, not an eye — it toggles the chat
              panel, not visibility. */}
          <button
            onClick={() => setChatHidden((h) => !h)}
            className="cine-icon-btn flex-shrink-0 cine-has-tip"

            aria-label={chatHidden ? 'Show room chat' : 'Hide room chat'}
            aria-pressed={chatHidden}
          >
            {chatHidden ? <MessageCircle className="w-4 h-4" /> : <MessageCircleOff className="w-4 h-4" />}
            <span className="cine-tip cine-tip--below cine-tip--top" aria-hidden="true">
              {chatHidden ? 'Show room chat' : 'Hide room chat'}
            </span>
          </button>
        </div>

        <div className="h-[42vh] md:h-auto md:flex-1 md:min-h-0 flex-shrink-0 md:flex-shrink relative">
          {isYouTube && room.media?.youtubeId ? (
            <div ref={ytWrapRef} className="relative w-full h-full bg-black">
              <YouTubeRoomPlayer
                key={`room_${room.code}_youtube_${room.media.youtubeId}`}
                videoId={room.media.youtubeId}
                roomTarget={(waitingForHost && !canControl) || (!roomStarted && !canControl) ? { key: 'hold', action: 'pause' } : roomTarget}
                onPosition={handlePosition}
                onPause={canControl ? handleProviderPause : null}
                onPlay={canControl ? handleProviderPlay : null}
              />
              {/* Our chrome survives OUR fullscreen (not YouTube's own
                  button, which would hide the chat). Offset below
                  YouTube's top bar so we never cover its settings. */}
              <div className="absolute top-14 right-3 z-30 flex items-center gap-2">
                <button
                  onClick={() => setChatOpen((o) => !o)}
                  className="cine-icon-btn relative"
                  
                  aria-label="Toggle room chat"
                >
                  <MessageCircle className="w-4 h-4" />
                  {unread > 0 && !chatOpen && (
                    <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                </button>
                <button
                  onClick={toggleYtFs}
                  className="cine-icon-btn"
                  
                  aria-label="Toggle fullscreen"
                >
                  <Maximize className="w-4 h-4" />
                </button>
              </div>
              {waitingForHost && !canControl && (
                <div className="absolute inset-0 z-10 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
                  <div className="text-center space-y-3 max-w-xs">
                    <p className="text-sm font-bold text-white">Waiting for host…</p>
                    <p className="text-xs text-white/60">The room is paused until the host returns or hands over control.</p>
                  </div>
                </div>
              )}
              <FloatingRoomChat
                open={chatOpen}
                onToggle={() => setChatOpen((o) => !o)}
                messages={messages}
                reactions={reactions}
                myDevice={device}
                isHost={isHost}
                nickname={name}
                input={input}
                setInput={setInputCached}
                muted={chatMuted}
                onSend={sendChat}
                onSendGif={sendGif}
                onToggleReact={toggleReact}
                receipts={receipts}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                onEdit={editMessage}
                onDeleteRequest={(id) => setPendingDelete(id)}
              />
            </div>
          ) : media.id ? (
            <Player
              key={`room_${room.code}_${media.media_type || 'media'}_${media.id}`}
              media={media}
              details={details}
              onClose={() => handleLeave(false)}
              onPosition={handlePosition}
              roomTarget={roomTarget}
              roomOverlay={overlay}
              roomLocked={!canControl}
              suspended={suspended}
              framed
              onProviderPause={canControl ? handleProviderPause : null}
              onProviderPlay={canControl ? handleProviderPlay : null}
              chat={{
                unread,
                open: chatOpen,
                onToggle: () => setChatOpen((o) => !o),
                messages,
                reactions,
                myDevice: device,
                isHost,
                nickname: name,
                input,
                setInput: setInputCached,
                muted: chatMuted,
                onSend: sendChat,
                onSendGif: sendGif,
                onToggleReact: toggleReact,
                receipts,
                replyTo,
                setReplyTo,
                onEdit: editMessage,
                onDeleteRequest: (id) => setPendingDelete(id),
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center p-6">
              <EmptyState
                title="No title attached"
                description="This room was created without a title. Open any title and use Watch together."
                action={
                  <button onClick={() => handleLeave(false)} className="cine-control-btn">
                    Back to rooms
                  </button>
                }
              />
            </div>
          )}
          {/* T16 collapsed-rail reopen: floats over the video corner. */}
          {chatHidden && (
            <button
              onClick={() => {
                setChatHidden(false);
                setUnread(0);
              }}
              className="cine-control-btn h-9 px-4 text-xs absolute bottom-4 right-4 z-30"
              aria-label="Show room chat"
            >
              <MessageCircle className="w-3.5 h-3.5" /> Chat
              {unread > 0 && (
                <span className="min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black inline-flex items-center justify-center">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Side rail — solid by design (B1): the poster wash behind chat
          text looked awful on bright art. Content stays opaque; glass
          lives on the controls. Collapsed by the hide-chat toggle. */}
      {!chatHidden && (
      <aside className="relative overflow-hidden flex-1 min-h-0 md:flex-none md:w-[380px] border-t md:border-t-0 md:border-l border-[var(--cine-glass-border)] bg-[var(--cine-panel-dark)] backdrop-blur-2xl flex flex-col">
        <div className="flex items-center gap-2 p-3 border-b border-[var(--cine-glass-border)] flex-shrink-0" role="tablist" aria-label="Room panels">
          <button
            onClick={() => setTab('chat')}
            role="tab"
            aria-selected={tab === 'chat'}
            className={`cine-pill relative flex-1 ${tab === 'chat' ? 'cine-pill--active' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <MessageCircle className="w-3.5 h-3.5" /> Chat
            </span>
            {unread > 0 && tab !== 'chat' && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--cine-accent)] text-black text-[10px] font-black flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('people')}
            role="tab"
            aria-selected={tab === 'people'}
            className={`cine-pill flex-1 ${tab === 'people' ? 'cine-pill--active' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> People ({members.length})
            </span>
          </button>
          <button
            onClick={() => setTab('settings')}
            role="tab"
            aria-selected={tab === 'settings'}
            className={`cine-pill flex-1 ${tab === 'settings' ? 'cine-pill--active' : ''}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> Settings
            </span>
          </button>
        </div>

        {/* Chat stays mounted across tabs (T12): hiding (not unmounting)
            keeps the scroll exactly where you left it. */}
        <div className={`flex-1 min-h-0 flex-col ${tab === 'chat' ? 'flex' : 'hidden'}`}>
          <ChatView
            messages={messages}
            reactions={reactions}
            myDevice={device}
            isHost={isHost}
            nickname={name}
            input={input}
            setInput={setInputCached}
            muted={chatMuted}
            onSend={sendChat}
            onSendGif={sendGif}
            onToggleReact={toggleReact}
            receipts={receipts}
            replyTo={replyTo}
            setReplyTo={setReplyTo}
            onEdit={editMessage}
            onDeleteRequest={(id) => setPendingDelete(id)}
          />
        </div>
        {tab === 'settings' ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
            <div className="mat-row p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-white/50 mb-1">Now playing</p>
              <p className="text-sm font-semibold text-white/90 truncate">{room.title}</p>
              <p className="text-[11px] text-white/50 mt-0.5">
                {room.media?.kind === 'youtube' ? 'YouTube' : `${room.media?.type === 'tv' ? 'Show' : 'Movie'} • ${room.server || 'vidy'}`}
              </p>
            </div>
            {/* Chat size — per-device pref, applies instantly */}
            <div className="mat-row p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white/90">Chat text size</p>
                <p className="text-[11px] tabular-nums text-white/50">{chatSize}px</p>
              </div>
              <input
                type="range"
                min={13}
                max={19}
                step={1}
                value={chatSize}
                onChange={(e) => changeChatSize(Number(e.target.value))}
                aria-label="Chat text size"
                className="w-full cine-range"
              />
              <div className="flex items-center gap-2">
                <span className="msg-text block px-3.5 py-2 rounded-2xl leading-[1.45] bg-white text-black w-fit">
                  Hello there
                </span>
                <span className="cine-react cine-react--mine" aria-hidden="true">👍 1</span>
              </div>
            </div>
            {/* Notifications (B9): master, then sound + in-chat + volume. */}
            <div className="mat-row p-3 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white/90">Message notifications</p>
                <div className="flex gap-1.5" role="group" aria-label="Message notifications">
                  {[
                    { id: true, name: 'On' },
                    { id: false, name: 'Off' },
                  ].map((o) => (
                    <button
                      key={o.name}
                      onClick={() => {
                        setNotifEnabled(o.id);
                        setNotif((n) => ({ ...n, on: o.id }));
                      }}
                      aria-pressed={notif.on === o.id}
                      className={`cine-pill cine-pill--sm ${notif.on === o.id ? 'cine-pill--active' : ''}`}
                    >
                      {o.name}
                    </button>
                  ))}
                </div>
              </div>
              {notif.on && (
                <>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Notification sound">
                    {NOTIF_SOUNDS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          setSoundPref(s.id);
                          setNotif((n) => ({ ...n, sound: s.id }));
                        }}
                        aria-pressed={notif.sound === s.id}
                        className={`cine-pill cine-pill--sm ${notif.sound === s.id ? 'cine-pill--active' : ''}`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="text-xs text-white/60 flex-1">Loudness</p>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={notif.vol}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolume(v);
                        setNotif((n) => ({ ...n, vol: v }));
                      }}
                      onMouseUp={() => playNotifyTone(notif.sound, notif.vol / 100)}
                      onTouchEnd={() => playNotifyTone(notif.sound, notif.vol / 100)}
                      aria-label="Notification loudness"
                      className="w-32 cine-range"
                    />
                    <p className="text-[11px] tabular-nums text-white/50 w-9 text-right">{notif.vol}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-white/60">Notify while I'm looking at the chat</p>
                    <div className="flex gap-1.5" role="group" aria-label="Notify while in chat">
                      {[
                        { id: true, name: 'On' },
                        { id: false, name: 'Off' },
                      ].map((o) => (
                        <button
                          key={o.name}
                          onClick={() => {
                            setInChat(o.id);
                            setNotif((n) => ({ ...n, inChat: o.id }));
                          }}
                          aria-pressed={notif.inChat === o.id}
                          className={`cine-pill cine-pill--sm ${notif.inChat === o.id ? 'cine-pill--active' : ''}`}
                        >
                          {o.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            {/* Invite: the code chip lives in the header — here is the
                full link with room to explain it. Playlist owns media
                changes (header button). */}
            <div className="mat-row p-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white/90">Invite friends</p>
                <p className="text-[11px] text-white/50 truncate mt-0.5">
                  Anyone opening the link joins {room.code} directly
                </p>
              </div>
              <button
                onClick={() => {
                  try {
                    navigator.clipboard?.writeText(roomLink(room.code));
                    onToast?.('Invite link copied. Anyone opening it joins directly');
                  } catch {
                    // ignore
                  }
                }}
                className="cine-pill cine-pill--sm flex-shrink-0"
                aria-label="Copy invite link"
              >
                <Copy className="w-3 h-3" /> Copy link
              </button>
            </div>
          </div>
        ) : tab === 'people' ? (
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {hostGone && (
              <div className="mat-row p-3 text-center space-y-2">
                <p className="text-xs text-white/60">Host is away. The room is paused.</p>
                {canControl && (
                  <button onClick={takeOver} className="cine-control-btn h-9 px-4 text-xs w-full">
                    <Crown className="w-3.5 h-3.5" /> Take over hosting
                  </button>
                )}
              </div>
            )}
            {members.map((m) => {
              const memberIsHost = m.device === room.hostDevice;
              // Playback state of that device (T14): the host reads here
              // whether everyone is actually with them.
              const stateText = !roomStarted
                ? (memberIsHost ? "Hasn't started" : 'Waiting to start')
                : m.watching === false
                  ? 'Not started'
                  : m.paused
                    ? `Paused • ${formatClock(m.pos || 0)}`
                    : m.pos != null && m.pos > 0
                      ? `Watching • ${formatClock(m.pos)}`
                      : 'In the room';
              return (
                <div
                  key={m.device}
                  className="mat-row flex items-center gap-3 p-2.5"
                  style={
                    memberIsHost
                      ? { background: 'color-mix(in srgb, var(--cine-accent) 7%, transparent)' }
                      : undefined
                  }
                >
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-black flex-shrink-0"
                    style={{
                      backgroundColor: nameColor(m.name),
                      boxShadow: memberIsHost
                        ? '0 0 0 2px var(--cine-accent)'
                        : '0 0 0 2px rgba(255, 255, 255, 0.15)',
                    }}
                  >
                    {(m.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white truncate">
                      {m.name}
                      {m.device === device && <span className="text-white/40 font-medium"> (you)</span>}
                    </p>
                    <p className="text-[10px] text-white/50 truncate">
                      {memberIsHost ? `Host • ${stateText}` : stateText}
                    </p>
                  </div>
                  {memberIsHost && <Crown className="w-3.5 h-3.5 text-[var(--cine-accent)] flex-shrink-0" />}
                  {/* T15: no more Control/Chat grant pills — the host crowns
                      (transfer) or removes. Grants stay readable for old
                      rows, but nothing sets them anymore. */}
                  {isHost && !memberIsHost && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => setPendingHost({ device: m.device, name: m.name })}
                        className="cine-pill cine-pill--sm"
                        aria-label={`Make ${m.name} the host (you step down)`}
                      >
                        <Crown className="w-3 h-3" /> Host
                      </button>
                      <button
                        onClick={() => setPendingKick({ device: m.device, name: m.name })}
                        className="cine-icon-btn cine-icon-btn--sm"
                        aria-label={`Remove ${m.name} from the room`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {isHost && (
              <button
                onClick={() => {
                  if (confirm(`Delete room ${room.code} for everyone?`)) handleLeave(true);
                }}
                className="w-full h-9 rounded-full text-xs font-bold text-red-400/80 hover:text-red-400 border border-red-500/20 hover:border-red-500/40 transition cursor-pointer inline-flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete room
              </button>
            )}
            <button
              onClick={() => handleLeave(false)}
              className="w-full h-9 rounded-full text-xs font-bold text-white/60 hover:text-white border border-white/10 transition cursor-pointer inline-flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" /> Leave room
            </button>
          </div>
        ) : null}
      </aside>
      )}

      {/* Confirm sheet (B8/B10): delete-for-everyone, crowning, kicking —
          all destructive-ish, all ask first. One white primary, glass out. */}
      <Modal
        isOpen={Boolean(pendingDelete || pendingHost || pendingKick)}
        onClose={() => {
          setPendingDelete(null);
          setPendingHost(null);
          setPendingKick(null);
        }}
        maxWidth="max-w-sm"
        label="Confirm"
      >
        <div className="p-6 sm:p-8 space-y-5 text-center">
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">
              {pendingDelete
                ? 'Delete this message for everyone?'
                : pendingHost
                  ? `Make ${pendingHost.name} the host?`
                  : pendingKick
                    ? `Remove ${pendingKick.name} from the room?`
                    : ''}
            </h2>
            <p className="text-xs text-white/60 mt-1">
              {pendingDelete
                ? 'Everyone in the room loses it. This cannot be undone.'
                : pendingHost
                  ? 'You step down to watcher.'
                  : 'They leave immediately.'}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setPendingDelete(null);
                setPendingHost(null);
                setPendingKick(null);
              }}
              className="cine-control-btn flex-1"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (pendingDelete) deleteMessage(pendingDelete);
                else if (pendingHost) transferHost(pendingHost.device, pendingHost.name);
                else if (pendingKick) kickMember(pendingKick.device, pendingKick.name);
                setPendingDelete(null);
                setPendingHost(null);
                setPendingKick(null);
              }}
              className="cine-btn cine-btn-white h-11 px-6 text-sm flex-1"
            >
              {pendingDelete ? 'Delete' : pendingHost ? 'Make host' : 'Remove'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Playlist drawer: the room's queue — watched, now, up next.
          Everyone sees it; only the host edits. Slides over the rail. */}
      {playlistOpen && (
        <div
          role="dialog"
          aria-label="Room playlist"
          className="absolute inset-y-0 right-0 w-[380px] max-w-[94vw] z-40 flex flex-col cine-glass-panel border-l border-[var(--cine-glass-border)] animate-in fade-in slide-in-from-right-4 duration-200"
        >
          <div className="flex items-center gap-2.5 p-3 border-b border-[var(--cine-glass-border)] flex-shrink-0">
            <div className="cine-disc w-9 h-9">
              <ListMusic className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-white tracking-tight">Playlist</h3>
              <p className="text-[11px] text-white/60">
                {queue.length === 0 ? 'Nothing queued yet' : `${queue.length} title${queue.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <button
              onClick={() => setPlaylistOpen(false)}
              className="cine-icon-btn cine-icon-btn--sm"
              
              aria-label="Close playlist"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
            {/* Now playing */}
            <div
              className="mat-row p-2.5 flex items-center gap-3"
              style={{ borderColor: 'color-mix(in srgb, var(--cine-accent) 45%, transparent)' }}
            >
              <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                <img
                  src={
                    room.media?.kind === 'youtube'
                      ? room.media?.poster || FALLBACK_POSTER
                      : room.media?.poster
                        ? tmdb.getImageUrl(room.media.poster, 'w185')
                        : FALLBACK_POSTER
                  }
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--cine-accent)]">Now playing</p>
                <p className="text-xs font-bold text-white truncate mt-0.5">{room.title}</p>
              </div>
              {pausedBy ? (
                <Pause className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" />
              ) : (
                <Play className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" fill="currentColor" />
              )}
            </div>

            {/* Up next */}
            {upNextItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Up next</p>
                {upNextItems.map((item) => (
                  <div key={item.key} className="mat-row p-2 flex items-center gap-2.5">
                    <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                      <img src={thumbFor(item)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white/90 truncate">{item.title}</p>
                      <p className="text-[10px] text-white/50 mt-0.5 truncate">
                        {item.kind === 'youtube' ? 'YouTube' : item.type === 'tv' ? 'Show' : 'Movie'}
                        {item.by ? ` • ${item.by}` : ''}
                      </p>
                    </div>
                    {isHost && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => queuePlay(item.key)}
                          disabled={swapBusy}
                          className="cine-icon-btn cine-icon-btn--sm cine-has-tip"

                          aria-label={`Play ${item.title} now`}
                        >
                          <Play className="w-3.5 h-3.5" fill="currentColor" />
                          <span className="cine-tip" aria-hidden="true">Play now</span>
                        </button>
                        <button
                          onClick={() => queueRemove(item.key)}
                          className="cine-icon-btn cine-icon-btn--sm"
                          
                          aria-label={`Remove ${item.title} from playlist`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Watched */}
            {watchedItems.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Watched here</p>
                  {isHost && (
                    <button
                      onClick={queueClearWatched}
                      className="text-[11px] font-semibold text-white/50 hover:text-white transition cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {watchedItems.map((item) => (
                  <div key={item.key} className="mat-row p-2 flex items-center gap-2.5 opacity-60">
                    <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                      <img src={thumbFor(item)} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white/80 truncate">{item.title}</p>
                      <p className="text-[10px] text-white/40 mt-0.5 truncate">
                        {item.kind === 'youtube' ? 'YouTube' : item.type === 'tv' ? 'Show' : 'Movie'}
                        {item.by ? ` • ${item.by}` : ''}
                      </p>
                    </div>
                    <Check className="w-4 h-4 text-[var(--cine-accent)] flex-shrink-0" />
                    {isHost && (
                      <button
                        onClick={() => queueRemove(item.key)}
                        className="cine-icon-btn cine-icon-btn--sm flex-shrink-0"
                        
                        aria-label={`Remove ${item.title} from playlist`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Add — host only */}
            {isHost ? (
              <div className="space-y-2.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Add to playlist</p>
                <div className="flex items-center gap-3 rounded-2xl cine-glass-panel px-4 py-3 focus-within:border-white/25 transition">
                  <Search className="w-4 h-4 text-white/60 flex-shrink-0" />
                  <input
                    type="text"
                    value={swapQuery}
                    onChange={(e) => {
                      setSwapQuery(e.target.value);
                      if (!e.target.value.trim()) setSwapResults([]);
                    }}
                    placeholder="Search a movie or show…"
                    aria-label="Search a title for the playlist"
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                  />
                </div>
                {swapResults.length > 0 && (
                  <div className="space-y-2">
                    {swapResults.map((r) => (
                      <div key={`${r.media_type}_${r.id}`} className="mat-row p-2 flex items-center gap-2.5">
                        <div className="w-10 h-14 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                          <img src={tmdb.getImageUrl(r.poster_path, 'w185')} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-white/90 truncate">{r.title || r.name}</p>
                          <p className="text-[10px] text-white/50 uppercase mt-0.5">
                            {(r.media_type || '')} • {((r.release_date || r.first_air_date) || '').split('-')[0]}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() =>
                              queueAdd({ kind: 'tmdb', id: r.id, media_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path })
                            }
                            disabled={swapBusy}
                            className="cine-icon-btn cine-icon-btn--sm cine-has-tip"

                            aria-label={`Add ${r.title || r.name} to playlist`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span className="cine-tip" aria-hidden="true">Add to playlist</span>
                          </button>
                          <button
                            onClick={() =>
                              queueAdd({ kind: 'tmdb', id: r.id, media_type: r.media_type, title: r.title || r.name, poster_path: r.poster_path }, true)
                            }
                            disabled={swapBusy}
                            className="cine-icon-btn cine-icon-btn--sm cine-has-tip"

                            aria-label={`Play ${r.title || r.name} now`}
                          >
                            <Play className="w-3.5 h-3.5" fill="currentColor" />
                            <span className="cine-tip" aria-hidden="true">Play now</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3 rounded-2xl cine-glass-panel px-4 py-3 focus-within:border-white/25 transition">
                  <Link2 className="w-4 h-4 text-white/60 flex-shrink-0" />
                  <input
                    type="text"
                    value={swapYt}
                    onChange={(e) => {
                      setSwapYt(e.target.value);
                      setSwapYtMeta(null);
                    }}
                    placeholder="…or paste a YouTube link"
                    aria-label="YouTube link for the playlist"
                    inputMode="url"
                    className="w-full bg-transparent text-sm text-white placeholder-white/30 focus:outline-none"
                  />
                </div>
                {swapYtMeta && (
                  <div className="flex items-center gap-2.5 mat-row p-2">
                    <div className="w-20 h-12 rounded-xl overflow-hidden bg-black/50 flex-shrink-0">
                      <img src={swapYtMeta.thumb} alt="" className="w-full h-full object-cover" />
                    </div>
                    <p className="text-xs font-semibold text-white/90 truncate flex-1 min-w-0">{swapYtMeta.title}</p>
                    <button
                      onClick={() => queueAdd({ kind: 'youtube', youtubeId: swapYtMeta.id, title: swapYtMeta.title, thumb: swapYtMeta.thumb })}
                      disabled={swapBusy}
                      className="cine-icon-btn cine-icon-btn--sm cine-has-tip"

                      aria-label="Add YouTube video to playlist"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span className="cine-tip" aria-hidden="true">Add to playlist</span>
                    </button>
                    <button
                      onClick={() => queueAdd({ kind: 'youtube', youtubeId: swapYtMeta.id, title: swapYtMeta.title, thumb: swapYtMeta.thumb }, true)}
                      disabled={swapBusy}
                      className="cine-btn cine-btn-primary h-9 px-4 text-xs flex-shrink-0 disabled:opacity-50"
                    >
                      Play
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-white/40">Only the host can edit the playlist.</p>
            )}

            {queue.length === 0 && (
              <p className="text-center text-[11px] text-white/40 pt-2">
                The queue is empty — what plays now is all there is.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NickGate({ onSave, onLeave }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--cine-bg-deep)] p-6">
      <div className="rounded-3xl cine-glass-panel p-8 w-full max-w-sm space-y-4 text-center">
        <div className="cine-disc cine-disc--dim w-12 h-12 mx-auto">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Pick a nickname</h2>
          <p className="text-xs text-white/60 mt-1">Shown in chat and the people list.</p>
        </div>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Alex"
          aria-label="Nickname"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) onSave(setNickname(draft));
          }}
        />
        <div className="flex gap-2">
          <button onClick={onLeave} className="cine-control-btn flex-1">
            Cancel
          </button>
          <button
            onClick={() => draft.trim() && onSave(setNickname(draft))}
            className="cine-btn cine-btn-white h-11 px-6 text-sm flex-1"
          >
            Join
          </button>
        </div>
        <p className="text-[11px] text-white/40 inline-flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Remembered on this device only.
        </p>
      </div>
    </div>
  );
}
